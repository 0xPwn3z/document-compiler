"""Local web server for Document Compiler.

Run with:
    python -m app.main

The MVP deliberately binds to 127.0.0.1. Pen-test pre-engagement material can
contain client-sensitive information, so no remote exposure is enabled by
default.
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
from email import policy
from email.parser import BytesParser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from zipfile import BadZipFile, ZipFile

from .store import ProjectStore


def parse_header(value: str) -> tuple[str, dict[str, str]]:
    """Minimal replacement for cgi.parse_header (module removed in Python 3.13)."""
    parts = value.split(";")
    key = parts[0].strip()
    params: dict[str, str] = {}
    for part in parts[1:]:
        name, separator, parameter = part.partition("=")
        if not separator:
            continue
        parameter = parameter.strip()
        if len(parameter) >= 2 and parameter[0] == parameter[-1] and parameter[0] in ("'", '"'):
            parameter = parameter[1:-1]
        params[name.strip().lower()] = parameter
    return key, params


APP_ROOT = Path(__file__).resolve().parent.parent
STATIC_ROOT = APP_ROOT / "static"
DATA_ROOT = Path(os.environ.get("DOC_COMPILER_DATA", APP_ROOT / "data")).resolve()
MAX_UPLOAD_BYTES = 50 * 1024 * 1024
MAX_MARKDOWN_BYTES = 10 * 1024 * 1024
store = ProjectStore(DATA_ROOT / "projects")


def _valid_docx(data: bytes) -> tuple[bool, str]:
    if not data.startswith(b"PK"):
        return False, "Il file non sembra essere un archivio DOCX valido."
    try:
        with ZipFile(__import__("io").BytesIO(data)) as archive:
            names = set(archive.namelist())
            if "word/document.xml" not in names or "[Content_Types].xml" not in names:
                return False, "Il file non contiene una struttura Word DOCX completa."
            # Avoid expanding a hostile archive into the project store.
            if sum(max(info.file_size, 0) for info in archive.infolist()) > 250 * 1024 * 1024:
                return False, "Il DOCX supera il limite di contenuto espanso di 250 MB."
    except (BadZipFile, OSError):
        return False, "Il file DOCX è corrotto o non leggibile."
    return True, ""


def _safe_static_path(path: str) -> Path | None:
    relative = path.lstrip("/") or "index.html"
    candidate = (STATIC_ROOT / unquote(relative)).resolve()
    if STATIC_ROOT not in candidate.parents and candidate != STATIC_ROOT:
        return None
    if not candidate.is_file():
        return None
    return candidate


class AppHandler(BaseHTTPRequestHandler):
    server_version = "DocumentCompiler/0.1"

    def log_message(self, format: str, *args: object) -> None:
        print(f"[{self.log_date_time_string()}] {format % args}")

    def _send_json(self, value: object, status: int = HTTPStatus.OK) -> None:
        payload = json.dumps(value, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _error(self, message: str, status: int = HTTPStatus.BAD_REQUEST) -> None:
        self._send_json({"error": message}, status)

    def _read_body(self, limit: int) -> bytes | None:
        length_header = self.headers.get("Content-Length")
        try:
            length = int(length_header or 0)
        except ValueError:
            self._error("Content-Length non valido.", HTTPStatus.LENGTH_REQUIRED)
            return None
        if length > limit:
            self._error(f"Richiesta troppo grande. Limite: {limit // (1024 * 1024)} MB.", HTTPStatus.REQUEST_ENTITY_TOO_LARGE)
            return None
        return self.rfile.read(length)

    def _json_body(self) -> dict[str, object] | None:
        body = self._read_body(MAX_MARKDOWN_BYTES)
        if body is None:
            return None
        try:
            value = json.loads(body.decode("utf-8"))
            if not isinstance(value, dict):
                raise ValueError
            return value
        except (UnicodeDecodeError, json.JSONDecodeError, ValueError):
            self._error("JSON non valido.")
            return None

    def _project_id(self, path: str) -> str | None:
        match = re.fullmatch(r"/api/projects/([a-f0-9]{12})(?:/(download|export))?", path)
        return match.group(1) if match else None

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/health":
            self._send_json({"ok": True})
            return
        if path == "/api/projects":
            self._send_json({"projects": store.list()})
            return
        project_id = self._project_id(path)
        if project_id:
            if path.endswith("/download"):
                try:
                    output = store._project_dir(project_id) / "export.docx"
                    if not output.exists():
                        self._error("Esporta prima il documento.", HTTPStatus.NOT_FOUND)
                        return
                    data = output.read_bytes()
                    self.send_response(HTTPStatus.OK)
                    self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                    self.send_header("Content-Disposition", f'attachment; filename="{project_id}-document.docx"')
                    self.send_header("Content-Length", str(len(data)))
                    self.end_headers()
                    self.wfile.write(data)
                except KeyError:
                    self._error("Progetto non trovato.", HTTPStatus.NOT_FOUND)
                return
            try:
                self._send_json(store.get(project_id))
            except (KeyError, OSError, ValueError):
                self._error("Progetto non trovato.", HTTPStatus.NOT_FOUND)
            return
        if path.startswith("/api/"):
            self._error("Risorsa non trovata.", HTTPStatus.NOT_FOUND)
            return
        target = _safe_static_path(path)
        if target is None:
            self._error("Risorsa non trovata.", HTTPStatus.NOT_FOUND)
            return
        data = target.read_bytes()
        content_type = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", content_type + ("; charset=utf-8" if content_type.startswith("text/") else ""))
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/projects":
            content_type = self.headers.get("Content-Type", "")
            ctype, params = parse_header(content_type)
            if ctype != "multipart/form-data" or "boundary" not in params:
                self._error("Carica il DOCX come multipart/form-data.")
                return
            body = self._read_body(MAX_UPLOAD_BYTES)
            if body is None:
                return
            boundary = params["boundary"].encode("utf-8")
            try:
                parts = body.split(b"--" + boundary)
                filename = "template.docx"
                file_bytes: bytes | None = None
                for part in parts:
                    if b"Content-Disposition" not in part:
                        continue
                    header_bytes, separator, content = part.partition(b"\r\n\r\n")
                    if not separator:
                        continue
                    message = BytesParser(policy=policy.HTTP).parsebytes(header_bytes.strip() + b"\r\n\r\n")
                    if message.get_param("name", header="Content-Disposition") == "file":
                        filename = message.get_param("filename", header="Content-Disposition") or filename
                        file_bytes = content.rstrip(b"\r\n")
                        break
                if file_bytes is None:
                    raise ValueError("campo file mancante")
            except (ValueError, UnicodeDecodeError):
                self._error("Form di caricamento non valido.")
                return
            if not filename.lower().endswith(".docx"):
                self._error("Sono supportati solo file .docx.")
                return
            valid, reason = _valid_docx(file_bytes)
            if not valid:
                self._error(reason)
                return
            try:
                self._send_json(store.create(filename, file_bytes), HTTPStatus.CREATED)
            except Exception as exc:  # keep the local API response safe and useful
                self._error(f"Impossibile leggere il DOCX: {exc}", HTTPStatus.UNPROCESSABLE_ENTITY)
            return

        match = re.fullmatch(r"/api/projects/([a-f0-9]{12})/export", parsed.path)
        if match:
            payload = self._json_body()
            if payload is None:
                return
            markdown = payload.get("markdown")
            if markdown is not None and not isinstance(markdown, str):
                self._error("Il campo markdown deve essere una stringa.")
                return
            try:
                _, result = store.export(match.group(1), markdown)
                self._send_json({"download_url": f"/api/projects/{match.group(1)}/download", **result})
            except (KeyError, OSError, ValueError) as exc:
                self._error(f"Esportazione non riuscita: {exc}", HTTPStatus.UNPROCESSABLE_ENTITY)
            return
        self._error("Risorsa non trovata.", HTTPStatus.NOT_FOUND)

    def do_PUT(self) -> None:
        match = re.fullmatch(r"/api/projects/([a-f0-9]{12})/markdown", urlparse(self.path).path)
        if not match:
            self._error("Risorsa non trovata.", HTTPStatus.NOT_FOUND)
            return
        payload = self._json_body()
        if payload is None:
            return
        markdown = payload.get("markdown")
        if not isinstance(markdown, str):
            self._error("Il campo markdown deve essere una stringa.")
            return
        try:
            self._send_json(store.save_markdown(match.group(1), markdown))
        except (KeyError, OSError):
            self._error("Progetto non trovato.", HTTPStatus.NOT_FOUND)


def run() -> None:
    host = os.environ.get("DOC_COMPILER_HOST", "127.0.0.1")
    port = int(os.environ.get("DOC_COMPILER_PORT", "8765"))
    server = ThreadingHTTPServer((host, port), AppHandler)
    print(f"Document Compiler in ascolto su http://{host}:{port}")
    print(f"Dati locali in {DATA_ROOT}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nArresto del server.")
    finally:
        server.server_close()


if __name__ == "__main__":
    run()

