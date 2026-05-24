# CompStat Municipal RJ — Plataforma de Inteligência Criminal

**Hackathon Claude Impact Lab Rio · Grupo 7 · Maio 2026**

Plataforma de inteligência criminal desenvolvida para o CompStat Municipal da Prefeitura do Rio de Janeiro. Integra **12 fontes de dados** (9 oficiais + 3 externas), cruza automaticamente mancha criminal, fatores urbanos e dinâmica criminal, identifica **coincidências de alto risco** e gera o **Relatório Analítico de Área** em `.docx` — reduzindo de horas para minutos a preparação das reuniões semanais do CompStat.

---

## O Desafio

O **CompStat Municipal** é o modelo de gestão de segurança pública da Prefeitura do Rio de Janeiro. Inspirado no CompStat do NYPD e adaptado à realidade municipal, opera sobre **cinco eixos**:

1. **Mapeamento sistemático** de furtos e roubos por segmento de rua, horário e padrão
2. **22 áreas prioritárias** (polígonos) com maior concentração de incidência criminal
3. **Emprego estratégico da Força Municipal (FM)** — patrulhamento preventivo com câmeras corporais, GPS e monitoramento em tempo real
4. **Atuação sobre fatores urbanos** — iluminação, vegetação, obstrução de calçada, desordem urbana, PSR, com envolvimento dos órgãos municipais (Comlurb, SEOP, CET-Rio, SMAS, SMS, RioLuz, Seconserva)
5. **Reuniões semanais de responsabilização** e tomada de decisão integrada entre órgãos

### O Problema

Os dados operacionais vivem em **silos distintos** — ocorrências georreferenciadas, denúncias qualitativas do Disque Denúncia, relatórios de inteligência (RELINTs), fatores urbanos e polígonos de atuação — sem cruzamento automatizado. A produção de cada Relatório Analítico de Área que subsidia a reunião semanal demanda **horas de trabalho manual** de compilação, análise e formatação.

O problema tem três dimensões:

| Dimensão | Descrição |
|---|---|
| **Volume e heterogeneidade** | Dados quantitativos (CSV com lat/long), qualitativos (DOCX, texto livre), geoespaciais (SHP) e de fatores urbanos em silos distintos |
| **Ausência de cruzamento** | Não existe mecanismo que sobreponha mancha criminal aos fatores urbanos e dinâmica qualitativa para identificar onde múltiplos fatores de risco coincidem |
| **Dependência de esforço manual** | O tempo em compilação subtrai capacidade analítica das equipes, que deveriam focar na interpretação e tomada de decisão |

### A Solução

Esta plataforma endereça as três dimensões simultaneamente:

1. **Integra automaticamente** as 5 fontes de dados do CompStat (ocorrências, Disque Denúncia, RELINTs, fatores urbanos, polígonos FM) + 4 fontes de enriquecimento
2. **Cruza a mancha criminal** (quantitativa) com fatores urbanos e dinâmica criminal (qualitativa) para identificar **coincidências de alto risco** — o "bingo" — onde crime, fator ambiental e padrão de horário se sobrepõem
3. **Gera automaticamente** os Relatórios Analíticos de Área em `.docx`, seguindo o formato oficial do CompStat
4. **Utiliza IA** (Claude Sonnet 4.5) para sintetizar dinâmica criminal, responder as 4 perguntas norteadoras e sugerir cobertura da FM e resolução de fatores urbanos pelos órgãos

---

## As 4 Perguntas Norteadoras

O relatório do CompStat é organizado em torno de perguntas que a equipe responde para cada área. A plataforma responde automaticamente com base nos dados:

