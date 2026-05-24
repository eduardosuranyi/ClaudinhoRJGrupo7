/** Format a number with Brazilian thousand separators (e.g. 1.234). */
export function fmt(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** Pluralize: returns "1 ocorrência" or "5 ocorrências". */
export function plural(n: number, sing: string, plur: string): string {
  return n === 1 ? `${fmt(n)} ${sing}` : `${fmt(n)} ${plur}`
}

/** Map a risk score (0–100) to a CSS color variable for the dark theme. */
export function scoreColor(score: number): string {
  if (score >= 60) return 'var(--red)'
  if (score >= 40) return 'var(--accent)'
  if (score >= 25) return 'var(--amber)'
  return 'var(--text-muted)'
}

/** Map a faction identifier to its display color. */
export function faccaoColor(faccao: string): string {
  const map: Record<string, string> = {
    'CV': '#ef4444',
    'TCP': '#a855f7',
    'ADA': '#4a90e2',
    'Milícia': '#fbb040',
  }
  return map[faccao] || '#8a8a95'
}

/** Shorten an area name for compact display (strips prefixes, takes first segment). */
export function shortName(nome: string): string {
  return nome
    .split(' - ')[0]
    .replace(/^Estações? /, '')
    .replace(/^Metrô /, '')
    .replace(/^Av /, 'Av. ')
    .trim()
}

/** Capitalize the first letter of a string. */
export function cap(s: string): string {
  if (!s) return ''
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Format current time as HH:MM. */
export function timeAgo(now: Date): string {
  const h = now.getHours()
  const m = now.getMinutes()
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Human-readable labels for modus operandi keys extracted by NLP. */
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

/** Display labels for municipal agencies responsible for urban factors. */
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

/** Contact email addresses for dispatching urban factor resolutions. */
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
