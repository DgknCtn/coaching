import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RATE_LIMITS } from '@/lib/rate-limit'

// HIZ SINIRI: SQL ↔ TYPESCRIPT PARİTESİ
//
// ============================================================
// NEDEN BU TEST VAR
//
// 068'e kadar sınırlar YALNIZ TypeScript'teydi ve RPC'ye parametre
// olarak geçiyordu — yani saldırgan kendi sınırını gönderebiliyordu
// (denetim raporu bulgusu 7). Artık karar veritabanında:
// check_rate_limit içindeki CASE bloğu.
//
// lib/rate-limit.ts'teki RATE_LIMITS ise BELGELEME olarak kaldı: kodu
// okuyan "giriş kaç denemede kilitleniyor" sorusunu SQL'e bakmadan
// yanıtlayabilmeli.
//
// İki kopya ayrışırsa belgeleme yalan söyler ve bir sonraki okuyan
// yanlış sınıra göre karar verir. Canlı veritabanı olmadan fonksiyon
// çalıştırılamıyor; onun yerine migration'daki CASE satırları okunup
// TypeScript sabitleriyle karşılaştırılıyor.
//
// OKUNAN DOSYA, SINIRLARI EN SON TANIMLAYAN MIGRATION'dır: sınırlar
// değiştiğinde bu yol da güncellenmeli.
// ============================================================

const SQL_PATH = join(process.cwd(), 'supabase/migrations/068_audit_hardening.sql')

/**
 * `WHEN 'login' THEN v_max := 10; v_window := 15 * 60;` satırlarını okur.
 *
 * Pencere SQL'de çarpım olarak yazılı (okunabilirlik için); burada
 * değerlendirilerek saniyeye çevriliyor.
 */
function sqlLimits(sql: string): Record<string, { max: number; windowSeconds: number }> {
  const out: Record<string, { max: number; windowSeconds: number }> = {}
  // `\r?\n` beklentisi yok — desen tek satır içinde kalıyor. Depoda satır
  // sonları karışık olduğu için satır sonuna bağlanmamak bilinçli.
  const pattern =
    /WHEN\s+'([A-Za-z]+)'\s+THEN\s+v_max\s*:=\s*(\d+);\s*v_window\s*:=\s*([\d\s*]+);/g

  for (const match of sql.matchAll(pattern)) {
    const [, action, max, windowExpr] = match
    const windowSeconds = windowExpr
      .split('*')
      .map(part => Number(part.trim()))
      .reduce((a, b) => a * b, 1)
    out[action] = { max: Number(max), windowSeconds }
  }

  return out
}

describe('check_rate_limit · SQL ↔ TS paritesi', () => {
  const sql = readFileSync(SQL_PATH, 'utf8')
  const parsed = sqlLimits(sql)

  it('migration okunabildi ve CASE bloğu bulundu', () => {
    // Blok taşınır ya da biçimi değişirse test sessizce boş geçmesin.
    expect(Object.keys(parsed).length).toBeGreaterThan(0)
  })

  it('her eylem iki tarafta da tanımlı', () => {
    expect(Object.keys(parsed).sort()).toEqual(Object.keys(RATE_LIMITS).sort())
  })

  it('sınırlar ve pencereler birebir aynı', () => {
    for (const [action, limit] of Object.entries(RATE_LIMITS)) {
      expect(parsed[action], `${action} SQL'de yok`).toBeDefined()
      expect(parsed[action].max, `${action} deneme sayısı`).toBe(limit.max)
      expect(parsed[action].windowSeconds, `${action} penceresi`).toBe(limit.windowSeconds)
    }
  })
})

describe('check_rate_limit · sertleştirme korunuyor', () => {
  const sql = readFileSync(SQL_PATH, 'utf8')

  // Eski imza aşırı yükleme olarak kalırsa saldırganın kendi limitini
  // verdiği yol açık kalır ve PostgREST hangisini çağıracağını bilemez.
  it('eski üç parametreli imza düşürülüyor', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, INTEGER, INTEGER)')
  })

  // Bilinmeyen eylem sessizce geçerse, yanlış yazılmış bir eylem adı
  // koruması hiç çalışmayan bir akış üretir.
  it('bilinmeyen eylem hata veriyor', () => {
    expect(sql).toMatch(/RAISE EXCEPTION\s+'Bilinmeyen hız sınırı eylemi/)
  })

  // Tuz olmadan kova anahtarı dışarıdan yeniden üretilebilir ve hedefli
  // kilitleme mümkün olur.
  it('kova anahtarı tuzlanıyor', () => {
    expect(sql).toContain('rate_limit_salt')
    expect(sql).toMatch(/digest\(\s*v_salt/)
  })
})
