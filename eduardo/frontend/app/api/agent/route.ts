import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import type { Area } from '../../types'

const client = new Anthropic()

const MAP_TOOLS: Anthropic.Tool[] = [
  {
    name: 'toggle_layer',
    description: 'Exibe ou oculta uma camada de dados no mapa',
    input_schema: {
      type: 'object' as const,
      properties: {
        layer: {
          type: 'string',
          enum: ['crime', 'fatores', 'cameras', 'psr', 'dominio'],
          description: 'Identificador da camada',
        },
        visible: { type: 'boolean', description: 'true para exibir, false para ocultar' },
      },
      required: ['layer', 'visible'],
    },
  },
  {
    name: 'zoom_to_area',
    description: 'Centraliza e anima o mapa para a área em análise',
    input_schema: {
      type: 'object' as const,
      properties: {
        area_id: { type: 'number', description: 'ID numérico da área' },
      },
      required: ['area_id'],
    },
  },
  {
    name: 'show_annotation',
    description: 'Adiciona marcador informativo temporário no mapa em coordenada específica',
    input_schema: {
      type: 'object' as const,
      properties: {
        lat: { type: 'number' },
        lng: { type: 'number' },
        title: { type: 'string', description: 'Título curto (logradouro ou ponto de interesse)' },
        body: { type: 'string', description: 'Observação de até 60 caracteres' },
      },
      required: ['lat', 'lng', 'title', 'body'],
    },
  },
  {
    name: 'narrate',
    description: 'Mostra texto explicativo no painel. Sempre chame antes de um checkpoint.',
    input_schema: {
      type: 'object' as const,
      properties: {
        step_title: { type: 'string', description: 'Título curto e simples (ex: "Crimes na área", "Ruas mais perigosas")' },
        text: { type: 'string', description: '2-4 frases em linguagem do dia a dia, como numa conversa. Use números dos dados, mas explique de forma fácil de entender.' },
      },
      required: ['step_title', 'text'],
    },
  },
  {
    name: 'update_weights',
    description: 'Ajusta pesos do score de risco para destacar a dimensão analisada',
    input_schema: {
      type: 'object' as const,
      properties: {
        mancha:   { type: 'number', description: '0-60' },
        pico:     { type: 'number', description: '0-60' },
        fatores:  { type: 'number', description: '0-60' },
        dinamica: { type: 'number', description: '0-60' },
      },
    },
  },
  {
    name: 'checkpoint',
    description: 'Pausa para o analista fazer perguntas ou continuar. Use exatamente 3 checkpoints na investigação. Sempre inclua "Continuar análise" como primeira opção.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Pergunta simples e direta, resumindo o que já vimos e convidando a seguir ou tirar dúvidas (ex: "Já vimos os crimes principais da área. Quer saber mais de alguma coisa antes de continuar?")' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: 'Primeira opção SEMPRE "Continuar análise". Demais opções: 2-3 perguntas curtas e fáceis de entender sobre o que o analista pode querer saber mais',
        },
        reasoning: { type: 'string', description: 'Resumo breve e simples do que já foi mostrado até aqui' },
      },
      required: ['question', 'options', 'reasoning'],
    },
  },
  {
    name: 'complete_investigation',
    description: 'Finaliza a investigação. Chame após o último checkpoint.',
    input_schema: {
      type: 'object' as const,
      properties: {
        summary: { type: 'string', description: 'Resumo simples de 2-3 frases, em linguagem natural' },
        key_findings: {
          type: 'array',
          items: { type: 'string' },
          description: '3-5 pontos principais em frases curtas e fáceis de ler, cada um com um número ou dado concreto',
        },
        actions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              prioridade:    { type: 'number' },
              urgencia:      { type: 'string', enum: ['imediata', '7_dias', '30_dias'] },
              orgao:         { type: 'string' },
              tipo_recurso:  { type: 'string' },
              acao:          { type: 'string', description: 'O que fazer, em linguagem simples e direta' },
              local:         { type: 'string' },
              evidencia:     { type: 'string', description: 'Número ou dado concreto que explica por que essa ação faz sentido' },
              prazo:         { type: 'string' },
            },
          },
          description: '5-8 ações priorizadas',
        },
      },
      required: ['summary', 'key_findings', 'actions'],
    },
  },
]

