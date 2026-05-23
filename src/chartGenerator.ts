import { GraphResponse, ProcessedStats } from './interfaces'

const CHART_WIDTH = 1000
const CHART_HEIGHT = 500
const PADDING = { top: 40, right: 40, bottom: 60, left: 80 }

const PLOT_WIDTH = CHART_WIDTH - PADDING.left - PADDING.right
const PLOT_HEIGHT = CHART_HEIGHT - PADDING.top - PADDING.bottom

interface LineConfig {
  label: string
  color: string
  points: ProcessedStats[]
}

interface AreaConfig {
  label: string
  color: string
  points: ProcessedStats[]
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  const s = date.getSeconds().toString().padStart(2, '0')
  return `${h}:${m}:${s}`
}

function computeNiceMax(max: number): number {
  if (max <= 0) return 1
  const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
  const normalized = max / magnitude
  let niceNormalized: number
  if (normalized <= 1) niceNormalized = 1
  else if (normalized <= 2) niceNormalized = 2
  else if (normalized <= 5) niceNormalized = 5
  else niceNormalized = 10
  return niceNormalized * magnitude
}

function generateTimeTicks(
  minTime: number,
  maxTime: number,
  maxTicks: number = 8
): number[] {
  const range = maxTime - minTime
  if (range <= 0) return [minTime]

  const step = range / maxTicks
  const ticks: number[] = []
  for (let i = 0; i <= maxTicks; i++) {
    ticks.push(minTime + step * i)
  }
  return ticks
}

function generateYTicks(maxY: number, tickCount: number = 5): number[] {
  const step = maxY / tickCount
  const ticks: number[] = []
  for (let i = 0; i <= tickCount; i++) {
    ticks.push(step * i)
  }
  return ticks
}

function scaleX(value: number, minX: number, maxX: number): number {
  if (maxX === minX) return PADDING.left + PLOT_WIDTH / 2
  return PADDING.left + ((value - minX) / (maxX - minX)) * PLOT_WIDTH
}

function scaleY(value: number, maxY: number): number {
  if (maxY === 0) return PADDING.top + PLOT_HEIGHT
  return PADDING.top + PLOT_HEIGHT - (value / maxY) * PLOT_HEIGHT
}

function buildSvgHeader(): string {
  const axisColor = '#000000'
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CHART_WIDTH}" height="${CHART_HEIGHT}" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}">
<rect width="${CHART_WIDTH}" height="${CHART_HEIGHT}" fill="#ffffff"/>
<style>
  .axis-label { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; fill: ${axisColor}; }
  .title-label { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 14px; font-weight: bold; fill: ${axisColor}; }
  .legend-label { font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-size: 11px; fill: ${axisColor}; }
  .grid-line { stroke: ${axisColor}; stroke-opacity: 0.15; stroke-width: 1; }
