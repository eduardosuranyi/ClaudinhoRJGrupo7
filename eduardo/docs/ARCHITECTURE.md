# Arquitetura — CompStat Municipal RJ

> Plataforma de inteligência criminal para análise operacional das áreas da Força Municipal (FM) do Rio de Janeiro, desenvolvida no Claude Impact Lab Rio 2026 (Grupo 7).

---

## 1. Visão Geral

O **CompStat Municipal RJ** integra **12 fontes de dados heterogêneas** (CSV, SHP, DOCX, XLSX, Parquet, GeoJSON) em um **único dashboard operacional** voltado à análise de criminalidade e tomada de decisão do CompStat Municipal da Prefeitura do Rio de Janeiro.

### Objetivo Central

Conforme o [briefing técnico](../../claude_impact_lab_compstat_rio/Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf), o gargalo do CompStat está na **etapa de síntese e cruzamento** das informações: a produção de cada relatório analítico demanda horas de trabalho manual. A plataforma resolve esse gargalo em três frentes:

| Frente | O que resolve | Como |
|---|---|---|
| **Integração** | Dados em silos distintos sem cruzamento | Pipeline Python que ingere 12 fontes e unifica via spatial joins |
| **Análise** | Ausência de cruzamento sistemático de camadas | Motor de coincidências ("bingo") que sobrepõe crime + fatores + dinâmica |
| **Síntese** | Dependência de esforço humano para compilação | IA (Claude) que sintetiza dinâmica criminal e gera plano de ação |

### Capacidades da Plataforma

- Visualizar distribuição espacial e temporal de crimes por área FM
- Comparar áreas com scoring ponderável em tempo real (sliders)
- Identificar convergências de risco (bingo 2/3 e 3/3) e pontos cegos de câmera
- Sintetizar planos de ação via IA com despacho direto por órgão
- Exportar relatórios analíticos em Markdown, HTML e `.docx` (formato oficial CompStat)

---

## 2. Mapeamento ao Briefing Técnico

A arquitetura foi desenhada para endereçar diretamente os requisitos do briefing técnico do hackathon:

### 2.1 Os Cinco Eixos do CompStat

| Eixo do CompStat | Como a plataforma implementa |
|---|---|
| **Mapeamento sistemático** de furtos e roubos por segmento/horário/padrão | Pipeline calcula distribuições horárias, diárias e por tipo; top trechos com pico de hora |
| **22 áreas prioritárias** com polígonos de concentração criminal | Spatial join atribui cada ocorrência a um polígono FM; scoring ranqueia áreas |
| **Emprego estratégico da FM** com monitoramento | Tab Escala aloca 600 agentes proporcional ao score; sugere modalidade (moto/pé/viatura) |
| **Atuação sobre fatores urbanos** com órgãos municipais | Fatores agrupados por órgão; botão Despachar gera email pré-preenchido |
| **Reuniões semanais de responsabilização** | Relatório `.docx` automático no formato oficial; plano de ação com prazos e responsáveis |

### 2.2 As 4 Perguntas Norteadoras

| Pergunta | Componente que responde | Dados usados |
|---|---|---|
| Locais de maior incidência coincidem com rota FM? | TrechosTab + MapView | `top_trechos`, `map_layers.crime_points` |
| Horário de maior incidência coincide com QMD? | OverviewTab (gráfico temporal) | `hora_distribution`, `pico_horario`, `pct_noturno` |
| Dinâmica criminal coincide com modelo de emprego? | InteligenciaTab + RelatorioTab (síntese IA) | `relint`, `modus_operandi`, `relatos_sample` |
| Fatores relevantes estão sendo resolvidos? | OverviewTab (fatores por órgão) + Despachar | `fatores_por_orgao`, email por órgão |

### 2.3 Módulos de Saída Exigidos pelo Briefing

| Módulo exigido (seção 6 do briefing) | Implementação na plataforma |
|---|---|
| **Resumo Executivo** | Síntese Claude em RelatorioTab + export `.docx` seção 1 |
| **Mapa de Calor (Heatmap)** | MapView com camada de crime heatmap + polígonos FM coloridos por score |
| **Análise Temporal** | OverviewTab com gráficos de hora (bar chart) e dia da semana |
| **Dinâmica Criminal (IA Qualitativa)** | InteligenciaTab (RELINT) + RelatorioTab (síntese Claude) |
| **Painel de Coincidências** | TrechosTab com badges bingo 2/3 e 3/3 + RiskSignals |
| **Plano de Ação Gerado** | RelatorioTab com ações priorizadas por órgão + botão Despachar |

