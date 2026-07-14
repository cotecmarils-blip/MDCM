"""Normalización y validación de pesos (100 % por grupo de hermanos / escenarios)."""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

from django.core.exceptions import ValidationError

from .models import Escenario, NodoArbol, Omoe

PESO_TOTAL = Decimal('100')
PESO_MIN = Decimal('0')
PESO_TOLERANCE = Decimal('0.05')


def _validate_peso_value(peso) -> Decimal:
    value = Decimal(str(peso or 0))
    if value < PESO_MIN - PESO_TOLERANCE or value > PESO_TOTAL + PESO_TOLERANCE:
        raise ValidationError(
            f'El peso debe estar entre 0 y 100 % (recibido: {value} %).'
        )
    return value


def _validate_sibling_peso_total(total: Decimal) -> None:
    if total < PESO_MIN - PESO_TOLERANCE:
        raise ValidationError(
            f'Los pesos de los nodos hermanos no pueden ser negativos (total: {total} %).'
        )
    if total > PESO_TOTAL + PESO_TOLERANCE:
        raise ValidationError(
            f'Los pesos de los nodos hermanos no pueden superar 100 % (total: {total} %).'
        )


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def _sum_pesos(items) -> Decimal:
    return sum((Decimal(str(getattr(i, 'peso', 0) or 0)) for i in items), Decimal('0'))


def fix_peso_total_to_100(queryset, *, exclude_pk: int | None = None, peso_field='peso'):
    """Si el total está a ≤0,05 % de 100, el último hermano absorbe el resto (exacto en Decimal)."""
    items = list(queryset.order_by('orden_visual', 'id'))
    if len(items) < 2:
        return
    total = _sum_pesos(items)
    if abs(total - PESO_TOTAL) > PESO_TOLERANCE:
        return
    adjust = None
    for item in reversed(items):
        if item.pk != exclude_pk:
            adjust = item
            break
    if adjust is None:
        adjust = items[-1]
    others = [i for i in items if i.pk != adjust.pk]
    remainder = PESO_TOTAL - _sum_pesos(others)
    setattr(adjust, peso_field, remainder)
    adjust.save(update_fields=[peso_field, 'fecha_actualizacion'])


def rebalance_pesos_to_100(queryset, *, peso_field='peso'):
    """Reparte 100 % en partes iguales; el último hermano absorbe el redondeo."""
    items = list(queryset)
    n = len(items)
    if n == 0:
        return
    if n == 1:
        setattr(items[0], peso_field, PESO_TOTAL)
        items[0].save(update_fields=[peso_field, 'fecha_actualizacion'])
        return
    each = _q2(PESO_TOTAL / n)
    for item in items[:-1]:
        setattr(item, peso_field, each)
        item.save(update_fields=[peso_field, 'fecha_actualizacion'])
    last_peso = PESO_TOTAL - (each * (n - 1))
    setattr(items[-1], peso_field, last_peso)
    items[-1].save(update_fields=[peso_field, 'fecha_actualizacion'])


def default_peso_for_new_sibling(omoe_id: int, parent_id: int | None) -> Decimal:
    siblings = NodoArbol.objects.filter(
        omoe_id=omoe_id, parent_id=parent_id, aplica=True
    ).count()
    if siblings == 0:
        return PESO_TOTAL
    return _q2(PESO_TOTAL / (siblings + 1))


def validate_sibling_pesos_queryset(queryset) -> None:
    items = list(queryset)
    if not items:
        return
    for item in items:
        _validate_peso_value(getattr(item, 'peso', 0))
    _validate_sibling_peso_total(_sum_pesos(items))


def validate_peso_with_siblings(
    queryset,
    *,
    instance_pk: int | None,
    new_peso,
) -> None:
    peso = _validate_peso_value(new_peso)
    siblings = list(queryset)
    if instance_pk is not None:
        siblings = [s for s in siblings if s.pk != instance_pk]
    for sibling in siblings:
        _validate_peso_value(getattr(sibling, 'peso', 0))
    _validate_sibling_peso_total(_sum_pesos(siblings) + peso)


def after_nodo_arbol_saved(nodo: NodoArbol, *, created: bool = False):
    """Al crear un hermano, reparte 100 % en partes iguales entre todos los hermanos."""
    if created:
        from .nodo_escenario_service import seed_nodo_for_escenarios

        seed_nodo_for_escenarios(nodo)
    if not created:
        return
    siblings_qs = NodoArbol.objects.filter(
        omoe_id=nodo.omoe_id, parent_id=nodo.parent_id, aplica=True,
    )
    rebalance_pesos_to_100(siblings_qs)


