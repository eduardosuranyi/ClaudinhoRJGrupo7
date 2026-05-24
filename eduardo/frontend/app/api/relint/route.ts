/**
 * RELINT generator — 100% TypeScript.
 * Replica EXATAMENTE o formato e profundidade dos RI_010–RI_017 oficiais.
 * Usa o RELINT existente como referência, atualiza dados e adiciona escala 12x36.
 */
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, BorderStyle, WidthType,
  PageOrientation, convertMillimetersToTwip,
} from 'docx'

const client = new Anthropic()

// ─────────────────────────────────────────────────────────────────────
// 1. Escala 12x36
// ─────────────────────────────────────────────────────────────────────
function calcularEscala(area: any, todasAreas: any[]) {
  const TOTAL = 600
  const FLOOR = 12
  const TURNOS = 4
  const totalScore = todasAreas.reduce((s, a) => s + (a.score?.total || 0), 0) || 1
  const budgetAcima = TOTAL - FLOOR * todasAreas.length
  const acimaPiso = Math.round(budgetAcima * (area.score.total / totalScore))
  const total = FLOOR + acimaPiso
  const porTurno = Math.round(total / TURNOS)
  const modus = area.stats.modus_operandi || {}
  const sumModus = Object.values(modus).reduce((s: number, v: any) => s + (v as number), 0) || 1
  const pctPe = ((modus.a_pe || 0) / sumModus) * 100
  const pctMoto = ((modus.motocicleta || 0) / sumModus) * 100
  const noturno = area.stats.pct_noturno
  const psr = area.stats.psr_total
  let pe = 50, moto = 25, viatura = 15
  if (pctMoto > 10)  { moto += 10; pe -= 10 }
  if (pctPe > 40)    { pe += 10; viatura -= 10 }
  if (noturno > 65)  { moto += 8; pe -= 8 }
  let social = 0
  if (psr > 500)     { social = 12; pe -= 12 }
  else if (psr > 200){ social = 7;  pe -= 7 }
  const totalRatio = pe + moto + viatura + social
  const norm = (v: number) => Math.round((v / totalRatio) * porTurno)
  return {
    total, porTurno,
    pe: norm(pe), moto: norm(moto), viatura: norm(viatura),
    social: social > 0 ? norm(social) : 0,
  }
}

// ─────────────────────────────────────────────────────────────────────
// 2. Helpers docx
// ─────────────────────────────────────────────────────────────────────
const THIN_BORDER = { style: BorderStyle.SINGLE, size: 4, color: '000000' }

function txt(text: string, bold = false): TextRun {
  return new TextRun({ text, bold, font: 'Arial', size: 20 })
}
function p(text: string, bold = false): Paragraph {
  return new Paragraph({
    spacing: { before: bold ? 80 : 0, after: bold ? 80 : 60, line: 280 },
    children: [txt(text, bold)],
  })
}
function cellWithBorder(children: Paragraph[]): TableCell {
  return new TableCell({
    children,
    borders: {
      top:    THIN_BORDER,
      bottom: THIN_BORDER,
      left:   THIN_BORDER,
      right:  THIN_BORDER,
    },
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
  })
}

