# Guia de Contribuição — CompStat Municipal RJ

Obrigado por contribuir com a plataforma CompStat Municipal do Rio de Janeiro. Este guia cobre setup do ambiente, execução do pipeline, testes, convenções de código e como estender a plataforma com novas camadas, tabs e métricas.

---

## 1. Contexto do Projeto

Esta plataforma foi desenvolvida no **Claude Impact Lab Rio 2026** (Grupo 7) para o CompStat Municipal da Prefeitura do Rio de Janeiro. O objetivo é automatizar a produção dos Relatórios Analíticos de Área que subsidiam as reuniões semanais do CompStat, integrando dados quantitativos (ocorrências), qualitativos (Disque Denúncia, RELINTs) e geoespaciais (polígonos FM, fatores urbanos).

Antes de contribuir, recomendamos ler:
- [Arquitetura](ARCHITECTURE.md) — fluxo de dados, componentes e decisões técnicas
- [Briefing técnico](../../claude_impact_lab_compstat_rio/Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf) — contexto completo do CompStat e requisitos

---

## 2. Ambiente de Desenvolvimento

### Pré-requisitos

| Ferramenta | Versão mínima | Verificar com | Observação |
|---|---|---|---|
| **Python** | 3.10+ | `python3 --version` | Necessário para pipeline e geração de `.docx` |
| **Node.js** | 20+ | `node --version` | Frontend Next.js 16 |
| **npm** | 10+ | `npm --version` | Gerenciador de pacotes |
| **Git** | — | `git --version` | Controle de versão |

### Estrutura de Dados

Os dados já estão incluídos em `eduardo/data/`. O pipeline também aceita o pacote CSV original.

#### Layout 1: Dados integrados (padrão)

Já incluídos neste projeto em `data/`:

```
eduardo/
├── data/
│   ├── clean/              # 8 datasets limpos (Parquet, GeoJSON, JSON)
│   ├── external/           # fontes de enriquecimento (bairros, censo, 1746)
│   ├── processed/          # spatial joins intermediários
│   ├── artifacts/          # pacotes CompStat por área
│   └── config/             # area_registry.json
├── backend/
└── frontend/
```

#### Layout 2: Pacote CSV Original do Hackathon

Alternativa com os dados brutos originais:

```bash
git clone https://github.com/CompStat-Rio/claude_impact_lab_compstat_rio.git compstat
```

```
ClaudinhoRJGrupo7/
├── compstat/               # clone do repositório de dados
│   ├── dados/              # CSV, XLSX
│   ├── sh_area_forca/      # SHP
│   └── relints/            # DOCX
└── eduardo/
```

### Variáveis de Ambiente

Crie `frontend/.env.local` com a chave da Anthropic (necessária para síntese de IA):

```env
ANTHROPIC_API_KEY=sk-ant-...
```

**Nunca commite `.env.local` ou chaves de API no repositório.** O arquivo já está no `.gitignore`.

---

## 3. Setup

### Backend

```bash
cd eduardo/backend
python -m venv .venv
source .venv/bin/activate    # macOS/Linux
# .venv\Scripts\activate     # Windows

pip install -r requirements.txt
```

Dependências instaladas: `pandas`, `geopandas`, `pyarrow`, `shapely`, `pyproj`, `python-docx`, `lxml`, `pytest`, `pytest-cov`.

### Frontend

```bash
cd eduardo/frontend
npm install
```

Dependências principais: `next`, `react`, `maplibre-gl`, `recharts`, `@anthropic-ai/sdk`, `tailwindcss`, `typescript`, `vitest`.

---

## 4. Executando o Pipeline

O pipeline processa as 12 fontes de dados e gera `areas_data.json`, o artefato principal consumido pelo frontend.

### Com dados integrados (Layout 1 — padrão)

```bash
cd eduardo/backend
python data_pipeline.py --data-dir ../data --output areas_data.json
```

### Com dados CSV originais (Layout 2)

```bash
cd eduardo/backend
python data_pipeline.py --data-dir ../../compstat --output areas_data.json
```

### Após gerar o JSON

Copie o artefato para o frontend e (re)inicie o servidor de desenvolvimento:

```bash
cp areas_data.json ../frontend/public/areas_data.json
cd ../frontend
npm run dev
# Abrir http://localhost:3000
```