function buildAreaSummary(area: Area): string {
  const s = area.stats
  const b = area.score.breakdown

  const crimeTypes = Object.entries(s.crimes_por_tipo)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ')

  const modus = Object.entries(s.modus_operandi || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${v}%`)
    .join(', ')

  const trechos = area.top_trechos.slice(0, 8)
    .map((t, i) => `  ${i + 1}. ${t.locf_norm} — ${t.total} ocs (pico ${t.pico_hora}h) [lat:${t.lat.toFixed(4)},lng:${t.lng.toFixed(4)}]`)
    .join('\n')

  const dominioCount = area.dominio_territorial.reduce((acc, d) => {
    acc[d.faccao] = (acc[d.faccao] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const dominioStr = Object.entries(dominioCount)
    .map(([f, n]) => `${f}:${n}`)
    .join(', ')

  const fatoresStr = area.fatores_por_orgao
    .slice(0, 4)
    .map(f => `${f.orgao}:${f.total}`)
    .join(', ')

  return `ÁREA: ${area.nome} (ID: ${area.id})
SCORE DE RISCO: ${area.score.total} | Mancha:${b.mancha_criminal}/40, Pico:${b.pico_horario}/15, Fatores:${b.fatores_urbanos}/25, Dinâmica:${b.dinamica}/15

CRIMINALIDADE (2020-2024):
- Total: ${s.crimes_total} ocorrências
- Tipos: ${crimeTypes}
- Pico horário: ${s.pico_horario} | ${s.pct_noturno}% noturno
- Modus operandi: ${modus}

TOP 8 TRECHOS CRÍTICOS (com coordenadas para show_annotation):
${trechos}

DADOS COMPLEMENTARES:
- Disque Denúncia: ${s.denuncias_total} denúncias
- Fatores urbanos: ${s.fatores_urbanos_total} (${fatoresStr})
- Câmeras CIVITAS: ${s.cameras_total}
- Pop. situação de rua (PSR): ${s.psr_total}

CONTROLE TERRITORIAL:
- Domínio principal: ${area.identificacao.dominio_principal}
- Territórios por facção: ${dominioStr || 'Nenhum mapeado'}

RELINT (trecho):
${area.relint?.full_text?.slice(0, 1800) || 'Não disponível.'}`
}

const SYSTEM_PROMPT = `Você guia um analista pelo mapa de segurança do Rio de Janeiro, mostrando os dados da área passo a passo.

LINGUAGEM (obrigatório em narrate, checkpoint e complete_investigation):
- Fale como numa conversa normal, em português simples e claro.
- Use palavras do dia a dia. Evite jargão, termos técnicos e palavras difíceis.
- Prefira "crimes" a "ocorrências", "ruas mais perigosas" a "trechos críticos", "grupos armados" a "facções", "problemas na rua" a "fatores urbanos".
- Frases curtas e diretas. Se usar um número, explique o que ele significa ("6 em cada 10 crimes acontecem à noite").
- Soe natural, como alguém explicando para um colega — não como um relatório formal.

ROTEIRO OBRIGATÓRIO (siga esta sequência):
1. zoom_to_area → toggle_layer(crime, true) → narrate("Crimes na área") — total de crimes, tipo mais comum, quantos acontecem à noite
2. show_annotation nas 3 ruas com mais crimes → narrate("Ruas mais perigosas") — top 3 com números
3. CHECKPOINT 1: pause para o analista — resuma o que vimos sobre crimes e ofereça 2-3 opções simples de aprofundamento, sempre com "Continuar análise" como primeira opção
4. toggle_layer(dominio, true) → narrate("Quem manda na região") — grupos presentes, pontos de tensão
5. CHECKPOINT 2: pause para o analista — resuma o que vimos sobre o território e ofereça opções de aprofundamento
6. toggle_layer(fatores, true) → toggle_layer(cameras, true) → narrate("Problemas na rua e câmeras") — o que falta arrumar, onde tem câmera
7. CHECKPOINT 3: pause para o analista — resuma fatores e câmeras e ofereça opções antes de encerrar
8. update_weights → complete_investigation

REGRAS:
- Sempre narrate antes de cada checkpoint
- Use números dos dados em TODA narração, mas explique o que eles significam
- Máximo 3 checkpoints, depois complete_investigation obrigatoriamente
- Seja conciso: 2-4 frases por narrate
- Checkpoints são pausas para o analista fazer perguntas ou seguir em frente — NÃO são testes de conhecimento
- Quando o analista responder um checkpoint, adapte o próximo narrate à resposta dele`

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { area, messages: savedMessages, checkpoint_tool_use_id, checkpoint_answer } = body as {
    area: Area
    messages: any[]
    checkpoint_tool_use_id?: string
    checkpoint_answer?: string
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }

      try {
        // Build messages: either initial or resume from checkpoint
        let messages: any[]

        if (savedMessages && savedMessages.length > 0) {
          // Resume: add tool_result for the checkpoint
          messages = [
            ...savedMessages,
            {
              role: 'user',
              content: [{
                type: 'tool_result',
                tool_use_id: checkpoint_tool_use_id,
                content: JSON.stringify({ user_answer: checkpoint_answer }),
              }],
            },
          ]
        } else {
          // Initial: build from area data
          messages = [
            {
              role: 'user',
              content: buildAreaSummary(area),
            },
          ]
        }

        let continueLoop = true
        let turn = 0
        const MAX_TURNS = 12

        while (continueLoop && turn < MAX_TURNS) {
          turn++

          console.log(`[agent] turn ${turn} — chamando Claude (${messages.length} msgs)`)
          send({ type: 'thinking', turn, detail: `Turno ${turn} — consultando modelo…` })

          const response = await client.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            tools: MAP_TOOLS,
            tool_choice: { type: 'auto' },
            messages,
          })

          const toolNames = response.content
            .filter((b: any) => b.type === 'tool_use')
            .map((b: any) => b.name)
          console.log(`[agent] turn ${turn} — stop_reason: ${response.stop_reason} | tools: [${toolNames.join(', ')}]`)

          // Add assistant turn to messages
          messages = [...messages, { role: 'assistant', content: response.content }]

          const toolResults: any[] = []
          let hitCheckpoint = false

          for (const block of response.content) {
            if (block.type === 'text' && block.text.trim()) {
              send({ type: 'text', content: block.text })
              continue
            }

            if (block.type === 'tool_use') {
              console.log(`[agent]   tool: ${block.name}`, JSON.stringify(block.input).slice(0, 120))
              send({ type: 'tool', name: block.name, input: block.input, id: block.id })

              if (block.name === 'checkpoint') {
                // Pause: send messages snapshot so client can resume
                send({
                  type: 'pause',
                  checkpoint: { ...(block.input as object), tool_use_id: block.id },
                  messages,
                })
                hitCheckpoint = true
                continueLoop = false
                break
              }

              if (block.name === 'complete_investigation') {
                send({ type: 'complete', findings: block.input })
                continueLoop = false
                break
              }

              // All other tools: return success so Claude can continue
              toolResults.push({
                type: 'tool_result',
                tool_use_id: block.id,
                content: JSON.stringify({ status: 'ok' }),
              })
            }
          }

          // Add tool results for next turn (if any non-pause tools were called)
          if (continueLoop && toolResults.length > 0) {
            messages = [...messages, { role: 'user', content: toolResults }]
          }

          // Natural end of conversation
          if (response.stop_reason === 'end_turn') {
            continueLoop = false
          }
        }

        send({ type: 'done' })
      } catch (err: any) {
        send({ type: 'error', message: err.message || 'Erro interno do agente', status: (err as any).status ?? 500 })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
