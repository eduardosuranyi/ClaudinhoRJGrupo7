'use client'

import { useState, useRef } from 'react'
import type { AgentCheckpointData } from '../types'

interface Props {
  checkpoint: AgentCheckpointData
  onRespond: (answer: string) => void
}

export default function AgentCheckpoint({ checkpoint, onRespond }: Props) {
  const [freeText, setFreeText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  function submitFreeText() {
    const text = freeText.trim()
    if (!text) return
    onRespond(text)
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') submitFreeText()
  }

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

      {/* Predefined options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
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

      {/* Free-text input */}
      <div style={{
        borderTop: '1px solid var(--border-dim)',
        paddingTop: 10,
        display: 'flex',
        gap: 6,
      }}>
        <input
          ref={inputRef}
          type="text"
          value={freeText}
          onChange={e => setFreeText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ou faça sua própria pergunta…"
          style={{
            flex: 1,
            background: 'var(--bg-4)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '6px 10px',
            color: 'var(--text)',
            fontSize: 11,
            outline: 'none',
            transition: 'border-color 0.12s',
          }}
          onFocus={e => { e.currentTarget.style.borderColor = 'var(--amber)' }}
          onBlur={e => { e.currentTarget.style.borderColor = 'var(--border)' }}
        />
        <button
          onClick={submitFreeText}
          disabled={!freeText.trim()}
          style={{
            background: freeText.trim() ? 'var(--amber)' : 'var(--bg-4)',
            border: '1px solid var(--border)',
            borderRadius: 3,
            padding: '6px 12px',
            color: freeText.trim() ? 'var(--bg)' : 'var(--text-muted)',
            fontSize: 11,
            cursor: freeText.trim() ? 'pointer' : 'default',
            fontWeight: 500,
            transition: 'background 0.12s, color 0.12s',
            flexShrink: 0,
          }}
        >
          Enviar
        </button>
      </div>
    </div>
  )
}
