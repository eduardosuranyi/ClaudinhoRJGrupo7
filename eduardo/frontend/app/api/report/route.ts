import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import type { Area } from '../../types'

const execAsync = promisify(exec)

interface ReportBody {
  area: Area
  synthesis: unknown
}

export async function POST(req: NextRequest) {
  const body = await req.json() as ReportBody
  const { area, synthesis } = body

  const uid = randomUUID()
  const inputPath = join(tmpdir(), `compstat_input_${uid}.json`)
  const outputPath = join(tmpdir(), `compstat_report_${uid}.docx`)

  writeFileSync(inputPath, JSON.stringify({ area, synthesis }), 'utf-8')

  const scriptPath = join(process.cwd(), '..', 'backend', 'generate_report.py')
  const pythonBin = process.env.PYTHON_BIN ?? 'python3'

  try {
    await execAsync(`"${pythonBin}" "${scriptPath}" --input "${inputPath}" --output "${outputPath}"`)

    if (!existsSync(outputPath)) {
      return NextResponse.json({ error: 'Falha ao gerar relatório' }, { status: 500 })
    }

    const docxBuffer = readFileSync(outputPath)

    unlinkSync(inputPath)
    unlinkSync(outputPath)

    return new NextResponse(docxBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="CompStat_${area.nome.slice(0,30)}.docx"`,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