---

## 3. Fluxo de Dados

### Visão Macro

```
┌──────────────┐     ┌────────────────┐     ┌──────────────┐     ┌────────────┐
│  12 Fontes   │────→│ data_pipeline  │────→│ areas_data   │────→│  Next.js   │
│  (CSV/SHP/   │     │    .py         │     │   .json      │     │  Frontend  │
│  DOCX/XLSX/  │     │                │     │  (~7 MB)     │     │            │
│  Parquet/    │     │  Pandas +      │     └──────┬───────┘     └─────┬──────┘
│  GeoJSON)    │     │  GeoPandas +   │            │                   │
└──────────────┘     │  Shapely       │            │              ┌────┴──────┐
                     └────────────────┘            │              │ Claude API│
                                                   │              │ (synth.)  │
                                                   │              └────┬──────┘
                                                   │              ┌────┴──────┐
                                                   └─────────────→│ generate  │
                                                                  │ _report.py│
                                                                  │  → .docx  │
                                                                  └───────────┘
```

A arquitetura é **offline-first**: o pipeline Python processa dados brutos e gera `areas_data.json`. O frontend consome esse artefato estático e oferece interatividade no browser. Chamadas à API acontecem apenas para síntese de IA e geração de documentos.

### Etapa 1 — Carregamento (Loading)

O `data_pipeline.py` lê **12 fontes** a partir de `--data-dir` (padrão: `../data`), detectando automaticamente o layout (Parquet ou CSV legacy):

| # | Fonte | Formato | Tipo (briefing) | Função |
|---|---|---|---|---|
| 1 | **Ocorrências ISP** | CSV/Parquet | Quantitativo | Crimes 2020–2024; base do score, distribuições, heatmap |
| 2 | **Disque Denúncia** | CSV | Qualitativo — dinâmica | Relatos 2025; modus operandi via NLP |
| 3 | **Fatores Urbanos** | CSV | Qualitativo — fatores | Pendências por órgão (Comlurb, RioLuz, etc.) |
| 4 | **Câmeras CIVITAS** | CSV (WKT) | Operacional | Posições de câmeras por área FM |
| 5 | **Polígonos FM** | SHP/GeoJSON | Geoespacial | Delimitação das 8 áreas da FM |
| 6 | **RELINTs** | DOCX/JSON | Qualitativo — inteligência | Relatórios de inteligência estruturados |
| 7 | **Domínio Territorial** | CSV (WKT) | Geoespacial | Polígonos de facções (CV, TCP, ADA, Milícia) |
| 8 | **Censo PSR** | XLSX | Social | População em situação de rua |
| 9 | **Bairros** | GeoJSON | Geográfico | 166 polígonos de bairro (data.rio) |
| 10 | **Censo 2022** | GeoJSON | Demográfico | População por bairro para normalização per capita |
| 11 | **DD Drogas** | CSV | Qualitativo | Cenas de uso de drogas (fator SMAS) |
| 12 | **Central 1746** | CSV | Cidadão | Chamados de serviço público (validação de fatores) |

Todos os pontos são filtrados para o bounding box do município: `lat: [-23.2, -22.7]`, `lng: [-43.9, -43.0]`.

### Etapa 2 — Joins Espaciais

Com **GeoPandas** e **Shapely**, cada registro pontual é atribuído a uma área FM via `sjoin` (predicado `within`):

```
Ocorrências ──→ point-in-polygon ──→ Área FM
Denúncias   ──→ point-in-polygon ──→ Área FM  (sem coordenadas: aproximação por bairro)
Fatores     ──→ point-in-polygon ──→ Área FM
Censo PSR   ──→ point-in-polygon ──→ Área FM
Domínio     ──→ intersection     ──→ Área FM  (polígono × polígono)
Bairros     ──→ intersection     ──→ Área FM  (para população por área)
```

### Etapa 3 — Métricas e Análises

