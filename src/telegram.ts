import TelegramBot from "node-telegram-bot-api"
import Jimp from "jimp"
import { handleGif, handleImage } from "."
import { readFile, writeFile } from "fs/promises"

const token = process.env.TELEGRAM_BOT_TOKEN!

const bot = new TelegramBot(token, { polling: true })

const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")
const ffprobe = require("@ffprobe-installer/ffprobe")
import ffmpeg from "fluent-ffmpeg"
import { join } from "path"

bot.on("message", async (msg) => {
  const chatId = msg.chat.id
  console.log(msg)

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
    handleImage(buffer)
    return
  }
  if (msg.photo) {
    const filePath = await bot.downloadFile(msg.photo[0].file_id, "/tmp")
    const jimp = await Jimp.read(filePath)
    const buffer = await jimp.getBufferAsync(Jimp.MIME_PNG)
    console.log("Storing file as current")
    await writeFile(join(__dirname, "../current.png"), buffer)
    handleImage(buffer)
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
        handleGif(data)
      })
      .on("error", () => {
        bot.sendMessage(chatId, "Jotain meni pieleen")
      })
      .run()
  }

  bot.sendMessage(chatId, "Received your message")
})
