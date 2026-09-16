# Contributing to Document Compiler

Thanks for considering a contribution!

## Development setup

```bash
git clone https://github.com/0xPwn3z/document-compiler.git
cd document-compiler
python -m pip install -r requirements.txt -r requirements-dev.txt
python -m app.main          # http://127.0.0.1:8765 (build the frontend first, see README)
```

## Before opening a pull request

Run the full check suite locally — CI runs the same commands:

```bash
python -m unittest discover -s tests -v   # Python suite
ruff check app tests                      # lint

# frontend
cd frontend && npm ci && npm run lint && npm test && npm run build
```

## Guidelines

- **Keep the template-fidelity guarantee.** The core invariant is: unedited
  blocks export byte-for-byte identical to the template. Changes to
  `app/converter.py` must be covered by tests, and any intentional fidelity
  trade-off must be called out in the pull request description.
- **Keep `dc:*` marker semantics stable.** The marker JSON is a persistence
  format; changing its shape requires a migration note in the README.
- **No secrets, no client data.** Never commit anything under `data/`, test
  fixtures derived from real engagements, or credentials.
- Keep the UI consistent with `DESIGN.md`.

## Reporting bugs

Open an issue with: the template characteristics that trigger the bug (you can
strip real content), the Markdown you edited, and the unexpected output.
For security issues, follow [`SECURITY.md`](SECURITY.md) instead.

## Licensing

By contributing, you agree that your contributions are licensed under the
Apache License 2.0, the project's license.
