# Roteamento de ruas (rotas de fuga que seguem a malha viária)

Antes, tanto o operador quanto o agente de IA traçavam rotas como uma **reta de 2
pontos** que atravessava prédios e quarteirões. Agora as rotas **seguem ruas reais**
da malha do IBGE (`data/external/logradouros_rio.geojson`), com fallback explícito
quando não existe caminho na malha.

## Como funciona

```
 logradouros_rio.geojson (IBGE, 60k trechos)
        │  build_routing_graph.py  (offline, Python: shapely + scipy)
        ▼
 street_network.routing.geojson.gz   ← artefato roteável, commitado (~0.7 MB)
        │  app/lib/routing.ts  (runtime, carregado 1x por processo)
        ▼  geojson-path-finder (Dijkstra) + snap ao vértice mais próximo
   ┌────────────────┬─────────────────────────────┐
   │ /api/route     │ tool show_route (agente IA) │
   │ (operador)     │                             │
   └────────────────┴─────────────────────────────┘
```

### 1. Build offline — `build_routing_graph.py`

O gazetteer bruto **não** forma um grafo conectado: ruas se cruzam sem nó
compartilhado e muitas pontas erram umas às outras por poucos metros. O script:

1. reprojeta para EPSG:31983 (metros);
2. nodeia cruzamentos (`unary_union` + `linemerge`);
3. **agrupa pontas próximas** (cKDTree, dentro de `--tolerance-m`) e reescreve as
   pontas de cada segmento para o centroide do cluster → pontas que devem se tocar
   passam a ter coordenadas **exatamente iguais** (requisito do pathfinder);
4. calcula componentes conectados e mantém só os roteáveis
   (`--min-component-edges`, sempre o maior);
5. simplifica, volta a EPSG:4326, arredonda e grava GeoJSON comprimido.

Rodar (a partir de `eduardo/backend/`):

```bash
python3 build_routing_graph.py --data-dir ../../data
# opções: --tolerance-m 12  --min-component-edges 150  --simplify 3  [--no-gzip]
```

O script imprime um **diagnóstico** (cobertura do maior componente, nº de
componentes, tamanho do arquivo). Reexecute sempre que os dados do IBGE mudarem e
**commite** o `street_network.routing.geojson.gz` resultante.

**Limitação conhecida (esperada):** a malha do IBGE do Rio se divide em duas
grandes regiões geograficamente separadas (Zona Oeste — Campo Grande/Bangu — e
Sul/Centro — Copacabana/Tijuca/Botafogo) que não se conectam nos dados. Rotas
*dentro* de cada região funcionam; rotas *entre* regiões caem no fallback. Para
rotas de fuga (locais, de poucos quarteirões) isso é adequado.

### 2. Runtime — `app/lib/routing.ts`

`computeRoute(from, to)` (coords `[lng, lat]`) carrega o artefato uma vez, constrói
o grafo (`geojson-path-finder`), faz **snap** dos pontos de origem/destino ao
vértice mais próximo da malha e roda Dijkstra com peso em metros. Retorna:

```ts
{ coordinates: [lng,lat][], distance_m, status: 'ok' | 'fallback',
  snap_from_m?, snap_to_m?, message? }
```

- `status: 'ok'` → caminho seguindo ruas.
- `status: 'fallback'` → sem caminho na malha (ou artefato ausente); devolve a reta
  com `message: 'rota aproximada — sem caminho na malha'`.

Módulo **server-only** (lê do disco). Não importar em client component.

### 3. Consumidores

- **Operador:** botão **"Traçar rota"** no mapa (`MapView.tsx`) → dois cliques
  (origem, destino) → `POST /api/route` → desenha o caminho com a distância.
- **Agente de IA:** a tool `show_route` (`app/api/agent/route.ts`) chama
  `computeRoute` e devolve o polyline + `distance_m` + `status`; o `useMapAgent`
  desenha. Rotas de fallback aparecem em **cinza tracejado** (camada
  `agent-routes-line-fallback` no `MapView.tsx`).

## Dependências

- Python: `geopandas`, `shapely`, `scipy` (já no ambiente do pipeline).
- Node: `geojson-path-finder`, `server-only` (em `eduardo/frontend/package.json`).

## Testes

`eduardo/frontend/__tests__/routing.test.ts` cobre: roteamento por uma malha
sintética, snap de pontos fora da malha, fallback entre componentes desconectados,
e um teste de integração contra o artefato real commitado.

```bash
cd eduardo/frontend && npm run test:run
```