// ─────────────────────────────────────────────────────────────────────
// 3. Document build
// ─────────────────────────────────────────────────────────────────────
function buildDocument(area: any, content: any): Document {
  // Header 3-col
  const headerCells = ['FORÇA MUNICIPAL', 'RESERVADO', 'Pág.'].map(t =>
    new TableCell({
      children: [new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: t, bold: true, font: 'Arial', size: 18 })],
      })],
      borders: { top: THIN_BORDER, bottom: THIN_BORDER, left: THIN_BORDER, right: THIN_BORDER },
    })
  )
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: headerCells })],
  })

  // Title paragraph
  const titlePara = new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 240, after: 240 },
    children: [
      new TextRun({ text: 'RELATÓRIO DE INTELIGÊNCIA DE ÁREA – COMPSTAT – DADOS PÚBLICOS', bold: true, font: 'Arial', size: 22 }),
    ],
  })

  // Main content table
  const rows: TableRow[] = []
  rows.push(new TableRow({ children: [cellWithBorder([
    p('RELATÓRIO DE INTELIGÊNCIA DE ÁREA', true),
    p('Subsídio para Reunião de CompStat', true),
  ])] }))
  rows.push(new TableRow({ children: [cellWithBorder([p(area.nome.toUpperCase(), true)])] }))
  rows.push(new TableRow({ children: [cellWithBorder([p(content.intro, false)])] }))

  for (const sec of (content.secoes || [])) {
    rows.push(new TableRow({ children: [cellWithBorder([p(sec.titulo.toUpperCase(), true)])] }))
    const ps: Paragraph[] = [p(sec.texto, false)]
    if (sec.bullets?.length) {
      ps.push(p('Também foram identificados:', false))
      for (const b of sec.bullets) ps.push(p(`• ${b}`, false))
    }
    if (sec.dinamica) ps.push(p(sec.dinamica, false))
    rows.push(new TableRow({ children: [cellWithBorder(ps)] }))
  }

  rows.push(new TableRow({ children: [cellWithBorder([p('CONCLUSÃO', true)])] }))
  const conc = content.conclusao || {}
  const cps: Paragraph[] = [p(conc.texto || '', false)]
  if (conc.intro_bullets) cps.push(p(conc.intro_bullets, false))
  for (const b of (conc.bullets || [])) cps.push(p(`• ${b}`, false))
  if (conc.fechamento) cps.push(p(conc.fechamento, false))
  rows.push(new TableRow({ children: [cellWithBorder(cps)] }))

  const mainTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  })

  return new Document({
    creator: 'CompStat Municipal RJ',
    title: `RELINT — ${area.nome}`,
    styles: { default: { document: { run: { font: 'Arial', size: 20 } } } },
    sections: [{
      properties: {
        page: {
          size: {
            width: convertMillimetersToTwip(210),
            height: convertMillimetersToTwip(297),
            orientation: PageOrientation.PORTRAIT,
          },
          margin: {
            top: convertMillimetersToTwip(20),
            bottom: convertMillimetersToTwip(20),
            left: convertMillimetersToTwip(20),
            right: convertMillimetersToTwip(20),
          },
        },
      },
      children: [headerTable, titlePara, mainTable],
    }],
  })
}

