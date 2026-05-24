# Data — CompStat Municipal Rio de Janeiro (Grupo 7)

Dados integrados para as **8 áreas de atuação da Força Municipal (FM)**, com contexto
socioespacial dos bairros do entorno, prontos para alimentar o dashboard, relatórios analíticos e IA.

**CRS padrão:** EPSG:4326 (WGS84)
**Escopo criminal:** Roubo (transeunte, celular, coletivo) — 2020-2024
**Gerado em:** 2026-05-24

---

## O que fizemos com os dados

### Ponto de partida

O hackathon forneceu **5 fontes de dados brutos** em formatos heterogêneos (CSV, SHP, DOCX, XLSX) — ver [briefing técnico](../../claude_impact_lab_compstat_rio/Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf). Esses dados viviam em silos, sem integração geoespacial entre si.

### O que construímos

Construímos um **pipeline de dados completo** que:

1. **Limpou e normalizou** as 5 fontes oficiais do hackathon para formatos otimizados (Parquet, GeoJSON, JSON estruturado) em `clean/`
2. **Coletou 7 fontes externas** de dados públicos para enriquecimento em `external/`
3. **Executou spatial joins** para atribuir cada ponto (crime, fator, denúncia, câmera, PSR) ao polígono FM correspondente, gerando `processed/`
4. **Gerou pacotes CompStat** com KPIs, trechos críticos, scoring, bingos e coincidências para cada área em `artifacts/`
5. **Integrou a Central 1746** (902.822 chamados de serviço público) como camada de validação dos fatores urbanos

### Resultado

De dados brutos em silos, chegamos a **pacotes analíticos prontos** para cada área FM, com todas as camadas cruzadas e prontas para alimentar o dashboard e gerar relatórios automatizados.

---

## Estrutura

```
data/
├── README.md               ← este documento
├── clean/                   8 datasets oficiais, limpos e normalizados
│   ├── ocorrencias.parquet      115.354 roubos georreferenciados (2020-2024)
│   ├── disque_denuncia.parquet  18.003 denúncias anônimas de crime
│   ├── fatores_urbanos.parquet  2.085 fatores ambientais mapeados em campo
│   ├── cameras.parquet          985 câmeras CIVITAS
│   ├── cpsr.parquet             23.332 registros do censo PSR
│   ├── dominio_territorial.geojson  1.628 polígonos de facções
│   ├── fm_areas.geojson         8 polígonos das áreas FM (geometria mestre)
│   ├── relints.json             8 RELINTs estruturados (RI_010–RI_017)
│   └── _manifest.json           Auditoria do pipeline de limpeza
├── external/                Fontes públicas de enriquecimento
│   ├── bairros_rio.geojson          166 bairros (data.rio)
│   ├── censo_2022_bairros.geojson   165 bairros com pop. Censo 2022
│   ├── logradouros_rio.geojson      Gazetteer de logradouros (parcial)
│   ├── logradouros_rio.full.geojson 132.052 trechos de rua (completo)
│   ├── isp_rj_crimes_rio.csv       Série ISP-RJ 2003-2025
│   ├── setores_censitarios_rio.geojson  10.504 setores censitários
│   ├── chamados_1746_fm.csv         902.822 chamados 1746 (PRONTO)
│   ├── queries_1746.sql             SQL de extração BigQuery
│   └── (arquivos legacy de extração)
├── processed/               Resultados intermediários
│   ├── ocorrencias_com_area_fm.csv  10.500 crimes com spatial join
│   ├── area_fm_profile.csv          Perfil resumido das 8 áreas
│   ├── spatial_join_summary.csv     Estatísticas do spatial join
│   ├── relints_summary.csv          Resumo dos RELINTs
│   └── external_sources_assessment.csv  Avaliação de fontes externas
├── config/
│   └── area_registry.json   Backbone de junção (reconcilia nomes entre fontes)
└── artifacts/               Pacotes CompStat prontos (10 áreas × 7 arquivos)
    ├── index.json                   Catálogo com KPIs e rankings
    ├── presidente_vargas/           7 arquivos (area, temporal, factors, cameras, signals, polygon, segments)
    ├── rodoviaria_gentileza/
    ├── estacoes_sfx_afonso_pena/
    ├── praia_botafogo/
    ├── metro_botafogo/
    ├── campo_grande_calcadao/
    ├── jardim_de_alah/
    ├── rio_sul/
    ├── lauro_muller/                Área de referência (do briefing)
    └── bangu_calcadao/              Área exemplo (do briefing)
```

---

## As 12 fontes de dados — o que cada uma faz

### Fontes oficiais do hackathon (em `clean/`)