| Pergunta | Como a plataforma responde |
|---|---|
| **Locais de maior incidência criminal estão coincidindo com a rota da FM?** | Top trechos críticos ranqueados por volume, com coordenadas e sobreposição sobre polígonos FM |
| **Horário de maior incidência criminal coincide com o QMD (horário de cobertura)?** | Análise temporal com pico horário, percentual noturno e distribuição por dia da semana |
| **Dinâmica criminal coincide com o modelo de emprego da FM?** | Síntese qualitativa via IA dos RELINTs e Disque Denúncia — identifica se roubos são a pé, moto ou em grupo para sugerir modalidade de patrulha |
| **Fatores urbanos relevantes estão sendo resolvidos pelos órgãos?** | Fatores agrupados por órgão responsável com despacho por email pré-preenchido |

---

## O Motor de Coincidências ("Bingo")

O conceito central da plataforma é a **identificação automática de coincidências entre camadas de análise**. Quando dois ou mais indicadores de risco coincidem em um mesmo trecho, a plataforma sinaliza o "bingo":

| Camada | Indicadores |
|---|---|
| **Mancha Criminal** | Alta densidade de roubos/furtos; pico horário definido; logradouro no topo do ranking |
| **Fator Urbano** | Iluminação deficiente; vegetação encobrindo postes; obstrução de calçada; PSR; pontos cegos de câmera |
| **Dinâmica Criminal** | Crime noturno oportunista; área de receptação; fuga para comunidade adjacente; uso de ambulantes como cobertura |

- **Bingo 2/3** — duas camadas convergentes
- **Bingo 3/3** — convergência total (máxima prioridade de ação)

**Exemplo prático** (extraído do briefing): Em Bangu, dados quantitativos mostram 70 roubos com pico às 21h-22h. O RELINT descreve criminalidade oportunista com ponto de receptação na entrada lateral do Shopping. Fatores urbanos registram vegetação encobrindo iluminação e ambulantes irregulares. O cruzamento gera a ação: **poda urgente (Comlurb) + reforço FM noturno + operação SEOP**.

---

## Stack Tecnológica

| Camada | Tecnologia | Papel |
|---|---|---|
| **Pipeline de dados** | Python 3.10+ · Pandas · GeoPandas · Shapely | Ingestão de 12 fontes, joins espaciais, scoring, geração de JSON |
| **Frontend** | Next.js 16 (App Router) · TypeScript · Tailwind v4 | Dashboard operacional com mapa interativo |
| **Mapas** | MapLibre GL | 6 camadas toggleáveis com polígonos coloridos por score |
| **Gráficos** | Recharts | Radar, barras, distribuições temporais |
| **IA** | Anthropic Claude Sonnet 4.5 | Síntese qualitativa da dinâmica criminal e plano de ação |
| **Relatório** | python-docx | Geração do `.docx` no formato oficial CompStat |
| **Testes** | pytest (32 testes) · Vitest (19 testes) | Cobertura do pipeline e componentes |

---

## Estrutura do Projeto

```
eduardo/
├── README.md                          # Este documento
├── CHANGELOG.md                       # Histórico de alterações
├── docs/
│   ├── ARCHITECTURE.md                # Arquitetura detalhada e decisões técnicas
│   ├── API_REFERENCE.md               # Documentação das rotas de API
│   ├── CONTRIBUTING.md                # Guia de contribuição e extensão
│   └── DATA_DICTIONARY.md            # Schema completo do areas_data.json
├── data/                              # Datasets integrados (12 fontes)
│   ├── clean/                         # 8 datasets oficiais limpos (Parquet/GeoJSON/JSON)
│   ├── external/                      # 7 fontes públicas de enriquecimento
│   ├── processed/                     # KPIs e spatial joins intermediários
│   ├── artifacts/                     # Pacotes CompStat por área (10 × 7 arquivos)
│   ├── config/                        # area_registry.json (backbone de junção)
│   └── README.md                      # Documentação completa dos dados
├── backend/
│   ├── data_pipeline.py               # 12 fontes → spatial joins → scoring → JSON
│   ├── generate_report.py             # Gerador de relatório .docx (formato CompStat)
│   ├── requirements.txt               # Dependências Python
│   ├── areas_data.json                # Output do pipeline (artefato principal)
│   └── tests/                         # 32 testes pytest (métricas, bingo, scoring, gaps)
└── frontend/
    ├── app/
    │   ├── page.tsx                    # Orquestrador principal do dashboard
    │   ├── types.ts                    # Interfaces TypeScript centralizadas
    │   ├── lib/                        # helpers.ts, allocation.ts (escala FM)
    │   ├── components/
    │   │   ├── TopHeader.tsx           # KPIs globais consolidados
    │   │   ├── Sidebar.tsx             # Ranking de áreas + sliders de peso
    │   │   ├── MapView.tsx             # MapLibre + 6 camadas toggleáveis
    │   │   ├── AreaPanel.tsx           # Painel detalhado com 6 tabs
    │   │   ├── RiskSignals.tsx         # 8 regras de detecção automática de risco
    │   │   └── tabs/                   # Escala, Dados, Trechos, Denúncias, Intel, Relatório
    │   └── api/
    │       ├── synthesize/route.ts     # Claude sintetiza dinâmica criminal
    │       └── report/route.ts         # Python gera .docx via subprocess
    ├── public/areas_data.json          # Dados servidos estaticamente ao browser
    └── __tests__/                      # 19 testes Vitest
```

