# Correções de Lógica de Dados — Per-capita, Bingo e Pontos Cegos de Câmera

> Documento de design das três mudanças aplicadas ao pipeline `backend/data_pipeline.py`
> em 2026-05-26. Todas são **aditivas no schema** (nenhum campo removido/renomeado) e foram
> implementadas e verificadas fase a fase. A reformulação da ontologia (`valente/`) ficou
> para depois, por decisão explícita.

Contexto: uma revisão crítica do projeto identificou que o pipeline de produção (que
alimenta o dashboard via `areas_data.json`) calculava três coisas de forma errada ou
subaproveitada. Este documento explica **o problema**, **o método escolhido**, **as
constantes** e **como verificar** cada correção.

---

## 1. Denominador per-capita (taxa ponderada por área + contexto bruto)

### Problema
`build_bairro_context()` fazia `gpd.sjoin(..., predicate="intersects")` e **somava a
população inteira de todo bairro que apenas encostasse** no polígono FM. Um polígono que
tangencia a quina de um bairro de 200 mil habitantes herdava os 200 mil no denominador,
**deflacionando** `crimes_per_1000_hab`. Numerador (crimes) era do polígono; denominador
(população) era de bairros inteiros — unidades espaciais incompatíveis.

### Método — interpolação areal
Nova função `weighted_population_for_area(area_geom, bairros_gdf, pop_by_name)`:

```
contribuição_bairro = pop_bairro × ( área(bairro ∩ polígono) / área(bairro) )
populacao_ponderada  = Σ contribuições
```

Geometrias reprojetadas para **EPSG:31983** (metros) para que `.area` seja válida. Um
bairro que apenas tangencia contribui ~0 automaticamente. Mantivemos **as duas** figuras:

| Campo | Significado | Mudou? |
|---|---|---|
| `populacao_estimada` / `populacao_bairros_2022` | Soma da população **dos bairros do entorno** (contexto "Pop. Residente") | **Não** (valores preservados) |
| `populacao_ponderada` | Residentes estimados **dentro do polígono** (denominador da taxa) | **Novo** |
| `crimes_per_1000_hab` | `crimes_total / populacao_ponderada × 1000` | Denominador trocado |

### Efeito observado (8 áreas FM)
A taxa **sobe** em corredores comerciais/de passagem porque o polígono tem poucos
residentes. Ex.: Presidente Vargas passou de 107 → **671/1.000** (pop. ponderada ≈ 5.978 vs
soma de bairros 37.503). Isso é o **efeito da população flutuante** tornado explícito: a
taxa mede exposição relativa a **residentes do polígono**, não ao fluxo diário. O agente já
é avisado disso em `app/api/agent/route.ts`. `populacao_ponderada` é exposto para a taxa ser
auditável.

### Ressalvas
- Interpolação areal assume população uniforme dentro do bairro (não é).
- A taxa não normaliza pela população **flutuante** (pedestres/dia), que é a exposição real
  em áreas comerciais. Use `populacao_ponderada` como denominador residencial, não como
  "pessoas presentes".

---

## 2. Coincidência "Bingo" — proximidade espacial, não substring de nome

### Problema
`compute_bingo()` casava camadas por **substring de nome de rua** (`name in fl or fl in
name`), **sem nenhuma checagem de distância**. Isso gera:
- **Falsos positivos**: ruas distintas que compartilham um token ("rua da paz" ⊂ "praça da paz").
- **Falsos negativos** (o erro dominante nos dados reais): diferenças de grafia/abreviação
  ("AV PRES VARGAS" no campo de crime vs "Avenida Presidente Vargas" no fator) impediam o
  casamento de coincidências reais.

### Método — buffer espacial + fallback de nome exato
Para cada trecho do top:
1. **Âncora**: une os pontos de crime do próprio trecho (de `oc_area`, agrupados por
   `locf_norm`) e aplica buffer de **`BINGO_PROXIMITY_M` = 100 m** (EPSG:31983). Sem pontos
   de crime, usa o centróide `lat`/`lng` do trecho.
2. `fatores` / `sinais` = existe ponto de fator / denúncia DD **dentro** desse buffer.
3. **Fallback sem coordenada** (DD é ~60% geocodificada): registros sem lat/lon casam
   apenas por **igualdade exata do nome normalizado** (não substring) — recupera sinal sem
   reintroduzir o falso positivo de token compartilhado.

Saída inalterada: `bingo_count` (0–3), `bingo_layers{crime,fatores,sinais}`,
`n_bingo_trechos`, `n_triple_bingo`.

### Efeito observado
As contagens de bingo **subiram** (não caíram), porque o erro dominante eram falsos
negativos por grafia. Como "trecho" aqui é agrupado por **nome de rua inteira**, uma via de
alto crime legitimamente tem fatores e denúncias em algum ponto ao longo dela — daí o triple
bingo alto nessas 8 micro-áreas densas (selecionadas justamente por saturação).

