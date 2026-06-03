# Changelog — CompStat Municipal RJ

Histórico de alterações da plataforma de inteligência criminal do CompStat Municipal (Grupo 7).
Convenção: versões seguem `vMAJOR.MINOR.PATCH`. Cada entrada detalha impacto no pipeline, frontend e dados.

---

## v2.5.0 — Correções de lógica: per-capita ponderado, Bingo espacial, cobertura de câmera por rede (2026-05-26)

Três correções no `data_pipeline.py`, todas **estritamente aditivas** no schema (nenhum campo removido/renomeado; enum `recommendation` preservado para o match de paint do MapLibre). Implementadas e verificadas fase a fase. Detalhe completo em [`docs/DATA_LOGIC_FIXES.md`](docs/DATA_LOGIC_FIXES.md). Ontologia (`valente/`) deixada para depois.

### 1. Denominador per-capita corrigido (interpolação areal)
- **Bug**: `build_bairro_context()` usava `predicate="intersects"` e somava a população **inteira** de todo bairro que tangenciasse o polígono → denominador inflado, `crimes_per_1000_hab` deflacionado.
- **Correção**: nova `weighted_population_for_area()` pondera a população de cada bairro pela fração de sua área dentro do polígono (EPSG:31983). Novo campo `stats.populacao_ponderada` (denominador da taxa); `populacao_estimada`/`populacao_bairros_2022` (contexto bruto) **inalterados**.
- **Efeito**: taxa sobe em corredores comerciais (ex.: Presidente Vargas 107 → 671/1.000) — exposição relativa a residentes do polígono, com a população flutuante já ressalvada.
- **Testes**: `tests/test_population.py` (7 casos).

### 2. Bingo por proximidade espacial (fim do casamento por substring)
- **Bug**: `compute_bingo()` casava camadas por substring de nome de rua, sem distância — falsos positivos (token compartilhado) e, sobretudo, falsos negativos por grafia/abreviação.
- **Correção**: buffer de `BINGO_PROXIMITY_M` (100 m) em torno dos pontos de crime do trecho; fallback de **nome exato** (não substring) só para registros sem coordenada. Saída (`bingo_count`, `bingo_layers`, `n_bingo_trechos`, `n_triple_bingo`) inalterada.
- **Efeito**: coincidências **sobem** (erro dominante eram falsos negativos), coerente com trechos = ruas inteiras nessas áreas densas.
- **Testes**: `tests/test_bingo.py` reescrito (8 casos, inclui regressão do falso positivo e fallback sem coordenada).

### 3. Cobertura de câmera por distância de rede viária
- **Bug**: buffer euclidiano de 50 m (câmera atrás do quarteirão "cobria"), clustering por grade de 10 m, recomendação só por distância.
- **Correção**: novo `load_street_network()` (grafo `networkx` do `street_network.routing.geojson.gz`) → cobertura por `multi_source_dijkstra` na malha viária (fallback euclidiano por crime quando o snap > 120 m); clustering DBSCAN-like (`cKDTree`+union-find, 60 m); `priority_score` (severidade × distância) ordena os gaps. Quando `network=None`, comportamento euclidiano **idêntico ao anterior** (testes legados intactos).
- **Aditivo**: `camera_gaps.coverage_method` (`network`/`euclidean`), e por gap `network_camera_m` e `priority_score`. `nearest_camera_m` segue euclidiano; `recommendation` segue o enum `instalar`/`remanejar`.
- **Efeito real**: Rodoviária — câmera a 49 m em linha reta mas **306 m pela rede** → reclassificada para `instalar`.
- **Dependência**: `networkx>=3.0` adicionado ao `requirements.txt`. Pipeline ~9,4 s (vs ~7,5 s).
- **Testes**: `tests/test_camera_network.py` (4 casos) + `tests/test_camera_gaps.py` mantidos.

### Verificação
`python3 -m pytest tests/ -q` → **78 backend**; `npx vitest run` (frontend) → **93** contra o `areas_data.json` regenerado. `tsc` do app fonte limpo (erros de `@/` em `__tests__` são de trabalho concorrente, não desta mudança).

---

## v2.4.0 — Camada Disque Denúncia, Significância de Tendência, Detecção de Deslocamento (2026-05-26)

Três análises novas, todas **estritamente aditivas** (nenhum campo existente foi removido/renomeado; artefatos antigos continuam carregando). Implementação testada passo a passo. A implementação da ontologia foi deixada para depois.

### 1. Disque Denúncia como camada de mapa (narrativa é o ativo)
- **Backend** `get_disque_denuncia_pontos()` em `data_pipeline.py`: emite pontos geolocalizados das denúncias com `relato` (≤300 chars), `modus` (regex via `extract_modus`), `perfil_suspeito`, tipo/data/bairro/logradouro. Novo campo `map_layers.disque_denuncia_points` (463 pontos nas 8 áreas).
- **Frontend** nova camada `Disque Denúncia` (rosa `#ec4899`, distinta dos Chamados 1746 âmbar) em `MapView.tsx` com popup que mostra o **relato + modus + perfil** ao clicar. Linha de referência cruzada na `DenunciasTab`.
- **Testes**: `tests/test_dd_points.py` (9 casos).
- ⚠️ **Limitações**: modus é casamento de palavras-chave por regex — perde paráfrase, negação ("não estava armado") e variantes; uma denúncia é alegação, não crime confirmado; só linhas geocodificadas viram pontos, então a contagem da camada é < `stats.denuncias_total`. *Melhoria futura: extração por LLM (vocabulário controlado); cruzar DD × ocorrências antes de tratar densidade como risco.*

