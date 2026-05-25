# CompStat Municipal RJ — Grupo 7

**Claude Impact Lab Rio · Maio 2026**

Dashboard operacional que integra **12 fontes de dados**, cruza automaticamente as 3 camadas do CompStat (mancha criminal + fatores urbanos + dinâmica criminal), **recomenda o emprego operacional da Força Municipal por área** (efetivo, modalidade, ruas, blitz e órgãos co-responsáveis), e gera o Relatório Analítico de Área em `.docx` — **de horas para minutos**.

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

O analista abre o dashboard, clica na área FM, vê o diagnóstico completo com trechos críticos, bingos, fatores por órgão e dinâmica criminal — **recebe a recomendação operacional pronta** (quantos agentes, em que modalidade, em quais ruas, com que blitz e quais órgãos acionar) — e com um clique gera o relatório `.docx` no formato oficial e despacha ações por email para cada órgão responsável.

### Funcionalidades-chave

| O que faz | Como funciona |
|---|---|
| **Recomendação operacional por área** | Para cada uma das 8 áreas FM, o sistema entrega: efetivo do turno, mix de modalidades, ruas prioritárias, janela horária crítica, sugestão de blitz e órgãos co-responsáveis (ver detalhamento abaixo) |
| **Agente Investigativo com Tool Use** | Claude navega o mapa ao vivo, liga camadas, marca trechos críticos e narra os achados — com checkpoints para o analista interagir |
| **Motor de Coincidências ("Bingo")** | Cruza crime + fatores urbanos + denúncias por trecho. Sinaliza Bingo 2/3 e 3/3 — onde as camadas se sobrepõem, a ação é prioritária |
| **Scoring com pesos ajustáveis** | 4 componentes (mancha 40, pico 15, fatores 25, dinâmica 15) + bônus RELINT. Sliders recoloram o mapa em tempo real |
| **Síntese IA (Claude)** | Gera dinâmica criminal + plano de ação com 5-8 ações priorizadas por órgão, com evidência concreta dos dados |
| **Relatório .docx automático** | Formato oficial CompStat com todas as 8 seções, incluindo plano de ação e responsabilização |
| **Botão Despachar** | Email pré-preenchido por órgão (Comlurb, RioLuz, SEOP, SMAS, CET-Rio, GM-Rio, Seconserva, SMTR) |
| **Camera Gap Analysis** | Detecta pontos cegos (buffer 50m), classifica entre instalar e remanejar — **Desafio 4** |
| **Escala FM determinística** | Modelo de alocação de 600 agentes em escala 12x36, proporcional ao score, com mix de modalidade ajustado por modus operandi, % noturno e PSR |
| **Comparativo Cross-Area** | Radar, ranking e bar chart com toggle Absoluto/Per Capita |

---

## Recomendação Operacional por Área

Esta é a saída prática que o gestor da Força Municipal leva da reunião do CompStat para a operação da semana. Para cada uma das 8 áreas FM, a plataforma calcula e exibe:

### O que é recomendado

| Recomendação | Como é calculada | Onde aparece |
|---|---|---|
| **Efetivo por turno** | 600 agentes totais ÷ 4 turnos (escala 12x36) = 150 simultâneos, redistribuídos proporcionalmente ao score de cada área | Aba **Escala** · campo destacado "agentes/turno" |
| **Mix de modalidades** | A pé · Motocicleta · Viatura · Bicicleta · Abordagem social — proporção ajustada pelo modus operandi predominante, % de crime noturno e contagem de pop. em situação de rua | Aba **Escala** · composição com códigos PÉ / MTC / VTR / BIC / SOC |
| **Ruas prioritárias** | Top 10 trechos com maior incidência criminal, ranqueados por número de ocorrências e pico horário | Aba **Trechos** · posicionamentos por logradouro |
| **Janela horária crítica** | Pico horário extraído das ocorrências ISP, cruzado com % de crime noturno para definir reforço de turno | Aba **Dados** · pico_horario · pct_noturno |
| **Necessidade de blitz** | Recomendada quando há concentração de roubo em coletivo, modus "abordagem em parada" ou trecho com 3+ ocorrências/mês no mesmo logradouro | Plano de Ação · ação tipo `ordenamento` ou `patrulha_moto` |
| **Órgãos co-responsáveis** | Derivados dos fatores urbanos validados (campo × 1746) — cada órgão recebe ações específicas com endereço, evidência e prazo | Aba **Plano de Ação** · agrupamento por órgão |

### Modalidades operacionais e quando cada uma é recomendada

