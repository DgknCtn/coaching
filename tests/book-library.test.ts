import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { librarySelectionSchema, libraryReviewSchema } from '@/lib/validation'

// KAYNAK KÜTÜPHANESİ — 069'un taşıyıcı kuralları.
//
// ============================================================
// NEDEN BU TEST VAR
//
// Kütüphane, tek bir çalışma alanının kitaplarını BÜTÜN koçlara açan ilk
// özellik. O kapı yanlış açılırsa sızan şey bir tercih değil, başka bir
// koçun havuzudur. Canlı veritabanı olmadan politikalar çalıştırılamıyor;
// onun yerine migration metnindeki taşıyıcı kararlar okunup doğrulanıyor —
// 068'in rate-limit parite testiyle aynı yöntem.
//
// ÜÇ KURAL BURADA KİLİTLİ:
//
//   1. Kütüphane okuma kolu YALNIZ kütüphane alanının YAYINDAKİ kitabına
//      açılır. `is_library_workspace` ya da `library_status = 'approved'`
//      koşulu düşerse politika bütün çalışma alanlarını açar.
//   2. Kütüphaneye yazan her RPC gövdesinde yetki kontrol eder. Admin
//      RPC'sinde `is_platform_admin()`, koç RPC'sinde `has_workspace_role`.
//   3. Alanlar arası kopyada topic bağları DÜŞER. `topics` workspace'e
//      bağlıdır (038); yabancı bir topic id'si taşımak, kaynağı başka bir
//      kiracının müfredat satırına bağlamak olurdu.
// ============================================================

const SQL = readFileSync(
  join(process.cwd(), 'supabase/migrations/069_book_library.sql'),
  'utf8'
)

const SQL_070 = readFileSync(
  join(process.cwd(), 'supabase/migrations/070_library_autopublish.sql'),
  'utf8'
)

/** Bir fonksiyonun gövdesi: CREATE ... FUNCTION public.<ad> ... $fn$; */
function functionBody(name: string): string {
  const start = SQL.indexOf(`FUNCTION public.${name}(`)
  expect(start, `${name} migration'da bulunamadı`).toBeGreaterThan(-1)
  const end = SQL.indexOf('$fn$;', start)
  expect(end, `${name} gövdesi kapanmamış`).toBeGreaterThan(start)
  return SQL.slice(start, end)
}

/** Bir SELECT politikasının USING gövdesi. */
function policyBody(name: string): string {
  const start = SQL.indexOf(`CREATE POLICY ${name}`)
  expect(start, `${name} politikası bulunamadı`).toBeGreaterThan(-1)
  const end = SQL.indexOf('\n\n', start)
  return SQL.slice(start, end === -1 ? undefined : end)
}

describe('069 — kütüphane okuma politikaları', () => {
  const policies = ['"books_select"', '"sections_select"', '"tests_select"', 'book_parts_select']

  it.each(policies)('%s kütüphane kolunu yalnız kütüphane alanına açar', (name) => {
    const body = policyBody(name)
    expect(body).toContain('is_library_workspace')
    expect(body).toContain('can_read_library')
  })

  it.each(policies)('%s yalnız onaylı kütüphane kitabını açar', (name) => {
    expect(policyBody(name)).toContain("library_status = 'approved'")
  })

  it.each(policies)('%s mevcut workspace ve öğrenci kollarını korur', (name) => {
    const body = policyBody(name)
    expect(body).toContain('has_workspace_role')
    expect(body).toContain('is_student_self')
  })

  it('kütüphane okuması yalnız owner/teacher üyeliğine açıktır', () => {
    const body = functionBody('can_read_library')
    expect(body).toContain("wm.role IN ('owner', 'teacher')")
    expect(body).toContain("wm.status = 'active'")
    // Öğrenci ve veli kütüphaneyi gezmez.
    expect(body).not.toContain('student')
  })
})

describe('069 — yazma yolları yetki kontrol eder', () => {
  it.each(['approve_book_for_library', 'reject_book_for_library', 'ensure_library_workspace', 'admin_list_library_submissions'])(
    '%s platform yöneticisi ister',
    (name) => {
      expect(functionBody(name)).toContain('is_platform_admin()')
    }
  )

  it.each(['copy_library_books', 'submit_book_to_library', 'duplicate_book_as_edition'])(
    '%s çalışma alanı rolü ister',
    (name) => {
      const body = functionBody(name)
      expect(body).toContain('has_workspace_role')
      expect(body).toContain("RAISE EXCEPTION 'Permission denied'")
    }
  )

  it('_copy_book_tree authenticated role\'e AÇILMAZ — iç yardımcıdır', () => {
    expect(SQL).toContain('REVOKE ALL ON FUNCTION public._copy_book_tree')
    expect(SQL).not.toMatch(/GRANT EXECUTE ON FUNCTION public\._copy_book_tree/)
  })
})

describe('069 — copy_library_books kaynağı doğrular', () => {
  const body = functionBody('copy_library_books')

  it('yalnız kütüphanedeki yayındaki kitabı kopyalar', () => {
    // Bu üç koşul olmadan parametreye başka bir koçun kitap id\'si
    // yazılarak havuzu kopyalanabilirdi — RPC SECURITY DEFINER.
    expect(body).toContain('is_library_workspace(v_src.workspace_id)')
    expect(body).toContain("v_src.status <> 'active'")
    expect(body).toContain("v_src.library_status <> 'approved'")
  })

  it('havuzda zaten olan kitabı atlar, hata vermez', () => {
    expect(body).toContain('library_source_book_id = v_book_id')
    expect(body).toContain('v_skipped := v_skipped + 1')
    expect(body).toContain('CONTINUE')
  })

  it('arşivlenmiş kopyayı "var" saymaz — koç geri ekleyebilmeli', () => {
    expect(body).toContain("b.status <> 'archived'")
  })

  it('tek istekte yazılacak kitap sayısını sınırlar', () => {
    expect(body).toContain('> 50')
  })
})

