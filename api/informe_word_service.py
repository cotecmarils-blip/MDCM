"""Exportación de informes Word (prioridad: dimensión de costos / OMOC)."""
from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Any

from django.conf import settings
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.shared import Cm, Pt, RGBColor

from .escenario_service import ESCENARIO_ESTANDAR_NOMBRE, ensure_escenario_estandar
from .evaluacion_service import (
    apply_valores_fallback_escenarios,
    collect_terminal_nodes_for_omoe,
    load_valores_map,
)
from .models import Alternativa, Escenario, Omoe, Proyecto


def _escenario_informe_costos_for_omoe(omoe: Omoe) -> Escenario:
    """
    Preferir «Estandar» si existe; si no, el primer escenario de la dimensión.
    Solo crea «Estandar» cuando la dimensión aún no tiene ningún escenario
    (evitar ensuciar OMOC oceanográfico con un Estandar vacío).
    """
    esc = Escenario.objects.filter(
        omoe=omoe, nombre__iexact=ESCENARIO_ESTANDAR_NOMBRE,
    ).first()
    if esc:
        return esc
    esc = (
        Escenario.objects.filter(omoe=omoe)
        .order_by('orden', 'id')
        .first()
    )
    if esc:
        return esc
    return ensure_escenario_estandar(omoe)


def _branding_dir() -> Path:
    candidates = [
        Path(settings.BASE_DIR) / 'static' / 'branding',
        Path(settings.BASE_DIR) / 'frontend' / 'public',
        Path(settings.BASE_DIR) / 'frontend' / 'build',
    ]
    for path in candidates:
        if path.is_dir():
            return path
    return candidates[0]


def _find_logo(*names: str) -> Path | None:
    base = _branding_dir()
    roots = [
        base,
        Path(settings.BASE_DIR) / 'static' / 'branding',
        Path(settings.BASE_DIR) / 'frontend' / 'public',
        Path(settings.BASE_DIR) / 'frontend' / 'build',
    ]
    for root in roots:
        for name in names:
            path = root / name
            if path.is_file():
                return path
    return None


def _set_run_font(run, *, size_pt=11, bold=False, color=None):
    run.font.size = Pt(size_pt)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color
    run.font.name = 'Calibri'
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:ascii'), 'Calibri')
    rFonts.set(qn('w:hAnsi'), 'Calibri')


def _add_header_logos(
    document: Document,
    *,
    subtitle_text: str = (
        'ENAP · Cotecmar · Universidad de la Costa  |  HATD — Informe de costos (OMOC)'
    ),
) -> None:
    """Encabezado con logos alineados: misma altura y tono navy (sin mezcla de colores)."""
    from docx.enum.table import WD_TABLE_ALIGNMENT
    from docx.oxml import OxmlElement

    section = document.sections[0]
    header = section.header
    header.is_linked_to_previous = False
    for p in list(header.paragraphs):
        p.clear()

    logos = [
        _find_logo('Logo_ENAP_header.png', 'Logo_ENAP.png', 'Logo ENAP.png'),
        _find_logo('CotecmarLogo_header.png', 'CotecmarLogo.png'),
        _find_logo('Logo_CUC_header.png', 'Logo_CUC.png', 'Logo CUC.png'),
    ]
    logos = [p for p in logos if p]
    if logos:
        table = header.add_table(rows=1, cols=len(logos), width=Cm(17))
        table.alignment = WD_TABLE_ALIGNMENT.CENTER
        table.autofit = True
        tbl = table._tbl
        tbl_pr = tbl.tblPr if tbl.tblPr is not None else OxmlElement('w:tblPr')
        borders = OxmlElement('w:tblBorders')
        for edge in ('top', 'left', 'bottom', 'right', 'insideH', 'insideV'):
            el = OxmlElement(f'w:{edge}')
            el.set(qn('w:val'), 'nil')
            borders.append(el)
        tbl_pr.append(borders)
        if tbl.tblPr is None:
            tbl.insert(0, tbl_pr)

        for cell, logo in zip(table.rows[0].cells, logos):
            cell.text = ''
            p = cell.paragraphs[0]
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            run = p.add_run()
            try:
                run.add_picture(str(logo), height=Cm(1.15))
            except Exception:
                continue

    subtitle = header.add_paragraph()
    subtitle.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = subtitle.add_run(subtitle_text)
    _set_run_font(run, size_pt=8, color=RGBColor(0x55, 0x65, 0x75))


