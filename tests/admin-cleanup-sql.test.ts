import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// YÖNETİM PANELİ · SEÇEREK TEMİZLEME (136) — SQL SÖZLEŞMESİ
//
// Silme RPC'leri canlı veritabanı olmadan çalıştırılamaz; burada
// migration METNİ okunur ve geri dönüşü olmayan işlemlerin kapıları
// sabitlenir: yönetici denetimi, gerekçe, birebir onay, ödeme engeli,
// silmeden ÖNCE yönetim kaydı ve RESTRICT bağının sırası.
// ============================================================

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/136_admin_cleanup.sql'),
  'utf8'
)

function fn(name: string): string {
  const start = SQL.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  expect(start, `${name} tanımı yok`).toBeGreaterThan(-1)
  const end = SQL.indexOf('$fn$;', start)
  // Yorumlar ayıklanır: gerekçe metni tablo adlarını anıyor.
  return SQL.slice(start, end).replace(/--.*$/gm, '')
}

const DELETES = ['admin_delete_workspace', 'admin_delete_partner', 'admin_delete_user']

describe('136 · ortak kapılar', () => {
  it.each(DELETES)('%s: yönetici + gerekçe + kayıt, kayıt silmeden ÖNCE', (name) => {
    const body = fn(name)
    expect(body).toMatch(/IF NOT public\.is_platform_admin\(\) THEN\s+RAISE EXCEPTION/)
    expect(body).toMatch(/PERFORM public\.require_admin_reason\(p_reason\)/)
    expect(body).toMatch(/FOR UPDATE/)
    const logged = body.indexOf('record_admin_action')
    const firstDelete = body.indexOf('DELETE FROM')
    expect(logged).toBeGreaterThan(-1)
    expect(logged).toBeLessThan(firstDelete)
  })

  it.each(DELETES)('%s: birebir onay metni silmeden önce denetlenir', (name) => {
    const body = fn(name)
    const confirm = body.search(/btrim\(COALESCE\(p_confirm_(name|email), ''\)\)/)
    expect(confirm).toBeGreaterThan(-1)
    expect(confirm).toBeLessThan(body.indexOf('DELETE FROM'))
  })

  it('önizleme ve liste de yönetici denetimi yapar', () => {
    expect(fn('admin_cleanup_preview')).toMatch(/is_platform_admin\(\)/)
    expect(fn('admin_list_users')).toMatch(/is_platform_admin\(\)/)
  })

  it('iç yardımcılar istemciye kapalı', () => {
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_workspace_facts\(UUID\) FROM PUBLIC, anon, authenticated/
    )
    expect(SQL).toMatch(
      /REVOKE ALL ON FUNCTION public\.admin_profile_blockers\(UUID\) FROM PUBLIC, anon, authenticated/
    )
  })
})

describe('136 · çalışma alanı', () => {
  it('kütüphane, ödenmiş sipariş ve ödenmiş komisyon engeldir', () => {
    const facts = fn('admin_workspace_facts')
    expect(facts).toMatch(/WHEN v_ws\.is_library THEN/)
    expect(facts).toMatch(/billing_orders WHERE workspace_id = p_workspace_id AND status = 'paid'/)
    expect(facts).toMatch(/partner_commissions WHERE workspace_id = p_workspace_id AND status = 'paid'/)
    expect(fn('admin_delete_workspace')).toMatch(/IF \(v_facts->>'blocked'\)::BOOLEAN THEN/)
  })

  it('RESTRICT bağlı student_services ve kural tanımsız FK\'lar alandan ÖNCE silinir', () => {
    const body = fn('admin_delete_workspace')
    const order = [
      'DELETE FROM public.student_services',
      'DELETE FROM public.test_completions',
      'DELETE FROM public.homework_items',
      'DELETE FROM public.homework_batches',
      'DELETE FROM public.workspaces',
    ].map((s) => body.indexOf(s))
    expect(order.every((i) => i > -1)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('varsayılan alan silmeden önce başka üyeliğe taşınır', () => {
    const body = fn('admin_delete_workspace')
    expect(body.indexOf('SET default_workspace_id')).toBeLessThan(
      body.indexOf('DELETE FROM public.workspaces')
    )
  })
})

describe('136 · partner ve kullanıcı', () => {
  it('ödenmiş komisyonu olan partner silinemez', () => {
    expect(fn('admin_cleanup_preview')).toMatch(/partner_id = p_id AND status = 'paid'/)
    expect(fn('admin_delete_partner')).toMatch(/IF \(v_preview->>'blocked'\)::BOOLEAN THEN/)
  })

  it('yönetici, kendi hesabı, sahip olunan alan ve bağlı kayıt kullanıcı silmeyi engeller', () => {
    const preview = fn('admin_cleanup_preview')
    expect(preview).toMatch(/is_platform_admin, FALSE\) THEN 'Platform yöneticisi silinemez/)
    expect(preview).toMatch(/p_id = public\.current_profile_id\(\) THEN/)
    expect(preview).toMatch(/FROM public\.workspaces WHERE owner_profile_id = p_id/)
    expect(preview).toMatch(/v_blockers <> '\{\}'::JSONB/)
  })

  it('engeller pg_constraint\'ten dinamik: ON DELETE kuralı olmayan (a) ve RESTRICT (r)', () => {
    const body = fn('admin_profile_blockers')
    expect(body).toMatch(/c\.confrelid = 'public\.profiles'::regclass/)
    expect(body).toMatch(/c\.confdeltype IN \('a', 'r'\)/)
  })

  it('kullanıcı auth.users üzerinden silinir (profil CASCADE)', () => {
    expect(fn('admin_delete_user')).toMatch(
      /DELETE FROM auth\.users WHERE id = v_profile\.auth_user_id/
    )
  })
})
