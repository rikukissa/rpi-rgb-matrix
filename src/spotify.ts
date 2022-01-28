import axios from "axios"
import Jimp from "jimp"

const CLIENT_ID = process.env.CLIENT_ID!
const CLIENT_SECRET = process.env.CLIENT_SECRET!
const REFRESH_TOKEN = process.env.REFRESH_TOKEN!
const DRAW_ENDPOINT = process.env.DRAW_ENDPOINT!

async function getToken() {
  const params = new URLSearchParams()
  params.append("grant_type", "refresh_token")
  params.append("refresh_token", REFRESH_TOKEN)
  console.log(
    `Basic ${Buffer.from(CLIENT_ID + ":" + CLIENT_SECRET).toString("base64")}`
  )

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
  const images = currentlyPlaying.item.album.images
  const smallestImage = images[images.length - 1].url

  const jimp = await Jimp.read(smallestImage)
  const buffer = await jimp.getBufferAsync(Jimp.MIME_PNG)
  axios.post(DRAW_ENDPOINT, buffer)
}
main()
