'use client'

import type { Area } from '../../types'
import { fmt, faccaoColor } from '../../lib/helpers'

export default function InteligenciaTab({ area }: { area: Area }) {
  if (!area.relint_disponivel || area.relint.sections.length === 0) {
    return (
      <div style={{ padding: '12px 16px' }}>
        {area.dominio_territorial.length > 0 && <DominioSection area={area} />}
        <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
          Sem RELINT disponível para esta área.
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Domínio territorial */}
      {area.dominio_territorial.length > 0 && <DominioSection area={area} />}

      {/* RELINT sections */}
      <div>
        <div className="label-overline" style={{ marginBottom: 6 }}>
          Relatório de Inteligência
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 12 }}>
          Documento de campo da Força Municipal · {area.relint.sections.length} sub-áreas
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {area.relint.sections.map((sec, i) => (
            <SectionCard key={i} section={sec} index={i} />
          ))}
        </div>
      </div>
    </div>
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
      <div className="label-overline" style={{ marginBottom: 6 }}>
        Domínio Territorial
      </div>
      <p style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 8 }}>
        {area.dominio_territorial.length} territórios sob influência de organizações criminosas no perímetro.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {Object.entries(groups).map(([faccao, nomes]) => (
          <div key={faccao} style={{
            background: 'var(--bg-1)',
            border: `1px solid ${faccaoColor(faccao)}`,
            borderRadius: 2,
            padding: '6px 10px',
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

function SectionCard({ section, index }: { section: any; index: number }) {
  // Highlight keywords
  const keywords = [
    'receptação', 'fuga', 'modus', 'motocicleta', 'a pé', 'arma', 'pico',
    'noturno', 'transeunte', 'celular', 'ambulante', 'PSR', 'iluminação',
  ]
  let texto = section.texto || ''

  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderLeft: '2px solid var(--accent)',
      borderRadius: 2,
      padding: '10px 12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>
          §{String(index + 1).padStart(2, '0')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, letterSpacing: '0.02em' }}>
          {section.titulo}
        </span>
      </div>
      <p style={{
        fontSize: 11.5, color: 'var(--text)', lineHeight: 1.6, margin: 0,
        whiteSpace: 'pre-wrap',
      }}>
        {texto.length > 800 ? texto.slice(0, 800) + '…' : texto}
      </p>
    </div>
  )
}
