# Referência de API — CompStat Municipal RJ

Documentação das rotas de API do frontend Next.js (`eduardo/frontend/app/api/`). Ambas são endpoints **POST** executados no servidor (App Router).

**Base URL (desenvolvimento):** `http://localhost:3000`

---

## POST `/api/synthesize`

### Propósito

Gera um **plano de ação executivo** via modelo Claude, sintetizando dinâmica criminal e ações priorizadas com base nos dados operacionais de uma área FM.

### Autenticação e dependências

| Requisito | Detalhe |
|---|---|
| Variável de ambiente | `ANTHROPIC_API_KEY` em `frontend/.env.local` |
| Modelo | `claude-sonnet-4-5` |
| SDK | `@anthropic-ai/sdk` |
| `max_tokens` | 1500 |

### Corpo da requisição

`Content-Type: application/json`

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
| `nome` | `string` | sim | Nome completo da área FM |
| `relint` | `string` | não | Texto do RELINT (`relint.full_text`); truncado em 3.000 caracteres no prompt |
| `stats` | `AreaStats` | sim | Estatísticas agregadas da área (crimes, denúncias, modus, etc.) |
| `top_trechos` | `Trecho[]` | sim | Trechos prioritários (frontend envia top 5) |
| `fatores` | `FatorOrgao[]` | sim | Fatores urbanos agrupados por órgão |
| `relatos` | `Relato[]` | não | Amostra de relatos Disque Denúncia (frontend envia top 5) |

### Resposta de sucesso

**Status:** `200 OK`  
**Content-Type:** `application/json`

```json
{
  "dinamica": "Parágrafo de 80–100 palavras descrevendo o padrão criminal dominante.",
  "acoes": [
    {
      "prioridade": 1,
      "urgencia": "imediata",
      "orgao": "GM-Rio",
      "tipo_recurso": "patrulha_moto",
      "acao": "Título curto da ação",
      "local": "Logradouro específico",
      "evidencia": "Dado concreto que justifica a ação",
      "prazo": "Esta semana"
    }
  ]
}
```

#### Campos de `acoes[]`

| Campo | Tipo | Valores permitidos |
|---|---|---|
| `prioridade` | `number` | 1–8 (1 = mais urgente) |
| `urgencia` | `string` | `"imediata"` \| `"7_dias"` \| `"30_dias"` |
| `orgao` | `string` | `"GM-Rio"` \| `"RioLuz"` \| `"Comlurb"` \| `"SEOP"` \| `"SECONSERVA"` \| `"SMAS"` \| `"CET-Rio"` \| `"SMTR"` |
| `tipo_recurso` | `string` | `"patrulha_moto"` \| `"patrulha_pe"` \| `"viatura"` \| `"iluminacao"` \| `"limpeza"` \| `"ordenamento"` \| `"assistencia_social"` \| `"manutencao_via"` \| `"transporte"` |
| `acao` | `string` | Título curto (máx. ~60 caracteres) |
| `local` | `string` | Logradouro real da área |
| `evidencia` | `string` | Justificativa com número dos dados |
| `prazo` | `string` | Texto livre (ex.: `"Esta semana"`, `"Em 7 dias"`, `"Em 30 dias"`) |

O prompt instrui o modelo a gerar **5 a 8 ações**, com a primeira sempre para `GM-Rio`.

### Resposta de erro

**Status:** `500 Internal Server Error`

```json
{
  "error": "mensagem de erro"
}
```

Erros comuns: chave Anthropic ausente/inválida, falha de parse JSON na resposta do modelo, timeout da API.

### Exemplo cURL

```bash
curl -X POST http://localhost:3000/api/synthesize \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "Presidente Vargas - Campo de Santana - Central do Brasil - Cinelândia",
    "relint": "## AVENIDA PRESIDENTE VARGAS\nA Avenida Presidente Vargas concentra intenso fluxo...",
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

Gera o **Relatório Analítico de Área** no formato oficial CompStat (`.docx`), combinando dados estruturados da área com a síntese de dinâmica criminal.

### Dependências

| Requisito | Detalhe |
|---|---|
| Python | 3.10+ (`python3` no PATH) |
| Pacote | `python-docx` (instalado via `backend/requirements.txt`) |
| Script | `backend/generate_report.py` (invocado via `subprocess`) |

### Corpo da requisição

`Content-Type: application/json`

```json
{
  "area": { "...objeto Area completo..." },
  "synthesis": "string"
}
```

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `area` | `Area` | sim | Objeto completo da área (como em `areas_data.json`) |
| `synthesis` | `string` | sim | Parágrafo de dinâmica criminal gerado pela IA (`dinamica` retornado por `/api/synthesize`) |

O script Python utiliza principalmente: `area.nome`, `area.stats`, `area.score`, `area.top_trechos`, `area.fatores_por_orgao` e o texto `synthesis`.

### Resposta de sucesso

**Status:** `200 OK`  
**Content-Type:** `application/vnd.openxmlformats-officedocument.wordprocessingml.document`

Corpo: arquivo binário `.docx`

**Headers de resposta:**

| Header | Valor |
|---|---|
| `Content-Type` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| `Content-Disposition` | `attachment; filename="CompStat_{nome_area}.docx"` |

### Resposta de erro

**Status:** `500 Internal Server Error`

```json
{
  "error": "mensagem de erro"
}
```

Erros comuns: Python não instalado, `python-docx` ausente, falha na execução de `generate_report.py`, arquivo de saída não gerado.

### Fluxo interno

1. Gera UUID e grava payload JSON em arquivo temporário (`/tmp/compstat_input_{uuid}.json`)
2. Executa: `python3 backend/generate_report.py --input {tmp} --output {tmp}.docx`
3. Lê o `.docx` gerado e retorna como resposta binária
4. Remove arquivos temporários

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

## Fluxo recomendado (frontend)

```
1. Carregar areas_data.json
2. Usuário seleciona área → aba Relatório
3. POST /api/synthesize  →  { dinamica, acoes }
4. Exibir plano de ação + botões Despachar (mailto)
5. POST /api/report        →  download .docx
```

---

## Configuração local

```bash
# frontend/.env.local
ANTHROPIC_API_KEY=sk-ant-...

# backend (para /api/report)
cd eduardo/backend
pip install -r requirements.txt
```

---

*CompStat Municipal RJ · Hackathon Claude Impact Lab · Grupo 7*
