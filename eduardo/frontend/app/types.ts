export interface Trecho {
  locf_norm: string
  total: number
  lat: number
  lng: number
  roubo_transeunte: number
  roubo_celular: number
  roubo_coletivo: number
  pico_hora: number
}

export interface FatorOrgao {
  orgao: string
  total: number
  tipos: { tipo: string; count: number }[]
}

export interface ScoreBreakdown {
  mancha_criminal: number
  pico_horario: number
  fatores_urbanos: number
  dinamica: number
  relint_bonus: number
}

export interface Score {
  total: number
  breakdown: ScoreBreakdown
}

export interface AreaStats {
  crimes_total: number
  crimes_por_tipo: Record<string, number>
  pico_horario: string
  pct_noturno: number
  hora_distribution: Record<string, number>
  dia_distribution: Record<string, number>
  denuncias_total: number
  fatores_urbanos_total: number
  cameras_total: number
  psr_total: number
  modus_operandi: Record<string, number>
}

export interface Identificacao {
  aisp: number | null
  risp: number | null
  base_fm: string
  subprefeitura: string
  dominio_principal: string
}

export interface Relato {
  tipo: string
  data: string
  bairro: string
  logradouro: string
  relato: string
  modus: string[]
}

export interface RelintSection {
  titulo: string
  texto: string
}

export interface Relint {
  full_text: string
  sections: RelintSection[]
}

export interface DominioFeature {
  nome: string
  faccao: string
  geometry: GeoJSON.Geometry
}

export interface MapLayers {
  crime_points: { lat: number; lng: number; tipo: string; h: number | null }[]
  fatores_points: { lat: number; lng: number; tipo: string; orgao: string; logradouro: string }[]
  cameras_points: { lat: number; lng: number }[]
  psr_points: { lat: number; lng: number }[]
}

export interface Area {
  id: number
  nome: string
  geometry: GeoJSON.Geometry
  identificacao: Identificacao
  stats: AreaStats
  top_trechos: Trecho[]
  fatores_por_orgao: FatorOrgao[]
  relatos_sample: Relato[]
  relint_disponivel: boolean
  relint: Relint
  dominio_territorial: DominioFeature[]
  evolucao_mensal: { mes: string; total: number }[]
  map_layers: MapLayers
  score: Score
}

export interface AreasData {
  areas: Area[]
  meta: {
    total_ocorrencias: number
    total_ocorrencias_em_areas: number
    total_denuncias: number
    total_fatores_urbanos: number
    total_cameras: number
    total_areas: number
    total_psr: number
    periodo_criminal: string
    periodo_fatores: string
    periodo_denuncias: string
  }
}
