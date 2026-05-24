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
│   ├── types.ts                    # Interfaces TypeScript centralizadas
│   ├── lib/
│   │   ├── helpers.ts              # Formatação, cores, labels
│   │   └── allocation.ts           # Modelo de alocação de 600 agentes FM
│   ├── hooks/
│   │   └── useMapAgent.ts          # Hook para interação com agente IA no mapa
│   ├── components/
│   │   ├── TopHeader.tsx           # KPIs globais
│   │   ├── Sidebar.tsx             # Ranking + sliders de peso
│   │   ├── MapView.tsx             # MapLibre GL + 6 camadas
│   │   ├── AreaPanel.tsx           # Painel detalhado (6 tabs)
│   │   ├── AgentPanel.tsx          # Painel do agente IA
│   │   ├── AgentCheckpoint.tsx     # Checkpoints do agente
│   │   ├── RiskSignals.tsx         # 8 regras de detecção de risco
│   │   └── tabs/
│   │       ├── EscalaTab.tsx       # Alocação FM por turno
│   │       ├── OverviewTab.tsx     # KPIs, gráficos, modus
│   │       ├── TrechosTab.tsx      # Top trechos + bingo
│   │       ├── DenunciasTab.tsx    # Disque Denúncia
│   │       ├── InteligenciaTab.tsx # RELINT + domínio territorial
│   │       ├── RelatorioTab.tsx    # Síntese IA + export
│   │       └── ComparativoPage.tsx # Comparação cross-area
│   └── api/
│       ├── agent/route.ts          # Rota do agente IA
│       ├── synthesize/route.ts     # Claude: dinâmica criminal
│       └── report/route.ts         # Python: relatório .docx
├── __tests__/                      # 19 testes Vitest
├── public/
│   └── areas_data.json             # Dados do pipeline (~7 MB)
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
| `ANTHROPIC_API_KEY` | Para síntese IA | Chave da API Anthropic (Claude Sonnet 4.5) |

Definir em `.env.local` (gitignored).

---

## Testes

19 testes unitários em 4 módulos:

```bash
npm run test:run
```

| Módulo | Testes | Escopo |
|---|---|---|
| `scoring.test.ts` | 4 | `computeScore` com pesos variados |
| `helpers.test.ts` | 15 | Formatação, cores, labels |
| `agentRoute.test.ts` | — | Rota do agente IA |
| `useMapAgent.test.ts` | — | Hook de interação com agente |

---

## Documentação Completa

- [README principal](../README.md) — visão geral, funcionalidades, como rodar
- [Arquitetura](../docs/ARCHITECTURE.md) — componentes, fluxo de dados, decisões
- [API Reference](../docs/API_REFERENCE.md) — rotas `/api/synthesize` e `/api/report`
- [Dicionário de Dados](../docs/DATA_DICTIONARY.md) — schema do `areas_data.json`
- [Contribuição](../docs/CONTRIBUTING.md) — como adicionar camadas, tabs, métricas

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7*
