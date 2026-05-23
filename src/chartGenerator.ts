import { ProcessedStats } from './interfaces'

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function generateId(): string {
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export interface ChartResult {
  id: string
  mermaid: string
}

export interface ChartOptions {
  yMax?: number
  colors?: string[]
}

export function generateChart(
  title: string,
  yLabel: string,
  series: Array<{ label: string; points: ProcessedStats[] }>,
  options?: ChartOptions
): ChartResult {
  if (series.length === 0 || series[0].points.length === 0) {
    return { id: generateId(), mermaid: '' }
  }

  const allPoints = series[0].points
  const total = allPoints.length

  // Sparse labels: show at most 8 labels to avoid overlap
  const maxLabels = 8
  const step = total <= maxLabels ? 1 : Math.ceil(total / maxLabels)
  const timeLabels = allPoints.map((p, i) => {
    if (i === 0 || i === total - 1 || i % step === 0) {
      return `"${formatTime(p.x)}"`
    }
    return '""'
  })

  // Color theme via init directive
  const colors = options?.colors
  let initDirective = ''
  if (colors && colors.length > 0) {
    const themeVars: Record<string, string> = {}
    colors.forEach((c, i) => {
      themeVars[`xyChart.dataColor${i + 1}`] = c
    })
    initDirective = `%%{init: { "theme": "base", "themeVariables": ${JSON.stringify(themeVars)} }}%%\n`
  }

  // Y-axis with optional fixed range
  const yAxisRange = options?.yMax ? `0 --> ${options.yMax}` : ''

  let mermaid = ''
  if (initDirective) mermaid += initDirective
  mermaid += 'xychart-beta\n'
  mermaid += `    title "${title}"\n`
  mermaid += `    x-axis [${timeLabels.join(', ')}]\n`
  mermaid += yAxisRange
    ? `    y-axis "${yLabel}" ${yAxisRange}\n`
    : `    y-axis "${yLabel}"\n`

  for (const s of series) {
    const values = s.points.map(p => p.y.toFixed(1))
    mermaid += `    line "${s.label}" [${values.join(', ')}]\n`
  }

  return { id: generateId(), mermaid }
}

/** Wrap mermaid source in a fenced code block string (for embedding in raw HTML/markdown). */
export function mermaidCodeBlock(mermaid: string): string {
  return '```mermaid\n' + mermaid + '```\n'
}