---

## Como Rodar

### Pré-requisitos

| Ferramenta | Versão | Observação |
|---|---|---|
| Python | 3.10+ | Pipeline de dados e gerador de relatório |
| Node.js | 20+ | Frontend Next.js |
| Chave Anthropic | — | Em `frontend/.env.local`: `ANTHROPIC_API_KEY=sk-ant-...` |

### Dados

Os dados já estão incluídos em `data/` dentro deste projeto. O pipeline aceita **duas estruturas** via `--data-dir`:

| Layout | Caminho | Formato | Quando usar |
|---|---|---|---|
| **Dados integrados** (padrão) | `../data` | Parquet em `data/clean/` | Dados já incluídos neste projeto |
| **Pacote legacy** | `../../compstat` | CSV/XLSX/SHP/DOCX originais | Clone do `claude_impact_lab_compstat_rio` |

### Backend

```bash
cd eduardo/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Usando dados incluídos no projeto (padrão)
python data_pipeline.py --data-dir ../data --output areas_data.json

# Ou usando pacote CSV original do hackathon
# python data_pipeline.py --data-dir ../../compstat --output areas_data.json

cp areas_data.json ../frontend/public/areas_data.json
```

### Frontend

```bash
cd eduardo/frontend
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local  # sua chave Anthropic
npm run dev
# Abrir http://localhost:3000
```

---

## Funcionalidades

### Mapa Interativo

- Polígonos das 8 áreas FM coloridos dinamicamente pelo score
- **6 camadas toggleáveis**: mancha criminal (heatmap), fatores urbanos (por órgão), câmeras CIVITAS, censo PSR, domínio territorial (por facção), pontos cegos
- Marcadores numerados dos trechos críticos ao selecionar uma área
- Click em polígono abre painel completo de análise

### Painel de Análise (6 Tabs)

| Tab | Conteúdo | Correspondência no Briefing |
|---|---|---|
| **Escala** | Alocação sugerida de 600 GM por turno, janelas horárias por área | Pergunta 3: modelo de emprego da FM |
| **Dados** | 12 KPIs + tipos de crime + distribuição horária/diária + modus operandi + fatores por órgão + evolução mensal | Seções 1-3 do Relatório Analítico |
| **Trechos** | Top 10 logradouros com breakdown por tipo, pico horário e badges de bingo (2/3, 3/3) | Seção 5: Painel de Coincidências |
| **Denúncias** | DD por bairro + relatos com modus operandi e perfil de suspeito + cenas de drogas | Seção 4.1: dados qualitativos |
| **Inteligência** | Domínio territorial (CV/TCP/ADA/Milícia) + RELINT estruturado | Seção 2: Dinâmica Criminal |
| **Relatório** | Síntese via Claude + plano de ação por órgão + despacho por email + export `.docx` | Seção 6: Relatório Analítico completo |

