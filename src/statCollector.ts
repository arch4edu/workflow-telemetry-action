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
  const { activeMemoryX, availableMemoryX } = await getMemoryStats()
  const { networkReadX, networkWriteX } = await getNetworkStats()
  const { diskReadX, diskWriteX } = await getDiskStats()
  const { diskAvailableX, diskUsedX } = await getDiskSizeStats()

  // CPU: total load = user + system
  const cpuTotalLoad: ProcessedStats[] | null =
    userLoadX && userLoadX.length && systemLoadX && systemLoadX.length
      ? userLoadX.map((u, i) => ({
          x: u.x,
          y: u.y + (systemLoadX[i]?.y || 0)
        }))
      : null

  const cpuLoad = cpuTotalLoad
    ? generateChart('CPU Load (%)', 'Percentage', [
        { label: 'Total', points: cpuTotalLoad }
      ], { yMax: 100 })
    : null

  // Memory: used amount only
  const memoryUsage =
    activeMemoryX && activeMemoryX.length
      ? generateChart('Memory Usage (MB)', 'MB', [
          { label: 'Used', points: activeMemoryX }
        ])
      : null

  // Network IO: read + write as two lines
  const networkIO =
    networkReadX && networkReadX.length && networkWriteX && networkWriteX.length
      ? generateChart('Network I/O (MB)', 'MB', [
          { label: 'Read', points: networkReadX },
          { label: 'Write', points: networkWriteX }
        ])
      : null

  // Disk IO: read + write as two lines
  const diskIO =
    diskReadX && diskReadX.length && diskWriteX && diskWriteX.length
      ? generateChart('Disk I/O (MB)', 'MB', [
          { label: 'Read', points: diskReadX },
          { label: 'Write', points: diskWriteX }
        ])
      : null

  // Disk size: used amount only
  const diskSizeUsage =
    diskUsedX && diskUsedX.length
      ? generateChart('Disk Usage (MB)', 'MB', [
          { label: 'Used', points: diskUsedX }
        ])
      : null

  const items: ReportItem[] = []
  if (cpuLoad) {
    items.push({ type: 'heading', content: '### CPU Metrics' })
    items.push({ type: 'chart', chart: cpuLoad })
  }
  if (memoryUsage) {
    items.push({ type: 'heading', content: '### Memory Metrics' })
    items.push({ type: 'chart', chart: memoryUsage })
  }
  if (networkIO || diskIO) {
    items.push({ type: 'heading', content: '### IO Metrics' })
    if (networkIO) {
      items.push({ type: 'text', content: '**Network I/O**' })
      items.push({ type: 'chart', chart: networkIO })
    }
    if (diskIO) {
      items.push({ type: 'text', content: '**Disk I/O**' })
      items.push({ type: 'chart', chart: diskIO })
    }
  }
  if (diskSizeUsage) {
    items.push({ type: 'heading', content: '### Disk Size Metrics' })
    items.push({ type: 'chart', chart: diskSizeUsage })
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

async function getMemoryStats(): Promise<ProcessedMemoryStats> {
  const activeMemoryX: ProcessedStats[] = []
  const availableMemoryX: ProcessedStats[] = []

  logger.debug('Getting memory stats ...')
  const response = await axios.get(
    `http://127.0.0.1:${STAT_SERVER_PORT}/memory`
  )
  if (logger.isDebugEnabled()) {
    logger.debug(`Got memory stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: MemoryStats) => {
    activeMemoryX.push({
      x: element.time,
      y:
        element.activeMemoryMb && element.activeMemoryMb > 0
          ? element.activeMemoryMb
          : 0
    })

    availableMemoryX.push({
      x: element.time,
      y:
        element.availableMemoryMb && element.availableMemoryMb > 0
          ? element.availableMemoryMb
          : 0
    })
  })

  return { activeMemoryX, availableMemoryX }
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

async function getDiskSizeStats(): Promise<ProcessedDiskSizeStats> {
  const diskAvailableX: ProcessedStats[] = []
  const diskUsedX: ProcessedStats[] = []

  logger.debug('Getting disk size stats ...')
  const response = await axios.get(
    `http://127.0.0.1:${STAT_SERVER_PORT}/disk_size`
  )
  if (logger.isDebugEnabled()) {
    logger.debug(`Got disk size stats: ${JSON.stringify(response.data)}`)
  }

  response.data.forEach((element: DiskSizeStats) => {
    diskAvailableX.push({
      x: element.time,
      y:
        element.availableSizeMb && element.availableSizeMb > 0
          ? element.availableSizeMb
          : 0
    })

    diskUsedX.push({
      x: element.time,
      y: element.usedSizeMb && element.usedSizeMb > 0 ? element.usedSizeMb : 0
    })
  })

  return { diskAvailableX, diskUsedX }
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
