-- ============================================================================
-- Central 1746 — Queries para CompStat Municipal (Grupo 7)
-- ============================================================================
-- Tabela: datario.adm_central_atendimento_1746.chamado
-- Partição: data_particao (DATE)
-- Billing: ~$5/TB escaneado. O custo depende das partições escaneadas (cidade
-- inteira), não das linhas retornadas. Filtros de bairro/tipo reduzem output,
-- mas NÃO reduzem bytes escaneados (tabela não clusterizada por bairro/tipo).
--
-- JANELA TEMPORAL — alinhada a ocorrencias.parquet (2020-2024):
--   data_inicio = '2020-01-01'
--   data_fim    = '2024-12-31'
-- Para teste barato, restringir temporariamente (ex.: >= '2024-01-01') e
-- expandir depois. Manter 2020-2024 na extração final.
--
-- ⚠️  BUG CORRIGIDO (2026-05-24): id_bairro no BigQuery NÃO tem zeros à esquerda.
-- Queries anteriores usavam '003','004',... e só capturaram 144 e 161.
-- Agora usando IDs sem padding: '3','4','5',... (confirmado com query2_result.csv).
-- → Rodar Query 0 antes de qualquer extração para validar.
--
-- EXECUÇÃO RECOMENDADA (custo mínimo):
--   0. Query 0 — Verificação do formato id_bairro (1 partição, custo ~0)
--   1. Query 1 — JÁ RODADA (2023+, só bairros 144/161). Resultado parcial.
--   2. Query 2 — RE-RODAR com IDs corrigidos. Dry-run antes:
--        bq query --use_legacy_sql=false --dry_run < query2.sql
--      Exportar → data/external/chamados_1746_fm.csv
--   3. Queries 3 e 4 — NÃO rodar no BQ. Derivar localmente do CSV (pandas).
--
-- Bairros FM (20 bairros que intersectam os 8 polígonos FM):
--   Centro(4,5), Caju(3), Santo Cristo(?), Cidade Nova(8), Estácio(9),
--   Imp. São Cristóvão(10), Praça Bandeira(7), Rio Comprido(32),
--   Flamengo(15), Laranjeiras(17), Botafogo(20), Copacabana(22),
--   Urca(24), Ipanema(25), Lagoa(26), Leblon(27), Maracanã(33),
--   Tijuca(35), Lapa(161), Campo Grande(144)
-- ============================================================================

-- =====================
-- QUERY 0: VERIFICAÇÃO DE id_bairro (rodar primeiro — custo ~0)
-- =====================
-- Escaneia 1 partição para confirmar o formato de id_bairro.
-- Resultado esperado: valores SEM leading zeros (3, 4, 5, ..., 144, 161).

SELECT DISTINCT id_bairro
FROM `datario.adm_central_atendimento_1746.chamado`
WHERE data_particao = '2024-12-31'
ORDER BY CAST(id_bairro AS INT64);


-- =====================
-- QUERY 1: DESCOBERTA
-- =====================
-- Roda PRIMEIRO. Custo mínimo (~MB).
-- Mostra quais tipos/subtipos existem nos bairros FM.
--
-- EXECUÇÃO ANTERIOR (2026-05-24, janela 2023+) — querry1_result_bigQuerry.json
-- ⚠️  Resultado PARCIAL: usava IDs com leading zeros → só capturou bairros 144/161.
-- Se precisar re-rodar com todos os 20 bairros, usar os IDs corrigidos abaixo.
--
-- IMPORTANTE: `tipo` no BigQuery usa capitalização exata (ex.: "Iluminação Pública",
-- não "iluminação pública"). Query 2 usa match exato, calibrado com o resultado.

SELECT
  tipo,
  subtipo,
  nome_unidade_organizacional,
  COUNT(*) AS total_chamados,
  COUNTIF(latitude IS NOT NULL AND longitude IS NOT NULL) AS com_coordenadas,
  COUNTIF(tipo_situacao = 'Atendido') AS atendidos,
  ROUND(AVG(IF(data_fim IS NOT NULL AND data_inicio IS NOT NULL,
    DATETIME_DIFF(data_fim, data_inicio, HOUR), NULL)), 1) AS horas_resolucao_media
