# Arquitetura — CompStat Municipal Eduardo

> Plataforma de inteligência criminal para análise operacional das 8 áreas da Força Municipal (FM) do Rio de Janeiro.

---

## 1. Visão Geral

O **CompStat Municipal Eduardo** integra **9 fontes de dados heterogêneas** (CSV, SHP, DOCX, XLSX) em um **único dashboard operacional** voltado à análise de criminalidade da Força Municipal do Rio de Janeiro.

A plataforma permite que analistas e gestores:

- Visualizem a distribuição espacial e temporal de crimes por área FM
- Comparem áreas com scoring ponderável em tempo real
- Identifiquem convergências de risco (bingo) e pontos cegos de câmera
- Sintetizem planos de ação via IA (Claude Sonnet 4.5)
- Exportem relatórios analíticos em Markdown, HTML e `.docx`

O fluxo principal é **offline-first**: o backend Python processa os dados brutos e gera `areas_data.json`; o frontend Next.js consome esse artefato e oferece interatividade no browser, com chamadas à API apenas para síntese de IA e geração de documentos.

---

## 2. Fluxo de Dados

```
Raw CSV/SHP/DOCX/XLSX → data_pipeline.py → areas_data.json → Next.js Frontend → Browser
                                                                    ↓
                                                           Claude API (synthesize)
                                                                    ↓
                                                           generate_report.py → .docx
```

### Etapa 1 — Carregamento (Loading)

O `data_pipeline.py` lê **9 fontes** a partir do diretório de dados (`--data-dir`):

| # | Fonte | Formato | Função |
|---|-------|---------|--------|
| 1 | **Ocorrências** | CSV | Crimes ISP 2020–2024; base do score e distribuições |
| 2 | **Disque Denúncia** | CSV | Relatos 2025 (roubo/furto); modus operandi via NLP |
| 3 | **Fatores Urbanos** | CSV | Pendências por órgão (Comlurb, RioLuz, etc.) |
| 4 | **Câmeras** | CSV (WKT) | Posições CIVITAS por área FM |
| 5 | **Polígonos FM** | SHP | Delimitação das 8 áreas da Força Municipal |
| 6 | **RELINTs** | DOCX | Relatórios de inteligência estruturados por área |
| 7 | **Domínio Territorial** | CSV (WKT) | Polígonos de facções (CV, TCP, ADA, Milícia) |
| 8 | **PSR** | XLSX | Censo de população em situação de rua |
| 9 | *(metadados)* | — | Identificação AISP/RISP, bases FM, subprefeituras |

Todos os pontos são filtrados para o bounding box do município do Rio (`lat: -23.2 a -22.7`, `lng: -43.9 a -43.0`).

### Etapa 2 — Joins Espaciais

Com **GeoPandas** e **Shapely**, cada registro pontual é atribuído a uma das **8 áreas FM** via operação *point-in-polygon* (`sjoin` com predicado `within`):

- Ocorrências → área FM
- Denúncias georreferenciadas → área FM
- Fatores urbanos → área FM
- Censo PSR → área FM

Denúncias sem coordenadas são tratadas por aproximação de bairro quando possível. Polígonos de domínio territorial são intersectados com a geometria de cada área.

### Etapa 3 — Métricas

Por área, o pipeline calcula:

- **Distribuições horárias e diárias** — histograma de ocorrências por hora (0–23h) e dia da semana
- **Modus operandi (NLP)** — extração por regex de padrões nos relatos do Disque Denúncia (`a_pe`, `motocicleta`, `armado`, `em_grupo`, etc.)
- **Top trechos** — agrupamento por logradouro normalizado (`locf_norm`), com breakdown por tipo de delito e hora de pico
- **Camera Gap Analysis** — detecção de clusters de crimes fora do buffer de 50 m das câmeras; recomendação `instalar` ou `remanejar`
- **Bingo / Coincidence Engine** — sobreposição de 3 camadas por trecho: crime + fatores urbanos + sinais (denúncias)

Métricas adicionais incluem evolução mensal (24 meses), amostragem de pontos para mapa, fatores agrupados por órgão e features de domínio territorial.

### Etapa 4 — Scoring

Modelo determinístico de **4 componentes ponderados** + bônus RELINT:

| Componente | Peso padrão | Lógica |
|------------|-------------|--------|
| **Mancha criminal** | 40 | Normalização linear pelo volume máximo de crimes entre áreas |
| **Pico horário** | 15 | Proporção das 3 horas mais críticas sobre o total (`peak_ratio × 15`) |
| **Fatores urbanos** | 25 | Normalização linear pelo volume máximo de fatores pendentes |
| **Dinâmica criminal** | 15 | Normalização linear pelo volume máximo de denúncias |
| **Bônus RELINT** | +5 | Adicionado quando há RELINT disponível para a área |

