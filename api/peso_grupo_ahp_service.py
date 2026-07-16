"""Pesos entre hermanos por escenario: modo manual o AHP."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from django.core.exceptions import ValidationError
from django.db import transaction

from .ahp_service import compute_ahp, is_valid_saaty, juicio_key
from .models import Escenario, NodoArbol, NodoArbolEscenario, Omoe, PesoGrupoAhp


def _q2(value: Decimal) -> Decimal:
    return value.quantize(Decimal('0.01'))


def parse_parent_id(raw: str | None) -> int | None:
    if raw is None or raw == '' or str(raw).lower() in ('root', 'null', 'none'):
        return None
    try:
        return int(raw)
    except (TypeError, ValueError) as exc:
        raise ValidationError('Parámetro «parent» inválido.') from exc


def _parent_nombre(escenario: Escenario, parent_id: int | None) -> str:
    if parent_id is None:
        omoe = Omoe.objects.filter(pk=escenario.omoe_id).first()
        return omoe.nombre_modelo or omoe.codigo or 'Dimensión' if omoe else 'Dimensión'
    nodo = NodoArbol.objects.filter(pk=parent_id, omoe_id=escenario.omoe_id).first()
    return nodo.nombre if nodo else f'Nodo #{parent_id}'


def _hermanos_payload(escenario: Escenario, parent_id: int | None) -> list[dict[str, Any]]:
    hermanos_qs = NodoArbol.objects.filter(
        omoe_id=escenario.omoe_id, parent_id=parent_id,
    ).order_by('orden_visual', 'id')
    configs = {
        row.nodo_arbol_id: row
        for row in NodoArbolEscenario.objects.filter(
            escenario=escenario,
            nodo_arbol_id__in=hermanos_qs.values_list('id', flat=True),
        )
    }
    out = []
    for h in hermanos_qs:
        cfg = configs.get(h.id)
        if cfg is None:
            from .nodo_escenario_service import _config_row_from_nodo, seed_arbol_config_for_escenario

            seed_arbol_config_for_escenario(escenario)
            cfg, _ = NodoArbolEscenario.objects.get_or_create(
                escenario=escenario,
                nodo_arbol=h,
                defaults=_config_row_from_nodo(h),
            )
        out.append({
            'nodo_id': h.id,
            'nombre': h.nombre,
            'peso': float(cfg.peso or 0),
            'aplica': bool(cfg.aplica),
        })
    return out


def get_or_create_grupo(escenario: Escenario, parent_id: int | None) -> PesoGrupoAhp:
    grupo, _ = PesoGrupoAhp.objects.get_or_create(
        escenario=escenario,
        parent_id=parent_id,
        defaults={'modo': PesoGrupoAhp.MODO_MANUAL, 'juicios': {}},
    )
    return grupo


def get_grupo_modo(escenario: Escenario, parent_id: int | None) -> str:
    grupo = PesoGrupoAhp.objects.filter(escenario=escenario, parent_id=parent_id).first()
    return grupo.modo if grupo else PesoGrupoAhp.MODO_MANUAL


def _validate_juicios(nodo_ids: list[int], juicios: dict[str, Any]) -> list[str]:
    errors: list[str] = []
    if not isinstance(juicios, dict):
        return ['«juicios» debe ser un objeto.']
    id_set = set(nodo_ids)
    for key, val in juicios.items():
        parts = str(key).split('_')
        if len(parts) != 2:
            errors.append(f'Clave de juicio inválida: {key}')
            continue
        try:
            a, b = int(parts[0]), int(parts[1])
        except ValueError:
            errors.append(f'Clave de juicio inválida: {key}')
            continue
        if a not in id_set or b not in id_set or a == b:
            errors.append(f'Juicio fuera del grupo: {key}')
            continue
        if juicio_key(a, b) != key:
            errors.append(f'Use clave ordenada min_max: {juicio_key(a, b)}')
            continue
        if not is_valid_saaty(val):
            errors.append(f'Valor inválido en {key}: debe ser un número positivo.')
    return errors


def build_grupo_payload(escenario: Escenario, parent_id: int | None) -> dict[str, Any]:
    if not escenario.omoe_id:
        raise ValidationError('El escenario debe estar vinculado a una dimensión (OMOE).')

    if parent_id is not None:
        if not NodoArbol.objects.filter(pk=parent_id, omoe_id=escenario.omoe_id).exists():
            raise ValidationError('El nodo padre no pertenece a la dimensión del escenario.')

    hermanos = _hermanos_payload(escenario, parent_id)
    activos = [h for h in hermanos if h['aplica']]
    grupo = get_or_create_grupo(escenario, parent_id)
    juicios = grupo.juicios or {}

    nodo_ids = [h['nodo_id'] for h in activos]
    ahp = compute_ahp(nodo_ids, juicios)

    pares = []
    for i in range(len(activos)):
        for j in range(i + 1, len(activos)):
            a = activos[i]
            b = activos[j]
            key = juicio_key(a['nodo_id'], b['nodo_id'])
            val = juicios.get(key, 1)
            pares.append({
                'key': key,
                'nodo_a_id': a['nodo_id'],
                'nodo_a_nombre': a['nombre'],
                'nodo_b_id': b['nodo_id'],
                'nodo_b_nombre': b['nombre'],
                'valor': float(val),
            })

    pesos_map = {p['nodo_id']: p['peso'] for p in ahp['pesos']}
    pesos_calculados = [
        {
            'nodo_id': h['nodo_id'],
            'nombre': h['nombre'],
            'peso': pesos_map.get(h['nodo_id'], h['peso']),
        }
        for h in activos
    ]

    cr = grupo.consistency_ratio
    if grupo.modo == PesoGrupoAhp.MODO_AHP and ahp['consistency_ratio'] is not None:
        cr = Decimal(str(ahp['consistency_ratio']))

    return {
        'escenario_id': escenario.id,
        'escenario_nombre': escenario.nombre,
        'parent_id': parent_id,
        'parent_nombre': _parent_nombre(escenario, parent_id),
        'modo': grupo.modo,
        'juicios': juicios,
        'hermanos': hermanos,
        'hermanos_activos': activos,
        'ahp_disponible': len(activos) >= 2,
        'pares': pares,
        'matriz': ahp['matriz'],
        'matriz_nodo_ids': ahp['nodo_ids'],
        'pesos_calculados': pesos_calculados,
        'consistency_ratio': float(cr) if cr is not None else ahp['consistency_ratio'],
        'consistency_ok': ahp['consistency_ok'],
        'lambda_max': ahp['lambda_max'],
    }


@transaction.atomic
def save_grupo_config(
    escenario: Escenario,
    parent_id: int | None,
    data: dict[str, Any],
    *,
    usuario=None,
) -> dict[str, Any]:
    payload_preview = build_grupo_payload(escenario, parent_id)
    if not payload_preview['ahp_disponible'] and data.get('modo') == PesoGrupoAhp.MODO_AHP:
        raise ValidationError('Se necesitan al menos dos hermanos activos para usar AHP.')

    grupo = get_or_create_grupo(escenario, parent_id)
    antes = {
        'modo': grupo.modo,
        'juicios': dict(grupo.juicios or {}),
        'consistency_ratio': float(grupo.consistency_ratio) if grupo.consistency_ratio else None,
    }
    modo = (data.get('modo') or grupo.modo or PesoGrupoAhp.MODO_MANUAL).strip()
    if modo not in (PesoGrupoAhp.MODO_MANUAL, PesoGrupoAhp.MODO_AHP):
        raise ValidationError('Modo inválido. Use «manual» o «ahp».')

    juicios = data.get('juicios', grupo.juicios or {})
    activos_ids = [h['nodo_id'] for h in payload_preview['hermanos_activos']]
    errors = _validate_juicios(activos_ids, juicios)
    if errors:
        raise ValidationError(errors)

    grupo.modo = modo
    grupo.juicios = juicios
    ahp = compute_ahp(activos_ids, juicios)
    if ahp['consistency_ratio'] is not None:
        grupo.consistency_ratio = Decimal(str(ahp['consistency_ratio']))
    grupo.lambda_max = (
        Decimal(str(ahp['lambda_max'])) if ahp['lambda_max'] is not None else None
    )
    grupo.pesos_calculados = {str(p['nodo_id']): p['peso'] for p in ahp['pesos']}
    grupo.save()

    if usuario:
        from .evento_decision_service import (
            _meta_accion,
            _meta_efecto,
            nuevo_lote_auditoria,
            registrar_cambio,
        )
        from .models import EventoDecisionRegistro

        parent_nombre = _parent_nombre(escenario, parent_id)
        lote_id = nuevo_lote_auditoria()
        despues = {
            'modo': grupo.modo,
            'juicios': dict(grupo.juicios or {}),
            'consistency_ratio': float(grupo.consistency_ratio) if grupo.consistency_ratio else None,
        }
        juicios_changed = antes.get('juicios') != despues['juicios']
        modo_changed = antes.get('modo') != despues['modo']
        cr_changed = antes.get('consistency_ratio') != despues['consistency_ratio']

        # Acción principal = lo que el usuario cambió (juicios o modo).
        if juicios_changed:
            registrar_cambio(
                escenario.proyecto_id,
                usuario,
                tipo_cambio=EventoDecisionRegistro.TIPO_MATRIZ,
                entidad_tipo='peso_grupo_ahp',
                entidad_id=grupo.id,
                entidad_nombre=parent_nombre,
                campo='juicios',
                valor_anterior=antes.get('juicios'),
                valor_nuevo=despues['juicios'],
                omoe_id=escenario.omoe_id,
                escenario_id=escenario.id,
                notas='Actualización de comparaciones AHP',
                metadata=_meta_accion(
                    lote_id,
                    f'Comparaciones AHP en «{parent_nombre}»',
                    parent_id=parent_id,
                ),
            )
        elif modo_changed:
            registrar_cambio(
                escenario.proyecto_id,
                usuario,
                tipo_cambio=EventoDecisionRegistro.TIPO_MATRIZ,
                entidad_tipo='peso_grupo_ahp',
                entidad_id=grupo.id,
                entidad_nombre=parent_nombre,
                campo='modo',
                valor_anterior=antes.get('modo'),
                valor_nuevo=despues['modo'],
                omoe_id=escenario.omoe_id,
                escenario_id=escenario.id,
                notas='Cambio de modo de pesos del grupo',
                metadata=_meta_accion(
                    lote_id,
                    f'Modo de pesos «{parent_nombre}» → {despues["modo"]}',
                    parent_id=parent_id,
                ),
            )
        elif cr_changed and not (modo == PesoGrupoAhp.MODO_AHP and data.get('aplicar')):
            # Solo CR sin juicios/modo (raro): tratar CR como acción.
            registrar_cambio(
                escenario.proyecto_id,
                usuario,
                tipo_cambio=EventoDecisionRegistro.TIPO_MATRIZ,
                entidad_tipo='peso_grupo_ahp',
                entidad_id=grupo.id,
                entidad_nombre=parent_nombre,
                campo='consistency_ratio',
                valor_anterior=antes.get('consistency_ratio'),
                valor_nuevo=despues['consistency_ratio'],
                omoe_id=escenario.omoe_id,
                escenario_id=escenario.id,
                metadata=_meta_accion(
                    lote_id,
                    f'Consistencia AHP en «{parent_nombre}»',
                    parent_id=parent_id,
                ),
            )

        if cr_changed and (juicios_changed or modo_changed):
            registrar_cambio(
                escenario.proyecto_id,
                usuario,
                tipo_cambio=EventoDecisionRegistro.TIPO_MATRIZ,
                entidad_tipo='peso_grupo_ahp',
                entidad_id=grupo.id,
                entidad_nombre=parent_nombre,
                campo='consistency_ratio',
                valor_anterior=antes.get('consistency_ratio'),
                valor_nuevo=despues['consistency_ratio'],
                omoe_id=escenario.omoe_id,
                escenario_id=escenario.id,
                notas='Efecto: razón de consistencia recalculada',
                metadata=_meta_efecto(lote_id, parent_id=parent_id),
            )

        if modo == PesoGrupoAhp.MODO_AHP and data.get('aplicar'):
            apply_grupo_pesos(
                escenario,
                parent_id,
                grupo=grupo,
                usuario=usuario,
                lote_id=lote_id if (juicios_changed or modo_changed or cr_changed) else None,
            )
            return build_grupo_payload(escenario, parent_id)

    if modo == PesoGrupoAhp.MODO_AHP and data.get('aplicar'):
        apply_grupo_pesos(escenario, parent_id, grupo=grupo, usuario=usuario)

    return build_grupo_payload(escenario, parent_id)


@transaction.atomic
def apply_grupo_pesos(
    escenario: Escenario,
    parent_id: int | None,
    *,
    grupo: PesoGrupoAhp | None = None,
    usuario=None,
    lote_id: str | None = None,
) -> dict[str, Any]:
    payload = build_grupo_payload(escenario, parent_id)
    if not payload['ahp_disponible']:
        raise ValidationError('Se necesitan al menos dos hermanos activos.')

    grupo = grupo or get_or_create_grupo(escenario, parent_id)
    if grupo.modo != PesoGrupoAhp.MODO_AHP:
        raise ValidationError('El grupo está en modo manual. Cambie a AHP antes de aplicar.')

    activos_ids = [h['nodo_id'] for h in payload['hermanos_activos']]
    ahp = compute_ahp(activos_ids, grupo.juicios or {})
    if not ahp['consistency_ok']:
        cr_val = ahp['consistency_ratio']
        raise ValidationError(
            f'La razón de consistencia calculada para esta matriz es {cr_val:.3f}, valor superior '
            'al umbral recomendado de 0,10. Esto indica que las comparaciones pareadas presentan '
            'contradicciones significativas. Revise los juicios ingresados antes de aplicar los '
            'pesos calculados.'
        )

    from .evento_decision_service import (
        _meta_accion,
        _meta_efecto,
        nuevo_lote_auditoria,
        registrar_cambio,
    )
    from .models import EventoDecisionRegistro, NodoArbol

    pesos_map = {p['nodo_id']: p['peso'] for p in ahp['pesos']}
    parent_nombre = _parent_nombre(escenario, parent_id)
    lote = lote_id or nuevo_lote_auditoria()
    crear_accion_aplicar = lote_id is None and usuario is not None

    if crear_accion_aplicar:
        registrar_cambio(
            escenario.proyecto_id,
            usuario,
            tipo_cambio=EventoDecisionRegistro.TIPO_MATRIZ,
            entidad_tipo='peso_grupo_ahp',
            entidad_id=grupo.id,
            entidad_nombre=parent_nombre,
            campo='aplicar_pesos',
            valor_anterior=None,
            valor_nuevo={str(k): v for k, v in pesos_map.items()},
            omoe_id=escenario.omoe_id,
            escenario_id=escenario.id,
            notas='Aplicación de pesos desde matriz AHP',
            metadata=_meta_accion(
                lote,
                f'Aplicar pesos AHP en «{parent_nombre}»',
                parent_id=parent_id,
            ),
        )

    for nid, peso in pesos_map.items():
        cfg = NodoArbolEscenario.objects.filter(
            escenario=escenario, nodo_arbol_id=nid,
        ).first()
        peso_anterior = float(cfg.peso or 0) if cfg else None
        NodoArbolEscenario.objects.filter(
            escenario=escenario, nodo_arbol_id=nid,
        ).update(peso=_q2(Decimal(str(peso))))
        if usuario and peso_anterior != peso:
            nodo = NodoArbol.objects.filter(pk=nid).first()
            registrar_cambio(
                escenario.proyecto_id,
                usuario,
                tipo_cambio=EventoDecisionRegistro.TIPO_PESO,
                entidad_tipo='nodo_arbol',
                entidad_id=nid,
                entidad_nombre=nodo.nombre if nodo else f'Nodo #{nid}',
                campo='peso',
                valor_anterior=peso_anterior,
                valor_nuevo=peso,
                omoe_id=escenario.omoe_id,
                escenario_id=escenario.id,
                notas='Efecto: peso recalculado desde matriz AHP',
                metadata=_meta_efecto(
                    lote,
                    parent_id=parent_id,
                    grupo=parent_nombre,
                ),
            )

    grupo.consistency_ratio = Decimal(str(ahp['consistency_ratio']))
    grupo.lambda_max = Decimal(str(ahp['lambda_max'])) if ahp['lambda_max'] is not None else None
    grupo.pesos_calculados = {str(k): v for k, v in pesos_map.items()}
    grupo.save()

    return build_grupo_payload(escenario, parent_id)


def grupo_ahp_resumen_for_arbol(escenario: Escenario) -> dict[str, dict[str, Any]]:
    """Resumen por grupo (clave root o id padre) para badges en el árbol."""
    registros = {
        (g.parent_id): g
        for g in PesoGrupoAhp.objects.filter(escenario=escenario)
    }
    nodos = list(NodoArbol.objects.filter(omoe_id=escenario.omoe_id))
    configs = {
        row.nodo_arbol_id: row
        for row in NodoArbolEscenario.objects.filter(escenario=escenario)
    }
    by_parent: dict[int | None, list[int]] = {}
    for n in nodos:
        by_parent.setdefault(n.parent_id, []).append(n.id)

    out: dict[str, dict[str, Any]] = {}
    for parent_id, child_ids in by_parent.items():
        activos = [cid for cid in child_ids if configs.get(cid) and configs[cid].aplica]
        if len(activos) < 2:
            continue
        key = 'root' if parent_id is None else str(parent_id)
        reg = registros.get(parent_id)
        modo = reg.modo if reg else PesoGrupoAhp.MODO_MANUAL
        cr = float(reg.consistency_ratio) if reg and reg.consistency_ratio is not None else None
        out[key] = {
            'modo': modo,
            'consistency_ratio': cr,
            'consistency_ok': cr is None or cr <= 0.10,
            'count': len(activos),
        }
    return out