### Score Determinístico com Pesos Ajustáveis

4 componentes ponderáveis em tempo real via sliders:

| Componente | Peso padrão | O que mede |
|---|---|---|
| **Mancha criminal** | 40 | Volume absoluto de ocorrências ISP |
| **Pico horário** | 15 | Concentração temporal nas 3 horas de pico |
| **Fatores urbanos** | 25 | Pendências ambientais por resolver |
| **Dinâmica criminal** | 15 | Volume de denúncias do Disque Denúncia |
| **Bônus RELINT** | +5 | Disponibilidade de relatório de inteligência |

O mapa recolore instantaneamente ao ajustar os pesos, permitindo que gestores priorizem diferentes dimensões conforme a pauta da reunião.

### Botão Despachar

Cada fator urbano gera **email pré-preenchido** para o órgão responsável (Comlurb, RioLuz, SEOP, Seconserva, SMAS, CET-Rio, GM-Rio, SMTR) com endereço do trecho, score de prioridade e solicitação de prazo — operacionalizando diretamente as ações do plano.

### Relatório `.docx` Automático

Formato oficial do CompStat com todas as seções do Relatório Analítico de Área:

1. Identificação da Área (AISP, DP, BPM, domínio territorial, base FM, subprefeitura)
2. Indicadores do Período (volume, ranking, evolução)
3. Distribuição por Tipo de Ocorrência
4. Análise Temporal (hora/dia, período predominante)
5. Dinâmica Criminal (síntese qualitativa gerada por IA)
6. Fatores de Incidência Criminal (por órgão responsável)
7. Painel de Coincidências (cruzamento automático)
8. Plano de Ação e Responsabilização (gerado por IA, validado na reunião)

---

## Fontes de Dados

### Oficiais do Hackathon

| # | Fonte | Volume | Tipo | Uso na Plataforma |
|---|---|---|---|---|
| 1 | Ocorrências ISP 2020-2024 | 115.318 | Quantitativo | Score, distribuições, mapa de calor, trechos críticos |
| 2 | Disque Denúncia 2025 | 8.770 (R/F) + 9.168 (drogas) | Qualitativo — dinâmica criminal | Relatos, modus operandi, dinâmica, fator SMAS |
| 3 | Fatores Urbanos 2026 | 2.085 | Qualitativo — fatores urbanos | Score, despacho por órgão, camada no mapa |
| 4 | Câmeras CIVITAS | 985 | Operacional | KPI, camada no mapa, gap analysis |
| 5 | Polígonos Área FM | 8 | Geoespacial — operacional | Spatial join, delimitação de áreas |
| 6 | RELINTs | 8 | Qualitativo — inteligência | Síntese IA, bônus de score, contexto operacional |
| 7 | Domínio Territorial | 1.260 | Geoespacial | Camada no mapa, identificação de facções |
| 8 | Censo PSR | 23.332 | Social | KPI, camada no mapa, fator de incidência |

### Externas (Enriquecimento)

| # | Fonte | Arquivo | Volume | Uso |
|---|---|---|---|---|
| 9 | Bairros (data.rio) | `data/external/bairros_rio.geojson` | 166 | Contexto geográfico, subprefeitura |
| 10 | Censo 2022 (data.rio) | `data/external/censo_2022_bairros.geojson` | 165 | População residente, crimes per capita |
| 11 | Central 1746 (BigQuery) | `data/external/chamados_1746_fm.csv` | Opcional | Validação de fatores por demanda cidadã |

---

## Funcionalidades Avançadas