Score total: **0–100** (breakdown + bônus).

### Etapa 5 — Output

O resultado é serializado em **`areas_data.json`**, contendo:

- Metadados globais (totais, períodos, timestamp)
- Array de 8 áreas com stats, score, trechos, relatos, RELINT, camadas de mapa e gaps de câmera

Esse arquivo é copiado para `frontend/public/areas_data.json` e consumido pelo dashboard.

---

## 3. Stack Tecnológica

### Backend

| Tecnologia | Uso |
|------------|-----|
| **Python 3.10+** | Runtime do pipeline e gerador de relatórios |
| **Pandas** | Manipulação tabular, agregações, normalização |
| **GeoPandas** | Joins espaciais, buffers, reprojeção métrica (EPSG:31983) |
| **Shapely** | Geometrias, WKT, point-in-polygon |
| **python-docx** | Geração do Relatório Analítico de Área (.docx) |
| **pytest** | Testes unitários (32 testes em 5 módulos) |

### Frontend

| Tecnologia | Uso |
|------------|-----|
| **Next.js 16** (App Router) | Framework React com rotas de API server-side |
| **TypeScript** | Tipagem estática (`types.ts`) |
| **Tailwind CSS v4** | Estilização utilitária + variáveis CSS customizadas |
| **MapLibre GL** | Mapa interativo com 6 camadas de dados |
| **Recharts** | Gráficos de radar, barras e distribuições |
| **Vitest** | Testes unitários (19 testes em 2 módulos) |

### Inteligência Artificial

| Serviço | Modelo | Uso |
|---------|--------|-----|
| **Anthropic API** | Claude Sonnet 4.5 | Síntese de dinâmica criminal e plano de ação executivo (5–8 ações por órgão) |

---

## 4. Arquitetura de Componentes (Frontend)

```
page.tsx
├── TopHeader (KPIs globais)
├── Sidebar (ranking + sliders de peso)
├── MapView (MapLibre + 6 camadas toggleáveis)
├── AreaPanel (painel detalhado)
│   ├── EscalaTab
│   ├── OverviewTab (+ RiskSignals)
│   ├── TrechosTab (+ bingo badges)
│   ├── DenunciasTab
│   ├── InteligenciaTab
│   └── RelatorioTab (+ AnalyticalReport)
└── ComparativoPage (radar, ranking, bar chart)
```

### `page.tsx` — Orquestrador

- Carrega `areas_data.json` via `fetch` no mount
- Gerencia estado global: área selecionada, pesos de scoring, toggle Comparativo/Mapa
- Propaga `weights` para Sidebar, MapView, AreaPanel e ComparativoPage

### `TopHeader`

KPIs agregados: total de crimes, denúncias, fatores urbanos, câmeras, PSR e áreas monitoradas.

### `Sidebar`

- Ranking das 8 áreas recalculado em tempo real conforme sliders de peso
- Sliders para Mancha (40), Pico (15), Fatores (25) e Dinâmica (15)
- Botão de reset para pesos padrão
- Indicador visual de RELINT disponível

### `MapView`

MapLibre GL com estilo CARTO Dark Matter. Camadas toggleáveis:

1. **Crime** — heatmap/pontos de ocorrências amostradas
2. **Fatores Urbanos** — pontos verdes por órgão
3. **Câmeras** — posições CIVITAS
4. **PSR** — censo de população em situação de rua
5. **Domínio Territorial** — polígonos coloridos por facção
6. **Gaps de Câmera** — marcadores vermelhos/amarelos em pontos cegos

Polígonos das áreas FM são coloridos pelo score recalculado com os pesos atuais.

### `AreaPanel`

Painel lateral (420 px) com 6 abas:

| Aba | Conteúdo |
|-----|----------|
| **EscalaTab** | Alocação sugerida de 600 agentes por área, turnos e janelas horárias |
| **OverviewTab** | KPIs, gráficos temporais, modus operandi + componente **RiskSignals** |
| **TrechosTab** | Top 10 logradouros com badges de bingo (2/3 ou 3/3 camadas) |
| **DenunciasTab** | Relatos reais do Disque Denúncia com tags de modus operandi |
| **InteligenciaTab** | Domínio territorial, facções e RELINT estruturado |
| **RelatorioTab** | Síntese Claude, plano de ação, export `.docx` + **AnalyticalReport** |

### `ComparativoPage`

Visão cross-area acessível pelo botão "Comparativo":

- **Radar chart** — 5 dimensões normalizadas (crimes, score, fatores, câmeras, bingo)
- **Tabela de ranking** — estilizada com cores por score
- **Bar chart** — volume de crimes por área com gradiente de intensidade