def _omoes_costo(proyecto: Proyecto) -> list[Omoe]:
    return list(
        Omoe.objects.filter(proyecto=proyecto, rama_evaluacion='omoc').order_by(
            'orden', 'nombre_modelo', 'id',
        )
    )


def _calcular_costo_alternativa(
    omoe: Omoe,
    escenario: Escenario,
    valores: dict[str, str],
) -> dict[str, Any]:
    from .simulacion_service import _calcular_dimension

    terminales = collect_terminal_nodes_for_omoe(omoe)
    valores_uso, used_fallback = apply_valores_fallback_escenarios(
        omoe, escenario, terminales, valores,
    )
    valor, detalle = _calcular_dimension(
        omoe, terminales, [escenario], valores_uso, debug_logs=None,
    )
    hojas = []
    for h in (detalle or {}).get('hojas') or []:
        hojas.append({
            'nombre': h.get('nombre'),
            'valor': h.get('utilidad') if 'utilidad' in h else h.get('valor'),
            'peso': h.get('peso'),
        })
    return {
        'omoe_id': omoe.id,
        'omoe_nombre': omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.id}',
        'escenario_id': escenario.id,
        'escenario_nombre': escenario.nombre,
        'valor': round(float(valor or 0), 6),
        'modo_valor_terminal': getattr(omoe, 'modo_valor_terminal', None) or 'valor_bruto',
        'escenario_agregacion': getattr(omoe, 'escenario_agregacion', None) or 'minimo_mejor',
        'hojas': hojas,
        'detalle': detalle,
        'valores_fallback_escenarios': used_fallback,
    }


def build_informe_costos_payload(proyecto: Proyecto) -> dict[str, Any]:
    omoes = _omoes_costo(proyecto)
    if not omoes:
        return {
            'ok': False,
            'detail': (
                'No hay dimensión OMOC (costos) en el proyecto. '
                'Cree una dimensión de costos antes de exportar el informe.'
            ),
            'alternativas': [],
            'dimensiones': [],
        }

    alts = list(Alternativa.objects.filter(proyecto=proyecto).order_by('id'))
    dims_meta = []
    for omoe in omoes:
        esc = _escenario_informe_costos_for_omoe(omoe)
        dims_meta.append({
            'omoe_id': omoe.id,
            'nombre': omoe.nombre_modelo or omoe.codigo,
            'escenario': esc.nombre,
            'modo_valor_terminal': getattr(omoe, 'modo_valor_terminal', None),
            'escenario_agregacion': getattr(omoe, 'escenario_agregacion', None),
        })

    filas = []
    used_any_fallback = False
    for alt in alts:
        valores = load_valores_map(alt.id)
        dims = []
        total = 0.0
        for omoe in omoes:
            esc = _escenario_informe_costos_for_omoe(omoe)
            row = _calcular_costo_alternativa(omoe, esc, valores)
            if row.get('valores_fallback_escenarios'):
                used_any_fallback = True
            dims.append(row)
            total += float(row['valor'] or 0)
        filas.append({
            'alternativa_id': alt.id,
            'nombre': alt.nombre,
            'apodo': alt.apodo or '',
            'dimensiones': dims,
            'total_costo': round(total, 6),
        })

    esc_nombres = [d.get('escenario') for d in dims_meta if d.get('escenario')]
    esc_ref = esc_nombres[0] if len(set(esc_nombres)) == 1 and esc_nombres else 'activo'
    nota = (
        f'Por ahora el informe de costos usa el escenario «{esc_ref}» '
        'y suma valores brutos sin pesos entre escenarios (ecuación meso no aplica '
        'con un único panorama).'
    )
    if used_any_fallback:
        nota += (
            ' Algunas celdas del escenario de informe estaban vacías y se rellenaron '
            'temporalmente con valores de otros escenarios de la misma dimensión OMOC.'
        )

    return {
        'ok': True,
        'proyecto': {'id': proyecto.id, 'nombre': proyecto.nombre},
        'nota': nota,
        'dimensiones': dims_meta,
        'alternativas': filas,
        'valores_fallback_escenarios': used_any_fallback,
    }


