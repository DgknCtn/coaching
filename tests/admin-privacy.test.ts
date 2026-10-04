import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// YÖNETİM MAHREMİYETİ — kısıt fonksiyonda, arayüzde değil (060, 124)
//
// Kural (kullanıcı kararı, 27 Eylül 2026): öğretmen ADIYLA görünür;
// öğrenci ve veli YALNIZ SAYI. Öğrenci adı, ödev içeriği, not ve
// audit_events.detail hiçbir admin fonksiyonundan dönmez. Arayüzde
// saklamak, veriyi tarayıcıya göndermiş olmak demekti.
//
// Bu test 124 ve sonrasındaki admin_* fonksiyon gövdelerini tarar:
//   - öğrenci/veli adı taşıyan sütun okuması (s.full_name, students.full_name,
//     parent adları) yok;
//   - detail / note / note_text / body okuması yok.
// Profil adı (p.full_name) yalnız öğretmen listesinde izinli.
// ============================================================

const DIR = join(process.cwd(), 'supabase/migrations')

function adminFunctionBodies(): { file: string; name: string; body: string }[] {
  const out: { file: string; name: string; body: string }[] = []
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql') && Number.parseInt(f, 10) >= 124)) {
    const sql = readFileSync(join(DIR, file), 'utf8')
    const re = /CREATE OR REPLACE FUNCTION public\.(admin_\w+)\s*\([\s\S]*?\$(\w*)\$([\s\S]*?)\$\2\$/g
    for (const m of sql.matchAll(re)) out.push({ file, name: m[1], body: m[3] })
  }
  return out
}

// Öğretmen adı dönmesine izin verilen fonksiyonlar (müşteri = öğretmen).
// admin_list_workspaces (126): sahibin adı — sahip öğretmendir.
const TEACHER_NAME_ALLOWED = new Set([
  'admin_teacher_activity',
  'admin_workspace_activity',
  'admin_list_workspaces',
  // admin_list_users (136): hesap temizliği. Ad YALNIZ öğrenci/veli
  // olmayan hesapta döner; maskeleme aşağıdaki ayrı testte sabit.
  'admin_list_users',
])

describe('yönetim fonksiyonları mahremiyeti', () => {
  const fns = adminFunctionBodies()

  it('tarama bir şey buluyor', () => {
    expect(fns.length).toBeGreaterThanOrEqual(9)
  })

  for (const { name, body } of fns) {
    it(`${name}: öğrenci/veli adı, not ya da detail dönmez`, () => {
      const code = body.replace(/--.*$/gm, '')
      expect(code, 'öğrenci adı okunuyor').not.toMatch(/\bs\.full_name\b|students\.full_name/)
      expect(code, 'audit/auth detail okunuyor').not.toMatch(/\b(a|e|ae)\.detail\b|'detail'/)
      expect(code, 'not metni okunuyor').not.toMatch(/\bnote_text\b|\bbody\b(?!\s*[,)]?\s*--)/)
      if (!TEACHER_NAME_ALLOWED.has(name)) {
        expect(code, 'profil adı yalnız öğretmen listelerinde').not.toMatch(/\bp\.full_name\b/)
      }
    })

    it(`${name}: yönetici denetimiyle başlar`, () => {
      expect(body).toMatch(/IF NOT public\.is_platform_admin\(\) THEN\s+RAISE EXCEPTION 'Permission denied'/)
    })
  }
})

describe('hesap temizliği listesi (136) öğrenci/veli adını maskeler', () => {
  const sql = readFileSync(join(DIR, '136_admin_cleanup.sql'), 'utf8')

  it('ad ve e-posta öğrenci/veli hesabında gizli', () => {
    expect(sql).toMatch(/CASE WHEN l\.learner THEN NULL ELSE p\.full_name END/)
    expect(sql).toMatch(/CASE WHEN l\.learner THEN public\.cleanup_mask_email\(/)
    expect(sql).toMatch(/'name', CASE WHEN v_learner THEN NULL ELSE v_profile\.full_name END/)
  })

  it('öğrenci/veli hesabı adla aranamaz', () => {
    expect(sql).toMatch(/NOT l\.learner AND p\.full_name ILIKE/)
  })
})