| # | Fonte | Volume | Tipo | O que mede | Como usamos |
|---|---|---|---|---|---|
| 1 | **Ocorrências ISP** | 115.354 | Quantitativo | Crimes registrados de roubo (2020-2024) | Score, distribuições, heatmap, trechos críticos |
| 2 | **Disque Denúncia** | 18.003 | Qualitativo — dinâmica | Denúncias anônimas de crime | Modus operandi, relatos, dinâmica criminal |
| 3 | **Fatores Urbanos** | 2.085 | Qualitativo — ambiente | Problemas observados em campo | Score, despacho por órgão, camada no mapa |
| 4 | **Câmeras CIVITAS** | 985 | Operacional | Posições de videomonitoramento | KPI, camada, gap analysis (pontos cegos) |
| 5 | **Polígonos FM** | 8 | Geoespacial | Delimitação das áreas de patrulhamento | Spatial join — toda análise é feita dentro destes polígonos |
| 6 | **RELINTs** | 8 | Inteligência | Relatórios de inteligência classificados | Síntese IA, contexto operacional, bônus de score |
| 7 | **Domínio Territorial** | 1.628 | Geoespacial | Polígonos de facções (CV/TCP/ADA/Milícia) | Camada no mapa, identificação de dinâmica |
| 8 | **Censo PSR** | 23.332 | Social | População em situação de rua | KPI, camada, fator de incidência (SMAS) |

### Fontes externas de enriquecimento (em `external/`)

| # | Fonte | Volume | O que trouxe de novo |
|---|---|---|---|
| 9 | **Bairros data.rio** | 166 | Malha administrativa → associar áreas FM a bairros e subprefeituras |
| 10 | **Censo 2022 IBGE** | 165 | População por bairro → normalização per capita (crimes/1000 hab) |
| 11 | **Logradouros CadLog** | 132.052 | Gazetteer de ruas → geoparsing de denúncias, resolução de trechos |
| 12 | **Central 1746 BigQuery** | 902.822 | Chamados de serviço público → validação cruzada de fatores urbanos |
| 13 | **ISP-RJ série histórica** | 11.320 | Crimes por CISP 2003-2025 → tendência de longo prazo |
| 14 | **Setores censitários** | 10.504 | Dados sociodemográficos sub-bairro |

---

## O que processamos — passo a passo

### Passo 1: Limpeza e normalização (`clean/`)

O script `src/clean.py` tomou os dados brutos do hackathon e:

- Converteu coordenadas de strings para floats válidos
- Filtrou para o bounding box do Rio de Janeiro (lat: -23.2 a -22.7, lng: -43.9 a -43.0)
- Normalizou nomes de logradouros (maiúsculas, sem duplicação de tipo)
- Converteu SHP → GeoJSON, reprojetando para WGS84 (EPSG:4326)
- Estruturou RELINTs de DOCX para JSON com seções parseadas
- Sinalizou linhas problemáticas com flags (`_is_duplicate`, `_outside_rio`, `_has_coords`) — nenhum dado descartado
- Gerou `_manifest.json` com auditoria completa

### Passo 2: Coleta de fontes externas (`external/`)

Coletamos dados públicos para enriquecer a análise:

- **Bairros e Censo 2022** do data.rio via ArcGIS REST API
- **Central 1746** do BigQuery público da Prefeitura (tabela `datario.adm_central_atendimento_1746.chamado`) — 902.822 chamados nos 20 bairros que intersectam áreas FM, período 2020-2024
- **Logradouros** do CadLog da Prefeitura — gazetteer com 132k trechos de rua para geoparsing
- **ISP-RJ** — série histórica de crimes por delegacia para contexto de longo prazo

O processo de extração do 1746 está documentado em `queries_1746.sql`, incluindo a correção do bug de `id_bairro` (IDs com zeros à esquerda vs sem padding).

### Passo 3: Spatial joins e cruzamentos (`processed/`)

Com **GeoPandas** e os polígonos FM como referência:

- Atribuímos cada crime, fator, denúncia, câmera e PSR a uma das 8 áreas FM via `point-in-polygon`
- Cruzamos bairros (Censo 2022) com polígonos FM para obter população por área
- Cruzamos chamados 1746 com polígonos FM para validação de fatores urbanos
- Geramos perfis resumidos por área com todos os KPIs

**Resultado:** 10.500 dos 115.354 crimes (9,1%) caem dentro dos 8 polígonos FM — é esperado, pois são micro-áreas de alta concentração dentro dos 20 bairros do entorno (~1,28M habitantes).

### Passo 4: Pacotes CompStat por área (`artifacts/`)

Para cada uma das 10 áreas (8 oficiais + 2 referência), geramos 7 arquivos:

