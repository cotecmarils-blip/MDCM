"""Exportación de informes Word (prioridad: dimensión de costos / OMOC)."""
from __future__ import annotations

from io import BytesIO
import math
from pathlib import Path
from typing import Any

from django.conf import settings
from docx import Document
from docx.enum.table import WD_CELL_VERTICAL_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
from docx.shared import Cm, Pt, RGBColor
from PIL import Image, ImageDraw, ImageFont

from .escenario_service import ESCENARIO_ESTANDAR_NOMBRE, ensure_escenario_estandar
from .evaluacion_service import (
    apply_valores_fallback_escenarios,
    collect_terminal_nodes_for_omoe,
    build_evaluacion_schema,
    load_valores_map,
)
from .models import Alternativa, Escenario, NodoArbol, Omoe, Proyecto


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


DOCUMENT_FONT = 'Arial'
DOCUMENT_FONT_SIZE = 11
TABLE_FONT_SIZE = 9


def _set_run_font(run, *, size_pt=DOCUMENT_FONT_SIZE, bold=False, color=None):
    run.font.size = Pt(size_pt)
    run.bold = bold
    if color is not None:
        run.font.color.rgb = color
    run.font.name = DOCUMENT_FONT
    r = run._element
    rPr = r.get_or_add_rPr()
    rFonts = rPr.get_or_add_rFonts()
    rFonts.set(qn('w:ascii'), DOCUMENT_FONT)
    rFonts.set(qn('w:hAnsi'), DOCUMENT_FONT)
    rFonts.set(qn('w:cs'), DOCUMENT_FONT)


def _setup_document_fonts(doc: Document) -> None:
    """Fuente base del informe: Arial 11 en estilos estándar."""
    for style_name in ('Normal', 'List Bullet', 'List Number'):
        try:
            style = doc.styles[style_name]
        except KeyError:
            continue
        style.font.name = DOCUMENT_FONT
        style.font.size = Pt(DOCUMENT_FONT_SIZE)
        rPr = style.element.get_or_add_rPr()
        rFonts = rPr.get_or_add_rFonts()
        rFonts.set(qn('w:ascii'), DOCUMENT_FONT)
        rFonts.set(qn('w:hAnsi'), DOCUMENT_FONT)
        rFonts.set(qn('w:cs'), DOCUMENT_FONT)


def _apply_table_borders(
    table,
    *,
    internal_vertical: bool = True,
) -> None:
    """Cuadrícula de tabla con líneas horizontales y verticales."""
    tbl = table._tbl
    tbl_pr = tbl.tblPr if tbl.tblPr is not None else OxmlElement('w:tblPr')

    def _border(edge: str, *, visible: bool) -> OxmlElement:
        el = OxmlElement(f'w:{edge}')
        if visible:
            el.set(qn('w:val'), 'single')
            el.set(qn('w:sz'), '4')
            el.set(qn('w:space'), '0')
            el.set(qn('w:color'), '000000')
        else:
            el.set(qn('w:val'), 'nil')
        return el

    borders = OxmlElement('w:tblBorders')
    for edge in ('left', 'right'):
        borders.append(_border(edge, visible=internal_vertical))
    borders.append(_border('insideV', visible=internal_vertical))
    for edge in ('top', 'bottom', 'insideH'):
        borders.append(_border(edge, visible=True))

    existing = tbl_pr.find(qn('w:tblBorders'))
    if existing is not None:
        tbl_pr.remove(existing)
    tbl_pr.append(borders)
    if tbl.tblPr is None:
        tbl.insert(0, tbl_pr)


def _set_cell_text(cell, text: str, *, bold: bool = False) -> None:
    cell.text = str(text)
    for paragraph in cell.paragraphs:
        for run in paragraph.runs:
            _set_run_font(run, size_pt=TABLE_FONT_SIZE, bold=bold)


def _finalize_report_table(
    table,
    *,
    header_bold: bool = True,
    internal_vertical: bool = True,
) -> None:
    _apply_table_borders(table, internal_vertical=internal_vertical)
    rows = table.rows
    for row_idx, row in enumerate(rows):
        tr_pr = row._tr.get_or_add_trPr()
        if tr_pr.find(qn('w:cantSplit')) is None:
            tr_pr.append(OxmlElement('w:cantSplit'))
        bold = header_bold and row_idx == 0
        for cell in row.cells:
            for paragraph in cell.paragraphs:
                paragraph.paragraph_format.keep_together = True
                # Mantener todas las filas juntas para no partir la tabla, pero
                # sin encadenar con lo que venga después (deja respirar el bloque).
                paragraph.paragraph_format.keep_with_next = row_idx < len(rows) - 1
                if not paragraph.runs and paragraph.text:
                    content = paragraph.text
                    paragraph.clear()
                    run = paragraph.add_run(content)
                    _set_run_font(run, size_pt=TABLE_FONT_SIZE, bold=bold)
                else:
                    for run in paragraph.runs:
                        _set_run_font(run, size_pt=TABLE_FONT_SIZE, bold=bold)

    # Espacio de respiro debajo de la tabla para separarla del bloque siguiente.
    # Se evita duplicarlo cuando la tabla se re-finaliza (p. ej. tras combinar celdas).
    nxt = table._element.getnext()
    already_spaced = (
        nxt is not None
        and nxt.tag == qn('w:p')
        and nxt.find(qn('w:r')) is None
    )
    if not already_spaced:
        spacer = OxmlElement('w:p')
        spacer_pr = OxmlElement('w:pPr')
        spacing = OxmlElement('w:spacing')
        spacing.set(qn('w:after'), '0')
        spacing.set(qn('w:before'), '0')
        spacing.set(qn('w:line'), '120')
        spacing.set(qn('w:lineRule'), 'exact')
        spacer_pr.append(spacing)
        spacer.append(spacer_pr)
        table._element.addnext(spacer)


def _estimate_table_height_cm(
    headers: list[str],
    rows: list[list[Any]],
    *,
    extra_heading_count: int = 0,
) -> float:
    """Estimación sesgada a ALTO: preferimos saltar de página a partir una tabla."""
    column_count = max(len(headers), 1)
    # Con muchas columnas el texto de descripción se parte en más líneas.
    chars_per_line = max(10, int(88 / column_count))

    def row_height(values: list[Any], *, header: bool = False) -> float:
        max_lines = 1
        for value in values:
            text = str(value or '—')
            lines = sum(
                max(1, math.ceil(len(part) / chars_per_line))
                for part in text.splitlines() or ['']
            )
            max_lines = max(max_lines, min(lines, 6))
        line_height = 0.48 if header else 0.44
        return max(0.72, max_lines * line_height + 0.22)

    body_rows = rows or [['—']]
    table_height = row_height(headers, header=True)
    table_height += sum(row_height(list(row)) for row in body_rows)
    chrome_cm = 1.2 + extra_heading_count * 0.85
    raw = table_height + chrome_cm
    # Multiplicador suave + piso por fila para no subestimar tablas densas.
    return max(raw * 1.12, 1.1 + 0.78 * (1 + len(body_rows)) + chrome_cm)


