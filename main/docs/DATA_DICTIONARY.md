# Dicionário de Dados — CompStat Municipal RJ

Referência completa do artefato `areas_data.json`, produzido pelo pipeline Python (`backend/data_pipeline.py`) e consumido pelo frontend Next.js e pelo gerador de relatório `.docx`.

Este documento mapeia cada campo do JSON às fontes de dados e conceitos descritos no [briefing técnico](../../claude_impact_lab_compstat_rio/Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf) do hackathon.

---

## 1. Schema `areas_data.json`

### 1.1 Estrutura Raiz

| Campo | Tipo | Descrição |
|---|---|---|
| `areas` | `Area[]` | Lista das áreas da Força Municipal (FM), ordenadas por `score.total` decrescente |
| `meta` | `object` | Metadados globais do dataset e períodos de referência |

### 1.2 Objeto `meta`

Metadados globais usados pelo `TopHeader` e para contextualização dos dados.

| Campo | Tipo | Faixa / Valores | Descrição |
|---|---|---|---|
| `total_ocorrencias` | `number` | >= 0 | Registros no CSV de ocorrências ISP após filtro geográfico |
| `total_ocorrencias_em_areas` | `number` | >= 0 | Ocorrências com ponto dentro de algum polígono FM |
| `total_denuncias` | `number` | >= 0 | Denúncias Disque Denúncia filtradas por roubo/furto |
| `total_fatores_urbanos` | `number` | >= 0 | Fatores urbanos mapeados |
| `total_cameras` | `number` | >= 0 | Câmeras CIVITAS no dataset |
| `total_areas` | `number` | 8 | Polígonos de área FM |
| `total_psr` | `number` | >= 0 | Registros do censo de PSR |
| `periodo_criminal` | `string` | ex.: `"2020-2024"` | Período das ocorrências |
| `periodo_fatores` | `string` | ex.: `"2026"` | Período dos fatores urbanos |
| `periodo_denuncias` | `string` | ex.: `"2025"` | Período das denúncias |
| `has_censo` | `boolean?` | — | Flag: Censo 2022 disponível |
| `has_1746` | `boolean?` | — | Flag: Central 1746 disponível |
| `populacao_total_bairros_fm` | `number?` | — | Pop. total das áreas FM (Censo 2022) |

---

## 2. Objeto `Area`

Cada elemento de `areas` representa uma área operacional da Força Municipal. Todos os campos correspondem a informações exigidas no Relatório Analítico de Área (seção 6.1 do briefing).

### 2.1 Identificação e Geometria

| Campo | Tipo | Descrição | Seção do Relatório |
|---|---|---|---|
| `id` | `number` | FID do shapefile `areas_forca_municipal.shp` | — |
| `nome` | `string` | Nome completo da área FM (`nome_subar` do SHP) | Identificação da Área |
| `geometry` | `GeoJSON` | Polígono da área em WGS84 (EPSG:4326) | Mapa de segmentos |

### 2.2 `identificacao`

Dados institucionais da área, correspondentes à seção "Identificação da Área" do relatório.

| Campo | Tipo | Valores | Descrição | Ref. no Briefing |
|---|---|---|---|---|
| `aisp` | `number \| null` | 1–99 | AISP modal das ocorrências na área | Identificação |
| `risp` | `number \| null` | 1–99 | RISP modal das ocorrências | Identificação |
| `base_fm` | `string` | `"Central"`, `"Litorânea"` | Base operacional da FM | Identificação |
| `subprefeitura` | `string` | — | Subprefeitura (do Censo ou placeholder `"—"`) | Identificação |
| `dominio_principal` | `string` | `"CV"`, `"TCP"`, `"ADA"`, `"Milícia"`, `"—"` | Facção/ORCRIM dominante | Identificação |
| `bairros` | `string[]?` | — | Bairros intersectando o polígono FM (Censo) | Enriquecimento |
| `populacao_bairros_2022` | `number?` | — | População residente (Censo 2022) | Enriquecimento |

### 2.3 `stats`

Estatísticas agregadas da área, correspondentes às seções "Indicadores do Período", "Distribuição por Tipo" e "Análise Temporal" do relatório.