O pipeline detecta automaticamente o layout dos dados e carrega os formatos correspondentes. Fontes de enriquecimento (bairros, censo, 1746) são opcionais — o pipeline funciona sem elas.

---

## 5. Rodando os Testes

### Backend (32 testes)

```bash
cd eduardo/backend
python -m pytest tests/ -v                    # execução com output detalhado
python -m pytest tests/ -v --cov=data_pipeline  # com cobertura de código
```

| Módulo | Testes | O que valida |
|---|---|---|
| `test_metrics.py` | 11 | Distribuições horárias/diárias, pico, noturno, top trechos, evolução mensal |
| `test_modus.py` | 8 | Extração NLP de modus operandi de relatos |
| `test_scoring.py` | 4 | Normalização, bônus RELINT, soma do breakdown |
| `test_bingo.py` | 5 | Coincidência 2/3 e 3/3, contadores |
| `test_camera_gaps.py` | 4 | Pontos cegos, recomendações instalar/remanejar |

### Frontend (19 testes)

```bash
cd eduardo/frontend
npm run test:run     # execução única
npm test             # modo watch (re-executa ao salvar)
```

| Módulo | Testes | O que valida |
|---|---|---|
| `scoring.test.ts` | 4 | `computeScore` com pesos default, zero, customizados, bônus RELINT |
| `helpers.test.ts` | 15 | `fmt`, `scoreColor`, `faccaoColor`, `shortName`, `cap`, labels de modus/órgãos |

### Antes de abrir PR

Execute ambas as suítes. Novas funcionalidades devem incluir testes correspondentes:

```bash
cd eduardo/backend && python -m pytest tests/ -v
cd ../frontend && npm run test:run
```

---

## 6. Convenções de Código

### Python

- **PEP 8**: indentação de 4 espaços, nomes `snake_case`
- **Type hints** em assinaturas de funções públicas
- **Docstrings** em módulos e funções públicas
- Funções de métrica ficam em `data_pipeline.py`; testes em `backend/tests/`

### TypeScript

- **Strict mode** habilitado em `tsconfig.json`
- Interfaces e tipos centralizados em `frontend/app/types.ts`
- Componentes React em `frontend/app/components/`
- Preferir tipagem explícita — evitar `any`

### CSS / Estilo

O projeto usa tema escuro com variáveis CSS definidas em `globals.css`:

| Variável | Uso |
|---|---|
| `var(--bg)`, `var(--bg-1)`, `var(--bg-3)` | Fundos (escuro → mais claro) |
| `var(--text)`, `var(--text-muted)`, `var(--text-dim)` | Texto (primário → terciário) |
| `var(--border)`, `var(--accent)`, `var(--amber)` | Bordas e destaques |

Evitar cores hardcoded quando existir variável equivalente.

### Commits

Mensagens em **português**, com prefixos convencionais:

| Prefixo | Uso | Exemplo |
|---|---|---|
| `feat:` | Nova funcionalidade | `feat: adiciona camada de iluminação pública no mapa` |
| `fix:` | Correção de bug | `fix: corrige spatial join de denúncias sem coordenada` |
| `test:` | Adição/alteração de testes | `test: adiciona testes para camera gap analysis` |
| `docs:` | Documentação | `docs: atualiza dicionário de dados com campos do Censo` |
| `refactor:` | Refatoração sem mudança de comportamento | `refactor: extrai lógica de bingo para função separada` |

---

## 7. Como Estender a Plataforma

### 7.1 Adicionar uma Nova Camada no Mapa

As camadas do MapLibre são definidas em `frontend/app/components/MapView.tsx`.

**Passo 1 — Preparar os dados no pipeline**

Inclua os pontos ou polígonos no JSON de saída (campo `map_layers` ou campo dedicado na área), em `data_pipeline.py`.

**Passo 2 — Tipar no frontend**

Adicione a interface em `frontend/app/types.ts` (estender `MapLayers` ou a interface `Area`).

**Passo 3 — Registrar source e layer**

Dentro de `buildDataLayers()` em `MapView.tsx`:

```typescript
const features = data.areas.flatMap(a =>
  a.map_layers.minha_camada.map(p => ({
    type: 'Feature' as const,
    properties: { /* campos para popup/estilo */ },
    geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
  }))
)
map.addSource('minha-camada', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features }
})
map.addLayer({
  id: 'minha-camada-dot',
  type: 'circle',
  source: 'minha-camada',
  layout: { visibility: 'none' },
  paint: { /* cores, raio, opacidade */ },
})
```

