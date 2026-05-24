# Data — CompStat Municipal Rio de Janeiro (Grupo 7)

Dados integrados para as **8 áreas de atuação da Força Municipal (FM)**, com contexto
socioespacial dos bairros do entorno, prontos para alimentar relatórios analíticos,
inteligência e BI.

**CRS padrão:** EPSG:4326 (WGS84)
**Escopo criminal:** Roubo (transeunte, celular, coletivo) — 2020-2024
**Gerado em:** 2026-05-24

---

## 0. Guia para Agentes de IA — LEIA PRIMEIRO

> Este documento é a referência principal para qualquer agente de IA ou sistema
> automatizado que acesse os dados deste projeto. Leia esta seção inteira antes de
> responder perguntas do usuário ou gerar qualquer análise.

### O que é este projeto

O **CompStat Municipal** é um modelo de gestão por resultados da Prefeitura do Rio de
Janeiro, inspirado no CompStat do NYPD. O objetivo é reduzir roubos em 8 micro-áreas
de alta incidência criminal (chamadas **áreas FM — Força Municipal**) através da
integração de dados criminais, urbanos e operacionais.

A Força Municipal é um grupo de ~600 agentes da Guarda Municipal especialmente
treinados que patrulham essas 8 áreas. Toda semana, os comandantes participam de uma
**reunião CompStat** onde são cobrados por resultados — e este sistema fornece os
dados para essa reunião.

### O que a plataforma faz

A plataforma é um mapa interativo que exibe as 8 áreas FM com camadas sobrepostas:
manchas de crime, fatores urbanos, câmeras, denúncias, e chamados de serviço. O
usuário (comandante FM, analista, gabinete do prefeito) pode clicar numa área e ver o
diagnóstico completo. A IA gera um plano de ação com órgãos responsáveis e prazos.

### Terminologia essencial

| Termo | Significado |
|-------|-------------|
| **Área FM** | Micro-polígono de patrulhamento da Força Municipal (ex: calçadão, estação, praça). São 8 áreas com cobertura completa. |
| **Bairro** | Divisão administrativa da cidade. Cada área FM fica dentro de 1-8 bairros. São 20 bairros no entorno das 8 áreas. |
| **AISP** | Área Integrada de Segurança Pública — divisão policial (Polícia Militar + Polícia Civil). |
| **OrCrim** | Organização Criminosa que domina o território (CV = Comando Vermelho, TCP = Terceiro Comando Puro, ADA = Amigos dos Amigos, Milícia). |
| **RELINT** | Relatório de Inteligência — documento classificado da inteligência policial descrevendo dinâmica criminal da área. |
| **BINGO** | Quando 3 camadas coincidem no mesmo trecho: crime + fator urbano + dinâmica criminal → prioridade máxima. |
| **QMD** | Quadro de Missões Diárias — escala de patrulhamento da FM (horários, postos, modalidade). |
| **Tipo de crime** | Este dataset cobre apenas ROUBO: transeunte (a pé), celular (aparelho), coletivo (ônibus/trem). Não inclui furto, homicídio, tráfico. |
| **Fator urbano** | Condição ambiental que facilita o crime: iluminação ruim, vegetação alta, calçada quebrada, lixo, etc. |
| **Chamado 1746** | Pedido de serviço público do cidadão à prefeitura (poste apagado, buraco, poda). NÃO é denúncia de crime. |
| **Disque Denúncia (DD)** | Denúncia ANÔNIMA de atividade CRIMINAL (tráfico, roubo, armas). NÃO é pedido de serviço. |
| **Spatial join** | Operação geoespacial: dado um ponto (lat/lon), descobrir em qual polígono FM ele cai. |

### As 6 fontes de dados — resumo rápido

| # | Fonte | O que mede | Volume | Confiabilidade | Papel no CompStat |
|---|-------|-----------|--------|----------------|-------------------|
| 1 | **Ocorrências (ISP-RJ)** | Crimes registrados | 115.354 | Alta (registro policial oficial) | ONDE o crime acontece |
| 2 | **Disque Denúncia (DD)** | Denúncias anônimas de CRIME | 18.003 | Média (anônimo, pode exagerar) | COMO o crime opera |
| 3 | **Fatores Urbanos (campo)** | Problemas ambientais observados | 2.085 | Alta (observação direta) | O QUE facilita o crime |
| 4 | **Chamados 1746** | Pedidos de SERVIÇO PÚBLICO | 902.822 | Alta (sistema administrativo oficial) | Valida fatores + mede resposta da prefeitura |
| 5 | **RELINTs** | Inteligência policial qualitativa | 8 | Alta (inteligência classificada) | Contexto criminal da área |
| 6 | **Câmeras CIVITAS** | Cobertura de videomonitoramento | 985 | Alta (inventário oficial) | Gaps de vigilância |

### REGRA FUNDAMENTAL — Disque Denúncia ≠ Chamados 1746

> **Estas são duas fontes COMPLETAMENTE diferentes. NUNCA confundir uma com a outra.**
> Se você confundir DD com 1746 em qualquer análise ou relatório, a análise estará
> ERRADA e poderá gerar ações incorretas (mandar polícia onde precisa de eletricista,
> ou mandar eletricista onde precisa de polícia).

| | **Disque Denúncia (DD)** | **Chamados 1746** |
|---|---|---|
| **O que é** | Denúncia **ANÔNIMA** sobre **CRIMES** | Central de **atendimento ao cidadão** para **SERVIÇOS PÚBLICOS** |
| **Quem liga** | Testemunha ou vítima de crime | Morador com problema de infraestrutura |
| **Assunto** | Tráfico, roubo, homicídio, armas, receptação | Poste apagado, buraco, entulho, poda, semáforo |
| **Exemplo de relato** | "Vi traficantes armados na esquina da Rua X às 22h" | "O poste da Rua Y está apagado há 3 semanas" |
| **Quem resolve** | Polícia (Civil/Militar) | Prefeitura (COMLURB, RioLuz, SECONSERVA...) |
| **Volume** | 18.003 denúncias | 902.822 chamados |
| **Período** | 2019-2026 | 2020-2024 |
| **Top tipo** | Consumo de drogas | Estacionamento irregular |
| **Arquivo** | `disque_denuncia.parquet` | `chamados_1746_fm.csv` |
| **Camada CompStat** | **Dinâmica Criminal** (Camada 3) | Valida **Fatores Urbanos** (Camada 2) |

**Na prática:**
- DD diz: "tem crime aqui, funciona assim" → ação **policial**
- 1746 diz: "o ambiente está degradado, ninguém conserta" → ação da **Prefeitura**
- Quando 1746 mostra poste apagado + DD mostra tráfico no mesmo trecho → o poste
  apagado FACILITA o tráfico (Teoria das Janelas Quebradas)

**Regras para geração de texto/relatório:**
- Ao mencionar DD, SEMPRE dizer "denúncia de crime" ou "denúncia criminal anônima"
- Ao mencionar 1746, SEMPRE dizer "chamado de serviço público" ou "demanda cidadã"
- NUNCA somar DD + 1746 — são grandezas incomparáveis
- NUNCA usar 1746 para descrever dinâmica criminal
- NUNCA usar DD para justificar ação de infraestrutura
- Usar 1746 para justificar URGÊNCIA de manutenção (ex: "2.000 chamados de poste apagado, 30% vencidos")
- Usar DD para justificar URGÊNCIA policial (ex: "38 denúncias de tráfico nesta rua")

### Como o agente de IA deve usar estes dados

1. **Usuário pergunta sobre crime na área** → usar `ocorrencias`, `top_trechos`, `stats`
2. **Usuário pergunta por que o crime acontece** → cruzar `fatores_urbanos` + `chamados_1746` + `relint`
3. **Usuário pergunta o que fazer** → usar `validacao_cruzada` + `fatores_por_orgao` para recomendar ações por órgão
4. **Usuário pergunta sobre tendência** → usar `evolucao_mensal` (crimes e 1746)
5. **Usuário pergunta sobre uma rua específica** → usar `top_trechos` + `logradouros_rio.geojson` como gazetteer
6. **Usuário pergunta sobre câmeras** → usar `cameras` + identificar blind spots
7. **Usuário pergunta sobre facção/domínio** → usar `dominio_territorial` + `relint`