| Campo | Tipo | Descrição | Seção do Relatório |
|---|---|---|---|
| `crimes_total` | `number` | Ocorrências dentro do polígono | Indicadores do Período |
| `crimes_por_tipo` | `Record<string, number>` | Contagem por `desc_delito` | Distribuição por Tipo |
| `pico_horario` | `string` | Hora com maior volume (`"0h"`–`"23h"`) | Análise Temporal |
| `pct_noturno` | `number` | % de crimes entre 18h–23h e 0h–5h (0.0–100.0) | Análise Temporal |
| `hora_distribution` | `Record<string, number>` | Distribuição por hora (chaves `"0"`–`"23"`) | Análise Temporal |
| `dia_distribution` | `Record<string, number>` | Distribuição por dia da semana | Análise Temporal |
| `denuncias_total` | `number` | Denúncias DD georreferenciadas na área | Indicadores |
| `fatores_urbanos_total` | `number` | Fatores urbanos dentro do polígono | Fatores de Incidência |
| `cameras_total` | `number` | Câmeras CIVITAS associadas | Câmeras (seção 4) |
| `psr_total` | `number` | Registros PSR no polígono | Fatores (PSR) |
| `modus_operandi` | `Record<string, number>` | Frequência de modus extraídos via regex | Dinâmica Criminal |
| `populacao_estimada` | `number?` | Pop. residente **dos bairros do entorno** (soma Censo 2022, número de contexto) | Enriquecimento |
| `populacao_ponderada` | `number?` | Pop. residente **estimada dentro do polígono FM** por interpolação areal — denominador de `crimes_per_1000_hab` (ver DATA_LOGIC_FIXES.md) | Enriquecimento |
| `crimes_per_1000_hab` | `number?` | Crimes por 1.000 residentes do polígono = `crimes_total / populacao_ponderada × 1000`. Em corredores comerciais/de passagem (poucos residentes) o valor é alto — reflete exposição relativa a residentes, não ao fluxo diário | Enriquecimento |
| `denuncias_drogas` | `number?` | Denúncias de consumo de drogas (fator SMAS) | Fatores |

#### Tipos de Crime (`crimes_por_tipo`)

Valores típicos do campo `desc_delito`:
- `"Roubo a transeunte"` — mais frequente em todas as áreas
- `"Roubo de aparelho celular"`
- `"Roubo em coletivo"`
- `"Furto"` e suas variantes

### 2.4 `top_trechos`

Array com até **10** logradouros de maior incidência criminal, correspondentes à priorização por segmento de rua exigida no briefing. Alimenta a tab Trechos e o Painel de Coincidências.

| Campo | Tipo | Descrição | Ref. no Briefing |
|---|---|---|---|
| `locf_norm` | `string` | Logradouro normalizado (minúsculas) | Mapeamento de segmentos |
| `total` | `number` | Total de ocorrências no trecho | Volume criminal |
| `lat` | `number` | Latitude média (-23.2 a -22.7) | Geolocalização |
| `lng` | `number` | Longitude média (-43.9 a -43.0) | Geolocalização |
| `roubo_transeunte` | `number` | Contagem de roubo a transeunte | Distribuição por Tipo |
| `roubo_celular` | `number` | Contagem de roubo de celular | Distribuição por Tipo |
| `roubo_coletivo` | `number` | Contagem de roubo em coletivo | Distribuição por Tipo |
| `pico_hora` | `number` | Hora modal (0–23) | Análise Temporal |
| `bingo_count` | `number` | Camadas coincidentes (1–3) | Painel de Coincidências |
| `bingo_layers` | `object` | Detalhamento por camada | Painel de Coincidências |
| `bingo_layers.crime` | `boolean` | Presença de crime no trecho | Seção 5: Mancha Criminal |
| `bingo_layers.fatores` | `boolean` | Fator urbano **a ≤ `BINGO_PROXIMITY_M` (100 m) dos crimes do trecho** (proximidade espacial; fallback de nome exato p/ registros sem coordenada) | Seção 5: Fator Urbano |
| `bingo_layers.sinais` | `boolean` | Denúncia DD a ≤ 100 m dos crimes do trecho (mesma regra espacial) | Seção 5: Dinâmica Criminal |

### 2.5 Campos de Coincidência (Bingo)

