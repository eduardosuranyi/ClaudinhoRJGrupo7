# Referência de API — CompStat Municipal RJ

Documentação das rotas de API do frontend Next.js (`eduardo/frontend/app/api/`). Ambas são endpoints **POST** executados server-side via App Router do Next.js 16.

Estas rotas implementam os requisitos das seções 7 (Papel da IA) e 10.4 (Módulo de geração de relatório) do [briefing técnico](../../claude_impact_lab_compstat_rio/Briefing_Hackathon_Desenvolvedores_CompStat-2.pdf).

**Base URL (desenvolvimento):** `http://localhost:3000`

---

## Fluxo Operacional

As rotas fazem parte do fluxo de geração de relatório que substitui horas de trabalho manual:

```
┌───────────────────────┐     ┌───────────────────┐     ┌──────────────────┐
│ 1. Seleção de área    │────→│ 2. POST           │────→│ 3. Exibição      │
│    no dashboard       │     │    /api/synthesize │     │    plano de ação │
│                       │     │    (Claude AI)     │     │    + Despachar   │
└───────────────────────┘     └───────────────────┘     └────────┬─────────┘
                                                                 │
                                                        ┌────────┴─────────┐
                                                        │ 4. POST          │
                                                        │    /api/report   │
                                                        │    (Python .docx)│
                                                        └────────┬─────────┘
                                                                 │
                                                        ┌────────┴─────────┐
                                                        │ 5. Download      │
                                                        │    .docx para    │
                                                        │    reunião       │
                                                        └──────────────────┘
```

---

## POST `/api/synthesize`

### Propósito

Gera um **plano de ação executivo** via Claude Sonnet 4.5, sintetizando a dinâmica criminal e produzindo ações priorizadas por órgão. Implementa as três funções da IA definidas no briefing:

1. **Síntese qualitativa** da dinâmica criminal (seção 7.1)
2. **Cruzamento e identificação** de coincidências com priorização (seção 7.2)
3. **Respostas às perguntas norteadoras** com sugestões operacionais (seção 7.3)

### Autenticação e Dependências

| Requisito | Detalhe |
|---|---|
| Variável de ambiente | `ANTHROPIC_API_KEY` em `frontend/.env.local` |
| Modelo | `claude-sonnet-4-5` |
| SDK | `@anthropic-ai/sdk` |
| `max_tokens` | 1500 |

### Request

**Content-Type:** `application/json`

