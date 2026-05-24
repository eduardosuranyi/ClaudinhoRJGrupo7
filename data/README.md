# Data — CompStat Municipal Rio de Janeiro (Grupo 7)

Dados estruturados, limpos e prontos para integração com as áreas da Força Municipal.

**Gerado em:** 2026-05-24
**CRS padrão:** EPSG:4326 (WGS84)
**Total:** ~142 MB (5 pastas, 90+ arquivos)

---

## Estrutura

```
data/
├── clean/              8 datasets do hackathon, limpos e normalizados
├── external/           Fontes públicas externas (bairros, censo, ISP-RJ, logradouros)
├── processed/          KPIs e resumos analíticos por área FM
├── artifacts/          Pacotes CompStat por área (10 áreas × 7 arquivos)
├── config/             Backbone de junção (area_registry.json)
└── README.md           Este arquivo
```

---

## 1. `clean/` — Dados oficiais do hackathon (limpos)

Gerados por `src/clean.py`. Nenhum dado inventado ou imputado.
Linhas problemáticas são sinalizadas com flags (`_is_duplicate`, `_outside_rio`, `_has_coords`), nunca descartadas.

| Arquivo | Formato | Linhas | Tamanho | Descrição |
|---------|---------|--------|---------|-----------|
| `ocorrencias.parquet` | Parquet | 115.354 | 9.4 MB | Ocorrências criminais 2020–2024 (roubo transeunte, celular, coletivo) |
| `disque_denuncia.parquet` | Parquet | 18.003 | 4.4 MB | Denúncias anônimas colapsadas (1 por denúncia) |
| `fatores_urbanos.parquet` | Parquet | 2.085 | 144 KB | Fatores ambientais (iluminação, vegetação, PSR) |
| `cameras.parquet` | Parquet | 985 | 63 KB | Câmeras nas áreas FM |
| `cpsr.parquet` | Parquet | 23.332 | 972 KB | Censo de Pessoas em Situação de Rua |
| `dominio_territorial.geojson` | GeoJSON | 1.628 | 1.8 MB | Polígonos de domínio OrCrim (CV, TCP, ADA, Milícia) |
| `fm_areas.geojson` | GeoJSON | 8 | 22 KB | Polígonos das 8 áreas FM oficiais |
| `relints.json` | JSON | 8 | 105 KB | RELINTs estruturados (RI_010–RI_017) |
| `_manifest.json` | JSON | — | 32 KB | Manifesto de auditoria completo |

### Chaves de junção

| Dataset | Campo geográfico | Join com FM |
|---------|-----------------|-------------|
| ocorrencias | `latitude`, `longitude` | Spatial join com `fm_areas.geojson` |
| disque_denuncia | `latitude`, `longitude` | Spatial join com `fm_areas.geojson` |
| fatores_urbanos | `latitude`, `longitude`, `subarea_nome` | Spatial join ou match por `subarea_nome` |
| cameras | `latitude`, `longitude`, `nome_area_fm` | Direto por `nome_area_fm` |
| dominio_territorial | geometria (Polygon) | Overlay/intersect com `fm_areas.geojson` |

---

## 2. `external/` — Fontes públicas externas

Fontes validadas e prontas para enriquecer a análise FM. Todas em EPSG:4326.

| Arquivo | Fonte | Linhas | Tamanho | Descrição |
|---------|-------|--------|---------|-----------|
| `bairros_rio.geojson` | data.rio (ArcGIS) | 166 | 4.5 MB | Polígonos oficiais de bairros do Rio |
| `censo_2022_bairros.geojson` | data.rio (Censo 2022) | 165 | 4.5 MB | População e domicílios por bairro (Censo 2022) |
| `logradouros_rio.geojson` | CadLog/Prefeitura | 132.052 | 105 MB | Gazetteer completo: trechos de logradouros com nome e bairro |
| `isp_rj_crimes_rio.csv` | ISP-RJ | 11.320 | 2.2 MB | Estatísticas mensais de crime por CISP (Rio, 2003–2025) |
| `setores_censitarios_rio.geojson` | IBGE via geobr | 10.504 | 8.6 MB | Setores censitários (granularidade sub-bairro) |

### Colunas-chave por dataset

**bairros_rio.geojson:**
`nome`, `codbairro`, `regiao_adm`, `codra`, geometry (Polygon)

**censo_2022_bairros.geojson:**
`nome`, `codbairro`, `Total_de_pessoas_2022`, `Total_de_domicilios_2022`, `Total_de_pessoas_2010`, `diferenca_de_pessoas`, geometry (Polygon)

**logradouros_rio.geojson:**
`completo` (nome completo da rua), `bairro`, `cod_bairro`, `tipo_logra_ext`, `hierarquia`, geometry (LineString)

**isp_rj_crimes_rio.csv:**
`cisp`, `mes`, `ano`, `aisp`, `risp`, `munic`, `roubo_transeunte`, `roubo_celular`, `roubo_em_coletivo`, `furto_transeunte`, `furto_celular`, `total_roubos`, `total_furtos` (+ 50 tipos de crime)

