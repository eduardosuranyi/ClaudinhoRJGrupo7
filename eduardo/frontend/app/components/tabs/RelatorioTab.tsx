'use client'

import { useEffect, useState } from 'react'
import type { Area } from '../../types'
import { fmt, ORGAO_EMAIL } from '../../lib/helpers'

interface Acao {
  prioridade: number
  urgencia: 'imediata' | '7_dias' | '30_dias'
  orgao: string
  tipo_recurso: string
  acao: string
  local: string
  evidencia: string
  prazo: string
}

interface ActionPlan {
  dinamica: string
  acoes: Acao[]
}

const URGENCIA_CONFIG = {
  imediata: { label: 'Imediata',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)'  },
  '7_dias': { label: '7 dias',   color: '#fbb040', bg: 'rgba(251,176,64,0.1)' },
  '30_dias':{ label: '30 dias',  color: '#4a90e2', bg: 'rgba(74,144,226,0.1)' },
}

const ORGAO_COLOR: Record<string, string> = {
  'GM-Rio':      '#ff6b35',
  'RioLuz':      '#fbb040',
  'Comlurb':     '#36c476',
  'SEOP':        '#a855f7',
  'SECONSERVA':  '#4a90e2',
  'SMAS':        '#ef4444',
  'CET-Rio':     '#ff8c42',
  'SMTR':        '#64b6f7',
}

const RECURSO_LABEL: Record<string, string> = {
  patrulha_moto:     'Patrulha moto',
  patrulha_pe:       'Patrulha a pé',
  viatura:           'Viatura',
  iluminacao:        'Iluminação',
  limpeza:           'Limpeza',
  ordenamento:       'Ordenamento',
  assistencia_social:'Assist. Social',
  manutencao_via:    'Manutenção via',
  transporte:        'Transporte',
}