Implementam a lógica da seção 5 do briefing ("Lógica de Análise") — a identificação automática de sobreposição entre camadas.

| Campo | Tipo | Descrição |
|---|---|---|
| `n_bingo_trechos` | `number` | Trechos com 2+ camadas coincidentes |
| `n_triple_bingo` | `number` | Trechos com 3/3 camadas (máxima prioridade) |

### 2.6 `camera_gaps`

Análise de lacunas de cobertura de câmeras. Endereça o Desafio 4 do briefing (Otimização de Cobertura).

| Campo | Tipo | Descrição |
|---|---|---|
| `n_cameras` | `number` | Câmeras na área |
| `coverage_radius_m` | `number` | Raio de cobertura por câmera (50 m) |
| `cameras` | `Array<{lat, lng}>` | Coordenadas das câmeras |
| `gaps` | `CameraGap[]` | Pontos cegos prioritários (até 15) |
| `coverage_method` | `string` | `"network"` quando a cobertura usa distância pela malha viária; `"euclidean"` no fallback em linha reta (grafo ausente / câmera não ancorável) |

Cada `CameraGap` (ordenado por `priority_score` decrescente):

| Campo | Tipo | Valores | Descrição |
|---|---|---|---|
| `rank` | `number` | 1–15 | Prioridade do gap (1 = maior `priority_score`) |
| `lat` | `number` | WGS84 | Latitude do cluster |
| `lng` | `number` | WGS84 | Longitude do cluster |
| `uncovered_crimes` | `number` | >= 1 | Ocorrências sem cobertura no cluster (clustering espacial DBSCAN-like, raio `CAMERA_CLUSTER_EPS_M` = 60 m) |
| `nearest_camera_m` | `number` | >= 0 | Distância **em linha reta** à câmera mais próxima (metros) |
| `network_camera_m` | `number \| null` | >= 0 | Distância **pela malha viária** à câmera mais próxima; `null` se grafo ausente ou nó inalcançável |
| `priority_score` | `number` | > 0 | Contagem de crimes ponderada por severidade × fator de distância à câmera. Base do ranking |
| `recommendation` | `string` | `"instalar"`, `"remanejar"` | `"remanejar"` se a distância escolhida (rede quando disponível) <= 100 m; caso contrário `"instalar"` |
| `justification` | `string` | — | Texto explicativo (indica se a distância citada é "rede viária" ou "linha reta") |

### 2.7 `fatores_por_orgao`

Array ordenado por `total` decrescente. Corresponde à seção "Fatores de Incidência Criminal" do relatório e à matriz de fatores urbanos do briefing.

| Campo | Tipo | Descrição |
|---|---|---|
| `orgao` | `string` | Órgão responsável pela resolução |
| `total` | `number` | Total de fatores na área |
| `tipos` | `Array<{tipo, count}>` | Até 5 tipos mais frequentes |

#### Órgãos Responsáveis (Matriz do Briefing)

| Órgão | Fatores sob responsabilidade |
|---|---|
| **Comlurb** | Vegetação encobrindo iluminação, vegetação obstruindo visibilidade, lixo/entulho |
| **RioLuz** | Área mal iluminada (pedestres), área mal iluminada (veículos) |
| **Seconserva** | Mobiliário desviando pedestres, calçada estreita, esconderijos (mobiliário, tapumes, vãos) |
| **SEOP** | Comércio irregular, estacionamento irregular, veículos obstruindo |
| **SMAS** | PSR (adultos, crianças, famílias), cenas de uso de drogas |
| **CET-Rio** | Retenção de tráfego, motocicletas no passeio |
| **GM-Rio** | Motocicletas/bicicletas no passeio, praças/parques |
| **SMTR** | Pontos de ônibus com vandalismo |

### 2.8 `relatos_sample`

Amostra de até **8** relatos do Disque Denúncia. Corresponde à camada qualitativa descrita na seção 4.1 do briefing.

| Campo | Tipo | Descrição |
|---|---|---|
| `tipo` | `string` | Tipo da denúncia (ex.: `"ROUBO A MOTORISTAS"`) |
| `data` | `string` | Data/hora (`data_denuncia`) |
| `bairro` | `string` | Bairro (`bairro_logradouro`) |
| `logradouro` | `string` | Logradouro informado |
| `relato` | `string` | Texto redigido (`relato_redacted`), truncado em 400 chars |
| `modus` | `string[]` | Tags de modus operandi extraídas (ver seção 5) |
| `perfil_suspeito` | `object?` | Perfil de envolvidos (sexo, idade, pele) |