**setores_censitarios_rio.geojson:**
`code_tract`, `zone` (urbano/rural), `code_muni`, `name_neighborhood`, `code_neighborhood`, geometry (Polygon/MultiPolygon)

### Como conectar com as áreas FM

```python
import geopandas as gpd

fm = gpd.read_file("data/clean/fm_areas.geojson")
bairros = gpd.read_file("data/external/bairros_rio.geojson")
censo = gpd.read_file("data/external/censo_2022_bairros.geojson")

# Bairros que intersectam cada área FM
fm_bairros = gpd.sjoin(bairros, fm, how="inner", predicate="intersects")

# População dentro de cada área FM (via censo)
fm_censo = gpd.sjoin(censo, fm, how="inner", predicate="intersects")
pop_por_area = fm_censo.groupby("nome_subar")["Total_de_pessoas_2022"].sum()

# Crime per capita
import pandas as pd
occ = pd.read_parquet("data/clean/ocorrencias.parquet")
occ_fm = pd.read_csv("data/processed/ocorrencias_com_area_fm.csv")
crimes_por_area = occ_fm.groupby("nome_subar").size()
crime_per_capita = (crimes_por_area / pop_por_area * 1000).rename("crimes_per_1000hab")
```

### Logradouros como gazetteer para geoparsing

O arquivo `logradouros_rio.geojson` funciona como gazetteer oficial para ancorar menções textuais (redes sociais, Disque Denúncia) a geometrias reais:

```python
logr = gpd.read_file("data/external/logradouros_rio.geojson")

# Encontrar trechos da "Rua Uruguaiana"
uruguaiana = logr[logr["completo"].str.contains("Uruguaiana", case=False, na=False)]
# -> LineStrings exatas, com bairro associado

# Ancorar dentro de áreas FM
fm = gpd.read_file("data/clean/fm_areas.geojson")
logr_fm = gpd.sjoin(logr, fm, how="inner", predicate="intersects")
```

---

## 3. `processed/` — Resumos analíticos

| Arquivo | Descrição |
|---------|-----------|
| `area_fm_profile.csv` | KPIs por área FM (crimes, fatores, denúncias, câmeras, crimes/câmera) |
| `ocorrencias_com_area_fm.csv` | 10.500 ocorrências com `nome_subar` da área FM atribuída |
| `spatial_join_summary.csv` | Taxa de acerto do spatial join por dataset |
| `relints_summary.csv` | Metadados dos 8 RELINTs |
| `external_sources_assessment.csv` | Matriz de decisão: prioridade e ação para cada fonte externa |

### Perfil das áreas FM

| Área | Crimes | Fatores | Denúncias | Câmeras | Crimes/câmera |
|------|--------|---------|-----------|---------|---------------|
| Presidente Vargas–Santana–Central–Cinelândia | 4.011 | 90 | 231 | 230 | 17,4 |
| Rodoviária–Gentileza–Leopoldina | 1.974 | 50 | 134 | 310 | 6,4 |
| Estações SFX–Afonso Pena | 1.507 | 70 | 146 | 60 | 25,1 |
| Praia Botafogo–Marquês de Abrantes | 1.138 | 146 | 62 | 150 | 7,6 |
| Metrô Botafogo–São Clemente | 821 | 171 | 86 | 80 | 10,3 |
| Rio Sul | 457 | 72 | 58 | 0 | — |
| Jardim de Alah | 298 | 148 | 17 | 30 | 9,9 |
| Campo Grande: Estação–Calçadão | 294 | 87 | 38 | 45 | 6,5 |

---

## 4. `artifacts/` — Pacotes CompStat por área

10 áreas × 7 arquivos JSON/GeoJSON cada, prontos para alimentar relatórios e dashboards.

```
artifacts/
├── index.json                    Rankings e metadados de todas as áreas
├── presidente_vargas/
│   ├── area.json                 Relatório mestre (KPIs, trechos, bingo)
│   ├── temporal.json             Matriz hora × dia-da-semana
│   ├── factors.json              Fatores urbanos por órgão
│   ├── cameras.json              Posições de câmeras
│   ├── signals.json              RELINT + snippets Disque Denúncia
│   ├── polygon.geojson           Polígono da área
│   └── segments.geojson          Trechos críticos (hexágonos H3)
├── rodoviaria_gentileza/
├── estacoes_sfx_afonso_pena/
├── praia_botafogo/
├── metro_botafogo/
├── campo_grande_calcadao/
├── jardim_de_alah/
├── rio_sul/
├── lauro_muller/                 Área extra (polígono derivado de câmeras)
└── bangu_calcadao/               Área extra (polígono derivado de câmeras)
```

### Carregando um pacote de área

```python
import json

area_id = "presidente_vargas"
base = f"data/artifacts/{area_id}"

with open(f"{base}/area.json") as f:
    area = json.load(f)

print(area["display_name"])         # "Presidente Vargas – Campo de Santana..."
print(area["indicadores"])          # {total_ocorrencias, total_fatores, ...}
print(area["trechos"])              # Lista de trechos críticos com scores
print(area["n_bingo_cells"])        # Células com convergência de fatores
print(area["n_triple_bingo"])       # Tríplice convergência
```

