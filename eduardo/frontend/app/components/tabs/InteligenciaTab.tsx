'use client'

import { useState } from 'react'
import type { Area } from '../../types'
import { faccaoColor } from '../../lib/helpers'

export default function InteligenciaTab({ area, allAreas }: { area: Area; allAreas: Area[] }) {
  const [loading, setLoading] = useState(false)

  async function gerarRelint() {
    setLoading(true)
    try {
      const res = await fetch('/api/relint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, allAreas }),
      })
      if (!res.ok) { const e = await res.json(); alert(e.error || 'Erro'); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RELINT_${area.nome.slice(0,30).replace(/[^a-zA-Z0-9]/g,'_')}.docx`
      a.click()
    } catch { alert('Erro de conexão.') }
    finally { setLoading(false) }
  }

  if (!area.relint_disponivel || area.relint.sections.length === 0) {
    return (
      <div style={{ padding: '12px 16px' }}>
        {area.dominio_territorial.length > 0 && <DominioSection area={area} />}
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Sem RELINT de origem para esta área.
        </div>
        <GerarBtn loading={loading} onClick={gerarRelint} />
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {area.dominio_territorial.length > 0 && <DominioSection area={area} />}

      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="label-overline">Relatório de Inteligência</div>
          <GerarBtn loading={loading} onClick={gerarRelint} />
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
          Documento de campo · {area.relint.sections.length} sub-áreas
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {area.relint.sections.map((sec, i) => (
            <div key={i} style={{
              background: 'var(--bg-1)', border: '1px solid var(--border)',
              borderLeft: '2px solid var(--accent)', borderRadius: 2, padding: '10px 12px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                  §{String(i + 1).padStart(2,'0')}
                </span>
                <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                  {sec.titulo}
                </span>
              </div>
              <p style={{ fontSize: 11.5, color: 'var(--text)', lineHeight: 1.6, margin: 0, whiteSpace: 'pre-wrap' }}>
                {sec.texto.length > 800 ? sec.texto.slice(0, 800) + '…' : sec.texto}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GerarBtn({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={loading} style={{
      padding: '6px 14px',
      background: loading ? 'var(--bg-3)' : 'var(--accent-soft)',
      border: loading ? '1px solid var(--border)' : '1px solid var(--accent)',
      color: loading ? 'var(--text-muted)' : 'var(--accent)',
      fontSize: 11, fontWeight: 600, borderRadius: 2,
      cursor: loading ? 'wait' : 'pointer',
      display: 'flex', alignItems: 'center', gap: 6,
    }}>
      {loading ? (
        <>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse-accent 1s ease-in-out infinite', display: 'inline-block' }} />
          Gerando RELINT…
        </>
      ) : '↓ Gerar RELINT (.docx)'}
    </button>
  )
}

function DominioSection({ area }: { area: Area }) {
  const groups: Record<string, string[]> = {}
  area.dominio_territorial.forEach(d => {
    if (!groups[d.faccao]) groups[d.faccao] = []
    groups[d.faccao].push(d.nome)
  })

  return (
    <div>
      <div className="label-overline" style={{ marginBottom: 6 }}>Domínio Territorial</div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
        {area.dominio_territorial.length} territórios sob influência de organizações criminosas no perímetro.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(groups).map(([faccao, nomes]) => (
          <div key={faccao} style={{
            background: 'var(--bg-1)', border: `1px solid ${faccaoColor(faccao)}`,
            borderRadius: 2, padding: '6px 10px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
              <span style={{ fontSize: 12, color: faccaoColor(faccao), fontWeight: 600 }}>{faccao}</span>
              <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                {nomes.length} {nomes.length === 1 ? 'território' : 'territórios'}
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              {nomes.slice(0, 4).join(' · ')}{nomes.length > 4 && ` +${nomes.length - 4}`}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
