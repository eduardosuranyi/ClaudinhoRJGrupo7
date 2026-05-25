# Frontend — CompStat Municipal RJ

Dashboard operacional de inteligência criminal para o CompStat Municipal do Rio de Janeiro.

Construído com **Next.js 16** (App Router), **TypeScript**, **Tailwind CSS v4**, **MapLibre GL** e **Recharts**. Consome o artefato `areas_data.json` gerado pelo pipeline Python e oferece interatividade em tempo real com mapa, scoring ajustável e síntese via Claude.

---

## Quick Start

```bash
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev
# http://localhost:3000
```

O arquivo `public/areas_data.json` deve existir. Se ausente, gere-o com o pipeline:

```bash
cd ../backend
python data_pipeline.py --data-dir ../../data --output areas_data.json
cp areas_data.json ../frontend/public/areas_data.json
```

---

## Estrutura

```
frontend/
├── app/
│   ├── page.tsx                    # Orquestrador (estado global, fetch de dados)
│   ├── layout.tsx                  # Layout raiz (metadata, fonts)
│   ├── globals.css                 # Tema escuro + variáveis CSS
│   ├── types.ts                    # Interfaces TypeScript (Area, RioContext, MapControl, etc.)
│   ├── lib/
│   │   ├── helpers.ts              # Formatação, cores, labels
│   │   ├── allocation.ts           # Modelo de alocação de 600 agentes FM
│   │   ├── censoData.ts            # Censo 2022 (IBGE) server-side loader
│   │   ├── routing.ts              # Roteamento por ruas (grafo IBGE)
│   │   ├── areasData.ts            # Loader de areas_data.json
│   │   ├── ontologyScore.ts        # Score ontológico (valente)
│   │   └── ontologyEvents.ts       # Eventos NER / ontologia
│   ├── hooks/
│   │   └── useMapAgent.ts          # Hook do agente investigativo (tool handlers)
│   ├── components/
│   │   ├── TopHeader.tsx           # KPIs globais + "Investigar todas as áreas"
│   │   ├── Sidebar.tsx             # Ranking + sliders de peso
│   │   ├── MapView.tsx             # MapLibre GL + 13 camadas + Rio Inteiro + choropleth
│   │   ├── AreaPanel.tsx           # Painel detalhado (5 tabs + card Demografia)
│   │   ├── AgentPanel.tsx          # Chat do agente investigativo (streaming)
│   │   ├── OntologyScorePanel.tsx  # Score ontológico por área
│   │   ├── RiskSignals.tsx         # 8 regras de detecção de risco
│   │   └── tabs/
│   │       ├── EscalaTab.tsx       # Alocação FM por turno
│   │       ├── OverviewTab.tsx     # KPIs, gráficos, modus, pop/capita
│   │       ├── TrechosTab.tsx      # Top trechos + bingo
│   │       ├── DenunciasTab.tsx    # Disque Denúncia
│   │       ├── InteligenciaTab.tsx # RELINT + domínio + download .docx
│   │       ├── RelatorioTab.tsx    # Síntese IA + export
│   │       └── ComparativoPage.tsx # Comparação cross-area
│   └── api/
│       ├── agent/route.ts          # Agente investigativo SSE (~42 tools)
│       ├── censo/route.ts          # Censo 2022 GeoJSON / dados por bairro
│       ├── route/route.ts          # Roteamento por ruas (grafo IBGE)
│       ├── score/route.ts          # Ontology score + alocação
│       ├── relint/route.ts         # Geração RELINT .docx (Haiku)
│       ├── synthesize/route.ts     # Claude: dinâmica criminal
│       └── report/route.ts         # Python: relatório .docx
├── __tests__/                      # 93 testes Vitest (7 suites)
├── public/
│   ├── areas_data.json             # Dados por área FM (~7 MB)
│   └── rio_context.json            # Camadas Rio inteiro (~10 MB, lazy-loaded)
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

---

## Scripts

| Comando | Ação |
|---|---|
| `npm run dev` | Servidor de desenvolvimento (http://localhost:3000) |
| `npm run build` | Build de produção |
| `npm run start` | Servidor de produção |
| `npm run test:run` | Testes Vitest (execução única) |
| `npm test` | Testes Vitest (modo watch) |

---

## Variáveis de Ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | Para síntese IA e agente | Chave da API Anthropic (Claude Sonnet 4.6 / Haiku 4.5) |

Definir em `.env.local` (gitignored).

---

## Testes

93 testes unitários em 7 suites:

```bash
npm run test:run
```

| Módulo | Testes | Escopo |
|---|---|---|
| `agentRoute.test.ts` | 29 | `/api/agent`, ToolLoopAgent, query tools, inventário de ~42 tools |
| `useMapAgent.test.ts` | 26 | `executeMapTool` — handlers de todas as map tools |
| `helpers.test.ts` | 15 | Formatação, cores, labels |
| `censoData.test.ts` | 10 | Censo 2022 loader, normalização, região, proximidade |
| `ontologyEvents.test.ts` | 5 | `loadOntologyEventsForArea` caching |
| `scoring.test.ts` | 4 | `computeScore` com pesos variados |
| `routing.test.ts` | 4 | `computeRoute` roteamento por ruas IBGE |

---

## Documentação Completa

- [README principal](../README.md) — visão geral, funcionalidades, como rodar
- [Arquitetura](../docs/ARCHITECTURE.md) — componentes, fluxo de dados, decisões
- [API Reference](../docs/API_REFERENCE.md) — 7 rotas: agent, synthesize, report, relint, route, censo, score
- [Dicionário de Dados](../docs/DATA_DICTIONARY.md) — schema do `areas_data.json`
- [Contribuição](../docs/CONTRIBUTING.md) — como adicionar camadas, tabs, métricas

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7*
