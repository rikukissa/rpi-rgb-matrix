import http from "http"
import Jimp from "jimp"
import { join } from "path"
import { drawBuffer, playAnimation, Animation } from "./matrix"
import { parseGIF, decompressFrames } from "gifuct-js"
import { readFileSync } from "fs"

function removeAlpha(array: Uint8Array) {
  const result = []

  for (let i = 0; i < array.length; i++) {
    if ((i + 1) % 4 === 0) {
      continue
    }
    result.push(array[i])
  }

  return new Uint8Array(result)
}

function prepareImageForMatrix(jimp: Jimp) {
  const resized = jimp.resize(32, 32)
  const colorArray = new Uint8Array(resized.colorType(0).bitmap.data.buffer)

  const nonAlphaImage = removeAlpha(colorArray)
  return nonAlphaImage
}

let currentImage: Uint8Array | null = null
async function loadDefaultImage() {
  const jimp = await Jimp.read(join(__dirname, "../diamond.png"))
  currentImage = prepareImageForMatrix(jimp)
  drawBuffer(currentImage)
}
async function loadDefaultGif() {
  const buffer = readFileSync(join(__dirname, "../mario_walk.gif"))
  handleGif(buffer)
}
// loadDefaultImage()
loadDefaultGif()

async function handleGif(buffer: ArrayBuffer) {
  const frames = decompressFrames(parseGIF(buffer), true)

  const resizedFrames: Animation = []
  for (const frame of frames) {
    const image = await Jimp.create(frame.dims.width, frame.dims.height)

    for (let x = 0; x < frame.dims.width; x++) {
      for (let y = 0; y < frame.dims.height; y++) {
        const dataIndex = y * frame.dims.height + x
        const [r, g, b] = frame.colorTable[frame.pixels[dataIndex]]
        image.setPixelColour(Jimp.rgbaToInt(r, g, b, 255), x, y)
      }
    }
    resizedFrames.push({
      buffer: prepareImageForMatrix(image),
      delay: frame.delay,
    })
  }

  playAnimation(resizedFrames)
}

async function drawHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const chunks: Buffer[] = []
  req.on("data", (chunk) => {
    if (Buffer.concat(chunks).length > 1000000) {
      res.statusCode = 413
      res.end()
      req.destroy()
      return
    }
    chunks.push(chunk)
  })
  req.on("end", async () => {
    try {
      console.log("Reading file to Jimp")

      const jimp = await Jimp.read(Buffer.concat(chunks))
      console.log("Creating a non-transparent bitmap")
      const nonAlphaImage = prepareImageForMatrix(jimp)
      currentImage = nonAlphaImage
    } catch (error) {
      res.statusCode = 400
      res.end()
      return
    }
    try {
      console.log("Drawing the new image")
      drawBuffer(currentImage)
    } catch (error) {
      res.statusCode = 500
      res.end()
      return
    }
    res.statusCode = 200
    res.end()
  })

  res.on("error", () => {
    res.statusCode = 500
    res.end()
  })
}

async function currentImageHandler(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const image = await Jimp.create(32, 32)

  for (let x = 0; x < 32; x++) {
    for (let y = 0; y < 32; y++) {
      const dataIndex = y * 32 * 3 + x * 3

      image.setPixelColour(
        Jimp.rgbaToInt(
          currentImage![dataIndex],
          currentImage![dataIndex + 1],
          currentImage![dataIndex + 2],
          255
        ),
        x,
        y
      )
    }
  }

  const buffer = await image.getBufferAsync(Jimp.MIME_PNG)
  res.setHeader("Content-Type", Jimp.MIME_PNG)
  res.write(buffer)
  res.end()
}

http
  .createServer((req, res) => {
    try {
      if (req.method === "GET" && req.url === "/image") {
        return currentImageHandler(req, res)
      }
      if (req.method === "POST" && req.url === "/draw") {
        return drawHandler(req, res)
      }
    } catch (error) {
      console.error(error)
      res.statusCode = 500
      res.end()
    }
  })
  .listen(process.env.NODE_PORT || 3000)
