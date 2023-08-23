require("dotenv").config()
import axios from "axios"
import { createCanvas, registerFont } from "canvas"
import { join } from "path"
import { removeAlpha } from "./util"

const DRAW_ENDPOINT = process.env.DRAW_ENDPOINT!

registerFont(join(__dirname, "../thin_pixel-7.ttf"), {
  family: "VT323",
})
registerFont(join(__dirname, "../smallest_pixel-7.ttf"), {
  family: "3by3",
})

function endOfMinute(date: Date) {
  const newDate = new Date(date)
  newDate.setMinutes(newDate.getMinutes() + 1)
  newDate.setSeconds(0)
  newDate.setMilliseconds(-1)
  return newDate
}

function format(date: Date) {
  const minutes = date.getMinutes()
  return `${date.getHours() % 12}:${minutes < 10 ? "0" : ""}${minutes}`
}

async function getKanji() {
  const { data } = await axios.get("https://kanjiapi.dev/v1/kanji/grade-1")

  const kanji = data[Math.floor(Math.random() * data.length)]

  const { data: kanjiDetails } = await axios.get(
    "https://kanjiapi.dev/v1/kanji/" + encodeURIComponent(kanji)
  )
  return kanjiDetails
}

async function main() {
  const kanji = await getKanji()

  const canvas = createCanvas(32, 32)
  const ctx = canvas.getContext("2d")

  ctx.strokeStyle = "#ccc"

  const text = kanji.heisig_en
  function draw(textOffset = 0) {
    ctx.clearRect(0, 0, 32, 32)

    ctx.save()
    ctx.font = "22px VT323"
    ctx.textAlign = "center"
    ctx.textBaseline = "middle"
    ctx.fillStyle = "#fff"
    ctx.translate(16, 16 - 4)
    ctx.fillText(kanji.kanji, 0, 0)
    ctx.restore()

    ctx.save()
    ctx.font = "10px 3by3"
    ctx.fillStyle = "#fff"
    const textWidth = ctx.measureText(text).width
    ctx.textBaseline = "bottom"
    if (textWidth < 26) {
      ctx.translate(16, 33)
      ctx.textAlign = "center"
      ctx.fillText(text, 0, 0)
    } else {
      ctx.translate(3 - textOffset, 33)
      ctx.textAlign = "left"
      ctx.fillText(text, 0, 0)
    }
    ctx.restore()
  }

  ctx.save()
  ctx.font = "10px 3by3"
  const textWidth = ctx.measureText(text).width
  console.log(textWidth, kanji)

  ctx.restore()

  const frames = []

  if (textWidth > 26) {
    for (let i = -textWidth; i < textWidth + textWidth - 26; i++) {
      draw(i)
      frames.push(removeAlpha(ctx.getImageData(0, 0, 32, 32).data))
    }
  } else {
    draw()
    frames.push(removeAlpha(ctx.getImageData(0, 0, 32, 32).data))
  }

  axios.post(DRAW_ENDPOINT, {
    type: "animation",
    data: frames.map((frame) => ({ buffer: frame, delay: 100 })),

    priority: 2,
  })
}
main()
