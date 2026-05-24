# Fontes Externas — CompStat Municipal Rio de Janeiro

Datasets públicos baixados e prontos para spatial join com as áreas FM.
Todos em CRS EPSG:4326 (WGS84). Data de download: 2026-05-24.

## Arquivos

### `bairros_rio.geojson` — Limites oficiais de bairros
- **Fonte:** Prefeitura do Rio (data.rio)
- **URL:** `https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Cartografia/Limites_administrativos/MapServer/4/query`
- **Registros:** 166 bairros
- **Colunas:** `nome`, `codbairro`, `regiao_adm`, `codra`, `area_plane`
- **Uso:** Malha base para agregar crimes/denúncias por bairro; join com censo

### `censo_2022_bairros.geojson` — População e domicílios (Censo 2022)
- **Fonte:** Prefeitura do Rio (data.rio / IBGE Censo 2022)
- **URL:** `https://pgeo3.rio.rj.gov.br/arcgis/rest/services/Censo/Limites_administrativos_Censo_2022/MapServer/2/query`
- **Registros:** 165 bairros
- **Colunas-chave:** `nome`, `codbairro`, `Total_de_pessoas_2022`, `Total_de_domicilios_2022`, `Total_de_pessoas_2010`, `diferenca_de_pessoas`
- **Uso:** Normalizar crime per capita por bairro/área FM; calcular densidade populacional

### `logradouros_rio.geojson` — Gazetteer de ruas (CadLog)
- **Fonte:** Prefeitura do Rio (CadLog — Cadastro de Logradouros)
- **URL:** `https://pgeo3.rio.rj.gov.br/arcgis/rest/services/CadLog/Trechos_Logradouros/FeatureServer/0/query`
- **Registros:** 132.052 trechos (31.632 ruas únicas em 166 bairros)
- **Colunas:** `completo` (nome da rua), `bairro`, `cod_bairro`, `tipo_logra_ext`, `hierarquia`, `tipo_trecho`
- **Geometria:** LineString
- **Uso:** Gazetteer para ancorar menções textuais ("Rua Uruguaiana", "Campo de Santana") a geometrias reais; geoparsing de redes sociais e Disque Denúncia

### `isp_rj_crimes_rio.csv` — Estatísticas criminais mensais (ISP-RJ)
- **Fonte:** Instituto de Segurança Pública do Rio de Janeiro
- **URL:** `https://www.ispdados.rj.gov.br/Arquivos/BaseDPEvolucaoMensalCisp.csv`
- **Registros:** 11.320 (Rio de Janeiro apenas, 2003–2025)
- **Granularidade:** mensal × CISP (delegacia)
- **Colunas relevantes:** `cisp`, `mes`, `ano`, `aisp`, `risp`, `roubo_transeunte`, `roubo_celular`, `roubo_em_coletivo`, `furto_transeunte`, `furto_celular`, `total_roubos`, `total_furtos` (+ 50 tipos)
- **Uso:** Validação temporal (tendência dos dados do hackathon vs. série ISP); análise longitudinal por AISP

### `setores_censitarios_rio.geojson` — Setores censitários IBGE
- **Fonte:** IBGE via pacote `geobr` (Python)
- **Registros:** 10.504 setores censitários do município do Rio
- **Colunas:** `code_tract`, `zone`, `name_neighborhood`, `code_neighborhood`, `name_subdistrict`, `name_district`
- **Uso:** Granularidade sub-bairro para análise sociodemográfica fina

## Reprodução

```python
# Para re-baixar qualquer dataset, use os URLs acima com requests + geopandas:
import requests, geopandas as gpd

r = requests.get(URL + "?where=1%3D1&outFields=*&f=geojson&resultRecordCount=5000")
gdf = gpd.GeoDataFrame.from_features(r.json()["features"], crs="EPSG:4326")
```
