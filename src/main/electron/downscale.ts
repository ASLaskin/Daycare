// Shrinks PNG and JPEG images with Electron's decoder.

import { nativeImage } from "electron"
import { asBase64, MAX_BASE64_LENGTH } from "../../shared/images.ts"
import { type Downscale, fitSize } from "../chat/images.ts"

const JPEG_QUALITY = 85

const encoded = (buf: Buffer) => asBase64(buf.toString("base64"))

export const downscale: Downscale = (image) => {
  const img = nativeImage.createFromBuffer(Buffer.from(image.data, "base64"))
  if (img.isEmpty()) {
    return null
  }
  const target = fitSize(img.getSize())
  if (!target && image.data.length <= MAX_BASE64_LENGTH) {
    return image
  }
  const resized = target ? img.resize({ ...target, quality: "best" }) : img
  const png = image.mediaType === "image/png" ? encoded(resized.toPNG()) : null
  if (png && png.length <= MAX_BASE64_LENGTH) {
    return { mediaType: "image/png", data: png }
  }
  return { mediaType: "image/jpeg", data: encoded(resized.toJPEG(JPEG_QUALITY)) }
}
