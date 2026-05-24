# Guia de Contribuição — CompStat Municipal Eduardo

Obrigado por contribuir com a plataforma CompStat Municipal do Rio de Janeiro. Este guia descreve como configurar o ambiente, executar o pipeline, rodar os testes e estender o projeto com novas camadas, abas e métricas.

---

## 1. Ambiente de Desenvolvimento

### Pré-requisitos

| Ferramenta | Versão mínima | Observação |
|---|---|---|
| **Python** | 3.10+ | Recomendado usar `venv` isolado |
| **Node.js** | 20+ | Para o frontend Next.js |
| **Git** | — | Para clonar o repositório de dados |

### Repositório de dados

Clone o repositório de dados **ao lado** do projeto (no mesmo nível da pasta `eduardo/`):

```bash
git clone https://github.com/CompStat-Rio/claude_impact_lab_compstat_rio.git compstat
```

A estrutura esperada é:

```
ClaudinhoRJGrupo7/
├── compstat/          # dados brutos (CSV, SHP, DOCX, XLSX)
└── eduardo/
    ├── backend/
    └── frontend/
```

### Variáveis de ambiente

Crie o arquivo `frontend/.env.local` com a chave da Anthropic (necessária para síntese de IA e relatórios):

```env
ANTHROPIC_API_KEY=sk-ant-...
```

> **Importante:** Nunca commite `.env.local` ou chaves de API no repositório.

---

## 2. Setup

### Backend

```bash
cd eduardo/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

No Windows, ative o venv com `.venv\Scripts\activate`.

### Frontend

```bash
cd eduardo/frontend
npm install
```

---

## 3. Executando o Pipeline

O pipeline processa as 9 fontes de dados e gera o artefato JSON consumido pelo frontend:

O pipeline aceita dois layouts sob `--data-dir`:

- **`../../data`** (padrão) — pastas **`data/clean/`** deste repositório (Parquet + `relints.json` + GeoJSON FM).
- **`../../compstat`** — pacote legacy com `dados/*.csv`, `sh_area_forca/*.shp`, `relints/*.docx`.

```bash
cd eduardo/backend
python data_pipeline.py --data-dir ../../data --output areas_data.json
# ou
# python data_pipeline.py --data-dir ../../compstat --output areas_data.json
cp areas_data.json ../frontend/public/areas_data.json
```

Após copiar o JSON, reinicie ou recarregue o frontend (`npm run dev`) para ver os dados atualizados.

---

## 4. Rodando os Testes

### Backend

```bash
cd eduardo/backend
python -m pytest tests/ -v --cov=data_pipeline
```

### Frontend

```bash
cd eduardo/frontend
npm run test:run
```

Execute os testes antes de abrir um pull request. Novas funcionalidades devem incluir testes correspondentes.

---

## 5. Convenções de Código

### Python

- Seguir **PEP 8** (indentação de 4 espaços, nomes `snake_case`)
- Usar **type hints** em assinaturas de funções
- Incluir **docstrings** nos módulos e funções públicas
- Funções de métrica ficam em `data_pipeline.py`; testes em `backend/tests/`

### TypeScript

- **Strict mode** habilitado (`tsconfig.json`)
- Interfaces e tipos centralizados em `frontend/app/types.ts`
- Componentes React em `frontend/app/components/`
- Preferir tipagem explícita sobre `any`

### CSS / Estilo

- Usar variáveis CSS do tema escuro definidas em `globals.css`:
  - `var(--bg)`, `var(--bg-1)`, `var(--bg-3)` — fundos
  - `var(--text)`, `var(--text-muted)`, `var(--text-dim)` — texto
  - `var(--border)`, `var(--accent)`, `var(--amber)` — bordas e destaques
- Evitar cores hardcoded quando existir variável equivalente

### Commits

Mensagens em **português**, com prefixos convencionais:

| Prefixo | Uso |
|---|---|
| `feat:` | Nova funcionalidade |
| `fix:` | Correção de bug |
| `test:` | Adição ou alteração de testes |
| `docs:` | Documentação |
| `refactor:` | Refatoração sem mudança de comportamento |

Exemplo: `feat: adiciona camada de iluminação pública no mapa`

---

## 6. Como Adicionar

### Uma nova camada no mapa

As camadas do Maplibre são definidas em `frontend/app/components/MapView.tsx`.

**Passo 1 — Preparar os dados no pipeline**

Inclua os pontos ou polígonos da nova camada no JSON de saída (por área), em `data_pipeline.py`. O padrão existente usa `map_layers` (ex.: `crime_points`, `fatores_points`).

**Passo 2 — Tipar no frontend**

Adicione a interface correspondente em `frontend/app/types.ts` (ex.: estender `MapLayers` ou criar um campo dedicado na interface `Area`).

**Passo 3 — Registrar source e layer**

Dentro de `buildDataLayers()`, siga o padrão das camadas existentes:

1. Montar um array de `Feature` GeoJSON a partir de `data.areas`
2. Chamar `map.addSource('nome-da-camada', { type: 'geojson', data: ... })`
3. Chamar `map.addLayer({ id: '...', source: 'nome-da-camada', layout: { visibility: 'none' }, ... })`

Exemplo simplificado (pontos):

```typescript
const features = data.areas.flatMap(a =>
  a.map_layers.minha_camada.map(p => ({
    type: 'Feature' as const,
    properties: { /* campos para popup/estilo */ },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  }))
)
map.addSource('minha-camada', { type: 'geojson', data: { type: 'FeatureCollection', features } })
map.addLayer({
  id: 'minha-camada-dot',
  type: 'circle',
  source: 'minha-camada',
  layout: { visibility: 'none' },
  paint: { /* cores, raio, opacidade */ },
})
```

**Passo 4 — Toggle na UI**

1. Adicione a chave em `LayerVisibility` (interface no topo do arquivo)
2. Inicialize em `useState` com `false`
3. Registre os IDs da layer em `layerIds` dentro de `toggleLayer()`
4. Adicione um `<LayerBtn>` no painel de controles

Referência: camada **Pontos Cegos** (`gaps`) — source `gaps`, layer `gaps-dot`.

---

### Uma nova tab no painel de área

As tabs ficam em `frontend/app/components/tabs/` e são registradas em `AreaPanel.tsx`.

**Passo 1 — Criar o componente**

Crie `frontend/app/components/tabs/MinhaTab.tsx`:

```typescript
'use client'
import type { Area } from '../../types'

