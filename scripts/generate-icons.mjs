import sharp from 'sharp'
import { writeFile } from 'node:fs/promises'
// Depo kökünden çalıştırılır: `npm run icons`.
const SRC = 'brand/izlogo.png'
const OUT = 'public'
const CREAM = { r: 0xf6, g: 0xef, b: 0xe8, alpha: 1 }

// Kaynak saydam DEĞİLSE düz zemini kes: köşe pikseli referans alınır ve
// ona yakın renkler saydamlaştırılır.
//
// Zaten saydam bir kaynakta bu adım atlanır — köşe pikseli o durumda
// (0,0,0,0) olur ve RGB karşılaştırması logonun koyu kahverengilerini de
// silmeye aday hale gelir. Yapılacak iş yokken risk almanın anlamı yok.
const meta = await sharp(SRC).metadata()
let source = SRC
if (!meta.hasAlpha) {
  const { data, info } = await sharp(SRC).ensureAlpha().raw()
    .toBuffer({ resolveWithObject: true })
  const [r0, g0, b0] = [data[0], data[1], data[2]]
  for (let i = 0; i < data.length; i += 4) {
    if (
      Math.abs(data[i] - r0) < 14 &&
      Math.abs(data[i + 1] - g0) < 14 &&
      Math.abs(data[i + 2] - b0) < 14
    ) {
      data[i + 3] = 0
    }
  }
  source = await sharp(data, {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png().toBuffer()
  console.log('zemin kesildi (kaynakta alfa yoktu)')
} else {
  console.log('kaynak zaten saydam, zemin kesme atlandı')
}

const trimmed = await sharp(source).trim().png().toBuffer()
const tm = await sharp(trimmed).metadata()
console.log('trim:', tm.width, 'x', tm.height)

// Kare tuvale ortala, `pad` oranında boşluk bırak.
async function square(size, pad, bg) {
  const inner = Math.round(size * (1 - pad))
  const art = await sharp(trimmed).resize(inner, inner, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).toBuffer()
  const am = await sharp(art).metadata()
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: art, left: Math.round((size-am.width)/2), top: Math.round((size-am.height)/2) }])
    .png().toBuffer()
}
// Yuvarlak köşeli maske (any-purpose ikonlar için).
async function rounded(size, pad) {
  const flat = await square(size, pad, CREAM)
  const r = Math.round(size * 0.22)
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="#fff"/></svg>`)
  return sharp(flat).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer()
}

const jobs = [
  ['icons/mark.png',           () => sharp(trimmed).resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer()],
  ['icons/icon-192.png',       () => rounded(192, 0.16)],
  ['icons/icon-512.png',       () => rounded(512, 0.16)],
  // apple-touch iOS'ta köşeyi kendi yuvarlar; opak ve köşesiz olmalı.
  ['icons/apple-touch-icon.png', () => square(180, 0.14, CREAM)],
  // maskable: Android daireye kırpar, güvenli alan için %30 boşluk.
  ['icons/maskable-192.png',   () => square(192, 0.30, CREAM)],
  ['icons/maskable-512.png',   () => square(512, 0.30, CREAM)],
  ['favicon.png',              () => sharp(trimmed).resize(32, 32, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).png().toBuffer()],
]
for (const [name, fn] of jobs) {
  await writeFile(`${OUT}/${name}`, await fn())
  console.log('yazıldı:', name)
}