---

## 1. As 8 áreas FM — Perfil Operacional

O CompStat Municipal opera em 22 áreas prioritárias. Este dataset cobre as **8 áreas
com cobertura completa** (polígono + RELINT + câmeras) mais 2 áreas parciais.

| # | Área FM | Bairros no entorno | Pop. 2022 | Crimes | Pico | OrCrim | Câmeras |
|---|---------|-------------------|-----------|--------|------|--------|---------|
| 1 | **Presidente Vargas – Santana – Central – Cinelândia** | Centro, Cidade Nova, Lapa | 37.503 | 4.011 | 20h | — | 230 |
| 2 | **Rodoviária – Gentileza – Leopoldina** | Centro, Caju, Santo Cristo, Cidade Nova, Estácio, +3 | 132.804 | 1.974 | 20h | TCP | 310 |
| 3 | **Estações SFX – Afonso Pena** | Maracanã, Tijuca, Praça da Bandeira, Rio Comprido | 212.929 | 1.507 | 20h | — | 60 |
| 4 | **Praia Botafogo – Marquês de Abrantes** | Botafogo, Flamengo, Laranjeiras | 159.809 | 1.138 | 21h | CV | 150 |
| 5 | **Metrô Botafogo – São Clemente** | Botafogo | 77.018 | 821 | 23h | — | 80 |
| 6 | **Rio Sul** | Botafogo, Copacabana, Urca | 211.152 | 457 | 20h | — | 0 |
| 7 | **Jardim de Alah** | Ipanema, Lagoa, Leblon | 93.777 | 298 | 20h | CV | 30 |
| 8 | **Campo Grande – Estação – Calçadão** | Campo Grande | 352.704 | 294 | 22h | Milícia | 45 |

**Total:** 10.500 ocorrências dentro dos 8 polígonos FM (9,1% das 115.354 ocorrências
cidade-wide). Os 20 bairros do entorno somam ~1,28M de habitantes.

### Por que pensar nos bairros do entorno

Os polígonos FM cobrem micro-regiões de alta circulação (calçadões, estações, eixos
comerciais). Mas a dinâmica criminal não para na borda do polígono:

- **Migração do crime (Desafio 2):** operação intensiva dentro do polígono empurra
  ocorrências para ruas adjacentes. Monitorar os bairros do entorno detecta esse
  deslocamento.
- **Rotas de fuga:** RELINTs descrevem evasão para comunidades próximas e vias de
  acesso. O domínio territorial (CV, TCP, Milícia) dos bairros vizinhos define para
  onde os autores fogem.
- **Fatores urbanos compartilhados:** um poste apagado na divisa do polígono afeta
  tanto dentro quanto fora. Chamados 1746 nos bairros vizinhos mostram o estado
  geral da infraestrutura.
- **População flutuante:** Presidente Vargas tem 37k residentes mas recebe 500k+
  pedestres/dia. A pop do Centro sub-representa a exposição real ao crime.

### Tipo de crime por área

Todas as 8 áreas são dominadas por **roubo a transeunte** (60-71%), exceto:

- **Rodoviária:** 34% roubo em coletivo — coerente com terminal rodoviário/ônibus
- **Metrô Botafogo:** pico às 23h (mais tardio que as demais — área de lazer noturno)
- **Campo Grande:** pico às 22h, dinâmica de milícia — contexto diferente das áreas
  da Zona Sul/Centro

---

## 2. Estrutura dos dados

```
data/
├── clean/              8 datasets oficiais do hackathon, limpos e normalizados
├── external/           Fontes públicas (bairros, censo, logradouros, ISP-RJ, 1746)
├── processed/          KPIs e resumos por área FM
├── artifacts/          Pacotes CompStat por área (10 áreas × 7 arquivos)
├── config/             Backbone de junção (area_registry.json)
└── README.md           Este arquivo
```

---

## 3. `clean/` — Dados oficiais do hackathon

Gerados por `src/clean.py`. Nenhum dado inventado. Linhas problemáticas sinalizadas
com flags (`_is_duplicate`, `_outside_rio`, `_has_coords`), nunca descartadas.

| Arquivo | Formato | Linhas | Descrição |
|---------|---------|--------|-----------|
| `ocorrencias.parquet` | Parquet | 115.354 | Roubos georreferenciados 2020-2024 (transeunte, celular, coletivo) |
| `disque_denuncia.parquet` | Parquet | 18.003 | Denúncias anônimas (modus operandi, rotas de fuga, receptação) |
| `fatores_urbanos.parquet` | Parquet | 2.085 | 20 fatores ambientais mapeados em campo (iluminação, vegetação, PSR...) |
| `cameras.parquet` | Parquet | 985 | Câmeras CIVITAS nas áreas FM |
| `cpsr.parquet` | Parquet | 23.332 | Censo de Pessoas em Situação de Rua (2020/22/24) |
| `dominio_territorial.geojson` | GeoJSON | 1.628 | Polígonos de domínio OrCrim (CV, TCP, ADA, Milícia) |
| `fm_areas.geojson` | GeoJSON | 8 | Polígonos das 8 áreas FM — **geometria de referência** |
| `relints.json` | JSON | 8 | RELINTs estruturados (RI_010–RI_017): dinâmica qualitativa por área |

### 3.1 ocorrencias.parquet — Registros policiais de roubo

- **Fonte:** ISP-RJ (Instituto de Segurança Pública do Estado do Rio de Janeiro)
- **Proveniência:** Registros de Ocorrência (RO) lavrados em delegacias, compilados pelo ISP
- **Período:** 2020-01-01 a 2024-12-31 (5 anos)
- **Escopo:** APENAS roubos — transeunte, celular, em coletivo. NÃO inclui furtos,
  homicídios, tráfico, lesão corporal ou qualquer outro tipo de crime.
- **Confiabilidade:** ★★★★☆ (Alta)
  - São registros oficiais com número de ocorrência
  - Georreferenciados com lat/lon em ~95% dos casos
  - Campos padronizados pelo ISP
- **Vieses conhecidos:**
  - **Subnotificação:** Estimativas indicam que apenas 30-50% dos roubos são registrados
    (vítima não faz BO). Áreas com delegacia mais acessível tendem a ter mais registros,
    não necessariamente mais crimes.
  - **Viés de celular:** Roubos de celular são mais registrados (vítima precisa do BO para
    seguro/bloqueio) do que roubos de pequenos valores. Isso infla a participação de
    "roubo de celular" nos dados.
  - **Viés noturno:** Crimes noturnos podem ser sub-registrados (vítima não vai à
    delegacia de madrugada, registra no dia seguinte com horário impreciso).
  - **Mudança de política:** Em 2022, o RJ permitiu BO online, o que pode ter aumentado
    registros sem aumento real de crimes (efeito administrativo, não criminal).
- **Limitações:**
  - Não contém informações sobre o autor do crime (apenas vítima + local + tipo)
  - Não indica se houve prisão ou resolução
  - A data é do registro (BO), não necessariamente do fato
  - Sem dados de furto — o mapa mostra apenas roubo (crime com violência/ameaça)
- **O que pode dizer:** Onde, quando e que tipo de roubo acontece com mais frequência
- **O que NÃO pode dizer:** Volume real de crime (subnotificação), motivação, autoria,
  se a área ficou mais ou menos segura de fato (vs mudança de registro)

### 3.2 disque_denuncia.parquet — Denúncias anônimas de crime

