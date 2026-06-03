# CompStat Rio — AI-Powered Public Safety Analytics

An end-to-end intelligence platform for Rio de Janeiro's Municipal Force (Força Municipal), built during the **Claude Impact Lab Rio** hackathon (May 2026). The system integrates 12 data sources, automates criminal analysis across 8 patrol areas, and generates actionable operational recommendations — reducing analyst work from hours to minutes.

---

## What It Does

The platform replaces manual spreadsheet analysis with an integrated workflow:

1. **Data pipeline** ingests crime records, anonymous tips, urban factors, service requests, and intelligence reports
2. **Scoring engine** cross-references three layers (crime hotspots + urban factors + criminal dynamics) to identify priority zones
3. **AI agent** navigates an interactive map with ~42 tools, investigates areas, and generates synthesized action plans
4. **Report generator** produces official CompStat `.docx` reports and dispatches action items to responsible agencies by email

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         DATA SOURCES                              │
│  ISP-RJ crimes │ Disque Denúncia │ Urban Factors │ 1746 Service  │
│  CIVITAS cameras │ RELINTs │ Census 2022 │ Twitter/X │ News       │
└────────────────────────────┬─────────────────────────────────────┘
                             │
              ┌──────────────▼──────────────┐
              │      Python Pipeline         │
              │  (Pandas · GeoPandas · NLP)  │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │    Ontology Classification   │  ← Claude LLM
              │  (structured crime events)   │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │   Next.js Frontend + API     │
              │  MapLibre · Recharts · SSE   │
              └──────────────┬──────────────┘
                             │
              ┌──────────────▼──────────────┐
              │   AI Investigative Agent     │  ← Claude (tool use)
              │  Report Gen · Email Dispatch │
              └─────────────────────────────┘
