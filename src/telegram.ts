import TelegramBot from "node-telegram-bot-api"
import Jimp from "jimp"
import { resizeGif } from "."
import { readFile, writeFile } from "fs/promises"
import QRCode from "qrcode"
const BitlyClient = require("bitly").BitlyClient
const bitly = new BitlyClient(process.env.BITLY_TOKEN)

const token = process.env.TELEGRAM_BOT_TOKEN!

const bot = new TelegramBot(token, { polling: true })

const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")
const ffprobe = require("@ffprobe-installer/ffprobe")
import ffmpeg from "fluent-ffmpeg"
import { join } from "path"
import { pushToQueue } from "./matrix"
import { prepareImageForMatrix } from "./util"

async function resizeImage(data: Buffer) {
  console.log("Reading an image file to Jimp")
  const jimp = await Jimp.read(data)
  console.log("Creating a non-transparent bitmap")
  const nonAlphaImage = prepareImageForMatrix(jimp)
  console.log("Drawing the new image")

  return nonAlphaImage
}

bot.on("message", async (msg) => {
  const chatId = msg.chat.id

  if (msg.sticker && msg.sticker.is_animated) {
    bot.sendMessage(chatId, "Animated stickers are not supported")
    return
  }

  if (msg.sticker) {
    const filePath = await bot.downloadFile(msg.sticker.file_id, "/tmp")
    const jimp = await Jimp.read(filePath)
    const buffer = await jimp.getBufferAsync(Jimp.MIME_PNG)
    console.log("Storing file as current")
    await writeFile(join(__dirname, "../current.png"), buffer)
    const data = await resizeImage(buffer)
    pushToQueue({ type: "image", data, priority: 2 })
    return
  }
  if (msg.photo) {
    const filePath = await bot.downloadFile(msg.photo[0].file_id, "/tmp")
    const jimp = await Jimp.read(filePath)
    const buffer = await jimp.getBufferAsync(Jimp.MIME_PNG)
    console.log("Storing file as current")
    await writeFile(join(__dirname, "../current.png"), buffer)
    const data = await resizeImage(buffer)
    pushToQueue({ type: "image", data, priority: 2 })
    return
  }

  const animation = msg.animation || msg.video

  if (animation?.file_size && animation?.file_size > 400000) {
    return bot.sendMessage(chatId, "That GIF is too large for me to handle")
  }

  if (animation && animation.mime_type === "video/mp4") {
    const filePath = await bot.downloadFile(animation.file_id, "/tmp")
    const gifPath = `/tmp/${Date.now()}.gif`
    console.log("Converting MP4 to GIF")
    ffmpeg()
      .setFfprobePath(ffprobe.path)
      .setFfmpegPath(ffmpegInstaller.path)
      .input(filePath)
      .noAudio()
      .output(gifPath)
      .on("end", async () => {
        console.log("Video converted, reading file")
        const data = await readFile(gifPath)
        console.log("Storing file as current")
        await writeFile(join(__dirname, "../current.gif"), data)
        console.log("Sending buffer")
        const frames = await resizeGif(data)
        pushToQueue({ type: "animation", data: frames, priority: 2 })
      })
      .on("error", () => {
        bot.sendMessage(chatId, "Jotain meni pieleen")
      })
      .run()
  }

  if (msg.text) {
    const url =
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/
    if (msg.text.match(url)) {
      const shortened = await bitly.shorten(msg.text)

      const buffer = await QRCode.toBuffer(shortened.link, {
        version: 3,
        width: 32,
        margin: 0,
        errorCorrectionLevel: "H",
      })
      await writeFile(join(__dirname, "../current2.png"), buffer)
      const data = await resizeImage(buffer)
      pushToQueue({ type: "image", data, priority: 2 })
    }
  }

  bot.sendMessage(chatId, "Received your message")
})
