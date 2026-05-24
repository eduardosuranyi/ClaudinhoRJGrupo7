# CompStat Municipal RJ — Grupo 7

**Claude Impact Lab Rio · Maio 2026**

Dashboard operacional que integra **12 fontes de dados**, cruza automaticamente as 3 camadas do CompStat (mancha criminal + fatores urbanos + dinâmica criminal), e gera o Relatório Analítico de Área em `.docx` — **de horas para minutos**.

---

## Como Rodar

```bash
# Backend
cd eduardo/backend
pip install -r requirements.txt
python data_pipeline.py --data-dir ../data --output areas_data.json
cp areas_data.json ../frontend/public/areas_data.json

# Frontend
cd eduardo/frontend
npm install
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local
npm run dev   # http://localhost:3000
```

---

## O que entregamos

**Um sistema completo, end-to-end, pronto para uso na reunião semanal do CompStat.**

O analista abre o dashboard, clica na área FM, vê o diagnóstico completo com trechos críticos, bingos, fatores por órgão e dinâmica criminal — e com um clique gera o relatório `.docx` no formato oficial e despacha ações por email para cada órgão responsável.

### Funcionalidades-chave

| O que faz | Como funciona |
|---|---|
| **Agente Investigativo com Tool Use** | Claude navega o mapa ao vivo, liga camadas, marca trechos críticos e narra os achados — com checkpoints para o analista interagir |
| **Motor de Coincidências ("Bingo")** | Cruza crime + fatores urbanos + denúncias por trecho. Sinaliza Bingo 2/3 e 3/3 — onde as camadas se sobrepõem, a ação é prioritária |
| **Scoring com pesos ajustáveis** | 4 componentes (mancha 40, pico 15, fatores 25, dinâmica 15) + bônus RELINT. Sliders recoloram o mapa em tempo real |
| **Síntese IA (Claude)** | Gera dinâmica criminal + plano de ação com 5-8 ações priorizadas por órgão, com evidência concreta dos dados |
| **Relatório .docx automático** | Formato oficial CompStat com todas as 8 seções, incluindo plano de ação e responsabilização |
| **Botão Despachar** | Email pré-preenchido por órgão (Comlurb, RioLuz, SEOP, SMAS, CET-Rio, GM-Rio, Seconserva, SMTR) |
| **Camera Gap Analysis** | Detecta pontos cegos (buffer 50m), classifica entre instalar e remanejar — **Desafio 4** |
| **Escala FM** | Modelo de alocação de 600 agentes proporcional ao score, com sugestão de modalidade (moto/pé/viatura) |
| **Comparativo Cross-Area** | Radar, ranking e bar chart com toggle Absoluto/Per Capita |

---

## Diferenciais

### 1. Agente investigativo com tool use — IA que navega o mapa

O analista clica "Investigar" e o Claude **assume o controle do mapa**: liga camadas, dá zoom na área, marca as ruas mais perigosas com anotações, narra o que encontra em linguagem simples e **pausa em checkpoints para o analista fazer perguntas ou redirecionar a análise**. No final, gera achados principais + plano de ação priorizado.

**7 tools que o agente usa em tempo real:**

| Tool | O que faz no mapa |
|---|---|
| `zoom_to_area` | Centraliza e anima o mapa na área selecionada |
| `toggle_layer` | Liga/desliga camadas (crime, fatores, câmeras, PSR, domínio territorial) |
| `show_annotation` | Marca pontos no mapa com título e observação (ex: rua mais perigosa) |
| `update_weights` | Ajusta os pesos do score para destacar a dimensão sendo analisada |
| `narrate` | Mostra texto explicativo no painel lateral com dados concretos |
| `checkpoint` | Pausa e pergunta ao analista — com opções pré-definidas ou texto livre |
| `complete_investigation` | Finaliza com achados-chave + plano de ação por órgão |

O fluxo é streaming via SSE, com **human-in-the-loop**: o agente faz 3 pausas (checkpoints) onde o analista pode pedir mais detalhes, mudar o foco ou seguir em frente. Não é um chatbot genérico — é um **roteiro investigativo guiado** que usa os dados reais da área.

### 2. Cruzamento real das 3 camadas — não apenas dashboards

Sistemas de BI convencionais mostram cada camada separada. Nossa plataforma **cruza por trecho**: identifica onde crime + fator urbano + denúncia coincidem no mesmo logradouro e gera a ação com responsável. O "bingo" é operacionalizado, não apenas visualizado.