describe('069 — alanlar arası kopyada topic bağları düşer', () => {
  const body = functionBody('_copy_book_tree')

  it('hedef alan farklıysa v_cross işaretlenir', () => {
    expect(body).toContain('v_cross := v_src.workspace_id IS DISTINCT FROM p_target_workspace_id')
  })

  it('bölümün topic_id\'si alanlar arası kopyada NULL olur', () => {
    // İki geçiş var (üst düzey + alt bölüm); ikisinde de aynı koruma.
    const matches = body.match(/CASE WHEN v_cross THEN NULL ELSE v_section\.topic_id END/g)
    expect(matches).toHaveLength(2)
  })

  it('book_section_topics yalnız aynı alan içinde kopyalanır', () => {
    const guards = body.match(/IF NOT v_cross THEN/g)
    expect(guards).toHaveLength(2)
  })

  it('öğrenci ilerlemesi kopyalanmaz', () => {
    expect(body).not.toContain('homework_items')
    expect(body).not.toContain('test_completions')
    expect(body).not.toContain('student_book_assignments')
  })

  it('R7 yapı katmanlarını taşır — 044\'ün kayıp alan hatası tekrarlanmasın', () => {
    for (const column of [
      'curriculum_program',
      'resource_type',
      'structure_kind',
      'tracking_mode',
      'video_mode',
      'parent_section_id',
      'test_start',
      'page_start',
    ]) {
      expect(body, `${column} kopyalanmıyor`).toContain(column)
    }
    expect(body).toContain('book_parts')
  })
})

describe('069 — şema kararları', () => {
  it('tek kütüphane alanı garantisi veritabanındadır', () => {
    expect(SQL).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_workspaces_single_library')
    expect(SQL).toContain('ON public.workspaces (is_library) WHERE is_library')
  })

  it('library_status yalnız bilinen dört değeri kabul eder', () => {
    expect(SQL).toContain(
      "CHECK (library_status IN ('none', 'pending', 'approved', 'rejected'))"
    )
  })

  it('geri alma bloğu vardır', () => {
    expect(SQL).toContain('-- ROLLBACK')
  })
})

describe('069 — istemci tarafı doğrulama sunucuyla aynı sınırı koyar', () => {
  it('boş seçim reddedilir', () => {
    expect(librarySelectionSchema.safeParse({ bookIds: [] }).success).toBe(false)
  })

  it('50 kitap geçer, 51 geçmez', () => {
    const id = '11111111-1111-4111-8111-111111111111'
    expect(
      librarySelectionSchema.safeParse({ bookIds: Array(50).fill(id) }).success
    ).toBe(true)
    expect(
      librarySelectionSchema.safeParse({ bookIds: Array(51).fill(id) }).success
    ).toBe(false)
  })

  it('uuid olmayan kimlik reddedilir', () => {
    expect(librarySelectionSchema.safeParse({ bookIds: ['abc'] }).success).toBe(false)
  })

  it('red gerekçesi isteğe bağlıdır ama sınırlıdır', () => {
    const bookId = '11111111-1111-4111-8111-111111111111'
    expect(libraryReviewSchema.safeParse({ bookId }).success).toBe(true)
    expect(libraryReviewSchema.safeParse({ bookId, reason: '' }).success).toBe(true)
    expect(
      libraryReviewSchema.safeParse({ bookId, reason: 'x'.repeat(501) }).success
    ).toBe(false)
  })
})

describe('070 — kütüphaneye giren kitap yayına girer', () => {
  // 069 "kütüphane alanındaki kitaplar approved'dır" diyordu ama bunu
  // hiçbir şey YAPMIYORDU: yönetici kütüphaneyi dolduruyor, koç boş
  // görüyor, arada hata mesajı yok.
  it('tetikleyici books üzerinde kuruludur', () => {
    expect(SQL_070).toContain('CREATE TRIGGER books_library_autopublish')
    expect(SQL_070).toContain('BEFORE INSERT OR UPDATE OF workspace_id ON public.books')
  })

  it('yalnız kütüphane alanındaki kitabı yayına alır', () => {
    expect(SQL_070).toContain('w.id = NEW.workspace_id AND w.is_library')
    expect(SQL_070).toContain("NEW.library_status := 'approved'")
  })

  it("bilerek reddedilmiş kaynağı geri yayına almaz", () => {
    expect(SQL_070).toContain("NEW.library_status IS DISTINCT FROM 'rejected'")
  })

  it('070 öncesi eklenmiş kitapları geriye dönük yayına alır', () => {
    expect(SQL_070).toContain("SET library_status = 'approved'")
    expect(SQL_070).toContain("b.library_status = 'none'")
  })

  it('kütüphane alanı deneme planında bırakılmaz', () => {
    // trial_ends_at yazıldığı gün has_workspace_role false döner ve
    // yönetici kendi kütüphanesine giremezdi (052).
    expect(SQL_070).toContain("SET plan = 'institution', student_limit = NULL, trial_ends_at = NULL")
    expect(SQL_070).toContain("'institution', NULL, NULL")
  })

  it('geri alma bloğu vardır', () => {
    expect(SQL_070).toContain('-- ROLLBACK')
  })
})
