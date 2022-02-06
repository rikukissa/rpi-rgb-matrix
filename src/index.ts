import http from "http"
import Jimp from "jimp"
import { join } from "path"
import { writeFileSync, readFileSync, existsSync, createReadStream } from "fs"
import {
  drawImage,
  playAnimation,
  Animation,
  queue,
  pushToQueue,
  Image,
} from "./matrix"
import { parseGIF, decompressFrames } from "gifuct-js"

import "./telegram"
import { writeFile } from "fs/promises"

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

export async function handleGif(buffer: ArrayBuffer) {
  const frames = decompressFrames(parseGIF(buffer), true)

  const resizedFrames: Animation["data"] = []

  let prevImage

  for (const frame of frames) {
    let image = await Jimp.create(frames[0].dims.width, frames[0].dims.height)

    for (let x = 0; x < frame.dims.width; x++) {
      for (let y = 0; y < frame.dims.height; y++) {
        const dataIndex = y * frame.dims.width * 4 + x * 4

        image.setPixelColour(
          Jimp.rgbaToInt(
            frame.patch[dataIndex + 0],
            frame.patch[dataIndex + 1],
            frame.patch[dataIndex + 2],
            frame.patch[dataIndex + 3]
          ),
          x + frame.dims.left,
          y + frame.dims.top
        )
      }
    }
    if (prevImage && frame.disposalType !== 2) {
      image = prevImage.composite(image, 0, 0)
    }

    prevImage = image

    resizedFrames.push({
      buffer: prepareImageForMatrix(image.clone()),
      delay: frame.delay,
    })
  }

  playAnimation(resizedFrames)
}

export async function handleImage(data: Buffer) {
  console.log("Reading an image file to Jimp")
  const jimp = await Jimp.read(data)
  console.log("Creating a non-transparent bitmap")
  const nonAlphaImage = prepareImageForMatrix(jimp)
  console.log("Drawing the new image")
  writeFileSync(join(__dirname, "../current.png"), data)
  drawImage(nonAlphaImage)
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
      const data = Buffer.concat(chunks)
      if (req.headers["content-type"] === "image/gif") {
        console.log("Submitting a gif to buffer")
        await writeFile(join(__dirname, "../current.gif"), data)
        handleGif(data)
      } else if (req.headers["content-type"] === "application/json") {
        const data: Animation | Image = JSON.parse(
          Buffer.concat(chunks).toString()
        )

        if (data.type === "image") {
          data.data = Buffer.from(data.data)
        }
        if (data.type === "animation") {
          data.data.forEach((frame) => {
            frame.buffer = Buffer.from(frame.buffer)
          })
        }
        pushToQueue(data)
      } else {
        handleImage(data)
      }
    } catch (error) {
      console.error(error)
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
  const currentBufferItem = queue[0]
  if (!currentBufferItem) {
    res.statusCode = 404
    res.end()
    return
  }

  const imageFrameData =
    currentBufferItem.type === "image"
      ? [currentBufferItem.data]
      : currentBufferItem.data.map((i) => i.buffer)

  const image = await Jimp.create(32 * imageFrameData.length, 32)

  for (let i = 0; i < imageFrameData.length; i++) {
    const imageData = imageFrameData[i]
    for (let x = 0; x < 32; x++) {
      for (let y = 0; y < 32; y++) {
        const dataIndex = y * 32 * 3 + x * 3

        image.setPixelColour(
          Jimp.rgbaToInt(
            imageData[dataIndex],
            imageData[dataIndex + 1],
            imageData[dataIndex + 2],
            255
          ),
          i * 32 + x,
          y
        )
      }
    }
  }
  const buffer = await image.getBufferAsync(Jimp.MIME_PNG)
  res.setHeader("Content-Type", Jimp.MIME_PNG)
  res.write(buffer)
  res.end()
  return
}

http
  .createServer((req, res) => {
    try {
      if (req.method === "GET" && req.url?.startsWith("/image")) {
        return currentImageHandler(req, res)
      }
      if (req.method === "POST" && req.url === "/queue") {
        return drawHandler(req, res)
      }

      return createReadStream(join(__dirname, "../index.html")).pipe(res)
    } catch (error) {
      console.error(error)
      res.statusCode = 500
      res.end()
    }
  })
  .listen(process.env.NODE_PORT || 3000)

let currentImage: Uint8Array | null = null
async function loadDefaultImage() {
  if (!existsSync(join(__dirname, "../current.png"))) {
    return
  }
  const jimp = await Jimp.read(join(__dirname, "../current.png"))
  currentImage = prepareImageForMatrix(jimp)
  drawImage(currentImage)
}
async function loadDefaultGif() {
  if (!existsSync(join(__dirname, "../current.gif"))) {
    return
  }
  const buffer = readFileSync(join(__dirname, "../current.gif"))
  handleGif(buffer)
}

loadDefaultGif()
// loadDefaultImage()
