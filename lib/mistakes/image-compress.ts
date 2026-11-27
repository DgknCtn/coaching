// SORU FOTOĞRAFI SIKIŞTIRMA — istemcide, yüklemeden ÖNCE.
//
// Telefon fotoğrafı 3–6 MB; tekrar için gereken okunaklı bir soru
// görseli. En uzun kenar 1280 px, WebP; kalite hedef boyuta inene kadar
// düşürülür. Depolama alanı 600 KB üstünü zaten reddeder (161).

export const MAX_EDGE = 1280
export const TARGET_BYTES = 200 * 1024
export const MAX_BYTES = 600 * 1024
export const MAX_PHOTOS_PER_MISTAKE = 2

/** Oranı koruyarak en uzun kenarı `max`a sığdırır; küçük görsel büyütülmez. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const k = max / longest
  return { width: Math.round(width * k), height: Math.round(height * k) }
}

/** Denenecek kalite basamakları (yüksekten düşüğe). */
export const QUALITY_STEPS = [0.8, 0.7, 0.6, 0.5, 0.4]

/** Tarayıcıda: dosyayı WebP'ye çevirip sıkıştırır. Sınırı aşarsa hata. */
export async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Yalnız görsel dosyası eklenebilir.')
  const bitmap = await createImageBitmap(file)
  const { width, height } = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Görsel işlenemedi.')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let out: Blob | null = null
  for (const q of QUALITY_STEPS) {
    out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/webp', q))
    // WebP desteklemeyen eski Safari PNG döndürür — JPEG'e düş.
    if (out && out.type !== 'image/webp') out = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', q))
    if (out && out.size <= TARGET_BYTES) break
  }
  if (!out) throw new Error('Görsel işlenemedi.')
  if (out.size > MAX_BYTES) throw new Error('Görsel çok büyük; daha yakından, yalnız soruyu çekmeyi deneyin.')
  return out
}