Por área, o pipeline calcula:

| Métrica | Método | Output |
|---|---|---|
| **Distribuições horárias/diárias** | Histograma 0-23h, contagem por dia da semana | `hora_distribution`, `dia_distribution` |
| **Modus operandi** | Extração por regex do campo `relato_redacted` | `modus_operandi` (8 categorias) |
| **Top trechos** | Agrupamento por logradouro normalizado (`locf_norm`) | `top_trechos` (até 10, com breakdown por tipo e pico) |
| **Camera Gap Analysis** | Buffer 50m das câmeras → clusters de crimes fora | `camera_gaps` (instalar/remanejar) |
| **Bingo** | Sobreposição de 3 camadas (crime, fatores, sinais) por trecho | `n_bingo_trechos`, `n_triple_bingo` |
| **Evolução mensal** | Série temporal dos últimos 24 meses | `evolucao_mensal` |
| **Per capita** | Crimes / (população × 1000) | `crimes_per_1000_hab` |

### Etapa 4 — Scoring

Modelo determinístico de **4 componentes ponderados** + bônus RELINT:

| Componente | Teto | Peso padrão | Lógica |
|---|---|---|---|
| **Mancha criminal** | 40 | 40% | `(crimes_área / max_crimes) × 40` |
| **Pico horário** | 15 | 15% | `peak_ratio × 15` (soma das 3 horas de pico / total) |
| **Fatores urbanos** | 25 | 25% | `(fatores_área / max_fatores) × 25` |
| **Dinâmica criminal** | 15 | 15% | `(denúncias_área / max_denúncias) × 15` |
| **Bônus RELINT** | +5 | fixo | Adicionado quando há RELINT para a área |

**Score total: 0–100.** Normalização min-max relativa entre as 8 áreas.

O frontend recalcula o score em tempo real com pesos customizados:

```
score = Σ (breakdown_i / max_i) × (peso_i / Σpesos) × 100 + relint_bonus
```

### Etapa 5 — Output

O resultado é serializado em `areas_data.json` (~7 MB), contendo metadados globais e array de 8 áreas com todos os campos necessários ao dashboard.

---

## 4. Stack Tecnológica

### Backend

| Tecnologia | Versão | Papel |
|---|---|---|
| **Python** | 3.10+ | Runtime do pipeline e gerador de relatórios |
| **Pandas** | latest | Manipulação tabular, agregações, normalização |
| **GeoPandas** | latest | Joins espaciais, buffers, reprojeção (EPSG:31983) |
| **Shapely** | latest | Geometrias, WKT, point-in-polygon |
| **python-docx** | latest | Geração do Relatório Analítico `.docx` |
| **PyArrow** | latest | Leitura de arquivos Parquet |
| **pytest** | latest | 32 testes unitários em 5 módulos |

### Frontend

| Tecnologia | Versão | Papel |
|---|---|---|
| **Next.js** | 16 (App Router) | Framework React com rotas de API server-side |
| **TypeScript** | strict | Tipagem estática centralizada em `types.ts` |
| **Tailwind CSS** | v4 | Estilização utilitária + variáveis CSS customizadas (tema escuro) |
| **MapLibre GL** | latest | Mapa interativo com 6 camadas de dados |
| **Recharts** | latest | Gráficos radar, barras e distribuições |
| **Vitest** | latest | 19 testes unitários |

### Inteligência Artificial

| Serviço | Modelo | Papel na plataforma |
|---|---|---|
| **Anthropic API** | Claude Sonnet 4.5 | Síntese da dinâmica criminal (seção 7.1 do briefing) |
| | | Cruzamento e identificação de coincidências (seção 7.2) |
| | | Resposta às perguntas norteadoras (seção 7.3) |
| | | Geração de plano de ação com 5-8 ações priorizadas |

---

## 5. Arquitetura de Componentes (Frontend)

### Hierarquia