---

## 5. Modelo de Scoring

### Componentes

#### 1. Mancha Criminal (0–40)

Normalização **min-max relativa** entre as 8 áreas:

```
mancha = (crimes_da_área / max_crimes) × 40
```

Mede a concentração absoluta de ocorrências ISP na área.

#### 2. Pico Horário (0–15)

Calculado no backend como `peak_ratio`: soma das 3 horas com mais ocorrências dividida pelo total horário.

```
pico = peak_ratio × 15
```

Valores altos indicam concentração temporal — útil para alocação de patrulhamento.

#### 3. Fatores Urbanos (0–25)

Normalização min-max do volume de fatores urbanos pendentes:

```
fatores = (fatores_da_área / max_fatores) × 25
```

#### 4. Dinâmica Criminal (0–15)

Normalização min-max do volume de denúncias do Disque Denúncia:

```
dinamica = (denúncias_da_área / max_denúncias) × 15
```

Captura sinais recentes de criminalidade reportada pela população.

### Bônus RELINT (+5)

Adicionado quando existe um relatório de inteligência (DOCX) parseado para a área. Reflete disponibilidade de contexto qualitativo para tomada de decisão.

### Re-ranking ao Vivo (Sliders)

O backend pré-calcula o **breakdown normalizado** (0–40, 0–15, 0–25, 0–15). O frontend recalcula o score final aplicando pesos customizados:

```
score = Σ (breakdown_i / max_i) × (peso_i / Σpesos) × 100 + relint_bonus
```

Onde `max_i` são os tetos originais (40, 15, 25, 15).

**Exemplo:** aumentar o slider de Mancha para 80 e zerar Pico faz com que áreas com alto volume de crimes subam no ranking, mesmo que tenham pico horário baixo.

Essa lógica é replicada em `Sidebar`, `MapView`, `ComparativoPage` e `allocation.ts` (EscalaTab), garantindo consistência visual instantânea.

---

## 6. Features Novas (adicionadas)

### Camera Gap Analysis

Detecta **pontos cegos** na rede CIVITAS:

1. Projeta câmeras e crimes para CRS métrico (EPSG:31983)
2. Cria buffer de **50 m** ao redor de cada câmera
3. Identifica clusters de crimes **fora** da união dos buffers
4. Ranqueia gaps por volume de crimes descobertos
5. Recomenda **`instalar`** (câmera distante > 100 m) ou **`remanejar`** (≤ 100 m)

Output: objeto `camera_gaps` por área com lista de gaps, justificativas e coordenadas.

### Bingo / Coincidence Engine

Motor de coincidência em **3 camadas** por trecho (logradouro):

| Camada | Fonte |
|--------|-------|
| Crime | Ocorrências ISP no trecho |
| Fatores | Fatores urbanos no mesmo logradouro |
| Sinais | Denúncias do Disque Denúncia no trecho |

- **Bingo 2/3** — duas camadas convergentes (`n_bingo_trechos`)
- **Triple Bingo 3/3** — convergência total (`n_triple_bingo`)

Badges visuais em TrechosTab e contagem em RiskSignals.

### Cross-Area Comparison (ComparativoPage)

Comparação simultânea das 8 áreas:

- Gráfico radar com 5 eixos normalizados
- Tabela ranking com score recalculado e breakdown visual
- Bar chart de crimes com gradiente de cor por intensidade

Respeita os pesos dos sliders em tempo real.

### Automated Risk Signals

Componente `RiskSignals` com **8 regras baseadas em limiares**:

| Regra | Nível | Condição |
|-------|-------|----------|
| Alto volume criminal | 🔴 | Crimes acima da mediana entre áreas |
| Sem câmeras | 🔴 | `cameras_total === 0` |
| Alto índice noturno | 🟡 | `pct_noturno > 60%` |
| Proximidade ORCRIM | 🔴 | `dominio_territorial.length > 5` |
| Sem RELINT | 🟡 | `relint_disponivel === false` |
| Alta densidade de fatores | 🟡 | Top 3 em fatores urbanos no sistema |
| Triple bingo elevado | 🔴 | `n_triple_bingo > 3` |
| Pontos cegos de câmera | 🟡 | `camera_gaps.gaps.length > 3` |

### In-Browser Analytical Report

Componente `AnalyticalReport` em RelatorioTab gera relatório Markdown de **9 seções**:

1. Identificação da Área
2. Indicadores do Período
3. Distribuição por Tipo
4. Análise Temporal
5. Trechos Críticos
6. Coincidências (Bingo)
7. Fatores por Órgão
8. Dinâmica Criminal (IA)
9. Câmeras e Pontos Cegos

