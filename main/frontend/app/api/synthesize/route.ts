import { NextRequest, NextResponse } from 'next/server'
import Anthropic, { APIConnectionError, AuthenticationError } from '@anthropic-ai/sdk'
import type { Trecho, Relato, FatorOrgao, AreaStats, Chamados1746, ValidacaoCruzada } from '../../types'

interface SynthesizeBody {
  nome: string
  relint: string | null
  stats: AreaStats
  top_trechos: Trecho[]
  fatores: FatorOrgao[]
  relatos: Relato[]
  chamados_1746?: Chamados1746
  validacao_cruzada?: ValidacaoCruzada[]
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return NextResponse.json({
      error: 'ANTHROPIC_API_KEY não encontrada em process.env. ' +
        'Confira o arquivo eduardo/frontend/.env (ou .env.local) e ' +
        'reinicie o servidor (next dev carrega .env apenas no startup).',
    }, { status: 500 })
  }
  const client = new Anthropic({ apiKey })

  const { nome, relint, stats, top_trechos, fatores, relatos, chamados_1746, validacao_cruzada } = await req.json() as SynthesizeBody

  const trechos_txt = top_trechos
    .map((t, i) => `  ${i+1}. ${t.locf_norm} — ${t.total} ocorrências (pico ${t.pico_hora}h)`)
    .join('\n')

  const fatores_txt = fatores
    .map((f) => `  ${f.orgao}: ${f.total} fatores — ${f.tipos.slice(0,2).map((t) => `${t.tipo} [${t.count}]`).join(', ')}`)
    .join('\n')

  const relatos_txt = (relatos || []).slice(0,4)
    .map((r, i) => `  [${i+1}] ${r.tipo} — "${r.relato.slice(0,180)}"`)
    .join('\n')

  const modus_txt = Object.entries(stats.modus_operandi || {}).slice(0,5)
    .map(([k,v]) => `${k}:${v}`).join(', ')

  const chamados_txt = chamados_1746
    ? `Total: ${chamados_1746.total} chamados | ${chamados_1746.pct_atendido}% atendidos | ${chamados_1746.pct_vencido}% vencidos\n` +
      (chamados_1746.por_tipo || []).slice(0,8).map((c) => `  ${c.tipo}: ${c.total} (${c.atendidos} atendidos)`).join('\n')
    : 'Não disponível.'

  const validacao_txt = (validacao_cruzada || [])
    .map((v) => `  ${v.orgao}: ${v.fatores_campo} fatores campo + ${v.chamados_1746} chamados 1746 (${v.chamados_1746 > 0 ? Math.round(v.chamados_atendidos/v.chamados_1746*100) : 0}% atendidos, ${v.chamados_vencidos} vencidos)`)
    .join('\n')

  const prompt = `Você monta um plano de ação prático para melhorar a segurança na área "${nome}".
Use linguagem simples e direta — como se estivesse explicando para um colega, sem jargão nem palavras difíceis.

CONTEXTO DAS FONTES DE DADOS (entenda a diferença — é crucial):

1. OCORRÊNCIAS (ISP-RJ, 2020-2024): Registros policiais de crimes. ONDE o crime acontece.
2. DISQUE DENÚNCIA (DD): Denúncias ANÔNIMAS sobre CRIME (roubo, drogas, tráfico). COMO o crime opera.
   NÃO confundir com 1746. DD é sobre atividade criminal, não sobre infraestrutura.
3. FATORES URBANOS (levantamento de campo, 2026): Observações da equipe FM sobre O QUE facilita o crime
   (poste apagado, vegetação, calçada degradada). Diagnóstico qualitativo in loco.
4. CHAMADOS 1746 (Central de Atendimento, 2020-2024): Pedidos de SERVIÇO PÚBLICO da população
   (reparo de poste, remoção de entulho, poda de árvore). EVIDÊNCIA QUANTITATIVA de que os fatores
   urbanos são crônicos — a população vem reclamando há anos. Cada chamado tem status (atendido/vencido).
5. VALIDAÇÃO CRUZADA: Quando campo (fator) + cidadão (1746) concordam, o problema é validado.
   Ex: equipe viu "iluminação deficiente" E existem 2.000 chamados de "poste apagado" na área.

DADOS DA ÁREA:
- Crimes (2020-2024): ${stats.crimes_total} | Pico: ${stats.pico_horario} | ${stats.pct_noturno}% noturno
- Tipos: ${JSON.stringify(stats.crimes_por_tipo)}
- Modus operandi (extraído do DD): ${modus_txt}
- Denúncias Disque Denúncia (sobre CRIME): ${stats.denuncias_total}
- Fatores urbanos (observação de CAMPO): ${stats.fatores_urbanos_total}
- Câmeras CIVITAS: ${stats.cameras_total}
- Pop. situação de rua: ${stats.psr_total}

TOP TRECHOS:
${trechos_txt}

FATORES POR ÓRGÃO (observação de campo):
${fatores_txt}

CHAMADOS 1746 (demanda cidadã — serviços públicos):
${chamados_txt}

VALIDAÇÃO CRUZADA (campo × cidadão por órgão):
${validacao_txt}

RELATOS REAIS DO DISQUE DENÚNCIA (sobre CRIME, não infraestrutura):
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
- evidencia: cite dados CONCRETOS. Para ações de infraestrutura, use TANTO o fator de campo QUANTO os chamados 1746. Ex: "46 pontos de iluminação deficiente (campo) + 1.964 chamados RioLuz (1746), 78% atendidos"
- Ordene por prioridade (1 = mais urgente)
- A primeira ação deve ser sempre para GM-Rio (emprego da força)
- Inclua pelo menos 1 ação de assistência social (SMAS) se PSR > 100
- Inclua pelo menos 1 ação de iluminação (RioLuz) se pct_noturno > 50%
- Use os chamados 1746 para justificar URGÊNCIA: se % vencidos é alto, a prefeitura já falhou em atender; se volume é alto, é problema crônico
- NÃO confunda Disque Denúncia (crime) com 1746 (infraestrutura). São fontes completamente diferentes.`

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    })
    // Diagnóstico imediato: se o modelo bateu no teto, a resposta vai
    // estar truncada no meio de uma string → JSON.parse falha com
    // "Unterminated string". Devolver erro mais útil que o do parser.
    if (response.stop_reason === 'max_tokens') {
      throw new Error(
        `Resposta truncada (max_tokens atingido, output=${response.usage?.output_tokens}). ` +
        `Aumente max_tokens em /api/synthesize ou reduza o tamanho do prompt.`
      )
    }
    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Unexpected response type from Claude')
    const raw = block.text.trim()
    // Strip any accidental markdown fences
    const clean = raw.replace(/^```json\s*/,'').replace(/```\s*$/,'').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json(parsed)
  } catch (e: unknown) {
    // Surfacing the real cause: APIConnectionError esconde o erro de fetch
    // subjacente em `cause` (UND_ERR_CONNECT_TIMEOUT, ENOTFOUND, cert chain,
    // etc.). Sem isso, o usuário vê apenas "Connection error." e suspeita da
    // chave por causa do hint da UI.
    if (e instanceof APIConnectionError) {
      const cause = (e as { cause?: unknown }).cause
      const causeMsg = cause instanceof Error
        ? `${cause.name}: ${cause.message}${(cause as NodeJS.ErrnoException).code ? ` [${(cause as NodeJS.ErrnoException).code}]` : ''}`
        : cause ? String(cause) : 'sem detalhes'
      return NextResponse.json({
        error: `Falha de rede ao chamar api.anthropic.com: ${causeMsg}. ` +
          `A chave está carregada — o problema é conectividade do processo Node ` +
          `(proxy corporativo, firewall, MITM TLS sem NODE_EXTRA_CA_CERTS, ou IPv6 quebrado).`,
      }, { status: 502 })
    }
    if (e instanceof AuthenticationError) {
      return NextResponse.json({
        error: `Chave Anthropic rejeitada (401): ${e.message}. ` +
          `A variável foi carregada mas é inválida/revogada.`,
      }, { status: 401 })
    }
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
