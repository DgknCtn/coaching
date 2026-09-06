import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// PLAN DEĞERLERİ: YAZILAN ↔ KISITIN İZİN VERDİĞİ
//
// ============================================================
// NEDEN BU TEST VAR
//
// 058 lisans modelini getirdi ve `settle_billing_order` o günden beri
// ödeme tamamlanınca `workspaces.plan = 'licensed'` yazıyor. Ama
// `workspaces_plan_chk` 052'deki listesiyle kaldı ve 'licensed' o
// listede yoktu. Sonuç: başarılı bir ödeme bile lisansı açamıyordu,
// tahsilat kısıt ihlaliyle geri alınıyordu.
//
// Hata YALNIZ üretimde, YALNIZ para ödendikten sonra görülebiliyordu —
// ödeme entegrasyonu tamamlanmadığı için aylarca sessiz bekledi.
// Derleme, tip kontrolü ve diğer testlerin hiçbiri göremezdi.
//
// Bu test, SQL'in yazdığı her plan değerinin kısıtta bulunduğunu
// doğruluyor: aynı tuzağın bir sonraki plan değeri eklendiğinde
// kurulmasını engelliyor.
// ============================================================

const MIGRATIONS_DIR = join(process.cwd(), 'supabase/migrations')

function allSql(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort()
    .map(name => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }))
}

/** Yorum satırlarını atar — örnek SQL'ler yorum içinde yaşıyor. */
function withoutComments(sql: string): string {
  return sql
    .split('\n')
    .filter(line => !line.trim().startsWith('--'))
    .join('\n')
}

/** En SON tanımlanan workspaces_plan_chk listesindeki değerler. */
function allowedPlans(): string[] {
  let allowed: string[] = []

  for (const { sql } of allSql()) {
    const body = withoutComments(sql)
    const re = /CONSTRAINT\s+workspaces_plan_chk\s+CHECK\s*\(\s*plan\s+IN\s*\(([^)]*)\)/gi
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      allowed = [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])
    }
  }

  return allowed
}

/** `workspaces` üzerinde plan'a yazılan sabit değerler. */
function writtenPlans(): { value: string; file: string }[] {
  const found: { value: string; file: string }[] = []

  for (const { name, sql } of allSql()) {
    const body = withoutComments(sql)

    // `SET plan = 'x'` (UPDATE public.workspaces ... SET plan = ...)
    for (const m of body.matchAll(/SET\s+plan\s*=\s*'([a-z_]+)'/gi)) {
      found.push({ value: m[1], file: name })
    }

    // INSERT INTO public.workspaces (... plan ...) VALUES (... 'trial' ...)
    // Bu kalıp create_teacher_workspace'te sabit 'trial' olarak geçiyor.
    for (const m of body.matchAll(/'individual',\s*v_profile_id,\s*'([a-z_]+)'/g)) {
      found.push({ value: m[1], file: name })
    }
  }

  return found
}

describe('workspaces.plan — kısıt ve yazılan değerler aynı kümede', () => {
  it('kısıt bulunuyor ve boş değil', () => {
    expect(allowedPlans().length).toBeGreaterThan(0)
  })

  it("'licensed' kısıtta bulunur — ödeme yolunun yazdığı değer", () => {
    // Bu satır düşerse başarılı ödemeler yine sessizce geri alınır.
    expect(allowedPlans()).toContain('licensed')
  })

  it('SQL içinde plan alanına yazılan her değere kısıt izin verir', () => {
    const allowed = allowedPlans()
    const offenders = writtenPlans().filter(w => !allowed.includes(w.value))

    expect(
      offenders,
      offenders.map(o => `${o.file}: plan = '${o.value}'`).join('\n')
    ).toEqual([])
  })

  it('uygulamanın bildiği plan kimlikleri de kısıtta bulunur', () => {
    // lib/plans.ts › PlanId ile aynı küme. Uygulama bu üçünü okuyabildiğini
    // varsayıyor; kısıt birini reddediyorsa yazan taraf patlar.
    for (const plan of ['trial', 'licensed', 'institution']) {
      expect(allowedPlans(), `${plan} kısıtta yok`).toContain(plan)
    }
  })
})