| Arquivo | Conteúdo | Mapeamento ao relatório CompStat |
|---|---|---|
| `area.json` | KPIs, trechos críticos, scoring, bingos, identificação | Seções 1-3 + Painel de Coincidências |
| `temporal.json` | Matriz hora × dia da semana | Seção: Análise Temporal |
| `factors.json` | Fatores urbanos por órgão responsável | Seção: Fatores de Incidência Criminal |
| `cameras.json` | Posições + gaps (pontos cegos) | Seção: Câmeras |
| `signals.json` | RELINT completo + snippets do Disque Denúncia | Seção: Dinâmica Criminal |
| `polygon.geojson` | Polígono da área | Mapa de segmentos |
| `segments.geojson` | Trechos críticos (hexágonos H3) | Mapa de calor por trecho |

### Passo 5: Integração com o dashboard (`backend/data_pipeline.py`)

O pipeline final (`backend/data_pipeline.py`) consome os dados de `data/` e gera `areas_data.json` (~7 MB), o artefato que alimenta o frontend Next.js. Esse pipeline:

- Carrega as 12 fontes automaticamente (detecta formato Parquet ou CSV)
- Executa spatial joins
- Calcula score determinístico de 4 componentes + bônus RELINT
- Gera o motor de coincidências ("bingo") por trecho
- Detecta pontos cegos de câmera (gap analysis com buffer de 50m)
- Exporta tudo em JSON para o dashboard

---

## As 8 áreas FM — perfil resumido

| # | Área FM | Bairros | Pop. 2022 | Crimes | Pico | OrCrim | Câmeras |
|---|---|---|---|---|---|---|---|
| 1 | **Presidente Vargas – Santana – Central – Cinelândia** | Centro, Cidade Nova, Lapa | 37.503 | 4.011 | 20h | — | 230 |
| 2 | **Rodoviária – Gentileza – Leopoldina** | Centro, Caju, Santo Cristo, +5 | 132.804 | 1.974 | 20h | TCP | 310 |
| 3 | **Estações SFX – Afonso Pena** | Maracanã, Tijuca, Praça da Bandeira | 212.929 | 1.507 | 20h | — | 60 |
| 4 | **Praia Botafogo – Marquês de Abrantes** | Botafogo, Flamengo, Laranjeiras | 159.809 | 1.138 | 21h | CV | 150 |
| 5 | **Metrô Botafogo – São Clemente** | Botafogo | 77.018 | 821 | 23h | — | 80 |
| 6 | **Rio Sul** | Botafogo, Copacabana, Urca | 211.152 | 457 | 20h | — | 0 |
| 7 | **Jardim de Alah** | Ipanema, Lagoa, Leblon | 93.777 | 298 | 20h | CV | 30 |
| 8 | **Campo Grande – Estação – Calçadão** | Campo Grande | 352.704 | 294 | 22h | Milícia | 45 |

**Total:** 10.500 ocorrências dentro dos 8 polígonos FM.

---

## Regra fundamental: Disque Denúncia != Chamados 1746

Estas são duas fontes **completamente diferentes**. Confundi-las gera ações erradas.

| | **Disque Denúncia (DD)** | **Chamados 1746** |
|---|---|---|
| **O que é** | Denúncia anônima sobre **CRIMES** | Pedido de **SERVIÇO PÚBLICO** |
| **Quem usa** | Testemunha/vítima de crime | Morador com problema de infraestrutura |
| **Exemplo** | "Vi traficantes armados às 22h" | "Poste apagado há 3 semanas" |
| **Quem resolve** | Polícia (Civil/Militar) | Prefeitura (Comlurb, RioLuz, etc.) |
| **Volume** | 18.003 denúncias | 902.822 chamados |
| **Camada CompStat** | Dinâmica Criminal (Camada 3) | Valida Fatores Urbanos (Camada 2) |

**Na prática:**
- DD: "tem crime aqui" → ação **policial**
- 1746: "o ambiente está degradado" → ação da **prefeitura**
- Quando 1746 mostra poste apagado + DD mostra tráfico no mesmo trecho → o poste apagado **facilita** o tráfico

---

## Validação cruzada: Fatores de campo × Chamados 1746

A plataforma cruza as duas perspectivas do mesmo problema:

| Órgão | Fatores (campo) | Chamados (1746) | O que validam |
|---|---|---|---|
| **Comlurb** | 583 | ~28k | Vegetação/lixo em campo → demanda recorrente |
| **SMAS** | 341 | ~30k | PSR/drogas em campo → pedidos de acolhimento |
| **SEOP** | 308 | ~7k | Comércio irregular → ocupação irregular |
| **RioLuz** | 231 | ~118k | Iluminação deficiente → milhares de chamados |
| **Seconserva** | 216 | ~72k | Calçada/via degradada → pavimentação/drenagem |
| **CET-Rio** | 191 | ~27k | Retenção de tráfego → semáforo/sinalização |
| **GM-Rio** | 84 | ~188k | Motos no passeio → estacionamento irregular |

