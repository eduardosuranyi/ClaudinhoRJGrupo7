'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { isToolUIPart, getToolName } from 'ai'
import type { UIMessage } from 'ai'
import type { AgentFindings, Area } from '../types'

const TOOL_LABELS: Record<string, string> = {
  toggle_layer: 'Camada alterada',
  zoom_to_area: 'Navegando para área',
  show_annotation: 'Marcador adicionado',
  update_weights: 'Pesos ajustados',
  complete_investigation: 'Investigação concluída',
  highlight_trecho: 'Rua destacada',
  highlight_top_trechos: 'Top trechos destacados',
  clear_highlights: 'Highlights limpos',
  focus_bairro: 'Bairro em foco',
  set_time_filter: 'Filtro horário aplicado',
  show_route: 'Rota desenhada',
  query_trechos: 'Consultando trechos',
  query_relatos_dd: 'Consultando relatos DD',
  query_chamados_1746: 'Consultando 1746',
  query_fatores: 'Consultando fatores',
  query_camera_gaps: 'Consultando pontos cegos',
  validacao_cruzada: 'Cruzando campo × 1746',
  get_relint_section: 'Lendo RELINT',
  evolucao_mensal: 'Série mensal',
  bairros_entorno: 'Bairros do entorno',
  crimes_por_hora: 'Distribuição horária',
  ontology_events: 'Eventos NER',
  pause_for_user: 'Aguardando',
}

const URGENCY_COLOR: Record<string, string> = {
  imediata: 'var(--red)',
  '7_dias': 'var(--accent)',
  '30_dias': 'var(--amber)',
}

const URGENCY_LABEL: Record<string, string> = {
  imediata: 'Imediata',
  '7_dias': '7 dias',
  '30_dias': '30 dias',
}

interface Props {
  messages: UIMessage[]
  status: 'submitted' | 'streaming' | 'ready' | 'error'
  findings: AgentFindings | null
  currentArea: Area | null
  sendMessage: (msg: { text: string }) => void
  onAbort: () => void
  isPaused: boolean
  nextSuggestions: string[] | null
}

export default function AgentPanel({
  messages,
  status,
  findings,
  currentArea,
  sendMessage,
  onAbort,
  isPaused,
  nextSuggestions,
}: Props) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  useEffect(() => {
    if (status !== 'streaming') return
    const interval = setInterval(() => {
      const container = scrollContainerRef.current
      if (!container) return
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150
      if (isNearBottom) {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
      }
    }, 300)
    return () => clearInterval(interval)
  }, [status])

  const isRunning = status === 'submitted' || status === 'streaming'
  const isComplete = findings !== null
  const isError = status === 'error'

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || isRunning) return
    setInput('')
    sendMessage({ text })
  }

  // Visible messages: skip the empty trigger message (first user message with empty text)
  const visibleMessages = messages.filter((m, i) => {
    if (m.role === 'user' && i === 0) {
      const text = (m.parts ?? []).find((p: unknown) => (p as { type: string }).type === 'text')
      return text && (text as { text: string }).text.trim() !== ''
    }
    return true
  })

  return (
    <aside
      style={{
        width: 420,
        minWidth: 420,
        borderLeft: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg)',
        overflow: 'hidden',
        height: '100%',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '10px 16px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-1)',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              flexShrink: 0,
              background: isError
                ? 'var(--red)'
                : isComplete
                  ? 'var(--blue)'
                  : isRunning
                    ? 'var(--green)'
                    : 'var(--amber)',
              animation: isRunning ? 'pulse-accent 1.2s ease-in-out infinite' : undefined,
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.03em' }}>
            {currentArea?.nome ?? 'Investigação'}
          </span>
          <span className="label-overline" style={{ fontSize: 9 }}>
            {isError
              ? 'erro'
              : isComplete
                ? 'concluída'
                : isRunning
                  ? 'em andamento'
                  : 'aguardando'}
          </span>
        </div>
        <button
          onClick={onAbort}
          title={isComplete || isError ? 'Fechar' : 'Abortar'}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 14,
            cursor: 'pointer',
            padding: '2px 4px',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {visibleMessages.map(msg => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            <div
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--green)',
                animation: 'pulse-accent 1s ease-in-out infinite',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>analisando…</span>
          </div>
        )}

        {isError && (
          <div
            style={{
              background: 'var(--red-soft)',
              border: '1px solid var(--red)',
              borderRadius: 4,
              padding: '8px 12px',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--red)' }}>
              Erro na conexão. Tente novamente.
            </span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Findings panel */}
      {isComplete && findings && <FindingsSection findings={findings} />}

      {/* Pause suggestions */}
      {isPaused && !isComplete && !isRunning && (
        <div
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg-1)',
            padding: '8px 12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: 5,
            flexShrink: 0,
          }}
        >
          {(nextSuggestions ?? []).map((s, i) => (
            <button
              key={i}
              onClick={() => sendMessage({ text: s })}
              style={{
                background: 'var(--bg-2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: '4px 10px',
                fontSize: 10,
                color: 'var(--text-dim)',
                cursor: 'pointer',
                lineHeight: 1.4,
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'var(--accent-soft)'
                e.currentTarget.style.color = 'var(--accent)'
                e.currentTarget.style.borderColor = 'var(--accent)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'var(--bg-2)'
                e.currentTarget.style.color = 'var(--text-dim)'
                e.currentTarget.style.borderColor = 'var(--border)'
              }}
            >
              {s}
            </button>
          ))}
          <button
            onClick={() => sendMessage({ text: 'Encerre com sumário e plano de ação por órgão.' })}
            style={{
              background: 'var(--bg-2)',
              border: '1px solid var(--border)',
              borderRadius: 12,
              padding: '4px 10px',
              fontSize: 10,
              color: 'var(--blue)',
              cursor: 'pointer',
              lineHeight: 1.4,
              marginLeft: 'auto',
            }}
          >
            ✓ Concluir investigação
          </button>
        </div>
      )}

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        style={{
          borderTop: '1px solid var(--border)',
          padding: '8px 12px',
          display: 'flex',
          gap: 8,
          flexShrink: 0,
          background: 'var(--bg-1)',
        }}
      >
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) handleSubmit() }}
          placeholder={isRunning ? 'Aguarde…' : isComplete ? 'Pergunte algo sobre a análise…' : 'Responda ou direcione a investigação…'}
          disabled={isRunning}
          style={{
            flex: 1,
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '6px 10px',
            fontSize: 11,
            color: 'var(--text)',
            outline: 'none',
            opacity: isRunning ? 0.5 : 1,
          }}
        />
        <button
          type="submit"
          disabled={isRunning || !input.trim()}
          style={{
            background: isRunning || !input.trim() ? 'var(--bg-2)' : 'var(--accent)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '6px 12px',
            fontSize: 10,
            fontWeight: 600,
            color: isRunning || !input.trim() ? 'var(--text-muted)' : 'var(--bg)',
            cursor: isRunning || !input.trim() ? 'default' : 'pointer',
            letterSpacing: '0.05em',
          }}
        >
          ENVIAR
        </button>
      </form>
    </aside>
  )
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === 'user'
  const parts = (message.parts ?? []) as unknown[]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
      {parts.map((part, i) => {
        const p = part as { type: string; text?: string }

        if (p.type === 'text' && p.text) {
          return (
            <div
              key={i}
              className={isUser ? undefined : 'agent-markdown'}
              style={{
                background: isUser ? 'var(--bg-4)' : 'var(--bg-1)',
                border: `1px solid ${isUser ? 'var(--border-bright)' : 'var(--border)'}`,
                borderRadius: 4,
                padding: '7px 10px',
                maxWidth: '90%',
                fontSize: 12,
                color: 'var(--text)',
                lineHeight: 1.6,
                whiteSpace: isUser ? 'pre-wrap' : undefined,
              }}
            >
              {isUser ? p.text : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {p.text}
                </ReactMarkdown>
              )}
            </div>
          )
        }

        if (isToolUIPart(part as never)) {
          return <ToolCallIndicator key={i} part={part as never} />
        }

        return null
      })}
    </div>
  )
}

