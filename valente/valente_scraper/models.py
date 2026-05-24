"""Modelos de dados do scrapper.

`RawTweet` é o registro persistido em JSONL. Mantém só campos de texto/metadado
relevantes para a etapa de transformação. Mídia (imagens/vídeos) é ignorada.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RawTweet(BaseModel):
    """Tweet bruto extraído. Schema estável para o JSONL."""

    # --- Identificadores ---
    tweet_id: str
    account: str = Field(description="Username consultado (sem @)")
    author_username: str = Field(description="Username de quem postou — pode diferir em RT")
    author_id: str | None = None
    author_display_name: str | None = None

    # --- Conteúdo ---
    text: str = Field(description="Texto completo do tweet (full_text)")
    lang: str | None = None

    # --- Timestamps ---
    created_at: datetime
    scraped_at: datetime

    # --- Classificação estrutural ---
    is_retweet: bool = False
    is_reply: bool = False
    is_quote: bool = False
    reply_to_tweet_id: str | None = None
    reply_to_username: str | None = None
    quoted_tweet_id: str | None = None
    retweeted_tweet_id: str | None = None

    # --- Métricas ---
    retweet_count: int = 0
    favorite_count: int = 0
    reply_count: int = 0
    quote_count: int = 0
    view_count: int | None = None

    # --- Entidades textuais ---
    hashtags: list[str] = Field(default_factory=list)
    mentioned_users: list[str] = Field(default_factory=list)
    urls: list[str] = Field(default_factory=list)

    # --- Origem ---
    source_url: str | None = None

    def to_jsonl_line(self) -> str:
        return self.model_dump_json(exclude_none=False)

    @classmethod
    def from_twikit(cls, tweet: Any, account: str) -> "RawTweet":
        """Mapeia um objeto `twikit.Tweet` para `RawTweet`.

        Resolve RT/quote pegando o tweet aninhado quando existe, mas guarda
        os IDs originais para auditoria.
        """
        retweeted = getattr(tweet, "retweeted_tweet", None)
        quoted = getattr(tweet, "quote", None) or getattr(tweet, "quoted_tweet", None)

        # Para RT, o texto útil é o do tweet original.
        source = retweeted or tweet

        user = getattr(source, "user", None)
        hashtags = [h.get("text") if isinstance(h, dict) else getattr(h, "text", str(h))
                    for h in (getattr(source, "hashtags", []) or [])]
        urls = []
        for u in (getattr(source, "urls", []) or []):
            if isinstance(u, dict):
                urls.append(u.get("expanded_url") or u.get("url"))
            else:
                urls.append(getattr(u, "expanded_url", None) or getattr(u, "url", None))
        urls = [u for u in urls if u]

        mentioned = []
        for m in (getattr(source, "mentioned_users", []) or []):
            name = getattr(m, "screen_name", None) or (m.get("screen_name") if isinstance(m, dict) else None)
            if name:
                mentioned.append(name)

        return cls(
            tweet_id=str(getattr(source, "id", getattr(tweet, "id"))),
            account=account,
            author_username=getattr(user, "screen_name", "") if user else "",
            author_id=str(getattr(user, "id", "")) if user else None,
            author_display_name=getattr(user, "name", None) if user else None,
            text=getattr(source, "full_text", None) or getattr(source, "text", ""),
            lang=getattr(source, "lang", None),
            created_at=_parse_dt(getattr(source, "created_at", None)),
            scraped_at=datetime.utcnow(),
            is_retweet=retweeted is not None,
            is_reply=bool(getattr(tweet, "in_reply_to", None)) or bool(getattr(tweet, "in_reply_to_status_id", None)),
            is_quote=quoted is not None,
            reply_to_tweet_id=str(getattr(tweet, "in_reply_to_status_id", "") or "") or None,
            reply_to_username=getattr(tweet, "in_reply_to", None),
            quoted_tweet_id=str(getattr(quoted, "id", "") or "") or None,
            retweeted_tweet_id=str(getattr(retweeted, "id", "") or "") or None,
            retweet_count=int(getattr(source, "retweet_count", 0) or 0),
            favorite_count=int(getattr(source, "favorite_count", 0) or 0),
            reply_count=int(getattr(source, "reply_count", 0) or 0),
            quote_count=int(getattr(source, "quote_count", 0) or 0),
            view_count=_safe_int(getattr(source, "view_count", None)),
            hashtags=[h for h in hashtags if h],
            mentioned_users=mentioned,
            urls=urls,
            source_url=_build_url(user, source),
        )


def _parse_dt(value: Any) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        # twikit costuma retornar "Wed Oct 10 20:19:24 +0000 2018"
        for fmt in ("%a %b %d %H:%M:%S %z %Y", "%Y-%m-%dT%H:%M:%S%z", "%Y-%m-%dT%H:%M:%SZ"):
            try:
                return datetime.strptime(value, fmt)
            except ValueError:
                continue
    return datetime.utcnow()


def _safe_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _build_url(user: Any, source: Any) -> str | None:
    if not user:
        return None
    screen = getattr(user, "screen_name", None)
    tid = getattr(source, "id", None)
    if screen and tid:
        return f"https://x.com/{screen}/status/{tid}"
    return None