- **Fonte:** Disque Denúncia (Central de Atendimento 2253-1177 / app)
- **Proveniência:** Cidadãos ligam ou enviam mensagem anonimamente para denunciar crime
- **Período:** 2019-2026 (mais amplo que ocorrências)
- **Escopo:** Denúncias de atividade criminal — tráfico, roubo, receptação, armas,
  homicídio, consumo de drogas, ameaça
- **Confiabilidade:** ★★★☆☆ (Média)
  - Origem anônima — não é possível verificar cada denúncia individualmente
  - Muitas denúncias são precisas e geram operações policiais bem-sucedidas
  - Algumas podem ser exageradas, desatualizadas ou motivadas por conflito pessoal
  - O texto do relato tem alto valor qualitativo (modus operandi, nomes de rua, horários)
- **Vieses conhecidos:**
  - **Viés de medo:** Áreas com facção dominante geram MENOS denúncias (medo de
    retaliação), não mais. Portanto, POUCAS denúncias em área de facção podem significar
    medo, NÃO ausência de crime.
  - **Viés de classe:** Moradores de classe média/alta denunciam mais. Áreas periféricas
    podem ter crime similar mas menos denúncias.
  - **Duplicação temporal:** O mesmo ponto de tráfico pode gerar múltiplas denúncias ao
    longo de meses — isso reflete persistência do problema, não novos crimes.
  - **Viés de tipo:** 40%+ das denúncias são sobre drogas. Crimes contra o patrimônio
    são sub-representados (vítima faz BO, não liga pro DD).
- **Campos úteis:** `tipo`, `relato` (texto livre com detalhes operacionais), `latitude`,
  `longitude`, `data`
- **Limitações:**
  - Coordenadas disponíveis em apenas ~60% das denúncias
  - Texto do relato pode conter imprecisões geográficas
  - Não indica resultado (se houve operação policial, prisão, etc.)
- **O que pode dizer:** Como o crime opera no dia a dia, rotas de fuga, pontos de
  tráfico, receptação, modus operandi típico
- **O que NÃO pode dizer:** Volume real de crime (viés de denúncia), se o problema
  foi resolvido, identidade de autores (dados anonimizados)

### 3.3 fatores_urbanos.parquet — Observação de campo

- **Fonte:** Levantamento de campo da equipe da Força Municipal (Prefeitura do RJ)
- **Proveniência:** Agentes percorreram as 8 áreas FM a pé, registrando problemas
  ambientais em formulário padronizado com coordenadas GPS
- **Período:** 2026 (snapshot — uma única campanha de campo)
- **Escopo:** 20 tipos de fatores ambientais que podem facilitar o crime (iluminação
  deficiente, vegetação densa, calçada degradada, lixo, comércio irregular, PSR, etc.)
- **Confiabilidade:** ★★★★★ (Muito alta)
  - Observação direta e presencial por equipe treinada
  - Coordenadas GPS exatas
  - Cada ponto tem descrição textual e órgão responsável
- **Vieses conhecidos:**
  - **Snapshot temporal:** Dados coletados em um momento — a situação pode ter mudado.
    Poste consertado ontem ainda aparece como "iluminação deficiente" nos dados.
  - **Viés de rota:** A equipe seguiu a rota de patrulhamento da FM. Ruas fora da rota
    podem ter fatores não registrados. Isso NÃO significa que estão sem problemas.
  - **Viés de percepção:** Fatores subjetivos (ex: "vegetação densa") dependem do
    julgamento do agente. Outro agente poderia classificar diferente.
  - **Sem priorização inerente:** Um poste apagado e uma calçada com rachadura têm o
    mesmo peso no dado bruto. A gravidade é inferida pelo cruzamento com crimes.
- **O que pode dizer:** Quais problemas de infraestrutura existem AGORA nas áreas FM,
  com localização exata e órgão responsável
- **O que NÃO pode dizer:** Se o problema é novo ou antigo, se está piorando, se já
  foi comunicado à prefeitura (para isso serve o cruzamento com 1746)

### 3.4 cameras.parquet — Câmeras de videomonitoramento

- **Fonte:** COR (Centro de Operações Rio) — inventário CIVITAS
- **Proveniência:** Cadastro oficial de câmeras municipais de vigilância
- **Confiabilidade:** ★★★★☆ (Alta)
  - Inventário oficial, coordenadas verificadas
  - Pode estar desatualizado (câmeras adicionadas/removidas recentemente)
- **Limitações:**
  - Não indica se a câmera está FUNCIONANDO (algumas podem estar offline)
  - Não indica o ângulo/alcance de visão (cone de cobertura é estimado)
  - Não inclui câmeras privadas (lojas, condomínios, bancos)
- **O que pode dizer:** Onde há cobertura de câmera e onde há "blind spots"
- **O que NÃO pode dizer:** Qualidade da imagem, se é monitorada em tempo real,
  eficácia na prevenção de crimes

### 3.5 cpsr.parquet — Censo de Pessoas em Situação de Rua

- **Fonte:** Prefeitura do RJ (SMAS — Secretaria Municipal de Assistência Social)
- **Período:** Censos de 2020, 2022 e 2024 (3 edições)
- **Confiabilidade:** ★★★☆☆ (Média)
  - É um censo oficial, mas PSR é população de difícil contagem
  - Momento do censo (dia/noite, chuva, frio) afeta significativamente os números
  - Subestimação provável (pessoas em locais de difícil acesso não são contadas)
- **Sensibilidade:** Esta população requer abordagem humanitária, NÃO policial.
  O dado serve para orientar assistência social (SMAS), não repressão.
- **O que pode dizer:** Concentração aproximada de PSR por área, tendência entre censos
- **O que NÃO pode dizer:** Número exato atual (é snapshot), motivações, condições de
  saúde ou vulnerabilidade individual

### 3.6 dominio_territorial.geojson — Mapa de facções

- **Fonte:** Inteligência policial (dados classificados, fornecidos para o hackathon)
- **Confiabilidade:** ★★★☆☆ (Média — territórios mudam)
  - Reflete inteligência acumulada, mas fronteiras de facção são dinâmicas
  - Disputas territoriais podem alterar o mapa rapidamente
  - Algumas áreas podem ter dominância contestada ou compartilhada
- **Sensibilidade:** Este dado NÃO deve ser apresentado publicamente ou a cidadãos.
  É para uso interno de análise e planejamento operacional.
- **O que pode dizer:** Qual facção domina qual região, tipo de atuação esperada
- **O que NÃO pode dizer:** Nível de atividade atual, liderança, força da organização

### 3.7 relints.json — Relatórios de Inteligência

- **Fonte:** Setor de Inteligência (classificado)
- **Confiabilidade:** ★★★★☆ (Alta — produzido por analistas de inteligência)
- **Escopo:** 8 relatórios (RI_010 a RI_017), um por área FM, descrevendo dinâmica
  criminal, OrCrim dominante, rotas de fuga, modus operandi, alvos preferenciais
- **Limitações:**
  - Texto qualitativo — não há métricas padronizadas entre RELINTs
  - Reflete o conhecimento no momento da produção (pode defasar)
  - Nem todas as áreas têm o mesmo nível de detalhe
- **Sensibilidade:** Conteúdo classificado. NÃO reproduzir na íntegra para o público.
  Usar apenas para informar análise e recomendações operacionais.

### 3.8 fm_areas.geojson — Polígonos FM (geometria de referência)

- **Fonte:** Prefeitura do RJ — Gabinete de Segurança Pública
- **Confiabilidade:** ★★★★★ (Muito alta — geometria oficial de patrulhamento)
- **Este é o dado mais importante do dataset** — toda análise é feita DENTRO destes
  8 polígonos. Qualquer ponto (crime, fator, câmera) é associado a uma área FM via
  spatial join com estes polígonos.

### Como os datasets se cruzam (lógica "bingo" do briefing)

O briefing define que o valor está na **coincidência de camadas**:

