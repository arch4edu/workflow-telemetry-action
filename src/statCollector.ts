import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import axios from 'axios'
import * as core from '@actions/core'
import {
  CPUStats,
  DiskSizeStats,
  DiskStats,
  MemoryStats,
  NetworkStats,
  ProcessedCPUStats,
  ProcessedDiskSizeStats,
  ProcessedDiskStats,
  ProcessedMemoryStats,
  ProcessedNetworkStats,
  ProcessedStats,
  WorkflowJobType
} from './interfaces'
import * as logger from './logger'
import { generateChart, ChartResult } from './chartGenerator'

export interface ReportItem {
  type: 'heading' | 'text' | 'chart' | 'table'
  content?: string
  chart?: ChartResult
}

const STAT_SERVER_PORT = 7777

async function triggerStatCollect(): Promise<void> {
  logger.debug('Triggering stat collect ...')
  const response = await axios.post(
    `http://127.0.0.1:${STAT_SERVER_PORT}/collect`
  )
  if (logger.isDebugEnabled()) {
    logger.debug(`Triggered stat collect: ${JSON.stringify(response.data)}`)
  }
}

async function reportWorkflowMetrics(): Promise<ReportItem[]> {
  const { userLoadX, systemLoadX } = await getCPUStats()
  const { memoryPercentX, totalMemoryMb } = await getMemoryStats()
  const { networkReadX, networkWriteX } = await getNetworkStats()
  const { diskReadX, diskWriteX } = await getDiskStats()
  const { diskPercentX, totalDiskMb } = await getDiskSizeStats()

  // CPU core count
  const cpuCount = require('os').cpus().length

  // CPU: total load = user + system
  const cpuTotalLoad: ProcessedStats[] | null =
    userLoadX && userLoadX.length && systemLoadX && systemLoadX.length
      ? userLoadX.map((u, i) => ({
          x: u.x,
          y: u.y + (systemLoadX[i]?.y || 0)
        }))
      : null

  // Combined CPU + Memory + Disk chart (all as percentage)
  const seriesList: Array<{ label: string; points: ProcessedStats[] }> = []
  const colorList: string[] = []
  if (cpuTotalLoad && cpuTotalLoad.length) {
    seriesList.push({ label: '🔴 CPU', points: cpuTotalLoad })
    colorList.push('#ff0000')
  }
  if (memoryPercentX && memoryPercentX.length) {
    seriesList.push({ label: '🔵 Memory', points: memoryPercentX })
    colorList.push('#0000ff')
  }
  if (diskPercentX && diskPercentX.length) {
    seriesList.push({ label: '🟢 Disk', points: diskPercentX })
    colorList.push('#00aa00')
  }

  const mainChart = seriesList.length > 0
    ? generateChart('System Usage (%)', 'Percentage', seriesList, { yMax: 100, colors: colorList })
    : null

  // Combined IO chart: Network + Disk
  const ioSeriesList: Array<{ label: string; points: ProcessedStats[] }> = []
  const ioColorList: string[] = []
  if (networkReadX && networkReadX.length) {
    ioSeriesList.push({ label: '🔴 Net Read', points: networkReadX })
    ioColorList.push('#ff0000')
  }
  if (networkWriteX && networkWriteX.length) {
    ioSeriesList.push({ label: '🔵 Net Write', points: networkWriteX })
    ioColorList.push('#0000ff')
  }
  if (diskReadX && diskReadX.length) {
    ioSeriesList.push({ label: '🟠 Disk Read', points: diskReadX })
    ioColorList.push('#ff8800')
  }
  if (diskWriteX && diskWriteX.length) {
    ioSeriesList.push({ label: '🟢 Disk Write', points: diskWriteX })
    ioColorList.push('#00aa00')
  }

  const ioChart = ioSeriesList.length > 0
    ? generateChart('I/O (MB)', 'MB', ioSeriesList, { colors: ioColorList })
    : null

  const items: ReportItem[] = []
  if (mainChart) {
    items.push({ type: 'heading', content: '### System Metrics' })
    const totalMemGb = (totalMemoryMb / 1024).toFixed(1)
    const totalDiskGb = (totalDiskMb / 1024).toFixed(1)
    items.push({ type: 'text', content: `CPU Cores: **${cpuCount}** | Total Memory: **${totalMemGb} GB** | Total Disk: **${totalDiskGb} GB**` })
    items.push({ type: 'chart', chart: mainChart })
  }
  if (ioChart) {
    items.push({ type: 'heading', content: '### IO Metrics' })
    items.push({ type: 'chart', chart: ioChart })
  }

  return items
}