---

## 5. `config/` — Backbone de junção

### `area_registry.json`

Reconcilia os nomes das áreas FM entre shapefile, CSV de câmeras e RELINTs.
Use `area_id` como chave estável para joins entre sistemas.

| area_id | Shapefile | Câmeras | RELINT | Polígono |
|---------|-----------|---------|--------|----------|
| `presidente_vargas` | Presidente Vargas - Campo de Santana... | idem | RI_017 | shapefile |
| `rodoviaria_gentileza` | Rodoviária - Terminal Gentileza... | idem | RI_010 | shapefile |
| `praia_botafogo` | Praia de Botafogo - Rua Marquês... | idem | RI_015 | shapefile |
| `metro_botafogo` | Metrô Botafogo - Rua São Clemente... | idem | RI_011 | shapefile |
| `estacoes_sfx_afonso_pena` | Estações São Francisco Xavier... | idem | RI_016 | shapefile |
| `campo_grande_calcadao` | Campo Grande: Estação de Trem... | idem | RI_013 | shapefile |
| `jardim_de_alah` | Jardim de Alah | idem | RI_012 | shapefile |
| `rio_sul` | Rio Sul | — (sem câmeras) | RI_014 | shapefile |
| `lauro_muller` | — | Rua Lauro Müller... | — | camera_hull |
| `bangu_calcadao` | — | Bangu: Calçadão... | — | camera_hull |

---

## Mapa de integração: como tudo se conecta

```
                        ┌──────────────────────┐
                        │  fm_areas.geojson     │  8 polígonos FM (chave: nome_subar)
                        │  (clean/)             │
                        └──────────┬───────────┘
                                   │ spatial join
               ┌───────────────────┼────────────────────┐
               │                   │                    │
    ┌──────────▼──────────┐  ┌─────▼──────────┐  ┌─────▼──────────────┐
    │ ocorrencias.parquet │  │ bairros_rio     │  │ logradouros_rio    │
    │ (clean/)            │  │ (external/)     │  │ (external/)        │
    │ lat/lon → sjoin     │  │ intersect → FM  │  │ gazetteer p/ NER   │
    └─────────────────────┘  │ bairro → FM     │  └────────────────────┘
                             └────────┬────────┘
                                      │ join por nome/codbairro
                             ┌────────▼────────┐
                             │ censo_2022      │
                             │ (external/)     │
                             │ pop + domicílios│
                             │ → crime per cap.│
                             └─────────────────┘

    ┌─────────────────────┐  ┌──────────────────┐
    │ isp_rj_crimes_rio   │  │ setores_censit.  │
    │ (external/)         │  │ (external/)      │
    │ CISP→AISP→bairro    │  │ sub-bairro       │
    │ validação temporal  │  │ análise granular │
    └─────────────────────┘  └──────────────────┘

    ┌─────────────────────────────────────────┐
    │ artifacts/{area_id}/                    │
    │   area.json + temporal + factors +      │
    │   cameras + signals + polygon + segments│
    │   → relatório CompStat completo por FM  │
    └─────────────────────────────────────────┘

    ┌─────────────────────┐
    │ area_registry.json  │  Backbone: reconcilia nomes entre fontes
    │ (config/)           │  Use area_id como chave estável
    └─────────────────────┘
```

---

## Quick start: carregando tudo

```python
import pandas as pd
import geopandas as gpd
import json

# --- Áreas FM (geometria oficial) ---
fm = gpd.read_file("data/clean/fm_areas.geojson")

# --- Ocorrências (tabular + já com area FM atribuída) ---
occ = pd.read_parquet("data/clean/ocorrencias.parquet")
occ_fm = pd.read_csv("data/processed/ocorrencias_com_area_fm.csv")

# --- Contexto externo ---
bairros = gpd.read_file("data/external/bairros_rio.geojson")
censo = gpd.read_file("data/external/censo_2022_bairros.geojson")
logr = gpd.read_file("data/external/logradouros_rio.geojson")
isp = pd.read_csv("data/external/isp_rj_crimes_rio.csv")

# --- Pacote CompStat de uma área ---
with open("data/config/area_registry.json") as f:
    registry = json.load(f)

area_id = "presidente_vargas"
with open(f"data/artifacts/{area_id}/area.json") as f:
    area_report = json.load(f)
```

---

## Fontes e licenças

| Fonte | URL | Licença |
|-------|-----|---------|
| Hackathon CompStat | github.com/CompStat-Rio/claude_impact_lab_compstat_rio | Dados do desafio |
| data.rio (Prefeitura) | pgeo3.rio.rj.gov.br/arcgis/rest/services | Dados abertos |
| ISP-RJ | ispdados.rj.gov.br | Dados abertos |
| IBGE/geobr | github.com/ipeaGIT/geobr | MIT |
| Censo 2022 | data.rio via ArcGIS | Dados abertos |
