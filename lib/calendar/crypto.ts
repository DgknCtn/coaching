import 'server-only'

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

// GOOGLE REFRESH TOKEN ŞİFRELEMESİ — AES-256-GCM (migration 157).
//
// Anahtar yalnız sunucuda: CALENDAR_TOKEN_KEY (32 bayt; base64 ya da
// 64 karakter hex). Veritabanında yalnız şifreli metin durur; tablo
// politikasız, okuyan RPC yalnız bağlantı sahibine şifreli metni döner.
// Anahtar olmadan şifreli metin işe yaramaz.
//
// Biçim: "v1:<iv base64>:<tag base64>:<şifreli base64>". Sürüm öneki,
// ileride anahtar değişimi (rotation) için yer bırakır.

const VERSION = 'v1'

export class CalendarKeyError extends Error {}

function key(): Buffer {
  const raw = (process.env.CALENDAR_TOKEN_KEY ?? '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()
  if (!raw) throw new CalendarKeyError('CALENDAR_TOKEN_KEY tanımlı değil.')
  const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64')
  if (buf.length !== 32) throw new CalendarKeyError('CALENDAR_TOKEN_KEY 32 bayt olmalı.')
  return buf
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return [VERSION, iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':')
}

export function decryptToken(payload: string): string {
  const [version, iv, tag, data] = payload.split(':')
  if (version !== VERSION || !iv || !tag || !data) throw new CalendarKeyError('Şifreli anahtar biçimi tanınmadı.')
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'))
  decipher.setAuthTag(Buffer.from(tag, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8')
}
