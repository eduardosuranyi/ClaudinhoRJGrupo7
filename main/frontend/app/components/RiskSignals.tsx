'use client'

import { useMemo } from 'react'
import type { Area } from '../types'
import { fmt } from '../lib/helpers'

interface Props {
  area: Area
  allAreas: Area[]
}

type SignalLevel = 'red' | 'amber'

interface Signal {
  level: SignalLevel
  label: string
  explanation: string
}

function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

/**
 * Displays automated risk signal warnings for a CompStat crime analysis area.
 */
export default function RiskSignals({ area, allAreas }: Props) {
  const signals = useMemo(() => {
    const result: Signal[] = []
    const crimesMedian = median(allAreas.map(a => a.stats.crimes_total))

    if (area.stats.crimes_total > crimesMedian) {
      result.push({
        level: 'red',
        label: 'ALTO VOLUME CRIMINAL',
        explanation: `${fmt(area.stats.crimes_total)} ocorrências — acima da mediana de ${fmt(Math.round(crimesMedian))} entre as áreas monitoradas.`,
      })
    }

    if (area.stats.cameras_total === 0) {
      result.push({
        level: 'red',
        label: 'SEM CÂMERAS',
        explanation: 'Nenhuma câmera CIVITAS registrada nesta área.',
      })
    }

    if (area.stats.pct_noturno > 60) {
      result.push({
        level: 'amber',
        label: 'ALTO ÍNDICE NOTURNO',
        explanation: `${area.stats.pct_noturno}% das ocorrências ocorrem entre 22h e 5h — priorizar patrulhamento noturno.`,
      })
    }

    if (area.dominio_territorial.length > 5) {
      result.push({
        level: 'red',
        label: 'PROXIMIDADE ORCRIM',
        explanation: `${area.dominio_territorial.length} fragmentos de domínio territorial identificados — alta densidade de facções.`,
      })
    }

    if (!area.relint_disponivel) {
      result.push({
        level: 'amber',
        label: 'SEM RELINT',
        explanation: 'Informações de inteligência não disponíveis para esta área — lacuna de dados.',
      })
    }

    const top3Fatores = [...allAreas]
      .sort((a, b) => b.stats.fatores_urbanos_total - a.stats.fatores_urbanos_total)
      .slice(0, 3)
      .some(a => a.id === area.id)

    if (top3Fatores) {
      result.push({
        level: 'amber',
        label: 'ALTA DENSIDADE DE FATORES',
        explanation: `${fmt(area.stats.fatores_urbanos_total)} fatores urbanos pendentes — entre os 3 maiores do sistema.`,
      })
    }

    if (area.n_triple_bingo > 3) {
      result.push({
        level: 'red',
        label: 'TRIPLE BINGO ELEVADO',
        explanation: `${fmt(area.n_triple_bingo)} trechos com coincidência de crime, fatores e sinais — alta convergência de riscos.`,
      })
    }

    if (area.camera_gaps.gaps.length > 3) {
      result.push({
        level: 'amber',
        label: 'PONTOS CEGOS DE CÂMERA',
        explanation: `${fmt(area.camera_gaps.gaps.length)} pontos sem cobertura identificados — lacunas na rede de vigilância.`,
      })
    }

    return result
  }, [area, allAreas])

  const levelColor = (level: SignalLevel) => level === 'red' ? 'var(--red)' : 'var(--amber)'

  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderRadius: 2,
      padding: '12px 14px',
    }}>
      <div className="label-overline" style={{ marginBottom: 10, color: 'var(--accent)' }}>
        Sinais de Risco
      </div>

      {signals.length === 0 ? (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 10px',
          background: 'var(--green-soft)',
          border: '1px solid var(--green)',
          borderRadius: 2,
        }}>
          <span style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: 'var(--green)',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>
            Nenhum sinal de risco detectado
          </span>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {signals.map(signal => (
            <div key={signal.label} style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '8px 10px',
              background: signal.level === 'red' ? 'var(--red-soft)' : 'var(--amber-soft)',
              border: `1px solid ${levelColor(signal.level)}`,
              borderRadius: 2,
            }}>
              <span style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: levelColor(signal.level),
                flexShrink: 0,
                marginTop: 3,
              }} />
              <div>
                <div style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: levelColor(signal.level),
                  marginBottom: 2,
                }}>
                  {signal.label}
                </div>
                <div style={{ fontSize: 10, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                  {signal.explanation}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
