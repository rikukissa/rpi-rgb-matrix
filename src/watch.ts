require("dotenv").config()
import axios from "axios"
import { createCanvas, registerFont } from "canvas"
import { join } from "path"
import { format } from "date-fns"
import { removeAlpha } from "./util"

const DRAW_ENDPOINT = process.env.DRAW_ENDPOINT!

registerFont(join(__dirname, "../thin_pixel-7.ttf"), {
  family: "VT323",
})

async function main() {
  const canvas = createCanvas(32, 32)
  const ctx = canvas.getContext("2d")

  ctx.strokeStyle = "#ccc"
  ctx.font = "20px VT323"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const date = format(new Date(), "h:mm")

  ctx.fillStyle = "#fff"
  ctx.translate(16, 16)
  ctx.fillText(date, 0, 0)

  axios.post(DRAW_ENDPOINT, {
    type: "image",
    data: removeAlpha(ctx.getImageData(0, 0, 32, 32).data),
  })
}
main()