```json
{
  "nome": "string",
  "relint": "string",
  "stats": { "...": "objeto AreaStats" },
  "top_trechos": [ "...array Trecho..." ],
  "fatores": [ "...array FatorOrgao..." ],
  "relatos": [ "...array Relato..." ]
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `nome` | `string` | Sim | Nome completo da área FM |
| `relint` | `string` | Nao | Texto do RELINT (`relint.full_text`); truncado em 3.000 chars no prompt |
| `stats` | `AreaStats` | Sim | Estatísticas agregadas (crimes, denúncias, modus, etc.) |
| `top_trechos` | `Trecho[]` | Sim | Trechos prioritários (frontend envia top 5) |
| `fatores` | `FatorOrgao[]` | Sim | Fatores urbanos agrupados por órgão responsável |
| `relatos` | `Relato[]` | Nao | Amostra de relatos do Disque Denúncia (frontend envia top 5) |

### Response (200 OK)

**Content-Type:** `application/json`

```json
{
  "dinamica": "Parágrafo de 80–100 palavras descrevendo o padrão criminal dominante, modus operandi, rotas de fuga e pontos de receptação.",
  "acoes": [
    {
      "prioridade": 1,
      "urgencia": "imediata",
      "orgao": "GM-Rio",
      "tipo_recurso": "patrulha_moto",
      "acao": "Patrulha motorizada no trecho da Av. Presidente Vargas",
      "local": "Avenida Presidente Vargas",
      "evidencia": "1.305 ocorrências no trecho, pico às 20h, 63% noturno",
      "prazo": "Esta semana"
    }
  ]
}
```

#### Campos de `dinamica`

Parágrafo estruturado que compõe a seção "Dinâmica Criminal" do relatório, conforme seção 7.1 do briefing. Contém: modalidade predominante, modus operandi, rotas de fuga, pontos de receptação e influência de ORCRIM.

#### Campos de `acoes[]`

| Campo | Tipo | Valores permitidos | Mapeamento ao briefing |
|---|---|---|---|
| `prioridade` | `number` | 1–8 (1 = mais urgente) | Score de prioridade (seção 7.2) |
| `urgencia` | `string` | `"imediata"`, `"7_dias"`, `"30_dias"` | Prazo da ação (seção 6.1) |
| `orgao` | `string` | `"GM-Rio"`, `"RioLuz"`, `"Comlurb"`, `"SEOP"`, `"SECONSERVA"`, `"SMAS"`, `"CET-Rio"`, `"SMTR"` | Órgão responsável (seção 4) |
| `tipo_recurso` | `string` | `"patrulha_moto"`, `"patrulha_pe"`, `"viatura"`, `"iluminacao"`, `"limpeza"`, `"ordenamento"`, `"assistencia_social"`, `"manutencao_via"`, `"transporte"` | Tipo de ação/recurso |
| `acao` | `string` | Texto livre (~60 chars) | Título da ação acordada |
| `local` | `string` | Logradouro real | Local específico da intervenção |
| `evidencia` | `string` | Texto com dados | Justificativa textual com indicação dos fatores (seção 7.2) |
| `prazo` | `string` | Texto livre | Ex.: `"Esta semana"`, `"Em 7 dias"` |

O prompt instrui o modelo a gerar **5 a 8 ações**, com a primeira sempre para `GM-Rio` (Força Municipal), refletindo a prioridade operacional do CompStat.

### Response de Erro (500)

```json
{
  "error": "mensagem de erro"
}
```

| Causa | Quando ocorre |
|---|---|
| Chave ausente | `ANTHROPIC_API_KEY` não configurada em `.env.local` |
| Chave inválida | Token expirado ou incorreto |
| Falha de parse | Claude retornou texto que não é JSON válido |
| Timeout | API Anthropic não respondeu no prazo |

### Exemplo cURL

```bash
curl -X POST http://localhost:3000/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
    "relint": "## AVENIDA PRESIDENTE VARGAS\nConcentra intenso fluxo de pedestres...",
    "stats": {
      "crimes_total": 4011,
      "crimes_por_tipo": {
        "Roubo a transeunte": 2722,
        "Roubo de aparelho celular": 943,
        "Roubo em coletivo": 346
      },
      "pico_horario": "20h",
      "pct_noturno": 63.0,
      "hora_distribution": { "20": 361, "21": 319 },
      "dia_distribution": { "Sabado": 662, "Sexta": 644 },
      "denuncias_total": 157,
      "fatores_urbanos_total": 90,
      "cameras_total": 230,
      "psr_total": 1883,
      "modus_operandi": { "a_pe": 78, "em_grupo": 37, "armado": 17 }
    },
    "top_trechos": [
      {
        "locf_norm": "avenida presidente vargas",
        "total": 1305,
        "lat": -22.904,
        "lng": -43.188,
        "roubo_transeunte": 758,
        "roubo_celular": 307,
        "roubo_coletivo": 240,
        "pico_hora": 20
      }
    ],
    "fatores": [
      {
        "orgao": "SMAS",
        "total": 27,
        "tipos": [{ "tipo": "Pessoas em situação de rua", "count": 22 }]
      }
    ],
    "relatos": [
      {
        "tipo": "ROUBO A MOTORISTAS",
        "data": "12/18/2023 19:54:00",
        "bairro": "CENTRO",
        "logradouro": "PRESIDENTE VARGAS",
        "relato": "NA AVENIDA CITADA... ADOLESCENTES ASSALTANDO OS MOTORISTAS...",
        "modus": ["menores", "veiculo"]
      }
    ]
  }'
