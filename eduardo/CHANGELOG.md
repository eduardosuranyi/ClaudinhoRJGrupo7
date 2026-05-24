# Changelog — CompStat Municipal RJ

Histórico de alterações da plataforma de inteligência criminal do CompStat Municipal (Grupo 7).
Convenção: versões seguem `vMAJOR.MINOR.PATCH`. Cada entrada detalha impacto no pipeline, frontend e dados.

---

## v2.1.0 — Enriquecimento de Dados e Normalização Per Capita (2026-05-24)

Integração de 3 fontes externas (bairros, Censo 2022, Central 1746) para normalização per capita e contextualização geográfica das áreas FM. Esta versão não altera o modelo de scoring — os novos dados são contextuais.

### Backend (`data_pipeline.py`)

**Novos loaders** (todos opcionais — retornam vazio se arquivo não existir):

| Loader | Fonte | Registros | Uso |
|---|---|---|---|
| `load_bairros()` | data.rio | 166 polígonos | Bairros intersectando cada área FM |
| `load_censo()` | Censo 2022 | 165 bairros | População residente para normalização per capita |
| `load_chamados_1746()` | BigQuery export | variável | Chamados de serviço público por tipo/órgão |
| `load_dd_drogas()` | Disque Denúncia | filtro CONSUMO DE DROGAS | Fator SMAS (cenas de drogas) |
| `load_dd_all_geo()` | Disque Denúncia | todos geocodificados | Agregação por bairro no entorno |

**Campos enriquecidos por área:**

| Seção | Campo | Tipo | Descrição |
|---|---|---|---|
| `identificacao` | `bairros` | `string[]` | Nomes dos bairros que intersectam o polígono FM |
| `identificacao` | `subprefeitura` | `string` | Derivada do campo `regiao_adm` do Censo |
| `identificacao` | `populacao_bairros_2022` | `number` | População residente (Censo 2022) |
| `stats` | `populacao_estimada` | `number` | Para normalização per capita |
| `stats` | `crimes_per_1000_hab` | `number` | Crimes por 1.000 habitantes |
| `stats` | `denuncias_drogas` | `number` | Denúncias de consumo de drogas (fator SMAS) |
| `relatos_sample` | `perfil_suspeito` | `object` | Perfil extraído dos envolvidos (sexo, idade, pele) |
| raiz da área | `denuncias_por_bairro` | `object[]` | DD agregado por bairro no entorno |
| raiz da área | `chamados_1746` | `object` | Chamados 1746 agrupados por tipo/órgão |
| `meta` | `has_censo`, `has_1746` | `boolean` | Flags de disponibilidade de dados externos |
| `meta` | `populacao_total_bairros_fm` | `number` | População total das áreas FM |

**Sem alterações no scoring.** Fórmula de score preservada. Novos dados são contextuais.

### Frontend

**Tipos** (`types.ts`): todos os novos campos são opcionais (`?`). O app funciona com JSON antigo e novo.

**Componentes alterados:**

| Componente | Alteração |
|---|---|
| `OverviewTab` | Linha de KPI per capita (população, crimes/1k hab, cenas de drogas) + gráfico fatores por órgão |
| `AreaPanel` | Chips de bairros abaixo da AISP/RISP; subprefeitura real do Censo |
| `TrechosTab` | Pills de bingo por camada (Crime, Fator, Sinal) em cada trecho |
| `DenunciasTab` | KPI de cenas de drogas; breakdown por bairro; chips de perfil de suspeito |
| `MapView` | Marcadores numerados de trechos ao selecionar área |
| `ComparativoPage` | Toggle Absoluto/Per Capita no gráfico de crimes; coluna per capita no ranking |
| `TopHeader` | KPI de população FM quando Censo disponível |

### Fontes de Dados Adicionais

| Fonte | Arquivo | Registros |
|---|---|---|
| Bairros (data.rio) | `data/external/bairros_rio.geojson` | 166 |
| Censo 2022 (data.rio) | `data/external/censo_2022_bairros.geojson` | 165 |
| Central 1746 (BigQuery) | `data/external/chamados_1746_fm.csv` | opcional |

---

## v2.0.0 — Plataforma Completa com Scoring e IA (2026-05-24)

Versão inicial apresentada no hackathon. Pipeline completo de 9 fontes, dashboard interativo com mapa, scoring determinístico, síntese via Claude e geração de relatório `.docx`.

### Funcionalidades do Backend

- Ingestão de 9 fontes heterogêneas (CSV, SHP, DOCX, XLSX)
- Spatial joins com GeoPandas (point-in-polygon para 8 áreas FM)
- Scoring determinístico de 4 componentes + bônus RELINT (0-100)
- Distribuições horárias/diárias, modus operandi via NLP, top trechos
- Camera Gap Analysis (buffer 50m, classificação instalar/remanejar)
- Bingo / Coincidence Engine (sobreposição de 3 camadas por trecho)
- Gerador de relatório `.docx` no formato oficial CompStat

### Funcionalidades do Frontend

- Dashboard Next.js 16 com MapLibre GL e 6 camadas toggleáveis
- Sidebar com ranking recalculado em tempo real via sliders de peso
- Painel de análise com 6 tabs (Escala, Dados, Trechos, Denúncias, Inteligência, Relatório)
- Síntese de dinâmica criminal e plano de ação via Claude Sonnet 4.5
- Comparativo cross-area com radar chart e ranking
- Sinais de risco automatizados (8 regras)
- Despacho de fatores urbanos por email pré-preenchido (Comlurb, RioLuz, SEOP, etc.)
- Export de relatório em Markdown, HTML e `.docx`

### Testes

- Backend: 32 testes pytest (métricas, modus, scoring, bingo, camera gaps)
- Frontend: 19 testes Vitest (scoring, helpers)

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7*
