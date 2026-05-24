/** Agrupamento de fatores urbanos por órgão responsável. */
export interface FatorOrgao {
  /** Nome do órgão (e.g. "COMLURB", "SEOP") */
  orgao: string
  /** Total de ocorrências de fatores atribuídas a este órgão */
  total: number
  /** Top tipos de fator com contagem */
  tipos: { tipo: string; count: number }[]
}

/** Decomposição do score de risco em 4 componentes + bônus. */
export interface ScoreBreakdown {
  /** Componente mancha criminal (0–40) */
  mancha_criminal: number
  /** Componente concentração de pico horário (0–15) */
  pico_horario: number
  /** Componente fatores urbanos (0–25) */
  fatores_urbanos: number
  /** Componente dinâmica de denúncias (0–15) */
  dinamica: number
  /** Bônus por disponibilidade de RELINT (0 ou 5) */
  relint_bonus: number
}

/** Score composto de risco da área (0–100). */
export interface Score {
  /** Score total ponderado */
  total: number
  /** Decomposição por componente */
  breakdown: ScoreBreakdown
}

/** Estatísticas criminais e urbanas agregadas por área. */
export interface AreaStats {
  /** Total de ocorrências criminais no período */
  crimes_total: number
  /** Contagem por tipo de delito (e.g. "Roubo a transeunte": 120) */
  crimes_por_tipo: Record<string, number>
  /** Hora de pico formatada (e.g. "14h") */
  pico_horario: string
  /** Percentual de ocorrências no período noturno (18–23h, 0–5h) */
  pct_noturno: number
  /** Distribuição por hora do dia (chave = hora, valor = contagem) */
  hora_distribution: Record<string, number>
  /** Distribuição por dia da semana */
  dia_distribution: Record<string, number>
  /** Total de denúncias do Disque Denúncia geo-referenciadas */
  denuncias_total: number
  /** Total de fatores urbanos pendentes */
  fatores_urbanos_total: number
  /** Total de câmeras CIVITAS na área */
  cameras_total: number
  /** Total de pessoas em situação de rua (censo PSR) */
  psr_total: number
  /** Distribuição de modus operandi extraídos por NLP */
  modus_operandi: Record<string, number>
}

/** Identificação administrativa da área FM. */
export interface Identificacao {
  /** Área Integrada de Segurança Pública */
  aisp: number | null
  /** Região Integrada de Segurança Pública */
  risp: number | null
  /** Base da Força Municipal (Central ou Litorânea) */
  base_fm: string
  /** Subprefeitura correspondente */
  subprefeitura: string
  /** Facção com maior presença territorial */
  dominio_principal: string
}

/** Relato individual do Disque Denúncia. */
export interface Relato {
  tipo: string
  data: string
  bairro: string
  logradouro: string
  /** Texto do relato (truncado a 400 caracteres) */
  relato: string
  /** Modus operandi extraídos por regex */
  modus: string[]
}

/** Seção estruturada de um documento RELINT. */
export interface RelintSection {
  titulo: string
  texto: string
}

/** Relatório de Inteligência (RELINT) da área. */
export interface Relint {
  /** Texto completo formatado em Markdown */
  full_text: string
  /** Seções extraídas das tabelas do DOCX */
  sections: RelintSection[]
}

/** Polígono de domínio territorial de facção. */
export interface DominioFeature {
  /** Nome do território */
  nome: string
  /** Identificador da facção (CV, TCP, ADA, Milícia) */
  faccao: string
  /** Geometria GeoJSON do polígono */
  geometry: GeoJSON.Geometry
}

/** Camadas de pontos georreferenciados para renderização no mapa. */
export interface MapLayers {
  crime_points: { lat: number; lng: number; tipo: string; h: number | null }[]
  fatores_points: { lat: number; lng: number; tipo: string; orgao: string; logradouro: string }[]
  cameras_points: { lat: number; lng: number }[]
  psr_points: { lat: number; lng: number }[]
}

/** A camera gap / blind spot identified by the gap analysis. */
export interface CameraGap {
  rank: number
  lat: number
  lng: number
  uncovered_crimes: number
  nearest_camera_m: number
  recommendation: 'instalar' | 'remanejar'
  justification: string
}

/** Camera coverage analysis for an area. */
export interface CameraGapAnalysis {
  n_cameras: number
  coverage_radius_m: number
  cameras: { lat: number; lng: number }[]
  gaps: CameraGap[]
}

/** Bingo layer breakdown per trecho. */
export interface BingoLayers {
  crime: boolean
  fatores: boolean
  sinais: boolean
}

export interface Trecho {
  locf_norm: string
  total: number
  lat: number
  lng: number
  roubo_transeunte: number
  roubo_celular: number
  roubo_coletivo: number
  pico_hora: number
  bingo_count?: number
  bingo_layers?: BingoLayers
}

export interface Area {
  id: number
  nome: string
  geometry: GeoJSON.Geometry
  identificacao: Identificacao
  stats: AreaStats
  top_trechos: Trecho[]
  n_bingo_trechos: number
  n_triple_bingo: number
  camera_gaps: CameraGapAnalysis
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

// ─── Agent types ─────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'running' | 'paused' | 'complete' | 'error'

export type AgentLayerKey = 'crime' | 'fatores' | 'cameras' | 'psr' | 'dominio'

export interface AgentCheckpointData {
  question: string
  options: string[]
  reasoning: string
  tool_use_id: string
}

export interface TranscriptEntry {
  id: string
  type: 'system' | 'narrate' | 'tool_action' | 'checkpoint_ask' | 'checkpoint_answer' | 'complete' | 'error'
  content: string
  stepTitle?: string
  checkpoint?: AgentCheckpointData
}

export interface AgentFindings {
  summary: string
  key_findings: string[]
  actions: Array<{
    prioridade: number
    urgencia: 'imediata' | '7_dias' | '30_dias'
    orgao: string
    tipo_recurso: string
    acao: string
    local: string
    evidencia: string
    prazo: string
  }>
}

export interface AgentState {
  status: AgentStatus
  areaId: number | null
  transcript: TranscriptEntry[]
  pendingCheckpoint: AgentCheckpointData | null
  messages: any[]
  findings: AgentFindings | null
  error: string | null
}

export interface MapControl {
  toggleLayer: (layer: AgentLayerKey, visible: boolean) => void
  zoomToArea: (areaId: number) => void
  addAnnotation: (lat: number, lng: number, title: string, body: string) => void
  clearAnnotations: () => void
  snapshotLayers: () => Record<AgentLayerKey, boolean>
  restoreLayers: (snapshot: Record<AgentLayerKey, boolean>) => void
}
