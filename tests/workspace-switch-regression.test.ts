import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ÇALIŞMA ALANI GEÇİŞİ — İKİ KUSURUN REGRESYON KİLİDİ
//
// ============================================================
// NEDEN BU TEST VAR (12 Eylül 2026 saha raporu)
//
// Kullanıcı seçicide iki alan gördü ve ikincisine geçemedi. Üst üste
// binmiş iki kusur vardı:
//
// 1. GEÇİŞ: `switchWorkspaceAction` üyeliği `.maybeSingle()` ile
//    okuyordu. Ama `create_teacher_workspace` her öğretmene KENDİ
//    alanında İKİ üyelik satırı yazar (owner + teacher), üstelik
//    UNIQUE kısıt da (workspace_id, profile_id, role) üzerinde, yani
//    çokluk şemanın kuralı. PostgREST iki satırda hata döndürüyor,
//    hata İngilizce olduğu için kullanıcıya "İşlem tamamlanamadı"
//    çıkıyordu. Sonuç: koç SAHİBİ OLDUĞU alana hiç geçemiyordu —
//    davetle girdiği alana geçebiliyordu. Kusur böyle ters göründüğü
//    için de yanlış yerde arandı.
//
// 2. ÇİFT ALAN: aynı RPC idempotent değildi; ikinci çağrı sessizce
//    ikinci bir alan açıyordu (095).
//
// İkisi de canlı veritabanı ister; burada niyet KAYNAKTAN okunuyor.
// Zayıf ama doğru yerde duran bir kilit: iki değişikliğin de sessizce
// geri alınmasını engeller.
// ============================================================

const ACTION_PATH = join(process.cwd(), 'app/(dashboard)/workspace-actions.ts')
const MIGRATION_PATH = join(
  process.cwd(),
  'supabase/migrations/095_create_teacher_workspace_idempotent.sql'
)

describe('switchWorkspaceAction üyelik okuması', () => {
  const source = readFileSync(ACTION_PATH, 'utf8')

  // Sorgunun gövdesi: `from('workspace_members')` ile ilk `await`
  // sonrasına kadar olan kısım.
  const query = source.slice(source.indexOf("from('workspace_members')"))
  const queryEnd = query.indexOf('if (error)')
  const membershipQuery = query.slice(0, queryEnd)

  it('tekil satır beklemez: owner + teacher aynı alanda iki satırdır', () => {
    expect(membershipQuery).not.toContain('maybeSingle')
    expect(membershipQuery).not.toContain('.single(')
  })

  it('rol süzgeci owner ve teacher ile kalır', () => {
    expect(membershipQuery).toContain("'owner'")
    expect(membershipQuery).toContain("'teacher'")
  })

  it('üyelik yokluğu ayrı ve anlaşılır mesajla döner', () => {
    // Genel "İşlem tamamlanamadı" mesajı yetki durumunu gizliyordu.
    expect(source).toContain('Bu çalışma alanına erişiminiz yok.')
  })
})

describe('create_teacher_workspace idempotentliği', () => {
  const sql = readFileSync(MIGRATION_PATH, 'utf8')

  it('var olan bireysel alanı bulup erken döner', () => {
    expect(sql).toMatch(/owner_profile_id\s*=\s*v_profile_id/)
    expect(sql).toMatch(/IF\s+v_workspace_id\s+IS\s+NOT\s+NULL\s+THEN/i)
    expect(sql).toMatch(/'created',\s*FALSE/)
  })

  it('erken dönüş dalında yeni workspace INSERT etmez', () => {
    const guard = sql.slice(
      sql.search(/IF\s+v_workspace_id\s+IS\s+NOT\s+NULL\s+THEN/i),
      sql.indexOf('END IF;')
    )
    expect(guard).not.toMatch(/INSERT\s+INTO\s+public\.workspaces/i)
  })

  it('varsayılanı yalnız boşken onarır, üzerine yazmaz', () => {
    expect(sql).toMatch(/default_workspace_id\s+IS\s+NULL/)
  })
})
