'use client'

import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, YAxis } from 'recharts'
import type { Area } from '../../types'
import { fmt, MODUS_LABELS } from '../../lib/helpers'
import RiskSignals from '../RiskSignals'

export default function OverviewTab({ area, allAreas }: { area: Area; allAreas?: Area[] }) {
  const horaData = Object.entries(area.stats.hora_distribution)
    .map(([h, v]) => ({ hora: `${h}h`, value: v, hour: Number(h) }))
    .sort((a, b) => a.hour - b.hour)
  const maxHora = horaData.reduce((m, d) => d.value > m.value ? d : m, horaData[0] || { value: 0, hora: 'N/D' })

  const tipoEntries = Object.entries(area.stats.crimes_por_tipo).sort((a, b) => b[1] - a[1])
  const tipoTotal = tipoEntries.reduce((s, [, v]) => s + v, 0) || 1

  const evol = area.evolucao_mensal.slice(-12)

  const modusEntries = Object.entries(area.stats.modus_operandi).slice(0, 6)
  const modusTotal = modusEntries.reduce((s, [, v]) => s + v, 0) || 1

  const diaEntries = Object.entries(area.stats.dia_distribution)
  const diaMax = Math.max(...diaEntries.map(([, v]) => v), 1)
  const diaOrder = ['Segunda', 'Terca', 'Quarta', 'Quinta', 'Sexta', 'Sabado', 'Domingo']

  return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <KPI label="Ocorrências" value={fmt(area.stats.crimes_total)} hint="2020–2024" />
        <KPI label="Pico" value={area.stats.pico_horario} hint={`${area.stats.pct_noturno}% noturno`} />
        <KPI label="Câmeras" value={fmt(area.stats.cameras_total)} hint="CIVITAS" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <KPI label="Denúncias" value={fmt(area.stats.denuncias_total)} hint="Disque Denúncia" />
        <KPI label="Fatores" value={fmt(area.stats.fatores_urbanos_total)} hint="pendentes" />
        <KPI label="Pop. Rua" value={fmt(area.stats.psr_total)} hint="censo 2024" />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
        <KPI label="Bingo 2+/3" value={fmt(area.n_bingo_trechos)} hint="trechos coincidentes" />
        <KPI label="Bingo 3/3" value={fmt(area.n_triple_bingo)} hint="tripla coincidência" />
        <KPI label="Pontos Cegos" value={fmt(area.camera_gaps.gaps.length)} hint={`${fmt(area.camera_gaps.n_cameras)} câmeras`} />
      </div>

      {/* Per-capita / population enrichment row */}
      {(area.stats.populacao_estimada != null || area.stats.denuncias_drogas != null) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {area.stats.populacao_estimada != null && (
            <KPI label="Pop. Residente" value={fmt(area.stats.populacao_estimada)} hint="Censo 2022" />
          )}
          {area.stats.crimes_per_1000_hab != null && (
            <KPI label="Crimes/1k hab" value={area.stats.crimes_per_1000_hab.toFixed(1)} hint="per capita" />
          )}
          {area.stats.denuncias_drogas != null && (
            <KPI label="Cenas de Drogas" value={fmt(area.stats.denuncias_drogas)} hint="DD - SMAS" />
          )}
        </div>
      )}

      {/* Crime types */}
      <div>
        <SectionLabel>Tipos de Ocorrência</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {tipoEntries.map(([tipo, count], i) => {
            const pct = Math.round((count / tipoTotal) * 100)
            return (
              <div key={tipo}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{tipo}</span>
                  <span className="mono tnum" style={{ fontSize: 11, color: 'var(--text)' }}>
                    {fmt(count)} <span style={{ color: 'var(--text-muted)' }}>· {pct}%</span>
                  </span>
                </div>
                <div style={{ height: 3, background: 'var(--bg-3)' }}>
                  <div style={{
                    height: '100%',
                    width: `${pct}%`,
                    background: ['#ff6b35', '#fbb040', '#a855f7'][i] || 'var(--accent)',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Distribuição horária */}
      <div>
        <SectionLabel>Distribuição Horária</SectionLabel>
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 6 }}>
          Pico em <span className="mono" style={{ color: 'var(--accent)' }}>{maxHora?.hora}</span>
          {' '}com <span className="mono tnum" style={{ color: 'var(--text)' }}>{fmt(maxHora?.value || 0)}</span> ocorrências.
        </div>
        <div style={{ height: 80 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={horaData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <XAxis dataKey="hora" tick={{ fontSize: 10, fill: '#4a4a55' }} interval={3} tickLine={false} axisLine={{ stroke: '#2a2a35' }} />
              <Tooltip
                contentStyle={{ background: '#14141a', border: '1px solid #2a2a35', fontSize: 10, padding: '6px 8px' }}
                labelStyle={{ color: '#8a8a95' }}
                itemStyle={{ color: '#f0f0f3' }}
                cursor={{ fill: 'rgba(255,107,53,0.1)' }}
              />
              <Bar dataKey="value">
                {horaData.map((entry) => (
                  <Cell key={entry.hora} fill={entry.value === maxHora?.value ? '#ff6b35' : '#3a3a48'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Dia da semana */}
      {diaEntries.length > 0 && (
        <div>
          <SectionLabel>Dia da Semana</SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
            {diaOrder.map(d => {
              const v = area.stats.dia_distribution[d] || 0
              const pct = (v / diaMax) * 100
              return (
                <div key={d} style={{ textAlign: 'center' }}>
                  <div style={{
                    height: 32,
                    background: 'var(--bg-3)',
                    position: 'relative',
                    borderRadius: 1,
                    display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                  }}>
                    <div style={{ height: `${pct}%`, background: 'var(--accent)' }} />
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{d.slice(0, 3)}</div>
                  <div className="mono tnum" style={{ fontSize: 10, color: 'var(--text-dim)' }}>{fmt(v)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Modus operandi (das denúncias) */}
      {modusEntries.length > 0 && (
        <div>
          <SectionLabel>Modus Operandi <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>(extraído das denúncias)</span></SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {modusEntries.map(([k, v]) => {
              const pct = Math.round((v / modusTotal) * 100)
              return (
                <div key={k}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{MODUS_LABELS[k] || k}</span>
                    <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt(v)} ({pct}%)</span>
                  </div>
                  <div style={{ height: 2, background: 'var(--bg-3)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: 'var(--amber)' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Validação Cruzada: Campo × 1746 */}
      {area.validacao_cruzada && area.validacao_cruzada.length > 0 ? (
        <div>
          <SectionLabel>Demandas por Órgão <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>(campo 2026 × 1746 2020-2024)</span></SectionLabel>
          <div style={{ fontSize: 10, color: 'var(--text-dim)', marginBottom: 8 }}>
            Fatores = observação de campo. Chamados = reclamações da população.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {area.validacao_cruzada.map((vc) => {
              const maxBar = Math.max(...area.validacao_cruzada!.map(v => v.chamados_1746), 1)
              const barPct = Math.round((vc.chamados_1746 / maxBar) * 100)
              const atdPct = vc.chamados_1746 > 0 ? Math.round((vc.chamados_atendidos / vc.chamados_1746) * 100) : 0
              return (
                <div key={vc.orgao}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text)' }}>{vc.orgao}</span>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <span style={{ fontSize: 10, color: '#36c476' }} title="Fatores observados em campo">{vc.fatores_campo} campo</span>
                      <span className="mono tnum" style={{ fontSize: 10, color: '#f59e0b' }} title="Chamados 1746">{fmt(vc.chamados_1746)} 1746</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 2, height: 4 }}>
                    <div style={{ flex: 1, background: 'var(--bg-3)', position: 'relative' }}>
                      <div style={{ position: 'absolute', height: '100%', width: `${barPct}%`, background: vc.validado ? '#f59e0b' : 'var(--bg-3)' }} />
                    </div>
                  </div>
                  {vc.chamados_1746 > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      {atdPct}% atendidos · {fmt(vc.chamados_vencidos)} vencidos
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : area.fatores_por_orgao.length > 0 ? (
        <div>
          <SectionLabel>Fatores Urbanos por Órgão</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {area.fatores_por_orgao.slice(0, 7).map((fo) => {
              const pct = Math.round((fo.total / (area.stats.fatores_urbanos_total || 1)) * 100)
              return (
                <div key={fo.orgao}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>{fo.orgao}</span>
                    <span className="mono tnum" style={{ fontSize: 10, color: 'var(--text-muted)' }}>{fmt(fo.total)} ({pct}%)</span>
                  </div>
                  <div style={{ height: 3, background: 'var(--bg-3)' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#36c476' }} />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : null}

      {/* Chamados 1746 — evolução mensal */}
      {area.chamados_1746 && (
        <div>
          <SectionLabel>Chamados 1746 <span style={{ color: 'var(--text-muted)', fontSize: 10, marginLeft: 4 }}>(Central de Atendimento · 2020-2024)</span></SectionLabel>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10 }}>
            <KPI label="Chamados" value={fmt(area.chamados_1746.total)} hint="na área FM" />
            {area.chamados_1746.pct_atendido != null && (
              <KPI label="Atendidos" value={`${area.chamados_1746.pct_atendido}%`} hint="taxa atendimento" />
            )}
            {area.chamados_1746.pct_vencido != null && (
              <KPI label="Vencidos" value={`${area.chamados_1746.pct_vencido}%`} hint="fora do prazo" />
            )}
          </div>
          {area.chamados_1746.evolucao_mensal && area.chamados_1746.evolucao_mensal.length > 1 && (
            <div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>Evolução mensal dos chamados</div>
              <div style={{ height: 60 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={area.chamados_1746.evolucao_mensal.slice(-24)} margin={{ top: 4, right: 0, left: -25, bottom: 0 }}>
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#4a4a55' }} interval={Math.max(0, Math.floor(area.chamados_1746.evolucao_mensal.slice(-24).length / 4))} tickLine={false} axisLine={{ stroke: '#2a2a35' }} />
                    <YAxis tick={{ fontSize: 10, fill: '#4a4a55' }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={{ background: '#14141a', border: '1px solid #2a2a35', fontSize: 10 }} labelStyle={{ color: '#8a8a95' }} itemStyle={{ color: '#f0f0f3' }} />
                    <Line type="monotone" dataKey="total" stroke="#f59e0b" strokeWidth={1.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Evolução mensal */}
      {evol.length > 1 && (
        <div>
          <SectionLabel>Evolução Mensal (últimos {evol.length} meses)</SectionLabel>
          <div style={{ height: 70 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evol} margin={{ top: 4, right: 0, left: -25, bottom: 0 }}>
                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#4a4a55' }} interval={Math.max(0, Math.floor(evol.length / 4))} tickLine={false} axisLine={{ stroke: '#2a2a35' }} />
                <YAxis tick={{ fontSize: 10, fill: '#4a4a55' }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background: '#14141a', border: '1px solid #2a2a35', fontSize: 10 }} labelStyle={{ color: '#8a8a95' }} itemStyle={{ color: '#f0f0f3' }} />
                <Line type="monotone" dataKey="total" stroke="#ff6b35" strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {allAreas && <RiskSignals area={area} allAreas={allAreas} />}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="label-overline" style={{ marginBottom: 8 }}>{children}</div>
}

function KPI({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div style={{
      background: 'var(--bg-1)',
      border: '1px solid var(--border)',
      padding: '8px 10px',
      borderRadius: 2,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>{label}</div>
      <div className="mono tnum" style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, lineHeight: 1 }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>{hint}</div>}
    </div>
  )
}
