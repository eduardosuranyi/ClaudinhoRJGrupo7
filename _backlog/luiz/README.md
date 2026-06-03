# CompStat Rio — Plataforma de Inteligência Criminal

Ferramenta de análise e tomada de decisão para as reuniões de CompStat da Prefeitura do Rio de Janeiro. Cruza dados criminais, denúncias, fatores urbanos, câmeras e inteligência de campo para identificar os trechos de maior risco em cada área da Força Municipal (FM), e gera automaticamente o Relatório Analítico de Área pronto para a reunião.

---

## O que o sistema faz, em ordem

1. **Carrega todos os dados** (arquivos locais, na pasta `dados/`)
2. **O analista seleciona uma área FM** e um período (anos)
3. **O sistema filtra** todos os dados para aquela área
4. **Calcula o Bingo Score** — um score de 0 a 10 por logradouro, cruzando crimes, fatores urbanos, denúncias e câmeras
5. **Mostra mapas, gráficos e tabelas** nas abas da plataforma
6. **Opcionalmente**, aciona o Claude (IA) para gerar análise qualitativa
7. **Gera um relatório .docx** no formato oficial do CompStat Municipal

---

## Fontes de dados

O sistema usa **6 arquivos de dados**, todos locais (sem banco de dados, sem API externa de dados):

### 1. `dados/df_ocorrencias_tratado - Extração 1 .csv`
**O que é:** Registro de ocorrências criminais (furtos e roubos) georreferenciadas.

**Campos usados:**
| Campo | Descrição |
|---|---|
| `latitude` / `longitude` | Coordenada do crime — usado para filtrar quais crimes estão dentro da área FM |
| `hora` | Hora do crime (0–23) — usado para identificar hora de pico |
| `dia_semana` | Dia da semana (0=Dom, 6=Sáb) — usado no heatmap |
| `mes` / `ano` | Mês e ano — o `ano` é usado para filtrar pelo período selecionado |
| `desc_delito` | Tipo de crime (ex: "Roubo a transeunte") — usado no ranking de modalidades |
| `locf` | Nome do logradouro — usado para calcular crimes por rua |
| `aisp` | Área Integrada de Segurança Pública — presente mas não usado como filtro |

**O que é ignorado:** Campos de identificação de caso, delegacia exata, e outros campos não listados acima.

**Filtros aplicados:**
- Coordenadas dentro do Rio de Janeiro (lat entre -23,1 e -22,7; lon entre -43,8 e -43,0)
- Ano(s) selecionado(s) pelo analista
- Ponto dentro do polígono da área FM selecionada

**Volume:** ~115 mil registros antes dos filtros.

---

### 2. `dados/disk_denuncia.csv`
**O que é:** Denúncias anônimas recebidas pelo Disque Denúncia.

**Campos usados:**
| Campo | Descrição |
|---|---|
| `latitude` / `longitude` | Coordenada da denúncia — usado para filtro espacial |
| `classe` | Categoria da denúncia (ex: "CRIMES CONTRA O PATRIMÔNIO") — usado para marcar se é crime patrimonial |
| `tipo` | Subtipo (ex: "ROUBO/FURTO A TRANSEUNTES") |
| `relato_redacted` | Texto da denúncia já anonimizado — enviado para o Claude quando IA está ativa |
| `logradouro` | Nome do logradouro denunciado — usado para cruzar com crimes por rua |

**O que é ignorado:** Campos de protocolo, datas internas, e outros não listados.

**Filtros aplicados:**
- Coordenadas válidas no Rio de Janeiro
- Ponto dentro do polígono da área FM
- Para o Bingo Score: só contam denúncias de `classe = "CRIMES CONTRA O PATRIMÔNIO"`

**Tipos de denúncia considerados crimes patrimoniais:**
- ROUBO/FURTO A TRANSEUNTES
- SUSPEITA DE ROUBO/FURTO
- ROUBO A MOTORISTAS
- ROUBO EM TRANSP COLETIVOS
- FURTO / ROUBO

**Volume:** ~83 mil registros antes dos filtros.

---

### 3. `dados/fatores_urbanos.csv`
**O que é:** Fatores ambientais e urbanos levantados a campo pelos agentes FM — condições físicas que favorecem crimes (iluminação ruim, lixo, vegetação obstruindo visão, etc).

