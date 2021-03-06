import { LedMatrix, GpioMapping, LedMatrixInstance } from "rpi-led-matrix"

let cachedMatrix: LedMatrixInstance

type QueueItem = { immediate?: boolean; validUntil?: Date; priority?: number }

export type Image = QueueItem & { type: "image"; data: Uint8Array }

export type Animation = QueueItem & {
  type: "animation"
  data: Array<{
    buffer: Uint8Array
    delay: number
  }>
}

let queueLoopRunning = false

export let queue: Array<Animation | Image> = []

const MS_TILL_DIM = 1000 * 60 * 5 // 5 min

function printQueue(q: typeof queue) {
  console.log(
    JSON.stringify(
      queue.map((item) => ({ ...item, data: "" })),
      null,
      2
    )
  )
}

const ALLOWED_BYTE_SIZE = 32 * 32 * 3
export function pushToQueue(item: Animation | Image) {
  if (item.type === "animation") {
    for (const frame of item.data) {
      if (frame.buffer.length !== ALLOWED_BYTE_SIZE) {
        throw new Error("Animation frames have invalid size")
      }
    }
  }
  if (item.type === "image") {
    if (item.data.length !== ALLOWED_BYTE_SIZE) {
      throw new Error("Animation frames have invalid size")
    }
  }
  if (process.env.NODE_ENV !== "production") {
    queue.push(item)
    return
  }

  queue.push(item)
  if (!queueLoopRunning) {
    queueHandler()
    queueLoopRunning = true
  }
}

let retryTimeout: NodeJS.Timeout
let matrix: LedMatrixInstance

function queueHandler() {
  clearTimeout(retryTimeout)

  if (!matrix) {
    try {
      matrix = getMatrix()
    } catch (error) {
      console.error(error)
      console.log("Matrix creating failed. Trying again in 10 seconds")
      retryTimeout = setTimeout(() => queueHandler(), 3000)
      return
    }
  }

  let animationFrame = 0
  let currentStartedShowing = Date.now()

  function sync() {
    if (queue.length === 0) {
      queueLoopRunning = false
      return
    }

    let currentQueueItem = queue[0]

    const timeToChange =
      queue.length > 1 &&
      ((currentQueueItem.type === "animation" &&
        animationFrame >= currentQueueItem.data.length) ||
        (currentQueueItem.type === "image" &&
          Date.now() - currentStartedShowing > 3000))

    if (timeToChange) {
      queue = queue
        .slice(1)
        .filter(
          (item) => !item.validUntil || new Date(item.validUntil) > new Date()
        )
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      printQueue(queue)
      currentQueueItem = queue[0]
      animationFrame = 0
      currentStartedShowing = Date.now()
    }

    const dimming = ((Date.now() - currentStartedShowing) / MS_TILL_DIM) * 70

    if (dimming === 70) {
      queueLoopRunning = false
      return
    }

    if (currentQueueItem.type === "animation") {
      const frameData =
        currentQueueItem.data[animationFrame % currentQueueItem.data.length]
      matrix
        .clear()
        .brightness(Math.max(0, 70 - dimming))
        .drawBuffer(Buffer.of(...frameData.buffer), 32, 32)
      animationFrame++
      setTimeout(() => matrix.sync(), frameData.delay)
    }
    if (currentQueueItem.type === "image") {
      matrix
        .clear()
        .brightness(Math.max(0, 70 - dimming))
        .drawBuffer(Buffer.of(...currentQueueItem.data), 32, 32)
      setTimeout(() => matrix.sync(), 5000)
    }
  }

  matrix.afterSync((mat, dt, t) => sync())

  matrix.sync()
}

function getMatrix() {
  if (cachedMatrix) {
    return cachedMatrix
  }

  console.log("Creating matrix")
  cachedMatrix = new LedMatrix(
    {
      ...LedMatrix.defaultMatrixOptions(),
      rows: 32,
      cols: 32,
      chainLength: 1,
      hardwareMapping: GpioMapping.AdafruitHat,
    },
    {
      ...LedMatrix.defaultRuntimeOptions(),
      gpioSlowdown: 4,
    }
  )
  console.log("Matrix created")
  return cachedMatrix
}
