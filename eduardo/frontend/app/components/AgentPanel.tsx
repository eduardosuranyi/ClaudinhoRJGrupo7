'use client'

import { useEffect, useRef } from 'react'
import type { AgentState, AgentFindings } from '../types'
import AgentCheckpoint from './AgentCheckpoint'

interface Props {
  agentState: AgentState
  onRespond: (answer: string) => void
  onAbort: () => void
}

const URGENCY_COLOR: Record<string, string> = {
  imediata: 'var(--red)',
  '7_dias':  'var(--accent)',
  '30_dias': 'var(--amber)',
}

const URGENCY_LABEL: Record<string, string> = {
  imediata: 'Imediata',
  '7_dias':  '7 dias',
  '30_dias': '30 dias',
}

export default function AgentPanel({ agentState, onRespond, onAbort }: Props) {
  const transcriptEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [agentState.transcript.length])

  const isActive = agentState.status !== 'idle'
  const isRunning = agentState.status === 'running'
  const isPaused = agentState.status === 'paused'
  const isComplete = agentState.status === 'complete'
  const isError = agentState.status === 'error'

  if (!isActive) return null

  return (
    <aside style={{
      width: 420, minWidth: 420,
      borderLeft: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      background: 'var(--bg)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'var(--bg-1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isRunning && (
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--green)',
              animation: 'pulse-accent 1.2s ease-in-out infinite',
              flexShrink: 0,
            }} />
          )}
          {isPaused && (
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--amber)',
              flexShrink: 0,
            }} />
          )}
          {isComplete && (
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--blue)',
              flexShrink: 0,
            }} />
          )}
          {isError && (
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--red)',
              flexShrink: 0,
            }} />
          )}
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', letterSpacing: '0.03em' }}>
            Investigação Agêntica
          </span>
          <span className="label-overline" style={{ fontSize: 10 }}>
            {isRunning ? 'em andamento' : isPaused ? 'aguardando resposta' : isComplete ? 'concluída' : 'erro'}
          </span>
        </div>
        <button
          onClick={onAbort}
          title={isComplete || isError ? 'Fechar' : 'Abortar investigação'}
          style={{
            background: 'none', border: 'none',
            color: 'var(--text-muted)', fontSize: 14,
            cursor: 'pointer', padding: '2px 4px',
            lineHeight: 1,
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Transcript */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {agentState.transcript.map(entry => {
          if (entry.type === 'system') {
            return (
              <div key={entry.id} style={{ marginBottom: 12 }}>
                <div className="label-overline" style={{ marginBottom: 4 }}>Inicializando</div>
                <p style={{ fontSize: 11, color: 'var(--text-dim)', margin: 0 }}>{entry.content}</p>
              </div>
            )
          }

          if (entry.type === 'tool_action') {
            return (
              <div key={entry.id} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '4px 0', marginBottom: 2,
              }}>
                <div style={{
                  width: 4, height: 4, borderRadius: '50%',
                  background: 'var(--border-bright)', flexShrink: 0,
                }} />
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{entry.content}</span>
              </div>
            )
          }

          if (entry.type === 'narrate') {
            return (
              <div key={entry.id} style={{ marginBottom: 14 }}>
                {entry.stepTitle && (
                  <div className="label-overline" style={{ marginBottom: 5, color: 'var(--accent)' }}>
                    {entry.stepTitle}
                  </div>
                )}
                <p style={{
                  fontSize: 12, color: 'var(--text)', margin: 0,
                  lineHeight: 1.65,
                  borderLeft: '2px solid var(--accent-dim)',
                  paddingLeft: 10,
                }}>
                  {entry.content}
                </p>
              </div>
            )
          }

          if (entry.type === 'checkpoint_ask' && entry.checkpoint) {
            return (
              <AgentCheckpoint
                key={entry.id}
                checkpoint={entry.checkpoint}
                onRespond={agentState.status === 'paused' ? onRespond : () => {}}
              />
            )
          }

          if (entry.type === 'checkpoint_answer') {
            return (
              <div key={entry.id} style={{
                display: 'flex', justifyContent: 'flex-end', marginBottom: 10,
              }}>
                <div style={{
                  background: 'var(--bg-4)',
                  border: '1px solid var(--border-bright)',
                  borderRadius: 3,
                  padding: '5px 10px',
                  fontSize: 11, color: 'var(--text-dim)',
                  maxWidth: '75%',
                }}>
                  {entry.content}
                </div>
              </div>
            )
          }

          if (entry.type === 'complete') {
            return (
              <div key={entry.id} style={{
                background: 'var(--blue-soft)',
                border: '1px solid var(--blue)',
                borderRadius: 4, padding: '10px 14px', marginBottom: 12,
              }}>
                <div className="label-overline" style={{ color: 'var(--blue)', marginBottom: 5 }}>
                  Investigação Concluída
                </div>
                <p style={{ fontSize: 12, color: 'var(--text)', margin: 0, lineHeight: 1.55 }}>
                  {entry.content}
                </p>
              </div>
            )
          }

          if (entry.type === 'error') {
            return (
              <div key={entry.id} style={{
                background: 'var(--red-soft)',
                border: '1px solid var(--red)',
                borderRadius: 4, padding: '8px 12px', marginBottom: 8,
              }}>
                <span style={{ fontSize: 11, color: 'var(--red)' }}>Erro: {entry.content}</span>
              </div>
            )
          }

          return null
        })}

        {/* Running indicator */}
        {isRunning && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            <div style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--green)',
              animation: 'pulse-accent 1s ease-in-out infinite',
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {agentState.thinkingDetail ?? 'analisando…'}
            </span>
          </div>
        )}

        <div ref={transcriptEndRef} />
      </div>

      {/* Findings section */}
      {isComplete && agentState.findings && (
        <FindingsSection findings={agentState.findings} />
      )}
    </aside>
  )
}

function FindingsSection({ findings }: { findings: AgentFindings }) {
  return (
    <div style={{
      borderTop: '1px solid var(--border)',
      background: 'var(--bg-1)',
      flexShrink: 0,
      maxHeight: 340,
      overflowY: 'auto',
    }}>
      {/* Key findings */}
      <div style={{ padding: '12px 16px 8px' }}>
        <div className="label-overline" style={{ marginBottom: 8 }}>Achados Principais</div>
        {findings.key_findings.map((f, i) => (
          <div key={i} style={{
            display: 'flex', gap: 7, alignItems: 'flex-start', marginBottom: 5,
          }}>
            <span className="mono" style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2, flexShrink: 0 }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>{f}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div style={{ padding: '0 16px 12px', borderTop: '1px solid var(--border-dim)', marginTop: 4, paddingTop: 10 }}>
        <div className="label-overline" style={{ marginBottom: 8 }}>Plano de Ação</div>
        {findings.actions.map((a, i) => (
          <div key={i} style={{
            background: 'var(--bg-2)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '7px 10px',
            marginBottom: 5,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500 }}>{a.acao}</span>
              <span style={{
                fontSize: 10, color: URGENCY_COLOR[a.urgencia] || 'var(--text-muted)',
                background: `${URGENCY_COLOR[a.urgencia]}1a`,
                padding: '1px 5px', borderRadius: 2,
                flexShrink: 0, marginLeft: 6,
              }}>
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
    </div>
  )
}
