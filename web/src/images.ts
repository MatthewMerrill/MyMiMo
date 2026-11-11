import { api } from './api.ts'

const FULL_EDGE = 1600
const THUMB_EDGE = 320

/**
 * Downscales a photo in the browser (also dropping EXIF/GPS), then uploads the
 * full-size JPEG plus a thumbnail. Returns the new image id.
 */
export async function uploadImage(file: File): Promise<number> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    throw new Error(`Couldn't read ${file.name}. Try a JPEG or PNG.`)
  }
  try {
    const full = await encode(bitmap, FULL_EDGE, 0.85)
    const thumb = await encode(bitmap, THUMB_EDGE, 0.8)
    const { id } = await api.uploadImage({ data: full.base64, thumb: thumb.base64, width: full.width, height: full.height })
    return id
  } finally {
    bitmap.close()
  }
}

async function encode(bitmap: ImageBitmap, maxEdge: number, quality: number) {
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff' // JPEG has no transparency; avoid black backgrounds on PNGs
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed'))), 'image/jpeg', quality),
  )
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
  return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), width, height }
}

export const imageUrl = (id: number, thumb = false) => `/api/images/${id}${thumb ? '?thumb' : ''}`