FROM `datario.adm_central_atendimento_1746.chamado`
WHERE data_particao >= '2020-01-01'
  AND data_particao <= '2024-12-31'
  AND id_bairro IN (
    '3','4','5','7','8','9','10',
    '15','17','20','22','24','25','26',
    '27','32','33','35','144','161'
  )
GROUP BY tipo, subtipo, nome_unidade_organizacional
HAVING total_chamados >= 10
ORDER BY total_chamados DESC;


-- =====================
-- QUERY 2: EXTRAÇÃO  ← RODAR ESTA (dry-run antes)
-- =====================
-- Extrai chamados individuais relevantes para os fatores CompStat.
-- Janela 2020-2024 = mesmo período de ocorrencias.parquet (roubos).
-- Tipos calibrados com querry1_result_bigQuerry.json (Query 1, 2026-05-24).
-- Exportar resultado como CSV para data/external/chamados_1746_fm.csv

SELECT
  id_chamado,
  data_inicio,
  data_fim,
  id_bairro,
  id_logradouro,
  numero_logradouro,
  nome_unidade_organizacional,
  tipo,
  subtipo,
  status,
  tipo_situacao,
  dentro_prazo,
  latitude,
  longitude,
  reclamacoes,
  data_particao
FROM `datario.adm_central_atendimento_1746.chamado`
WHERE data_particao >= '2020-01-01'
  AND data_particao <= '2024-12-31'
  AND id_bairro IN (
    '3','4','5','7','8','9','10',
    '15','17','20','22','24','25','26',
    '27','32','33','35','144','161'
  )
  AND tipo IN (
    -- RioLuz — iluminação deficiente / poste apagado
    'Iluminação Pública',
    'Manutenção de iluminação pública',
    -- COMLURB — vegetação, lixo, poda, entulho
    'Manejo Arbóreo',
    'Remoção Gratuita',
    'Limpeza de logradouros',
    'Controle de roedores e caramujos',
    'Coleta domiciliar',
    'Coleta Seletiva',
    'Diversos - Comlurb',
    'Fiscalização de caçamba de empresa particular',
    'Instalação e manutenção de contêineres, caçambas e papeleiras',
    'Limpeza e manutenção de praças e parques',
    'Limpeza de margens de rios',
    'Fiscalização de Grande Gerador',
    'Papeleira',
    -- SECONSERVA — calçadas, vias, drenagem, mobiliário
    'Pavimentação',
    'Calçadas',
    'Conservação de vias',
    'Vias públicas',
    'Drenagem e Saneamento',
    'Mobiliário Urbano',
    'Parques',
    'Recapeamento asfáltico',
    -- SEOP — comércio irregular, estacionamento, ordem pública
    'Comércio ambulante',
    'Estacionamento irregular',
    'Estacionamento ',
    'Ordem pública',
    'Ocupação de área pública',
    'Ocupação irregular nas calçadas',
    'Publicidade',
    'Feiras',
    -- SMAS — PSR / acolhimento
    'Atendimento Social',
    'Pedidos de acolhimento',
    -- CET-Rio — trânsito, semáforo, sinalização
    'Semáforo',
    'Sinalização Gráfica',
    'Sinalização Semafórica',
    'Fiscalizacao de trânsito',
    'Engenharia de tráfego',
    'Regulamentações Viárias',
    'Fiscalização Eletrônica',
    'Quebra-molas (OT)',
    -- GM-Rio — fiscalização, perturbação, patrulhamento
    'Perturbação do sossego',
    'Patrulhamento público',
    'Guarda Municipal / Fiscalização de trânsito',
    -- SMTR — transporte público, abrigos
    'Ônibus',
    'BRT (corredor expresso de ônibus)',
    'Ônibus - pontos terminais/paradas/itinerários',
    'Transporte Especial Complementar - TEC'
  )
ORDER BY data_particao, id_bairro;


-- =====================
-- QUERY 3: SÉRIE TEMPORAL (referência — preferir derivar do CSV da Q2)
-- =====================
-- Agregação mensal por bairro e tipo.
-- NÃO rodar no BigQuery se Q2 já foi exportada — reproduzir em pandas:
--   df.groupby([df.data_particao.str[:7], 'id_bairro', 'tipo', ...]).agg(...)
-- Mantida aqui só como referência de schema de saída.