async function getCPUStats(): Promise<ProcessedCPUStats> {
  const userLoadX: ProcessedStats[] = []
  const systemLoadX: ProcessedStats[] = []

  logger.debug('Getting CPU stats ...')
  const response = await axios.get(`http://127.0.0.1:${STAT_SERVER_PORT}/cpu`)
  if (logger.isDebugEnabled()) {
    logger.debug(`Got CPU stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: CPUStats) => {
    userLoadX.push({
      x: element.time,
      y: element.userLoad && element.userLoad > 0 ? element.userLoad : 0
    })

    systemLoadX.push({
      x: element.time,
      y: element.systemLoad && element.systemLoad > 0 ? element.systemLoad : 0
    })
  })

  return { userLoadX, systemLoadX }
}

async function getMemoryStats(): Promise<ProcessedMemoryStats & { memoryPercentX: ProcessedStats[], totalMemoryMb: number }> {
  const activeMemoryX: ProcessedStats[] = []
  const availableMemoryX: ProcessedStats[] = []
  const memoryPercentX: ProcessedStats[] = []
  let totalMemoryMb = 0

  logger.debug('Getting memory stats ...')
  const response = await axios.get(
    `http://127.0.0.1:${STAT_SERVER_PORT}/memory`
  )
  if (logger.isDebugEnabled()) {
    logger.debug(`Got memory stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: MemoryStats) => {
    if (element.totalMemoryMb && element.totalMemoryMb > 0) {
      totalMemoryMb = element.totalMemoryMb
    }

    const active = element.activeMemoryMb && element.activeMemoryMb > 0
      ? element.activeMemoryMb
      : 0

    activeMemoryX.push({ x: element.time, y: active })

    availableMemoryX.push({
      x: element.time,
      y:
        element.availableMemoryMb && element.availableMemoryMb > 0
          ? element.availableMemoryMb
          : 0
    })

    // Memory usage percentage
    const percent = totalMemoryMb > 0 ? (active / totalMemoryMb) * 100 : 0
    memoryPercentX.push({ x: element.time, y: percent })
  })

  return { activeMemoryX, availableMemoryX, memoryPercentX, totalMemoryMb }
}

async function getNetworkStats(): Promise<ProcessedNetworkStats> {
  const networkReadX: ProcessedStats[] = []
  const networkWriteX: ProcessedStats[] = []

  logger.debug('Getting network stats ...')
  const response = await axios.get(
    `http://127.0.0.1:${STAT_SERVER_PORT}/network`
  )
  if (logger.isDebugEnabled()) {
    logger.debug(`Got network stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: NetworkStats) => {
    networkReadX.push({
      x: element.time,
      y: element.rxMb && element.rxMb > 0 ? element.rxMb : 0
    })

    networkWriteX.push({
      x: element.time,
      y: element.txMb && element.txMb > 0 ? element.txMb : 0
    })
  })

  return { networkReadX, networkWriteX }
}

async function getDiskStats(): Promise<ProcessedDiskStats> {
  const diskReadX: ProcessedStats[] = []
  const diskWriteX: ProcessedStats[] = []

  logger.debug('Getting disk stats ...')
  const response = await axios.get(`http://127.0.0.1:${STAT_SERVER_PORT}/disk`)
  if (logger.isDebugEnabled()) {
    logger.debug(`Got disk stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: DiskStats) => {
    diskReadX.push({
      x: element.time,
      y: element.rxMb && element.rxMb > 0 ? element.rxMb : 0
    })

    diskWriteX.push({
      x: element.time,
      y: element.wxMb && element.wxMb > 0 ? element.wxMb : 0
    })
  })

  return { diskReadX, diskWriteX }
}

async function getDiskSizeStats(): Promise<ProcessedDiskSizeStats & { diskPercentX: ProcessedStats[], totalDiskMb: number }> {
  const diskAvailableX: ProcessedStats[] = []
  const diskUsedX: ProcessedStats[] = []
  const diskPercentX: ProcessedStats[] = []
  let totalDiskMb = 0

  logger.debug('Getting disk size stats ...')
  const response = await axios.get(
    `http://127.0.0.1:${STAT_SERVER_PORT}/disk_size`
  )
  if (logger.isDebugEnabled()) {
    logger.debug(`Got disk size stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: DiskSizeStats) => {
    const used = element.usedSizeMb && element.usedSizeMb > 0 ? element.usedSizeMb : 0
    const available = element.availableSizeMb && element.availableSizeMb > 0 ? element.availableSizeMb : 0
    const total = used + available
    if (total > 0) totalDiskMb = total

    diskAvailableX.push({ x: element.time, y: available })
    diskUsedX.push({ x: element.time, y: used })
    diskPercentX.push({ x: element.time, y: total > 0 ? (used / total) * 100 : 0 })
  })

  return { diskAvailableX, diskUsedX, diskPercentX, totalDiskMb }
}

///////////////////////////

export async function start(): Promise<boolean> {
  logger.info(`Starting stat collector ...`)

  try {
    let metricFrequency = 0
    const metricFrequencyInput: string = core.getInput('metric_frequency')
    if (metricFrequencyInput) {
      const metricFrequencyVal: number = parseInt(metricFrequencyInput)
      if (Number.isInteger(metricFrequencyVal)) {
        metricFrequency = metricFrequencyVal * 1000
      }
    }

    const child: ChildProcess = spawn(
      process.argv[0],
      [path.join(__dirname, '../scw/index.js')],
      {
        detached: true,
        stdio: 'ignore',
        env: {
          ...process.env,
          WORKFLOW_TELEMETRY_STAT_FREQ: metricFrequency
            ? `${metricFrequency}`
            : undefined
        }
      }
    )
    child.unref()

    logger.info(`Started stat collector`)

    return true
  } catch (error: any) {
    logger.error('Unable to start stat collector')
    logger.error(error)

    return false
  }
}

export async function finish(currentJob: WorkflowJobType): Promise<boolean> {
  logger.info(`Finishing stat collector ...`)

  try {
    // Trigger stat collect, so we will have remaining stats since the latest schedule
    await triggerStatCollect()

    logger.info(`Finished stat collector`)

    return true
  } catch (error: any) {
    logger.error('Unable to finish stat collector')
    logger.error(error)

    return false
  }
}

export async function report(
  currentJob: WorkflowJobType
): Promise<ReportItem[] | null> {
  logger.info(`Reporting stat collector result ...`)

  try {
    const items: ReportItem[] = await reportWorkflowMetrics()

    logger.info(`Reported stat collector result`)

    return items
  } catch (error: any) {
    logger.error('Unable to report stat collector result')
    logger.error(error)

    return null
  }
}
