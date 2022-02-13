require("dotenv").config()
import axios from "axios"
import { createCanvas, registerFont } from "canvas"
import { join } from "path"
import { removeAlpha } from "./util"

const DRAW_ENDPOINT = process.env.DRAW_ENDPOINT!

registerFont(join(__dirname, "../thin_pixel-7.ttf"), {
  family: "VT323",
})

function endOfMinute(date: Date) {
  const newDate = new Date(date)
  newDate.setMinutes(newDate.getMinutes() + 1)
  newDate.setSeconds(0)
  newDate.setMilliseconds(-1)
  return newDate
}

function format(date: Date) {
  return `${date.getHours() % 12}:${date.getMinutes()}`
}

async function main() {
  const canvas = createCanvas(32, 32)
  const ctx = canvas.getContext("2d")

  ctx.strokeStyle = "#ccc"
  ctx.font = "20px VT323"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"

  const date = new Date()
  const dateString = format(date)

  ctx.fillStyle = "#fff"
  ctx.translate(16, 16)
  ctx.fillText(dateString, 0, 0)

  axios.post(DRAW_ENDPOINT, {
    type: "image",
    data: removeAlpha(ctx.getImageData(0, 0, 32, 32).data),
    validUntil: endOfMinute(date),
    priority: 0,
  })
}
main()
