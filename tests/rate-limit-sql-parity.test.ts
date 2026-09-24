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

// ============================================================
// pgcrypto ŞEMA ERİŞİMİ — SESSİZ ARIZANIN BEKÇİSİ (110)
//
// NEDEN BU TEST VAR
//
// Hız sınırı iki ay boyunca FİİLEN ÇALIŞMADI ve kimse fark etmedi.
// `check_rate_limit` gövdesinde `digest()` çağırıyor; `digest`
// `extensions` şemasında, oysa fonksiyonun search_path'i yalnız
// `public, pg_temp` idi. Her çağrı 42883 ("function digest does not
// exist") ile düşüyordu.
//
// NEDEN SESSİZ: lib/rate-limit.ts bilinçli olarak FAIL-OPEN —
// "sayaç bozulursa istek engellenmez, loglanır" (050'nin kararı, ve
// doğru bir karar). Sonuç: giriş, kayıt, şifre sıfırlama ve davet
// kabulünde kaba kuvvet koruması yoktu, ürün bunu yalnız bir log
// satırıyla söylüyordu.
//
// Aynı kusur `log_auth_event`'te de vardı; 093 onu düzeltti ama
// `check_rate_limit` o turda gözden kaçtı. Bu test, üçüncü kez
// kaçmasını engelliyor.
//
// Dış denetim bunu göremedi: fonksiyon var, yetkileri doğru, tablo
// yerinde. Yalnız çalışmıyor.
// ============================================================

describe('pgcrypto kullanan fonksiyonlar extensions şemasını görür', () => {
  // Gövdesinde pgcrypto çağrısı geçen fonksiyonların TANIMLANDIĞI
  // dosyalar. Yeni bir tanım eklenirse buraya da eklenmeli.
  const PGCRYPTO_KULLANAN = [
    { dosya: '068_audit_hardening.sql', fonksiyon: 'check_rate_limit' },
    { dosya: '093_auth_events_workspace_and_presence.sql', fonksiyon: 'log_auth_event' },
  ] as const

  it('110, check_rate_limit için search_path düzeltmesini içerir', () => {
    // Düzeltme ALTER FUNCTION ile yapıldı (gövdeye dokunulmadan), bu
    // yüzden 068'in kendi metni değişmedi ve orada aranamaz.
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/110_rate_limit_search_path.sql'),
      'utf8'
    )

    expect(sql).toContain('ALTER FUNCTION public.check_rate_limit')
    expect(
      sql.replace(/\s+/g, ' '),
      '110, search_path sonuna extensions eklemiyor.'
    ).toContain('SET search_path = public, pg_temp, extensions')
  })

  it.each(PGCRYPTO_KULLANAN)(
    '$fonksiyon gövdesi gerçekten pgcrypto çağırıyor',
    ({ dosya, fonksiyon }) => {
      // İddianın dayanağı doğrulanıyor: fonksiyon pgcrypto kullanmıyorsa
      // yukarıdaki düzeltme gereksiz demektir ve test yanlış şeyi korur.
      const sql = readFileSync(join(process.cwd(), 'supabase/migrations', dosya), 'utf8')
      const code = sql
        .split(/\r?\n/)
        .filter(line => !line.trimStart().startsWith('--'))
        .join('\n')

      expect(code, `${dosya} içinde ${fonksiyon} tanımı yok`).toContain(fonksiyon)
      expect(code, `${fonksiyon} pgcrypto çağırmıyor görünüyor`).toMatch(/\bdigest\s*\(/)
    }
  )

  it('search_path sıralaması public ile başlar', () => {
    // `extensions` SONA ekleniyor: public önce geldiği için extensions
    // şemasındaki bir nesne public'tekini gölgeleyemez. 024'ün gölgeleme
    // kaygısı bu sırayla korunuyor.
    const sql = readFileSync(
      join(process.cwd(), 'supabase/migrations/110_rate_limit_search_path.sql'),
      'utf8'
    )
    const match = sql.match(/SET search_path = ([^;]+);/)
    expect(match).not.toBeNull()
    expect(match![1].trim().startsWith('public')).toBe(true)
  })
})
