import TelegramBot from "node-telegram-bot-api"
import Jimp from "jimp"
import { handleGif, handleImage } from "."

// replace the value below with the Telegram token you receive from @BotFather
const token = process.env.TELEGRAM_BOT_TOKEN!

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true })

const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg")
const ffprobe = require("@ffprobe-installer/ffprobe")

const ffmpeg = require("fluent-ffmpeg")()
  .setFfprobePath(ffprobe.path)
  .setFfmpegPath(ffmpegInstaller.path)

// Listen for any kind of message. There are different kinds of
// messages.
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
    ffmpeg
      .input(filePath)
      .noAudio()
      .output(gifPath)
      .on("end", async () => {
        console.log("Mp4 converted to gif")
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
