import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { DELIVERY_SILENCE_DAYS } from '@/lib/weekly-flow'

// ============================================================
// BİLDİRİM RİTMİ — SQL ↔ TYPESCRIPT PARİTESİ
//
// NEDEN BU TEST VAR
//
// "Durum bildirimi zamanı geldi mi?" sorusu İKİ yerde yaşıyor:
//
//   SQL (079 · ensure_student_check_ins) bildirimi ÜRETİR — bekleyen
//     satırın `due_at`'ini yazan taraf burasıdır.
//   TypeScript (lib/weekly-flow.ts · checkInDue) bekleyen bildirimin
//     NEDEN beklediğini ekranda açıklar: ritim mi, sessizlik mi.
//
// İkisi aynı eşikleri kullanmazsa ekran "3 gündür teslim yok, bu yüzden
// soruldu" derken bildirim aslında başka bir sebeple açılmış olur —
// öğretmene yanlış gerekçe gösterilir.
//
// Canlı veritabanı olmadan SQL çalıştırılamıyor; migration metnindeki
// sayı okunup TypeScript sabitiyle karşılaştırılıyor (repodaki diğer
// *-sql-parity testleriyle aynı yöntem). Migration'daki
// PARITY-BEGIN/END blokları BU TEST İÇİN var; taşınır ya da silinirlerse
// test bunu da söyler.
//
// OKUNAN DOSYA HER ZAMAN RİTMİ EN SON TANIMLAYAN MIGRATION'dır: kural
// başka bir dosyaya taşınırsa bu yol da güncellenmeli.
// ============================================================

const SQL_PATH = join(process.cwd(), 'supabase/migrations/079_check_in_flow_rhythm.sql')
const SQL = readFileSync(SQL_PATH, 'utf8')

/** `-- PARITY-BEGIN <ad>` … `-- PARITY-END <ad>` arasını verir. */
function parityBlock(name: string): string {
  // Satır sonları depoda karışık (CRLF/LF), bu yüzden \r? gerekli.
  const re = new RegExp(
    `--\\s*PARITY-BEGIN\\s+${name}\\r?\\n([\\s\\S]*?)--\\s*PARITY-END\\s+${name}`
  )
  const m = SQL.match(re)
  if (!m) {
    throw new Error(
      `079'da "PARITY-BEGIN ${name}" bloğu bulunamadı. ` +
        'Blok bu testin okuduğu tek yer; taşındıysa test de güncellenmeli.'
    )
  }
  return m[1]
}

describe('sessizlik eşiği · SQL ile TypeScript aynı sayıyı kullanır', () => {
  const block = parityBlock('silence_days')

  it('blok gerçekten okunabildi (test boşa geçmesin)', () => {
    expect(block).toContain('last_delivery_at')
    expect(block.length).toBeGreaterThan(80)
  })

  it('gün sayısı DELIVERY_SILENCE_DAYS ile aynı', () => {
    const matches = [...block.matchAll(/\((\d+)\s*\*\s*INTERVAL\s+'1 day'\)/g)].map(m =>
      Number(m[1])
    )
    expect(matches.length, 'gün çarpanı bulunamadı').toBeGreaterThan(0)
    for (const days of matches) {
      expect(days).toBe(DELIVERY_SILENCE_DAYS)
    }
  })

  it('iade edilmiş teslim hareket sayılmaz', () => {
    // checkInDue() sessizliği "yeni teslim" üzerinden ölçüyor; geri
    // alınmış bir kayıt iki tarafta da hareket sayılmamalı.
    expect(SQL).toMatch(/tc\.status\s*=\s*'active'/)
  })
})

describe('ritim tetikleyicisi · akışın orta noktası', () => {
  it('orta nokta başlangıç ve kapanıştan hesaplanıyor', () => {
    // checkInDue() ile aynı formül: (flowStart + dueAt) / 2.
    expect(SQL).toMatch(
      /flow_starts_at\s*\+\s*\(\s*c\.flow_due_at\s*-\s*c\.flow_starts_at\s*\)\s*\/\s*2/
    )
  })

  it('aktif olmayan akış ritmi belirlemez', () => {
    expect(SQL).toMatch(/f\.status\s*=\s*'active'/)
  })

  it('en erken tetikleyici kazanır', () => {
    // Belge iki tetikleyici için de "ikisi de yeterli" diyor; yeterli
    // koşulların birleşimi ilk gerçekleşenin zamanıdır.
    expect(SQL).toContain('LEAST(')
  })

  it('016\'nın sabiti taban olarak korunuyor', () => {
    // Akışı olmayan öğrencide tek ölçü budur; kaldırılsaydı o
    // öğrencilerde bildirim büsbütün dururdu.
    expect(SQL).toMatch(/interval_days\s*\*\s*INTERVAL\s+'1 day'/)
  })
})

describe('bildirimin haftası türetilmiyor, kaydediliyor', () => {
  it('weekly_flow_id sütunu ekleniyor', () => {
    expect(SQL).toMatch(/ADD COLUMN IF NOT EXISTS weekly_flow_id/)
  })

  it('sütun nullable (akış öncesi geçmiş uydurulmuyor)', () => {
    const line = SQL.split(/\r?\n/).find(l => l.includes('ADD COLUMN IF NOT EXISTS weekly_flow_id'))
    expect(line).toBeDefined()
    expect(line).not.toMatch(/NOT NULL/)
  })

  it('bildirim üretilirken akış kimliği yazılıyor', () => {
    expect(SQL).toMatch(/INSERT INTO public\.student_check_ins[\s\S]*weekly_flow_id/)
  })
})
