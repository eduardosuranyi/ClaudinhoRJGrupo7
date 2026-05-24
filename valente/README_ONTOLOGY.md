# valente_ontology — Pipeline ontológica de incidências criminais

Pipeline alternativa à do `luiz/`. Em vez de calcular um score por **contagem
por logradouro** (Bingo Score), aqui o objetivo é **estruturar cada evento
criminal como composição ontológica** (vítima, agente, veículo, arma, item,
ambiente, abordagem, fuga, desfecho) — e só depois, em cima desse dado
estruturado, calcular o score (TODO em `score.py`).

```
INPUT (não estruturado)         PROCESSAMENTO (ontologia)         OUTPUT (estruturado)
─────────────────────────       ──────────────────────────        ─────────────────────
df_ocorrencias_tratado.csv ───┐
disk_denuncia.csv          ───┤
relints/*.docx             ───┼──► loaders/* ─► extractors/* ─► data/ontology/crime_events.jsonl
data/raw/*.jsonl (tweets)  ───┤                     │
data/news_raw/*.jsonl      ───┤            ┌────────┴────────┐
data/fm_actions/...        ───┘            │ structured.py   │ ← CSV → CrimeEvent (sem LLM)
                                           │ llm.py (Claude) │ ← texto livre → CrimeEvent
                                           └─────────────────┘
                                                     │
                                                     ▼
                                                 score.py (TODO)
```

## Arquitetura

```
valente/valente_ontology/
├── enums.py            # Vocabulário controlado (CrimeType, DayPart, VehicleType, MOTactic, …)
├── entities.py         # Pydantic: Victim, Agent, Vehicle, Weapon, StolenItem,
│                       #           TemporalContext, SpatialContext, EnvironmentalContext,
│                       #           ApproachMode, EscapeMode, Outcome, ModusOperandi
├── ontology.py         # Pydantic: CrimeEvent (raiz) + SourceMetadata + ExtractionMetadata
├── config.py           # Settings (lê .env, paths do CompStat, chave Anthropic)
├── loaders/
│   ├── base.py         # RawSource — pacote entregue do loader ao extractor
│   ├── compstat.py     # OcorrenciasLoader, DisqueDenunciaLoader + tabelas de contexto
│   ├── relints.py      # RelintLoader (chunking de .docx)
│   ├── tweets.py       # TweetLoader (JSONL do valente_scraper)
│   ├── news.py         # NewsLoader (ESQUELETO — não usado ainda)
│   └── fm_actions.py   # FMActionLoader + FMAction (histórico de ações da FM)
├── extractors/
│   ├── base.py         # Extractor (Protocol)
│   ├── structured.py   # Mapper determinístico CSV → CrimeEvent (sem LLM)
│   ├── llm.py          # Claude → CrimeEvent (com prompt caching)
│   └── prompts.py      # System prompt com ontologia + user prompt
├── storage.py          # JSONL append-only, dedupe por event_id determinístico
├── pipeline.py         # Orquestrador (run_ocorrencias, run_disque, run_relints, …, run_all)
├── score.py            # PLACEHOLDER
└── cli.py              # typer
```

## A ontologia

Um `CrimeEvent` é a composição de:

| Faceta | Entidade | O que captura |
|---|---|---|
| Quem foi alvo? | `victims: list[Victim]` | gênero, faixa etária, item exposto antes, reação, ferimento, ocupação |
| Quem agiu? | `agents: list[Agent]` | idade aprox., altura, build, cor da pele, vestimenta, acessórios, marcas distintivas, papel |
| Como se moveu? | `vehicles: list[Vehicle]` | tipo (moto/carro/a pé/transporte coletivo/...), papel (chegada/fuga/alvo), placa, cor, modelo |
| Com o quê? | `weapons: list[Weapon]` | tipo (fogo/branca/contundente/simulacro/...), exibida vs. usada |
| O que levou? | `stolen_items: list[StolenItem]` | celular, celular_desbloqueado (importante!), conta_acessada, cartão, joia, veículo, etc. |
| Quando? | `temporal: TemporalContext` | data, hora (0–23), daypart, dia útil/fim-de-semana, horário de pico, coincidência com troca de patrulha |
| Onde? | `spatial: SpatialContext` | endereço, logradouro, altura, bairro, área FM, AISP, lat/lon, venue (calçada/dentro de estabelecimento/estação metrô/...) |
| Sob que condições? | `environment: EnvironmentalContext` | fatores urbanos (iluminação/vegetação/lixo/...), tráfego pedestre, tráfego veicular, iluminação, patrulha presente/recém-saída, câmera presente |
| Como começou? | `approach: ApproachMode` | surpresa por trás, anúncio verbal, cerco, sequestro relâmpago, arrastão, ataque direto, ... |
| Como fugiu? | `escape: EscapeMode` | a pé, veículo, transporte coletivo, pulou muro, entrou na mata, misturou na multidão, ... |
| Modo de operar | `modus_operandi.tactics` | multi-tag: ameaça verbal, disparo arma fogo, facada, perseguição, arrastão, golpe bancário, ... |
| Desfecho | `outcome` | consumado / fracassado / agente preso / agente neutralizado |

**Regra-chave**: todo campo de enum tem um valor `desconhecido`/`desconhecida`.
A pipeline **nunca chuta** — quando o texto-fonte não diz, marca explicitamente
como desconhecido. Listas vazias `[]` significam "confirmadamente ausente",
diferente de `null` ("não consta").