```
page.tsx (Orquestrador)
├── TopHeader          KPIs globais consolidados
├── Sidebar            Ranking + sliders de peso
├── MapView            MapLibre + 6 camadas toggleáveis
├── AreaPanel          Painel detalhado (420px lateral)
│   ├── EscalaTab      Alocação de 600 agentes por área/turno
│   ├── OverviewTab    KPIs, gráficos temporais, modus + RiskSignals
│   ├── TrechosTab     Top 10 logradouros + badges de bingo
│   ├── DenunciasTab   Relatos DD, modus, perfil de suspeito
│   ├── InteligenciaTab  Domínio territorial + RELINT
│   └── RelatorioTab   Síntese Claude + plano de ação + export
└── ComparativoPage    Radar, ranking, bar chart cross-area
```

### Componentes Principais

#### `page.tsx` — Orquestrador

Responsável por:
- Carregar `areas_data.json` via `fetch` no mount
- Gerenciar estado global: área selecionada, pesos de scoring, toggle Comparativo/Mapa
- Propagar `weights` para todos os componentes que recalculam o score

#### `TopHeader`

KPIs agregados de todas as áreas: total de crimes, denúncias, fatores urbanos, câmeras, PSR, áreas monitoradas e população FM (quando Censo disponível).

#### `Sidebar`

- Ranking das 8 áreas **recalculado em tempo real** conforme ajuste dos sliders
- 4 sliders: Mancha (40), Pico (15), Fatores (25), Dinâmica (15)
- Botão de reset para pesos padrão
- Indicador visual de RELINT disponível por área

#### `MapView`

MapLibre GL com estilo CARTO Dark Matter. 6 camadas toggleáveis:

| Camada | Tipo de visualização | Fonte de dados |
|---|---|---|
| **Crime** | Heatmap / pontos | `map_layers.crime_points` |
| **Fatores Urbanos** | Pontos coloridos por órgão | `map_layers.fatores_points` |
| **Câmeras** | Marcadores CIVITAS | `map_layers.cameras_points` |
| **PSR** | Pontos do censo | `map_layers.psr_points` |
| **Domínio Territorial** | Polígonos por facção | `dominio_territorial` |
| **Pontos Cegos** | Marcadores vermelho/amarelo | `camera_gaps.gaps` |

Polígonos FM são coloridos dinamicamente pelo score recalculado com os pesos atuais.

#### `AreaPanel` — 6 Tabs

| Tab | Mapeamento ao Briefing | Dados consumidos |
|---|---|---|
| **EscalaTab** | Pergunta 3 (modelo de emprego FM) | `stats`, `score`, alocação de 600 agentes |
| **OverviewTab** | Seções 1-4 do relatório | `stats`, `hora_distribution`, `dia_distribution`, `modus_operandi`, `fatores_por_orgao` |
| **TrechosTab** | Seção 5 (Painel de Coincidências) | `top_trechos`, `bingo_layers` |
| **DenunciasTab** | Seção 4.1 (dados qualitativos) | `relatos_sample`, `denuncias_por_bairro` |
| **InteligenciaTab** | Seção 2 (Dinâmica Criminal) | `relint`, `dominio_territorial` |
| **RelatorioTab** | Seção 6 (Relatório completo) | Todos os dados + síntese Claude |

#### `ComparativoPage`

Visão cross-area com radar chart (5 eixos normalizados), tabela de ranking e bar chart de crimes — com toggle Absoluto/Per Capita. Respeita pesos dos sliders em tempo real.

#### `RiskSignals`

8 regras baseadas em limiares para detecção automática de riscos:

| Regra | Nível | Condição |
|---|---|---|
| Alto volume criminal | Critico | Crimes acima da mediana entre áreas |
| Sem câmeras | Critico | `cameras_total === 0` |
| Alto índice noturno | Alerta | `pct_noturno > 60%` |
| Proximidade ORCRIM | Critico | `dominio_territorial.length > 5` |
| Sem RELINT | Alerta | `relint_disponivel === false` |
| Alta densidade de fatores | Alerta | Top 3 em fatores urbanos |
| Triple bingo elevado | Critico | `n_triple_bingo > 3` |
| Pontos cegos de câmera | Alerta | `camera_gaps.gaps.length > 3` |

---

## 6. O Motor de Coincidências ("Bingo")

O conceito central extraído da seção 5 do briefing: a identificação automática de sobreposições entre camadas de análise.

### Três Camadas

