# Dados Limpos — CompStat Municipal Rio de Janeiro

Dados das 8 fontes do hackathon, limpos, normalizados e prontos para consumo.
Gerados pelo pipeline `TesteInternoGui/src/clean.py` em 2026-05-24.

**Regra de ouro:** nenhum dado foi inventado ou imputado. Linhas problemáticas
são _sinalizadas_ (colunas `_is_duplicate`, `_outside_rio`, `_has_coords`),
nunca removidas silenciosamente.

## Arquivos

| Arquivo | Formato | Linhas | Tamanho | Descrição |
|---------|---------|--------|---------|-----------|
| `ocorrencias.parquet` | Parquet | 115.354 | 9.4 MB | Ocorrências criminais (roubo a transeunte, celular, coletivo) 2020-2024. Coordenadas validadas, datas parseadas, duplicatas sinalizadas. |
| `disque_denuncia.parquet` | Parquet | 18.003 | 4.4 MB | Denúncias anônimas. 83.549 linhas brutas colapsadas em 18.003 registros lógicos (1 por denúncia). Campos aninhados (órgãos, assuntos, envolvidos) em JSON arrays. |
| `fatores_urbanos.parquet` | Parquet | 2.085 | 144 KB | Fatores urbanos/ambientais (iluminação, vegetação, PSR, etc.). Coordenadas corrigidas (swap x/y resolvido), HTML limpo do campo observacao. |
| `cameras.parquet` | Parquet | 985 | 63 KB | Câmeras nas áreas FM. WKT parseado para lon/lat explícitos. |
| `cpsr.parquet` | Parquet | 23.332 | 972 KB | Censo de Pessoas em Situação de Rua (2020, 2022, 2024). 167 colunas normalizadas para snake_case. |
| `dominio_territorial.geojson` | GeoJSON | 1.628 | 1.8 MB | Polígonos de domínio territorial (CV, TCP, ADA, Milícia). Geometrias validadas. |
| `fm_areas.geojson` | GeoJSON | 8 | 22 KB | 8 polígonos das áreas de atuação da Força Municipal. CRS EPSG:4326. |
| `relints.json` | JSON | 8 | 105 KB | RELINTs estruturados (RI_010 a RI_017): nome da área, texto completo, seções individuais. |
| `_manifest.json` | JSON | — | 32 KB | Manifesto de auditoria: contagem de linhas antes/depois, colunas adicionadas/removidas, cada passo de limpeza. |

## Como usar

```python
import pandas as pd
import geopandas as gpd
import json

# Tabelas
occ = pd.read_parquet("data/clean/ocorrencias.parquet")
dd  = pd.read_parquet("data/clean/disque_denuncia.parquet")
fu  = pd.read_parquet("data/clean/fatores_urbanos.parquet")
cam = pd.read_parquet("data/clean/cameras.parquet")
psr = pd.read_parquet("data/clean/cpsr.parquet")

# Geodados
fm   = gpd.read_file("data/clean/fm_areas.geojson")
terr = gpd.read_file("data/clean/dominio_territorial.geojson")

# RELINTs
with open("data/clean/relints.json") as f:
    relints = json.load(f)

# Manifesto (auditoria)
with open("data/clean/_manifest.json") as f:
    manifest = json.load(f)
```

## Colunas de sinalização (flag columns)

Colunas prefixadas com `_` são flags de qualidade, nunca dados originais:

| Coluna | Presente em | Significado |
|--------|-------------|-------------|
| `_is_duplicate` | ocorrencias | `True` se `id` aparece mais de uma vez |
| `_outside_rio` | ocorrencias, fatores_urbanos, cameras, disque_denuncia | `True` se coordenadas fora do bbox do Rio |
| `_has_coords` | disque_denuncia, cpsr | `True` se latitude/longitude estão presentes |

## Transformações aplicadas

Resumo por dataset (detalhes completos em `_manifest.json`):

### Ocorrências
- Coluna `geometria` (WKT) validada contra lat/lon e removida (redundante)
- `id_criptografado` -> `id`, `desc_delito` -> `delito_descricao`
- Datas parseadas (`data_parsed`); 36 pontos fora do Rio sinalizados

### Disque Denúncia
- Re-encoding ISO-8859-1 -> UTF-8
- 78.5% das linhas eram "continuação" (sem `numero_denuncia`): agrupadas por forward-fill e colapsadas
- 7 colunas >95% nulas removidas (documentadas no manifesto)
- Campos aninhados (orgaos, assuntos, envolvidos) agregados como JSON arrays

### Fatores Urbanos
- `coordenada_x` -> `latitude`, `coordenada_y` -> `longitude` (nomes invertidos no CSV original)
- Tags HTML removidas do campo `observacao`

### Câmeras
- Geometria WKT parseada para `longitude`/`latitude` explícitos

### CPSR
- 167 colunas normalizadas para snake_case (mapa completo em `_manifest.json` -> `column_rename_map`)
- Colunas de baixa cardinalidade convertidas para `category`

### Domínio Territorial
- WKT parseado para geometrias Shapely; geometrias inválidas corrigidas via `make_valid`

### FM Areas
- Shapefile carregado e validado (CRS EPSG:4326, geometrias válidas)

### RELINTs
- 8 DOCX parseados: conteúdo extraído de tabelas (11 linhas x 1 coluna por documento)
- Estruturado como JSON com `area_name`, `full_text`, `sections`