SELECT
  FORMAT_DATE('%Y-%m', data_particao) AS mes,
  id_bairro,
  tipo,
  nome_unidade_organizacional AS orgao,
  COUNT(*) AS chamados,
  COUNTIF(tipo_situacao = 'Atendido') AS atendidos,
  COUNTIF(tipo_situacao = 'Não atendido') AS nao_atendidos,
  COUNTIF(dentro_prazo = 'S') AS no_prazo,
  COUNTIF(dentro_prazo = 'N') AS fora_prazo,
  ROUND(AVG(IF(data_fim IS NOT NULL AND data_inicio IS NOT NULL,
    DATETIME_DIFF(data_fim, data_inicio, HOUR), NULL)), 1) AS horas_resolucao_media
FROM `datario.adm_central_atendimento_1746.chamado`
WHERE data_particao >= '2020-01-01'
  AND data_particao <= '2024-12-31'
  AND id_bairro IN (
    '3','4','5','7','8','9','10',
    '15','17','20','22','24','25','26',
    '27','32','33','35','144','161'
  )
GROUP BY mes, id_bairro, tipo, orgao
ORDER BY mes, id_bairro, tipo;


-- =====================
-- QUERY 4: HOTSPOTS (referência — preferir derivar do CSV da Q2)
-- =====================
-- Para spatial join com polígonos FM.
-- Apenas chamados com lat/lon, agregados por logradouro+tipo.
-- Usa o mesmo filtro de `tipo` da Query 2. Derivar localmente do CSV.

SELECT
  id_bairro,
  id_logradouro,
  tipo,
  subtipo,
  nome_unidade_organizacional AS orgao,
  COUNT(*) AS total_chamados,
  COUNTIF(tipo_situacao = 'Atendido') AS atendidos,
  ROUND(AVG(latitude), 6) AS lat_media,
  ROUND(AVG(longitude), 6) AS lon_media,
  MIN(data_particao) AS primeiro_chamado,
  MAX(data_particao) AS ultimo_chamado,
  SUM(reclamacoes) AS total_reclamacoes
FROM `datario.adm_central_atendimento_1746.chamado`
WHERE data_particao >= '2020-01-01'
  AND data_particao <= '2024-12-31'
  AND id_bairro IN (
    '3','4','5','7','8','9','10',
    '15','17','20','22','24','25','26',
    '27','32','33','35','144','161'
  )
  AND tipo IN (
    'Iluminação Pública',
    'Manutenção de iluminação pública',
    'Manejo Arbóreo',
    'Remoção Gratuita',
    'Limpeza de logradouros',
    'Controle de roedores e caramujos',
    'Coleta domiciliar',
    'Coleta Seletiva',
    'Diversos - Comlurb',
    'Fiscalização de caçamba de empresa particular',
    'Instalação e manutenção de contêineres, caçambas e papeleiras',
    'Limpeza e manutenção de praças e parques',
    'Limpeza de margens de rios',
    'Fiscalização de Grande Gerador',
    'Papeleira',
    'Pavimentação',
    'Calçadas',
    'Conservação de vias',
    'Vias públicas',
    'Drenagem e Saneamento',
    'Mobiliário Urbano',
    'Parques',
    'Recapeamento asfáltico',
    'Comércio ambulante',
    'Estacionamento irregular',
    'Estacionamento ',
    'Ordem pública',
    'Ocupação de área pública',
    'Ocupação irregular nas calçadas',
    'Publicidade',
    'Feiras',
    'Atendimento Social',
    'Pedidos de acolhimento',
    'Semáforo',
    'Sinalização Gráfica',
    'Sinalização Semafórica',
    'Fiscalizacao de trânsito',
    'Engenharia de tráfego',
    'Regulamentações Viárias',
    'Fiscalização Eletrônica',
    'Quebra-molas (OT)',
    'Perturbação do sossego',
    'Patrulhamento público',
    'Guarda Municipal / Fiscalização de trânsito',
    'Ônibus',
    'BRT (corredor expresso de ônibus)',
    'Ônibus - pontos terminais/paradas/itinerários',
    'Transporte Especial Complementar - TEC'
  )
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
GROUP BY id_bairro, id_logradouro, tipo, subtipo, orgao
HAVING total_chamados >= 3
ORDER BY total_chamados DESC;