```
CAMADA 1 — Mancha Criminal (ocorrências ISP-RJ)   →  ONDE o crime acontece
    ∩
CAMADA 2 — Fator Urbano (campo FM)                →  O QUE facilita o crime
    ∩         ↑ validado por Chamados 1746 (serviço público)
CAMADA 3 — Dinâmica Criminal (DD + RELINT)         →  COMO o crime opera
                                ↑ DD = denúncia de CRIME, não de infraestrutura

= BINGO → Ação prioritária com responsável + prazo
```

> **Atenção:** DD (Disque Denúncia) alimenta Camada 3 (crime). 1746 valida Camada 2
> (infraestrutura). São fontes DISTINTAS — ver seção detalhada abaixo.

Quando 2+ camadas se sobrepõem no mesmo trecho, a plataforma gera recomendação
automática com órgão responsável. O `artifacts/{area}/area.json` já contém
`n_bingo_cells` e `n_triple_bingo` por trecho.

### Fatores Urbanos vs Chamados 1746 — a diferença

São **duas perspectivas do mesmo problema**, e a plataforma cruza as duas:

| | **Fatores Urbanos** | **Chamados 1746** |
|---|---|---|
| **Fonte** | Levantamento de campo (equipe FM) | Central de Atendimento (cidadão) |
| **Volume** | 2.085 pontos | 902.822 registros |
| **Período** | Snapshot 2026 (uma visita) | Série 2020-2024 (5 anos contínuos) |
| **Natureza** | Diagnóstico qualitativo: "o que a equipe **viu**" | Demanda quantitativa: "o que a população **reclama**" |
| **Exemplo** | "Vegetação encobrindo iluminação pública" | "Reparo de luminária" / "Poste apagado" |
| **Granularidade** | Ponto exato com descrição | Logradouro + tipo + status atendimento |
| **Temporal** | Presente | Recorrência e tendência ao longo de 5 anos |

**Juntos** dizem: "a equipe observou o problema em campo (fator) E a população vem
reclamando dele há anos (1746), logo é crônico e validado".

### Validação cruzada (campo × 1746)

A plataforma normaliza os nomes de órgãos e cruza as duas fontes:

| Órgão | Fatores (campo) | Chamados (1746) | Validação |
|-------|-----------------|-----------------|-----------|
| **COMLURB** | 583 | ~28k | Campo observa vegetação/lixo → 1746 confirma demanda recorrente |
| **SMAS** | 341 | ~30k | Campo observa PSR/drogas → 1746 confirma pedidos de acolhimento |
| **SEOP** | 308 | ~7k | Campo observa comércio irregular → 1746 confirma ocupação irregular |
| **RioLuz** | 231 | ~118k | Campo observa iluminação → 1746 confirma milhares de chamados |
| **SECONSERVA** | 216 | ~72k | Campo observa calçada/via → 1746 confirma pavimentação/drenagem |
| **CET-Rio** | 191 | ~27k | Campo observa ponto de retenção → 1746 confirma semáforo/sinalização |
| **GM-Rio** | 84 | ~188k | Campo observa motos no passeio → 1746 confirma estacionamento irregular |

O pipeline gera `validacao_cruzada` por área FM: cada órgão mostra fatores de campo
+ chamados 1746 + % atendidos + vencidos. Na UI, isso aparece na aba "Dados" como
"Demandas por Órgão", com barras verdes (campo) e amber (1746) lado a lado.

Esses são os órgãos que aparecem no **Plano de Ação** do relatório CompStat e recebem
cobranças na reunião semanal.

### IMPORTANTE — DD ≠ 1746

> **Ver Seção 0 para a tabela comparativa completa e regras de uso.**
> Resumo: DD = denúncia anônima de CRIME (→ ação policial).
> 1746 = pedido de SERVIÇO PÚBLICO (→ ação da Prefeitura).
> NUNCA confundir. NUNCA somar. NUNCA usar um no lugar do outro.

---

## 4. `external/` — Fontes públicas de contexto

Dados de fontes públicas que enriquecem a análise principal. Todas em EPSG:4326 (WGS84).

| Arquivo | Fonte | Confiabilidade | Registros | Para que serve |
|---------|-------|----------------|-----------|---------------|
| `bairros_rio.geojson` | data.rio (Prefeitura) | ★★★★★ | 166 bairros | Malha administrativa oficial |
| `censo_2022_bairros.geojson` | IBGE Censo 2022 | ★★★★★ | 165 bairros | População por bairro → crime per capita |
| `logradouros_rio.geojson` | CadLog/Prefeitura | ★★★★☆ | 132.052 trechos | Gazetteer: nome de rua → geometria |
| `isp_rj_crimes_rio.csv` | ISP-RJ | ★★★★☆ | 11.320 rows | Série histórica 2003-2025 por CISP |
| `setores_censitarios_rio.geojson` | IBGE/geobr | ★★★★★ | 10.504 setores | Dados sociodemográficos sub-bairro |
| **`chamados_1746_fm.csv`** | BigQuery datario | ★★★★☆ | **902.822** | Chamados de serviço público (2020-2024) |
| `queries_1746.sql` | — | — | — | SQL de extração — documentação |

### 4.1 chamados_1746_fm.csv — detalhamento

- **Fonte:** `datario.adm_central_atendimento_1746.chamado` (BigQuery público)
- **Proveniência:** Sistema oficial de atendimento ao cidadão da Prefeitura do RJ.
  Cidadão liga para 1746, usa o app 1746 ou site, e registra uma solicitação de
  serviço público. O sistema gera ID, encaminha ao órgão responsável, e rastreia status.
- **Período:** 2020-01-01 a 2024-12-31
- **Escopo:** 902.822 chamados nos 20 bairros que intersectam as áreas FM
- **Confiabilidade:** ★★★★☆ (Alta)
  - Sistema administrativo oficial com rastreamento
  - Cada chamado tem ID, status, órgão, datas, tipo/subtipo padronizado
  - 79% têm coordenadas GPS (spatial join com FM possível)
  - Status de atendimento e prazo rastreados (atendido/vencido)
- **Vieses conhecidos:**
  - **Viés de acesso:** Bairros de classe média ligam mais para o 1746. Em áreas como
    Campo Grande (periferia), a demanda pode ser SUB-representada — o problema existe
    mas o cidadão não registra.
  - **Viés digital:** Depois de 2020, app/site aumentaram registros — parte do crescimento
    pode ser adesão digital, não piora real da infraestrutura.
  - **Estacionamento irregular:** É o tipo #1 com 188k chamados. Isso reflete mais a
    facilidade de registrar (basta citar a placa) do que gravidade urbanística.
  - **Status "Atendido":** Significa que o órgão FECHOU o chamado, não necessariamente
    que o problema foi RESOLVIDO de forma permanente. Reincidência é comum.
  - **Chamados duplicados:** Múltiplos cidadãos podem registrar o mesmo problema
    (mesmo poste apagado). Isso inflaciona contagens mas também indica relevância.
- **O que pode dizer:** Quais problemas de infraestrutura a população enfrenta, com que
  frequência, há quanto tempo, e se a prefeitura está respondendo
- **O que NÃO pode dizer:** Se o problema foi resolvido de fato (vs apenas fechado
  administrativamente), o impacto direto no crime (correlação ≠ causalidade)

### 4.2 censo_2022_bairros.geojson — por que usar per capita

Crime per capita é essencial para comparar áreas de forma justa. Presidente Vargas
tem 4.011 crimes e 37k residentes (107 crimes/1000 hab), enquanto Campo Grande tem
294 crimes e 352k residentes (0,8/1000 hab).

**Cuidado:** A população do censo é de RESIDENTES. Áreas comerciais como Centro e
Botafogo recebem diariamente centenas de milhares de pessoas que não moram ali. O
crime per capita residencial SUPERESTIMA o risco dessas áreas e SUBESTIMA o risco
em bairros residenciais puros. Quando possível, mencione que a população flutuante
é significativamente maior que a residente.

### 4.3 logradouros_rio.geojson — gazetteer

O gazetteer contém 132.052 trechos de 31.632 ruas do Rio de Janeiro. Serve para:

1. **Geoparsing de DD:** Converter "Rua Uruguaiana" no texto da denúncia para coordenadas
2. **Resolução de trechos:** Os `top_trechos` do CompStat são logradouros ranqueados
3. **NER de redes sociais:** Extrair menções de locais e ancorar a geometrias

**Limitação:** Nomes de rua podem ter variações (Av./Avenida, R./Rua, abreviações).
O matching deve ser fuzzy ou normalizado.

### Bairros → Áreas FM (mapeamento espacial)

Os 8 polígonos FM intersectam **20 bairros únicos**:

| Área FM | Bairros (códigos) |
|---------|-------------------|
| Presidente Vargas | Centro (005), Cidade Nova (008), Lapa (161) |
| Rodoviária | Caju (003), Centro (004/005), Cidade Nova (008), Estácio (009), Imp. São Cristóvão (010), Praça da Bandeira (007), Rio Comprido (032), Santo Cristo |
| Estações SFX | Maracanã (033), Tijuca (035), Praça da Bandeira (007), Rio Comprido (032) |
| Praia Botafogo | Botafogo (020), Flamengo (015), Laranjeiras (017) |
| Metrô Botafogo | Botafogo (020) |
| Rio Sul | Botafogo (020), Copacabana (022), Urca (024) |
| Jardim de Alah | Ipanema (025), Lagoa (026), Leblon (027) |
| Campo Grande | Campo Grande (144) |

### Crime per capita — por que importa

| Área | Crimes | Pop. bairros | Crimes/1000 hab |
|------|--------|-------------|-----------------|
| Presidente Vargas | 4.011 | 37.503 | **107,0** |
| Estações SFX | 1.507 | 212.929 | 7,1 |
| Rodoviária | 1.974 | 132.804 | 14,9 |
| Praia Botafogo | 1.138 | 159.809 | 7,1 |
| Metrô Botafogo | 821 | 77.018 | 10,7 |
| Rio Sul | 457 | 211.152 | 2,2 |
| Jardim de Alah | 298 | 93.777 | 3,2 |
| Campo Grande | 294 | 352.704 | 0,8 |

Presidente Vargas tem **107 crimes/1000 hab** — 130x mais que Campo Grande. Isso
reflete que o Centro é uma zona comercial com altíssimo fluxo de pedestres e poucos
residentes. O número bruto de crimes sem normalizar por população engana.

### Logradouros como gazetteer

O `logradouros_rio.geojson` (132k trechos, 31.632 ruas) serve para:

1. **Geoparsing de Disque Denúncia:** 78% das denúncias mencionam logradouro no texto
   mas muitas não têm lat/lon. O gazetteer ancora "Rua Uruguaiana" a geometria real.
2. **Desafio 1 (redes sociais):** NER extrai menções de locais → gazetteer resolve para
   coordenadas dentro de polígonos FM.
3. **Trechos críticos:** os `top_trechos` no CompStat são logradouros ranqueados — o
   gazetteer dá a geometria exata de cada trecho.

---

## 5. `artifacts/` — Pacotes CompStat por área

10 áreas × 7 arquivos, prontos para alimentar o relatório analítico.

```
artifacts/{area_id}/
├── area.json           Relatório mestre (KPIs, trechos críticos, bingo, scoring)
├── temporal.json       Matriz hora × dia-da-semana (para heatmap)
├── factors.json        Fatores urbanos agrupados por órgão responsável
├── cameras.json        Posições de câmeras + gaps identificados
├── signals.json        RELINT completo + snippets Disque Denúncia
├── polygon.geojson     Polígono da área
└── segments.geojson    Trechos críticos (hexágonos H3)
```

As 10 áreas: `presidente_vargas`, `rodoviaria_gentileza`, `estacoes_sfx_afonso_pena`,
`praia_botafogo`, `metro_botafogo`, `campo_grande_calcadao`, `jardim_de_alah`,
`rio_sul`, `lauro_muller` (referência), `bangu_calcadao` (exemplo).

### Relação com o relatório CompStat (briefing seção 6.1)

| Seção do relatório | Fonte nos artifacts |
|--------------------|--------------------|
| 1. Identificação da Área | `area.json` → `identificacao`, `display_name` |
| 1.1 Indicadores do Período | `area.json` → `indicadores`, `trechos` |
| 1.2 Distribuição por Tipo | `area.json` → `indicadores.distribuicao_tipo` |
| 1.3 Análise Temporal | `temporal.json` → matriz hora×dia, pico |
| 2. Dinâmica Criminal | `signals.json` → `relint_text`, `disque_snippets` |
| 3. Efetivo FM | Gerado pelo módulo de alocação (600 agentes) |
| 4. Fatores de Incidência | `factors.json` → fatores por órgão |
| 4.1 Câmeras | `cameras.json` → posições + blind spots |
| 5. Plano de Ação | Gerado por IA (Claude) com base nos bingos |

---

## 6. `config/area_registry.json` — Backbone de junção

As áreas FM têm nomes diferentes no shapefile, CSV de câmeras e RELINTs. O registry
reconcilia tudo via `area_id` estável:

```python
import json
with open("data/config/area_registry.json") as f:
    registry = json.load(f)

for area in registry["areas"]:
    print(area["area_id"], "→", area["display_name"])
    # area["shapefile_name"], area["camera_name"], area["relint_file"]
```

---

## 7. Central 1746 — Integração com BigQuery

### O que é e por que importa

A Central 1746 é o canal oficial de demandas da Prefeitura (poste apagado, poda,
lixo, calçada, PSR...). O BigQuery `datario.adm_central_atendimento_1746.chamado`
tem dados desde 2010. É a **camada de validação dos fatores urbanos**: quando o
levantamento de campo registra "iluminação deficiente" e o 1746 tem 15 chamados
de "poste apagado" no mesmo trecho, a coincidência é objetiva.

Janela temporal alinhada com `ocorrencias.parquet`: **2020-01-01 a 2024-12-31**.

### Arquivos extraídos (BigQuery → `data/external/`)

| Arquivo | Origem | Rows | Período | Bairros | Status |
|---------|--------|------|---------|---------|--------|
| **`chamados_1746_fm.csv`** | Query 2 (extração final) | **902.822** | 2020-2024 | **20/20 bairros** | **Pronto** |
| `query2new_results.csv` | Query 2 (extração original) | 902.822 | 2020-2024 | 20/20 | Cópia de segurança |
| `querry1_result_bigQuerry.json` | Query 1 (descoberta) | ~688 combos | 2023+ | parcial | Referência de tipos |
| `query2_result.csv` | Query 2 (extração antiga) | 268.760 | 2020-2024 | 2/20 | Obsoleto (bug id_bairro) |
| `query3_results.csv` | Query 4 (hotspots) | 12.990 | 2020-2024 | 2/20 | Obsoleto (bug id_bairro) |

**Bug id_bairro (resolvido):** queries iniciais usavam IDs com zeros à esquerda
(`'003'`,`'004'`...) mas o BigQuery armazena sem padding (`'3'`,`'4'`...).
`chamados_1746_fm.csv` foi extraído com IDs corrigidos e contém todos os 20 bairros.

### Schema: `query2_result.csv` (extração individual)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_chamado` | int | Identificador único do chamado |
| `data_inicio` | datetime | Abertura do chamado |
| `data_fim` | datetime | Encerramento (null se aberto) |
| `id_bairro` | string | Código do bairro (sem leading zeros) |
| `id_logradouro` | int | Código do logradouro |
| `numero_logradouro` | int | Número no logradouro |
| `nome_unidade_organizacional` | string | Órgão responsável (ex.: COMLURB, RIOLUZ) |
| `tipo` | string | Categoria principal (capitalização exata) |
| `subtipo` | string | Detalhe do tipo |
| `status` | string | Status administrativo |
| `tipo_situacao` | string | Atendido / Não atendido / Andamento / Não constatado |
| `dentro_prazo` | string | A Vencer / Vencido / Em Vencimento / Não Calculado |
| `latitude` | float | Coordenada (66.6% preenchido) |
| `longitude` | float | Coordenada |
| `reclamacoes` | int | Quantidade de reclamações associadas |
| `data_particao` | date | Data de partição (YYYY-MM-DD) |