### 2.9 RELINT (Relatório de Inteligência)

Corresponde a uma das cinco fontes de dados do CompStat (seção 4 do briefing). Os RELINTs são a principal fonte qualitativa de inteligência de campo.

| Campo | Tipo | Descrição |
|---|---|---|
| `relint_disponivel` | `boolean` | `true` se existe RELINT para a área |
| `relint.full_text` | `string` | Texto completo em Markdown |
| `relint.sections` | `Array<{titulo, texto}>` | Seções estruturadas do documento |

### 2.10 `dominio_territorial`

Polígonos de facções/ORCRIM que intersectam a área. Contextualiza a dinâmica criminal conforme descrito no briefing ("influência de organizações criminosas no espaço analisado").

| Campo | Tipo | Descrição |
|---|---|---|
| `nome` | `string` | Nome do território |
| `faccao` | `string` | Domínio ORCRIM (`"CV"`, `"TCP"`, `"ADA"`, `"Milícia"`) |
| `geometry` | `GeoJSON` | Polígono do território em WGS84 |

### 2.11 `evolucao_mensal`

Série temporal dos últimos **24 meses**. Usado para análise de tendência e eventual aplicação do Desafio 3 do briefing (Relatório de Permanência Operacional).

| Campo | Tipo | Descrição |
|---|---|---|
| `mes` | `string` | Período `"YYYY-MM"` |
| `total` | `number` | Ocorrências no mês |

### 2.12 `map_layers`

Pontos amostrados para visualização no mapa MapLibre.

| Camada | Campos | Limite | Uso no mapa |
|---|---|---|---|
| `crime_points` | `lat`, `lng`, `tipo`, `h` | ~600 pts | Heatmap / pontos |
| `fatores_points` | `lat`, `lng`, `tipo`, `orgao`, `logradouro` | 300 pts | Pontos por órgão |
| `cameras_points` | `lat`, `lng` | todos | Marcadores CIVITAS |
| `psr_points` | `lat`, `lng` | 400 pts | Pontos do censo PSR |

- `crime_points.h`: hora numérica (0–23) ou `null`
- `crime_points.tipo`: valor de `desc_delito`
- Amostragem balanceada por tipo para evitar domínio visual de uma categoria

### 2.13 `score`

Score composto de risco operacional (0–100), normalizado entre as 8 áreas.

| Campo | Tipo | Faixa | Descrição |
|---|---|---|---|
| `total` | `number` | 0–100 | Soma dos componentes |
| `breakdown.mancha_criminal` | `number` | 0–40 | Volume de crimes normalizado |
| `breakdown.pico_horario` | `number` | 0–15 | Concentração nas 3 horas de pico |
| `breakdown.fatores_urbanos` | `number` | 0–25 | Volume de fatores normalizado |
| `breakdown.dinamica` | `number` | 0–15 | Volume de denúncias normalizado |
| `breakdown.relint_bonus` | `number` | 0 ou 5 | Bônus fixo quando RELINT disponível |

### 2.14 Campos de Enriquecimento (v2.1.0)

Campos opcionais adicionados com fontes externas. Todos são `?` (opcionais) nos tipos TypeScript.

| Campo | Tipo | Fonte | Descrição |
|---|---|---|---|
| `denuncias_por_bairro` | `DenunciaBairro[]?` | DD geocodificado | DD agregado por bairro no entorno |
| `chamados_1746` | `Chamados1746?` | BigQuery export | Chamados agrupados por tipo/órgão |

---

## 3. Fontes de Dados de Entrada

### 3.1 Mapeamento às 5 Fontes do Briefing

O briefing (seção 4) define 5 fontes de dados. A plataforma as implementa assim:

