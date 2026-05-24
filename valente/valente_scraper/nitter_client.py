"""Cliente Nitter via Playwright.

Por que Playwright em vez de httpx puro?
    As instâncias Nitter públicas estão protegidas por Anubis (proof-of-work
    anti-bot em JS). Um navegador real resolve o challenge organicamente e
    persiste cookies — depois disso, navegações ficam rápidas.

Estratégia:
    - Pool de hosts (`NITTER_HOSTS`), tentados em ordem.
    - Um único browser/context por sessão (cookies do Anubis ficam vivos).
    - `fetch_profile(username, cursor)` retorna o HTML cru da página.
    - Em erro/timeout, marca o host como degradado e tenta o próximo.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from loguru import logger
from playwright.async_api import (
    Browser,
    BrowserContext,
    Page,
    Playwright,
    async_playwright,
)


# Lista de instâncias públicas saudáveis (manter sincronizada com status.d420.de).
NITTER_HOSTS = [
    "https://nuku.trabun.org",
    "https://nitter.tiekoetter.com",
    "https://nitter.privacyredirect.com",
    "https://nitter.poast.org",
    "https://nitter.space",
    "https://lightbrd.com",
    "https://nitter.net",
]

DEFAULT_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
)


@dataclass
class HostState:
    """Estado por host: contador de falhas pra rotação."""
    url: str
    failures: int = 0
    cookies_ok: bool = False


@dataclass
class FetchResult:
    """Resultado de uma busca de perfil."""
    host: str
    url: str
    html: str
    elapsed_s: float


class NitterClient:
    """Cliente Playwright com pool de hosts."""

    def __init__(
        self,
        hosts: list[str] | None = None,
        nav_timeout_ms: int = 45000,
        anubis_wait_ms: int = 30000,
        max_host_failures: int = 2,
        user_agent: str = DEFAULT_USER_AGENT,
    ):
        self.hosts: list[HostState] = [HostState(h) for h in (hosts or NITTER_HOSTS)]
        self.nav_timeout_ms = nav_timeout_ms
        self.anubis_wait_ms = anubis_wait_ms
        self.max_host_failures = max_host_failures
        self.user_agent = user_agent
        self._playwright: Playwright | None = None
        self._browser: Browser | None = None
        self._context: BrowserContext | None = None

    # --------------------------------------------------------------- lifecycle

    async def __aenter__(self) -> "NitterClient":
        await self.start()
        return self

    async def __aexit__(self, *exc):
        await self.close()

    async def start(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)
        self._context = await self._browser.new_context(
            user_agent=self.user_agent,
            locale="pt-BR",
            viewport={"width": 1280, "height": 800},
        )
        logger.info("Browser headless iniciado.")

    async def close(self) -> None:
        if self._context:
            await self._context.close()
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    # --------------------------------------------------------------- fetch

    async def fetch_profile(self, username: str, cursor: str | None = None) -> FetchResult:
        """Busca a timeline pública de `username`, opcionalmente em `cursor`.

        Tenta hosts em ordem. Levanta `RuntimeError` se todos falharem.
        """
        assert self._context, "Cliente não iniciado — use async with NitterClient() as c"

        last_error: Exception | None = None
        for host in self._healthy_hosts():
            path = f"/{username}"
            if cursor:
                path += f"?cursor={cursor}"
            url = host.url + path

            page: Page = await self._context.new_page()
            start = asyncio.get_event_loop().time()
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=self.nav_timeout_ms)
                await self._wait_past_anubis(page)

                # Sucesso esperado: a página tem .timeline-item OU .error-panel
                ok_or_empty = await page.evaluate(
                    "() => !!document.querySelector('.timeline, .error-panel, .profile-card')"
                )
                if not ok_or_empty:
                    raise RuntimeError(f"Nenhum marcador Nitter no HTML retornado por {host.url}")

                html = await page.content()
                elapsed = asyncio.get_event_loop().time() - start
                host.cookies_ok = True
                host.failures = 0
                logger.debug("[{}] OK em {:.1f}s ({} bytes)", host.url, elapsed, len(html))
                return FetchResult(host=host.url, url=url, html=html, elapsed_s=elapsed)

            except Exception as exc:
                host.failures += 1
                last_error = exc
                logger.warning("[{}] falha #{}: {}", host.url, host.failures, str(exc)[:120])
            finally:
                await page.close()

        raise RuntimeError(
            f"Todos os hosts Nitter falharam para @{username}: {last_error}"
        )

    # --------------------------------------------------------------- internals

    def _healthy_hosts(self) -> list[HostState]:
        """Hosts ainda elegíveis, priorizando os que já passaram pelo Anubis."""
        alive = [h for h in self.hosts if h.failures < self.max_host_failures]
        # Cookies já validados primeiro (evita re-pagar PoW).
        alive.sort(key=lambda h: (not h.cookies_ok, h.failures))
        return alive

    async def _wait_past_anubis(self, page: Page) -> None:
        """Espera o redirect/JS do Anubis terminar. Heurística: título não tem 'not a bot'."""
        try:
            await page.wait_for_function(
                "document.title && !document.title.toLowerCase().includes('not a bot') "
                "&& !document.title.toLowerCase().includes('verifying')",
                timeout=self.anubis_wait_ms,
            )
        except Exception:
            # Se já chegou direto na timeline, segue.
            pass
        # Espera o conteúdo do Nitter aparecer (ou erro)
        try:
            await page.wait_for_selector(
                ".timeline, .profile-card, .error-panel",
                timeout=15000,
            )
        except Exception:
            pass