Download disponível em **Markdown** (`.md`) e **HTML** (`.html`).

### Camera Gaps Map Layer

Camada toggleável no MapLibre com marcadores **vermelhos** (instalar) e **amarelos** (remanejar) nos pontos cegos identificados, com popup de justificativa e distância à câmera mais próxima.

---

## 7. Rotas da API

### `POST /api/synthesize`

**Entrada:** JSON com dados da área selecionada (`nome`, `relint`, `stats`, `top_trechos`, `fatores`, `relatos`).

**Processamento:**

1. Monta prompt estruturado com KPIs, trechos, fatores, relatos e RELINT
2. Envia para **Claude Sonnet 4.5** via `@anthropic-ai/sdk`
3. Parseia resposta JSON (dinâmica + 5–8 ações priorizadas)

**Saída:** JSON com estrutura:

```json
{
  "dinamica": "Parágrafo de 80–100 palavras...",
  "acoes": [
    {
      "prioridade": 1,
      "urgencia": "imediata",
      "orgao": "GM-Rio",
      "tipo_recurso": "patrulha_moto",
      "acao": "...",
      "local": "...",
      "evidencia": "...",
      "prazo": "Esta semana"
    }
  ]
}
```

**Variável de ambiente:** `ANTHROPIC_API_KEY` em `frontend/.env.local`.

### `POST /api/report`

**Entrada:** JSON com `{ area, synthesis }` (dados da área + texto de dinâmica gerado pela IA).

**Processamento:**

1. Escreve payload temporário em `/tmp`
2. Executa `python3 ../backend/generate_report.py --input ... --output ...`
3. Lê o `.docx` gerado e remove arquivos temporários

**Saída:** Binary stream com `Content-Type: application/vnd.openxmlformats-officedocument.wordprocessingml.document` e header `Content-Disposition` para download.

O script `generate_report.py` produz o formato oficial CompStat com identificação institucional, indicadores, dinâmica, plano de ação por órgão e trechos prioritários.

---

## 8. Testes

### Backend — pytest

**Localização:** `backend/tests/`

| Módulo | Testes | Escopo |
|--------|--------|--------|
| `test_metrics.py` | 11 | Distribuições horárias/diárias, pico, noturno, trechos, evolução mensal |
| `test_modus.py` | 8 | Extração NLP de modus operandi e agregação de relatos |
| `test_scoring.py` | 4 | Normalização, bônus RELINT, soma do breakdown |
| `test_bingo.py` | 5 | Coincidência 2/3 e 3/3, contadores por área |
| `test_camera_gaps.py` | 4 | Pontos cegos, recomendações instalar/remanejar |

**Total: 32 testes**

```bash
cd eduardo/backend
pip install -r requirements.txt
pytest tests/ -v
```

Fixtures compartilhadas em `conftest.py` (`sample_crimes_df`, `sample_cameras_df`, `sample_fatores_df`).

### Frontend — Vitest

**Localização:** `frontend/__tests__/`

| Módulo | Testes | Escopo |
|--------|--------|--------|
| `scoring.test.ts` | 4 | `computeScore` com pesos default, zero, customizados e bônus RELINT |
| `helpers.test.ts` | 15 | `fmt`, `scoreColor`, `faccaoColor`, `shortName`, `cap`, labels de modus e órgãos |

**Total: 19 testes**

```bash
cd eduardo/frontend
npm install
npm run test:run    # execução única
npm test            # modo watch
```

### Executar ambos

```bash
# Backend
cd eduardo/backend && pytest tests/ -v

# Frontend
cd eduardo/frontend && npm run test:run
```

---

## Estrutura de Diretórios

```
eduardo/
├── docs/
│   └── ARCHITECTURE.md          ← este documento
├── backend/
│   ├── data_pipeline.py         # Pipeline principal (9 fontes → JSON)
│   ├── generate_report.py       # Gerador de relatório .docx
│   ├── requirements.txt
│   ├── areas_data.json          # Output do pipeline
│   └── tests/                   # 32 testes pytest
└── frontend/
    ├── app/
    │   ├── page.tsx             # Dashboard principal
    │   ├── types.ts             # Tipos TypeScript
    │   ├── lib/                 # helpers, allocation
    │   ├── components/          # UI (Header, Sidebar, Map, Panel)
    │   ├── api/
    │   │   ├── synthesize/      # Claude API
    │   │   └── report/          # Python .docx
    │   └── public/
    │       └── areas_data.json  # Dados servidos estaticamente
    └── __tests__/               # 19 testes Vitest
```

---

*Hackathon Claude Impact Lab Rio · Grupo 7 · Maio/2026*