### Schema: `query3_results.csv` (hotspots por logradouro)

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id_bairro` | string | Código do bairro |
| `id_logradouro` | int | Código do logradouro |
| `tipo` | string | Categoria do chamado |
| `subtipo` | string | Detalhe |
| `orgao` | string | Órgão responsável |
| `total_chamados` | int | Total de chamados no logradouro (>=3) |
| `atendidos` | int | Chamados com status "Atendido" |
| `lat_media` | float | Centroide lat (100% preenchido) |
| `lon_media` | float | Centroide lon |
| `primeiro_chamado` | date | Primeira ocorrência |
| `ultimo_chamado` | date | Última ocorrência |
| `total_reclamacoes` | int | Soma de reclamações |

### Cobertura por tipo (extração final — 20 bairros FM, 2020-2024)

| Tipo 1746 | Chamados | Órgão CompStat | Fator urbano |
|-----------|----------|----------------|--------------|
| Estacionamento irregular | 188.074 | GM-Rio / SEOP | Desordem urbana |
| Remoção Gratuita | 133.066 | COMLURB | Lixo/entulho |
| Iluminação Pública | 118.373 | RioLuz | Iluminação deficiente |
| Pavimentação | 70.599 | SECONSERVA | Calçada/via degradada |
| Drenagem e Saneamento | 50.725 | SECONSERVA | Infraestrutura precária |
| Limpeza de logradouros | 50.363 | COMLURB | Lixo acumulado |
| Manejo Arbóreo | 45.469 | COMLURB | Vegetação densa |
| Perturbação do sossego | 43.313 | GM-Rio | Desordem / ambiente criminogênico |
| Ônibus | 36.327 | SMTR | Transporte público |
| Atendimento Social | 29.661 | SMAS | População em situação de rua |
| Semáforo | 26.755 | CET-Rio | Sinalização deficiente |
| Comércio ambulante | 15.108 | SEOP | Comércio irregular |
| Controle de roedores | 14.720 | COMLURB | Saneamento / degradação |

### Estatísticas de qualidade (extração final — 902.822 rows)

- **Bairros**: 20/20 FM bairros cobertos (IDs corrigidos)
- **Coordenadas**: 713.572 / 902.822 (79,0%) têm lat/lon → spatial join com FM possível
- **Atendimento**: 57,8% atendidos, 10,4% não atendidos, 15,5% parcialmente
- **Prazo**: 64,4% no prazo (A Vencer), 24,1% vencidos
- **Órgãos**: 91 unidades organizacionais; top 4 = COMLURB, RIOLUZ, 21aGC, GM-RIO
- **Bairros com mais chamados**: Campo Grande (261k), Maracanã (121k), Copacabana (101k), Centro (78k), Botafogo (68k)

### Custo BigQuery

A tabela é particionada por `data_particao` (~$5/TB escaneado). Filtros de
`id_bairro` e `tipo` **não reduzem scan** (tabela não clusterizada por essas colunas).
O custo depende apenas da janela de partições × número de colunas selecionadas.

Estratégia:
1. **Rodar Query 0** (1 partição) para confirmar formato de `id_bairro` — custo ~0
2. **Dry-run Query 2** antes de executar — `bq query --dry_run`
3. **Não rodar Queries 3/4 no BQ** — derivar localmente do CSV via pandas
4. Ver `external/queries_1746.sql` para SQL completo e notas de custo

### Como usar na plataforma

```python
import pandas as pd
import geopandas as gpd

# 1. Carregar extração 1746 e polígonos FM
chamados = pd.read_csv("data/external/query2_result.csv", parse_dates=["data_inicio", "data_fim", "data_particao"])
fm = gpd.read_file("data/clean/fm_areas.geojson")

# 2. Spatial join — chamados com coordenadas → polígono FM
gdf = gpd.GeoDataFrame(
    chamados.dropna(subset=["latitude", "longitude"]),
    geometry=gpd.points_from_xy(chamados.longitude, chamados.latitude),
    crs="EPSG:4326"
)
chamados_fm = gpd.sjoin(gdf, fm, how="inner", predicate="within")

# 3. Mapeamento tipo→fator CompStat
TIPO_FATOR = {
    "Iluminação Pública": "iluminacao_deficiente",
    "Manejo Arbóreo": "vegetacao_densa",
    "Remoção Gratuita": "lixo_entulho",
    "Limpeza de logradouros": "lixo_acumulado",
    "Pavimentação": "via_degradada",
    "Calçadas": "calcada_degradada",
    "Drenagem e Saneamento": "infraestrutura_precaria",
    "Comércio ambulante": "comercio_irregular",
    "Estacionamento irregular": "desordem_urbana",
    "Perturbação do sossego": "desordem_urbana",
    "Atendimento Social": "populacao_rua",
    "Semáforo": "sinalizacao_deficiente",
}
chamados_fm["fator_compstat"] = chamados_fm["tipo"].map(TIPO_FATOR)

# 4. Série temporal (substitui Query 3 — sem custo BQ)
serie_mensal = (chamados_fm
    .assign(mes=chamados_fm.data_particao.dt.to_period("M"))
    .groupby(["mes", "id_bairro", "tipo"])
    .agg(chamados=("id_chamado", "count"),
         atendidos=("tipo_situacao", lambda x: (x == "Atendido").sum()),
         com_coords=("latitude", "count"))
    .reset_index())

# 5. Hotspots por logradouro (substitui Query 4 — sem custo BQ)
hotspots = (chamados_fm
    .groupby(["id_bairro", "id_logradouro", "tipo", "subtipo"])
    .agg(total=("id_chamado", "count"),
         lat_media=("latitude", "mean"),
         lon_media=("longitude", "mean"),
         primeiro=("data_particao", "min"),
         ultimo=("data_particao", "max"))
    .query("total >= 3")
    .sort_values("total", ascending=False)
    .reset_index())
```

### Integração com a plataforma (eduardo/backend)

O `data_pipeline.py` já espera os dados do 1746. Fluxo:

1. **Arquivo esperado:** `data/external/chamados_1746_fm.csv` — renomear `query2_result.csv` após re-extração com IDs corrigidos
2. **Loader:** `load_chamados_1746()` (linha 311) faz `pd.read_csv(..., parse_dates=["data_inicio", "data_fim"])`
3. **Spatial join:** pontos com lat/lon são cruzados com os 8 polígonos FM
4. **Enriquecimento por área:** para cada área FM, agrega chamados por `tipo` × `nome_unidade_organizacional`, conta `tipo_situacao == "Atendido"`
5. **Output JSON:** campo `chamados_1746` no `area.json` de cada área com `total` e `por_tipo` (top 20)

Colunas utilizadas pelo pipeline: `latitude`, `longitude`, `tipo`, `nome_unidade_organizacional`, `tipo_situacao`, `data_inicio`, `data_fim`. Todas presentes em `query2_result.csv`.

### Status: PRONTO

Extração concluída com 902.822 chamados em 20 bairros FM. Para rodar:

```bash
cd eduardo/backend
python data_pipeline.py --data-dir ../../data
```

O pipeline automaticamente:
1. Carrega `chamados_1746_fm.csv`
2. Faz spatial join com os 8 polígonos FM
3. Agrega por tipo × órgão com taxa de atendimento e prazo
4. Gera evolução mensal de chamados por área
5. Exporta pontos para camada no mapa
6. Inclui `chamados_1746` no JSON de cada área (consumido pelo frontend)

---

## 8. Mapa de integração completo

```
                    ┌─────────────────────────────┐
                    │     fm_areas.geojson         │  8 polígonos FM
                    │     (clean/)                 │  chave: nome_subar
                    └──────────┬──────────────────┘
                               │ spatial join
          ┌────────────────────┼─────────────────────┐
          │                    │                      │
