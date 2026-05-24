'use client'

import type { AgentCheckpointData } from '../types'

interface Props {
  checkpoint: AgentCheckpointData
  onRespond: (answer: string) => void
}

export default function AgentCheckpoint({ checkpoint, onRespond }: Props) {
  return (
    <div style={{
      background: 'var(--bg-3)',
      border: '1px solid var(--amber)',
      borderRadius: 4,
      padding: '14px 16px',
      margin: '8px 0',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--amber)',
          animation: 'pulse-accent 1.4s ease-in-out infinite',
          flexShrink: 0,
        }} />
        <span className="label-overline" style={{ color: 'var(--amber)', letterSpacing: '0.1em' }}>
          Checkpoint
        </span>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text)', margin: '0 0 4px', lineHeight: 1.5, fontWeight: 500 }}>
        {checkpoint.question}
      </p>

      {checkpoint.reasoning && (
        <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: '0 0 12px', fontStyle: 'italic' }}>
          {checkpoint.reasoning}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checkpoint.options.map((opt, i) => (
          <button
            key={i}
            onClick={() => onRespond(opt)}
            style={{
              background: 'var(--bg-4)',
              border: '1px solid var(--border)',
              borderRadius: 3,
              padding: '7px 12px',
              color: 'var(--text-dim)',
              fontSize: 11,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'border-color 0.12s, color 0.12s, background 0.12s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--amber)'
              e.currentTarget.style.color = 'var(--text)'
              e.currentTarget.style.background = 'var(--amber-soft)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-dim)'
              e.currentTarget.style.background = 'var(--bg-4)'
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}
