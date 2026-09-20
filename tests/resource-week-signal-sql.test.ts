import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// ============================================================
// HAFTALIK KAYNAK SİNYALİ — SQL SÖZLEŞMESİ
//
// NEDEN BU TEST VAR
//
// "Bu kaynaktan bu hafta çalışma verildi mi?" sorusunun yanıtı TAMAMEN
// SQL'de üretiliyor (student_resource_week_signal_view, 098); TypeScript
// tarafı (lib/weekly-resource-signal.ts) yalnız satırları okuyor. Bu
// bilinçli bir seçim: hafta sınırı iki yerde hesaplanırsa iki ekran
// farklı hafta gösterir — repodaki *-sql-parity testlerinin anlattığı
// hata tam olarak buydu.
//
// Ama bedeli şu: görünümün DAVRANIŞI TypeScript birim testiyle
// doğrulanamaz. Canlı veritabanı olmadan sorgu çalıştırılamadığı için
// burada görünümün METNİ okunur ve belgenin dört kararı sabitlenir:
//
//   1. hafta sınırı DATE_TRUNC('week', ...) ile pazartesi başlangıçlı
//      (004'teki haftalık ödev özetiyle aynı kalıp),
//   2. "bu hafta verilen" yalnız bu haftanın teslim tarihli kalemleri,
//   3. "açık ödev" HAFTADAN BAĞIMSIZ (§6.3: geçmiş haftadan kalan iş
//      bu haftanın hesabından düşülmez),
//   4. iptal edilmiş kalem ve arşivlenmiş grup sayılmaz (097).
// ============================================================

const SQL_PATH = join(
  process.cwd(),
  'supabase/migrations/098_resource_scope_and_week_signal.sql'
)
const SQL = readFileSync(SQL_PATH, 'utf8')

const VIEW = SQL.slice(
  SQL.indexOf('CREATE OR REPLACE VIEW public.student_resource_week_signal_view'),
  SQL.indexOf('COMMENT ON VIEW public.student_resource_week_signal_view')
)

describe('student_resource_week_signal_view', () => {
  it('hafta sınırını pazartesi başlangıçlı DATE_TRUNC ile kurar', () => {
    expect(VIEW).toContain("DATE_TRUNC('week', CURRENT_DATE)")
  })

  it('"bu hafta verilen" tam yedi günlük bir pencereyle sınırlıdır', () => {
    expect(VIEW).toMatch(/hb\.due_date\s*>=\s*DATE_TRUNC\('week', CURRENT_DATE\)::DATE/)
    expect(VIEW).toMatch(/hb\.due_date\s*<\s*DATE_TRUNC\('week', CURRENT_DATE\)::DATE \+ 7/)
  })

  it('"açık ödev" haftaya göre süzülmez — yalnız duruma bakar', () => {
    const openItems = VIEW.slice(
      VIEW.indexOf("COUNT(*) FILTER (WHERE hi.status = 'pending')"),
      VIEW.indexOf('FROM public.homework_items')
    )
    expect(openItems).not.toContain('due_date')
    expect(openItems).not.toContain('week')
  })

  it('iptal edilmiş kalemleri ve arşivlenmiş ödev gruplarını saymaz', () => {
    expect(VIEW).toContain("hi.status <> 'cancelled'")
    expect(VIEW).toContain("hb.status = 'active'")
  })

  it('satırları kaynak (atama) bazında gruplar', () => {
    expect(VIEW).toContain('hi.student_book_assignment_id')
    expect(VIEW).toMatch(/GROUP BY[^;]*hi\.student_book_assignment_id/)
  })

  it('çağıranın haklarıyla çalışır — RLS atlanmaz', () => {
    expect(VIEW).toContain('security_invoker = true')
  })
})

describe('098 — kaynak atama şeması', () => {
  it('scope_id nullable ve backfill yapılmaz: akademik alan tahmin edilmez', () => {
    expect(SQL).toContain('ADD COLUMN IF NOT EXISTS scope_id UUID')
    // Backfill yalnız DDL bölümünde aranır: set_student_book_scope'un
    // UPDATE'i öğretmenin elle düzeltmesidir, toplu tahmin değil.
    const ddl = SQL.slice(0, SQL.indexOf('CREATE OR REPLACE FUNCTION'))
    expect(ddl).not.toMatch(/UPDATE public\.student_book_assignments/)
  })

  it('yeni atama Bekliyor durumunda açılır (§4.2)', () => {
    const rpc = SQL.slice(
      SQL.indexOf('CREATE OR REPLACE FUNCTION public.assign_book_to_student'),
      SQL.indexOf('CREATE OR REPLACE FUNCTION public.set_student_book_scope')
    )
    expect(rpc).toMatch(/p_scope_id,\s*'pending'/)
  })

  it('kolon varsayılanı değişmez: bu RPC dışındaki yazarlar etkilenmemeli', () => {
    expect(SQL).not.toMatch(/ALTER COLUMN status SET DEFAULT/)
  })

  it('ataması olan kitap silinemez, yalnız arşivlenir (§7.3)', () => {
    const fn = SQL.slice(SQL.indexOf('CREATE OR REPLACE FUNCTION public.delete_unassigned_book'))
    expect(fn).toContain('FROM public.student_book_assignments')
    expect(fn).toContain("RAISE EXCEPTION 'Book is assigned'")
  })
})
