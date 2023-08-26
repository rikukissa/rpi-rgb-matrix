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

const MS_TILL_DIM = 1000 * 60 * 15 // 5 min

export function getQueue() {
  return queue
}

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
let queueHandle: ReturnType<typeof queueHandler>

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

  if (item.immediate) {
    console.log("Received immediate item")
    queue = [item]

    if (queueHandle) {
      console.log("Changing queue immediately")
      queueHandle.syncImmediately()
    }
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
  let syncTimeout: NodeJS.Timeout

  function sync() {
    if (queue.length === 0) {
      queueLoopRunning = false
      return
    }

    let currentQueueItem = queue[0]

    const timeToChange =
      (queue.length > 1 &&
        currentQueueItem.type === "animation" &&
        animationFrame >= currentQueueItem.data.length) ||
      (queue.length > 1 &&
        currentQueueItem.type === "image" &&
        Date.now() - currentStartedShowing > 3000) ||
      (queue.length > 1 && queue[0].immediate)

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
        // .brightness(Math.max(0, 70 - dimming))
        .drawBuffer(Buffer.of(...frameData.buffer), 32, 32)
      animationFrame++
      syncTimeout = setTimeout(() => matrix.sync(), frameData.delay)
    }
    if (currentQueueItem.type === "image") {
      console.log("Drawing new buffer")
      matrix
        .clear()
        // .brightness(Math.max(0, 70 - dimming))
        .drawBuffer(Buffer.of(...currentQueueItem.data), 32, 32)
      syncTimeout = setTimeout(
        () => matrix.sync(),
        currentQueueItem.immediate ? 0 : 5000
      )
    }
  }

  matrix.afterSync((mat, dt, t) => sync())

  matrix.sync()

  return {
    syncImmediately: () => {
      if (syncTimeout) {
        clearTimeout(syncTimeout)
      }
      sync()
    },
  }
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