| Funcionalidade | Descrição | Referência no Briefing |
|---|---|---|
| **Camera Gap Analysis** | Detecta áreas sem cobertura de câmeras (buffer 50m), classifica entre `instalar` e `remanejar` | Desafio 4: Otimização de Cobertura de Câmeras |
| **Bingo / Coincidência de Camadas** | Trechos com sobreposição crime + fatores + sinais, com badges 2/3 e 3/3 | Seção 5: Lógica de Análise |
| **Comparativo Cross-Area** | Radar multidimensional, ranking com gradiente, bar chart Absoluto/Per Capita | Painel de gestão consolidado (seção 10.5) |
| **Sinais de Risco Automatizados** | 8 regras de detecção (alto volume, sem câmeras, % noturno, ORCRIM, etc.) | Coincidências de alto risco (seção 3) |
| **Relatório In-Browser** | 9 seções completas visualizáveis no dashboard, download em `.md` e `.html` | Seção 6.1: Estrutura do Relatório |
| **Enriquecimento com Censo 2022** | População residente, crimes per capita por 1.000 hab | Normalização per capita para comparação justa |
| **Perfil de Suspeito** | Extraído dos envolvidos do Disque Denúncia (sexo, idade, pele) | Seção 7.1: Síntese qualitativa |
| **Marcadores de Trechos** | Top trechos aparecem como marcadores numerados ao selecionar área | Seção 6: Mapa de Calor |
| **Escala FM** | Modelo de alocação de 600 agentes com distribuição proporcional ao score | Seção 7.3: Perguntas norteadoras |

---

## Testes

```bash
# Backend (32 testes: métricas, modus, scoring, bingo, camera gaps)
cd eduardo/backend
python -m pytest tests/ -v

# Frontend (19 testes: scoring, helpers, componentes)
cd eduardo/frontend
npm run test:run
```

---

## Documentação

| Documento | Conteúdo |
|---|---|
| [Dados](data/README.md) | O que fizemos com os dados: limpeza, enriquecimento, spatial joins, pacotes CompStat |
| [Arquitetura](docs/ARCHITECTURE.md) | Fluxo de dados, componentes, decisões técnicas, mapeamento ao briefing |
| [Dicionário de Dados](docs/DATA_DICTIONARY.md) | Schema completo do `areas_data.json`, fontes de entrada, modus operandi |
| [Referência da API](docs/API_REFERENCE.md) | Rotas `/api/synthesize` e `/api/report` com exemplos cURL |
| [Guia de Contribuição](docs/CONTRIBUTING.md) | Setup, convenções, como adicionar camadas/tabs/métricas |
| [Changelog](CHANGELOG.md) | Histórico detalhado de alterações por versão |

---

## Fluxo Operacional

A plataforma se integra ao ciclo semanal do CompStat conforme definido no briefing:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. ATUALIZAÇÃO        Dados de ocorrências, fatores urbanos,   │
│     (automática)       Disque Denúncia são atualizados          │
│                                  ↓                              │
│  2. PROCESSAMENTO      data_pipeline.py cruza as camadas,       │
│     (plataforma)       calcula scores, identifica bingos        │
│                                  ↓                              │
│  3. SÍNTESE IA         Claude sintetiza dinâmica criminal,      │
│     (plataforma)       responde perguntas norteadoras           │
│                                  ↓                              │
│  4. REVISÃO            Equipe CompStat valida análises,         │
│     (analista)         adiciona contexto não capturado          │
│                                  ↓                              │
│  5. REUNIÃO            Relatório apresentado, ações cobradas,   │
│     (gestores)         compromissos formalizados para o ciclo   │
│                                  ↓                              │
│  6. EXECUÇÃO           FM patrulha, órgãos resolvem fatores,    │
│     (campo)            status atualizado na plataforma          │
└─────────────────────────────────────────────────────────────────┘
```

---

## Impacto Esperado

| Para quem | Impacto |
|---|---|
| **Gestão CompStat** | Redução do tempo de relatório de horas para minutos; cobertura de todas as 22 áreas; decisões baseadas em dados cruzados |
| **Força Municipal** | Ajuste de QMD baseado em evidência de pico criminal; priorização de trechos por score; modelo de emprego (moto/pé/viatura) alinhado à dinâmica |
| **Órgãos Municipais** | Priorização objetiva de intervenções (poda, iluminação, ordenamento) baseada na sobreposição com a mancha criminal; ciclo de prestação de contas |

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7 · 24/05/2026*
