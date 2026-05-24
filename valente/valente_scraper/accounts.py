"""Carregamento da lista de contas alvo a partir de `accounts.txt`."""

from __future__ import annotations

from pathlib import Path


def load_accounts(path: Path | str) -> list[str]:
    """Lê arquivo `accounts.txt`, ignorando comentários (#) e linhas vazias."""
    path = Path(path)
    if not path.exists():
        raise FileNotFoundError(f"accounts file não encontrado: {path}")

    out: list[str] = []
    seen: set[str] = set()
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        # Aceita "@usuario" ou "usuario"
        username = line.lstrip("@").split()[0]
        if username.lower() in seen:
            continue
        seen.add(username.lower())
        out.append(username)
    return out
