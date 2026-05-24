# ClaudinhoRJ Grupo 7 — Plataforma CompStat Municipal RJ

Plataforma de inteligência criminal para o CompStat Municipal do Rio de Janeiro.
Integra **9 fontes de dados** em uma única tela operacional, gera o **Relatório Analítico de Área** automaticamente em `.docx`, e permite **despachar fatores urbanos** com um clique para o órgão responsável.

## Stack

- **Backend**: Python 3 (Pandas + GeoPandas + python-docx)
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind + Maplibre GL + Recharts
- **IA**: Anthropic Claude Sonnet 4.5 (síntese de dinâmica criminal)

## Estrutura

```
eduardo/
├── backend/
│   ├── data_pipeline.py    # 9 fontes → spatial joins → scoring
│   ├── generate_report.py  # gera .docx CompStat
│   ├── requirements.txt
│   └── areas_data.json     # output do pipeline
├── frontend/
│   ├── app/
│   │   ├── page.tsx, layout.tsx, globals.css, types.ts
│   │   ├── lib/helpers.ts
│   │   ├── components/
│   │   │   ├── TopHeader.tsx   # KPIs globais
│   │   │   ├── Sidebar.tsx     # ranking + sliders de peso
│   │   │   ├── MapView.tsx     # Maplibre + 5 camadas toggleáveis
│   │   │   ├── AreaPanel.tsx   # painel detalhado com 5 tabs
│   │   │   └── tabs/{Overview,Trechos,Denuncias,Inteligencia,Relatorio}Tab.tsx
│   │   ├── api/
│   │   │   ├── synthesize/route.ts  # Claude sintetiza dinâmica
│   │   │   └── report/route.ts      # Python gera .docx
│   │   └── public/areas_data.json
│   └── package.json
└── README.md
```

## Como rodar

### Pré-requisitos
- Python 3.10+
- Node 20+
- Repositório de dados: **opcional**. Os Parquet já estão neste projeto em **`ClaudinhoRJGrupo7/data/clean/`** (é o uso padrão do pipeline ao rodar de `eduardo/backend`).  
  Para layout legacy com CSV nomeados igual ao hackathon, clone ao lado `git clone … compstat`.
- Chave da Anthropic em `frontend/.env.local`: `ANTHROPIC_API_KEY=sk-ant-...`

### Backend

Usa **`--data-dir` apontando para uma das duas estruturas:**

1. **Repositório Grupo 7** (pastas `clean/*.parquet` — padrão abaixo)  
   O caminho padrão de `data_pipeline.py` assume que você está em `eduardo/backend/` e que o clone contém **`data/clean/ocorrencias.parquet`**.

2. **Pacote legacy “compstat”** (CSV/XLSX/SHP + `relints/*.docx`, como na documentação hackathon original) — clone `claude_impact_lab_compstat_rio` como `compstat` e passe `--data-dir ../../compstat`.

```bash
cd eduardo/backend
pip install -r requirements.txt
# Dados já versionados neste repo (pastas clean/ — padrão)
python data_pipeline.py --data-dir ../../data --output areas_data.json

# Ou pacote CSV externo
# python data_pipeline.py --data-dir ../../compstat --output areas_data.json

cp areas_data.json ../frontend/public/areas_data.json
```

### Frontend
```bash
cd eduardo/frontend
npm install
npm run dev
# http://localhost:3000
```

## Features

### Mapa interativo
- Polígonos das 8 áreas FM coloridos por score
- 5 camadas toggleáveis: mancha criminal (heatmap), fatores urbanos (por órgão), câmeras CIVITAS, censo PSR, domínio territorial (por facção)
- Click abre painel de análise da área

### Painel de análise (5 tabs)
1. **Visão Geral** — 6 KPIs + tipos de crime + distribuição horária + dia da semana + modus operandi + evolução mensal
2. **Trechos** — top 10 com breakdown por tipo e pico horário
3. **Denúncias** — relatos reais do Disque Denúncia com modus operandi tagueado via NLP
4. **Inteligência** — domínio territorial das facções (CV/TCP/ADA/Milícia) + RELINT estruturado
5. **Relatório** — síntese via Claude + plano de ação com botão Despachar (mailto:) + export .docx

### Score determinístico
4 componentes ponderáveis ao vivo via sliders (mancha · pico · fatores · dinâmica) + bônus RELINT.
Mapa recolore em tempo real.

### Botão Despachar
Cada fator urbano gera email pré-preenchido para o órgão responsável (Comlurb, RioLuz, SEOP, SECONSERVA, SMAS, CET-Rio, GM-Rio, SMTR) com endereço, score, trechos críticos e solicitação de prazo.

### Relatório .docx
Formato oficial CompStat com identificação institucional, indicadores, dinâmica criminal sintetizada por IA, plano de ação por órgão e trechos prioritários.

## Dados utilizados

| Fonte | Volume | Uso |
|---|---|---|
| Ocorrências ISP 2020-2024 | 115.318 | score, distribuições, mapa |
| Disque Denúncia 2025 | 8.770 (R/F) | relatos, MO, dinâmica |
| Fatores Urbanos 2026 | 2.085 | score, despacho |
| Câmeras CIVITAS | 985 | KPI, camada |
| Polígonos Área FM | 8 | spatial join |
| RELINTs | 8 | inteligência, síntese |
| Domínio Territorial | 1.260 | camada, identificação |
| Censo PSR | 23.332 | KPI, camada |

## Features Novas

- **Camera Gap Analysis (Pontos Cegos)** — Detecta áreas sem cobertura de câmeras usando buffer de 50 m. Classifica cada ponto entre `instalar` e `remanejar`. Exibido como camada toggleável no mapa e na tab Dados.
- **Bingo / Coincidência de Camadas** — Identifica trechos onde crime, fatores urbanos e sinais do Disque Denúncia se sobrepõem. Tags **BINGO 2/3** e **3/3** nos trechos prioritários.
- **Comparativo Cross-Area** — Página com radar chart multidimensional, ranking com gradiente e bar chart comparativo entre todas as 8 áreas FM.
- **Sinais de Risco Automatizados** — 8 regras de detecção automática de risco (alto volume, sem câmeras, % noturno, ORCRIM, etc.).
- **Relatório Analítico In-Browser** — Relatório completo de 9 seções visível no dashboard, com download em `.md` e `.html`.

## Testes

```bash
# Backend (32 testes)
cd eduardo/backend
python -m pytest tests/ -v

# Frontend (19 testes)
cd eduardo/frontend
npm run test:run
```

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Dicionário de Dados](docs/DATA_DICTIONARY.md)
- [Referência da API](docs/API_REFERENCE.md)
- [Guia de Contribuição](docs/CONTRIBUTING.md)

---

Hackathon Claude Impact Lab Rio · 24/05/2026 · Grupo 7
