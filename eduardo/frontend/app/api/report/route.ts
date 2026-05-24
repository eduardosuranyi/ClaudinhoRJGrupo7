import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { join } from 'path'
import { promisify } from 'util'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const execAsync = promisify(exec)

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { area, synthesis } = body

  const uid = randomUUID()
  const inputPath = join(tmpdir(), `compstat_input_${uid}.json`)
  const outputPath = join(tmpdir(), `compstat_report_${uid}.docx`)

  writeFileSync(inputPath, JSON.stringify({ area, synthesis }), 'utf-8')

  const scriptPath = join(process.cwd(), '..', 'backend', 'generate_report.py')

  try {
    await execAsync(`python3 ${scriptPath} --input ${inputPath} --output ${outputPath}`)

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