| Fonte (briefing) | Tipo (briefing) | Arquivo(s) | Loader no pipeline |
|---|---|---|---|
| **Ocorrências criminais** | Quantitativo | `ocorrencias.parquet` / CSV | `load_ocorrencias()` |
| **Disque Denúncia** | Qualitativo — dinâmica criminal | `disk_denuncia.parquet` / CSV | `load_dd()`, `load_dd_drogas()`, `load_dd_all_geo()` |
| **RELINTs da FM** | Qualitativo — dinâmica criminal | `relints.json` / `relints/*.docx` | `load_relints()` |
| **Fatores de incidência criminal** | Qualitativo — fatores urbanos | `fatores_urbanos.parquet` / CSV | `load_fatores()` |
| **Polígonos de atuação da FM** | Geoespacial — operacional | `areas_forca_municipal.geojson` / SHP | `load_areas_fm()` |

### 3.2 Fontes Adicionais (não no briefing)

| Fonte | Arquivo | Loader | Contribuição |
|---|---|---|---|
| **Câmeras CIVITAS** | `cameras.parquet` / CSV | `load_cameras()` | KPI, camada, gap analysis |
| **Domínio Territorial** | `dominio_territorial.parquet` / CSV | `load_dominio()` | Facções, camada, identificação |
| **Censo PSR** | `psr.parquet` / XLSX | `load_psr()` | KPI, camada, fator SMAS |
| **Bairros data.rio** | `bairros_rio.geojson` | `load_bairros()` | Contexto geográfico |
| **Censo 2022** | `censo_2022_bairros.geojson` | `load_censo()` | Pop. per capita |
| **Central 1746** | `chamados_1746_fm.csv` | `load_chamados_1746()` | Validação de fatores |
| **DD Drogas** | (filtro do DD) | `load_dd_drogas()` | Cenas de drogas (SMAS) |

### 3.3 Detalhes das Fontes Principais

| Fonte | Formato | Encoding | Volume | Colunas usadas |
|---|---|---|---|---|
| **Ocorrências ISP** | CSV/Parquet | UTF-8 | ~115.318 | `latitude`, `longitude`, `hora`, `locf`, `desc_delito`, `data`, `dia_semana`, `aisp`, `risp` |
| **Disque Denúncia** | CSV (`;`) / Parquet | Latin-1 | ~8.770 (R/F) | `tipo`, `bairro_logradouro`, `data_denuncia`, `latitude`, `longitude`, `relato_redacted`, `logradouro` |
| **Fatores Urbanos** | CSV / Parquet | UTF-8 | ~2.085 | `coordenada_x` -> `latitude`, `coordenada_y` -> `longitude`, `orgao_responsavel`, `tipo_ocorrencia_descricao`, `logradouro` |
| **Câmeras CIVITAS** | CSV / Parquet | UTF-8 | ~985 | `geometry` (WKT POINT), `nome_area_fm` |
| **Polígonos FM** | SHP / GeoJSON | — | 8 áreas | `fid`, `nome_subar` -> `nome_area`, `geometry` |
| **RELINTs** | DOCX / JSON | — | 8 docs | Texto das tabelas, mapeado por código RI_010–RI_017 |
| **Domínio** | CSV / Parquet | UTF-8 | ~1.260 | `geometria` (WKT), `nome_territorio`, `dominio_orcrim` |
| **Censo PSR** | XLSX / Parquet | — | ~23.332 | `Chave_única`, `Latitude`, `Longitude`, `Classificação idade`, `Sexo` |

### 3.4 Filtros Geográficos

Todos os pontos são filtrados para o bounding box do município do Rio de Janeiro:

| Coordenada | Mínimo | Máximo |
|---|---|---|
| Latitude | -23.2 | -22.7 |
| Longitude | -43.9 | -43.0 |

### 3.5 Filtros Adicionais

| Fonte | Filtro | Justificativa |
|---|---|---|
| **Disque Denúncia** | `tipo` contém `"ROUBO"` ou `"FURTO"` | CompStat foca em crimes patrimoniais |
| **Ocorrências** | Coordenadas válidas dentro do bbox | Exclui registros sem geolocalização |
| **Top trechos** | `locf_norm` com mais de 3 caracteres | Exclui logradouros inválidos |

### 3.6 Mapeamento RELINT → Área FM

Cada RELINT é mapeado a uma área FM pelo código do documento:

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

## 4. Importância dos Dados Qualitativos

Conforme a seção 4.1 do briefing, os dados qualitativos (Disque Denúncia e RELINTs) são o **principal diferencial** da plataforma em relação a sistemas de BI convencionais:

