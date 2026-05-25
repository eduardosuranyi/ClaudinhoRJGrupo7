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
  /** População estimada (Censo 2022) dos bairros FM */
  populacao_estimada?: number
  /** Crimes por 1.000 habitantes (normalizado) */
  crimes_per_1000_hab?: number
  /** Total de denúncias de consumo de drogas (SMAS signal) */
  denuncias_drogas?: number
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
  /** Bairros que intersectam o polígono FM */
  bairros?: string[]
  /** População residente (Censo 2022) dos bairros intersectantes */
  populacao_bairros_2022?: number
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
  /** Perfil do suspeito extraído de envolvidos (sexo, idade, pele) */
  perfil_suspeito?: string
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
  crime_points: { lat: number; lng: number; tipo: string; h: number | null; data?: string | null }[]
  fatores_points: { lat: number; lng: number; tipo: string; orgao: string; logradouro: string }[]
  cameras_points: { lat: number; lng: number }[]
  psr_points: { lat: number; lng: number }[]
  chamados_points?: { lat: number; lng: number; tipo: string; orgao: string }[]
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

/** Tipo de chamado 1746 agrupado. */
export interface Chamado1746Tipo {
  tipo: string
  orgao: string
  total: number
  atendidos: number
  vencidos?: number
}

/** Chamados municipais (Central 1746) agregados por área FM. */
export interface Chamados1746 {
  total: number
  com_coordenadas?: number
  pct_atendido?: number
  pct_vencido?: number
  por_tipo: Chamado1746Tipo[]
  evolucao_mensal?: { mes: string; total: number }[]
}

/** Cruzamento campo × demanda cidadã por órgão. */
export interface ValidacaoCruzada {
  orgao: string
  fatores_campo: number
  chamados_1746: number
  chamados_atendidos: number
  chamados_vencidos: number
  validado: boolean
}

/** Distribuição de denúncias por bairro dentro/próximo da área FM. */
export interface DenunciaBairro {
  bairro: string
  total: number
  tipos: Record<string, number>
}

/** Bairro polygon in the FM area surroundings (entorno). */
export interface BairroEntorno {
  nome: string
  populacao: number
  denuncias: number
  chamados_1746: number
  geometry: GeoJSON.Geometry
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
  /** Actual street line geometry from the logradouros gazetteer */
  line_geometry?: GeoJSON.Geometry
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
  /** Chamados 1746 para a área (se CSV exportado do BigQuery) */
  chamados_1746?: Chamados1746
  /** Cruzamento: fatores de campo × chamados 1746, agrupado por órgão */
  validacao_cruzada?: ValidacaoCruzada[]
  /** Denúncias agrupadas por bairro no entorno da área FM */
  denuncias_por_bairro?: DenunciaBairro[]
  /** Bairro polygons with stats for map overlay when area is selected */
  bairros_entorno?: BairroEntorno[]
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
    has_censo?: boolean
    has_1746?: boolean
    populacao_total_bairros_fm?: number
  }
}

// ─── Agent types ─────────────────────────────────────────────────────────────

export type AgentLayerKey = 'crime' | 'fatores' | 'cameras' | 'psr' | 'dominio' | 'gaps' | 'chamados' | 'bairros'

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

/** A fatores-urbanos or chamados-1746 point that was clicked on the map. */
export interface InspectedPoint {
  type: 'fator' | 'chamado'
  lat: number
  lng: number
  properties: Record<string, any>
}


export interface MapControl {
  toggleLayer: (layer: AgentLayerKey, visible: boolean) => void
  zoomToArea: (areaId: number) => void
  addAnnotation: (lat: number, lng: number, title: string, body: string) => void
  clearAnnotations: () => void
  snapshotLayers: () => Record<AgentLayerKey, boolean>
  restoreLayers: (snapshot: Record<AgentLayerKey, boolean>) => void
  /** Paint a specific street segment from the selected area's `top_trechos.line_geometry`. Returns false if no geometry. */
  highlightTrecho: (locfNorm: string, opts?: { color?: string; label?: string }) => boolean
  /** Highlight the top-N trechos of the currently selected area at once. */
  highlightTopTrechos: (n: number) => void
  /**
   * Clear agent-driven visualizations to make room for an unrelated new one.
   * By default clears lines, routes, focused bairro, radii, clusters, custom
   * heatmap, animations, pulses and comparisons. Pass `annotations: true` to
   * also remove pins and `timeFilter: true` to reset the hour filter.
   */
  clearHighlights: (opts?: { annotations?: boolean; timeFilter?: boolean }) => void
  /** Highlight and zoom to a single bairro from the selected area's `bairros_entorno`. */
  focusBairro: (nome: string) => boolean
  /** Filter the crime layer by an hour window. Pass nulls to reset. */
  setTimeFilter: (horaInicio: number | null, horaFim: number | null) => void
  /**
   * Draw a street-following route as a full polyline ([lng,lat] pairs).
   * `fallback` renders it in a distinct dashed/gray "rota aproximada" style.
   */
  showRoute: (polyline: [number, number][], opts?: { label?: string; fallback?: boolean; distanceM?: number }) => void
  /**
   * Enter manual route-picking: the operator clicks two points on the map; the
   * second click resolves a street route via /api/route and draws it. `onDone`
   * receives the route result (or an error). Returns immediately.
   */
  startRoutePick: (onDone?: (r: { status: 'ok' | 'fallback'; distance_m: number; message?: string } | { error: string }) => void) => void
  /** Cancel an active manual route-picking session. */
  cancelRoutePick: () => void
  /** Draw a radius circle (meters) around a point to show a coverage/influence area. */
  addRadiusCircle: (lat: number, lng: number, radiusM: number, opts?: { label?: string; color?: string }) => void
  /** Paint and compare 2+ trechos side by side with a colored comparison legend. */
  compareTrechos: (locfNorms: string[]) => void
  /** Show a temporary heatmap built from the selected area's crime points, filtered by type/hour. */
  showHeatmapCustom: (opts?: { tipo?: 'transeunte' | 'celular' | 'coletivo'; horaInicio?: number | null; horaFim?: number | null }) => void
  /** Animate crimes accumulating over the hours of the day (0→23). */
  animateTimeline: (opts?: { tipo?: 'transeunte' | 'celular' | 'coletivo'; stepMs?: number }) => void
  /** Run spatial clustering (DBSCAN) on the selected area's crime points and mark clusters on the map. */
  clusterCrimes: (opts?: { epsM?: number; minPts?: number }) => void
  /** Animate a glowing dot traveling along a path ([lng,lat] pairs). */
  playRouteAnimation: (path: [number, number][], opts?: { durationMs?: number; color?: string; label?: string; loop?: boolean }) => void
  /** Emit a temporary sonar-ping pulse at a point to draw attention (auto-removes). */
  pulseLocation: (lat: number, lng: number, opts?: { color?: string; label?: string; durationMs?: number }) => void
  /** Fly to a precise coordinate and zoom in tight (default zoom 16, clamped 10–18). */
  zoomToPoint: (lat: number, lng: number, zoom?: number) => void
  /** Zoom in/out relative to the current view by `steps` levels (1–5, default 1), keeping center. */
  adjustZoom: (direction: 'in' | 'out', steps?: number) => void
  /** Pull back to a full-context overview: the selected area, or all areas if none is selected. */
  zoomOverview: () => void
  /** Stop ephemeral moving/looping visuals (route animation, timeline, pulses); leaves static highlights/routes/focus intact. */
  stopAnimations: () => void
}
