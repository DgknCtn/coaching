import 'server-only'
import { createHmac, randomInt } from 'node:crypto'

// E-POSTASIZ ÖĞRENCİ GİRİŞİ (10a · 119) — sunucu yardımcıları.
//
// Supabase şifreyle girişte bir e-posta istiyor. E-postası olmayan
// öğrenci için sistem içi bir adres kullanılıyor ve hesabın şifresi
// SUNUCUDAKİ bir sırdan türetiliyor: PIN bir Supabase şifresi değil
// (bkz. 119'un başlığı). PIN veritabanında bcrypt ile duruyor ve
// verify_student_pin ile, kilitle birlikte doğrulanıyor.
//
// İKİ ORTAM DEĞİŞKENİ (ikisi de yalnız sunucuda):
//   STUDENT_LOGIN_SECRET        uzun rastgele değer. DEĞİŞTİRİLİRSE mevcut
//                               kodlu öğrencilerin hepsi giriş yapamaz.
//   STUDENT_LOGIN_EMAIL_DOMAIN  sistem içi adreslerin alan adı. MX kaydı
//                               olan, SİZİN kontrolünüzdeki bir alan
//                               olmalı (Supabase geçersiz alanları
//                               reddediyor; olası bir e-posta yabancıya
//                               gitmesin). Örn: ogrenci.alanadiniz.com

export function studentLoginConfigured(): boolean {
  return Boolean(process.env.STUDENT_LOGIN_SECRET && process.env.STUDENT_LOGIN_EMAIL_DOMAIN)
}

export function studentLoginEmail(username: string): string {
  return `${username.toLowerCase()}@${process.env.STUDENT_LOGIN_EMAIL_DOMAIN}`
}

/** Hesabın Supabase şifresi — dışarıdan tahmin edilemez, PIN'den bağımsız. */
export function studentLoginPassword(username: string): string {
  const secret = process.env.STUDENT_LOGIN_SECRET
  if (!secret) throw new Error('STUDENT_LOGIN_SECRET tanımlı değil.')
  return createHmac('sha256', secret).update(`student-login:${username.toLowerCase()}`).digest('hex')
}

/** 6 haneli PIN — kriptografik rastgele. */
export function generatePin(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

const TR_MAP: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', i: 'i', ö: 'o', ş: 's', ü: 'u',
  Ç: 'c', Ğ: 'g', I: 'i', İ: 'i', Ö: 'o', Ş: 's', Ü: 'u',
}

/**
 * "Ayşe Yılmaz" → "ayse.y4821". Okunur, yazması kolay, tahmin edilmesi
 * zor (4 rastgele hane). Tekillik veritabanında; çakışırsa yeniden denenir.
 */
export function generateUsername(fullName: string): string {
  const ascii = fullName
    .split('')
    .map((c) => TR_MAP[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim()
  const [first = 'ogrenci', ...rest] = ascii.split(/\s+/).filter(Boolean)
  const initial = rest.length ? rest[rest.length - 1].charAt(0) : ''
  const base = `${first.slice(0, 14)}${initial ? `.${initial}` : ''}`
  return `${base}${String(randomInt(0, 10_000)).padStart(4, '0')}`
}

export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9.]{2,29}$/