┌─────────▼──────────┐ ┌──────▼───────────┐ ┌────────▼──────────┐
│ ocorrencias        │ │ fatores_urbanos  │ │ disque_denuncia   │
│ 115k crimes        │ │ 2.085 fatores    │ │ 18k denúncias     │
│ lat/lon → sjoin    │ │ lat/lon + orgão  │ │ modus, relato     │
│ → 10.5k dentro FM  │ │ → 834 dentro FM  │ │ → 772 dentro FM   │
└────────────────────┘ └──────────────────┘ └───────────────────┘
          │                    │                      │
          └────────────────────┼──────────────────────┘
                               │ BINGO: coincidência de camadas
                               ▼
                    ┌──────────────────────┐
                    │ artifacts/{area}/    │
                    │ area.json + temporal │
                    │ + factors + signals  │
                    │ + cameras + segments │
                    │ → RELATÓRIO COMPSTAT │
                    └──────────────────────┘

          ┌─────────────────────────────────────────┐
          │           CONTEXTO EXTERNO               │
          │                                         │
          │  bairros_rio.geojson    → malha bairros │
          │  censo_2022             → pop per capita │
          │  logradouros_rio        → gazetteer NER  │
          │  isp_rj_crimes          → validação ISP  │
          │  chamados_1746          → valida fatores │
          │  setores_censitarios    → sub-bairro     │
          └─────────────────────────────────────────┘
```

---

## 9. Quick start

```python
import pandas as pd
import geopandas as gpd
import json

# Áreas FM (geometria oficial)
fm = gpd.read_file("data/clean/fm_areas.geojson")

# Crimes dentro de cada área FM
occ = pd.read_parquet("data/clean/ocorrencias.parquet")
occ_fm = pd.read_csv("data/processed/ocorrencias_com_area_fm.csv")

# Bairros + população (crime per capita)
bairros = gpd.read_file("data/external/bairros_rio.geojson")
censo = gpd.read_file("data/external/censo_2022_bairros.geojson")

# Gazetteer de logradouros
logr = gpd.read_file("data/external/logradouros_rio.geojson")

# Pacote CompStat de uma área
with open("data/config/area_registry.json") as f:
    registry = json.load(f)
with open("data/artifacts/presidente_vargas/area.json") as f:
    area_report = json.load(f)