| Camada | Fonte de dados | Indicadores |
|---|---|---|
| **Mancha Criminal** | Ocorrências ISP | Densidade de roubos/furtos no trecho, pico horário |
| **Fator Urbano** | Fatores urbanos | Iluminação deficiente, vegetação, obstrução, PSR |
| **Dinâmica Criminal** | Disque Denúncia | Relatos de crime, modus operandi, sinais de atividade |

### Algoritmo

Para cada trecho (logradouro normalizado) dentro de cada área FM:

1. **Crime**: o trecho aparece no ranking de ocorrências → `bingo_layers.crime = true`
2. **Fatores**: existe fator urbano no mesmo logradouro → `bingo_layers.fatores = true`
3. **Sinais**: existe denúncia do Disque Denúncia no trecho → `bingo_layers.sinais = true`

- `bingo_count = 2` → **Bingo 2/3** (alerta)
- `bingo_count = 3` → **Bingo 3/3** (máxima prioridade)

O resultado alimenta `n_bingo_trechos` e `n_triple_bingo` por área, usado no RiskSignals e na priorização de ações.

### Exemplo (do briefing — Bangu)

```
Mancha:   70 roubos, pico 21h-22h
RELINT:   "criminalidade oportunista difusa", receptação na entrada lateral do Shopping
Fatores:  vegetação encobrindo iluminação + ambulantes irregulares

→ Bingo 3/3 → Ação: poda urgente (Comlurb) + reforço FM noturno + operação SEOP
```

---

## 7. Camera Gap Analysis

Detecta **pontos cegos** na rede CIVITAS:

1. Projeta câmeras e crimes para CRS métrico (EPSG:31983)
2. Cria buffer de **50 m** ao redor de cada câmera
3. Identifica clusters de crimes **fora** da união dos buffers
4. Ranqueia gaps por volume de crimes descobertos
5. Classifica: **`instalar`** (câmera distante > 100 m) ou **`remanejar`** (≤ 100 m)

Output: lista de gaps com coordenadas, contagem de crimes descobertos e justificativa textual. Exibido como camada toggleável no mapa (marcadores vermelhos = instalar, amarelos = remanejar).

Endereça o **Desafio 4** do briefing (Otimização de Cobertura de Câmeras).

---

## 8. Papel da IA na Plataforma

Conforme a seção 7 do briefing, a IA não substitui o julgamento do gestor, mas **amplifica a capacidade analítica** da equipe:

### 8.1 Síntese Qualitativa da Dinâmica Criminal

A rota `/api/synthesize` envia para Claude um prompt estruturado contendo KPIs, trechos críticos, fatores, relatos e RELINT da área. O modelo retorna:

- **Parágrafo de dinâmica** (80-100 palavras): modalidade predominante, modus operandi, rotas de fuga, pontos de receptação
- **5-8 ações priorizadas**: órgão responsável, tipo de recurso, local, evidência, prazo e urgência

### 8.2 Cruzamento e Priorização

O plano de ação gerado pela IA respeita a lógica de coincidências: ações em trechos com bingo 3/3 recebem prioridade máxima. Cada ação inclui a evidência concreta (dados quantitativos) que a justifica.

### 8.3 Perguntas Norteadoras Automáticas

O relatório `.docx` gerado pela plataforma pré-popula as 4 perguntas norteadoras com diagnóstico baseado em dados e sugestão operacional — reduzindo o tempo de preparação do briefing analítico de horas para minutos.

---

## 9. Rotas da API

| Rota | Método | Função | Dependência |
|---|---|---|---|
| `/api/synthesize` | POST | Síntese de dinâmica criminal via Claude | `ANTHROPIC_API_KEY` |
| `/api/report` | POST | Geração de relatório `.docx` | Python 3.10+ + `python-docx` |

Documentação completa com exemplos cURL: **[API_REFERENCE.md](API_REFERENCE.md)**

---

## 10. Testes

### Backend — pytest (32 testes)

| Módulo | Testes | Escopo |
|---|---|---|
| `test_metrics.py` | 11 | Distribuições horárias/diárias, pico, noturno, trechos, evolução mensal |
| `test_modus.py` | 8 | Extração NLP de modus operandi e agregação de relatos |
| `test_scoring.py` | 4 | Normalização, bônus RELINT, soma do breakdown |
| `test_bingo.py` | 5 | Coincidência 2/3 e 3/3, contadores por área |
| `test_camera_gaps.py` | 4 | Pontos cegos, recomendações instalar/remanejar |