## Identidade dos eventos

Cada `CrimeEvent` recebe um `event_id` derivado deterministicamente:

```python
event_id = sha1(f"{source.kind}:{source.source_id}")[:16]
```

Isso garante:

- **Idempotência**: rerodar a pipeline não duplica eventos.
- **Re-extração não-destrutiva**: se a ontologia evoluir e re-extrairmos a
  mesma fonte, o mesmo `event_id` permite `upsert()` no JSONL.
- **Trilha de fusão**: quando uma etapa downstream identificar que dois
  `event_id` distintos descrevem a mesma ocorrência real (ex.: oficial +
  tweet), preenche `related_event_ids` em ambos sem mesclar destrutivamente.

## Extração — três modos

| Modo | Fontes | Como funciona |
|---|---|---|
| `STRUCTURED_MAPPER` | ocorrências oficiais | Campos da linha CSV mapeiam direto na ontologia. Sem LLM, sem custo. |
| `LLM_FREE_TEXT` | tweets, RELINTs, notícias | Claude recebe o texto + dicas estruturadas do loader e devolve JSON conforme a ontologia. System prompt cacheado. |
| `HYBRID` | Disque Denúncia | Campos `envolvidos.*` viram Agent estruturado; depois o LLM lê `relato_redacted` e PREENCHE os campos que ficaram desconhecidos (sem sobrescrever os já preenchidos). |

## Como rodar

### Setup

```powershell
cd valente
uv sync                                  # instala deps (incluindo anthropic, python-docx)
echo "ANTHROPIC_API_KEY=sk-ant-..." >> .env
```

Por padrão, o módulo aponta para `../claude_impact_lab_compstat_rio/`.
Override via `.env`:

```dotenv
COMPSTAT_DATA_DIR=C:\Workspaces\dev\hackathon\claude_impact_lab_compstat_rio
```

### Comandos

```powershell
# Schema da ontologia (debug)
uv run python -m valente_ontology.cli schema | head -80

# Extrai só ocorrências oficiais (CSV → JSONL, sem LLM, sem custo de API)
uv run python -m valente_ontology.cli extract ocorrencias --limit 100

# Disque Denúncia em modo híbrido (estruturado + LLM)
uv run python -m valente_ontology.cli extract disque --limit 50

# RELINTs (LLM puro)
uv run python -m valente_ontology.cli extract relints

# Tweets coletados pelo scraper irmão
uv run python -m valente_ontology.cli extract tweets

# Tudo de uma vez
uv run python -m valente_ontology.cli extract all

# Stats do JSONL canônico
uv run python -m valente_ontology.cli stats

# Cria exemplo de ação FM (input do loop de feedback)
uv run python -m valente_ontology.cli init-fm-actions
```

### Modo offline (sem API)

Se `ANTHROPIC_API_KEY` não estiver setada, o LLM extractor vira um **stub
silencioso** que devolve `CrimeEvent` vazio com `crime_type=desconhecido`
e `extraction.confidence=0`. Isso permite rodar o pipeline em CI/dev sem
gastar tokens. Apenas `ocorrencias` produz resultado útil nesse modo.

## Output

```
valente/data/ontology/crime_events.jsonl
```

Uma linha JSON por `CrimeEvent`. Use `EventStore` para ler programaticamente:

```python
from valente_ontology.storage import EventStore
from valente_ontology.config import settings

store = EventStore(settings.crime_events_path)
for ev in store.iter_events():
    if ev.outcome.status.value == "consumado" and any(w.type.value == "arma_fogo" for w in ev.weapons):
        print(ev.event_id, ev.spatial.logradouro)
```

## Loop com Força Municipal

Eventualmente o sistema precisa **aprender com as ações da FM**. O loader
`fm_actions.py` define `FMAction`:

```jsonc
{
  "action_id": "FM-2026-0042",
  "area_fm": "Presidente Vargas - Campo de Santana - ...",
  "logradouro": "AVENIDA PRESIDENTE VARGAS",
  "action_type": "reparo_iluminacao",
  "executed_at_start": "2026-05-02",
  "executed_at_end": "2026-05-31",
  "rationale_text": "Top Bingo da área. Combo: iluminação + vegetação.",
  "target_factor_tags": ["iluminacao_deficiente", "vegetacao_cobrindo_iluminacao"],
  "target_crime_types": ["roubo_transeunte"],
  "observed_effect_text": "Queda 24% no período; migração para Rua X",
  "observed_event_id_deltas": {"roubo_transeunte": -12}
}
```

Quando `score.py` for implementado, ele lê tanto `crime_events.jsonl`
quanto `fm_actions.jsonl` e ajusta pesos da fórmula com base no que
funcionou (queda de eventos no logradouro alvo) vs. o que apenas
deslocou (migração para logradouro vizinho).

## TODO

- [ ] `score.py` — definir fórmula. Ver docstring lá para roadmap.
- [ ] Crawler de notícias (apenas `schema` definido em `loaders/news.py`).
- [ ] Etapa de fusão cross-source (`related_event_ids`).
- [ ] Migração JSONL → Parquet/DuckDB quando volume > 100k eventos.
- [ ] Avaliação humana de extrações LLM (sample N por dia, gold set).