interface Props {
  area: Area
  // props adicionais conforme necessário (ex.: allAreas, weights)
}

export default function MinhaTab({ area }: Props) {
  return (
    <div style={{ padding: 16 }}>
      {/* conteúdo da tab */}
    </div>
  )
}
```

**Passo 2 — Registrar em AreaPanel.tsx**

1. Importe o componente
2. Adicione o id ao union type `TabId`
3. Inclua a entrada no array `tabs` (label, badge opcional)
4. Renderize condicionalmente no bloco de conteúdo:

```typescript
{tab === 'minha-tab' && <MinhaTab area={area} />}
```

Referência: `EscalaTab`, `OverviewTab` (label **Dados**), `TrechosTab`.

---

### Uma nova métrica

Métricas são calculadas no backend e consumidas pelo frontend via `areas_data.json`.

**Passo 1 — Função no pipeline**

Adicione uma função em `backend/data_pipeline.py` (ex.: `compute_minha_metrica(df)`) e chame-a no loop principal de `build_areas()`, dentro do bloco que monta cada área.

**Passo 2 — Incluir no output JSON**

Adicione o resultado ao dicionário da área em `areas_raw`:

```python
area_dict = {
    # ... campos existentes ...
    "minha_metrica": resultado,
}
```

**Passo 3 — Tipar no frontend**

Declare a interface em `frontend/app/types.ts` e adicione o campo à interface `Area`.

**Passo 4 — Exibir nos componentes**

Use o campo nos componentes relevantes (tab Dados, KPIs, mapa, etc.).

**Passo 5 — Testes**

Adicione testes unitários em `backend/tests/` cobrindo a nova função e, se aplicável, testes de componente no frontend.

Referências existentes: `compute_camera_gaps()`, `compute_bingo()`, interfaces `CameraGapAnalysis` e `Trecho`.

---

## Documentação relacionada

- [Arquitetura](ARCHITECTURE.md)
- [Dicionário de Dados](DATA_DICTIONARY.md)
- [Referência da API](API_REFERENCE.md)
