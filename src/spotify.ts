require("dotenv").config()

import axios from "axios"
import Jimp from "jimp"
import { removeAlpha } from "./util"

const CLIENT_ID = process.env.CLIENT_ID!
const CLIENT_SECRET = process.env.CLIENT_SECRET!
const REFRESH_TOKEN = process.env.REFRESH_TOKEN!
const DRAW_ENDPOINT = process.env.DRAW_ENDPOINT!

async function getToken() {
  const params = new URLSearchParams()
  params.append("grant_type", "refresh_token")
  params.append("refresh_token", REFRESH_TOKEN)

  const res = await axios.post(
    "https://accounts.spotify.com/api/token",
    params,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(
          CLIENT_ID + ":" + CLIENT_SECRET
        ).toString("base64")}`,
      },
    }
  )

  return res.data.access_token
}

async function getCoverImage(accessToken: string) {
  const res = await axios.get(
    "https://api.spotify.com/v1/me/player/currently-playing",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )
  return res.data
}

async function main() {
  const token = await getToken()

  const currentlyPlaying = await getCoverImage(token)

  if (!currentlyPlaying.is_playing) {
    return
  }

  const images = currentlyPlaying.item.album.images
  const smallestImage = images[images.length - 1].url

  const jimp = await Jimp.read(smallestImage)

  const rowHeight = Math.round(jimp.bitmap.height / 32) * 2
  const progress =
    currentlyPlaying.progress_ms / currentlyPlaying.item.duration_ms

  const withProgress = jimp
    .scan(
      0,
      jimp.bitmap.height - rowHeight,
      Math.round(jimp.bitmap.width * progress),
      rowHeight,
      function (x, y, offset) {
        this.bitmap.data.writeUInt32BE(0xff00ff, offset)
      }
    )
    .resize(32, 32)

  const data = removeAlpha(Uint8ClampedArray.from(withProgress.bitmap.data))

  axios.post(DRAW_ENDPOINT, {
    type: "image",
    data: data,
    priority: 1,
  })
}
main()