| Código | Modalidade | Quando o sistema recomenda |
|---|---|---|
| **PÉ** | Patrulha a pé | Áreas com alta circulação de pedestres, modus "abordagem a transeunte", trechos comerciais densos |
| **MTC** | Motocicleta | Áreas com múltiplas rotas de dispersão, modus "fuga rápida", logradouros com tráfego intenso |
| **VTR** | Viatura | Cobertura noturna, áreas extensas, deslocamento entre sub-áreas, resposta a chamados |
| **BIC** | Bicicleta | Áreas turísticas/lazer (orla, parques), travessias e ciclovias, eventos |
| **SOC** | Abordagem social | Áreas com PSR > 100 — encaminhamento articulado com SMAS, não repressão |

### Órgãos recomendados e gatilho de acionamento

A plataforma cruza os fatores observados em campo com chamados 1746 (validação cruzada cidadão × equipe) e recomenda o órgão responsável para cada problema:

| Órgão | Atuação | Acionado quando |
|---|---|---|
| **GM-Rio** | Emprego da Força Municipal — patrulhamento, ordenamento, presença ostensiva | Toda área (1ª ação do plano sempre é GM-Rio) |
| **RioLuz** | Iluminação pública | Fator "iluminação deficiente" validado por chamados 1746 OU `pct_noturno > 50%` |
| **Comlurb** | Limpeza urbana, remoção de entulho, poda | Fator "entulho/lixo acumulado" ou "vegetação obstruindo" validado |
| **SEOP** | Ordem urbana, fiscalização de comércio irregular, ambulantes | Fator "comércio irregular" ou alta densidade de denúncias DD no trecho |
| **SECONSERVA** | Conservação de vias, calçadas, mobiliário urbano | Fator "calçada degradada", "mobiliário danificado" |
| **SMAS** | Assistência social — abordagem a pop. em situação de rua | `PSR > 100` na área |
| **CET-Rio / SMTR** | Mobilidade, sinalização, ordenamento de transporte | Fator de transporte irregular, alta incidência de roubo em coletivo, retenção de fluxo |

### Exemplo concreto — Presidente Vargas (score 77)

A área de maior score recebe a seguinte recomendação automática:

- **Efetivo:** ~32 agentes/turno (escala 12x36, ~128 designados no total)
- **Mix:** PÉ predominante (alta circulação de pedestres, 500k/dia), reforço de MTC para múltiplas rotas de dispersão (Av. Presidente Vargas, Rua Uruguaiana), VTR para cobertura noturna
- **Ruas prioritárias:** Av. Presidente Vargas (altura nº 580 — Camelódromo), Rua Uruguaiana, entorno da Central do Brasil, Cinelândia
- **Janela crítica:** pico horário concentrado em horário comercial e dispersão pós-trabalho
- **Blitz recomendada:** sim — ordenamento no Camelódromo + abordagem a motocicletas no entorno da Central
- **Órgãos co-responsáveis:** RioLuz (118k chamados de iluminação nos bairros FM), Comlurb (entulho em vielas), SEOP (comércio irregular Uruguaiana), SMAS (PSR concentrada Cinelândia)

Cada item acima é gerado a partir dos dados reais — não é mock, não é exemplo decorativo — e vai direto para o `.docx` oficial e para o email despachado a cada órgão.

---

## Diferenciais

### 1. Agente investigativo com tool use — IA que navega o mapa

O analista clica "Investigar" e o Claude **assume o controle do mapa**: liga camadas, dá zoom na área, destaca ruas, traça rotas pelas ruas reais, mostra heatmaps, anima clusters e **pausa para o analista fazer perguntas ou redirecionar a análise**. No final, gera achados principais + plano de ação priorizado.

**~42 tools em 3 grupos — o agente usa em tempo real:**

| Grupo | Exemplos | O que fazem |
|---|---|---|
| **Query** (14) | `query_trechos`, `query_relatos_dd`, `query_chamados_1746`, `censo_bairro`, `censo_regiao`, `bairros_proximos`, `previsao_risco`, `correlacao_fatores_crime` | Consultam dados reais da área — crimes, denúncias, 1746, Censo 2022, RELINT, ontologia |
| **Mapa** (22) | `toggle_layer`, `zoom_to_area`, `highlight_trecho`, `show_route`, `show_heatmap_custom`, `cluster_crimes`, `animate_timeline`, `play_route_animation`, `pulse_location`, `focus_bairro` | Controlam o mapa: zoom, camadas, rotas por ruas reais, heatmaps, animações, clusters DBSCAN |
| **Controle** (6) | `pause_for_user`, `complete_investigation`, `update_weights` | Pausas human-in-the-loop, achados finais, ajuste de pesos |