def build_informe_costos_docx(proyecto: Proyecto) -> bytes:
    payload = build_informe_costos_payload(proyecto)
    doc = Document()

    section = doc.sections[0]
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2)
    section.right_margin = Cm(2)

    _add_header_logos(doc)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('Informe de costos (OMOC)')
    _set_run_font(run, size_pt=18, bold=True, color=RGBColor(0x0F, 0x2C, 0x59))

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(f'Proyecto: {proyecto.nombre}')
    _set_run_font(run, size_pt=12, bold=True)

    if not payload.get('ok'):
        p = doc.add_paragraph()
        run = p.add_run(payload.get('detail') or 'Sin datos.')
        _set_run_font(run, size_pt=11, color=RGBColor(0xB9, 0x1C, 0x1C))
        buf = BytesIO()
        doc.save(buf)
        return buf.getvalue()

    nota = doc.add_paragraph()
    run = nota.add_run(payload['nota'])
    _set_run_font(run, size_pt=10, color=RGBColor(0x47, 0x55, 0x69))

    doc.add_paragraph()
    h = doc.add_paragraph()
    run = h.add_run('1. Resumen por alternativa (escenario Estandar)')
    _set_run_font(run, size_pt=13, bold=True)

    dim_names = [d['nombre'] for d in payload['dimensiones']]
    table = doc.add_table(rows=1, cols=2 + len(dim_names))
    table.style = 'Table Grid'
    hdr = table.rows[0].cells
    hdr[0].text = 'Alternativa'
    for i, name in enumerate(dim_names):
        hdr[i + 1].text = name or f'Dim. {i + 1}'
    hdr[-1].text = 'Total costo'

    for fila in payload['alternativas']:
        row = table.add_row().cells
        row[0].text = fila['nombre']
        for i, dim in enumerate(fila['dimensiones']):
            row[i + 1].text = f"{dim['valor']:.4f}"
        row[-1].text = f"{fila['total_costo']:.4f}"

    doc.add_paragraph()
    h2 = doc.add_paragraph()
    run = h2.add_run('2. Criterios de cálculo')
    _set_run_font(run, size_pt=13, bold=True)

    bullets = [
        'Escenario activo: Estandar (único panorama por ahora; no se combinan escenarios).',
        'Valor en nodos terminales: valor bruto (sin transformación u(x)), típico de costos.',
        'Agregación dentro del árbol: suma de valores (sin exigir pesos de escenario).',
        'Referencia metodológica meso: con un solo contexto no aplica Eq. (21)–(23); '
        'al agregar panoramas, Eq. (22) selecciona según sentido '
        '(mínimo-mejor / máximo-mejor), Eq. (23) el peor caso y Eq. (21) la compensación ponderada.',
    ]
    for text in bullets:
        p = doc.add_paragraph(style='List Bullet')
        run = p.add_run(text)
        _set_run_font(run, size_pt=10)

    if payload['dimensiones']:
        doc.add_paragraph()
        h3 = doc.add_paragraph()
        run = h3.add_run('3. Dimensiones de costo incluidas')
        _set_run_font(run, size_pt=13, bold=True)
        for d in payload['dimensiones']:
            p = doc.add_paragraph(style='List Bullet')
            run = p.add_run(
                f"{d['nombre']} · escenario «{d['escenario']}» · "
                f"modo valor={d.get('modo_valor_terminal') or '—'} · "
                f"agregación={d.get('escenario_agregacion') or '—'}"
            )
            _set_run_font(run, size_pt=10)

    # Desglose por hojas (valores terminales del escenario Estandar)
    has_hojas = any(
        (dim.get('hojas') or [])
        for fila in payload['alternativas']
        for dim in fila.get('dimensiones') or []
    )
    if has_hojas:
        doc.add_paragraph()
        h4 = doc.add_paragraph()
        run = h4.add_run('4. Desglose por nodos terminales (escenario Estandar)')
        _set_run_font(run, size_pt=13, bold=True)
        for fila in payload['alternativas']:
            sub = doc.add_paragraph()
            run = sub.add_run(f"Alternativa: {fila['nombre']}")
            _set_run_font(run, size_pt=11, bold=True)
            for dim in fila.get('dimensiones') or []:
                hojas = dim.get('hojas') or []
                if not hojas:
                    continue
                p = doc.add_paragraph()
                run = p.add_run(f"{dim['omoe_nombre']} — total {dim['valor']:.4f}")
                _set_run_font(run, size_pt=10, bold=True)
                table = doc.add_table(rows=1, cols=2)
                table.style = 'Table Grid'
                table.rows[0].cells[0].text = 'Nodo / ítem de costo'
                table.rows[0].cells[1].text = 'Valor x'
                for h in hojas:
                    cells = table.add_row().cells
                    cells[0].text = str(h.get('nombre') or '—')
                    val = h.get('valor')
                    cells[1].text = f'{float(val):.4f}' if val is not None else '—'
                doc.add_paragraph()

    doc.add_paragraph()
    h5 = doc.add_paragraph()
    run = h5.add_run('5. Observación para Felipe / equipo de costos')
    _set_run_font(run, size_pt=13, bold=True)
    p = doc.add_paragraph()
    run = p.add_run(
        'Este informe permite alimentar y sumar costos sin configurar pesos entre escenarios. '
        'Cuando existan varios panoramas de costo, se activará la resolución meso '
        '(Eq. 21 compensatoria / Eq. 22 selección del mejor contexto con sentido '
        'positivo o negativo / Eq. 23 peor caso).'
    )
    _set_run_font(run, size_pt=10)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run('Documento generado por HATD · uso interno Cotecmar / ENAP / Universidad de la Costa')
    _set_run_font(run, size_pt=8, color=RGBColor(0x64, 0x74, 0x8B))

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_informe_curvas_docx(proyecto: Proyecto) -> bytes:
    """Informe Word con curvas de utilidad finales (nodos terminales × escenario)."""
    from .curvas_utilidad_service import build_curvas_utilidad_export

    payload = build_curvas_utilidad_export(proyecto)
    doc = Document()

    section = doc.sections[0]
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2)
    section.right_margin = Cm(2)

    _add_header_logos(
        doc,
        subtitle_text=(
            'ENAP · Cotecmar · Universidad de la Costa  |  HATD — Curvas de utilidad finales'
        ),
    )

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('Curvas de utilidad finales')
    _set_run_font(run, size_pt=18, bold=True, color=RGBColor(0x0F, 0x2C, 0x59))

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(f'Proyecto: {proyecto.nombre}')
    _set_run_font(run, size_pt=12, bold=True)

    gen = payload.get('generado_en') or ''
    if gen:
        meta = doc.add_paragraph()
        meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = meta.add_run(f'Generado: {gen}')
        _set_run_font(run, size_pt=9, color=RGBColor(0x64, 0x74, 0x8B))

    nota = doc.add_paragraph()
    run = nota.add_run(
        'Inventario de funciones u(x) configuradas en nodos terminales por escenario. '
        'No es el historial de cambios: refleja el estado final del árbol para informes '
        'metodológicos. Dimensiones en modo valor bruto (p. ej. costos) suelen omitirse '
        'si no tienen familia de función.'
    )
    _set_run_font(run, size_pt=10, color=RGBColor(0x47, 0x55, 0x69))

    dims = payload.get('dimensiones') or []
    total_curvas = sum(len(d.get('curvas') or []) for d in dims)
    sec_n = 2
    if total_curvas == 0:
        p = doc.add_paragraph()
        run = p.add_run(
            'No hay curvas de utilidad configuradas en este proyecto '
            '(sin familia de función en nodos terminales).'
        )
        _set_run_font(run, size_pt=11, color=RGBColor(0xB9, 0x1C, 0x1C))
    else:
        doc.add_paragraph()
        h = doc.add_paragraph()
        run = h.add_run('1. Resumen')
        _set_run_font(run, size_pt=13, bold=True)
        p = doc.add_paragraph()
        run = p.add_run(
            f'{total_curvas} curva(s) en {len(dims)} dimensión(es). '
            'Cada fila corresponde a un nodo terminal × escenario.'
        )
        _set_run_font(run, size_pt=10)

        for dim in dims:
            curvas = dim.get('curvas') or []
            if not curvas:
                continue
            doc.add_paragraph()
            h = doc.add_paragraph()
            nombre = dim.get('omoe_nombre') or f"Dimensión #{dim.get('omoe_id')}"
            rama = (dim.get('rama_evaluacion') or '').upper() or '—'
            run = h.add_run(f'{sec_n}. {nombre} ({rama})')
            _set_run_font(run, size_pt=13, bold=True)
            sec_n += 1

            meta_bits = []
            if dim.get('modo_valor_terminal'):
                meta_bits.append(f"modo valor={dim['modo_valor_terminal']}")
            if dim.get('escenario_agregacion'):
                meta_bits.append(f"agregación={dim['escenario_agregacion']}")
            if meta_bits:
                p = doc.add_paragraph()
                run = p.add_run(' · '.join(meta_bits))
                _set_run_font(run, size_pt=9, color=RGBColor(0x64, 0x74, 0x8B))

            table = doc.add_table(rows=1, cols=5)
            table.style = 'Table Grid'
            hdr = table.rows[0].cells
            hdr[0].text = 'Nodo terminal'
            hdr[1].text = 'Escenario'
            hdr[2].text = 'Familia'
            hdr[3].text = 'Parámetros'
            hdr[4].text = 'Unidad'
            for c in curvas:
                cells = table.add_row().cells
                cells[0].text = str(c.get('terminal_nombre') or '—')
                cells[1].text = str(
                    c.get('escenario_label')
                    or c.get('escenario_nombre')
                    or '—'
                )
                cells[2].text = str(c.get('familia_funciones') or '—')
                cells[3].text = str(
                    c.get('constantes_display')
                    or _format_constantes(c.get('constantes'))
                    or '—'
                )
                cells[4].text = str(c.get('unidad') or '—')

    doc.add_paragraph()
    h_ref = doc.add_paragraph()
    run = h_ref.add_run(f'{sec_n}. Nota metodológica')
    _set_run_font(run, size_pt=13, bold=True)
    for text in (
        'La utilidad u(x) transforma el valor ofertado x en [0, 1] según la familia '
        'y constantes del nodo (capa micro).',
        'En simulación MADM, las utilidades de hojas se agregan con pesos del árbol; '
        'la resolución de escenarios (capa meso) usa Eq. (21)–(23) según la dimensión.',
        'Hay exportación JSON equivalente (curvas-utilidad) para procesamiento externo.',
    ):
        p = doc.add_paragraph(style='List Bullet')
        run = p.add_run(text)
        _set_run_font(run, size_pt=10)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run(
        'Documento generado por HATD · uso interno Cotecmar / ENAP / Universidad de la Costa'
    )
    _set_run_font(run, size_pt=8, color=RGBColor(0x64, 0x74, 0x8B))

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _format_constantes(constantes: Any) -> str:
    if not constantes or not isinstance(constantes, dict):
        return ''
    parts = []
    for k, v in constantes.items():
        if v is None or v == '':
            continue
        parts.append(f'{k}={v}')
    return ', '.join(parts)