### 3. IA para síntese, não para decoração

Não usamos IA para mostrar gráfico bonito. Usamos para o que o analista leva horas: **sintetizar RELINT + Disque Denúncia em dinâmica criminal** e **gerar plano de ação com órgão, local, evidência e prazo**. Score e cruzamento geoespacial são determinísticos e auditáveis.

### 4. 12 fontes integradas (não apenas as 5 obrigatórias)

Além das 5 fontes oficiais, integramos:

| Fonte extra | O que trouxe |
|---|---|
| **Central 1746** (902k chamados via BigQuery) | Valida fatores de campo com demanda cidadã — "equipe viu poste apagado E cidadão reclama há 3 anos" |
| **Censo 2022** (IBGE) | Normalização per capita — Pres. Vargas tem 107 crimes/1000 hab, Campo Grande tem 0,8 |
| **Bairros data.rio** | Contexto geográfico: cada área FM fica dentro de 1-8 bairros com população e subprefeitura |
| **Logradouros CadLog** (132k trechos) | Gazetteer para geoparsing de denúncias e resolução de trechos |

### 5. Do dado bruto ao email para o órgão — ciclo completo

```
Dado bruto → Pipeline Python → Scoring → Dashboard → Síntese IA → Relatório .docx → Email para o órgão
```

Não paramos no dashboard. O gestor gera o relatório `.docx` com um clique e despacha cada fator urbano para o órgão responsável com email pré-preenchido contendo endereço, score e prazo.

### 6. Tudo determinístico e testável

51 testes (32 backend + 19 frontend). Score é fórmula aberta, não caixa-preta. IA é usada apenas para síntese textual. O gestor pode ajustar os pesos dos componentes ao vivo e ver o ranking mudar — transparência total.

---

## Insights dos Dados

| Insight | Evidência |
|---|---|
| **Presidente Vargas é 130x mais perigoso per capita que Campo Grande** | 107 vs 0,8 crimes/1000 hab — o número absoluto engana porque o Centro tem 500k pedestres/dia e 37k residentes |
| **Rodoviária é outlier em roubo em coletivo** | 34% das ocorrências são em ônibus — todas as outras áreas são dominadas por roubo a transeunte (60-71%) |
| **Metrô Botafogo tem pico às 23h** — mais tardio que todas as demais | Área de lazer noturno — QMD deve cobrir até madrugada, não apenas até 22h |
| **RioLuz tem 118k chamados 1746 nos bairros FM** | Iluminação é o fator mais validado pela população — poste apagado é recorrente e crônico |
| **Campo Grande opera sob dinâmica de milícia** | Contexto completamente diferente das áreas da Zona Sul/Centro — modelo de emprego e abordagem devem ser distintos |
| **Apenas 9,1% dos crimes caem nos polígonos FM** | 10.500 de 115.354 — micro-áreas concentram alta incidência, mas 91% do crime está fora; migração (Desafio 2) é real |

---

## Desafios Extras Endereçados

| Desafio | Como abordamos |
|---|---|
| **Desafio 4 — Otimização de Câmeras** | Camera Gap Analysis com buffer 50m, classificação instalar/remanejar, camada no mapa |
| **Desafio 2 — Migração do Crime** | Dados de bairros do entorno (20 bairros) + evolução mensal permitem detectar deslocamento |
| **Desafio 3 — Permanência Operacional** | Série temporal de 24 meses por área para avaliar tendência |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Pipeline | Python · Pandas · GeoPandas · Shapely |
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · MapLibre GL · Recharts |
| IA | Claude Sonnet 4.5 (síntese) · Claude Sonnet 4.6 (agente investigativo com tool use) |
| Relatório | python-docx |
| Testes | pytest (32) · Vitest (19) |

---

## Documentação Detalhada

| Doc | O que contém |
|---|---|
| [data/README.md](data/README.md) | Pipeline de dados: limpeza, enriquecimento, spatial joins, validação cruzada 1746 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura, fluxo de dados, decisões técnicas, mapeamento ao briefing |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Schema completo do `areas_data.json` |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Rotas `/api/synthesize`, `/api/report` e `/api/agent` (SSE) |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Como estender (novas camadas, tabs, métricas) |

---

*Grupo 7 · Claude Impact Lab Rio · 24/05/2026*