> *"São eles que descrevem a dinâmica criminal: como o crime acontece, quem são os atores, quais são as rotas de fuga, onde ocorre o escoamento de bens. Essa camada qualitativa, quando cruzada automaticamente com a mancha quantitativa e os fatores urbanos, é o que permite gerar recomendações de ação precisas e contextualizadas."*

Na plataforma:

| Dado qualitativo | Como é processado | Onde aparece |
|---|---|---|
| **Relatos DD** | Extração de modus operandi via regex (8 categorias) | DenunciasTab, OverviewTab |
| **Texto do RELINT** | Parseamento de seções do DOCX; texto completo enviado ao Claude | InteligenciaTab, RelatorioTab |
| **Dinâmica criminal** | Síntese qualitativa gerada pela IA com base em DD + RELINT | RelatorioTab, relatório `.docx` |

---

## 5. Modus Operandi

Extração via regex sobre o campo `relato_redacted` das denúncias DD. Um relato pode receber **múltiplas tags**.

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

### Comportamento da Extração

1. O texto do relato é convertido para **minúsculas** antes da busca
2. Para cada categoria, basta **um** padrão corresponder para incluir a tag
3. Categorias são **independentes** — um relato pode ter múltiplas tags simultaneamente
4. Relatos vazios ou não-string retornam array vazio

**Exemplo:** *"dois individuos de moto armados com pistola caminhando"* retorna `["motocicleta", "armado", "a_pe", "em_grupo"]`

A informação de modus operandi é essencial para a terceira pergunta norteadora: **"A dinâmica criminal coincide com o modelo de emprego da FM?"** — se predomina moto, a patrulha a pé não resolve.

---

## 6. Geração do Artefato

```bash
cd eduardo/backend

# Dados integrados (padrão — dados em eduardo/data/)
python data_pipeline.py --data-dir ../data --output areas_data.json

# Layout CSV legacy (dados brutos do hackathon)
python data_pipeline.py --data-dir ../../compstat --output areas_data.json

# Copiar para o frontend
cp areas_data.json ../frontend/public/areas_data.json

# (Opcional) Gerar rio_context.json — camadas city-wide + anéis de entorno
python data_pipeline.py --data-dir ../data --output areas_data.json --with-rio-context
cp rio_context.json ../frontend/public/rio_context.json
```

---

## 7. `rio_context.json` (artefato adicional)

Gerado com `--with-rio-context`. Carregado lazily pelo frontend quando o operador ativa camadas "Rio Inteiro".

| Campo | Tipo | Descrição |
|---|---|---|
| `meta.generated_at` | `string` | Data de geração |
| `meta.buffer_m` | `number` | Raio do anel de entorno (default 500m) |
| `meta.crime_total` | `number` | Total de pontos de crime city-wide |
| `meta.dd_total` | `number` | Total de denúncias DD city-wide |
| `meta.dominio_total` | `number` | Total de polígonos de domínio |
| `meta.isp_period` | `string?` | Período dos dados ISP agregados |
| `rings[]` | `object[]` | Anéis de entorno (buffer 500m menos FM) |
| `rings[].fid` | `number` | ID da área FM |
| `rings[].nome` | `string` | Nome da área FM |
| `rings[].crimes_in_ring` | `number` | Crimes dentro do anel |
| `rings[].dd_in_ring` | `number` | Denúncias dentro do anel |
| `rings[].geometry` | `GeoJSON.Geometry` | Polígono do anel |
| `crime_points[]` | `{lat, lng, tipo, h}[]` | Todos os crimes georreferenciados |
| `dd_points[]` | `{lat, lng, tipo}[]` | Todas as denúncias DD georreferenciadas |
| `dominio` | `FeatureCollection` | Polígonos de domínio OrCrim (simplificados) |
| `aisp_violence` | `Record<string, Record<string, number>>` | Série ISP por AISP (sem geometria) |

---

## 8. Referências

- [Arquitetura](ARCHITECTURE.md) — fluxo de dados e decisões técnicas
- [Referência da API](API_REFERENCE.md) — como o frontend consome os dados
- [Guia de Contribuição](CONTRIBUTING.md) — como adicionar novos campos e métricas

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7*