### Ressalvas / tuning
- `BINGO_PROXIMITY_M` (100 m) é o padrão de "micro-lugar" da literatura de crime; é uma
  constante ajustável no topo do módulo.
- Trechos são ruas inteiras (por `locf_norm`), não segmentos. Segmentação fina (ex.: grade
  H3) reduziria a saturação e é uma melhoria futura, fora do escopo desta correção.

---

## 3. Pontos cegos de câmera — cobertura por distância de rede

### Problema
`compute_camera_gaps()` usava buffer **euclidiano** de 50 m (uma câmera "a 50 m" atrás de um
quarteirão "cobria" o crime), clustering por **arredondamento de grade de 10 m** (separava
crimes adjacentes na fronteira da célula) e recomendação só por distância.

### Método
1. **Cobertura por rede viária** (`load_street_network` → grafo `networkx` a partir de
   `street_network.routing.geojson.gz`, pesos em metros, EPSG:31983; snap por `cKDTree`).
   Um crime só é "coberto" se houver câmera a ≤ `coverage_radius_m` (50 m) **pela malha
   viária** (`multi_source_dijkstra_path_length` a partir dos nós das câmeras, uma vez por
   área). Crimes que não ancoram bem na rede (snap > `CAMERA_SNAP_TOL_M` = 120 m) ou cujo nó
   é inalcançável caem no teste euclidiano.
2. **Clustering DBSCAN-like** (`cKDTree.query_pairs` + union-find, raio
   `CAMERA_CLUSTER_EPS_M` = 60 m) no lugar do arredondamento de grade.
3. **`priority_score`** = contagem de crimes ponderada por severidade
   (`CRIME_SEVERITY_WEIGHTS`; "em coletivo" = 1.3, demais 1.0) × fator de distância à câmera
   (satura em 4×raio = 200 m). Gaps ordenados por esse score; `rank` reflete a nova ordem.
4. Recomendação usa a distância de **rede** quando disponível.

### Saída (aditiva)
- `camera_gaps.coverage_method`: `"network"` | `"euclidean"`.
- Cada gap ganha `network_camera_m` (distância pela rede, ou `null`) e `priority_score`.
- Campos antigos preservados (`nearest_camera_m` continua sendo a distância **euclidiana**).
- `recommendation` continua exatamente `"instalar"` | `"remanejar"` (a UI usa esse enum num
  match de paint do MapLibre — não pode mudar).

### Efeito observado
Exemplo real — **Rodoviária**: câmera mais próxima a **49 m em linha reta** mas **306 m pela
malha viária** → reclassificada de `remanejar` para `instalar`. Exatamente o caso "câmera
atrás do quarteirão" que a melhoria visa corrigir.

### Dependência e custo
Adicionado `networkx>=3.0` ao `requirements.txt` (scipy já presente). Grafo: ~79k nós /
~95k arestas, carga ~1,8 s (cacheado por processo). Pipeline total ~9,4 s (vs ~7,5 s antes).

### Ressalvas
- O modelo de cobertura ignora linha de visada 3D e ângulo/estado real da câmera (o inventário
  não traz specs). Distância de rede é uma aproximação melhor que linha reta, não a verdade.
- Pesos de severidade são heurísticos e ajustáveis.

---

## Verificação (como reproduzir)

Da pasta `backend/`:

```bash
python3 -m pytest tests/ -q          # 78 testes (inclui os novos abaixo)
python3 data_pipeline.py --data-dir ../../data --output areas_data.json --with-rio-context
cp areas_data.json ../frontend/public/areas_data.json   # a UI lê de /public
```

Frontend (`frontend/`): `npx vitest run` → 93 testes passam contra o novo `areas_data.json`.

Testes adicionados/atualizados:
- `tests/test_population.py` — interpolação areal (tangência → ~0, overlap parcial proporcional).
- `tests/test_bingo.py` — reescrito p/ proximidade espacial + regressão do falso positivo de
  token + fallback de nome exato sem coordenada.
- `tests/test_camera_network.py` — clustering, cobertura de rede mais estrita que euclidiana,
  `coverage_method`/`priority_score`, ranking por prioridade.
- `tests/test_camera_gaps.py` — mantidos (fallback euclidiano, `network=None`).

Constantes ajustáveis (topo de `data_pipeline.py`): `BINGO_PROXIMITY_M`,
`CAMERA_COVERAGE_RADIUS_M`, `CAMERA_CLUSTER_EPS_M`, `CAMERA_SNAP_TOL_M`,
`CRIME_SEVERITY_WEIGHTS`.
