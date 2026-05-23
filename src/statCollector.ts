import { ChildProcess, spawn } from 'child_process'
import path from 'path'
import axios from 'axios'
import * as core from '@actions/core'
import {
  CPUStats,
  DiskSizeStats,
  DiskStats,
  LineGraphOptions,
  MemoryStats,
  NetworkStats,
  ProcessedCPUStats,
  ProcessedDiskSizeStats,
  ProcessedDiskStats,
  ProcessedMemoryStats,
  ProcessedNetworkStats,
  ProcessedStats,
  StackedAreaGraphOptions,
  WorkflowJobType
} from './interfaces'
import * as logger from './logger'
import { generateLineChart, generateStackedAreaChart, ChartResult } from './chartGenerator'

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

  const cpuLoad =
    userLoadX && userLoadX.length && systemLoadX && systemLoadX.length
      ? getStackedAreaGraph({
          label: 'CPU Load (%)',
          areas: [
            {
              label: 'User Load',
              color: '#e41a1c99',
              points: userLoadX
            },
            {
              label: 'System Load',
              color: '#ff7f0099',
              points: systemLoadX
            }
          ]
        })
      : null

  const memoryUsage =
    activeMemoryX &&
    activeMemoryX.length &&
    availableMemoryX &&
    availableMemoryX.length
      ? getStackedAreaGraph({
          label: 'Memory Usage (MB)',
          areas: [
            {
              label: 'Used',
              color: '#377eb899',
              points: activeMemoryX
            },
            {
              label: 'Free',
              color: '#4daf4a99',
              points: availableMemoryX
            }
          ]
        })
      : null

  const networkIORead =
    networkReadX && networkReadX.length
      ? getLineGraph({
          label: 'Network I/O Read (MB)',
          line: {
            label: 'Read',
            color: '#be4d25',
            points: networkReadX
          }
        })
      : null

  const networkIOWrite =
    networkWriteX && networkWriteX.length
      ? getLineGraph({
          label: 'Network I/O Write (MB)',
          line: {
            label: 'Write',
            color: '#6c25be',
            points: networkWriteX
          }
        })
      : null

  const diskIORead =
    diskReadX && diskReadX.length
      ? getLineGraph({
          label: 'Disk I/O Read (MB)',
          line: {
            label: 'Read',
            color: '#be4d25',
            points: diskReadX
          }
        })
      : null

  const diskIOWrite =
    diskWriteX && diskWriteX.length
      ? getLineGraph({
          label: 'Disk I/O Write (MB)',
          line: {
            label: 'Write',
            color: '#6c25be',
            points: diskWriteX
          }
        })
      : null

  const diskSizeUsage =
    diskUsedX && diskUsedX.length && diskAvailableX && diskAvailableX.length
      ? getStackedAreaGraph({
          label: 'Disk Usage (MB)',
          areas: [
            {
              label: 'Used',
              color: '#377eb899',
              points: diskUsedX
            },
            {
              label: 'Free',
              color: '#4daf4a99',
              points: diskAvailableX
            }
          ]
        })
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
  if ((networkIORead && networkIOWrite) || (diskIORead && diskIOWrite)) {
    items.push({ type: 'heading', content: '### IO Metrics' })
    const tableLines: string[] = [
      '|               | Read      | Write     |',
      '|---            |---        |---        |'
    ]
    if (networkIORead && networkIOWrite) {
      tableLines.push(
        `| Network I/O   | (read chart)        | (write chart)        |`
      )
      items.push({ type: 'chart', chart: networkIORead })
      items.push({ type: 'chart', chart: networkIOWrite })
    }
    if (diskIORead && diskIOWrite) {
      tableLines.push(
        `| Disk I/O      | (read chart)              | (write chart)              |`
      )
      items.push({ type: 'chart', chart: diskIORead })
      items.push({ type: 'chart', chart: diskIOWrite })
    }
    items.push({ type: 'table', content: tableLines.join('\n') })
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

function getLineGraph(options: LineGraphOptions): ChartResult {
  return generateLineChart(options.label, options.line)
}

function getStackedAreaGraph(
  options: StackedAreaGraphOptions
): ChartResult {
  return generateStackedAreaChart(options.label, options.areas)
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
