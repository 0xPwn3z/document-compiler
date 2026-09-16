"""Small filesystem-backed project store for the local MVP."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import uuid4

from .converter import docx_to_markdown

ID_RE = re.compile(r"^[a-f0-9]{12}$")


class ProjectStore:
    def __init__(self, root: str | Path):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _project_dir(self, project_id: str) -> Path:
        if not ID_RE.fullmatch(project_id):
            raise KeyError("invalid project id")
        path = (self.root / project_id).resolve()
        if self.root not in path.parents:
            raise KeyError("invalid project path")
        return path

    def create(self, filename: str, content: bytes) -> dict[str, Any]:
        project_id = uuid4().hex[:12]
        project_dir = self._project_dir(project_id)
        project_dir.mkdir(parents=True, exist_ok=False)
        template_path = project_dir / "template.docx"
        template_path.write_bytes(content)
        manifest = docx_to_markdown(template_path, project_dir / "working.md", project_dir / "manifest.json")
        now = datetime.now(timezone.utc).isoformat()
        metadata = {
            "id": project_id,
            "name": Path(filename).stem or "Documento senza nome",
            "source_filename": Path(filename).name,
            "created_at": now,
            "updated_at": now,
            "manifest": manifest,
        }
        self._write_json(project_dir / "metadata.json", metadata)
        return self.get(project_id)

    def get(self, project_id: str) -> dict[str, Any]:
        project_dir = self._project_dir(project_id)
        metadata = json.loads((project_dir / "metadata.json").read_text(encoding="utf-8"))
        metadata["markdown"] = (project_dir / "working.md").read_text(encoding="utf-8")
        metadata["has_export"] = (project_dir / "export.docx").exists()
        metadata["manifest"] = json.loads((project_dir / "manifest.json").read_text(encoding="utf-8"))
        return metadata

    def list(self) -> list[dict[str, Any]]:
        projects: list[dict[str, Any]] = []
        for path in sorted(self.root.iterdir(), key=lambda item: item.stat().st_mtime, reverse=True):
            if not path.is_dir() or not ID_RE.fullmatch(path.name):
                continue
            try:
                item = self.get(path.name)
                projects.append({key: item[key] for key in ("id", "name", "source_filename", "updated_at", "has_export")})
            except (OSError, ValueError, KeyError):
                continue
        return projects

    def save_markdown(self, project_id: str, markdown: str) -> dict[str, Any]:
        project_dir = self._project_dir(project_id)
        if not (project_dir / "metadata.json").exists():
            raise KeyError("project not found")
        (project_dir / "working.md").write_text(markdown, encoding="utf-8")
        metadata = json.loads((project_dir / "metadata.json").read_text(encoding="utf-8"))
        metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(project_dir / "metadata.json", metadata)
        return self.get(project_id)

    def export(self, project_id: str, markdown: str | None = None) -> tuple[Path, dict[str, Any]]:
        from .converter import render_markdown_to_docx

        project_dir = self._project_dir(project_id)
        if not (project_dir / "metadata.json").exists():
            raise KeyError("project not found")
        if markdown is None:
            markdown = (project_dir / "working.md").read_text(encoding="utf-8")
        (project_dir / "working.md").write_text(markdown, encoding="utf-8")
        metadata = json.loads((project_dir / "metadata.json").read_text(encoding="utf-8"))
        metadata["updated_at"] = datetime.now(timezone.utc).isoformat()
        self._write_json(project_dir / "metadata.json", metadata)
        output_path = project_dir / "export.docx"
        result = render_markdown_to_docx(project_dir / "template.docx", markdown, project_dir / "manifest.json", output_path)
        return output_path, result

    @staticmethod
    def _write_json(path: Path, value: Any) -> None:
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding="utf-8")
