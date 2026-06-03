'use client'

import { useMemo } from 'react'
import type { Area } from '../../types'
import { calcularEscala, NIVEL_RISCO_CONFIG, MODAL_CONFIG } from '../../lib/allocation'
import { fmt } from '../../lib/helpers'

interface Props {
  area: Area
  weights: { mancha: number; pico: number; fatores: number; dinamica: number }
  allAreas: Area[]
}

export default function EscalaTab({ area, weights, allAreas }: Props) {
  const todas = useMemo(() => calcularEscala(allAreas, weights), [allAreas, weights])
  const escala = todas.find(e => e.area_id === area.id)
  if (!escala) return null

  const nrc = NIVEL_RISCO_CONFIG[escala.nivel_risco]

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Header operacional */}
      <div style={{
        background: 'var(--bg-1)', border: '1px solid var(--border)',
        borderTop: `3px solid ${nrc.color}`,
        borderRadius: 2, padding: '12px 14px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div className="label-overline" style={{ color: nrc.color, marginBottom: 4 }}>
              Escala Operacional — Nível {nrc.label}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span className="mono tnum" style={{ fontSize: 36, color: 'var(--text)', fontWeight: 600, lineHeight: 1 }}>
                {escala.agentes_por_turno}
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                agentes por turno
              </span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Efetivo total designado: <span className="mono tnum" style={{ color: 'var(--text-dim)' }}>{escala.agentes_total}</span>
              {' · '}
              <span style={{ color: 'var(--amber)' }}>escala 12×36</span>
              {' · '}
              {escala.pct_do_contingente}% dos 600 da GM-Rio
            </div>
          </div>

          <div style={{ textAlign: 'right' }}>
            <div className="label-overline" style={{ marginBottom: 3 }}>Turno prioritário</div>
            <div className="mono" style={{ fontSize: 16, color: 'var(--amber)', fontWeight: 600 }}>
              {escala.turno_prioritario}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
              Janela: {escala.janela_horaria}
            </div>
          </div>
        </div>

        {/* Dias críticos */}
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          {['Segunda','Terca','Quarta','Quinta','Sexta','Sabado','Domingo'].map(d => {
            const critico = escala.dias_criticos.includes(d)
            const short = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][['Segunda','Terca','Quarta','Quinta','Sexta','Sabado','Domingo'].indexOf(d)]
            return (
              <div key={d} style={{
                flex: 1, textAlign: 'center', padding: '4px 2px', borderRadius: 2,
                background: critico ? nrc.bg : 'var(--bg-3)',
                border: `1px solid ${critico ? nrc.color : 'var(--border-dim)'}`,
              }}>
                <span style={{ fontSize: 10, color: critico ? nrc.color : 'var(--text-muted)', fontWeight: critico ? 700 : 400 }}>
                  {short}
                </span>
              </div>
            )
          })}
        </div>

        {escala.alerta_psr && (
          <div style={{
            marginTop: 8, padding: '5px 8px',
            background: 'rgba(168,85,247,0.08)', border: '1px solid rgba(168,85,247,0.3)',
            borderRadius: 2, fontSize: 10, color: '#a855f7',
          }}>
            ⚠ PSR elevada ({fmt(area.stats.psr_total)}) — incluir agentes de abordagem social na escala
          </div>
        )}
      </div>

      {/* Distribuição por modalidade */}
      <div>
        <div className="label-overline" style={{ marginBottom: 8 }}>Composição do Efetivo</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {escala.modalidades.map(m => {
            const cfg = MODAL_CONFIG[m.tipo]
            return (
              <div key={m.tipo} style={{
                background: 'var(--bg-1)', border: '1px solid var(--border)',
                borderLeft: `3px solid ${cfg.cor}`, borderRadius: 2,
                padding: '8px 12px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13 }}>{cfg.emoji}</span>
                    <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>{m.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                    <span className="mono tnum" style={{ fontSize: 18, color: cfg.cor, fontWeight: 600 }}>
                      {m.agentes}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>agentes ({m.pct}%)</span>
                  </div>
                </div>
                {/* Barra de proporção */}
                <div style={{ height: 2, background: 'var(--bg-3)', marginBottom: 6, borderRadius: 1 }}>
                  <div style={{ height: '100%', width: `${m.pct}%`, background: cfg.cor, borderRadius: 1 }} />
                </div>
                <p style={{ fontSize: 10, color: 'var(--text-dim)', margin: 0, fontStyle: 'italic' }}>
                  {m.justificativa}
                </p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Posicionamentos */}
      <div>
        <div className="label-overline" style={{ marginBottom: 8 }}>Posicionamento por Trecho</div>
        <div style={{
          background: 'var(--bg-1)', border: '1px solid var(--border)',
          borderRadius: 2, overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '18px 1fr 44px 70px 90px',
            padding: '6px 12px', borderBottom: '1px solid var(--border-dim)',
            gap: 8,
          }}>
            {['#','Trecho','Ag.','Modal.','Turno'].map(h => (
              <span key={h} className="label-overline" style={{ fontSize: 10 }}>{h}</span>
            ))}
          </div>

          {escala.posicionamentos.map((pos) => {
            const cfg = MODAL_CONFIG[pos.modalidade]
            return (
              <div key={pos.rank} style={{
                display: 'grid', gridTemplateColumns: '18px 1fr 44px 70px 90px',
                padding: '8px 12px', gap: 8, alignItems: 'flex-start',
                borderBottom: '1px solid var(--border-dim)',
              }}>
                <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)', paddingTop: 1 }}>
                  {String(pos.rank).padStart(2,'0')}
                </span>

                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 500, textTransform: 'capitalize', lineHeight: 1.3, marginBottom: 2 }}>
                    {pos.trecho.toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                    Foco: {pos.foco}
                  </div>
                </div>

                <div className="mono tnum" style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600, paddingTop: 2 }}>
                  {pos.agentes}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4, paddingTop: 2 }}>
                  <span style={{ fontSize: 11 }}>{cfg.emoji}</span>
                  <span style={{ fontSize: 10, color: cfg.cor }}>{pos.modalidade}</span>
                </div>

                <div className="mono" style={{ fontSize: 10, color: 'var(--amber)', paddingTop: 3 }}>
                  {pos.turno}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Contexto entre áreas */}
      <div>
        <div className="label-overline" style={{ marginBottom: 8 }}>Distribuição por Turno (todas as áreas)</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {todas.map(e => {
            const isThis = e.area_id === area.id
            const nrc2 = NIVEL_RISCO_CONFIG[e.nivel_risco]
            return (
              <div key={e.area_id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '5px 8px',
                background: isThis ? 'var(--bg-3)' : 'transparent',
                border: isThis ? '1px solid var(--border)' : '1px solid transparent',
                borderRadius: 2,
              }}>
                <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 20 }}>
                  {String(todas.indexOf(e)+1).padStart(2,'0')}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    height: 4, background: 'var(--bg-3)', borderRadius: 2, overflow: 'hidden',
                    marginBottom: 2,
                  }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${e.pct_do_contingente}%`,
                      background: nrc2.color,
                    }} />
                  </div>
                  <span style={{
                    fontSize: 10, color: isThis ? 'var(--text)' : 'var(--text-dim)',
                    fontWeight: isThis ? 500 : 400,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    display: 'block', maxWidth: 180,
                  }}>
                    {e.area_nome.split(' - ')[0]}
                  </span>
                </div>
                <span className="mono tnum" style={{ fontSize: 12, color: isThis ? nrc2.color : 'var(--text-dim)', fontWeight: 600, minWidth: 28, textAlign: 'right' }}>
                  {e.agentes_por_turno}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 36, textAlign: 'right' }}>
                  /turno
                </span>
              </div>
            )
          })}
          <div style={{ padding: '5px 8px', borderTop: '1px solid var(--border-dim)', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>Efetivo simultâneo (escala 12×36)</span>
            <span className="mono tnum" style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600 }}>
              {todas.reduce((s, e) => s + e.agentes_por_turno, 0)} / 150
            </span>
          </div>
        </div>
      </div>

    </div>
  )
}
