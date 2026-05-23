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

  // Downsample to at most 32 evenly-spaced points (including first and last)
  const maxPoints = 32
  let indices: number[]
  if (total <= maxPoints) {
    indices = Array.from({ length: total }, (_, i) => i)
  } else {
    indices = [0]
    const step = (total - 1) / (maxPoints - 1)
    for (let i = 1; i < maxPoints - 1; i++) {
      indices.push(Math.round(step * i))
    }
    indices.push(total - 1)
  }

  // Show ~8 real labels; hidden positions use incrementing underscores for uniqueness
  const sampled = indices.length
  const maxLabels = 8
  const labelStep = sampled <= maxLabels ? 1 : Math.ceil(sampled / maxLabels)
  let hiddenCount = 1

  // Find which positions would show a real label via step alignment
  const showAtStep = new Set<number>()
  for (let i = 0; i < sampled; i++) {
    if (i % labelStep === 0) showAtStep.add(i)
  }
  // Always show first and last; suppress step-aligned labels too close to last
  showAtStep.add(0)
  showAtStep.add(sampled - 1)
  // Remove any step-aligned label within 2 positions of the last to avoid overlap
  for (let i = sampled - 2; i >= Math.max(0, sampled - 3); i--) {
    if (i !== 0 && showAtStep.has(i)) showAtStep.delete(i)
  }

  const timeLabels = indices.map((idx, i) => {
    if (showAtStep.has(i)) {
      return `"${formatTime(allPoints[idx].x)}"`
    }
    return `"${'_'.repeat(hiddenCount++)}"`
  })

  // Y-axis with optional fixed range
  const yAxisRange = options?.yMax ? `0 --> ${options.yMax}` : ''

  // Color palette via YAML frontmatter config
  let frontmatter = ''
  if (options?.colors && options.colors.length > 0) {
    const palette = options.colors.join(', ')
    frontmatter = `---\nconfig:\n  themeVariables:\n    xyChart:\n      plotColorPalette: "${palette}"\n---\n`
  }

  let mermaid = ''
  if (frontmatter) mermaid += frontmatter
  mermaid += 'xychart-beta\n'
  mermaid += `    title "${title}"\n`
  mermaid += `    x-axis [${timeLabels.join(', ')}]\n`
  mermaid += yAxisRange
    ? `    y-axis "${yLabel}" ${yAxisRange}\n`
    : `    y-axis "${yLabel}"\n`

  for (const s of series) {
    const values = indices.map(idx => s.points[idx].y.toFixed(1))
    mermaid += `    line "${s.label}" [${values.join(', ')}]\n`
  }

  return { id: generateId(), mermaid }
}