**Campos usados:**
| Campo | Descrição |
|---|---|
| `coordenada_x` / `coordenada_y` | Coordenadas geográficas — **atenção:** x=latitude, y=longitude (invertido em relação ao padrão) |
| `tipo_ocorrencia_descricao` | Tipo de fator (ex: "Área mal iluminada com circulação de pedestres") |
| `tipo_ocorrencia_ativo` | Se o fator ainda está ativo (`true`/`false`) — **só fatores ativos entram** |
| `logradouro` | Nome do logradouro do fator |
| `subarea_nome` | Nome da área FM — usado para filtrar (não usa coordenada, usa esse campo direto) |
| `orgao_responsavel` | Órgão que deve resolver o problema |
| `bairro_nome` | Bairro |

**O que é ignorado:** Fatores com `tipo_ocorrencia_ativo = false` e fatores com descrição "Sem ocorrência".

**Filtro aplicado:** Campo `subarea_nome` igual ao nome da área selecionada (não usa filtro de polígono, porque os dados já foram levantados na área específica).

**Volume:** ~2.085 registros antes dos filtros.

---

### 4. `dados/cameras_areas_fm.csv`
**O que é:** Posição das câmeras CIVITAS/COR nas áreas da Força Municipal.

**Campos usados:**
| Campo | Descrição |
|---|---|
| `geometry` | Texto no formato WKT "POINT (lon lat)" — o sistema extrai longitude e latitude desse texto |
| `nome_area_fm` | Nome da área FM — usado para filtrar |

**Filtro aplicado:** Campo `nome_area_fm` igual ao nome da área selecionada.

**Volume:** ~985 câmeras totais.

---

### 5. `dados/outros dados/dominio_territorial - Extração 1.csv`
**O que é:** Polígonos de domínio territorial de organizações criminosas (ORCRIM) no Rio.

**Campos usados:**
| Campo | Descrição |
|---|---|
| `geometria` | Polígono em formato WKT — usado para checar sobreposição com a área FM |
| `dominio_orcrim` | Nome da ORCRIM (ex: CV, ADA, TCP, Milícia) |
| `nome_territorio` | Nome do território |

**Como é usado:** O sistema verifica quais polígonos de ORCRIM se sobrepõem ao polígono da área FM e exibe os grupos identificados.

---

### 6. `sh_area_forca/areas_forca_municipal.shp` (Shapefile)
**O que é:** Arquivo geográfico com os polígonos das 8 áreas de atuação da Força Municipal.

**Campo usado:**
| Campo | Descrição |
|---|---|
| `nome_subar` | Nome da área FM — chave que conecta todas as outras fontes |

**As 8 áreas disponíveis:**
- Rodoviária - Terminal Gentileza - Estação Leopoldina
- Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria
- Jardim de Alah
- Campo Grande: Estação de Trem - Calçadão
- Rio Sul
- Praia de Botafogo - Rua Marquês de Abrantes
- Estações São Francisco Xavier - Afonso Pena
- Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia

---

### 7. `relints/RI_010.docx` ... `RI_017.docx` (RELINTs)
**O que são:** Relatórios de Inteligência de Área produzidos pela própria Força Municipal. Documentos Word com análise qualitativa de campo: modus operandi, rotas de fuga, perfil de vítimas, etc.

**Como são usados:** O sistema lê o texto bruto do arquivo `.docx` (sem depender do Word instalado) e, quando a IA está ativa, passa o texto para o Claude extrair informações estruturadas.

**Mapeamento de arquivo para área:**
| Arquivo | Área |
|---|---|
| RI_010 | Rodoviária - Terminal Gentileza - Estação Leopoldina |
| RI_011 | Metrô Botafogo - Rua São Clemente - Rua Voluntários da Pátria |
| RI_012 | Jardim de Alah |
| RI_013 | Campo Grande: Estação de Trem - Calçadão |
| RI_014 | Rio Sul |
| RI_015 | Praia de Botafogo - Rua Marquês de Abrantes |
| RI_016 | Estações São Francisco Xavier - Afonso Pena |
| RI_017 | Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia |

---

## O Bingo Score — como funciona

O Bingo Score é a métrica central da plataforma. Para cada logradouro dentro da área selecionada, o sistema calcula uma pontuação de **0 a 10**, composta por 4 camadas independentes:

### Camada 1 — Mancha Criminal (0 a 4 pontos)
Quantos crimes foram registrados naquele logradouro no período.

| Crimes no logradouro | Pontos |
|---|---|
| 0 | 0 |
| 1 ou mais | 1 |
| 6 ou mais | 2 |
| 16 ou mais | 3 |
| 30 ou mais | 4 |

Também calcula hora de pico e % de crimes noturnos (18h–05h) para a narrativa.

### Camada 2 — Fatores Urbanos (0 a 3 pontos)
Quantos **tipos diferentes** de fator urbano existem naquele logradouro.

| Tipos de fator | Pontos |
|---|---|
| 0 | 0 |
| 1 | 1 |
| 3 ou mais | 2 |
| 5 ou mais | 3 |

Fatores com combinações de alto risco recebem um aviso especial na narrativa (sem pontos extras):
- Vegetação cobrindo iluminação + Área mal iluminada com pedestres
- Mobiliário abandonado + Pessoas em situação de rua
- Comércio irregular + Ponto de retenção do tráfego

### Camada 3 — Disque Denúncia Patrimônio (0 a 2 pontos)
Quantas denúncias de crime patrimonial foram feitas naquele logradouro.

| Denúncias | Pontos |
|---|---|
| 0 | 0 |
| 1 | 1 |
| 4 ou mais | 2 |

### Camada 4 — Ponto Cego de Câmera (0 a 1 ponto)
Se o logradouro tem 5 ou mais crimes **e não tem câmera** na área, ganha 1 ponto.

### Prioridade final
| Score | Prioridade |
|---|---|
| 8 a 10 | CRÍTICA |
| 6 a 7 | ALTA |
| 3 a 5 | MÉDIA |
| 0 a 2 | BAIXA |

O sistema calcula o Bingo Score para todos os logradouros da área e exibe os **top 20** ordenados por score.

---

## Mapeamento Fator → Órgão Responsável

Cada tipo de fator urbano é automaticamente vinculado ao órgão que deve resolver:

| Tipo de fator | Órgão |
|---|---|
| Vegetação obstruindo visibilidade / iluminação | COMLURB |
| Lixo/entulho obstruindo ou forçando pedestres à pista | COMLURB |
| Área mal iluminada (pedestres ou veículos) | Rio Luz |
| Calçada estreita, mobiliário abandonado, tapumes, vãos como esconderijo | SECONSERVA |
| Comércio irregular, estacionamento irregular, veículos grandes | SEOP |
| Ponto de retenção do tráfego | CET-Rio |
| Motocicletas no passeio | GM-Rio |
| Ponto de ônibus com vandalismo | SMTR |
| Pessoas em situação de rua, cena de uso de drogas | SMAS |

---

## Como as partes se encaixam (fluxo completo)

```
Arquivos CSV / SHP / DOCX
        ↓
  pipeline/ingest.py          ← lê, limpa, normaliza os dados
        ↓
  pipeline/spatial.py         ← filtra por polígono da área selecionada
        ↓
  pipeline/bingo.py           ← calcula score 0-10 por logradouro
        ↓
  pipeline/llm.py  (opcional) ← Claude analisa RELINT + denúncias e gera texto
        ↓
  app.py (Streamlit)          ← mostra na tela: mapa, tabelas, gráficos
        ↓
  pipeline/report.py          ← gera o arquivo .docx para a reunião
```

### Normalização de logradouros
Para cruzar crimes, fatores e denúncias pelo nome da rua, o sistema normaliza todos os nomes:
- Remove acentos
- Converte para maiúsculo
- Expande abreviações (R. → RUA, Av. → AVENIDA, Pres. → PRESIDENTE, etc.)

Isso permite que "Av. Pres. Vargas" case corretamente com "AVENIDA PRESIDENTE VARGAS".

---

## O que o analista vê (as 5 abas)

### Aba 1 — Mapa
Mapa interativo com 6 camadas sobrepostas, todas ativáveis/desativáveis:
- **Contorno azul** do polígono da área FM
- **Heatmap de crimes** (vermelho = mais crimes)
- **Fatores urbanos** (ícones por tipo, cor por órgão responsável)
- **Câmeras** (ícone de câmera azul)
- **Bingo Score** (círculos coloridos por prioridade, tamanho proporcional ao score)
- **Domínio ORCRIM** (polígonos semitransparentes)