```

---

## Repository Structure

```
.
├── main/                   # Primary application
│   ├── frontend/           # Next.js 16 + TypeScript + Tailwind + MapLibre
│   ├── backend/            # Python pipeline, scoring, report generation
│   ├── data/               # Cleaned datasets, artifacts, GeoJSON
│   └── docs/               # Architecture, API reference, data dictionary
│
├── ontology/               # Crime event ontology pipeline
│   ├── valente_scraper/    # Twitter/X data collection via Nitter
│   └── valente_ontology/   # Structured extraction (CSV + LLM → JSONL)
│
├── data/                   # Shared datasets (clean, external, processed)
├── _backlog/               # Archived experimental modules
└── .gitignore
```

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 20+ / pnpm
- An Anthropic API key (for AI features)

### Backend (data pipeline)

```bash
cd main/backend
pip install -r requirements.txt
python data_pipeline.py --data-dir ../data --output areas_data.json
cp areas_data.json ../frontend/public/areas_data.json
```

### Frontend (dashboard)

```bash
cd main/frontend
pnpm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
pnpm dev   # http://localhost:3000
```

### Ontology pipeline (optional)

```bash
cd ontology
uv sync
uv run python -m valente_ontology.cli extract all
```

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Operational Recommendations** | Per-area allocation: agents/shift, patrol modality, priority streets, time windows, multi-agency coordination |
| **AI Investigative Agent** | Claude navigates the map live with ~42 tools (query, map control, human-in-the-loop checkpoints) |
| **Bingo Coincidence Engine** | Flags zones where crime + urban factors + criminal dynamics overlap on the same street segment |
| **Adjustable Scoring** | 4-component score (hotspot 40%, peak 15%, factors 25%, dynamics 15%) with real-time weight sliders |
| **AI Synthesis** | Generates criminal dynamics narrative + prioritized action plan with evidence citations |
| **Automated Reports** | Official CompStat `.docx` with all 8 sections, including action plan and agency accountability |
| **Camera Gap Analysis** | Detects blind spots (50m buffer), classifies as install vs. relocate |
| **Fleet Allocation** | Deterministic model for 600 agents in 12x36 shifts, proportional to area score |
| **Cross-Area Comparison** | Radar charts, rankings, absolute vs. per-capita toggle |

---

## Data Sources

| # | Source | Records | What it measures |
|---|--------|---------|------------------|
| 1 | ISP-RJ Crime Records | 115,354 | Registered robberies 2020-2024 |
| 2 | Disque Denúncia (anonymous tips) | 18,003 | Criminal dynamics, modus operandi |
| 3 | Urban Factors (field survey) | 2,085 | Environmental conditions enabling crime |
| 4 | CIVITAS Cameras | 985 | Video surveillance coverage |
| 5 | CPSR (homeless census) | 23,332 | Vulnerable population distribution |
| 6 | Territorial Domain | 1,628 | Organized crime control zones |
| 7 | RELINTs (intelligence reports) | 8 | Qualitative criminal dynamics per area |
| 8 | Central 1746 (BigQuery) | 902,822 | Public service requests 2020-2024 |
| 9 | Census 2022 (IBGE) | 165 bairros | Population for per-capita normalization |
| 10 | Bairros data.rio | 166 | Administrative boundaries |
| 11 | Logradouros CadLog | 132,052 | Street gazetteer for geoparsing |
| 12 | ISP-RJ Historical | 11,320 | Crime time series 2003-2025 |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Data Pipeline | Python · Pandas · GeoPandas · Shapely |
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · MapLibre GL · Recharts |
| AI | Claude Sonnet (investigative agent, ~42 tools) · Claude Haiku (report gen) |
| Ontology | Pydantic models · JSONL storage · LLM extraction with prompt caching |
| Reports | docx (TypeScript) |
| Tests | pytest (32) · Vitest (93) |

---

## Documentation

| Document | Contents |
|----------|----------|
| [`main/CHALLENGE.md`](main/CHALLENGE.md) | Original hackathon submission with full feature breakdown |
| [`main/docs/ARCHITECTURE.md`](main/docs/ARCHITECTURE.md) | System architecture, data flow, technical decisions |
| [`main/docs/API_REFERENCE.md`](main/docs/API_REFERENCE.md) | API routes (`/api/synthesize`, `/api/agent`, `/api/report`, etc.) |
| [`main/docs/DATA_DICTIONARY.md`](main/docs/DATA_DICTIONARY.md) | Complete schema of `areas_data.json` |
| [`main/docs/CONTRIBUTING.md`](main/docs/CONTRIBUTING.md) | How to extend (new layers, tabs, metrics) |
| [`data/README.md`](data/README.md) | Data pipeline details, source descriptions, integration guide |
| [`ontology/README_ONTOLOGY.md`](ontology/README_ONTOLOGY.md) | Ontology pipeline architecture and usage |

---

## The 8 Patrol Areas

| Area | Zone | Crimes | Peak Hour | Context |
|------|------|--------|-----------|---------|
| Presidente Vargas | Centro | 4,011 | 20h | Main commercial avenue, 500k+ daily pedestrians |
| Rodoviária – Gentileza | Centro/Norte | 1,974 | 20h | Bus terminal, degraded surroundings |
| Estações SFX – Afonso Pena | Norte | 1,507 | 20h | Train station corridor |
| Praia Botafogo | Zona Sul | 1,138 | 21h | Commercial axis, hospitals |
| Metrô Botafogo | Zona Sul | 821 | 23h | Metro station, nightlife |
| Rio Sul | Zona Sul | 457 | 20h | Shopping mall area, tourism |
| Jardim de Alah | Zona Sul | 298 | 20h | Ipanema/Leblon, upscale residential |
| Campo Grande | Zona Oeste | 294 | 22h | Peripheral commercial zone, militia context |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for AI features) | Claude API key for synthesis and agent |
| `PYTHON_BIN` | No | Path to Python binary (default: `python3`) |
| `COMPSTAT_DATA_DIR` | No | Path to CompStat source data (ontology module) |

---

## License

This project was developed during the Claude Impact Lab Rio hackathon. Data sources are from official public Brazilian government datasets (ISP-RJ, IBGE, data.rio, BigQuery datario).

---

## Team

**Grupo 7** — Claude Impact Lab Rio · May 2026