```

---

## POST `/api/report`

### Propósito

Gera o **Relatório Analítico de Área** no formato oficial CompStat (`.docx`), combinando dados estruturados com a síntese de dinâmica criminal gerada pela IA. O output segue a estrutura consolidada pelo CompStat Municipal conforme seção 6.1 do briefing:

1. Identificação da Área (AISP, DP, BPM, domínio, base FM, subprefeitura)
2. Indicadores do Período (volume de roubos e furtos, ranking, evolução)
3. Distribuição por Tipo de Ocorrência
4. Análise Temporal (hora, dia, período predominante)
5. Dinâmica Criminal (síntese qualitativa gerada pela IA)
6. Fatores de Incidência Criminal (por órgão responsável)
7. Painel de Coincidências
8. Plano de Ação e Responsabilização

### Dependências

| Requisito | Detalhe |
|---|---|
| Python | 3.10+ (`python3` no PATH) |
| Pacote | `python-docx` (instalado via `backend/requirements.txt`) |
| Script | `backend/generate_report.py` (invocado via `subprocess`) |

### Request

**Content-Type:** `application/json`

```json
{
  "area": { "...objeto Area completo..." },
  "synthesis": "string"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `area` | `Area` | Sim | Objeto completo da área (conforme schema em [DATA_DICTIONARY.md](DATA_DICTIONARY.md)) |
| `synthesis` | `string` | Sim | Parágrafo de dinâmica criminal (`dinamica` retornado por `/api/synthesize`) |

O script Python consome: `area.nome`, `area.stats`, `area.score`, `area.top_trechos`, `area.fatores_por_orgao` e o texto `synthesis`.

### Response (200 OK)

**Content-Type:** `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

| Header | Valor |
|---|---|
| `Content-Type` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `Content-Disposition` | `attachment; filename="CompStat_{nome_area}.docx"` |

O corpo da resposta é o arquivo binário `.docx` pronto para download e uso na reunião semanal do CompStat.

### Fluxo Interno

```
1. Gera UUID → grava payload JSON em /tmp/compstat_input_{uuid}.json
2. Executa: python3 backend/generate_report.py --input {tmp} --output {tmp}.docx
3. Lê o .docx gerado → retorna como resposta binária
4. Remove arquivos temporários (cleanup)
```

### Response de Erro (500)

```json
{
  "error": "mensagem de erro"
}
```

| Causa | Quando ocorre |
|---|---|
| Python não encontrado | `python3` não está no PATH |
| Dependência ausente | `python-docx` não instalado |
| Falha no script | `generate_report.py` retornou exit code != 0 |
| Arquivo não gerado | Script executou mas não produziu o `.docx` |

### Exemplo cURL

```bash
curl -X POST http://localhost:3000/api/report \
  -H "Content-Type: application/json" \
  -d @- \
  --output CompStat_relatorio.docx <<'EOF'
{
  "area": {
    "id": 20,
    "nome": "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
    "stats": {
      "crimes_total": 4011,
      "crimes_por_tipo": {
        "Roubo a transeunte": 2722,
        "Roubo de aparelho celular": 943,
        "Roubo em coletivo": 346
      },
      "pico_horario": "20h",
      "pct_noturno": 63.0,
      "denuncias_total": 157,
      "fatores_urbanos_total": 90,
      "cameras_total": 230,
      "psr_total": 1883
    },
    "score": {
      "total": 85.2,
      "breakdown": {
        "mancha_criminal": 38.5,
        "pico_horario": 12.1,
        "fatores_urbanos": 22.0,
        "dinamica": 12.6,
        "relint_bonus": 5
      }
    },
    "top_trechos": [
      {
        "locf_norm": "avenida presidente vargas",
        "total": 1305,
        "lat": -22.904,
        "lng": -43.188,
        "roubo_transeunte": 758,
        "roubo_celular": 307,
        "roubo_coletivo": 240,
        "pico_hora": 20
      }
    ],
    "fatores_por_orgao": [
      {
        "orgao": "SMAS",
        "total": 27,
        "tipos": [{ "tipo": "Pessoas em situação de rua", "count": 22 }]
      }
    ]
  },
  "synthesis": "A área concentra roubos a transeunte e furto de celular no entorno da Av. Presidente Vargas, com pico às 20h e 63% das ocorrências no período noturno. Denúncias indicam ação de menores e grupos em pontos de retenção de tráfego."
}
EOF
```

---

## Configuração Local

```bash
# 1. Chave da Anthropic (para /api/synthesize)
echo "ANTHROPIC_API_KEY=sk-ant-..." > eduardo/frontend/.env.local

# 2. Dependências Python (para /api/report)
cd eduardo/backend
pip install -r requirements.txt

# 3. Frontend
cd eduardo/frontend
npm install
npm run dev
```

---

## Referências

- [Arquitetura](ARCHITECTURE.md) — fluxo de dados completo e decisões técnicas
- [Dicionário de Dados](DATA_DICTIONARY.md) — schema do `areas_data.json` e tipos TypeScript
- [Guia de Contribuição](CONTRIBUTING.md) — como estender as rotas e adicionar funcionalidades

---

*CompStat Municipal RJ · Claude Impact Lab Rio · Grupo 7*
