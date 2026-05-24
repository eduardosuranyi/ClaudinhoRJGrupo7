# valente — Scrapper X/Twitter para roubo e furto no RJ

Extrai postagens textuais de um conjunto de contas X/Twitter e salva como
dataset bruto. Foco: relatos/alertas sobre roubo e furto no Rio de Janeiro.

> Este módulo cuida **somente da extração**. Filtragem por relevância,
> geocoding, NER e enriquecimento ficam para a pipeline downstream.

## Como funciona (curto)

```
[Playwright headless] -> [instância Nitter] -> [HTML estático] -> [parser] -> JSONL
```

- Não acessamos X.com diretamente (anti-bot de 2024+ tornou inviável sem API paga).
- Usamos **instâncias Nitter públicas** (frontend open-source que renderiza X em HTML simples).
- Cada instância tem **Anubis** (proof-of-work anti-bot). Playwright executa o JS do desafio organicamente — é apenas um navegador real visitando a página.
- Pool de instâncias com failover: se uma cair, troca para a próxima.
- Cookies do Anubis persistem na sessão do browser → primeira página ~5s, demais ~2s.

## Arquitetura

```
valente/
├── valente_scraper/
│   ├── config.py           # Settings (pydantic) lidas de .env
│   ├── models.py           # RawTweet — schema do JSONL
│   ├── nitter_client.py    # Playwright + pool de hosts Nitter
│   ├── nitter_parser.py    # HTML → RawTweet
│   ├── storage.py          # JSONL append-only + checkpoint
│   ├── extractor.py        # Paginação por cursor, dedupe, caught-up
│   ├── accounts.py         # Loader do accounts.txt
│   └── main.py             # CLI (typer)
├── accounts.txt            # Contas alvo (editar à vontade)
└── data/
    ├── raw/{user}.jsonl    # 1 tweet por linha
    └── state/{user}.json   # Checkpoint (último tweet visto)
```

## Setup

```powershell
cd valente
uv sync                                # instala deps Python
uv run playwright install chromium     # baixa Chromium (~150 MB)
```

Não precisa de credenciais X/Twitter. **Não copie nem preencha o `.env`** — só
existe para overrides opcionais de paths/limites.

## Uso

> Use `uv run` na frente dos comandos (ou ative o venv com `.venv\Scripts\Activate.ps1`).

```powershell
# Listar contas configuradas
uv run python -m valente_scraper.main accounts

# Extrair tudo do accounts.txt
uv run python -m valente_scraper.main run

# Apenas uma conta
uv run python -m valente_scraper.main run --user PMERJ

# Limitar volume por conta
uv run python -m valente_scraper.main run --max 100

# Verboso (logs DEBUG)
uv run python -m valente_scraper.main run -v
```

Re-execuções são **incrementais**: o scrapper detecta "caught up" quando uma
página inteira já está no JSONL e para.

## Output

`data/raw/{username}.jsonl` — uma linha JSON por tweet:

| Campo | Tipo | Descrição |
|---|---|---|
| `tweet_id` | str | ID único |
| `account` | str | Conta consultada |
| `author_username` | str | Quem postou (≠ account em RT) |
| `author_display_name` | str | Nome de exibição |
| `text` | str | Texto completo |
| `created_at` | iso8601 | Timestamp do tweet |
| `scraped_at` | iso8601 | Quando foi extraído |
| `is_retweet` / `is_reply` / `is_quote` | bool | Flags estruturais |
| `reply_to_username` | str? | Se reply, para quem |
| `retweet_count` / `favorite_count` / `reply_count` / `quote_count` / `view_count` | int | Métricas |
| `hashtags` | list[str] | Sem `#` |
| `mentioned_users` | list[str] | Sem `@` |
| `urls` | list[str] | Apenas links em texto (sem mídia) |
| `source_url` | str | `https://x.com/{user}/status/{id}` |

## Limitações conhecidas

- **Velocidade**: ~2-5 tweets/s. Suficiente para o domínio (centenas/conta), não para milhões.
- **Sem `view_count` em RTs**: Nitter não expõe métricas do tweet original em retweets.
- **Sem replies completos**: a opção do Nitter para incluir replies traz threads inteiras (ruído alto). Mantemos só originais + RTs.
- **Volatilidade das instâncias**: a lista em `nitter_client.py:NITTER_HOSTS` pode envelhecer. Se muitas falharem, ver https://status.d420.de e atualizar.
- **`author_id` e `lang` sempre `None`**: o HTML do Nitter não expõe esses campos. Resolvíveis na transformação.

## Próximos passos (fora deste módulo)

1. Filtro de relevância (regex/keywords de roubo, furto, bairros RJ)
2. Extração de localização (NER + geocoding contra base de logradouros)
3. Classificação MO (modus operandi) — provavelmente em `pipeline/llm.py` do `luiz/`
4. Merge com o dataset principal (`compstat/`)
