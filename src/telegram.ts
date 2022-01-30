import TelegramBot from "node-telegram-bot-api"
import Jimp from "jimp"
import { handleGif, handleImage } from "."

const token = process.env.TELEGRAM_BOT_TOKEN!

const bot = new TelegramBot(token, { polling: true })

const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")
const ffprobe = require("@ffprobe-installer/ffprobe")

const ffmpeg = require("fluent-ffmpeg")()
  .setFfprobePath(ffprobe.path)
  .setFfmpegPath(ffmpegInstaller.path)

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
    handleImage(buffer)
    return
  }
  if (msg.photo) {
    const filePath = await bot.downloadFile(msg.photo[0].file_id, "/tmp")
    const jimp = await Jimp.read(filePath)
    const buffer = await jimp.getBufferAsync(Jimp.MIME_PNG)
    handleImage(buffer)
    return
  }

  const animation = msg.animation || msg.video
  if (animation && animation.mime_type === "video/mp4") {
    const filePath = await bot.downloadFile(animation.file_id, "/tmp")
    const gifPath = `/tmp/${Date.now()}.gif`
    console.log("Converting MP4 to GIF")
    ffmpeg
      .input(filePath)
      .noAudio()
      .output(gifPath)
      .on("end", async () => {
        const jimp = await Jimp.read(gifPath)
        const buffer = await jimp.getBufferAsync(Jimp.MIME_GIF)
        console.log("Video converted, sending buffer")
        handleGif(buffer)
      })
      .on("error", () => {
        bot.sendMessage(chatId, "Jotain meni pieleen")
      })
      .run()
  }

  bot.sendMessage(chatId, "Received your message")
})