def _begin_table_block(doc: Document, estimated_height_cm: float = 8.0) -> None:
    """Agrupa tablas cortas solo si la siguiente cabe COMPLETA; si no, nueva página."""
    usable_height_cm = 17.5
    packing_buffer_cm = 0.8
    used_height_cm = getattr(doc, '_report_table_page_used_cm', None)
    if used_height_cm is None:
        # Reserva para título de sección u otro contenido previo de la primera página.
        used_height_cm = 2.8
    # Si el bloque no cabe entero en lo que queda, va a página nueva.
    if used_height_cm + estimated_height_cm + packing_buffer_cm > usable_height_cm:
        doc.add_page_break()
        used_height_cm = 0.0
    # Tras una tabla grande, la página queda “llena” aunque el estimado exceda el útil.
    setattr(
        doc,
        '_report_table_page_used_cm',
        min(usable_height_cm, used_height_cm + estimated_height_cm),
    )
    setattr(doc, '_report_table_blocks', getattr(doc, '_report_table_blocks', 0) + 1)


def _add_table_caption(
    doc: Document,
    title: str,
    *,
    new_page: bool = True,
    estimated_height_cm: float = 8.0,
) -> None:
    """Título consecutivo; el bloque abre página solo cuando no cabe completo."""
    if new_page:
        _begin_table_block(doc, estimated_height_cm)
    number = getattr(doc, '_report_table_number', 0) + 1
    setattr(doc, '_report_table_number', number)
    paragraph = doc.add_paragraph()
    fmt = paragraph.paragraph_format
    # El título viaja junto a su tabla (no queda huérfano al pie de página).
    fmt.keep_with_next = True
    fmt.keep_together = True
    fmt.space_before = Pt(6)
    fmt.space_after = Pt(4)
    run = paragraph.add_run(f'Tabla {number}. {title}')
    _set_run_font(run, size_pt=9)
    run.italic = True


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
        _find_logo(
            'Logo_ENAP_emblem.png',
            'Logo_ENAP_header.png',
            'Logo_ENAP.png',
            'Logo ENAP.png',
        ),
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
    _set_run_font(run, size_pt=DOCUMENT_FONT_SIZE, color=RGBColor(0x55, 0x65, 0x75))


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
    _setup_document_fonts(doc)

    section = doc.sections[0]
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(2)
    section.right_margin = Cm(2)

    _add_header_logos(doc)

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('Informe de costos (OMOC)')
    _set_run_font(run, bold=True, color=RGBColor(0x0F, 0x2C, 0x59))

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(f'Proyecto: {proyecto.nombre}')
    _set_run_font(run, bold=True)

    if not payload.get('ok'):
        p = doc.add_paragraph()
        run = p.add_run(payload.get('detail') or 'Sin datos.')
        _set_run_font(run, color=RGBColor(0xB9, 0x1C, 0x1C))
        buf = BytesIO()
        doc.save(buf)
        return buf.getvalue()

    nota = doc.add_paragraph()
    run = nota.add_run(payload['nota'])
    _set_run_font(run, color=RGBColor(0x47, 0x55, 0x69))

    doc.add_paragraph()
    h = doc.add_paragraph()
    run = h.add_run('1. Resumen por alternativa (escenario Estandar)')
    _set_run_font(run, bold=True)

    dim_names = [d['nombre'] for d in payload['dimensiones']]
    _add_table_caption(doc, 'Resumen de costos por alternativa')
    table = doc.add_table(rows=1, cols=2 + len(dim_names))
    hdr = table.rows[0].cells
    _set_cell_text(hdr[0], 'Alternativa', bold=True)
    for i, name in enumerate(dim_names):
        _set_cell_text(hdr[i + 1], name or f'Dim. {i + 1}', bold=True)
    _set_cell_text(hdr[-1], 'Total costo', bold=True)

    for fila in payload['alternativas']:
        row = table.add_row().cells
        _set_cell_text(row[0], fila['nombre'])
        for i, dim in enumerate(fila['dimensiones']):
            _set_cell_text(row[i + 1], f"{dim['valor']:.4f}")
        _set_cell_text(row[-1], f"{fila['total_costo']:.4f}")
    _finalize_report_table(table)

    doc.add_paragraph()
    h2 = doc.add_paragraph()
    run = h2.add_run('2. Criterios de cálculo')
    _set_run_font(run, bold=True)

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
        _set_run_font(run)

    if payload['dimensiones']:
        doc.add_paragraph()
        h3 = doc.add_paragraph()
        run = h3.add_run('3. Dimensiones de costo incluidas')
        _set_run_font(run, bold=True)
        for d in payload['dimensiones']:
            p = doc.add_paragraph(style='List Bullet')
            run = p.add_run(
                f"{d['nombre']} · escenario «{d['escenario']}» · "
                f"modo valor={d.get('modo_valor_terminal') or '—'} · "
                f"agregación={d.get('escenario_agregacion') or '—'}"
            )
            _set_run_font(run)

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
        _set_run_font(run, bold=True)
        for fila in payload['alternativas']:
            sub = doc.add_paragraph()
            run = sub.add_run(f"Alternativa: {fila['nombre']}")
            _set_run_font(run, bold=True)
            for dim in fila.get('dimensiones') or []:
                hojas = dim.get('hojas') or []
                if not hojas:
                    continue
                p = doc.add_paragraph()
                run = p.add_run(f"{dim['omoe_nombre']} — total {dim['valor']:.4f}")
                _set_run_font(run, bold=True)
                _add_table_caption(
                    doc,
                    f"Desglose de costos de {fila['nombre']} — {dim['omoe_nombre']}",
                )
                table = doc.add_table(rows=1, cols=2)
                _set_cell_text(table.rows[0].cells[0], 'Nodo / ítem de costo', bold=True)
                _set_cell_text(table.rows[0].cells[1], 'Valor x', bold=True)
                for h in hojas:
                    cells = table.add_row().cells
                    _set_cell_text(cells[0], str(h.get('nombre') or '—'))
                    val = h.get('valor')
                    _set_cell_text(
                        cells[1],
                        f'{float(val):.4f}' if val is not None else '—',
                    )
                _finalize_report_table(table)
                doc.add_paragraph()

    doc.add_paragraph()
    h5 = doc.add_paragraph()
    run = h5.add_run('5. Observación para Felipe / equipo de costos')
    _set_run_font(run, bold=True)
    p = doc.add_paragraph()
    run = p.add_run(
        'Este informe permite alimentar y sumar costos sin configurar pesos entre escenarios. '
        'Cuando existan varios panoramas de costo, se activará la resolución meso '
        '(Eq. 21 compensatoria / Eq. 22 selección del mejor contexto con sentido '
        'positivo o negativo / Eq. 23 peor caso).'
    )
    _set_run_font(run)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run('Documento generado por HATD · uso interno Cotecmar / ENAP / Universidad de la Costa')
    _set_run_font(run, color=RGBColor(0x64, 0x74, 0x8B))

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def _add_heading(
    doc: Document,
    text: str,
    *,
    level: int = 1,
    keep_with_next: bool = False,
) -> None:
    p = doc.add_paragraph()
    if keep_with_next:
        p.paragraph_format.keep_with_next = True
        p.paragraph_format.keep_together = True
    run = p.add_run(text)
    _set_run_font(run, bold=True, color=RGBColor(0x0F, 0x2C, 0x59))


