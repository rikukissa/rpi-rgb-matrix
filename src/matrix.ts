import { LedMatrix, GpioMapping, LedMatrixInstance } from "rpi-led-matrix"

let cachedMatrix: LedMatrixInstance

function drawBufferToDevMatrix() {
  console.log("Not rendering anything in dev mode")
}
export type Animation = Array<{
  buffer: Uint8Array
  delay: number
}>

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

export function playAnimation(animation: Animation) {
  if (process.env.NODE_ENV !== "production") {
    return drawBufferToDevMatrix()
  }
  let matrix: LedMatrixInstance
  clearTimeout(retryTimeout)
  try {
    matrix = getMatrix()
  } catch (error) {
    console.log("Matrix creating failed. Trying again in 10 seconds")
    retryTimeout = setTimeout(() => playAnimation(animation), 3000)
    return
  }
  let frame = 0
  matrix.afterSync((mat, dt, t) => {
    const frameData = animation[frame % animation.length]
    matrix
      .clear()
      .brightness(30)
      .drawBuffer(Buffer.of(...frameData.buffer), 32, 32)
    frame++
    setTimeout(() => matrix.sync(), frameData.delay)
  })

  matrix.sync()
}

let retryTimeout: NodeJS.Timeout
export function drawBuffer(array: Uint8Array) {
  if (process.env.NODE_ENV !== "production") {
    return drawBufferToDevMatrix()
  }
  clearTimeout(retryTimeout)
  let matrix: LedMatrixInstance

  try {
    matrix = getMatrix()
  } catch (error) {
    console.log("Matrix creating failed. Trying again in 10 seconds")
    retryTimeout = setTimeout(() => drawBuffer(array), 3000)
    return
  }

  console.log("Drawing buffer")
  matrix
    .clear()
    .brightness(30)
    .drawBuffer(Buffer.of(...array), 32, 32)
  matrix.sync()
}