**Passo 4 — Toggle na UI**

1. Adicione a chave em `LayerVisibility` (interface no topo do MapView)
2. Inicialize em `useState` com `false`
3. Registre os IDs da layer em `layerIds` dentro de `toggleLayer()`
4. Adicione um `<LayerBtn>` no painel de controles

Referência: camada **Pontos Cegos** (`gaps`) — source `gaps`, layer `gaps-dot`.

---

### 7.2 Adicionar uma Nova Tab no Painel de Área

Tabs ficam em `frontend/app/components/tabs/` e são registradas em `AreaPanel.tsx`.

**Passo 1 — Criar o componente**

```typescript
// frontend/app/components/tabs/MinhaTab.tsx
'use client'
import type { Area } from '../../types'

interface Props {
  area: Area
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
3. Inclua entrada no array `tabs` (label, badge opcional)
4. Renderize condicionalmente:

```typescript
{tab === 'minha-tab' && <MinhaTab area={area} />}
```

Referência: `EscalaTab`, `OverviewTab`, `TrechosTab`.

---

### 7.3 Adicionar uma Nova Métrica

Métricas são calculadas no backend e consumidas pelo frontend via `areas_data.json`.

**Passo 1 — Função no pipeline**

Adicione em `backend/data_pipeline.py` (ex.: `compute_minha_metrica(df)`) e chame no loop de `build_areas()`.

**Passo 2 — Incluir no output JSON**

```python
area_dict = {
    # ... campos existentes ...
    "minha_metrica": resultado,
}
```

**Passo 3 — Tipar no frontend**

Declare em `frontend/app/types.ts` (campo opcional `?` para compatibilidade).

**Passo 4 — Exibir nos componentes**

Use o campo nas tabs, KPIs ou mapa relevantes.

**Passo 5 — Testes**

Adicione testes em `backend/tests/` e, se aplicável, em `frontend/__tests__/`.

Referências: `compute_camera_gaps()`, `compute_bingo()`, interfaces `CameraGapAnalysis`, `Trecho`.

---

## 8. Troubleshooting

### Pipeline

| Problema | Causa provável | Solução |
|---|---|---|
| `FileNotFoundError: ocorrencias.parquet` | `--data-dir` errado ou dados não baixados | Verifique o caminho (padrão: `../data`) e se `data/clean/` contém os Parquet |
| `ModuleNotFoundError: geopandas` | Virtualenv não ativado | `source .venv/bin/activate` antes de rodar |
| `CRS mismatch` | Shapefile com projeção diferente | Pipeline reprojeta para WGS84 automaticamente; verifique `.prj` |
| JSON vazio ou 0 áreas | Dados fora do bounding box do Rio | Verifique lat/lng dos dados de entrada |

### Frontend

| Problema | Causa provável | Solução |
|---|---|---|
| Mapa em branco | `areas_data.json` ausente em `public/` | Copie do backend: `cp backend/areas_data.json frontend/public/` |
| "Erro ao sintetizar" | Chave Anthropic ausente ou inválida | Verifique `frontend/.env.local` com `ANTHROPIC_API_KEY=sk-ant-...` |
| Relatório `.docx` falha | Python não encontrado | Verifique `python3 --version` e `pip install python-docx` |
| Porta 3000 em uso | Outro processo ocupando | `lsof -i :3000` para identificar; `kill <PID>` ou use `npm run dev -- -p 3001` |

### Testes

| Problema | Causa provável | Solução |
|---|---|---|
| `ImportError` nos testes Python | Módulo não encontrado | Execute os testes de dentro de `eduardo/backend/` |
| Testes frontend falham | Dependências desatualizadas | `cd frontend && npm install` |

---

## 9. Documentação Relacionada

| Documento | Conteúdo |
|---|---|
| [Arquitetura](ARCHITECTURE.md) | Fluxo de dados, componentes, decisões técnicas, mapeamento ao briefing |
| [Dicionário de Dados](DATA_DICTIONARY.md) | Schema completo do `areas_data.json` |
| [Referência da API](API_REFERENCE.md) | Rotas `/api/synthesize` e `/api/report` com exemplos |
| [Changelog](../CHANGELOG.md) | Histórico de alterações por versão |

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7*