// ─────────────────────────────────────────────────────────────────────
// 4. Route handler
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const { area, allAreas } = await req.json()
  const todasAreas = allAreas || [area]
  const escala = calcularEscala(area, todasAreas)

  const topTrechos = area.top_trechos?.slice(0, 5) ?? []
  const fatores    = area.fatores_por_orgao?.slice(0, 6) ?? []
  const modus      = area.stats?.modus_operandi ?? {}
  const relintRef  = area.relint?.full_text ?? ''
  const relatos    = (area.relatos_sample ?? []).slice(0, 4)

  // Top dias e tipos
  const tipos = Object.entries(area.stats.crimes_por_tipo || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`).join(', ')

  const diasTop = Object.entries(area.stats.dia_distribution || {})
    .sort((a, b) => (b[1] as number) - (a[1] as number))
    .slice(0, 3).map(([d]) => d).join(', ')

  const prompt = `Você é analista de inteligência sênior do CompStat Municipal do Rio de Janeiro.
Sua tarefa: gerar o RELATÓRIO DE INTELIGÊNCIA DE ÁREA (RELINT) para "${area.nome}".

═══════════════════════════════════════════════════════════════════
RELINT DE REFERÊNCIA (formato e profundidade exatos a replicar)
═══════════════════════════════════════════════════════════════════
${relintRef || '[Sem RELINT prévio — use o conhecimento sobre o Rio de Janeiro para inferir contexto urbano da área]'}
═══════════════════════════════════════════════════════════════════

DADOS QUANTITATIVOS ATUALIZADOS DA PLATAFORMA (use no novo RELINT):
- Total de crimes (2020-2024): ${area.stats.crimes_total}
- Tipos predominantes: ${tipos}
- Pico horário: ${area.stats.pico_horario} | ${area.stats.pct_noturno}% noturno
- Dias críticos: ${diasTop}
- Modus operandi (denúncias Disque Denúncia): ${JSON.stringify(modus)}
- População em Situação de Rua mapeada: ${area.stats.psr_total}
- Câmeras CIVITAS no perímetro: ${area.stats.cameras_total}
- Score de risco: ${area.score.total.toFixed(0)}/100

TOP TRECHOS POR INCIDÊNCIA:
${topTrechos.map((t: any, i: number) =>
  `  ${i+1}. ${t.locf_norm}: ${t.total} ocorrências (transeunte ${t.roubo_transeunte}, celular ${t.roubo_celular}, coletivo ${t.roubo_coletivo}) | pico ${t.pico_hora}h`
).join('\n')}

AMOSTRAS DE RELATOS DO DISQUE DENÚNCIA:
${relatos.map((r: any, i: number) => `  [${i+1}] ${r.tipo} em ${r.bairro}: "${r.relato.slice(0, 200)}..."`).join('\n')}

FATORES URBANOS PENDENTES POR ÓRGÃO:
${fatores.map((f: any) =>
  `  ${f.orgao}: ${f.total} pendências — ${f.tipos.slice(0,2).map((t: any) => `${t.tipo}[${t.count}]`).join(', ')}`
).join('\n')}

═══════════════════════════════════════════════════════════════════
ESCALA OPERACIONAL DA FORÇA MUNICIPAL (calculada pela plataforma)
═══════════════════════════════════════════════════════════════════
A FM opera em escala 12x36 (12h trabalho, 36h descanso).
Total designado para esta área: ${escala.total} agentes
EFETIVO SIMULTÂNEO POR TURNO DE 12H: ${escala.porTurno} agentes
Composição por turno:
  - ${escala.pe} agentes a pé
  - ${escala.moto} agentes em motocicleta
  - ${escala.viatura} agentes em viatura${escala.social > 0 ? `\n  - ${escala.social} agentes em abordagem social (PSR)` : ''}

═══════════════════════════════════════════════════════════════════
INSTRUÇÕES — LEIA COM ATENÇÃO
═══════════════════════════════════════════════════════════════════

OBJETIVO: produzir um novo RELINT que seja EQUIVALENTE em profundidade, riqueza contextual e tom técnico-operacional ao RELINT de referência acima, MAS:
1. Atualizado com os dados quantitativos da plataforma
2. Incorporando explicitamente a escala 12x36 da FM e o efetivo de ${escala.porTurno} agentes por turno
3. Mantendo a estrutura de 3 sub-áreas (igual ao referência)
4. Mantendo a profundidade descritiva (nomes de instituições, datas, números específicos, referências a logradouros e intersecções reais)

ESTRUTURA OBRIGATÓRIA (replique 1:1 do referência):

PARÁGRAFO INTRODUTÓRIO (intro):
- 2-3 frases
- Padrão: "A presente análise territorial visa identificar fatores urbanos, dinâmica criminal e vulnerabilidades relacionadas à sensação de segurança da população, considerando [contexto específico desta área]. Foram observados fatores associados à incidência de furtos e roubos contra transeuntes, especialmente subtração de aparelhos celulares, além de elementos urbanos que favorecem delitos oportunistas."

3 SUB-ÁREAS (mantenha os MESMOS NOMES do referência sempre que possível):
Cada uma deve ter:

(A) PARÁGRAFO DESCRITIVO (4-6 frases, RICO em contexto):
- Cite SEMPRE: instituições reais (INEPAC, IPHAN, SuperVia, MetrôRio, VLT, Câmara Municipal, Comissão de Assuntos Urbanos, ISP-RJ, etc.)
- Cite SEMPRE: logradouros com endereço (ex: "Praça da República, s/n", "Av. Presidente Vargas entre nº 500 e 1.500")
- Cite SEMPRE: estatísticas com fonte (ex: "alta de 36% segundo ISP-RJ", "600 mil passageiros/dia")
- Cite eventos quando aplicável (Carnaval 2025, vistorias, intervenções)
- Use os dados quantitativos atualizados acima

(B) BLOCO "Também foram identificados:" + 5 BULLETS no formato:
"• retenção de fluxo em horários de pico — [detalhe específico com hora/local]"
"• áreas com baixa visibilidade — [detalhe específico]"
"• obstáculos urbanos dificultando vigilância — [detalhe específico]"
"• circulação intensa de motocicletas e bicicletas — [detalhe específico]"
"• múltiplas rotas de dispersão após a prática criminosa — [vias reais]"

(C) FRASE DE FECHAMENTO PADRÃO (igual em TODAS as sub-áreas):
"A dinâmica criminal observada indica predominância de indivíduos atuando a pé, motocicletas e bicicletas, aproveitando momentos de distração das vítimas em áreas de espera, travessias e acessos ao transporte público."

CONCLUSÃO (4 partes):
(A) Parágrafo de síntese (3-4 frases conectando as 3 sub-áreas)
(B) Parágrafo curto inserindo a escala FM: "Para fazer frente a este quadro operacional, a Força Municipal mobiliza ${escala.porTurno} agentes por turno (escala 12x36, totalizando ${escala.total} designados), distribuídos em ${escala.moto} motocicletas, ${escala.pe} a pé, ${escala.viatura} em viatura${escala.social > 0 ? ` e ${escala.social} em abordagem social` : ''}."
(C) Frase "Observa-se necessidade de:" + 5 bullets de ação:
"• reforço do patrulhamento preventivo — [missão dirigida com trecho específico e horário real do pico]"
"• melhoria da iluminação pública — [trecho específico real]"
"• poda de vegetação — [local específico se aplicável, OU outro fator urbano relevante para esta área]"
"• fiscalização e ordenamento — [logradouro real com problema documentado]"
"• ações integradas — coordenação entre Força Municipal, PMERJ, [outros órgãos específicos]"
(D) Fechamento padrão sobre horários e dias críticos com dados reais.

═══════════════════════════════════════════════════════════════════

FORMATO DE RESPOSTA: APENAS JSON VÁLIDO. SEM markdown. SEM backticks. SEM texto antes ou depois.

ESTRUTURA EXATA:
{
  "intro": "...",
  "secoes": [
    {
      "titulo": "NOME DA SUB-ÁREA EM MAIÚSCULAS",
      "texto": "Parágrafo descritivo rico (4-6 frases com instituições, endereços, estatísticas).",
      "bullets": [
        "retenção de fluxo em horários de pico — detalhe específico",
        "áreas com baixa visibilidade — detalhe específico",
        "obstáculos urbanos dificultando vigilância — detalhe específico",
        "circulação intensa de motocicletas e bicicletas — detalhe específico",
        "múltiplas rotas de dispersão após a prática criminosa — vias reais"
      ],
      "dinamica": "A dinâmica criminal observada indica predominância de indivíduos atuando a pé, motocicletas e bicicletas, aproveitando momentos de distração das vítimas em áreas de espera, travessias e acessos ao transporte público."
    }
  ],
  "conclusao": {
    "texto": "Síntese conectando as 3 sub-áreas + parágrafo de escala FM. Observa-se necessidade de:",
    "intro_bullets": null,
    "bullets": [
      "reforço do patrulhamento preventivo — ...",
      "melhoria da iluminação pública — ...",
      "poda de vegetação — ...",
      "fiscalização e ordenamento — ...",
      "ações integradas de ordenamento urbano — ..."
    ],
    "fechamento": "Os delitos tendem a ocorrer principalmente [horário/dias reais], aproveitando [situação específica]. O emprego do efetivo da FM (${escala.porTurno} agentes/turno) deve ser concentrado neste período crítico."
  }
}`

  // Call Claude with prefill to force JSON
  let content: any
  try {
    const r = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [
        { role: 'user', content: prompt },
        { role: 'assistant', content: '{' },  // prefill to force JSON
      ],
    })
    const raw = '{' + (r.content[0] as any).text.trim()
      .replace(/```\s*$/,'').trim()
    content = JSON.parse(raw)
  } catch (e: any) {
    return NextResponse.json({ error: `Erro Claude: ${e.message}` }, { status: 500 })
  }

  // Build docx
  try {
    const doc = buildDocument(area, content)
    const buf = await Packer.toBuffer(doc)
    const slug = area.nome.slice(0,30).replace(/[^a-zA-Z0-9]/g,'_')
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="RELINT_${slug}.docx"`,
      },
    })
  } catch (e: any) {
    return NextResponse.json({ error: `Erro docx: ${e.message}` }, { status: 500 })
  }
}