</style>`
}

function buildAxes(
  yLabel: string,
  minTime: number,
  maxTime: number,
  maxY: number
): string {
  const axisColor = '#000000'
  const lines: string[] = []

  // Y axis
  lines.push(
    `<line x1="${PADDING.left}" y1="${PADDING.top}" x2="${PADDING.left}" y2="${PADDING.top + PLOT_HEIGHT}" stroke="${axisColor}" stroke-width="1"/>`
  )
  // X axis
  lines.push(
    `<line x1="${PADDING.left}" y1="${PADDING.top + PLOT_HEIGHT}" x2="${PADDING.left + PLOT_WIDTH}" y2="${PADDING.top + PLOT_HEIGHT}" stroke="${axisColor}" stroke-width="1"/>`
  )

  // Y label
  lines.push(
    `<text x="15" y="${PADDING.top + PLOT_HEIGHT / 2}" class="title-label" text-anchor="middle" transform="rotate(-90, 15, ${PADDING.top + PLOT_HEIGHT / 2})">${escapeXml(yLabel)}</text>`
  )

  // X label
  lines.push(
    `<text x="${PADDING.left + PLOT_WIDTH / 2}" y="${CHART_HEIGHT - 10}" class="title-label" text-anchor="middle">Time</text>`
  )

  // Y ticks
  const yTicks = generateYTicks(maxY)
  for (const tick of yTicks) {
    const y = scaleY(tick, maxY)
    lines.push(`<line x1="${PADDING.left}" y1="${y}" x2="${PADDING.left + PLOT_WIDTH}" y2="${y}" class="grid-line"/>`)
    const label = tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick % 1 === 0 ? tick.toString() : tick.toFixed(1)
    lines.push(
      `<text x="${PADDING.left - 8}" y="${y + 4}" class="axis-label" text-anchor="end">${label}</text>`
    )
  }

  // X ticks
  const timeTicks = generateTimeTicks(minTime, maxTime)
  for (const tick of timeTicks) {
    const x = scaleX(tick, minTime, maxTime)
    lines.push(
      `<text x="${x}" y="${PADDING.top + PLOT_HEIGHT + 20}" class="axis-label" text-anchor="middle">${formatTime(tick)}</text>`
    )
  }

  return lines.join('\n')
}

function buildLegend(items: { label: string; color: string }[]): string {
  const lines: string[] = []
  const startX = PADDING.left + 10
  const startY = PADDING.top + 15
  let offsetX = 0

  for (const item of items) {
    lines.push(
      `<rect x="${startX + offsetX}" y="${startY - 8}" width="12" height="12" fill="${item.color}" rx="2"/>`
    )
    lines.push(
      `<text x="${startX + offsetX + 16}" y="${startY + 2}" class="legend-label">${escapeXml(item.label)}</text>`
    )
    offsetX += item.label.length * 7 + 30
  }

  return lines.join('\n')
}

function pointsToPath(
  points: ProcessedStats[],
  minTime: number,
  maxTime: number,
  maxY: number
): string {
  if (points.length === 0) return ''
  const parts: string[] = []
  for (let i = 0; i < points.length; i++) {
    const x = scaleX(points[i].x, minTime, maxTime)
    const y = scaleY(points[i].y, maxY)
    parts.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return parts.join(' ')
}

function svgToDataUrl(svg: string): string {
  const base64 = Buffer.from(svg, 'utf-8').toString('base64')
  return `data:image/svg+xml;base64,${base64}`
}

function generateId(): string {
  return `chart-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function generateLineChart(
  yLabel: string,
  line: LineConfig
): GraphResponse {
  const points = line.points
  if (points.length === 0) {
    return { id: generateId(), url: '' }
  }

  const minTime = points[0].x
  const maxTime = points[points.length - 1].x
  const rawMaxY = Math.max(...points.map(p => p.y), 0)
  const maxY = computeNiceMax(rawMaxY)

  const pathD = pointsToPath(points, minTime, maxTime, maxY)

  const svg = [
    buildSvgHeader(),
    buildAxes(yLabel, minTime, maxTime, maxY),
    buildLegend([{ label: line.label, color: line.color }]),
    `<path d="${pathD}" fill="none" stroke="${line.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`,
    '</svg>'
  ].join('\n')

  return { id: generateId(), url: svgToDataUrl(svg) }
}

export function generateStackedAreaChart(
  yLabel: string,
  areas: AreaConfig[]
): GraphResponse {
  if (areas.length === 0 || areas[0].points.length === 0) {
    return { id: generateId(), url: '' }
  }

  const allPoints = areas[0].points
  const minTime = allPoints[0].x
  const maxTime = allPoints[allPoints.length - 1].x

  // Compute stacked max
  let rawMaxY = 0
  for (let i = 0; i < allPoints.length; i++) {
    let sum = 0
    for (const area of areas) {
      if (i < area.points.length) {
        sum += area.points[i].y
      }
    }
    rawMaxY = Math.max(rawMaxY, sum)
  }
  const maxY = computeNiceMax(rawMaxY)

  const svgParts: string[] = [
    buildSvgHeader(),
    buildAxes(yLabel, minTime, maxTime, maxY),
    buildLegend(areas.map(a => ({ label: a.label, color: a.color })))
  ]

  // Build stacked areas from bottom to top
  // First compute cumulative sums
  const numPoints = allPoints.length
  const cumulative: number[][] = Array.from({ length: areas.length + 1 }, () =>
    new Array(numPoints).fill(0)
  )

  for (let areaIdx = 0; areaIdx < areas.length; areaIdx++) {
    for (let i = 0; i < numPoints; i++) {
      const val = areaIdx < areas.length && i < areas[areaIdx].points.length
        ? areas[areaIdx].points[i].y
        : 0
      cumulative[areaIdx + 1][i] = cumulative[areaIdx][i] + val
    }
  }

  // Draw areas in reverse order (top layers first so bottom layers paint over)
  for (let areaIdx = areas.length - 1; areaIdx >= 0; areaIdx--) {
    const topPoints: string[] = []
    const bottomPoints: string[] = []

    for (let i = 0; i < numPoints; i++) {
      const x = scaleX(allPoints[i].x, minTime, maxTime)
      const yTop = scaleY(cumulative[areaIdx + 1][i], maxY)
      const yBottom = scaleY(cumulative[areaIdx][i], maxY)
      topPoints.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${yTop.toFixed(1)}`)
      bottomPoints.unshift(`L${x.toFixed(1)},${yBottom.toFixed(1)}`)
    }

    const pathD = topPoints.join(' ') + ' ' + bottomPoints.join(' ') + ' Z'
    svgParts.push(
      `<path d="${pathD}" fill="${areas[areaIdx].color}" stroke="${areas[areaIdx].color.replace(/99$/, '')}" stroke-width="1" opacity="0.85"/>`
    )
  }

  svgParts.push('</svg>')

  return { id: generateId(), url: svgToDataUrl(svgParts.join('\n')) }
}
