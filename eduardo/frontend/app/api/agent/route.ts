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
    description: 'Exibe narrativa analítica no painel. Sempre chame antes de um checkpoint.',
    input_schema: {
      type: 'object' as const,
      properties: {
        step_title: { type: 'string', description: 'Título da etapa (ex: "Análise de Criminalidade")' },
        text: { type: 'string', description: '2-4 frases descrevendo achados com números específicos dos dados' },
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
    description: 'Pausa para verificar entendimento com o analista. Use exatamente 3 checkpoints na investigação.',
    input_schema: {
      type: 'object' as const,
      properties: {
        question: { type: 'string', description: 'Pergunta objetiva ao analista' },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '3-4 opções de resposta',
        },
        reasoning: { type: 'string', description: 'Por que esta pergunta importa neste momento' },
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
        summary: { type: 'string', description: 'Resumo executivo de 2-3 frases' },
        key_findings: {
          type: 'array',
          items: { type: 'string' },
          description: '3-5 achados principais, cada um com um dado concreto',
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
              acao:          { type: 'string' },
              local:         { type: 'string' },
              evidencia:     { type: 'string' },
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

const SYSTEM_PROMPT = `Você é um agente investigativo do CompStat Municipal do Rio de Janeiro.
Conduza uma análise passo a passo da área, controlando o mapa interativo para guiar o analista.

ROTEIRO OBRIGATÓRIO (siga esta sequência):
1. zoom_to_area → toggle_layer(crime, true) → narrate("Visão Geral") — criminalidade total, top crime, % noturno
2. show_annotation nos 3 trechos mais críticos → narrate("Trechos Críticos") — top 3 com números
3. CHECKPOINT 1: "Os locais críticos coincidem com as rotas de patrulha da FM?"
4. toggle_layer(dominio, true) → narrate("Domínio Territorial") — facções presentes, fronteiras de tensão
5. CHECKPOINT 2: "A dinâmica territorial reflete o modelo de emprego atual?"
6. toggle_layer(fatores, true) → toggle_layer(cameras, true) → narrate("Fatores Urbanos e Câmeras") — órgãos, cobertura
7. CHECKPOINT 3: "O turno da FM cobre o pico horário identificado?"
8. update_weights → complete_investigation

REGRAS:
- Sempre narrate antes de cada checkpoint
- Cite números específicos dos dados em TODA narração
- Máximo 3 checkpoints, depois complete_investigation obrigatoriamente
- Seja conciso: 2-4 frases por narrate
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

          const response = await client.messages.create({
            model: 'claude-sonnet-4-5',
            max_tokens: 2000,
            system: SYSTEM_PROMPT,
            tools: MAP_TOOLS,
            tool_choice: { type: 'auto' },
            messages,
          })

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
        send({ type: 'error', message: err.message || 'Erro interno do agente' })
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