---

## Como usar os dados no pipeline

```bash
# Gerar o JSON para o dashboard
cd eduardo/backend
python data_pipeline.py --data-dir ../data --output areas_data.json
cp areas_data.json ../frontend/public/areas_data.json
```

```python
import pandas as pd
import geopandas as gpd
import json

# Áreas FM (geometria oficial)
fm = gpd.read_file("data/clean/fm_areas.geojson")

# Crimes dentro de cada área FM
occ_fm = pd.read_csv("data/processed/ocorrencias_com_area_fm.csv")

# Bairros + população (crime per capita)
censo = gpd.read_file("data/external/censo_2022_bairros.geojson")

# Pacote CompStat de uma área
with open("data/artifacts/presidente_vargas/area.json") as f:
    area = json.load(f)

# Registry de áreas (reconcilia nomes entre fontes)
with open("data/config/area_registry.json") as f:
    registry = json.load(f)
```

---

## Mapa de integração

```
                    ┌─────────────────────────────┐
                    │     fm_areas.geojson         │  8 polígonos FM
                    │     (clean/)                 │  chave: nome_subar
                    └──────────┬──────────────────┘
                               │ spatial join
          ┌────────────────────┼─────────────────────┐
          │                    │                      │
┌─────────▼──────────┐ ┌──────▼───────────┐ ┌────────▼──────────┐
│ ocorrencias        │ │ fatores_urbanos  │ │ disque_denuncia   │
│ 115k crimes        │ │ 2.085 fatores    │ │ 18k denúncias     │
│ lat/lon → sjoin    │ │ lat/lon + orgão  │ │ modus, relato     │
│ → 10.5k dentro FM  │ │ → 834 dentro FM  │ │ → 772 dentro FM   │
└────────────────────┘ └──────────────────┘ └───────────────────┘
          │                    │                      │
          └────────────────────┼──────────────────────┘
                               │ BINGO: coincidência de camadas
                               ▼
                    ┌──────────────────────┐
                    │ artifacts/{area}/    │  10 áreas × 7 arquivos
                    │ area.json + temporal │  KPIs, trechos, scoring
                    │ + factors + cameras  │  bingos, coincidências
                    │ + signals + segments │
                    │ → RELATÓRIO COMPSTAT │
                    └──────────────────────┘

          ┌─────────────────────────────────────────┐
          │           CONTEXTO EXTERNO               │
          │  bairros_rio.geojson    → malha bairros │
          │  censo_2022             → pop per capita │
          │  logradouros_rio        → gazetteer NER  │
          │  chamados_1746          → valida fatores │
          │  isp_rj_crimes          → tendência ISP  │
          │  setores_censitarios    → sub-bairro     │
          └─────────────────────────────────────────┘
```

---

## Limitações e vieses importantes

| Viés | Impacto | Como mitigar |
|---|---|---|
| **Subnotificação criminal** | Apenas 30-50% dos roubos são registrados em BO | Sempre mencionar que dados mostram crime REGISTRADO, não real |
| **População flutuante** | Centro tem 37k residentes mas 500k+ pedestres/dia | Contextualizar per capita como "por 1000 RESIDENTES" |
| **Viés de denúncia** | Bairros de classe média denunciam mais | Poucas denúncias em periferia pode ser medo, não ausência |
| **Snapshot temporal** | Fatores urbanos são de 2026 (uma visita) | Poste pode ter sido consertado desde a coleta |
| **Efeito pandemia** | 2020-2021 teve queda artificial de registros | Não comparar 2020 com anos normais sem ressalva |
| **BO online (2022+)** | Aumento de registros pode ser administrativo | Parte do aumento pode ser mais gente registrando, não mais crime |

---

## Fontes e licenças

| Fonte | Tipo | URL |
|---|---|---|
| Hackathon CompStat | Dados oficiais | github.com/CompStat-Rio/claude_impact_lab_compstat_rio |
| data.rio (Prefeitura) | Dados abertos | pgeo3.rio.rj.gov.br/arcgis/rest/services |
| BigQuery datario (1746) | Dados abertos | console.cloud.google.com/bigquery → datario |
| ISP-RJ | Dados abertos | ispdados.rj.gov.br |
| IBGE/geobr | MIT | github.com/ipeaGIT/geobr |
| Censo 2022 | Dados abertos | data.rio via ArcGIS |

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7 · Maio 2026*
