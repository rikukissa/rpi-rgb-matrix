require("dotenv").config()

import http from "http"
import Jimp from "jimp"
import { join } from "path"
import { readFileSync, existsSync, createReadStream } from "fs"
import { Animation, pushToQueue, Image, getQueue } from "./matrix"
import { parseGIF, decompressFrames } from "gifuct-js"

import "./telegram"
import { writeFile } from "fs/promises"
import { prepareImageForMatrix } from "./util"

export async function resizeGif(buffer: ArrayBuffer) {
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
  return resizedFrames
}

async function drawHandler(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const chunks: Buffer[] = []

  req.on("data", (chunk) => {
    if (
      Buffer.concat(chunks).length > 1000000 &&
      req.headers["content-type"] !== "application/json"
    ) {
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
        const frames = await resizeGif(data)
        pushToQueue({ type: "animation", data: frames })
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
        pushToQueue({ type: "image", data: data })
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

async function clientHandler(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  res.setHeader("Content-Type", "text/html")
  res.write(readFileSync(join(__dirname, "../client/index.html")))
  res.end()
  return
}

async function currentQueueHandler(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  res.setHeader("Content-Type", "application/json")
  res.write(JSON.stringify(getQueue(), null, 2))
  res.end()
  return
}
async function currentImageHandler(
  _req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const currentBufferItem = getQueue()[0]
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
    res.setHeader("Access-Control-Allow-Origin", "*")

    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    )
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE")

    if (req.method === "OPTIONS") {
      res.writeHead(204).end()
      return
    }

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress
    console.log(ip, req.method, req.url)

    try {
      if (req.method === "GET" && req.url?.startsWith("/image")) {
        return currentImageHandler(req, res)
      }
      if (req.method === "GET" && req.url?.startsWith("/queue")) {
        return currentQueueHandler(req, res)
      }
      if (req.method === "GET") {
        return clientHandler(req, res)
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

async function loadDefaultGif() {
  if (!existsSync(join(__dirname, "../current.gif"))) {
    return
  }
  const data = readFileSync(join(__dirname, "../current.gif"))
  const frames = await resizeGif(data)
  pushToQueue({ type: "animation", data: frames })
}

loadDefaultGif()
