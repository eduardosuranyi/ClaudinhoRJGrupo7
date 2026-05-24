# Dicionário de Dados — CompStat Municipal RJ

Referência completa do artefato `areas_data.json`, produzido pelo pipeline Python (`backend/data_pipeline.py`) e consumido pelo frontend Next.js e pelo gerador de relatório `.docx`.

---

## 1. Schema `areas_data.json`

### 1.1 Estrutura raiz

| Campo | Tipo | Descrição |
|---|---|---|
| `areas` | `Area[]` | Lista de áreas da Força Municipal (FM), ordenadas por `score.total` decrescente |
| `meta` | `object` | Metadados globais do dataset e períodos de referência |

#### Objeto `meta`

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `total_ocorrencias` | `number` | ≥ 0 | Total de registros no CSV de ocorrências ISP após filtro geográfico |
| `total_ocorrencias_em_areas` | `number` | ≥ 0 | Ocorrências com ponto dentro de algum polígono FM |
| `total_denuncias` | `number` | ≥ 0 | Total de denúncias Disque Denúncia (com e sem geocódigo) filtradas por roubo/furto |
| `total_fatores_urbanos` | `number` | ≥ 0 | Total de fatores urbanos mapeados |
| `total_cameras` | `number` | ≥ 0 | Total de câmeras CIVITAS no dataset |
| `total_areas` | `number` | 8 | Número de polígonos de área FM |
| `total_psr` | `number` | ≥ 0 | Total de registros do censo de população em situação de rua (PSR) |
| `periodo_criminal` | `string` | ex.: `"2020-2024"` | Período das ocorrências criminais |
| `periodo_fatores` | `string` | ex.: `"2026"` | Período dos fatores urbanos |
| `periodo_denuncias` | `string` | ex.: `"2025"` | Período das denúncias Disque Denúncia |

---

### 1.2 Objeto `Area`

Cada elemento de `areas` representa uma área operacional da Força Municipal.

#### Campos de identificação e geometria

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `id` | `number` | inteiro positivo | FID do shapefile `areas_forca_municipal.shp` |
| `nome` | `string` | — | Nome completo da área FM (campo `nome_subar` do shapefile) |
| `geometry` | `GeoJSON.Geometry` | `Polygon` ou `MultiPolygon` | Polígono da área em WGS84 (EPSG:4326), formato GeoJSON |

#### `identificacao`

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `aisp` | `number \| null` | 1–99 ou `null` | AISP modal das ocorrências na área |
| `risp` | `number \| null` | 1–99 ou `null` | RISP modal das ocorrências na área |
| `base_fm` | `string` | `"Central"` \| `"Litorânea"` | Base operacional inferida pelo nome da área |
| `subprefeitura` | `string` | — | Subprefeitura (placeholder `"—"` no pipeline atual) |
| `dominio_principal` | `string` | ex.: `"CV"`, `"TCP"`, `"—"` | Facção/ORCRIM mais frequente entre os polígonos de domínio territorial que intersectam a área |

#### `stats`

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `crimes_total` | `number` | ≥ 0 | Ocorrências criminais dentro do polígono da área |
| `crimes_por_tipo` | `Record<string, number>` | — | Contagem por `desc_delito` (ex.: `"Roubo a transeunte"`, `"Roubo de aparelho celular"`, `"Roubo em coletivo"`) |
| `pico_horario` | `string` | `"0h"`–`"23h"` ou `"N/D"` | Hora com maior volume de ocorrências |
| `pct_noturno` | `number` | 0.0–100.0 | Percentual de crimes entre 18h–23h e 0h–5h |
| `hora_distribution` | `Record<string, number>` | chaves `"0"`–`"23"` | Distribuição horária de ocorrências |
| `dia_distribution` | `Record<string, number>` | ex.: `"Segunda"`, `"Sabado"` | Distribuição por dia da semana |
| `denuncias_total` | `number` | ≥ 0 | Denúncias Disque Denúncia georreferenciadas na área |
| `fatores_urbanos_total` | `number` | ≥ 0 | Fatores urbanos dentro do polígono |
| `cameras_total` | `number` | ≥ 0 | Câmeras CIVITAS associadas à área (`nome_area_fm`) |
| `psr_total` | `number` | ≥ 0 | Registros PSR dentro do polígono |
| `modus_operandi` | `Record<string, number>` | chaves ver seção 3 | Frequência de modus extraídos via regex dos relatos de denúncia |

