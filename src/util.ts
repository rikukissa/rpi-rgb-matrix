import Jimp from "jimp"

export function removeAlpha(array: Uint8ClampedArray) {
  const result = []

  for (let i = 0; i < array.length; i++) {
    if ((i + 1) % 4 === 0) {
      continue
    }
    result.push(array[i])
  }

  return Buffer.from(result)
}

export function prepareImageForMatrix(jimp: Jimp) {
  const resized = jimp.resize(32, 32)
  const colorArray = new Uint8Array(resized.colorType(0).bitmap.data.buffer)

  const nonAlphaImage = removeAlpha(Uint8ClampedArray.from(colorArray))
  return nonAlphaImage
}