```

---

## 10. O que esses dados alimentam

### Relatório Analítico de Área (output principal)

Estrutura definida no briefing (seção 6.1):

1. **Identificação da Área** — AISP, bairro, DP, BPM, subprefeitura, base FM, OrCrim
2. **Indicadores do Período** — total de roubos, ranking, evolução mensal
3. **Distribuição por Tipo** — roubo transeunte vs celular vs coletivo
4. **Análise Temporal** — heatmap hora×dia, pico, período predominante
5. **Dinâmica Criminal** — síntese IA de DD + RELINT (modus, fuga, receptação)
6. **Efetivo FM** — agentes/turno, cobertura, modalidade (pé/moto/viatura)
7. **Fatores de Incidência** — por órgão responsável, com ação requerida
8. **Painel de Coincidências** — bingos automáticos
9. **Plano de Ação** — pré-populado por IA, formalizado na reunião CompStat

### 4 perguntas norteadoras (resumo executivo lido pelo Prefeito)

1. Locais de maior incidência coincidem com a rota da FM?
2. Horário de maior incidência coincide com o QMD da FM?
3. Dinâmica criminal coincide com o modelo de emprego da FM?
4. Fatores relevantes estão sendo resolvidos pelos órgãos?

### 4 desafios extras

1. **Inteligência de redes sociais** → logradouros.geojson como gazetteer
2. **Migração do crime** → bairros do entorno + série temporal
3. **Permanência operacional 90 dias** → tendência mensal por área
4. **Otimização de câmeras** → `cameras.json` gaps + ocorrências sem cobertura

---

## 11. Guia de Interpretação para IA — Vieses, Limitações e Armadilhas

> Esta seção é crítica para evitar conclusões erradas. Toda análise gerada por IA
> DEVE considerar estes pontos.

### 11.1 Correlação ≠ Causalidade

- "Área com mais postes apagados tem mais roubos" NÃO significa que consertar postes
  reduz roubos. A correlação é indicativa, não comprovada.
- Usar linguagem como "está associado a", "coincide com", "pode contribuir para" —
  NUNCA "causa", "provoca", "gera".
- A única afirmação causal válida é: "a coincidência de camadas (BINGO) indica
  prioridade para intervenção" — é uma recomendação operacional, não prova científica.

### 11.2 Subnotificação criminal

- Apenas 30-50% dos roubos são registrados em BO. Os dados mostram o crime
  REGISTRADO, não o crime REAL.
- Áreas com delegacia acessível ou maior cultura de registro terão MAIS ocorrências
  nos dados, sem necessariamente ter mais crime.
- Uma queda de ocorrências pode significar: (a) menos crime, (b) menos registros,
  (c) mudança de tipo penal (reclassificação), (d) aumento de BO online. Sempre
  mencionar essas possibilidades ao analisar tendências.

### 11.3 Viés de população flutuante

- O Centro do Rio tem 37k residentes mas 500k+ pedestres/dia. O crime per capita
  baseado em residentes é ENGANOSO para zonas comerciais/turísticas.
- Para áreas 1 (Presidente Vargas), 2 (Rodoviária), 4 (Praia Botafogo) e 5
  (Metrô Botafogo), o denominador "por 1000 habitantes" deve ser contextualizado
  como "por 1000 RESIDENTES — fluxo diário real é muito maior".

### 11.4 Viés temporal

- **Ocorrências:** 2020-2024 inclui a pandemia (2020-2021). O crime caiu durante
  lockdown e subiu depois. Comparações que incluem 2020 devem notar isso.
- **Fatores urbanos:** São um snapshot de 2026. A situação pode ter mudado desde a
  coleta. Um poste pode ter sido consertado, uma calçada pode ter sido reformada.
- **1746:** Série contínua 2020-2024, mas o volume cresceu com adesão digital pós-2020.
  Parte do aumento de chamados é mais gente usando o app, não piora real.
- **DD:** Período 2019-2026, mais amplo. Cuidado ao comparar volumes entre fontes
  com períodos diferentes.

### 11.5 Viés geográfico

- Dados cobrem APENAS os 20 bairros em torno das 8 áreas FM. Isso é ~15% da cidade.
  NÃO generalizar conclusões para todo o Rio de Janeiro.
- As 8 áreas FM são micro-polígonos dentro desses bairros. Crimes FORA do polígono
  mas dentro do bairro aparecem nos dados de bairro, mas NÃO nos dados de área FM.
- Áreas com mais câmeras podem ter mais detecção, gerando mais registros. Isso não
  significa que são mais perigosas.

### 11.6 Viés de denúncia (DD)

- Bairros de classe média denunciam mais. Poucas denúncias em área periférica podem
  significar medo, não ausência de crime.
- 40%+ das denúncias são sobre drogas, que é o crime mais visível. Crimes mais
  sofisticados (receptação, estelionato) são sub-representados.

### 11.7 Cuidados éticos

- **PSR (População em Situação de Rua):** Tratar com dignidade. O dado serve para
  ASSISTÊNCIA SOCIAL, não para criminalização. Se o usuário perguntar "como
  remover moradores de rua", a resposta deve orientar para acolhimento (SMAS),
  não para ação policial.
- **Domínio territorial:** Informação classificada de inteligência. Não expor ao
  público. Usar apenas para contextualizar operacionalmente.
- **RELINTs:** Conteúdo classificado. Citar conclusões, não reproduzir na íntegra.
- **Endereços de vítimas:** Dados de ocorrência não devem ser usados para
  identificar vítimas específicas.

### 11.8 O que os dados NÃO cobrem

| O que falta | Impacto | Alternativa |
|-------------|---------|-------------|
| Furtos (sem violência) | Muitas áreas comerciais têm mais furto que roubo — não aparece nos dados | Nenhum dado disponível |
| Crimes violentos (homicídio, estupro) | O mapa mostra APENAS roubo — áreas "seguras" no mapa podem ter outros crimes graves | ISP-RJ tem série por CISP (parcial) |
| Trânsito e acidentes | Não há dados de sinistros de trânsito | Dados da CET-Rio (não integrados) |
| Percepção de segurança | O medo do cidadão pode ser maior/menor que o crime real | Pesquisas de vitimização (não disponíveis) |
| Efetivo policial real | Não sabemos quantos policiais/guardas estão de fato na rua a cada turno | Dados da GM-Rio (não integrados) |
| Iluminância real (lux) | "Poste apagado" é binário — não mede intensidade luminosa real | Medição in loco (não disponível) |
| Prisões e resultados | Não sabemos se os crimes geraram inquérito, prisão ou condenação | Dados do TJRJ (não disponíveis) |

---

## 12. Perguntas que o agente de IA pode responder (com os dados disponíveis)

### Perguntas que PODE responder com confiança

| Pergunta do usuário | Dados a usar | Confiança |
|---------------------|-------------|-----------|
| "Qual a área mais perigosa?" | `stats.crimes_total` + `crimes_por_tipo` | Alta (com ressalva de subnotificação) |
| "Qual o horário mais perigoso na área X?" | `stats.pico_horario` + `hora_distribution` | Alta |
| "Que tipo de roubo mais acontece?" | `stats.crimes_por_tipo` | Alta |
| "O crime está aumentando ou diminuindo?" | `evolucao_mensal` (ocorrências) | Média (considerar efeito pandemia e BO online) |
| "Quais ruas são mais perigosas?" | `top_trechos` (por área FM) | Alta |
| "Que problemas de infraestrutura a área tem?" | `fatores_por_orgao` + `chamados_1746` | Alta (cruzamento de duas fontes) |
| "A prefeitura está resolvendo os problemas?" | `chamados_1746.pct_atendido` + `pct_vencido` | Alta (sistema administrativo oficial) |
| "Quais órgãos precisam agir?" | `validacao_cruzada` | Alta (campo + cidadão concordam) |
| "Tem câmera nesta área?" | `cameras` | Alta (mas pode estar desatualizado) |
| "Qual facção atua aqui?" | `dominio_territorial` + `relint` | Média (territórios mudam) |
| "Por que o crime acontece nesta rua?" | `relint` + `fatores` + `DD relatos` | Média (análise qualitativa) |
| "Quantos chamados de poste apagado tem na área X?" | `chamados_1746.por_tipo` | Alta |

### Perguntas que NÃO pode responder (ou deve responder com ressalvas)

| Pergunta do usuário | Por que não pode | O que dizer |
|---------------------|------------------|-------------|
| "A área X é segura?" | Subnotificação + crime fora do polígono + outros tipos de crime | "Os dados mostram X roubos registrados, mas nem todo crime é registrado. Esta análise cobre apenas roubos." |
| "Consertar postes vai reduzir crime?" | Correlação ≠ causalidade | "Áreas com iluminação deficiente têm mais ocorrências noturnas, mas não podemos afirmar causalidade direta." |
| "Quantos crimes acontecem de verdade?" | Subnotificação | "Os dados mostram X roubos registrados. Estimativas indicam que apenas 30-50% dos roubos são reportados." |
| "Quem são os criminosos?" | Dados não identificam autores | "Os dados não contêm informações sobre autoria. O RELINT descreve modus operandi e dinâmica." |
| "Esta área melhorou depois da operação?" | Sem dados pós-intervenção controlados | "Seria necessário análise temporal específica pré/pós-intervenção com grupo de controle." |
| "Qual o melhor lugar para morar?" | Fora do escopo + viés de tipo de crime | "Esta análise foca em áreas de patrulhamento FM e cobre apenas roubo. Não é adequada para avaliar qualidade de vida." |

---

## 13. Contexto geográfico do Rio de Janeiro (para IA sem conhecimento local)

### Geografia básica

O Rio de Janeiro é dividido em 5 grandes zonas:
- **Zona Sul:** Bairros nobres costeiros (Copacabana, Ipanema, Botafogo, Leblon).
  Alto fluxo turístico. Crime predominante: roubo a transeunte.
- **Centro:** Zona comercial/financeira. Poucos residentes, altíssimo fluxo diário.
  Crime concentrado em horário comercial e no entorno de estações.
- **Zona Norte:** Bairros residenciais de classe média/popular (Tijuca, Maracanã).
  Presença de comunidades (favelas) com dinâmica de facção.
- **Zona Oeste:** Bairros periféricos extensos (Campo Grande, Bangu).
  Menor densidade, dinâmica de milícia. Delegacias mais distantes → mais subnotificação.
- **Barra da Tijuca / Jacarepaguá:** Zona de expansão. Não coberta neste dataset.

### As 8 áreas FM e seu contexto

| Área FM | Zona | Contexto |
|---------|------|----------|
| Presidente Vargas | Centro | Avenida principal do Centro, estações de metrô/trem, comércio popular. 500k+ pedestres/dia. |
| Rodoviária | Centro/Norte | Terminal rodoviário, entorno degradado, PSR, rota de fuga para Caju/Santo Cristo. |
| Estações SFX | Norte | Corredor de estações de trem São Francisco Xavier. Classe média, alta circulação. |
| Praia Botafogo | Zona Sul | Eixo Botafogo-Flamengo, comércio, hospitais. Crime 60%+ a transeunte. |
| Metrô Botafogo | Zona Sul | Entorno da estação de metrô, vida noturna. Pico mais tardio (23h). |
| Rio Sul | Zona Sul | Shopping Rio Sul e entorno, Copacabana. Zona turística. |
| Jardim de Alah | Zona Sul | Ipanema/Leblon/Lagoa. Bairros nobres, turismo, baixo crime absoluto. |
| Campo Grande | Zona Oeste | Calçadão comercial de Campo Grande. Contexto periférico, milícia. Muito diferente das demais. |

### Órgãos da Prefeitura responsáveis

| Órgão | Sigla | Responsabilidade |
|-------|-------|------------------|
| Companhia Municipal de Limpeza Urbana | COMLURB | Lixo, poda, vegetação, roedores |
| Companhia Municipal de Energia e Iluminação | RioLuz | Postes, iluminação pública |
| Secretaria de Conservação | SECONSERVA | Calçadas, vias, drenagem, saneamento |
| Secretaria de Ordem Pública | SEOP | Comércio irregular, ordenamento urbano |
| Companhia de Engenharia de Tráfego | CET-Rio | Semáforos, sinalização, trânsito |
| Secretaria de Assistência Social | SMAS | Acolhimento PSR, assistência social |
| Guarda Municipal | GM-Rio | Patrulhamento, estacionamento irregular, desordem |
| Secretaria de Transportes | SMTR | Ônibus, transporte público |

Estes são os órgãos COBRADOS na reunião CompStat. Cada ação do plano tem um órgão
responsável e um prazo. A plataforma envia automaticamente as ações por email.

---

## 14. Fontes e licenças

| Fonte | Tipo | URL |
|-------|------|-----|
| Hackathon CompStat | Dados oficiais | github.com/CompStat-Rio/claude_impact_lab_compstat_rio |
| data.rio (Prefeitura) | Dados abertos | pgeo3.rio.rj.gov.br/arcgis/rest/services |
| BigQuery datario (1746) | Dados abertos | console.cloud.google.com/bigquery → datario |
| ISP-RJ | Dados abertos | ispdados.rj.gov.br |
| IBGE/geobr | MIT | github.com/ipeaGIT/geobr |
| Censo 2022 | Dados abertos | data.rio via ArcGIS |