function ToolCallIndicator({ part }: { part: never }) {
  const toolName = getToolName(part)
  const label = TOOL_LABELS[toolName] ?? toolName
  const typed = part as { state: string }
  const isPending = typed.state === 'input-streaming' || typed.state === 'input-available'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 8px',
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 3,
        fontSize: 10,
        color: isPending ? 'var(--text-muted)' : 'var(--accent)',
      }}
    >
      <span style={{ opacity: isPending ? 0.5 : 1 }}>↳ {label}</span>
      {isPending && (
        <div
          style={{
            width: 4,
            height: 4,
            borderRadius: '50%',
            background: 'var(--text-muted)',
            animation: 'pulse-accent 1s ease-in-out infinite',
          }}
        />
      )}
    </div>
  )
}

function FindingsSection({ findings }: { findings: AgentFindings }) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div
      style={{
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-1)',
        flexShrink: 0,
        maxHeight: collapsed ? 40 : 340,
        overflowY: collapsed ? 'hidden' : 'auto',
        transition: 'max-height 0.2s ease',
      }}
    >
      <div
        style={{
          padding: '8px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-dim)',
        }}
        onClick={() => setCollapsed(v => !v)}
      >
        <div className="label-overline" style={{ color: 'var(--blue)' }}>
          Achados e Plano de Ação
        </div>
        <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{collapsed ? '▲' : '▼'}</span>
      </div>

      {!collapsed && (
        <>
          {/* Key findings */}
          <div style={{ padding: '8px 16px' }}>
            {findings.key_findings.map((f, i) => (
              <div key={i} style={{ display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5 }}>
                <span className="mono" style={{ fontSize: 9, color: 'var(--accent)', marginTop: 2, flexShrink: 0 }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{f}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--border-dim)', paddingTop: 8 }}>
            <div className="label-overline" style={{ marginBottom: 6 }}>Ações</div>
            {findings.actions.map((a, i) => (
              <div
                key={i}
                style={{
                  background: 'var(--bg-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 3,
                  padding: '6px 10px',
                  marginBottom: 4,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                  <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{a.acao}</span>
                  <span
                    style={{
                      fontSize: 9,
                      color: URGENCY_COLOR[a.urgencia] || 'var(--text-muted)',
                      background: `${URGENCY_COLOR[a.urgencia] ?? ''}1a`,
                      padding: '1px 5px',
                      borderRadius: 2,
                      flexShrink: 0,
                      marginLeft: 6,
                    }}
                  >
                    {URGENCY_LABEL[a.urgencia] || a.urgencia}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 10, fontSize: 10, color: 'var(--text-muted)' }}>
                  <span>{a.orgao}</span>
                  <span style={{ color: 'var(--border-bright)' }}>·</span>
                  <span>{a.local}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
