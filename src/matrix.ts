import { LedMatrix, GpioMapping, LedMatrixInstance } from "rpi-led-matrix"

let cachedMatrix: LedMatrixInstance

type Image = { type: "image"; data: Uint8Array }

export type Animation = {
  type: "animation"
  data: Array<{
    buffer: Uint8Array
    delay: number
  }>
}

let queueLoopRunning = false

const queue: Array<Animation | Image> = []

function pushToQueue(item: Animation | Image) {
  if (!queueLoopRunning) {
    queueHandler()
    queueLoopRunning = true
  }
  queue.push(item)
}

function drawBufferToDevMatrix() {
  console.log("Not rendering anything in dev mode")
}

let retryTimeout: NodeJS.Timeout
function queueHandler() {
  let matrix: LedMatrixInstance
  clearTimeout(retryTimeout)

  try {
    matrix = getMatrix()
  } catch (error) {
    console.log("Matrix creating failed. Trying again in 10 seconds")
    retryTimeout = setTimeout(() => queueHandler(), 3000)
    return
  }

  let animationFrame = 0
  let currentStartedShowing = Date.now()

  matrix.afterSync((mat, dt, t) => {
    if (queue.length === 0) {
      setTimeout(() => matrix.sync(), 0)
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
      queue.shift()
      currentQueueItem = queue[0]
      animationFrame = 0
      currentStartedShowing = Date.now()
    }

    if (currentQueueItem.type === "animation") {
      const frameData =
        currentQueueItem.data[animationFrame % currentQueueItem.data.length]
      matrix
        .clear()
        .brightness(30)
        .drawBuffer(Buffer.of(...frameData.buffer), 32, 32)
      animationFrame++
      setTimeout(() => matrix.sync(), frameData.delay)
    }
    if (currentQueueItem.type === "image") {
      matrix
        .clear()
        .brightness(30)
        .drawBuffer(Buffer.of(...currentQueueItem.data), 32, 32)
      setTimeout(() => matrix.sync(), 0)
    }
  })

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
      gpioSlowdown: 1,
    }
  )
  console.log("Matrix created")
  return cachedMatrix
}

export function playAnimation(animation: Animation["data"]) {
  if (process.env.NODE_ENV !== "production") {
    return drawBufferToDevMatrix()
  }
  pushToQueue({ type: "animation", data: animation })
}

export function drawImage(array: Uint8Array) {
  if (process.env.NODE_ENV !== "production") {
    return drawBufferToDevMatrix()
  }
  pushToQueue({ type: "image", data: array })
}
