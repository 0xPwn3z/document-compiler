"""DOCX <-> Markdown conversion with template-aware block markers.

The Markdown file is intentionally a working representation, not a generic
Pandoc export. Each editable block carries a stable id and the original Word
style. Export starts from the untouched template and updates/reorders matched
paragraphs and tables in place, which keeps the template's page system and
document parts available to Word.
"""

from __future__ import annotations

import copy
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable

from docx import Document
from docx.document import Document as DocumentObject
from docx.enum.text import WD_BREAK
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.table import Table, _Cell
from docx.text.paragraph import Paragraph

BLOCK_RE = re.compile(r"^\s*<!--\s*dc:block\s+(\{.*\})\s*-->\s*$")
BLANK_RE = re.compile(r"^\s*<!--\s*dc:blank\s*-->\s*$")
PAGE_BREAK_RE = re.compile(r"^\s*<!--\s*dc:page-break\s*-->\s*$")
OPAQUE_RE = re.compile(r"^\s*<!--\s*dc:opaque\s+(\{.*\})\s*-->\s*$")


@dataclass
class MarkdownBlock:
    kind: str
    block_id: str | None = None
    style: str | None = None
    text: str = ""
    rows: list[list[str]] = field(default_factory=list)
    level: int | None = None
    list_type: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)


def _json(value: dict[str, Any]) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _escape_markdown(text: str) -> str:
    """Escape characters which would change the exported inline meaning."""

    text = text.replace("\\", "\\\\")
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\n", "<br>\n")
    for character in ("*", "_", "`", "[", "]"):
        text = text.replace(character, "\\" + character)
    return text


def _escape_table(text: str) -> str:
    return _escape_markdown(text).replace("|", "\\|")


def _inline_markdown(paragraph: Paragraph) -> str:
    chunks: list[str] = []
    for run in paragraph.runs:
        text = _escape_markdown(run.text)
        if not text:
            continue
        if run.bold:
            text = f"**{text}**"
        if run.italic:
            text = f"_{text}_"
        if run.underline:
            text = f"<u>{text}</u>"
        chunks.append(text)
    if chunks:
        return "".join(chunks)
    return _escape_markdown(paragraph.text)


def _paragraph_style(paragraph: Paragraph) -> str:
    try:
        return paragraph.style.name if paragraph.style else "Normal"
    except (AttributeError, KeyError):
        return "Normal"


def _list_kind(paragraph: Paragraph, style: str) -> str | None:
    lower = style.lower()
    if "bullet" in lower or "bulleted" in lower:
        return "bullet"
    if "number" in lower or "numbered" in lower:
        return "number"
    ppr = paragraph._p.pPr
    if ppr is not None and ppr.numPr is not None:
        return "number"
    return None


def _has_page_break(paragraph: Paragraph) -> bool:
    return bool(paragraph._p.xpath('.//w:br[@w:type="page"]'))


def _body_elements(document: DocumentObject) -> list[tuple[str, Any]]:
    elements: list[tuple[str, Any]] = []
    for child in document.element.body.iterchildren():
        if child.tag == qn("w:p"):
            elements.append(("paragraph", Paragraph(child, document._body)))
        elif child.tag == qn("w:tbl"):
            elements.append(("table", Table(child, document._body)))
    return elements


def _table_rows(table: Table) -> list[list[str]]:
    rows: list[list[str]] = []
    for row in table.rows:
        rows.append([cell.text.replace("\r", "").replace("\n", "<br>") for cell in row.cells])
    return rows


def _table_markdown(table: Table) -> str:
    rows = _table_rows(table)
    columns = max((len(row) for row in rows), default=1)
    if not rows:
        rows = [[""] * columns]
    normalized = [row + [""] * (columns - len(row)) for row in rows]
    lines = ["| " + " | ".join(_escape_table(cell) for cell in normalized[0]) + " |"]
    lines.append("| " + " | ".join("---" for _ in range(columns)) + " |")
    for row in normalized[1:]:
        lines.append("| " + " | ".join(_escape_table(cell) for cell in row) + " |")
    return "\n".join(lines)