### Frontend — Vitest (19 testes)

| Módulo | Testes | Escopo |
|---|---|---|
| `scoring.test.ts` | 4 | `computeScore` com pesos default, zero, customizados, bônus RELINT |
| `helpers.test.ts` | 15 | `fmt`, `scoreColor`, `faccaoColor`, `shortName`, `cap`, labels |

```bash
cd eduardo/backend && pytest tests/ -v       # Backend
cd eduardo/frontend && npm run test:run       # Frontend
```

---

## 11. Estrutura de Diretórios

```
eduardo/
├── docs/
│   ├── ARCHITECTURE.md          ← este documento
│   ├── API_REFERENCE.md         ← documentação das rotas de API
│   ├── CONTRIBUTING.md          ← guia de contribuição e extensão
│   └── DATA_DICTIONARY.md      ← schema do areas_data.json
├── backend/
│   ├── data_pipeline.py         # Pipeline principal (12 fontes → JSON)
│   ├── generate_report.py       # Gerador de relatório .docx (formato CompStat)
│   ├── requirements.txt         # pandas, geopandas, python-docx, pytest
│   ├── areas_data.json          # Output do pipeline (~7 MB)
│   └── tests/                   # 32 testes pytest
│       ├── conftest.py          # Fixtures compartilhadas
│       ├── test_metrics.py
│       ├── test_modus.py
│       ├── test_scoring.py
│       ├── test_bingo.py
│       └── test_camera_gaps.py
└── frontend/
    ├── app/
    │   ├── page.tsx             # Dashboard principal (orquestrador)
    │   ├── types.ts             # Interfaces TypeScript centralizadas
    │   ├── globals.css          # Tema escuro com variáveis CSS
    │   ├── lib/
    │   │   ├── helpers.ts       # Formatação, cores, labels
    │   │   └── allocation.ts    # Modelo de alocação de 600 agentes FM
    │   ├── components/
    │   │   ├── TopHeader.tsx    # KPIs globais
    │   │   ├── Sidebar.tsx      # Ranking + sliders de peso
    │   │   ├── MapView.tsx      # MapLibre + 6 camadas (~1000 linhas)
    │   │   ├── AreaPanel.tsx    # Painel com 6 tabs
    │   │   ├── RiskSignals.tsx  # 8 regras de detecção de risco
    │   │   └── tabs/
    │   │       ├── EscalaTab.tsx
    │   │       ├── OverviewTab.tsx
    │   │       ├── TrechosTab.tsx
    │   │       ├── DenunciasTab.tsx
    │   │       ├── InteligenciaTab.tsx
    │   │       ├── RelatorioTab.tsx
    │   │       └── ComparativoPage.tsx
    │   └── api/
    │       ├── synthesize/route.ts  # Claude API
    │       └── report/route.ts      # Python .docx subprocess
    ├── public/
    │   └── areas_data.json      # Dados servidos estaticamente
    └── __tests__/               # 19 testes Vitest
```

---

## 12. Decisões Arquiteturais

| Decisão | Justificativa |
|---|---|
| **Pipeline offline (Python) → JSON estático** | Desacopla processamento pesado (GeoPandas, spatial joins) do frontend. Dashboard funciona sem backend Python rodando. |
| **Score determinístico com pesos ajustáveis** | Permite que gestores priorizem dimensões diferentes conforme a pauta da reunião, sem depender de modelos opacos. |
| **IA apenas para síntese qualitativa** | Scoring e cruzamentos são determinísticos e auditáveis. A IA agrega valor onde humanos mais gastam tempo: síntese textual e geração de recomendações contextualizadas. |
| **Tema escuro** | Ambiente operacional (salas de monitoramento) tipicamente usa telas escuras para reduzir fadiga visual em uso prolongado. |
| **EPSG:31983 para cálculos métricos** | Projeção UTM zona 23S para o Rio de Janeiro — permite calcular buffers em metros com precisão geográfica. |
| **Despacho via mailto:** | Integração zero-config com fluxo de email já existente nos órgãos municipais. Não requer infraestrutura adicional. |

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7 · Maio/2026*