def _fmt(value: Any, empty: str = '—') -> str:
    if value is None:
        return empty
    if isinstance(value, float):
        return f'{value:.4f}'
    text = str(value)
    return text if text.strip() else empty


def _fmt_percent(value: Any) -> str:
    if value is None or value == '':
        return '—'
    try:
        n = float(value)
        return f'{n:.2f} %'.replace('.00 %', ' %')
    except (TypeError, ValueError):
        return _fmt(value)


def _add_table(
    doc: Document,
    headers: list[str],
    rows: list[list[Any]],
    *,
    title: str | None = None,
    new_page: bool = True,
) -> None:
    estimated_height_cm = _estimate_table_height_cm(headers, rows)
    if title:
        _add_table_caption(
            doc,
            title,
            new_page=new_page,
            estimated_height_cm=estimated_height_cm,
        )
    elif new_page:
        _begin_table_block(doc, estimated_height_cm)
    table = doc.add_table(rows=1, cols=len(headers))
    for i, header in enumerate(headers):
        _set_cell_text(table.rows[0].cells[i], header, bold=True)
    if not rows:
        cells = table.add_row().cells
        _set_cell_text(cells[0], 'Sin registros.')
        for i in range(1, len(headers)):
            _set_cell_text(cells[i], '')
        _finalize_report_table(table)
        return
    for row in rows:
        cells = table.add_row().cells
        for i, val in enumerate(row[:len(headers)]):
            _set_cell_text(cells[i], _fmt(val))
    _finalize_report_table(table)


def _constantes_display(data: dict | None) -> str:
    data = data or {}
    parts = []
    for key in ('L', 'U', 'k', 'T', 'S', 'M', 'V', 'x0'):
        val = data.get(key)
        if val is not None and str(val).strip() != '':
            parts.append(f'{key}={val}')
    return ', '.join(parts)


def _nodos_dimension(omoe: Omoe) -> list[NodoArbol]:
    return list(
        NodoArbol.objects.filter(omoe=omoe)
        .select_related('tipo_nivel', 'parent')
        .order_by('tipo_nivel__orden', 'parent_id', 'orden_visual', 'nombre', 'id')
    )


def _node_level_orden(nodo: NodoArbol) -> int:
    if nodo.tipo_nivel_id and nodo.tipo_nivel and nodo.tipo_nivel.orden is not None:
        return int(nodo.tipo_nivel.orden)
    return 1


def _node_level_label(nodo: NodoArbol) -> str:
    if nodo.tipo_nivel_id and nodo.tipo_nivel and nodo.tipo_nivel.nombre:
        return nodo.tipo_nivel.nombre.upper()
    return f'NIVEL {_node_level_orden(nodo)}'


def _children_by_parent(nodos: list[NodoArbol]) -> dict[int | None, list[NodoArbol]]:
    grouped: dict[int | None, list[NodoArbol]] = {}
    for nodo in nodos:
        grouped.setdefault(nodo.parent_id, []).append(nodo)
    return grouped


def _concept_paths(nodos: list[NodoArbol]) -> list[list[NodoArbol]]:
    by_parent = _children_by_parent(nodos)
    roots = by_parent.get(None, [])
    paths: list[list[NodoArbol]] = []

    def walk(nodo: NodoArbol, path: list[NodoArbol]) -> None:
        current = [*path, nodo]
        children = by_parent.get(nodo.id, [])
        if not children:
            paths.append(current)
            return
        for child in children:
            walk(child, current)

    for root in roots:
        walk(root, [])
    return paths


def _concept_headers(nodos: list[NodoArbol]) -> list[str]:
    labels_by_orden: dict[int, str] = {}
    for nodo in nodos:
        labels_by_orden.setdefault(_node_level_orden(nodo), _node_level_label(nodo))
    return ['MODELO'] + [
        labels_by_orden[orden]
        for orden in sorted(labels_by_orden)
    ]


def _concept_node_text(
    nodo: NodoArbol,
    config_map: dict[int, Any] | None = None,
    *,
    include_weight: bool = False,
) -> str:
    cfg = (config_map or {}).get(nodo.id)
    aplica = getattr(cfg, 'aplica', nodo.aplica) if cfg else nodo.aplica
    peso = getattr(cfg, 'peso', nodo.peso) if cfg else nodo.peso
    parts = [nodo.nombre or '—']
    if include_weight:
        parts.append(f'w={_fmt_percent(peso)}')
    if aplica is False:
        parts.append('No aplica')
    return '\n'.join(parts)


