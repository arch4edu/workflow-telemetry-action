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
  const timeLabels = allPoints.map(p => `"${formatTime(p.x)}"`)

  // Y-axis with optional fixed range
  const yAxisRange = options?.yMax ? `0 --> ${options.yMax}` : ''

  let mermaid = 'xychart-beta\n'
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
