import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// 150 — M1.0-04 HİZMET İLK AKTİVASYON SİNYALİ: SQL GÜVENLİK KURALLARI
//
// NEDEN BU TEST VAR
//
// Bu migration'ın en riskli kısmı set_service_status'un dönüş tipini
// değiştirmesi (VOID -> BOOLEAN). Postgres bunu CREATE OR REPLACE ile
// kabul etmiyor — DROP FUNCTION önce gelmezse migration SQL Editor'de
// "cannot change return type of existing function" hatasıyla patlar.
// Bu test o sırayı metin düzeyinde kilitliyor; canlı veritabanı
// gerektirmeden CI'da yakalanır.
//
// Diğer *-sql testleriyle aynı yöntem (readFileSync + regex, bkz.
// tests/academic-tasks-sql.test.ts).
// ============================================================

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/150_haftalik_takip_revizyon.sql'), 'utf8')
const code = sql
  .split(/\r?\n/)
  .filter((l) => !l.trimStart().startsWith('--'))
  .join('\n')

function body(name: string): string {
  const m = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(([\\s\\S]*?)\\$fn\\$([\\s\\S]*?)\\$fn\\$`).exec(code)
  expect(m, name).not.toBeNull()
  return m![2]
}

describe('150 haftalık takip revizyonu', () => {
  it('activated_at sütunu IF NOT EXISTS ile açılıyor', () => {
    expect(code).toMatch(
      /ALTER TABLE public\.student_services\s+ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ/
    )
  })

  it('geriye dönük doldurma WHERE içeriyor ve yalnız NULL satırları hedefliyor', () => {
    const match = /UPDATE public\.student_services\s+SET activated_at = created_at\s+WHERE ([\s\S]*?);/.exec(code)
    expect(match, 'backfill UPDATE bulunamadı').not.toBeNull()
    expect(match![1]).toContain('activated_at IS NULL')
  })

  it("set_service_status'ta DROP FUNCTION, CREATE OR REPLACE'den ÖNCE geliyor", () => {
    // Dönüş tipi VOID -> BOOLEAN değişiyor; Postgres bunu yalnız DROP +
    // CREATE ile kabul ediyor. Sıra ters olursa migration SQL
    // Editor'de ikinci kez bile çalıştırılamaz — en kritik kural bu.
    const dropIndex = code.indexOf('DROP FUNCTION IF EXISTS public.set_service_status(UUID, TEXT);')
    const createIndex = code.indexOf('CREATE OR REPLACE FUNCTION public.set_service_status(')
    expect(dropIndex, 'DROP FUNCTION satırı bulunamadı').toBeGreaterThan(-1)
    expect(createIndex, 'CREATE OR REPLACE satırı bulunamadı').toBeGreaterThan(-1)
    expect(dropIndex).toBeLessThan(createIndex)
  })

  it('set_service_status BOOLEAN döndürüyor', () => {
    expect(code).toMatch(/CREATE OR REPLACE FUNCTION public\.set_service_status\(([\s\S]*?)\)\s*RETURNS BOOLEAN/)
  })

  it('set_service_status ilk aktivasyonu activated_at IS NULL anından okuyor', () => {
    const fn = body('set_service_status')
    expect(fn).toMatch(/SELECT activated_at IS NULL INTO v_was_null/)
    expect(fn).toMatch(/RETURN p_status = 'active' AND v_was_null/)
  })

  it('activated_at yalnız NULL iken dolduruluyor — ikinci aktivasyonda ezilmiyor', () => {
    const fn = body('set_service_status')
    expect(fn).toMatch(/COALESCE\(activated_at, NOW\(\)\)/)
  })

  it('create_student_service yeni hizmette activated_at = NOW() yazıyor', () => {
    const fn = body('create_student_service')
    // Sütun listesinin son adı activated_at, VALUES'un son değeri NOW()
    // olmalı — ikisinin de INSERT'e eklenip eklenmediğini, konumdan
    // bağımsız olarak doğrular (RETURNING clause'u ayrıştırmaya
    // çalışmaz, kırılgan olmasın diye).
    const columns = /INSERT INTO public\.student_services \(([\s\S]*?)\)/.exec(fn)
    expect(columns, 'sütun listesi bulunamadı').not.toBeNull()
    expect(columns![1].trim().endsWith('activated_at')).toBe(true)

    const values = /VALUES \(([\s\S]*?)\)\s*RETURNING/.exec(fn)
    expect(values, 'VALUES listesi bulunamadı').not.toBeNull()
    expect(values![1].trim().endsWith('NOW()')).toBe(true)
  })

  it('her iki fonksiyon da is_platform_admin değil has_workspace_role ile yetki denetliyor', () => {
    // Bu RPC'ler öğretmen/sahip işlemi — platform yöneticisi değil.
    for (const name of ['create_student_service', 'set_service_status']) {
      expect(body(name), name).toMatch(/has_workspace_role\(.*ARRAY\['owner', 'teacher'\]/)
    }
  })

  it('set_service_status için REVOKE/GRANT bloğu doğru sırada', () => {
    expect(code).toMatch(
      /REVOKE ALL ON FUNCTION public\.set_service_status\(UUID, TEXT\) FROM PUBLIC, anon;\s*\n\s*GRANT EXECUTE ON FUNCTION public\.set_service_status\(UUID, TEXT\) TO authenticated;/
    )
  })

  it('doğrulama bloğu anon erişimini ve yetki denetimini kontrol ediyor', () => {
    expect(code).toMatch(/has_function_privilege\('anon', 'public\.set_service_status\(uuid,text\)'::regprocedure, 'EXECUTE'\)/)
    expect(code).toMatch(/pg_get_functiondef\('public\.set_service_status\(uuid,text\)'::regprocedure\) NOT LIKE '%has_workspace_role%'/)
  })

  it('ROLLBACK notu mevcut', () => {
    // `code` yorum satırlarını eledi (üstteki regex'ler bu yüzden
    // gövdeyi temiz görüyor) — ROLLBACK bloğu TAMAMEN yorum olduğu
    // için burada ham `sql` üzerinde aranıyor.
    expect(sql).toMatch(/-- ROLLBACK:/)
  })
})
