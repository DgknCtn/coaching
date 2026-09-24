import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// KİŞİSEL ALANIN GİZLİLİĞİ — R8 §14 / kabul testi #11.
//
// ============================================================
// NEDEN BU TEST VAR
//
// Belgenin en sert maddesi: öğrencinin kişisel ajandası öğretmene ve
// veliye GÖRÜNMEZ, akademik istatistiğe girmez, performans puanına
// dönüşmez. 101 bunu şemaya gömdü: `student_personal_items` için
// öğretmen ve veli politikası HİÇ YAZILMADI, yani o oturumlarda sorgu
// boş döner.
//
// Ama şema tek başına yetmez. Birinin iyi niyetle "öğretmen de görsün"
// diye bir SELECT politikası eklemesi ya da bir view'ın bu tabloyu
// join etmesi, korumayı tek satırda kaldırır ve bunu kimse fark etmez:
// ekran bozulmaz, test kırılmaz, yalnız öğrencinin özel alanı sessizce
// açılır. Gizlilik ihlalleri gürültü çıkarmaz.
//
// 049'daki P0 bulgusunun dersi buydu ve tenant-isolation.test.ts o
// yüzden yazıldı. Bu dosya aynı işi kiracılar arası değil ROLLER arası
// yapıyor.
//
// NE TEST EDER: (1) tabloyu yalnız öğrencinin kendi ekranı okur,
// (2) migration'larda öğretmen/veli için politika açılmamıştır.
//
// NE TEST ETMEZ: çalışan bir öğretmen oturumunun gerçekten boş görmesi —
// o, canlı projeye karşı elle doğrulanır.
// ============================================================

const PRIVATE_TABLE = 'student_personal_items'

/** Bu tabloyu okumasına izin verilen TEK yer: öğrencinin kendi ekranı. */
const ALLOWED_PREFIX = join('app', '(dashboard)', 'student', 'haftam')

const CODE_ROOTS = ['app', 'components', 'lib']
const CODE_EXTENSIONS = ['.ts', '.tsx']

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (CODE_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(full)
  }
  return out
}

describe('kişisel alan · rol izolasyonu (R8 §14)', () => {
  it('tabloyu yalnız öğrencinin Haftam ekranı okur', () => {
    const offenders: string[] = []

    for (const root of CODE_ROOTS) {
      for (const file of walk(join(process.cwd(), root))) {
        const relative = file.slice(process.cwd().length + 1)
        if (relative.startsWith(ALLOWED_PREFIX)) continue
        if (readFileSync(file, 'utf8').includes(PRIVATE_TABLE)) {
          offenders.push(relative)
        }
      }
    }

    expect(
      offenders,
      `${PRIVATE_TABLE} öğrenci Haftam ekranı dışında okunuyor: ${offenders.join(', ')}`
    ).toEqual([])
  })

  it('migration hiçbir öğretmen/veli politikası açmaz', () => {
    const dir = join(process.cwd(), 'supabase/migrations')

    // Tabloya politika açan satırlar: yalnız öğrenciye ait olan
    // (`is_student_self`) geçerli. `has_workspace_role` bir öğretmen
    // kapısıdır; `is_parent_of_student` veli kapısı.
    const suspicious: string[] = []

    for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, name), 'utf8')
      if (!sql.includes(PRIVATE_TABLE)) continue

      // Bu tabloya ait politika bloklarını kabaca ayıkla.
      const blocks = sql
        .split(/CREATE\s+POLICY/i)
        .slice(1)
        .filter((block) => block.slice(0, 400).includes(PRIVATE_TABLE))

      for (const block of blocks) {
        const head = block.slice(0, 600)
        if (/has_workspace_role|is_parent_of_student/i.test(head)) {
          suspicious.push(`${name}: ${head.split('\n')[0].trim()}`)
        }
      }
    }

    expect(
      suspicious,
      `${PRIVATE_TABLE} için öğretmen/veli politikası açılmış: ${suspicious.join(' | ')}`
    ).toEqual([])
  })

  it('tabloyu okuyan bir view yoktur', () => {
    // View'lar `security_invoker` ile çalışsa bile, tabloyu bir view'a
    // sokmak onu öğretmen tarafındaki bir sorgunun erişim alanına
    // taşımanın en kolay yoludur.
    const dir = join(process.cwd(), 'supabase/migrations')
    const offenders: string[] = []

    for (const name of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
      const sql = readFileSync(join(dir, name), 'utf8')
      const views = sql.split(/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW/i).slice(1)
      for (const view of views) {
        // Bir sonraki ifadeye kadar olan gövde.
        const body = view.split(/;\s*$/m)[0]
        if (body.includes(PRIVATE_TABLE)) offenders.push(name)
      }
    }

    expect(
      offenders,
      `${PRIVATE_TABLE} bir view içinde okunuyor: ${offenders.join(', ')}`
    ).toEqual([])
  })
})