def _concept_rows(
    omoe: Omoe,
    nodos: list[NodoArbol],
    config_map: dict[int, Any] | None = None,
    *,
    include_weight: bool = False,
) -> list[list[str]]:
    paths = _concept_paths(nodos)
    ordens = sorted({_node_level_orden(n) for n in nodos})
    if not paths:
        return [[omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.id}'] + [''] * len(ordens)]

    rows = []
    for path in paths:
        by_orden = {_node_level_orden(n): n for n in path}
        row = [omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.id}']
        for orden in ordens:
            nodo = by_orden.get(orden)
            row.append(
                _concept_node_text(nodo, config_map, include_weight=include_weight)
                if nodo else ''
            )
        rows.append(row)
    return rows


def _is_estandar_escenario(nombre: str | None) -> bool:
    return (nombre or '').strip().lower() in ('estandar', 'estándar', 'standard')


def _merge_table_column_runs(table, col_idx: int, *, start_row: int = 1) -> None:
    rows = table.rows
    i = start_row
    while i < len(rows):
        j = i + 1
        val = rows[i].cells[col_idx].text.strip()
        while j < len(rows) and rows[j].cells[col_idx].text.strip() == val and val:
            j += 1
        if j - i > 1:
            # Word concatena el contenido de todas las celdas al combinarlas.
            # Vaciar las inferiores evita repetir el mismo texto una vez por fila.
            top_cell = rows[i].cells[col_idx]
            for row_idx in range(i + 1, j):
                rows[row_idx].cells[col_idx].text = ''
            merged = top_cell.merge(rows[j - 1].cells[col_idx])
            _set_cell_text(merged, val)
            merged.vertical_alignment = WD_CELL_VERTICAL_ALIGNMENT.CENTER
        i = j


def _split_path_columns(path: list[NodoArbol]) -> tuple[str, str, NodoArbol]:
    if not path:
        return '', '', None
    if len(path) == 1:
        return '', '', path[0]
    if len(path) == 2:
        return path[0].nombre or '—', '', path[1]
    grupo = path[0].nombre or '—'
    mob = ' / '.join(n.nombre or '—' for n in path[1:-1])
    return grupo, mob, path[-1]


def _terminal_funcion_text(
    terminal: NodoArbol,
    config_map: dict[int, Any] | None = None,
) -> str:
    cfg = (config_map or {}).get(terminal.id)
    familia = getattr(cfg, 'familia_funciones', None) or terminal.familia_funciones or ''
    params = _constantes_display(
        getattr(cfg, 'parametros_funcion', None) or terminal.parametros_funcion,
    )
    parts = [p for p in (familia, params) if p]
    return ' · '.join(parts) if parts else '—'


def _hierarchy_rows_for_escenario(
    escenario_nombre: str,
    dim_nombre: str,
    nodos: list[NodoArbol],
    config_map: dict[int, Any] | None = None,
) -> list[list[str]]:
    rows = []
    for path in _concept_paths(nodos):
        grupo, mob, terminal = _split_path_columns(path)
        if terminal is None:
            continue
        desc = terminal.descripcion or terminal.observaciones or ''
        funcion = _terminal_funcion_text(terminal, config_map)
        descripcion = desc
        if funcion and funcion != '—':
            descripcion = f'{desc}\nFunción: {funcion}'.strip() if desc else f'Función: {funcion}'
        rows.append([
            escenario_nombre,
            dim_nombre,
            grupo,
            mob,
            terminal.nombre or '—',
            descripcion or '—',
        ])
    return rows


def _peso_rows_for_escenario(
    escenario_nombre: str,
    dim_nombre: str,
    nodos: list[NodoArbol],
    config_map: dict[int, Any] | None = None,
) -> list[list[str]]:
    rows = []
    for path in _concept_paths(nodos):
        grupo, mob, terminal = _split_path_columns(path)
        if terminal is None:
            continue
        cfg = (config_map or {}).get(terminal.id)
        peso = getattr(cfg, 'peso', terminal.peso) if cfg else terminal.peso
        rows.append([
            escenario_nombre,
            dim_nombre,
            grupo,
            mob,
            terminal.nombre or '—',
            _fmt_percent(peso),
            _terminal_funcion_text(terminal, config_map),
        ])
    return rows


def _add_table_with_merges(
    doc: Document,
    headers: list[str],
    rows: list[list[Any]],
    merge_cols: tuple[int, ...] = (),
    *,
    title: str | None = None,
    new_page: bool = True,
) -> None:
    _add_table(doc, headers, rows, title=title, new_page=new_page)
    if not rows or not merge_cols:
        return
    table = doc.tables[-1]
    for col in merge_cols:
        _merge_table_column_runs(table, col)
    _finalize_report_table(table, internal_vertical=True)


def _cfg_value(config_map: dict[int, Any] | None, nodo: NodoArbol, field: str):
    cfg = (config_map or {}).get(nodo.id)
    if isinstance(cfg, dict):
        return cfg.get(field, getattr(nodo, field, None))
    if cfg is not None:
        return getattr(cfg, field, getattr(nodo, field, None))
    return getattr(nodo, field, None)


def _report_font(size: int, *, bold: bool = False):
    names = (
        'DejaVuSans-Bold.ttf' if bold else 'DejaVuSans.ttf',
        'arialbd.ttf' if bold else 'arial.ttf',
    )
    for name in names:
        try:
            return ImageFont.truetype(name, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def _active_concept_nodes(
    nodos: list[NodoArbol],
    config_map: dict[int, Any] | None,
) -> list[NodoArbol]:
    if config_map is None:
        return nodos
    by_id = {n.id: n for n in nodos}
    active_ids = set()
    for nodo in nodos:
        if not bool(_cfg_value(config_map, nodo, 'aplica')):
            continue
        parent = nodo.parent_id
        valid = True
        while parent is not None:
            parent_node = by_id.get(parent)
            if parent_node is None:
                break
            if not bool(_cfg_value(config_map, parent_node, 'aplica')):
                valid = False
                break
            parent = parent_node.parent_id
        if valid:
            active_ids.add(nodo.id)
    return [n for n in nodos if n.id in active_ids]


def _render_concept_map_png(
    omoe: Omoe,
    nodos: list[NodoArbol],
    *,
    config_map: dict[int, Any] | None = None,
    include_weights: bool = False,
) -> BytesIO:
    """Render server-side del mapa conceptual usado en la interfaz."""
    nodes = _active_concept_nodes(nodos, config_map)
    by_parent = _children_by_parent(nodes)
    roots = by_parent.get(None, [])
    level_orders = sorted({_node_level_orden(n) for n in nodes})
    level_index = {order: idx + 1 for idx, order in enumerate(level_orders)}
    max_level = max(level_index.values(), default=1)

    scale = 2
    n_nodes = max(len(nodes), 1)
    # Densidad adaptativa: con muchos nodos el PNG se compacta para no
    # generar figuras de más de una página de alto.
    if n_nodes <= 20:
        density = 1.0
    elif n_nodes <= 50:
        density = 0.82
    elif n_nodes <= 90:
        density = 0.68
    else:
        density = 0.55

    top = int(18 * density) + 4
    margin = int(18 * density) + 6
    node_gap_y = max(3.0, 8.0 * density)
    col_gap = max(36.0, 56.0 * density)
    pad_x = max(6.0, 12.0 * density)
    pad_y = max(4.0, 8.0 * density)
    max_text_w = max(90.0, 130.0 * density)
    label_cap = max(120.0, 180.0 * density)

    font_level = _report_font(max(9, int(13 * density)) * scale, bold=True)
    font_node = _report_font(max(9, int(13 * density)) * scale, bold=True)
    font_root = _report_font(max(11, int(15 * density)) * scale, bold=True)
    font_root_sub = _report_font(max(9, int(12 * density)) * scale, bold=True)

    def _line_h(font) -> float:
        bbox = font.getbbox('Ághjy')
        return (bbox[3] - bbox[1]) / scale + 4

    def _wrap(text: str, font, cap: float) -> list[str]:
        words = str(text or '—').split()
        if not words:
            return ['—']
        lines: list[str] = []
        cur = ''
        for word in words:
            trial = f'{cur} {word}'.strip()
            if not cur or font.getlength(trial) / scale <= cap:
                cur = trial
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        return lines

    level_line_h = _line_h(font_level)
    node_line_h = _line_h(font_node)
    root_line_h = _line_h(font_root)

    node_level: dict[int, int] = {
        n.id: level_index.get(_node_level_orden(n), 1) for n in nodes
    }

    def _node_text_lines(n: NodoArbol, cap: float) -> list[str]:
        name = (n.nombre or n.codigo or '—').strip()
        lines = _wrap(name, font_node, cap)
        if include_weights:
            value = _cfg_value(config_map, n, 'peso')
            try:
                num = float(value)
                lines = lines + [f'w={num:.0f}%' if num.is_integer() else f'w={num:.2f}%']
            except (TypeError, ValueError):
                lines = lines + ['w=—']
        return lines

    # 1ª pasada: ancho natural del texto para dimensionar cada columna.
    natural_text_w: dict[int, float] = {}
    for n in nodes:
        lines = _node_text_lines(n, max_text_w)
        natural_text_w[n.id] = max(
            (font_node.getlength(line) / scale for line in lines), default=40
        )

    root_name = omoe.nombre_modelo or omoe.codigo or f'Dimensión #{omoe.id}'
    root_lines = _wrap(root_name, font_root, 180)
    root_text_w = max((font_root.getlength(line) / scale for line in root_lines), default=100)
    root_w = max(150.0, root_text_w + 24)
    root_h = max(48.0, (len(root_lines) + 1) * root_line_h + 12)

    # Etiquetas de nivel (encabezado de cada columna, incl. la dimensión).
    level_label_lines: dict[int, list[str]] = {0: _wrap('DIMENSIÓN', font_level, label_cap)}
    for order in level_orders:
        raw = next(
            (_node_level_label(n) for n in nodes if _node_level_orden(n) == order),
            f'NIVEL {order}',
        )
        level_label_lines[level_index[order]] = _wrap(str(raw).upper(), font_level, label_cap)
    header_lines_max = max((len(v) for v in level_label_lines.values()), default=1)
    header_h = header_lines_max * level_line_h + 12
    content_top = top + header_h + 14

    # Ancho UNIFORME por nivel: se toma la caja más ancha de cada columna.
    col_w: dict[int, float] = {0: root_w}
    for level in range(1, max_level + 1):
        widths = [
            natural_text_w[n.id] + 2 * pad_x for n in nodes
            if node_level[n.id] == level
        ]
        label_w = max(
            (font_level.getlength(line) / scale for line in level_label_lines.get(level, [])),
            default=90,
        )
        col_w[level] = max(max(widths, default=110.0), label_w + 20, 96.0)

    # 2ª pasada: todas las cajas del nivel usan el mismo ancho; el texto se
    # reajusta a ese ancho y se recalcula el alto.
    node_lines: dict[int, list[str]] = {}
    node_w: dict[int, float] = {}
    node_h: dict[int, float] = {}
    for n in nodes:
        level = node_level[n.id]
        box_w = col_w[level]
        lines = _node_text_lines(n, box_w - 2 * pad_x)
        node_lines[n.id] = lines
        node_w[n.id] = box_w
        node_h[n.id] = max(22.0, len(lines) * node_line_h + 2 * pad_y)

    # Posición X (centro) de cada columna, de izquierda a derecha.
    col_center_x: dict[int, float] = {}
    x_cursor = margin
    for level in range(0, max_level + 1):
        col_center_x[level] = x_cursor + col_w[level] / 2
        x_cursor += col_w[level] + col_gap

    # Posición vertical: hojas apiladas (según su alto) y padres centrados.
    y_cursor = content_top
    centers_y: dict[int, float] = {}

    def assign_center_y(nodo: NodoArbol) -> float:
        nonlocal y_cursor
        children = by_parent.get(nodo.id, [])
        if not children:
            cy = y_cursor + node_h[nodo.id] / 2
            y_cursor += node_h[nodo.id] + node_gap_y
        else:
            child_centers = [assign_center_y(child) for child in children]
            cy = sum(child_centers) / len(child_centers)
        centers_y[nodo.id] = cy
        return cy

    for root in roots:
        assign_center_y(root)

    content_bottom = y_cursor
    width = int(x_cursor - col_gap + margin)
    height = int(max(content_bottom, content_top + root_h) + margin)

    image = Image.new('RGB', (width * scale, height * scale), '#ffffff')
    draw = ImageDraw.Draw(image)

    # Raíz de dimensión: centrada verticalmente sobre todo el árbol.
    root_cx = col_center_x[0]
    root_cy = (
        sum(centers_y[r.id] for r in roots) / len(roots)
        if roots else content_top + root_h / 2
    )
    root_x = root_cx - root_w / 2
    root_y = root_cy - root_h / 2

    positions: dict[int, tuple[float, float]] = {}
    for nodo in nodes:
        level = level_index.get(_node_level_orden(nodo), 1)
        positions[nodo.id] = (col_center_x[level], centers_y[nodo.id])

    # Encabezados de nivel arriba de cada columna + separador horizontal.
    draw.line(
        [(margin * scale, (content_top - 10) * scale),
         ((width - margin) * scale, (content_top - 10) * scale)],
        fill='#dbe2ea',
        width=1 * scale,
    )
    for level in range(0, max_level + 1):
        cx = col_center_x[level]
        lines = level_label_lines.get(level, [])
        y = top + (header_h - len(lines) * level_line_h) / 2
        for line in lines:
            lw = font_level.getlength(line) / scale
            draw.text(
                ((cx - lw / 2) * scale, y * scale),
                line,
                fill='#687386',
                font=font_level,
            )
            y += level_line_h

    # Conectores tipo peine, ahora en horizontal (izquierda → derecha).
    connector = '#94a3b8'

    def draw_links(parent_right: float, parent_cy: float, children: list[NodoArbol]) -> None:
        if not children:
            return
        child_points = [
            (positions[ch.id][0] - node_w[ch.id] / 2, positions[ch.id][1])
            for ch in children
        ]
        bus_x = parent_right + col_gap / 2
        draw.line(
            [(parent_right * scale, parent_cy * scale), (bus_x * scale, parent_cy * scale)],
            fill=connector,
            width=2 * scale,
        )
        ys = [y for _, y in child_points]
        draw.line(
            [(bus_x * scale, min(ys + [parent_cy]) * scale),
             (bus_x * scale, max(ys + [parent_cy]) * scale)],
            fill=connector,
            width=2 * scale,
        )
        for child_left, child_cy in child_points:
            draw.line(
                [(bus_x * scale, child_cy * scale), (child_left * scale, child_cy * scale)],
                fill=connector,
                width=2 * scale,
            )
            arrow = [
                (child_left * scale, child_cy * scale),
                ((child_left - 8) * scale, (child_cy - 5) * scale),
                ((child_left - 8) * scale, (child_cy + 5) * scale),
            ]
            draw.polygon(arrow, fill=connector)

    draw_links(root_x + root_w, root_cy, roots)
    for nodo in nodes:
        cx, cy = positions[nodo.id]
        draw_links(cx + node_w[nodo.id] / 2, cy, by_parent.get(nodo.id, []))

    # Raíz de dimensión.
    draw.rounded_rectangle(
        [root_x * scale, root_y * scale, (root_x + root_w) * scale, (root_y + root_h) * scale],
        radius=10 * scale,
        fill='#24466e',
        outline='#112e50',
        width=3 * scale,
    )
    ry = root_y + 12
    for line in root_lines:
        lw = font_root.getlength(line) / scale
        draw.text(
            ((root_cx - lw / 2) * scale, ry * scale),
            line,
            fill='#ffffff',
            font=font_root,
        )
        ry += root_line_h
    sub = (omoe.rama_evaluacion or 'omoe').upper()
    sub_w = font_root_sub.getlength(sub) / scale
    draw.text(
        ((root_cx - sub_w / 2) * scale, ry * scale),
        sub,
        fill='#dbeafe',
        font=font_root_sub,
    )

    palette = [
        ('#1d4ed8', '#1e40af', '#ffffff'),
        ('#3b82f6', '#2563eb', '#ffffff'),
        ('#60a5fa', '#3b82f6', '#0f172a'),
        ('#93c5fd', '#60a5fa', '#0f172a'),
        ('#bfdbfe', '#93c5fd', '#0f172a'),
    ]
    for nodo in nodes:
        cx, cy = positions[nodo.id]
        level = level_index.get(_node_level_orden(nodo), 1)
        fill, outline, text_color = palette[min(level - 1, len(palette) - 1)]
        if include_weights:
            fill, outline, text_color = '#f59e0b', '#d97706', '#111827'
        w = node_w[nodo.id]
        h = node_h[nodo.id]
        x0, y0 = cx - w / 2, cy - h / 2
        draw.rounded_rectangle(
            [x0 * scale, y0 * scale, (x0 + w) * scale, (y0 + h) * scale],
            radius=9 * scale,
            fill=fill,
            outline=outline,
            width=3 * scale,
        )
        lines = node_lines[nodo.id]
        text_block_h = len(lines) * node_line_h
        ty = cy - text_block_h / 2
        for line in lines:
            lw = font_node.getlength(line) / scale
            draw.text(
                ((cx - lw / 2) * scale, ty * scale),
                line,
                fill=text_color,
                font=font_node,
            )
            ty += node_line_h

    output = BytesIO()
    image.save(output, format='PNG', optimize=True)
    output.seek(0)
    return output


def _begin_map_block(doc: Document, estimated_height_cm: float) -> None:
    """Agrupa mapas pequeños en una página y salta solo cuando no caben."""
    usable_height_cm = 21.0
    used_height_cm = getattr(doc, '_report_map_page_used_cm', None)
    if used_height_cm is None:
        # La primera página de mapas ya trae título de sección y texto introductorio.
        used_height_cm = 3.4
    elif used_height_cm + estimated_height_cm > usable_height_cm:
        doc.add_page_break()
        used_height_cm = 0.0

    setattr(
        doc,
        '_report_map_page_used_cm',
        used_height_cm + estimated_height_cm,
    )
    setattr(doc, '_report_map_blocks', getattr(doc, '_report_map_blocks', 0) + 1)


def _concept_map_picture_layout(
    omoe: Omoe,
    nodos: list[NodoArbol],
    *,
    config_map: dict[int, Any] | None = None,
    include_weights: bool = False,
) -> tuple[BytesIO, float, float]:
    picture = _render_concept_map_png(
        omoe,
        nodos,
        config_map=config_map,
        include_weights=include_weights,
    )
    # Bloque en tope de página: título + figura ≤ ~17 cm de alto.
    max_w_cm = 16.0
    max_h_cm = 16.5
    render_scale = 2
    layout_dpi = 96
    with Image.open(picture) as img:
        px_w, px_h = img.size
    picture.seek(0)
    aspect = (px_h / px_w) if px_w else 1.0

    logical_width_px = px_w / render_scale
    natural_width_cm = logical_width_px / layout_dpi * 2.54
    active_node_count = len(_active_concept_nodes(nodos, config_map))
    content_width_cap_cm = min(max_w_cm, 9.0 + min(active_node_count, 35) * 0.2)
    width_cm = min(content_width_cap_cm, natural_width_cm, max_w_cm)
    height_cm = width_cm * aspect
    if height_cm > max_h_cm:
        width_cm = max_h_cm / aspect
        height_cm = max_h_cm

    return picture, width_cm, height_cm


def _add_prepared_concept_map_picture(
    doc: Document,
    picture: BytesIO,
    width_cm: float,
) -> None:
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_before = Pt(2)
    p.paragraph_format.space_after = Pt(6)
    p.add_run().add_picture(picture, width=Cm(width_cm))


def _add_concept_map_block(
    doc: Document,
    headings: list[str],
    omoe: Omoe,
    nodos: list[NodoArbol],
    *,
    config_map: dict[int, Any] | None = None,
    include_weights: bool = False,
) -> None:
    picture, width_cm, height_cm = _concept_map_picture_layout(
        omoe,
        nodos,
        config_map=config_map,
        include_weights=include_weights,
    )
    estimated_heading_height_cm = 0.75 * len(headings)
    estimated_block_height_cm = height_cm + estimated_heading_height_cm + 0.7
    _begin_map_block(doc, estimated_block_height_cm)
    for heading in headings:
        _add_heading(doc, heading, level=3, keep_with_next=True)
    _add_prepared_concept_map_picture(doc, picture, width_cm)


def _add_etapa1_arboles_section(
    doc: Document,
    schema: dict[str, Any],
    *,
    include_weights: bool = False,
) -> None:
    """1.1 Árboles dimensionales renderizados como el mapa conceptual."""
    _add_heading(doc, 'Etapa 1. Definición y estructuración del proyecto', level=1)
    _add_heading(doc, '1.1. Gráficas de los árboles dimensionales', level=2)
    p = doc.add_paragraph()
    run = p.add_run(
        'Los árboles se representan visualmente como en el mapa conceptual del software: '
        'niveles, nodos y conexiones jerárquicas.'
    )
    _set_run_font(run, color=RGBColor(0x47, 0x55, 0x69))

    from .nodo_escenario_service import load_config_map

    for dim in schema.get('dimensiones') or []:
        omoe = Omoe.objects.get(pk=dim['omoe_id'])
        nodos = _nodos_dimension(omoe)
        dim_label = f"{dim['omoe_nombre']} ({(dim.get('rama_evaluacion') or '').upper() or 'TIPO'})"
        weight_label = 'con pesos' if include_weights else 'sin pesos'

        _add_concept_map_block(
            doc,
            [dim_label, f'Árbol estándar / completo ({weight_label})'],
            omoe,
            nodos,
            include_weights=include_weights,
        )

        escenarios = list(Escenario.objects.filter(omoe=omoe).order_by('orden', 'nombre', 'id'))
        for esc in escenarios:
            if _is_estandar_escenario(esc.nombre):
                continue
            config = load_config_map(esc.id)
            _add_concept_map_block(
                doc,
                [f'Escenario: {esc.nombre} ({weight_label})'],
                omoe,
                nodos,
                config_map=config,
                include_weights=include_weights,
            )


def _add_alternativas_section(doc: Document, proyecto: Proyecto) -> None:
    _add_heading(doc, '1.2. Definición de las alternativas', level=2)
    alternativas = list(
        Alternativa.objects.filter(proyecto=proyecto)
        .prefetch_related('capacidades', 'caracteristicas__plantilla')
        .order_by('id')
    )
    rows = []
    for alt in alternativas:
        caracts = [
            f'{c.plantilla.nombre}: {c.dato} {c.plantilla.unidad or ""}'.strip()
            for c in alt.caracteristicas.all()
        ]
        caps = [c.nombre for c in alt.capacidades.all()]
        costo = f'{alt.costo} {alt.costo_unidad}' if alt.costo is not None else ''
        rows.append([
            alt.nombre,
            alt.descripcion,
            alt.referencia,
            costo,
            '; '.join(caps),
            '; '.join(caracts),
        ])
    _add_table(
        doc,
        ['Alternativa', 'Descripción', 'Referencia', 'Costo declarado', 'Capacidades', 'Características'],
        rows,
        title='Definición de las alternativas',
    )

    for alt in alternativas:
        if not alt.foto:
            continue
        foto_path = Path(alt.foto.path) if alt.foto.name else None
        if not foto_path or not foto_path.is_file():
            continue
        sub = doc.add_paragraph()
        run = sub.add_run(f'Imagen — {alt.nombre}')
        _set_run_font(run, bold=True)
        pic = doc.add_paragraph()
        pic.alignment = WD_ALIGN_PARAGRAPH.CENTER
        try:
            pic.add_run().add_picture(str(foto_path), height=Cm(4.5))
        except Exception:
            err = doc.add_paragraph()
            run = err.add_run('No se pudo incorporar la imagen de la alternativa.')
            _set_run_font(run, color=RGBColor(0xB9, 0x1C, 0x1C))


def _add_etapa1_estructura_jerarquica(doc: Document, schema: dict[str, Any]) -> None:
    """1.3 Tabla de definición de la estructura jerárquica."""
    _add_heading(doc, '1.3. Tabla de definición de la estructura jerárquica', level=2)
    from .nodo_escenario_service import load_config_map

    headers = [
        'Escenario',
        'Dimensión',
        'Grupo de afinidad',
        'Nodo intermedio — MOB',
        'Nodo terminal — DT',
        'Descripción o función',
    ]
    for dim in schema.get('dimensiones') or []:
        omoe = Omoe.objects.get(pk=dim['omoe_id'])
        nodos = _nodos_dimension(omoe)
        dim_nombre = dim['omoe_nombre'] or omoe.nombre_modelo or omoe.codigo
        escenarios = list(Escenario.objects.filter(omoe=omoe).order_by('orden', 'nombre', 'id'))
        if not escenarios:
            rows = _hierarchy_rows_for_escenario('—', dim_nombre, nodos)
            _begin_table_block(
                doc,
                _estimate_table_height_cm(headers, rows, extra_heading_count=1),
            )
            _add_heading(doc, dim_nombre, level=3, keep_with_next=True)
            _add_table_with_merges(
                doc,
                headers,
                rows,
                merge_cols=(0, 1, 2, 3),
                title=f'Estructura jerárquica — {dim_nombre}',
                new_page=False,
            )
            continue

        for esc in escenarios:
            config = load_config_map(esc.id)
            rows = _hierarchy_rows_for_escenario(esc.nombre, dim_nombre, nodos, config)
            _begin_table_block(
                doc,
                _estimate_table_height_cm(headers, rows, extra_heading_count=1),
            )
            _add_heading(
                doc,
                f'{dim_nombre} · Escenario: {esc.nombre}',
                level=3,
                keep_with_next=True,
            )
            _add_table_with_merges(
                doc,
                headers,
                rows,
                merge_cols=(0, 1, 2, 3),
                title=f'Estructura jerárquica — {dim_nombre} — {esc.nombre}',
                new_page=False,
            )


def _add_etapa1_pesos_nodo(doc: Document, schema: dict[str, Any]) -> None:
    """1.4 Tabla de pesos por nodo."""
    _add_heading(doc, '1.4. Tabla de pesos por nodo', level=2)
    from .nodo_escenario_service import load_config_map

    headers = [
        'Escenario',
        'Dimensión',
        'Grupo de afinidad',
        'Nodo intermedio',
        'Nodo terminal',
        'Peso',
        'Función de utilidad',
    ]
    for dim in schema.get('dimensiones') or []:
        omoe = Omoe.objects.get(pk=dim['omoe_id'])
        nodos = _nodos_dimension(omoe)
        dim_nombre = dim['omoe_nombre'] or omoe.nombre_modelo or omoe.codigo
        escenarios = list(Escenario.objects.filter(omoe=omoe).order_by('orden', 'nombre', 'id'))
        if not escenarios:
            rows = _peso_rows_for_escenario('—', dim_nombre, nodos)
            _begin_table_block(
                doc,
                _estimate_table_height_cm(headers, rows, extra_heading_count=1),
            )
            _add_heading(doc, dim_nombre, level=3, keep_with_next=True)
            _add_table_with_merges(
                doc,
                headers,
                rows,
                merge_cols=(0, 1, 2, 3),
                title=f'Pesos por nodo — {dim_nombre}',
                new_page=False,
            )
            continue

        for esc in escenarios:
            config = load_config_map(esc.id)
            rows = _peso_rows_for_escenario(esc.nombre, dim_nombre, nodos, config)
            _begin_table_block(
                doc,
                _estimate_table_height_cm(headers, rows, extra_heading_count=1),
            )
            _add_heading(
                doc,
                f'{dim_nombre} · Escenario: {esc.nombre}',
                level=3,
                keep_with_next=True,
            )
            _add_table_with_merges(
                doc,
                headers,
                rows,
                merge_cols=(0, 1, 2, 3),
                title=f'Pesos por nodo — {dim_nombre} — {esc.nombre}',
                new_page=False,
            )


def _add_etapa2_placeholder(doc: Document) -> None:
    _add_heading(doc, 'Etapa 2. Evaluaciones de las alternativas', level=1)
    p = doc.add_paragraph()
    run = p.add_run(
        'Las matrices de evaluación (alternativas × nodos terminales por dimensión y escenario) '
        'y la matriz bruta se incorporarán en la siguiente iteración de este mismo documento.'
    )
    _set_run_font(run, color=RGBColor(0x47, 0x55, 0x69))


def build_informe_proyecto_docx(
    proyecto: Proyecto,
    *,
    include_map_weights: bool = False,
) -> bytes:
    """Informe de proyecto: Etapa 1 (estructura) + Etapa 2 (evaluaciones) en un solo documento."""
    schema = build_evaluacion_schema(proyecto)
    doc = Document()
    _setup_document_fonts(doc)
    section = doc.sections[0]
    section.top_margin = Cm(2.2)
    section.bottom_margin = Cm(2)
    section.left_margin = Cm(1.6)
    section.right_margin = Cm(1.6)

    _add_header_logos(
        doc,
        subtitle_text='ENAP · Cotecmar · Universidad de la Costa  |  HATD — Informe de proyecto',
    )

    title = doc.add_paragraph()
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = title.add_run('Informe de proyecto')
    _set_run_font(run, bold=True, color=RGBColor(0x0F, 0x2C, 0x59))
    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(proyecto.nombre)
    _set_run_font(run, bold=True)

    _add_heading(doc, 'Información general del proyecto')
    _add_table(
        doc,
        ['Campo', 'Valor'],
        [
            ['Nombre', proyecto.nombre],
            ['Descripción', proyecto.descripcion],
            ['Eslora máxima', proyecto.eslora_maxima],
            ['Desplazamiento', proyecto.desplazamiento],
            ['Velocidad máxima', proyecto.velocidad_maxima],
            ['Velocidad crucero', proyecto.velocidad_crucero],
            ['Tripulación', proyecto.tripulacion],
            ['Autonomía', proyecto.autonomia],
            ['Propulsión', proyecto.propulsion],
            ['Posicionamiento dinámico', proyecto.posicionamiento_dinamico],
            ['Laboratorios', proyecto.laboratorios],
            ['Otras características', proyecto.otras_caracteristicas],
        ],
        title='Información general del proyecto',
    )

    _add_etapa1_arboles_section(
        doc,
        schema,
        include_weights=include_map_weights,
    )
    _add_alternativas_section(doc, proyecto)
    _add_etapa1_estructura_jerarquica(doc, schema)
    _add_etapa1_pesos_nodo(doc, schema)
    _add_etapa2_placeholder(doc)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run('Documento generado por HATD · Informe de proyecto')
    _set_run_font(run, color=RGBColor(0x64, 0x74, 0x8B))

    buf = BytesIO()
    doc.save(buf)
    return buf.getvalue()


def build_informe_curvas_docx(proyecto: Proyecto) -> bytes:
    """Informe Word con curvas de utilidad finales (nodos terminales × escenario)."""
    from .curvas_utilidad_service import build_curvas_utilidad_export

    payload = build_curvas_utilidad_export(proyecto)
    doc = Document()
    _setup_document_fonts(doc)

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
    _set_run_font(run, bold=True, color=RGBColor(0x0F, 0x2C, 0x59))

    sub = doc.add_paragraph()
    sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = sub.add_run(f'Proyecto: {proyecto.nombre}')
    _set_run_font(run, bold=True)

    gen = payload.get('generado_en') or ''
    if gen:
        meta = doc.add_paragraph()
        meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
        run = meta.add_run(f'Generado: {gen}')
        _set_run_font(run, color=RGBColor(0x64, 0x74, 0x8B))

    nota = doc.add_paragraph()
    run = nota.add_run(
        'Inventario de funciones u(x) configuradas en nodos terminales por escenario. '
        'No es el historial de cambios: refleja el estado final del árbol para informes '
        'metodológicos. Dimensiones en modo valor bruto (p. ej. costos) suelen omitirse '
        'si no tienen familia de función.'
    )
    _set_run_font(run, color=RGBColor(0x47, 0x55, 0x69))

    dims = payload.get('dimensiones') or []
    total_curvas = sum(len(d.get('curvas') or []) for d in dims)
    sec_n = 2
    if total_curvas == 0:
        p = doc.add_paragraph()
        run = p.add_run(
            'No hay curvas de utilidad configuradas en este proyecto '
            '(sin familia de función en nodos terminales).'
        )
        _set_run_font(run, color=RGBColor(0xB9, 0x1C, 0x1C))
    else:
        doc.add_paragraph()
        h = doc.add_paragraph()
        run = h.add_run('1. Resumen')
        _set_run_font(run, bold=True)
        p = doc.add_paragraph()
        run = p.add_run(
            f'{total_curvas} curva(s) en {len(dims)} dimensión(es). '
            'Cada fila corresponde a un nodo terminal × escenario.'
        )
        _set_run_font(run)

        for dim in dims:
            curvas = dim.get('curvas') or []
            if not curvas:
                continue
            doc.add_paragraph()
            h = doc.add_paragraph()
            nombre = dim.get('omoe_nombre') or f"Dimensión #{dim.get('omoe_id')}"
            rama = (dim.get('rama_evaluacion') or '').upper() or '—'
            run = h.add_run(f'{sec_n}. {nombre} ({rama})')
            _set_run_font(run, bold=True)
            sec_n += 1

            meta_bits = []
            if dim.get('modo_valor_terminal'):
                meta_bits.append(f"modo valor={dim['modo_valor_terminal']}")
            if dim.get('escenario_agregacion'):
                meta_bits.append(f"agregación={dim['escenario_agregacion']}")
            if meta_bits:
                p = doc.add_paragraph()
                run = p.add_run(' · '.join(meta_bits))
                _set_run_font(run, color=RGBColor(0x64, 0x74, 0x8B))

            _add_table_caption(doc, f'Curvas de utilidad — {nombre} ({rama})')
            table = doc.add_table(rows=1, cols=5)
            hdr = table.rows[0].cells
            _set_cell_text(hdr[0], 'Nodo terminal', bold=True)
            _set_cell_text(hdr[1], 'Escenario', bold=True)
            _set_cell_text(hdr[2], 'Familia', bold=True)
            _set_cell_text(hdr[3], 'Parámetros', bold=True)
            _set_cell_text(hdr[4], 'Unidad', bold=True)
            for c in curvas:
                cells = table.add_row().cells
                _set_cell_text(cells[0], str(c.get('terminal_nombre') or '—'))
                _set_cell_text(
                    cells[1],
                    str(c.get('escenario_nombre') or c.get('escenario_label') or '—'),
                )
                _set_cell_text(cells[2], str(c.get('familia_funciones') or '—'))
                _set_cell_text(
                    cells[3],
                    str(
                        c.get('constantes_display')
                        or _format_constantes(c.get('constantes'))
                        or '—'
                    ),
                )
                _set_cell_text(cells[4], str(c.get('unidad') or '—'))
            _finalize_report_table(table)

    doc.add_paragraph()
    h_ref = doc.add_paragraph()
    run = h_ref.add_run(f'{sec_n}. Nota metodológica')
    _set_run_font(run, bold=True)
    for text in (
        'La utilidad u(x) transforma el valor ofertado x en [0, 1] según la familia '
        'y constantes del nodo (capa micro).',
        'En simulación MADM, las utilidades de hojas se agregan con pesos del árbol; '
        'la resolución de escenarios (capa meso) usa Eq. (21)–(23) según la dimensión.',
        'Hay exportación JSON equivalente (curvas-utilidad) para procesamiento externo.',
    ):
        p = doc.add_paragraph(style='List Bullet')
        run = p.add_run(text)
        _set_run_font(run)

    footer = doc.sections[0].footer
    fp = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    fp.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run = fp.add_run(
        'Documento generado por HATD · uso interno Cotecmar / ENAP / Universidad de la Costa'
    )
    _set_run_font(run, color=RGBColor(0x64, 0x74, 0x8B))

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