def validate_sibling_pesos_nodo(omoe_id: int, parent_id: int | None):
    validate_sibling_pesos_queryset(
        NodoArbol.objects.filter(omoe_id=omoe_id, parent_id=parent_id, aplica=True),
    )


def siblings_qs_grupo_afinidad(grupo: 'GrupoAfinidad'):
    from .models import GrupoAfinidad

    if grupo.mision_id:
        return GrupoAfinidad.objects.filter(mision_id=grupo.mision_id, aplica=True)
    return GrupoAfinidad.objects.filter(
        omoe_id=grupo.omoe_id, mision__isnull=True, aplica=True,
    )


def after_grupo_afinidad_saved(grupo, *, created: bool = False):
    if not created:
        return
    rebalance_pesos_to_100(siblings_qs_grupo_afinidad(grupo))


def validate_sibling_pesos_grupo_afinidad(grupo) -> None:
    validate_sibling_pesos_queryset(siblings_qs_grupo_afinidad(grupo))


def siblings_qs_mision(mision):
    from .models import Mision

    return Mision.objects.filter(omoe_id=mision.omoe_id, aplica=True)


def after_mision_saved(mision, *, created: bool = False):
    if not created:
        return
    rebalance_pesos_to_100(siblings_qs_mision(mision))


def siblings_qs_mop(mop):
    from .models import MopCriterio

    return MopCriterio.objects.filter(grupo_afinidad_id=mop.grupo_afinidad_id, aplica=True)


def after_mop_saved(mop, *, created: bool = False):
    if not created:
        return
    rebalance_pesos_to_100(siblings_qs_mop(mop))


def siblings_qs_dp(dp):
    from .models import DpCriterio

    return DpCriterio.objects.filter(mop_id=dp.mop_id)


def after_dp_saved(dp, *, created: bool = False):
    if not created:
        return
    rebalance_pesos_to_100(siblings_qs_dp(dp))


def after_escenario_saved(escenario: Escenario, *, created: bool = False):
    if not escenario.omoe_id:
        return
    if created:
        from .nodo_escenario_service import seed_arbol_config_for_escenario

        seed_arbol_config_for_escenario(escenario)
    items = list(Escenario.objects.filter(omoe_id=escenario.omoe_id))
    if len(items) == 1:
        if Decimal(str(escenario.peso or 0)) != PESO_TOTAL:
            escenario.peso = PESO_TOTAL
            escenario.save(update_fields=['peso', 'fecha_actualizacion'])
        return
    if Decimal(str(escenario.peso or 0)) == 0:
        escenario.peso = _q2(PESO_TOTAL / len(items))
        escenario.save(update_fields=['peso', 'fecha_actualizacion'])


def validate_escenarios_peso_omoe(omoe_id: int):
    from .escenario_agregacion_choices import ESCENARIO_AGREG_COMPENSATORIO
    from .models import Omoe

    omoe = Omoe.objects.filter(pk=omoe_id).only('escenario_agregacion').first()
    if omoe:
        agreg = getattr(omoe, 'escenario_agregacion', None) or ESCENARIO_AGREG_COMPENSATORIO
        if agreg != ESCENARIO_AGREG_COMPENSATORIO:
            return
    items = list(Escenario.objects.filter(omoe_id=omoe_id))
    if not items:
        return
    total = _sum_pesos(items)
    if abs(total - PESO_TOTAL) > PESO_TOLERANCE:
        raise ValidationError(
            f'Los escenarios de la dimensión deben sumar 100 % (actual: {total} %).'
        )


def peso_resumen_nodos(omoe_id: int, parent_id: int | None) -> dict:
    siblings = list(
        NodoArbol.objects.filter(omoe_id=omoe_id, parent_id=parent_id, aplica=True)
    )
    total = _sum_pesos(siblings)
    return {
        'total': float(total),
        'count': len(siblings),
        'ok': float(total) >= -0.05 and float(total) <= 100.05,
        'esperado': float(PESO_TOTAL),
    }


def peso_resumen_escenarios(omoe_id: int) -> dict:
    items = list(Escenario.objects.filter(omoe_id=omoe_id))
    total = _sum_pesos(items)
    return {
        'total': float(total),
        'count': len(items),
        'ok': abs(total - PESO_TOTAL) <= PESO_TOLERANCE,
        'esperado': float(PESO_TOTAL),
    }