#### `top_trechos`

Array com até **10** logradouros de maior incidência criminal na área.

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `locf_norm` | `string` | — | Logradouro normalizado (minúsculas, sem duplicação de tipo via) |
| `total` | `number` | ≥ 1 | Total de ocorrências no trecho |
| `lat` | `number` | -23.2 a -22.7 | Latitude média das ocorrências do trecho |
| `lng` | `number` | -43.9 a -43.0 | Longitude média das ocorrências do trecho |
| `roubo_transeunte` | `number` | ≥ 0 | Contagem de `"Roubo a transeunte"` |
| `roubo_celular` | `number` | ≥ 0 | Contagem de `"Roubo de aparelho celular"` |
| `roubo_coletivo` | `number` | ≥ 0 | Contagem de `"Roubo em coletivo"` |
| `pico_hora` | `number` | 0–23 | Hora modal das ocorrências no trecho |
| `bingo_count` | `number` | 1–3 | Número de camadas coincidentes (crime + fatores + sinais) |
| `bingo_layers` | `object` | — | Detalhamento das camadas coincidentes |
| `bingo_layers.crime` | `boolean` | — | Sempre `true` quando presente no top trecho |
| `bingo_layers.fatores` | `boolean` | — | Trecho coincide com logradouro de fator urbano |
| `bingo_layers.sinais` | `boolean` | — | Trecho coincide com logradouro de denúncia |

#### Campos de coincidência (Bingo)

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `n_bingo_trechos` | `number` | ≥ 0 | Trechos com sobreposição de **2 ou mais** camadas (crime, fatores, sinais) |
| `n_triple_bingo` | `number` | ≥ 0 | Trechos com sobreposição **3/3** (crime + fatores + sinais) |

#### `camera_gaps`

Análise de lacunas de cobertura de câmeras (buffer de 50 m).

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `n_cameras` | `number` | ≥ 0 | Quantidade de câmeras na área |
| `coverage_radius_m` | `number` | 50 | Raio de cobertura assumido por câmera (metros) |
| `cameras` | `Array<{ lat, lng }>` | — | Coordenadas das câmeras |
| `gaps` | `CameraGap[]` | até 15 | Pontos cegos prioritários |

Cada elemento de `gaps`:

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `rank` | `number` | 1–15 | Prioridade do gap |
| `lat` | `number` | WGS84 | Latitude do cluster descoberto |
| `lng` | `number` | WGS84 | Longitude do cluster descoberto |
| `uncovered_crimes` | `number` | ≥ 1 | Ocorrências sem cobertura no cluster |
| `nearest_camera_m` | `number` | ≥ 0 | Distância à câmera mais próxima (metros) |
| `recommendation` | `string` | `"instalar"` \| `"remanejar"` | `"remanejar"` se câmera a ≤ 100 m; caso contrário `"instalar"` |
| `justification` | `string` | — | Texto explicativo gerado automaticamente |

#### `fatores_por_orgao`

Array ordenado por `total` decrescente.

| Campo | Tipo | Descrição |
|---|---|---|
| `orgao` | `string` | Órgão responsável (ex.: `"SMAS"`, `"COMLURB"`, `"Rio Luz"`) |
| `total` | `number` | Total de fatores do órgão na área |
| `tipos` | `Array<{ tipo, count }>` | Até 5 tipos mais frequentes de `tipo_ocorrencia_descricao` |

#### `relatos_sample`

Amostra de até **8** relatos do Disque Denúncia.

