# Changelog

## v2.1.0 — Enriched Data Integration (2026-05-24)

### Backend (`data_pipeline.py`)

**New loaders (all optional — return empty on missing files):**
- `load_bairros()` — 166 bairro polygons from data.rio
- `load_censo()` — Census 2022 population by bairro
- `load_chamados_1746()` — 1746 municipal service calls (BigQuery export)
- `load_dd_drogas()` — Disque Denúncia filtered to CONSUMO DE DROGAS
- `load_dd_all_geo()` — All geocoded DD records (for bairro aggregation)

**Enriched `identificacao`:**
- `bairros` — list of bairro names intersecting the FM polygon
- `subprefeitura` — derived from bairro `regiao_adm` via census data
- `populacao_bairros_2022` — sum of Censo 2022 residents in intersecting bairros

**Enriched `stats`:**
- `populacao_estimada` — census population for per-capita normalization
- `crimes_per_1000_hab` — crimes per 1,000 residents
- `denuncias_drogas` — CONSUMO DE DROGAS denuncias (SMAS factor signal)

**New area-level fields:**
- `denuncias_por_bairro` — DD aggregated by bairro in the FM surroundings
- `chamados_1746` — grouped 1746 calls by type/orgao (when CSV available)

**Enriched `relatos_sample`:**
- `perfil_suspeito` — suspect profile extracted from `envolvidos` (sex, age, skin)

**Enriched `meta`:**
- `has_censo`, `has_1746`, `populacao_total_bairros_fm`

**No scoring changes.** Existing score formula preserved. New data is context, not score input.

### Frontend Types (`types.ts`)

All new fields are optional (`?`). App works with both old and new JSON.

- `Identificacao`: added `bairros?`, `populacao_bairros_2022?`
- `AreaStats`: added `populacao_estimada?`, `crimes_per_1000_hab?`, `denuncias_drogas?`
- `Relato`: added `perfil_suspeito?`
- `Area`: added `chamados_1746?`, `denuncias_por_bairro?`
- `AreasData.meta`: added `has_censo?`, `has_1746?`, `populacao_total_bairros_fm?`
- New interfaces: `Chamado1746Tipo`, `Chamados1746`, `DenunciaBairro`

### Frontend UI

- **OverviewTab**: per-capita KPI row (population, crimes/1k hab, drug scenes) + fatores-por-orgao bar chart
- **AreaPanel**: bairro chips below AISP/RISP; real subprefeitura from census
- **TrechosTab**: bingo layer breakdown pills (Crime, Fator, Sinal) on each trecho
- **DenunciasTab**: KPI row with drug scenes count; bairro breakdown chart; suspect profile chips on relatos
- **MapView**: numbered trecho markers on area selection
- **ComparativoPage**: Absoluto/Per Capita toggle on crime bar chart; per-capita column in ranking table
- **TopHeader**: Pop. FM KPI when census data available

### Data Sources

| Source | File | Records |
|---|---|---|
| Bairros (data.rio) | `data/external/bairros_rio.geojson` | 166 |
| Censo 2022 (data.rio) | `data/external/censo_2022_bairros.geojson` | 165 |
| 1746 Chamados (BigQuery) | `data/external/chamados_1746_fm.csv` | optional |
