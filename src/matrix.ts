import { LedMatrix, GpioMapping, LedMatrixInstance } from "rpi-led-matrix"

let matrix: LedMatrixInstance
let retryTimeout: NodeJS.Timeout

function drawBufferToDevMatrix(array: Uint8Array) {
  console.log("Not rendering anything in dev mode")
}

export function drawBuffer(array: Uint8Array) {
  if (process.env.NODE_ENV !== "production") {
    return drawBufferToDevMatrix(array)
  }
  clearTimeout(retryTimeout)
  if (!matrix) {
    try {
      console.log("Creating matrix")
      matrix = new LedMatrix(
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
    } catch (error) {
      console.log("Matrix creating failed. Trying again in 10 seconds")

      retryTimeout = setTimeout(() => drawBuffer(array), 10000)
    }
    matrix
      .clear()
      .brightness(30)
      .drawBuffer(Buffer.of(...array), 32, 32)
    matrix.sync()
  }
}