def docx_to_markdown(docx_path: str | Path, markdown_path: str | Path, manifest_path: str | Path) -> dict[str, Any]:
    """Extract editable body blocks and a companion manifest from a DOCX."""

    document = Document(str(docx_path))
    lines = ["<!-- doc-compiler:version 1 -->", ""]
    blocks: list[dict[str, Any]] = []
    body_index = 0

    for kind, item in _body_elements(document):
        block_id = f"b{body_index:05d}"
        if kind == "paragraph":
            style = _paragraph_style(item)
            block = {
                "id": block_id,
                "kind": "paragraph",
                "style": style,
                "body_index": body_index,
                "list_type": _list_kind(item, style),
                "page_break": _has_page_break(item),
            }
            lines.append(f"<!-- dc:block {_json(block)} -->")
            content = _inline_markdown(item)
            if content:
                if block["list_type"] == "bullet":
                    lines.append(f"- {content}")
                elif block["list_type"] == "number":
                    lines.append(f"1. {content}")
                else:
                    lines.append(content)
            else:
                lines.append("<!-- dc:blank -->")
            lines.append("")
            blocks.append(block)
        elif kind == "table":
            block = {
                "id": block_id,
                "kind": "table",
                "body_index": body_index,
                "rows": len(item.rows),
                "columns": max((len(row.cells) for row in item.rows), default=1),
            }
            lines.append(f"<!-- dc:block {_json(block)} -->")
            lines.append(_table_markdown(item))
            lines.append("")
            blocks.append(block)
        body_index += 1

    manifest = {
        "version": 1,
        "source": Path(docx_path).name,
        "editable_blocks": blocks,
        "preserved": ["styles", "sections", "headers", "footers", "tables", "relationships"],
        "limitations": [
            "Text boxes and floating shapes are preserved only when not edited through Markdown.",
            "Complex fields, tracked changes and content controls are not editable in this MVP.",
        ],
    }
    Path(markdown_path).write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
    Path(manifest_path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return manifest


def _strip_table_cell(value: str) -> str:
    value = value.strip()
    value = value.replace("\\|", "|")
    value = re.sub(r"\s*<br\s*/?>\s*", "\n", value, flags=re.IGNORECASE)
    return value


def _split_table_row(line: str) -> list[str]:
    value = line.strip()
    if value.startswith("|"):
        value = value[1:]
    if value.endswith("|") and not value.endswith("\\|"):
        value = value[:-1]
    cells: list[str] = []
    current: list[str] = []
    escaped = False
    for char in value:
        if char == "|" and not escaped:
            cells.append(_strip_table_cell("".join(current)))
            current = []
        else:
            current.append(char)
        escaped = char == "\\" and not escaped
        if char != "\\":
            escaped = False
    cells.append(_strip_table_cell("".join(current)))
    return cells


def _is_table_separator(line: str) -> bool:
    cells = _split_table_row(line)
    return len(cells) >= 1 and all(re.match(r"^:?-{3,}:?$", cell.strip()) for cell in cells)


def _new_id(counter: int) -> str:
    return f"new{counter:05d}"


def parse_markdown_blocks(markdown: str) -> list[MarkdownBlock]:
    """Parse the supported Markdown dialect while tolerating marker removal."""

    lines = markdown.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    blocks: list[MarkdownBlock] = []
    pending_meta: dict[str, Any] | None = None
    i = 0
    new_counter = 0

    def take_meta() -> dict[str, Any]:
        nonlocal pending_meta, new_counter
        meta = pending_meta or {}
        pending_meta = None
        if not meta.get("id"):
            meta["id"] = _new_id(new_counter)
            new_counter += 1
        return meta

    while i < len(lines):
        line = lines[i]
        marker = BLOCK_RE.match(line)
        if marker:
            try:
                pending_meta = json.loads(marker.group(1))
            except json.JSONDecodeError:
                pending_meta = {}
            i += 1
            while i < len(lines) and not lines[i].strip():
                i += 1
            continue
        if PAGE_BREAK_RE.match(line):
            meta = take_meta()
            blocks.append(MarkdownBlock(kind="page_break", block_id=meta.get("id"), meta=meta))
            i += 1
            continue
        if OPAQUE_RE.match(line):
            i += 1
            pending_meta = None
            continue
        if not line.strip() or line.strip().startswith("<!-- doc-compiler:"):
            i += 1
            continue
        if BLANK_RE.match(line):
            meta = take_meta()
            blocks.append(MarkdownBlock(kind="paragraph", block_id=meta.get("id"), style=meta.get("style"), meta=meta))
            i += 1
            continue

        meta = pending_meta or {}
        if line.lstrip().startswith("|") and i + 1 < len(lines) and _is_table_separator(lines[i + 1]):
            header = _split_table_row(line)
            i += 2
            rows = [header]
            while i < len(lines) and lines[i].strip() and not BLOCK_RE.match(lines[i]):
                if lines[i].lstrip().startswith("|"):
                    rows.append(_split_table_row(lines[i]))
                    i += 1
                else:
                    break
            meta = take_meta()
            blocks.append(MarkdownBlock(kind="table", block_id=meta.get("id"), rows=rows, meta=meta))
            continue

        heading = re.match(r"^\s*(#{1,6})\s+(.*?)\s*$", line)
        if heading:
            meta = take_meta()
            level = len(heading.group(1))
            blocks.append(MarkdownBlock(kind="paragraph", block_id=meta.get("id"), style=meta.get("style"), text=heading.group(2), level=level, meta=meta))
            i += 1
            continue

        fence = re.match(r"^\s*```(?:([^ ]+))?\s*$", line)
        if fence:
            i += 1
            code_lines: list[str] = []
            while i < len(lines) and not re.match(r"^\s*```\s*$", lines[i]):
                code_lines.append(lines[i])
                i += 1
            if i < len(lines):
                i += 1
            meta = take_meta()
            blocks.append(MarkdownBlock(kind="paragraph", block_id=meta.get("id"), style=meta.get("style") or "No Spacing", text="\n".join(code_lines), meta={**meta, "code": True}))
            continue

        list_match = re.match(r"^\s*(-|\*|\+|\d+\.)\s+(.*)$", line)
        if list_match:
            marker_type = list_match.group(1)
            list_kind = "number" if marker_type[0].isdigit() else "bullet"
            while i < len(lines):
                current = re.match(r"^\s*(-|\*|\+|\d+\.)\s+(.*)$", lines[i])
                if not current:
                    break
                meta = take_meta()
                blocks.append(MarkdownBlock(kind="paragraph", block_id=meta.get("id"), style=meta.get("style"), text=current.group(2), list_type=meta.get("list_type") or list_kind, meta=meta))
                i += 1
            continue

        paragraph_lines = [line]
        i += 1
        while i < len(lines) and lines[i].strip() and not BLOCK_RE.match(lines[i]) and not PAGE_BREAK_RE.match(lines[i]):
            if lines[i].lstrip().startswith("|"):
                break
            paragraph_lines.append(lines[i])
            i += 1
        meta = take_meta()
        blocks.append(MarkdownBlock(kind="paragraph", block_id=meta.get("id"), style=meta.get("style"), text="\n".join(paragraph_lines), meta=meta))

    return blocks


def _unescape_inline(text: str) -> str:
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    return re.sub(r"\\([\\`*_\[\]])", r"\1", text)


def _iter_inline(text: str) -> Iterable[tuple[str, dict[str, bool]]]:
    """Yield basic Markdown spans without requiring a Markdown dependency."""

    pattern = re.compile(r"(\*\*(.+?)\*\*|__(.+?)__|(?<!\\)(?<!\*)\*(.+?)(?<!\\)\*|(?<!\\)_(.+?)(?<!\\)_|`(.+?)`|<u>(.+?)</u>)", re.DOTALL)
    position = 0
    for match in pattern.finditer(text):
        if match.start() > position:
            yield _unescape_inline(text[position:match.start()]), {}
        value = next(group for group in match.groups()[1:] if group is not None)
        if match.group(1).startswith("**") or match.group(2) is not None or match.group(3) is not None:
            props = {"bold": True}
        elif match.group(4) is not None or match.group(5) is not None:
            props = {"italic": True}
        elif match.group(6) is not None:
            props = {"code": True}
        else:
            props = {"underline": True}
        yield _unescape_inline(value), props
        position = match.end()
    if position < len(text):
        yield _unescape_inline(text[position:]), {}


def _style_exists(document: DocumentObject, name: str | None) -> bool:
    if not name:
        return False
    try:
        document.styles[name]
        return True
    except KeyError:
        return False


_MANAGED_PROPERTY_TAGS = ("w:b", "w:i", "w:u")


def _run_spec(run: Any) -> tuple[str, Any]:
    """Text plus a detached copy of the direct run properties."""
    properties = run._r.find(qn("w:rPr"))
    return run.text, copy.deepcopy(properties) if properties is not None else None


def _base_run_properties(properties: Any) -> Any:
    """Direct properties minus the emphasis Markdown owns (bold/italic/underline)."""
    if properties is None:
        return None
    base = copy.deepcopy(properties)
    for tag in _MANAGED_PROPERTY_TAGS:
        for element in base.findall(qn(tag)):
            base.remove(element)
    return base


def _paragraph_is_unchanged(paragraph: Paragraph, block: MarkdownBlock, document: DocumentObject) -> bool:
    """True when the block still mirrors the source paragraph exactly.

    Unchanged paragraphs are left byte-for-byte identical to the template so
    drawings, hyperlinks, bookmarks and every direct formatting detail are
    preserved without a lossy rebuild.
    """
    if block.meta.get("code"):
        return False
    if bool(block.meta.get("page_break")) != _has_page_break(paragraph):
        return False
    if (block.list_type or None) != (_list_kind(paragraph, _paragraph_style(paragraph)) or None):
        return False
    if block.style and _style_exists(document, block.style):
        if block.style != _paragraph_style(paragraph):
            return False
    elif block.level:
        return False
    spans = [
        (text, bool(props.get("bold")), bool(props.get("italic")), bool(props.get("underline")))
        for text, props in _iter_inline(block.text)
        if text
    ]
    runs = [
        (run.text, bool(run.bold), bool(run.italic), bool(run.underline))
        for run in paragraph.runs
        if run.text
    ]
    return spans == runs


def _copy_run_properties(run: Any, properties: Any) -> None:
    if properties is not None:
        run._r.insert(0, copy.deepcopy(properties))


def _clear_paragraph_content(paragraph: Paragraph) -> None:
    for child in list(paragraph._p):
        if child.tag == qn("w:pPr"):
            continue
        paragraph._p.remove(child)


def _set_paragraph_text(paragraph: Paragraph, text: str, document: DocumentObject, *, code: bool = False) -> None:
    has_drawing = bool(paragraph._p.xpath(".//w:drawing"))
    if not text and has_drawing:
        return
    original = [_run_spec(run) for run in paragraph.runs]
    # Paragraph-wide direct formatting (colour, size, font) is kept as the base
    # for rebuilt runs; emphasis is owned by Markdown and never inherited.
    fallback = next((_base_run_properties(props) for value, props in original if value), None)
    _clear_paragraph_content(paragraph)
    spans = list(_iter_inline(text)) if not code else [(text, {"code": True})]
    cursor = 0
    for value, props in spans:
        matched = None
        for index in range(cursor, len(original)):
            if original[index][0] == value:
                matched = original[index][1]
                cursor = index + 1
                break
        run = paragraph.add_run()
        _copy_run_properties(run, matched if matched is not None else fallback)
        if props.get("code"):
            run.font.name = "Consolas"
        if props.get("bold"):
            run.bold = True
        if props.get("italic"):
            run.italic = True
        if props.get("underline"):
            run.underline = True
        pieces = value.split("\n")
        for index, piece in enumerate(pieces):
            if piece:
                run.add_text(piece)
            if index < len(pieces) - 1:
                run.add_break()


def _set_cell_text(cell: _Cell, text: str, document: DocumentObject) -> None:
    paragraphs = cell.paragraphs
    if paragraphs:
        _set_paragraph_text(paragraphs[0], text, document)
        for paragraph in paragraphs[1:]:
            p = paragraph._element
            p.getparent().remove(p)
    else:
        paragraph = cell.add_paragraph()
        _set_paragraph_text(paragraph, text, document)


def _table_text_grid(table: Table) -> list[list[str]]:
    return [["\n".join(p.text for p in cell.paragraphs) for cell in row.cells] for row in table.rows]


def _table_is_unchanged(table: Table, block: MarkdownBlock) -> bool:
    """True when the Markdown rows still mirror the template table exactly."""
    return _table_text_grid(table) == [list(row) for row in block.rows]


def _reset_table(table: Table, rows: list[list[str]], document: DocumentObject) -> None:
    target_cols = max((len(row) for row in rows), default=1)
    existing_cols = len(table.columns)
    if target_cols > existing_cols:
        # Add columns by cloning the last column's cell XML and grid definition.
        for _ in range(target_cols - existing_cols):
            last_grid = table._tbl.tblGrid.gridCol_lst[-1] if table._tbl.tblGrid.gridCol_lst else None
            if last_grid is not None:
                table._tbl.tblGrid.append(copy.deepcopy(last_grid))
            for row in table.rows:
                template_cell = row._tr.tc_lst[-1] if row._tr.tc_lst else None
                new_cell = copy.deepcopy(template_cell) if template_cell is not None else OxmlElement("w:tc")
                row._tr.append(new_cell)
    elif target_cols < existing_cols:
        for row in table.rows:
            cells = list(row._tr.tc_lst)
            for cell in cells[target_cols:]:
                row._tr.remove(cell)
        grid_cols = list(table._tbl.tblGrid.gridCol_lst)
        for grid_col in grid_cols[target_cols:]:
            table._tbl.tblGrid.remove(grid_col)

    while len(table.rows) < len(rows):
        table.add_row()
    while len(table.rows) > len(rows):
        table._tbl.remove(table.rows[-1]._tr)

    for row_index, values in enumerate(rows):
        row = table.rows[row_index]
        for col_index in range(target_cols):
            _set_cell_text(row.cells[col_index], values[col_index] if col_index < len(values) else "", document)


def _new_paragraph(document: DocumentObject) -> Paragraph:
    paragraph = document.add_paragraph()
    element = paragraph._element
    element.getparent().remove(element)
    return Paragraph(element, document._body)


def _new_table(document: DocumentObject, rows: list[list[str]]) -> Table:
    columns = max((len(row) for row in rows), default=1)
    table = document.add_table(rows=max(len(rows), 1), cols=columns)
    element = table._element
    element.getparent().remove(element)
    return Table(element, document._body)


def _apply_paragraph_block(paragraph: Paragraph, block: MarkdownBlock, document: DocumentObject) -> None:
    if _paragraph_is_unchanged(paragraph, block, document):
        return
    style = block.style
    if not _style_exists(document, style):
        if block.level:
            style = f"Heading {min(block.level, 9)}"
        elif block.list_type == "bullet":
            style = "List Bullet"
        elif block.list_type == "number":
            style = "List Number"
        else:
            style = "Normal"
    if _style_exists(document, style):
        paragraph.style = style
    if block.meta.get("page_break") and not block.text.strip():
        # Mirror the template's own form: a run holding an inline page break.
        _clear_paragraph_content(paragraph)
        run = paragraph.add_run()
        run.add_break(WD_BREAK.PAGE)
        return
    # False removes any direct override so the style-level setting applies again.
    paragraph.paragraph_format.page_break_before = True if block.meta.get("page_break") else None
    _set_paragraph_text(paragraph, block.text, document, code=bool(block.meta.get("code")))


def render_markdown_to_docx(template_path: str | Path, markdown: str, manifest_path: str | Path, output_path: str | Path) -> dict[str, Any]:
    """Render Markdown over a copy of the original DOCX template."""

    document = Document(str(template_path))
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    source_elements = _body_elements(document)
    source_by_id: dict[str, tuple[str, Any]] = {}
    for entry, element in zip(manifest.get("editable_blocks", []), source_elements):
        source_by_id[entry["id"]] = element

    blocks = parse_markdown_blocks(markdown)
    output_elements: list[Any] = []
    warnings: list[str] = []
    for block in blocks:
        if block.kind == "page_break":
            paragraph = _new_paragraph(document)
            paragraph.add_run().add_break(WD_BREAK.PAGE)
            output_elements.append(paragraph._element)
            continue
        source = source_by_id.get(block.block_id or "")
        if block.kind == "table":
            if source and source[0] == "table":
                table = source[1]
                if not _table_is_unchanged(table, block):
                    _reset_table(table, block.rows, document)
            else:
                table = _new_table(document, block.rows)
                warnings.append(f"Tabella nuova {block.block_id} usa la griglia del template solo quando disponibile.")
            output_elements.append(table._element)
        else:
            if source and source[0] == "paragraph":
                paragraph = source[1]
            else:
                paragraph = _new_paragraph(document)
            _apply_paragraph_block(paragraph, block, document)
            output_elements.append(paragraph._element)

    body = document.element.body
    sect_pr = body.sectPr
    for child in list(body):
        if child is not sect_pr:
            body.remove(child)
    for element in output_elements:
        body.insert(len(body) - (1 if body.sectPr is not None else 0), element)

    # Ask Word to refresh cached fields (TOC/PAGE/NUMPAGES) when the document opens.
    settings = document.settings.element
    update_fields = settings.find(qn("w:updateFields"))
    if update_fields is None:
        update_fields = OxmlElement("w:updateFields")
        settings.append(update_fields)
    update_fields.set(qn("w:val"), "true")

    document.save(str(output_path))
    return {"warnings": warnings, "blocks": len(blocks)}