| Campo | Tipo | Descrição |
|---|---|---|
| `tipo` | `string` | Tipo da denúncia (ex.: `"ROUBO A MOTORISTAS"`) |
| `data` | `string` | Data/hora da denúncia (`data_denuncia`) |
| `bairro` | `string` | Bairro (`bairro_logradouro`) |
| `logradouro` | `string` | Logradouro informado |
| `relato` | `string` | Texto redigido (`relato_redacted`), truncado em 400 caracteres |
| `modus` | `string[]` | Tags de modus operandi extraídas do relato (ver seção 3) |

#### RELINT (Relatório de Inteligência)

| Campo | Tipo | Descrição |
|---|---|---|
| `relint_disponivel` | `boolean` | `true` se existe RELINT `.docx` mapeado para a área |
| `relint.full_text` | `string` | Texto completo concatenado das seções (formato Markdown com `##`) |
| `relint.sections` | `Array<{ titulo, texto }>` | Seções estruturadas extraídas das tabelas do documento Word |

#### `dominio_territorial`

Polígonos de facções/ORCRIM que intersectam a área.

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | `string` | Nome do território (`nome_territorio`) |
| `faccao` | `string` | Domínio ORCRIM (ex.: `"CV"`, `"TCP"`, `"ADA"`, `"Milícia"`) |
| `geometry` | `GeoJSON.Geometry` | Polígono do território em WGS84 |

#### `evolucao_mensal`

Série temporal dos últimos **24 meses** com ocorrências.

| Campo | Tipo | Descrição |
|---|---|---|
| `mes` | `string` | Período no formato `"YYYY-MM"` |
| `total` | `number` | Contagem de ocorrências no mês |

#### `map_layers`

Pontos amostrados para visualização no mapa (Maplibre GL).

| Camada | Tipo | Campos | Limite |
|---|---|---|---|
| `crime_points` | `Array` | `lat`, `lng`, `tipo`, `h` | ~600 pts (amostra balanceada por tipo) |
| `fatores_points` | `Array` | `lat`, `lng`, `tipo`, `orgao`, `logradouro` | 300 pts |
| `cameras_points` | `Array` | `lat`, `lng` | todos |
| `psr_points` | `Array` | `lat`, `lng` | 400 pts |

- `crime_points.h`: hora numérica (0–23) ou `null`
- `crime_points.tipo`: valor de `desc_delito`

#### `score`

Score composto de risco operacional (0–100), normalizado entre as 8 áreas.

| Campo | Tipo | Faixa | Descrição |
|---|---|---|---|
| `total` | `number` | 0–100 | Soma dos componentes |
| `breakdown.mancha_criminal` | `number` | 0–40 | Volume de crimes normalizado (peso 40%) |
| `breakdown.pico_horario` | `number` | 0–15 | Concentração nas 3 horas de pico (peso 15%) |
| `breakdown.fatores_urbanos` | `number` | 0–25 | Volume de fatores urbanos normalizado (peso 25%) |
| `breakdown.dinamica` | `number` | 0–15 | Volume de denúncias normalizado (peso 15%) |
| `breakdown.relint_bonus` | `number` | 0 ou 5 | Bônus fixo quando RELINT está disponível |

---

## 2. Fontes de Dados de Entrada

Todas as fontes residem no repositório de dados CompStat (`compstat/`), referenciado via `--data-dir` no pipeline.