O fluxo é streaming via Vercel AI SDK, com **human-in-the-loop**: o agente pausa após cada etapa para o analista fazer perguntas ou redirecionar. Funciona em modo **por área** (investigação focada) e **global** (comparação de todas as áreas). Toda afirmação baseada em dado cita a fonte inline (regras FONTES no system prompt).

### 2. Cruzamento real das 3 camadas — não apenas dashboards

Sistemas de BI convencionais mostram cada camada separada. Nossa plataforma **cruza por trecho**: identifica onde crime + fator urbano + denúncia coincidem no mesmo logradouro e gera a ação com responsável. O "bingo" é operacionalizado, não apenas visualizado.

### 3. Recomendação operacional, não apenas diagnóstico

A maior parte das ferramentas de inteligência criminal para em "mostrar o problema". A nossa entrega **o que fazer na segunda-feira de manhã**: quantos agentes, em qual modalidade, em quais ruas, em que horário, com qual blitz e quais órgãos chamar. Tudo derivado dos dados, tudo auditável, tudo no formato oficial do CompStat.

### 4. IA para síntese, não para decoração

Não usamos IA para mostrar gráfico bonito. Usamos para o que o analista leva horas: **sintetizar RELINT + Disque Denúncia em dinâmica criminal** e **gerar plano de ação com órgão, local, evidência e prazo**. Score, cruzamento geoespacial e alocação de efetivo são determinísticos e auditáveis.

### 5. 12 fontes integradas (não apenas as 5 obrigatórias)

Além das 5 fontes oficiais, integramos:

| Fonte extra | O que trouxe |
|---|---|
| **Central 1746** (902k chamados via BigQuery) | Valida fatores de campo com demanda cidadã — "equipe viu poste apagado E cidadão reclama há 3 anos" |
| **Censo 2022** (IBGE) | Normalização per capita, choropleth de densidade, demografia por bairro/região para o agente (censo_bairro, censo_regiao, bairros_proximos) |
| **Bairros data.rio** | Contexto geográfico: cada área FM fica dentro de 1-8 bairros com população e subprefeitura |
| **Logradouros CadLog** (132k trechos) | Gazetteer para geoparsing de denúncias e resolução de trechos |

### 6. Do dado bruto ao email para o órgão — ciclo completo

```
Dado bruto → Pipeline Python → Scoring → Recomendação operacional → Dashboard → Síntese IA → Relatório .docx → Email para o órgão
```

Não paramos no dashboard. O gestor gera o relatório `.docx` com um clique e despacha cada fator urbano para o órgão responsável com email pré-preenchido contendo endereço, score e prazo.

### 7. Tudo determinístico e testável

125 testes (32 backend + 93 frontend). Score é fórmula aberta, não caixa-preta. Alocação de efetivo é fórmula aberta. IA é usada apenas para síntese textual. O gestor pode ajustar os pesos dos componentes ao vivo e ver o ranking mudar — transparência total.

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
| **Desafio 2 — Migração do Crime** | Dados de bairros do entorno (20 bairros) + evolução mensal + anéis de entorno (500m) com crimes/DD spillover via `rio_context.json` + camadas "Rio Inteiro" (115k crimes, 17.8k DD, 1.260 domínios) |
| **Desafio 3 — Permanência Operacional** | Série temporal de 24 meses por área para avaliar tendência |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Pipeline | Python · Pandas · GeoPandas · Shapely |
| Frontend | Next.js 16 · TypeScript · Tailwind v4 · MapLibre GL · Recharts |
| IA | Claude Sonnet 4.6 (agente investigativo ~42 tools + síntese) · Claude Haiku 4.5 (geração do RELINT .docx) |
| Relatório | docx (TypeScript) |
| Testes | pytest (32) · Vitest (93) |

---

## Documentação Detalhada

| Doc | O que contém |
|---|---|
| [data/README.md](data/README.md) | Pipeline de dados: limpeza, enriquecimento, spatial joins, validação cruzada 1746 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Arquitetura, fluxo de dados, decisões técnicas, mapeamento ao briefing |
| [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md) | Schema completo do `areas_data.json` |
| [docs/API_REFERENCE.md](docs/API_REFERENCE.md) | Rotas `/api/synthesize`, `/api/report`, `/api/relint` e `/api/agent` (SSE) |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | Como estender (novas camadas, tabs, métricas) |

---

*Grupo 7 · Claude Impact Lab Rio · 24/05/2026*