export default function RelatorioTab({ area }: { area: Area }) {
  const [plan, setPlan] = useState<ActionPlan | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingReport, setLoadingReport] = useState(false)
  const [error, setError] = useState('')
  const [dispatched, setDispatched] = useState<Set<number>>(new Set())

  useEffect(() => {
    if (!plan && !loading) loadPlan()
  }, [area.id])

  async function loadPlan() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: area.nome,
          relint: area.relint.full_text,
          stats: area.stats,
          top_trechos: area.top_trechos.slice(0, 5),
          fatores: area.fatores_por_orgao,
          relatos: area.relatos_sample.slice(0, 5),
          chamados_1746: area.chamados_1746,
          validacao_cruzada: area.validacao_cruzada,
        }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setPlan(d)
    } catch (e: any) {
      setError(e.message || 'Erro ao gerar plano.')
    }
    setLoading(false)
  }

  function despachar(acao: Acao, idx: number) {
    const email = ORGAO_EMAIL[acao.orgao] || 'gabinete.rio@rio.rj.gov.br'
    const subject = encodeURIComponent(
      `[CompStat] Acao ${acao.urgencia === 'imediata' ? 'URGENTE' : 'prioritaria'} - ${area.nome.split(' - ')[0]}`
    )
    const body = encodeURIComponent(
`Prezados,

O CompStat Municipal identifica acao prioritaria para ${acao.orgao} na area "${area.nome}".

ACAO: ${acao.acao}
LOCAL: ${acao.local}
URGENCIA: ${URGENCIA_CONFIG[acao.urgencia]?.label || acao.urgencia}
PRAZO: ${acao.prazo}

JUSTIFICATIVA:
${acao.evidencia}

CONTEXTO DA AREA:
Score de risco: ${area.score.total.toFixed(0)}/100
Ocorrencias (2020-2024): ${fmt(area.stats.crimes_total)}
Pico horario: ${area.stats.pico_horario} (${area.stats.pct_noturno}% noturno)

TOP TRECHOS:
${area.top_trechos.slice(0, 3).map((t, i) => `${i+1}. ${t.locf_norm} - ${t.total} ocorrencias`).join('\n')}

Solicitamos confirmacao de recebimento e previsao de execucao ate a proxima reuniao CompStat.

Atenciosamente,
Coordenadoria do CompStat Municipal
Prefeitura do Rio de Janeiro`)
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`
    setDispatched(prev => new Set(prev).add(idx))
  }

  async function exportDocx() {
    setLoadingReport(true)
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area, synthesis: plan?.dinamica || '' }),
      })
      if (!res.ok) throw new Error('failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `CompStat_${area.nome.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')}.docx`
      a.click()
    } catch { alert('Erro ao gerar relatorio.') }
    setLoadingReport(false)
  }

  return (
    <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div className="label-overline" style={{ color: 'var(--accent)' }}>Plano de Acao CompStat</div>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '2px 0 0' }}>
            Gerado por IA com base nos dados da area
          </p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={loadPlan} disabled={loading} style={ghostBtn}>
            {loading ? '...' : 'Regen'}
          </button>
          <button onClick={exportDocx} disabled={loadingReport} style={accentBtn}>
            {loadingReport ? 'Gerando…' : 'Exportar .docx'}
          </button>
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ padding: '28px 0', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse-accent 1s ease-in-out infinite',
            }} />
            <span className="mono" style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Analisando dados e gerando plano de acao…
            </span>
          </div>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div style={{ padding: '10px 12px', background: 'var(--red-soft)', border: '1px solid var(--red)', borderRadius: 2 }}>
          <p style={{ fontSize: 11, color: 'var(--red)', margin: 0 }}>{error}</p>
          <p style={{ fontSize: 10, color: 'var(--text-muted)', margin: '4px 0 0' }}>
            Verifique ANTHROPIC_API_KEY em .env.local
          </p>
        </div>
      )}

      {plan && !loading && (
        <>
          {/* Dinamica criminal */}
          <div style={{
            background: 'var(--bg-1)',
            border: '1px solid var(--border)',
            borderLeft: '2px solid var(--accent)',
            borderRadius: 2,
            padding: '10px 12px',
          }}>
            <div className="label-overline" style={{ marginBottom: 5 }}>Dinamica Criminal</div>
            <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.65, margin: 0 }}>
              {plan.dinamica}
            </p>
          </div>

          {/* Summary */}
          <div style={{ display: 'flex', gap: 6 }}>
            {(['imediata','7_dias','30_dias'] as const).map(u => {
              const count = plan.acoes.filter(a => a.urgencia === u).length
              if (!count) return null
              const cfg = URGENCIA_CONFIG[u]
              return (
                <div key={u} style={{
                  flex: 1, padding: '8px 10px', borderRadius: 2, textAlign: 'center',
                  background: cfg.bg, border: `1px solid ${cfg.color}`,
                }}>
                  <div className="mono tnum" style={{ fontSize: 20, color: cfg.color, fontWeight: 600, lineHeight: 1 }}>{count}</div>
                  <div style={{ fontSize: 9, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>{cfg.label}</div>
                </div>
              )
            })}
            <div style={{ flex: 1, padding: '8px 10px', borderRadius: 2, textAlign: 'center', background: 'var(--bg-2)', border: '1px solid var(--border)' }}>
              <div className="mono tnum" style={{ fontSize: 20, color: 'var(--text)', fontWeight: 600, lineHeight: 1 }}>{plan.acoes.length}</div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 3 }}>Total</div>
            </div>
          </div>

          {/* Acoes */}
          <div>
            <div className="label-overline" style={{ marginBottom: 8 }}>Acoes Priorizadas</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {plan.acoes.map((acao, i) => (
                <AcaoCard
                  key={i}
                  acao={acao}
                  idx={i}
                  dispatched={dispatched.has(i)}
                  onDespachar={() => despachar(acao, i)}
                />
              ))}
            </div>
          </div>
        </>
      )}

      {/* In-browser analytical report */}
      <div style={{
        borderTop: '1px solid var(--border)',
        paddingTop: 14,
        marginTop: 14,
      }}>
        <div className="label-overline" style={{ marginBottom: 8, color: 'var(--text-muted)' }}>
          Relatório Analítico Completo
        </div>
        <AnalyticalReport area={area} dinamica={plan?.dinamica} />
      </div>
    </div>
  )
}