| Fonte | Arquivo | Formato | Encoding | Volume | Colunas usadas |
|---|---|---|---|---|---|
| **Ocorrências ISP** | `dados/df_ocorrencias_tratado - Extração 1 .csv` | CSV | UTF-8 (padrão) | ~115.318 | `latitude`, `longitude`, `hora`, `locf`, `desc_delito`, `data`, `dia_semana`, `aisp`, `risp` |
| **Disque Denúncia** | `dados/disk_denuncia.csv` | CSV (`;`) | Latin-1 | ~8.770 (R/F) | `tipo`, `bairro_logradouro`, `data_denuncia`, `latitude`, `longitude`, `relato_redacted`, `logradouro` |
| **Fatores Urbanos** | `dados/fatores_urbanos.csv` | CSV | UTF-8 (padrão) | ~2.085 | `coordenada_x` → `latitude`, `coordenada_y` → `longitude`, `orgao_responsavel`, `tipo_ocorrencia_descricao`, `logradouro` |
| **Câmeras CIVITAS** | `dados/cameras_areas_fm.csv` | CSV | UTF-8 (padrão) | ~985 | `geometry` (WKT POINT), `nome_area_fm` |
| **Polígonos Área FM** | `sh_area_forca/areas_forca_municipal.shp` | Shapefile | — | 8 áreas | `fid`, `nome_subar` → `nome_area`, `geometry` |
| **RELINTs** | `relints/*RI_*.docx` | DOCX | — | 8 documentos | Conteúdo textual das tabelas (8 áreas mapeadas por código RI_010–RI_017) |
| **Domínio Territorial** | `dados/outros dados/dominio_territorial - Extração 1.csv` | CSV | UTF-8 (padrão) | ~1.260 | `geometria` (WKT), `nome_territorio`, `dominio_orcrim` |
| **Censo PSR** | `dados/outros dados/CPSR_2020_2022_2024.xlsx` | XLSX | — | ~23.332 | `Chave_única`, `Latitude`, `Longitude`, `Classificação idade`, `Sexo` |

### Filtros geográficos comuns

Todos os pontos são filtrados para o bounding box do município do Rio de Janeiro:

- Latitude: `-23.2` a `-22.7`
- Longitude: `-43.9` a `-43.0`

### Filtros adicionais

- **Disque Denúncia:** apenas registros cujo `tipo` contém `"ROUBO"` ou `"FURTO"`
- **Ocorrências:** apenas registros com coordenadas válidas dentro do bbox
- **Top trechos:** logradouros com `locf_norm` com mais de 3 caracteres

### Mapeamento RELINT → Área FM

| Área FM | Código RELINT |
|---|---|
| Rodoviária - Terminal Gentileza - Estação Leopoldina | RI_010 |
| Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria | RI_011 |
| Jardim de Alah | RI_012 |
| Campo Grande: Estação de Trem - Calçadão | RI_013 |
| Rio Sul | RI_014 |
| Praia de Botafogo - Rua Marquês de Abrantes | RI_015 |
| Estações São Francisco Xavier - Afonso Pena | RI_016 |
| Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia | RI_017 |

---

## 3. Modus Operandi

Extração via regex sobre o campo `relato_redacted` das denúncias Disque Denúncia. Um relato pode receber **múltiplas tags** simultaneamente. As chaves são agregadas em `stats.modus_operandi` por contagem.

| Chave | Rótulo (UI) | Padrões regex |
|---|---|---|
| `a_pe` | A pé | `\ba p[eé]\b`, `\bcaminhando\b`, `\btranseunte` |
| `motocicleta` | Motocicleta | `\bmoto\b`, `\bmotocicleta`, `\bduas rodas` |
| `bicicleta` | Bicicleta | `\bbicicleta`, `\bciclista` |
| `armado` | Armado (arma de fogo) | `\barma de fogo`, `\bpistola`, `\brevolver`, `\barmados?\b` |
| `arma_branca` | Arma branca | `\bfaca\b`, `\bcanivete`, `\barma branca` |
| `em_grupo` | Em grupo | `\bgrupo\b`, `\bdois indiv`, `\btr[ée]s indiv`, `\bquatro indiv`, `\bbando` |
| `menores` | Menores | `\bmenores?\b`, `\badolescentes?\b` |
| `veiculo` | Veículo | `\bve[ií]culos?\b`, `\bcarros?\b` |

### Comportamento da extração

1. O texto do relato é convertido para minúsculas antes da busca.
2. Para cada categoria, basta **um** padrão corresponder para incluir a tag.
3. Categorias são independentes — um relato `"dois individuos de moto armados com pistola caminhando"` retorna `["motocicleta", "armado", "a_pe"]`.
4. Relatos vazios ou não-string retornam array vazio.

---

## Geração do artefato

```bash
cd eduardo/backend
python data_pipeline.py --data-dir ../../compstat --output areas_data.json
cp areas_data.json ../frontend/public/areas_data.json
```

---

*CompStat Municipal RJ · Hackathon Claude Impact Lab · Grupo 7*
