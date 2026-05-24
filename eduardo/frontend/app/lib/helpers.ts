// Format number with thousand separator
export function fmt(n: number): string {
  return n.toLocaleString('pt-BR')
}

// Pluralize a count
export function plural(n: number, sing: string, plur: string): string {
  return n === 1 ? `${fmt(n)} ${sing}` : `${fmt(n)} ${plur}`
}

// Score color
export function scoreColor(score: number): string {
  if (score >= 60) return 'var(--red)'
  if (score >= 40) return 'var(--accent)'
  if (score >= 25) return 'var(--amber)'
  return 'var(--text-muted)'
}

// Faction color
export function faccaoColor(faccao: string): string {
  const map: Record<string, string> = {
    'CV': '#ef4444',
    'TCP': '#a855f7',
    'ADA': '#4a90e2',
    'Milícia': '#fbb040',
  }
  return map[faccao] || '#8a8a95'
}

// Short name for area
export function shortName(nome: string): string {
  return nome
    .split(' - ')[0]
    .replace(/^Estações? /, '')
    .replace(/^Metrô /, '')
    .replace(/^Av /, 'Av. ')
    .trim()
}

// Capitalize first
export function cap(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// Time ago
export function timeAgo(now: Date): string {
  const h = now.getHours()
  const m = now.getMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Modus operandi labels
export const MODUS_LABELS: Record<string, string> = {
  'a_pe': 'A pé',
  'motocicleta': 'Motocicleta',
  'bicicleta': 'Bicicleta',
  'armado': 'Armado (arma de fogo)',
  'arma_branca': 'Arma branca',
  'em_grupo': 'Em grupo',
  'menores': 'Menores',
  'veiculo': 'Veículo',
}

// Órgão display
export const ORGAO_LABELS: Record<string, string> = {
  'COMLURB': 'Comlurb',
  'SMAS': 'SMAS',
  'SEOP': 'SEOP',
  'Rio Luz': 'RioLuz',
  'SECONSERVA': 'Seconserva',
  'CET-Rio': 'CET-Rio',
  'GM-Rio': 'GM-Rio',
  'SMTR': 'SMTR',
}

export const ORGAO_EMAIL: Record<string, string> = {
  'COMLURB': 'atendimento@comlurb.rio.gov.br',
  'SMAS': 'gabinete.smas@rio.rj.gov.br',
  'SEOP': 'gabinete.seop@rio.rj.gov.br',
  'Rio Luz': 'atendimento@rioluz.rio.gov.br',
  'SECONSERVA': 'gabinete.seconserva@rio.rj.gov.br',
  'CET-Rio': 'gabinete.cetrio@rio.rj.gov.br',
  'GM-Rio': 'gabinete.gmrio@rio.rj.gov.br',
  'SMTR': 'gabinete.smtr@rio.rj.gov.br',
}