### Aba 2 — Bingo Score
Tabela com todos os logradouros rankeados por score. Para cada logradouro, mostra:
- Score total e por camada
- Prioridade (com código de cores)
- Número de crimes, fatores e denúncias
- Justificativa narrativa camada a camada
- Alertas de combinações de alto risco
- Órgãos responsáveis

### Aba 3 — Análise Temporal
- Gráfico de barras de crimes por hora do dia
- Gráfico de barras de crimes por dia da semana
- Heatmap dia × hora (tabela colorida por intensidade)
- Ranking das modalidades criminais (tipo + quantidade + %)

### Aba 4 — Dinâmica Criminal
Disponível somente com IA ativa. Mostra:
- Narrativa qualitativa da dinâmica criminal (2–3 parágrafos)
- Resposta às 4 perguntas norteadoras do CompStat:
  - Os locais críticos coincidem com a rota da FM?
  - O horário de pico coincide com o QMD da FM?
  - A dinâmica criminal coincide com o modelo de emprego (moto/a pé/viatura)?
  - Os fatores urbanos estão sendo resolvidos pelos órgãos?
- Dados extraídos do RELINT (modalidade, modus operandi, rotas de fuga, receptação, ORCRIM)
- Plano de ação por órgão (6 a 12 ações específicas com local, justificativa e prazo)

### Aba 5 — Relatório
Gera o arquivo `.docx` no formato oficial do CompStat Municipal. O relatório inclui:
- Identificação da área (nome, ORCRIM, câmeras, trechos críticos)
- Tabela de indicadores criminais do período
- Distribuição por tipo de ocorrência
- Heatmap hora × dia
- Perguntas norteadoras respondidas (se IA ativa)
- Narrativa da dinâmica criminal
- Painel de Coincidências (Bingo Score — top 15 logradouros)
- Fatores de incidência por órgão
- Plano de ação e responsabilização (se IA ativa)

---

## A IA (Claude) — o que faz e o que não faz

A IA é **opcional** e acionada pelo toggle "Síntese com IA" na barra lateral. Ela **não interfere** nos dados quantitativos (crimes, bingos, mapas). Sua função é exclusivamente qualitativa:

| Função | Entrada | Saída |
|---|---|---|
| Extrair dinâmica do RELINT | Texto bruto do RELINT (até 6.000 caracteres) | Modalidade, modus operandi, rotas de fuga, ORCRIM, horário |
| Sintetizar Disque Denúncia | Amostra de até 30 relatos | Padrões, locais citados, percepção de insegurança |
| Narrativa da dinâmica criminal | Dados do RELINT + denúncias + crimes | 2–3 parágrafos no estilo CompStat |
| Perguntas norteadoras | Dados quantitativos + RELINT + bingos | Diagnóstico + recomendação para cada pergunta |
| Plano de ação | Top 10 bingos + RELINT + denúncias | 6 a 12 ações específicas por órgão |

**Modelo usado:** claude-opus-4-6
**Configuração:** Requer `ANTHROPIC_API_KEY` definida no arquivo `.env`

---

## O que está fora do escopo atual

- **Dados em tempo real:** Não há conexão com sistemas ao vivo da PMERJ, ISP ou COR. Todos os dados são arquivos estáticos.
- **Variação percentual entre períodos:** O sistema filtra por anos, mas não calcula variação em relação ao período anterior (campo aparece como "–" no relatório).
- **Câmeras por logradouro:** A associação câmera/logradouro é feita por área inteira — se a área tem câmera, todos os logradouros recebem a flag. Distância ponto a ponto não é calculada.
- **RELINTs longos:** Texto do RELINT é truncado em 6.000 caracteres antes de ser enviado à IA.
- **CPSR_2020_2022_2024.xlsx:** Arquivo presente na pasta mas não carregado pelo sistema atual.
- **Comparação entre áreas FM:** Não há ranking comparativo entre as 8 áreas.

---

## Como rodar

```bash
# Instalar dependências
pip install -r requirements.txt

# Definir chave de IA (opcional, só para síntese com IA)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env

# Iniciar a plataforma
streamlit run app.py
```

Acesse em `http://localhost:8501`. Selecione uma área FM, escolha os anos e clique em **Gerar Análise**.
