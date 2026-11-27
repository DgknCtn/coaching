// Kayıt kaynağı — landing CTA'larının ?k= parametresi (27.11.2026).
//
// Yalnız bilinen değerler saklanır: kullanıcı üst verisine serbest metin
// yazılmaz. Yeni bir CTA eklenince buraya da eklenir.

export const SIGNUP_SOURCES = [
  'hero',
  'tur',
  'karsilastir',
  'fiyat',
  'kapanis',
  'taahhut',
  'navbar',
  'mobil',
  'footer',
  'demo',
] as const

export type SignupSource = (typeof SIGNUP_SOURCES)[number]

export function normalizeSignupSource(value: string | null | undefined): SignupSource | null {
  const v = value?.trim().toLowerCase()
  return v && (SIGNUP_SOURCES as readonly string[]).includes(v) ? (v as SignupSource) : null
}

/** CTA bağlantısı: /register?k=<kaynak>. */
export function registerHref(source: SignupSource): string {
  return `/register?k=${source}`
}
