require("dotenv").config()

import axios from "axios"
import Jimp from "jimp"
import { removeAlpha } from "./util"

const DRAW_ENDPOINT = process.env.DRAW_ENDPOINT!

async function main() {
  const jimp = new Jimp(32, 32, 0xffffffff)

  const image = await Jimp.read(__dirname + "/../qr.png")

  // Calculate the position to center the image
  const x = (32 - image.bitmap.width) / 2
  const y = (32 - image.bitmap.height) / 2

  // Composite the image onto the canvas
  jimp.composite(image, x, y)

  const data = removeAlpha(Uint8ClampedArray.from(jimp.bitmap.data))

  axios.post(DRAW_ENDPOINT, {
    type: "image",
    data: data,
    priority: 1,
  })
}
main()
