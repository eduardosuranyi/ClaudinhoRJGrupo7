"""Scraper de notícias — Extra (Globo) e suporte para outros portais.

Por que precisamos disso:
    Nitter público entrega ~40 tweets/perfil (cap da X guest API). Para
    construir um dataset histórico denso sobre roubo/furto no RJ, sites
    de notícia jornalística são uma fonte alternativa viável: cobrem
    o mesmo domínio (criminalidade carioca), têm HTML estático e estão
    indexados há anos.

Limitação conhecida do Extra (e Globo em geral):
    Listagens usam scroll infinito via JS. Sem Playwright, pegamos só a
    primeira "leva" (~16 artigos). Mitigação: depois de baixar cada
    artigo, seguimos os links "Veja também" / "Leia mais" no rodapé
    para expandir o conjunto (BFS limitado por --max).

Output JSONL é alinhado ao schema esperado por
`valente_ontology/loaders/news.py` — o loader downstream consome direto:

    {
      "article_id": "<sha1 do canonical url>",
      "url": "...", "domain": "...", "published_at": "ISO8601",
      "fetched_at": "ISO8601", "title": "...", "subtitle": "...",
      "body_text": "...", "author": "...", "section": "...",
      "tags": [...]
    }
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Iterator
from urllib.parse import urljoin, urlparse

import httpx
from loguru import logger
from selectolax.parser import HTMLParser

from .config import Settings


# ─────────────────────────────────────────────────────────────────────────
# Modelo (Pydantic seria overkill aqui — dict é suficiente para JSONL)
# ─────────────────────────────────────────────────────────────────────────


_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


def _make_article_id(url: str) -> str:
    """SHA1 do URL canônico — ID estável para dedupe entre execuções."""
    return hashlib.sha1(url.encode("utf-8")).hexdigest()[:16]


def _canonical_url(url: str) -> str:
    """Remove query strings de tracking. Mantém path."""
    p = urlparse(url)
    return f"{p.scheme}://{p.netloc}{p.path}"


# ─────────────────────────────────────────────────────────────────────────
# Storage
# ─────────────────────────────────────────────────────────────────────────


class NewsStore:
    """JSONL append-only por slug do portal. Dedupe por article_id."""

    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def path_for(self, slug: str) -> Path:
        return self.base_dir / f"{slug}.jsonl"

    def existing_ids(self, slug: str) -> set[str]:
        p = self.path_for(slug)
        if not p.exists():
            return set()
        out: set[str] = set()
        with p.open("r", encoding="utf-8") as fh:
            for line in fh:
                try:
                    out.add(json.loads(line)["article_id"])
                except (json.JSONDecodeError, KeyError):
                    continue
        return out

    def existing_urls(self, slug: str) -> set[str]:
        p = self.path_for(slug)
        if not p.exists():
            return set()
        urls: set[str] = set()
        with p.open("r", encoding="utf-8") as fh:
            for line in fh:
                try:
                    urls.add(json.loads(line).get("url", ""))
                except json.JSONDecodeError:
                    continue
        return {u for u in urls if u}

    def append(self, slug: str, article: dict) -> bool:
        known = self.existing_ids(slug)
        if article["article_id"] in known:
            return False
        with self.path_for(slug).open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(article, ensure_ascii=False) + "\n")
        return True


# ─────────────────────────────────────────────────────────────────────────
# Parser Extra (Globo)
# ─────────────────────────────────────────────────────────────────────────


_EXTRA_DATE_RE = re.compile(r"(\d{2})/(\d{2})/(\d{4})\s+(\d{2})h(\d{2})")
_EXTRA_AUTHOR_RE = re.compile(r"Por\s+([^—\d]+?)(?:—|\d|$)")


def parse_extra_article(html: str, url: str) -> dict | None:
    """Parseia um artigo do Extra. Retorna dict no schema do NewsLoader.

    None se a página é 404 / template de erro / sem conteúdo.
    """
    tree = HTMLParser(html)
    title_el = tree.css_first("h1.content-head__title")
    if not title_el:
        return None
    title = title_el.text(strip=True)
    if not title or "Desculpe-nos" in title or "Ops" in title:
        return None

    subtitle_el = tree.css_first("h2.content-head__subtitle")
    subtitle = subtitle_el.text(strip=True) if subtitle_el else ""

    # Body — concatena parágrafos. `article p` cobre o template padrão Globo.
    paragraphs = [p.text(strip=True) for p in tree.css("article p")]
    paragraphs = [p for p in paragraphs if p and len(p) > 1]
    body_text = "\n\n".join(paragraphs)

    # Autor e data — string "Por EXTRA— Rio de Janeiro23/05/2026 15h35..."
    pub_data_el = tree.css_first(".content-publication-data")
    pub_text = pub_data_el.text(strip=True) if pub_data_el else ""

    author = None
    m = _EXTRA_AUTHOR_RE.search(pub_text)
    if m:
        author = m.group(1).strip(" —")

    published_at = None
    m = _EXTRA_DATE_RE.search(pub_text)
    if m:
        dd, mm, yyyy, hh, mi = m.groups()
        try:
            published_at = datetime(int(yyyy), int(mm), int(dd), int(hh), int(mi)).isoformat()
        except ValueError:
            pass

    # Section — articleSection vem como múltiplas tags hierárquicas
    sections = [
        meta.attributes.get("content", "")
        for meta in tree.css('meta[itemprop="articleSection"]')
        if meta.attributes.get("content")
    ]
    section = " > ".join(sections) if sections else None

    # Tags — Globo não expõe consistentemente; ficamos com vazio por enquanto
    tags: list[str] = []

    cu = _canonical_url(url)
    return {
        "article_id": _make_article_id(cu),
        "url": cu,
        "domain": urlparse(cu).netloc,
        "published_at": published_at,
        "fetched_at": datetime.utcnow().isoformat() + "Z",
        "title": title,
        "subtitle": subtitle,
        "body_text": body_text,
        "author": author,
        "section": section,
        "tags": tags,
    }


def extract_extra_listing_urls(html: str) -> list[str]:
    """Extrai URLs únicas de artigo da página de listagem do Extra."""
    tree = HTMLParser(html)
    seen: list[str] = []
    seen_set: set[str] = set()
    for a in tree.css("a[href]"):
        href = a.attributes.get("href") or ""
        if not href.endswith(".ghtml"):
            continue
        if "/casos-de-policia/" not in href:
            continue
        if not href.startswith("http"):
            href = urljoin("https://extra.globo.com/", href)
        cu = _canonical_url(href)
        if cu in seen_set:
            continue
        seen_set.add(cu)
        seen.append(cu)
    return seen


def extract_related_links(html: str, base_url: str) -> list[str]:
    """Pega URLs internas no body do artigo (Globo tem 'Leia também' inline)."""
    tree = HTMLParser(html)
    out: list[str] = []
    seen: set[str] = set()
    for a in tree.css("article a[href], .content-text a[href]"):
        href = a.attributes.get("href") or ""
        if not href.endswith(".ghtml"):
            continue
        # mantém só Casos de Polícia para não escopo-creep
        if "/casos-de-policia/" not in href:
            continue
        if not href.startswith("http"):
            href = urljoin(base_url, href)
        cu = _canonical_url(href)
        if cu in seen or cu == _canonical_url(base_url):
            continue
        seen.add(cu)
        out.append(cu)
    return out


# ─────────────────────────────────────────────────────────────────────────
# Crawler
# ─────────────────────────────────────────────────────────────────────────


# Definição de portais. Adicionar novos = entry aqui + parser dedicado se
# o HTML for diferente.
PORTALS = {
    "extra": {
        "slug": "extra",
        "list_url": "https://extra.globo.com/casos-de-policia/",
        "list_extractor": extract_extra_listing_urls,
        "article_parser": parse_extra_article,
        "related_extractor": extract_related_links,
    },
}


class NewsCrawler:
    """Crawler de notícia — listagem inicial + BFS por 'leia também'."""

    def __init__(
        self,
        store: NewsStore,
        settings: Settings,
        portal: str = "extra",
    ):
        self.store = store
        self.settings = settings
        portal_cfg = PORTALS.get(portal)
        if not portal_cfg:
            raise ValueError(f"Portal desconhecido: {portal}. Conhecidos: {list(PORTALS)}")
        self.portal = portal_cfg

    async def crawl(self, max_articles: int) -> dict:
        """Retorna sumário {fetched, new, errors, bytes}."""
        slug = self.portal["slug"]
        known_urls = self.store.existing_urls(slug)
        known_ids = self.store.existing_ids(slug)

        logger.info(
            "[news/{}] Iniciando — já_no_jsonl={} max={}",
            slug, len(known_ids), max_articles,
        )

        async with httpx.AsyncClient(
            timeout=20.0,
            headers={"User-Agent": _USER_AGENT, "Accept": "text/html,*/*"},
            follow_redirects=True,
        ) as client:
            # 1) Listagem
            try:
                resp = await client.get(self.portal["list_url"])
                resp.raise_for_status()
                listing_urls = self.portal["list_extractor"](resp.text)
                logger.info(
                    "[news/{}] listagem: {} URLs candidatas",
                    slug, len(listing_urls),
                )
            except Exception as exc:
                logger.error("[news/{}] Falha na listagem: {}", slug, exc)
                return {"fetched": 0, "new": 0, "errors": 1}

            # 2) BFS — fila começa com TODA a listagem (conhecidos inclusive),
            # porque a expansão por "leia também" depende de visitar artigos
            # mesmo que já estejam no JSONL.
            queue: list[str] = list(listing_urls)
            seen_in_run: set[str] = set(queue)
            fetched = 0
            new_count = 0
            errors = 0

            while queue and new_count < max_articles:
                url = queue.pop(0)
                is_known = url in known_urls
                try:
                    resp = await client.get(url)
                    if resp.status_code != 200:
                        continue
                    fetched += 1

                    # Para URLs já no JSONL, pulamos parsing/append mas ainda
                    # extraímos related links — é como a BFS continua.
                    if not is_known:
                        article = self.portal["article_parser"](resp.text, url)
                        if article is not None and self.store.append(slug, article):
                            new_count += 1
                            if new_count % 5 == 0:
                                logger.info(
                                    "[news/{}] novos={} fila={} fetched={}",
                                    slug, new_count, len(queue), fetched,
                                )

                    related = self.portal["related_extractor"](resp.text, url)
                    for r in related:
                        if r not in seen_in_run:
                            seen_in_run.add(r)
                            queue.append(r)

                    await asyncio.sleep(self.settings.valente_rate_limit_sleep)
                except Exception as exc:
                    errors += 1
                    logger.debug("[news/{}] erro em {}: {}", slug, url[:80], exc)
                    continue

        logger.success(
            "[news/{}] Concluído: novos={} fetched={} erros={}",
            slug, new_count, fetched, errors,
        )
        return {"fetched": fetched, "new": new_count, "errors": errors}


def iter_news_jsonl(path: Path) -> Iterator[dict]:
    """Helper para CLI/inspeção do JSONL produzido."""
    if not path.exists():
        return
    with path.open("r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                yield json.loads(line)
            except json.JSONDecodeError:
                continue
