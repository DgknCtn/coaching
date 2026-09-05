import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// FİNANS BÜTÜNLÜĞÜ — migration içeriği kontrolü.
//
// ============================================================
// NEDEN BU TEST VAR
//
// Denetim raporu bulgusu 1: finans tablolarının RLS politikası yalnız
// satırın kendi workspace_id'sine bakıyordu; aynı satırdaki student_id'nin
// o çalışma alanına ait olduğu hiçbir yerde doğrulanmıyordu. Üstelik
// `authenticated` rolüne doğrudan INSERT/UPDATE/DELETE verilmişti, yani
// RPC'lerdeki doğru kontroller atlanabiliyordu.
//
// 068 iki katman ekledi: kompozit yabancı anahtar ve yazma izinlerinin
// geri alınması. İkisi de SESSİZCE geri alınabilecek türden — bir sonraki
// migration `GRANT ... TO authenticated` yazdığında kimse fark etmez.
//
// Canlı veritabanı olmadan kısıtlar sorgulanamıyor; onun yerine migration
// metni okunuyor. Bu, gerçek bir şemayı DOĞRULAMAZ — yalnız düzeltmenin
// depoda durduğunu garanti eder. Gerçek doğrulama, iki kurum hesabıyla
// yapılacak olumsuz erişim testidir (tests/tenant-isolation.test.ts'teki
// nota bakın).
// ============================================================

const SQL_PATH = join(process.cwd(), 'supabase/migrations/068_audit_hardening.sql')
const sql = readFileSync(SQL_PATH, 'utf8')

const FINANCE_TABLES = ['student_fees', 'finance_lessons', 'finance_payments'] as const

describe('finans · kompozit yabancı anahtar', () => {
  // Kompozit FK'nın hedefi tekil olmak zorunda; bu kısıt olmadan
  // ALTER TABLE'lar çalışmaz.
  it('students(workspace_id, id) tekil', () => {
    expect(sql).toContain('UNIQUE (workspace_id, id)')
  })

  it.each(FINANCE_TABLES)('%s çalışma alanı–öğrenci çiftine bağlanıyor', table => {
    expect(sql).toContain(`${table}_workspace_student_fkey`)
    expect(sql).toMatch(
      new RegExp(
        `${table}_workspace_student_fkey[\\s\\S]{0,200}FOREIGN KEY \\(workspace_id, student_id\\)`
      )
    )
  })

  it.each(FINANCE_TABLES)('%s eski tekil FK düşürülüyor', table => {
    expect(sql).toContain(`DROP CONSTRAINT IF EXISTS ${table}_student_id_fkey`)
  })

  // Öğrenci silindiğinde finans satırları da gitmeli (066'daki davranış).
  // Kompozit FK'ya geçerken bu kaybolursa yetim satırlar kalır.
  it('silme davranışı korunuyor', () => {
    const cascades = sql.match(/REFERENCES public\.students \(workspace_id, id\) ON DELETE CASCADE/g)
    expect(cascades ?? []).toHaveLength(FINANCE_TABLES.length)
  })
})

describe('finans · doğrudan yazma izinleri', () => {
  it.each(FINANCE_TABLES)('%s için DML yetkisi geri alınıyor', table => {
    expect(sql).toMatch(
      new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table}\\s+FROM authenticated`)
    )
  })

  // SELECT kalmalı: student_finance_view security_invoker ile çalışıyor,
  // okuma çağıranın yetkisiyle yapılıyor ve RLS doğru süzüyor. SELECT de
  // geri alınırsa finans ekranı tamamen boşalır.
  it('okuma yetkisi geri alınmıyor', () => {
    expect(sql).not.toMatch(/REVOKE[^;]*SELECT[^;]*ON public\.(student_fees|finance_)/)
  })
})

describe('068 · migration güvenliği', () => {
  // Tutarsız satır varsa ALTER TABLE zaten patlar ama hata mesajı hangi
  // tablonun sorunlu olduğunu söylemez. Ön kontrol bunu söylüyor.
  it('kısıt eklenmeden önce mevcut veri kontrol ediliyor', () => {
    expect(sql).toMatch(/Tutarsız finans satırı var/)
  })

  it('geri alma yolu yazılı', () => {
    expect(sql).toContain('ROLLBACK')
  })
})
