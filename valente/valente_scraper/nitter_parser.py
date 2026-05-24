"""Parser HTML do Nitter — extrai `RawTweet`s + cursor de paginação.

Tolerante: se um campo não existe na página (RT que sumiu, métrica zerada),
preenche com default em vez de quebrar.
"""

from __future__ import annotations

import re
from datetime import datetime
from urllib.parse import unquote

from loguru import logger
from selectolax.parser import HTMLParser, Node

from .models import RawTweet


_TWEET_ID_RE = re.compile(r"/status/(\d+)")
_DATE_FMTS = [
    "%b %d, %Y · %I:%M %p UTC",      # "May 24, 2026 · 3:21 PM UTC"
    "%b %d, %Y %I:%M %p UTC",
    "%b %d, %Y · %H:%M UTC",
]


def parse_timeline(html: str, account: str) -> tuple[list[RawTweet], str | None]:
    """Parseia uma página de timeline. Retorna (tweets, próximo_cursor)."""
    tree = HTMLParser(html)
    tweets: list[RawTweet] = []
    for item in tree.css(".timeline-item"):
        if item.css_first(".unavailable-box"):
            continue  # tweet indisponível / deletado
        try:
            tweets.append(_parse_item(item, account))
        except Exception as exc:
            logger.debug("[{}] Falha parseando item: {}", account, exc)
            continue

    cursor = _extract_cursor(tree)
    return tweets, cursor


def _parse_item(item: Node, account: str) -> RawTweet:
    # ID do tweet — vem do link "tweet-link"
    link = item.css_first(".tweet-link")
    href = link.attributes.get("href", "") if link else ""
    m = _TWEET_ID_RE.search(href)
    if not m:
        raise ValueError(f"href sem tweet_id: {href!r}")
    tweet_id = m.group(1)

    # Conteúdo de texto
    content_el = item.css_first(".tweet-content")
    text = content_el.text(deep=True, separator="", strip=False) if content_el else ""
    text = text.strip()

    # Autor
    fullname_el = item.css_first(".fullname")
    username_el = item.css_first(".username")
    author_display = fullname_el.text(strip=True) if fullname_el else None
    author_username = (
        username_el.text(strip=True).lstrip("@") if username_el else account
    )

    # Data — atributo `title` em <a> dentro de .tweet-date
    date_el = item.css_first(".tweet-date a")
    created_at = _parse_date(date_el.attributes.get("title") if date_el else None)

    # RT / reply / quote — estrutura do template oficial do Nitter
    is_retweet = item.css_first(".retweet-header") is not None
    is_reply = item.css_first(".replying-to") is not None
    is_quote = item.css_first(".quote") is not None

    reply_to_username = None
    if is_reply:
        rt_el = item.css_first(".replying-to a")
        if rt_el:
            reply_to_username = rt_el.text(strip=True).lstrip("@")

    # Métricas — .tweet-stats > .tweet-stat (ordem: reply, retweet, like, view, [quote])
    metrics = _parse_stats(item)

    # Entidades — extraídas dos links dentro de .tweet-content
    hashtags, mentions, urls = _extract_entities(content_el) if content_el else ([], [], [])

    source_url = f"https://x.com/{author_username}/status/{tweet_id}"

    return RawTweet(
        tweet_id=tweet_id,
        account=account,
        author_username=author_username,
        author_id=None,
        author_display_name=author_display,
        text=text,
        lang=None,
        created_at=created_at,
        scraped_at=datetime.utcnow(),
        is_retweet=is_retweet,
        is_reply=is_reply,
        is_quote=is_quote,
        reply_to_tweet_id=None,
        reply_to_username=reply_to_username,
        quoted_tweet_id=None,
        retweeted_tweet_id=None,
        retweet_count=metrics.get("retweet", 0),
        favorite_count=metrics.get("favorite", 0),
        reply_count=metrics.get("reply", 0),
        quote_count=metrics.get("quote", 0),
        view_count=metrics.get("view"),
        hashtags=hashtags,
        mentioned_users=mentions,
        urls=urls,
        source_url=source_url,
    )


def _parse_date(value: str | None) -> datetime:
    if not value:
        return datetime.utcnow()
    s = value.replace("\xa0", " ").strip()
    for fmt in _DATE_FMTS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    logger.debug("Data não parseada: {!r}", s)
    return datetime.utcnow()


def _parse_stats(item: Node) -> dict[str, int | None]:
    """Mapeia ícone → contador. Texto pode estar vazio (0), com 'K'/'M' (4.2K)."""
    out: dict[str, int | None] = {}
    icon_map = {
        "icon-comment": "reply",
        "icon-retweet": "retweet",
        "icon-heart": "favorite",
        "icon-views": "view",
        "icon-quote": "quote",
    }
    for stat in item.css(".tweet-stat"):
        # O <span class="icon-X"> está aninhado dentro de <div class="icon-container">,
        # então selecionamos o filho do container (não o próprio container).
        icon = stat.css_first(".icon-container > span")
        if not icon:
            continue
        cls = icon.attributes.get("class", "")
        key = next((v for k, v in icon_map.items() if k in cls), None)
        if not key:
            continue
        # O número vem como texto solto dentro do .icon-container, depois do span do ícone.
        raw_text = stat.text(strip=True)
        out[key] = _parse_count(raw_text)
    # Defaults
    for k in ("reply", "retweet", "favorite", "quote"):
        out.setdefault(k, 0)
    out.setdefault("view", None)
    return out


def _parse_count(s: str) -> int:
    s = (s or "").replace(",", "").strip()
    if not s:
        return 0
    mult = 1
    if s[-1].lower() == "k":
        mult = 1_000
        s = s[:-1]
    elif s[-1].lower() == "m":
        mult = 1_000_000
        s = s[:-1]
    try:
        return int(float(s) * mult)
    except ValueError:
        return 0


def _extract_entities(content: Node) -> tuple[list[str], list[str], list[str]]:
    hashtags: list[str] = []
    mentions: list[str] = []
    urls: list[str] = []
    for a in content.css("a"):
        href = a.attributes.get("href", "")
        text = a.text(strip=True)
        if not href:
            continue
        if "/search?" in href and "%23" in href:
            tag = text.lstrip("#")
            if tag:
                hashtags.append(tag)
        elif text.startswith("@"):
            mentions.append(text.lstrip("@"))
        elif href.startswith("http"):
            urls.append(href)
        elif href.startswith("/") and text.startswith("@"):
            mentions.append(text.lstrip("@"))
    return hashtags, mentions, urls


def _extract_cursor(tree: HTMLParser) -> str | None:
    """Cursor de paginação — `<div class="show-more"><a href="?cursor=...">`."""
    el = tree.css_first(".show-more a")
    if not el:
        return None
    href = el.attributes.get("href", "")
    m = re.search(r"cursor=([^&]+)", href)
    if not m:
        return None
    return unquote(m.group(1))