function AcaoCard({ acao, idx, dispatched, onDespachar }: {
  acao: Acao; idx: number; dispatched: boolean; onDespachar: () => void
}) {
  const [expanded, setExpanded] = useState(idx === 0)
  const urg = URGENCIA_CONFIG[acao.urgencia] || URGENCIA_CONFIG['7_dias']
  const orgColor = ORGAO_COLOR[acao.orgao] || '#888'

  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      borderLeft: `3px solid ${orgColor}`,
      borderRadius: 2,
      overflow: 'hidden',
    }}>
      <div onClick={() => setExpanded(e => !e)} style={{
        display: 'grid',
        gridTemplateColumns: '18px auto 1fr auto auto',
        gap: 8, padding: '9px 10px',
        alignItems: 'center', cursor: 'pointer',
      }}>
        <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
          {acao.prioridade}
        </span>
        <div style={{ padding: '2px 7px', background: `${orgColor}18`, border: `1px solid ${orgColor}55`, borderRadius: 2, whiteSpace: 'nowrap' }}>
          <span className="mono" style={{ fontSize: 9, color: orgColor, fontWeight: 600 }}>{acao.orgao}</span>
        </div>
        <span style={{ fontSize: 11.5, color: 'var(--text)', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {acao.acao}
        </span>
        <div style={{ padding: '2px 7px', background: urg.bg, border: `1px solid ${urg.color}`, borderRadius: 2, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 9, color: urg.color, fontWeight: 600 }}>{urg.label}</span>
        </div>
        <span style={{ fontSize: 9, color: 'var(--text-muted)', transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>▾</span>
      </div>

      {expanded && (
        <div style={{ borderTop: '1px solid var(--border-dim)', padding: '10px 10px 12px 40px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>
            <span style={{ color: 'var(--text-muted)' }}>{RECURSO_LABEL[acao.tipo_recurso] || acao.tipo_recurso}</span>
            <span style={{ color: 'var(--border-bright)', margin: '0 8px' }}>·</span>
            <span style={{ color: 'var(--amber)' }}>Prazo: {acao.prazo}</span>
          </div>
          <Row label="LOCAL" value={acao.local} />
          <Row label="DADOS" value={acao.evidencia} dim />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={e => { e.stopPropagation(); onDespachar() }} style={{
              padding: '6px 14px',
              background: dispatched ? 'var(--bg-3)' : `${orgColor}18`,
              border: dispatched ? '1px solid var(--border)' : `1px solid ${orgColor}`,
              color: dispatched ? 'var(--text-muted)' : orgColor,
              fontSize: 11, fontWeight: 600, borderRadius: 2, cursor: 'pointer',
            }}>
              {dispatched ? '✓ Despachado' : `Despachar para ${acao.orgao} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Row({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 9, color: 'var(--text-muted)', minWidth: 40, paddingTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</span>
      <span style={{ fontSize: 11, color: dim ? 'var(--text-dim)' : 'var(--text)', fontStyle: dim ? 'italic' : 'normal', lineHeight: 1.5 }}>{value}</span>
    </div>
  )
}

function AnalyticalReport({ area, dinamica }: { area: Area; dinamica?: string }) {
  function buildMarkdown(): string {
    const lines: string[] = []
    lines.push(`# RELATÓRIO ANALÍTICO — ${area.nome}`)
    lines.push(`**Período:** 2020–2024 · Gerado automaticamente\n`)
    lines.push('---\n')

    lines.push('## 1. Identificação da Área\n')
    lines.push(`| Campo | Valor |`)
    lines.push(`|-------|-------|`)
    lines.push(`| AISP | ${area.identificacao.aisp ?? '—'} |`)
    lines.push(`| Base FM | ${area.identificacao.base_fm} |`)
    lines.push(`| Subprefeitura | ${area.identificacao.subprefeitura} |`)
    lines.push(`| Domínio principal | ${area.identificacao.dominio_principal} |\n`)

    lines.push('## 2. Indicadores do Período\n')
    lines.push(`- **Ocorrências (ISP-RJ 2020-2024):** ${fmt(area.stats.crimes_total)}`)
    lines.push(`- **Pico horário:** ${area.stats.pico_horario}`)
    lines.push(`- **% Noturno:** ${area.stats.pct_noturno}%`)
    lines.push(`- **Denúncias Disque Denúncia (crime anônimo):** ${fmt(area.stats.denuncias_total)}`)
    lines.push(`- **Fatores urbanos (observação de campo):** ${fmt(area.stats.fatores_urbanos_total)}`)
    if (area.chamados_1746) {
      lines.push(`- **Chamados 1746 (demanda cidadã 2020-2024):** ${fmt(area.chamados_1746.total)} (${area.chamados_1746.pct_atendido}% atendidos, ${area.chamados_1746.pct_vencido}% vencidos)`)
    }
    lines.push(`- **Câmeras:** ${fmt(area.stats.cameras_total)}`)
    lines.push(`- **Pop. situação de rua:** ${fmt(area.stats.psr_total)}`)
    lines.push(`- **Score de risco:** ${area.score.total.toFixed(1)}/100\n`)

    lines.push('## 3. Distribuição por Tipo\n')
    for (const [tipo, n] of Object.entries(area.stats.crimes_por_tipo).sort(([,a],[,b]) => b - a)) {
      const pct = Math.round(n / Math.max(area.stats.crimes_total, 1) * 100)
      lines.push(`- ${tipo}: ${fmt(n)} (${pct}%)`)
    }
    lines.push('')

    lines.push('## 4. Análise Temporal\n')
    lines.push(`- **Dia de pico:** ${Object.entries(area.stats.dia_distribution).sort(([,a],[,b]) => b - a)[0]?.[0] ?? '—'}`)
    lines.push(`- **Hora de pico:** ${area.stats.pico_horario}\n`)

    lines.push('## 5. Trechos Críticos\n')
    for (const t of area.top_trechos.slice(0, 10)) {
      const bingo = t.bingo_count ? ` · BINGO ${t.bingo_count}/3` : ''
      lines.push(`**${t.locf_norm}** — ${fmt(t.total)} ocorrências${bingo}`)
    }
    lines.push('')

    lines.push('## 6. Coincidências (Bingo)\n')
    lines.push(`- Trechos com 2+ camadas: ${area.n_bingo_trechos}`)
    lines.push(`- Trechos com 3/3 camadas: ${area.n_triple_bingo}\n`)

    lines.push('## 7. Demandas por Órgão (validação cruzada)\n')
    lines.push('> Fatores Urbanos = observação de campo pela equipe FM (diagnóstico qualitativo)')
    lines.push('> Chamados 1746 = reclamações da população na Central de Atendimento (demanda quantitativa)')
    lines.push('> Disque Denúncia = denúncias anônimas sobre CRIME (fonte separada, NÃO é infraestrutura)\n')
    if (area.validacao_cruzada && area.validacao_cruzada.length > 0) {
      lines.push('| Órgão | Campo (fatores) | Cidadão (1746) | % Atendidos | Vencidos | Validado |')
      lines.push('|-------|-----------------|----------------|-------------|----------|----------|')
      for (const v of area.validacao_cruzada) {
        const pctAt = v.chamados_1746 > 0 ? Math.round(v.chamados_atendidos / v.chamados_1746 * 100) : 0
        lines.push(`| ${v.orgao} | ${fmt(v.fatores_campo)} | ${fmt(v.chamados_1746)} | ${pctAt}% | ${fmt(v.chamados_vencidos)} | ${v.validado ? 'Sim' : '—'} |`)
      }
    } else {
      for (const org of area.fatores_por_orgao) {
        lines.push(`**${org.orgao}** — ${fmt(org.total)} registros de campo`)
        for (const t of org.tipos.slice(0, 3)) {
          lines.push(`  - ${t.tipo}: ${t.count}`)
        }
      }
    }
    lines.push('')

    if (dinamica) {
      lines.push('## 8. Dinâmica Criminal (IA)\n')
      lines.push(dinamica + '\n')
    }

    lines.push('## 9. Câmeras e Pontos Cegos\n')
    lines.push(`- Câmeras: ${area.camera_gaps.n_cameras}`)
    lines.push(`- Raio de cobertura: ${area.camera_gaps.coverage_radius_m}m`)
    lines.push(`- Pontos cegos: ${area.camera_gaps.gaps.length}\n`)
    for (const g of area.camera_gaps.gaps.slice(0, 5)) {
      lines.push(`- **#${g.rank}** [${g.recommendation.toUpperCase()}] ${g.justification}`)
    }

    return lines.join('\n')
  }

  const md = buildMarkdown()

  function downloadFile(content: string, filename: string, mime: string) {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const slug = area.nome.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_')

  return (
    <div>
      <div style={{
        background: 'var(--bg-2)',
        border: '1px solid var(--border)',
        borderRadius: 2,
        padding: '10px 12px',
        maxHeight: 300,
        overflowY: 'auto',
        fontSize: 11,
        color: 'var(--text-dim)',
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        fontFamily: 'monospace',
      }}>
        {md}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={() => downloadFile(md, `relatorio_${slug}.md`, 'text/markdown')} style={dlBtn}>
          Baixar .md
        </button>
        <button onClick={() => {
          const html = `<html><head><meta charset="utf-8"><style>body{font-family:sans-serif;max-width:900px;margin:auto;padding:24px;line-height:1.6;background:#0a0a0f;color:#f0f0f3}h1,h2{color:#ff6b35}table{border-collapse:collapse;width:100%}th,td{border:1px solid #2a2a35;padding:8px;text-align:left}</style></head><body>${md.replace(/\n/g, '<br>')}</body></html>`
          downloadFile(html, `relatorio_${slug}.html`, 'text/html')
        }} style={dlBtn}>
          Baixar .html
        </button>
      </div>
    </div>
  )
}

const dlBtn: React.CSSProperties = { padding: '5px 10px', background: 'var(--bg-3)', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 10, cursor: 'pointer', borderRadius: 2 }
const ghostBtn: React.CSSProperties = { padding: '5px 10px', background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', fontSize: 11, cursor: 'pointer', borderRadius: 2 }
const accentBtn: React.CSSProperties = { padding: '5px 12px', background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', borderRadius: 2 }
