import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const { nome, relint, stats, top_trechos, fatores, relatos } = await req.json()

  const trechos_txt = top_trechos
    .map((t: any, i: number) => `  ${i+1}. ${t.locf_norm} — ${t.total} ocorrências (pico ${t.pico_hora}h)`)
    .join('\n')

  const fatores_txt = fatores
    .map((f: any) => `  ${f.orgao}: ${f.total} fatores — ${f.tipos.slice(0,2).map((t: any) => `${t.tipo} [${t.count}]`).join(', ')}`)
    .join('\n')

  const relatos_txt = (relatos || []).slice(0,4)
    .map((r: any, i: number) => `  [${i+1}] ${r.tipo} — "${r.relato.slice(0,180)}"`)
    .join('\n')

  const modus_txt = Object.entries(stats.modus_operandi || {}).slice(0,5)
    .map(([k,v]) => `${k}:${v}`).join(', ')

  const prompt = `Você monta um plano de ação prático para melhorar a segurança na área "${nome}".
Use linguagem simples e direta — como se estivesse explicando para um colega, sem jargão nem palavras difíceis.

DADOS:
- Crimes (2020-2024): ${stats.crimes_total} | Pico: ${stats.pico_horario} | ${stats.pct_noturno}% noturno
- Tipos: ${JSON.stringify(stats.crimes_por_tipo)}
- Modus operandi: ${modus_txt}
- Denúncias Disque Denúncia: ${stats.denuncias_total}
- Fatores urbanos pendentes: ${stats.fatores_urbanos_total}
- Câmeras CIVITAS: ${stats.cameras_total}
- Pop. situação de rua: ${stats.psr_total}

TOP TRECHOS:
${trechos_txt}

FATORES POR ÓRGÃO:
${fatores_txt}

RELATOS REAIS DO DISQUE DENÚNCIA:
${relatos_txt}

RELATÓRIO DE INTELIGÊNCIA (RELINT):
${relint ? relint.slice(0, 3000) : 'Não disponível.'}

---
Retorne APENAS um objeto JSON válido, sem markdown, sem backticks, sem texto antes ou depois.
O JSON deve ter exatamente esta estrutura:

{
  "dinamica": "Parágrafo único de 80-100 palavras, em linguagem simples e natural, descrevendo como os crimes acontecem na área, com dados concretos.",
  "acoes": [
    {
      "prioridade": 1,
      "urgencia": "imediata",
      "orgao": "GM-Rio",
      "tipo_recurso": "patrulha_moto",
      "acao": "Título curto e claro da ação, em linguagem simples (máx 60 chars)",
      "local": "Logradouro específico ou trecho",
      "evidencia": "Dado concreto que justifica (número, %, horário)",
      "prazo": "Esta semana"
    }
  ]
}

Regras:
- Escreva tudo em português simples, como numa conversa — sem jargão policial ou burocrático
- Gere entre 5 e 8 ações
- urgencia: "imediata" | "7_dias" | "30_dias"  
- orgao: apenas um destes: "GM-Rio" | "RioLuz" | "Comlurb" | "SEOP" | "SECONSERVA" | "SMAS" | "CET-Rio" | "SMTR"
- tipo_recurso: "patrulha_moto" | "patrulha_pe" | "viatura" | "iluminacao" | "limpeza" | "ordenamento" | "assistencia_social" | "manutencao_via" | "transporte"
- prazo: texto curto em português ("Esta semana" | "Em 7 dias" | "Em 30 dias")
- local: logradouro REAL da área, específico
- evidencia: cite um número real dos dados acima
- Ordene por prioridade (1 = mais urgente)
- A primeira ação deve ser sempre para GM-Rio (emprego da força)
- Inclua pelo menos 1 ação de assistência social (SMAS) se PSR > 100
- Inclua pelo menos 1 ação de iluminação (RioLuz) se pct_noturno > 50%`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = (response.content[0] as any).text.trim()
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