### 2. Significância de tendência (Mann-Kendall + Poisson + sazonalidade)
- **Backend** `evolution_mensal_stats()` + helpers `monthly_counts_full()`, `_mann_kendall()`, `_poisson_ci_rows()`. Novo campo aditivo `evolucao_mensal_stats` (`evolucao_mensal` **intacto**). Deps: `scipy`, `statsmodels` (já no `requirements.txt`).
- Janela de análise = últimos **60 meses** (período 2020-2024). Motivo documentado: a fonte traz alguns registros antigos esparsos (1900s) que, sem o corte, fariam a tendência ler "registro histórico quase-zero → registro moderno" (gerava `trend_delta_pct` de ~404.000%).
- **Frontend** `OverviewTab.tsx`: banda de IC 95% de Poisson sob a linha + selo de significância ("queda real" / "alta real" / "ruído / sem tendência"). Sem stats, cai no gráfico de linha original.
- **Testes**: `tests/test_trend.py` (14 casos, inclui guarda de regressão do `evolution_mensal`).
- ⚠️ **Limitações**: Mann-Kendall ignora autocorrelação (p otimista) e roda sobre os 3 tipos de crime combinados (pode mascarar sub-tendências divergentes); IC de Poisson assume média=variância, mas crime é sobredisperso → banda real é mais larga; decomposição sazonal sobre poucos anos é sensível às pontas (descritiva, não preditiva). *Melhorias: testes por tipo, MK Hamed-Rao, IC binomial-negativa.*

### 3. Detecção de deslocamento (Desafio 2)
- **Backend** `classify_displacement()` (puro) + agregação anual área-vs-anel em `build_rio_context()`: contagens anuais **dentro** do polígono FM vs **dentro** do anel 500m, comparando os dois últimos anos completos. Rótulos: `deslocamento_provavel` (área ↓ & anel ↑), `reducao_genuina`, `intensificacao`, `inconclusivo`; confiança baixa/media/alta. Faixa neutra de ±10%.
- Novos campos em `rio_context.json` (`rings[].area_year_counts/ring_year_counts/displacement`) + novo artefato compacto `displacement.json` (~3KB, sem geometria) para o painel não baixar os ~10MB.
- **Frontend** linha de alerta no popup dos Anéis de Entorno + card "Alerta de Deslocamento" na tab Mancha Criminal (lazy-fetch de `/displacement.json`).
- **Testes**: `tests/test_displacement.py` (9 casos).
- Exemplo real: **Jardim de Alah** = `deslocamento_provavel` (área −28% / entorno +34%, 2023→2024).
- ⚠️ **Limitações**: ocorrências apenas (DD é de ano único, não entra no a/a); o rótulo é **hipótese** — pode ser artefato de registro, anel sobrepondo hotspot vizinho, ou realocação de efetivo policial, não deslocamento criminal real; contagens do anel são **brutas**, não normalizadas por área (anel maior contém mais crime naturalmente). *Melhorias: teste de significância na diferença, baseline mais longo, deslocamento por tipo, normalizar por km².*

### Testes
- Backend: **74 testes** (de 32 para 74: +9 DD, +14 tendência, +9 deslocamento, +fixtures). Frontend: 93 testes mantidos.

---

## v2.3.0 — Censo Choropleth, Rio Inteiro, Roteamento por Ruas, UI Polish (2026-05-25)

### Backend
- **`build_rio_context()`** em `data_pipeline.py` (`--with-rio-context`): gera `rio_context.json` (~10 MB) com 115k crimes, 17.8k DD, 1.260 domínios e anéis de entorno 500m
- **`censoData.ts`** (server-side): loader do Censo 2022 com área real calculada da geometria, densidade, variação 2010→2022, proximidade por centróide

### Frontend — Camadas e Mapa (13 layers, de 6 para 13)
- **Censo (Densidade)**: choropleth azul por `densidade_hab_km2` com hover popup (lazy-loaded de `/api/censo`)
- **Rio Inteiro**: 4 novas camadas lazy-loaded (`rio_context.json`): Anéis de Entorno, Crimes (Rio), Denúncias DD (Rio), Domínio (Rio)
- **Ring auto-enable**: ativar "Anéis de Entorno" automaticamente habilita Crimes (Rio) + DD (Rio)
- **Chamados 1746**: camada de pontos no mapa
- **Bairros Entorno**: polígonos com popup (pop/DD/1746)
- **Heatmap fix**: crime-heat e crime-heat-custom não saturam mais no zoom-out (intensity/radius/opacity corrigidos)
- **Clusters**: `circle-blur: 0.5` + opacidade crescente (blob suave vs puck duro)
- **Strokes**: line-width interpolado por zoom (dominio, bairro-focus, radius)
- **Crime dots**: fade suave (z13.5→z14.5) em vez de pop seco
- **Timeline dots**: circle-blur diferenciado (isNew vs antigos)

### Frontend — Agente e UI
- **3 tools de Censo**: `censo_bairro`, `censo_regiao`, `bairros_proximos` — demografia IBGE com fonte citada
- **FONTES**: seção no system prompt obriga citação inline da fonte de todo dado (ISP-RJ, DD, 1746, Censo, RELINT)
- **GET /api/censo**: endpoint para choropleth e card de bairro
- **Demografia card**: card colapsável "Demografia (Censo 2022)" na tab Mancha Criminal
- **AgentPanel labels**: labels amigáveis para as 3 tools de Censo
- **Roteamento por ruas**: `POST /api/route` + grafo IBGE (Dijkstra) — rotas e animações seguem ruas reais

### Testes
- 93 testes frontend (de 19 para 93, 7 suites): censoData (10), agentRoute (29 com inventário de ~42 tools), useMapAgent (26), routing (4), ontologyEvents (5)

### Docs
- README, ARCHITECTURE, CONTRIBUTING, API_REFERENCE, DATA_DICTIONARY, data/README atualizados

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
