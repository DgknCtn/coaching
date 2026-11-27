'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import {
  bookSchema,
  uuidSchema,
  librarySelectionSchema,
  firstIssue,
} from '@/lib/validation'
import { parseBookBackup, bookIdentityKey } from '@/lib/book-backup'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'

/**
 * İçe aktarılabilecek en büyük yedek metni.
 *
 * ~4 MB, 1000 kitaplık bir havuzun JSON'undan kat kat fazla. Sınır,
 * kazayla seçilen dev bir dosyanın sunucuyu ayrıştırmayla meşgul
 * etmesine karşı.
 */
const MAX_BACKUP_CHARS = 4_000_000

export interface SectionInput {
  title: string
  test_count: number
  /** R7-02 §6.4: çok parçalı kaynakta bölümün Parça adı. Boşsa parçasız. */
  part?: string
  /** R4 §3: bölümün niteliğini anlatan kısa insan notu. */
  note?: string
  video_url?: string
  /** Sayfa takipli kitapta bölüm fiziksel kapsamıyla tanımlanır (R4 §2A);
   *  RPC aralıktaki her sayfa için bir birim satırı açar. */
  page_start?: number | null
  page_end?: number | null
  /** Kitap Girişi 3a: içindekilerden gelen alt bölümler (test kitabı). */
  subsections?: { title: string; test_start: number; test_end: number }[]
}

export interface NewBookInput {
  title: string
  subject: string
  publisher?: string
  levelExam?: string
  curriculumProgram?: string
  editionYear?: number | null
  description?: string
  /** R7-02 §6.2-6.3: sınıflama alanları. */
  resourceType?: string
  structureKind?: string
  trackingMode?: string
  videoMode?: string
  videoUrl?: string
  /** Opsiyonel: kitap havuzu R4'te dönemden bağımsız (021). */
  termId?: string
  sections: SectionInput[]
}

export async function createBookAction(input: NewBookInput) {
  const parsed = bookSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  // Kitap Girişi 3a: alt bölümleri içindekilerden gelen bölüm TESTSİZ
  // kurulur — testler alt bölümlerle açılır (add_book_subsection kendi
  // testi olan bölüme alt bölüm eklemeyi reddeder, 076). Sayfa kitabında
  // alt bölüm yoktur (061); orada bu alan yok sayılır.
  const isPage = parsed.data.trackingMode === 'page'
  const rpcSections = parsed.data.sections.map(({ subsections, ...section }) =>
    !isPage && subsections?.length ? { ...section, test_count: 0 } : section
  )

  const { data, error } = await supabase.rpc('create_book_with_sections_and_tests', {
    p_workspace_id: workspaceId,
    p_academic_term_id: parsed.data.termId || null,
    p_title: parsed.data.title,
    p_subject: parsed.data.subject,
    p_publisher: parsed.data.publisher || null,
    p_level_exam: parsed.data.levelExam || null,
    p_edition_year: parsed.data.editionYear ?? null,
    p_description: parsed.data.description || null,
    p_sections: rpcSections,
    p_tracking_mode: parsed.data.trackingMode,
    p_video_mode: parsed.data.videoMode,
    p_video_url: parsed.data.videoUrl || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  const newBookId = (data as { book_id?: string } | null)?.book_id
  let warning: string | undefined
  if (newBookId) {
    // R6-14 / R7-02 §6.2-6.3: öğretim programı ve sınıflama ayrı tek işli
    // RPC'lerle yazılır (create RPC'sinin gövdesini çoğaltmamak için).
    // İkisi birbirinden bağımsız: 3b — sırayla değil PARALEL. Kolonların
    // DEFAULT'u tutarlı olduğu için biri başarısız olsa da kitap
    // kullanılabilir kalır.
    await Promise.all([
      parsed.data.curriculumProgram
        ? supabase.rpc('set_book_curriculum_program', {
            p_book_id: newBookId,
            p_curriculum_program: parsed.data.curriculumProgram,
          })
        : Promise.resolve(null),
      supabase.rpc('set_book_classification', {
        p_book_id: newBookId,
        p_resource_type: parsed.data.resourceType,
        p_structure_kind: parsed.data.structureKind,
      }),
    ])

    // §6.4: çok parçalı kaynakta bölümler Parça altında toplanır. Parçalar
    // bölüm sırasına göre kurulur; tek parçalı kaynakta liste boştur ve
    // hiçbir şey olmaz.
    if (parsed.data.structureKind === 'multi') {
      const sectionParts = parsed.data.sections
        .map((section, index) => ({ order_index: index + 1, part: section.part ?? '' }))
        .filter(entry => entry.part.trim() !== '')

      if (sectionParts.length > 0) {
        await supabase.rpc('apply_book_parts', {
          p_book_id: newBookId,
          p_section_parts: sectionParts,
        })
      }
    }

    // 3a: içindekilerden gelen alt bölümler. Bölüm kimlikleri ancak şimdi
    // var; bölümler form sırasıyla (order_index) eşlenir. Bölüm içinde
    // SIRAYLA (alt bölüm sırası korunur), bölümler arasında paralel.
    if (!isPage && parsed.data.sections.some(s => s.subsections?.length)) {
      const { data: created } = await supabase
        .from('book_sections')
        .select('id, title, order_index')
        .eq('book_id', newBookId)
        .is('parent_section_id', null)
        .order('order_index')
      // Sıra ile eşlenir, başlıkla doğrulanır: çok parçalı kaynakta
      // apply_book_parts sırayı değiştirmiş olabilir — o durumda aynı
      // başlıklı ilk kullanılmamış bölüm alınır.
      const rows = (created ?? []) as { id: string; title: string }[]
      const used = new Set<string>()
      const sectionIdFor = (index: number, title: string): string | undefined => {
        const byOrder = rows[index]
        const pick =
          byOrder && byOrder.title.trim() === title.trim() && !used.has(byOrder.id)
            ? byOrder
            : rows.find(r => !used.has(r.id) && r.title.trim() === title.trim())
        if (pick) used.add(pick.id)
        return pick?.id
      }
      const targets = parsed.data.sections.map((section, index) => ({ section, sectionId: sectionIdFor(index, section.title) }))
      const failed: string[] = []
      await Promise.all(
        targets.map(async ({ section, sectionId }) => {
          if (!section.subsections?.length || !sectionId) return
          for (const sub of section.subsections) {
            const { error: subError } = await supabase.rpc('add_book_subsection', {
              p_section_id: sectionId,
              p_title: sub.title,
              p_test_start: sub.test_start,
              p_test_end: sub.test_end,
            })
            if (subError) failed.push(`${section.title} › ${sub.title}`)
          }
        })
      )
      if (failed.length > 0) {
        warning = `Kitap kaydedildi ama ${failed.length} alt bölüm eklenemedi (${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '…' : ''}). Düzenleme ekranından ekleyebilirsiniz.`
      }
    }
  }

  revalidatePath('/teacher/books')
  return { success: true, data, warning }
}

/**
 * KİTAP HAVUZU YEDEĞİNİ GERİ YÜKLE (içe aktarma).
 *
 * "Yedek al" ile indirilen JSON dosyasını havuza geri koyar. Export
 * baştan beri vardı ama karşılığı yoktu: dosya duruyor, kullanıcı onunla
 * hiçbir şey yapamıyordu. Asıl kullanım, havuzu bir çalışma alanından
 * diğerine taşımak.
 *
 * KİTAPLAR TEK TEK, MEVCUT RPC İLE eklenir. Toplu bir INSERT daha hızlı
 * olurdu ama bölüm/test üretimi, sınav türü türetmesi ve yetki kontrolü
 * create_book_with_sections_and_tests içinde; ikinci bir yol açmak, iki
 * yoldan gelen kitapların farklı kurulduğu bir sistem demekti.
 *
 * YARIM SONUÇ KABUL EDİLİR: bir kitap hata verirse işlem durmaz, o kitap
 * atlanır ve rapora yazılır. 80 kitabın 79'unu geri almak, 80'ini birden
 * kaybetmekten iyidir; tekrar çalıştırmak da güvenli, çünkü zaten var
 * olan kitaplar atlanıyor.
 */
export async function importBookBackupAction(fileText: string) {
  // Dosya boyutu ÖNCE: 5 MB'lık bir metni ayrıştırmaya kalkmak, hatayı
  // sunucuyu meşgul ettikten sonra vermek olurdu.
  if (typeof fileText !== 'string' || fileText.length > MAX_BACKUP_CHARS) {
    return { error: 'Dosya çok büyük ya da okunamadı.' }
  }

  const parsed = parseBookBackup(fileText)
  if (parsed.fatal) return { error: parsed.fatal }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  // MEVCUT HAVUZ ÖNCE OKUNUR: aynı yedeği iki kez aktarmak havuzu
  // ikiye katlamamalı. Arşivlenmişler de sayılır — kullanıcı kitabı
  // bilerek havuzdan çıkardıysa geri getirmek onun kararı olmalı.
  const { data: existing } = await supabase
    .from('books')
    .select('title, publisher, edition_year')
    .eq('workspace_id', workspaceId)
    .limit(2000)

  const seen = new Set(
    (existing ?? []).map((b) => bookIdentityKey(b.title, b.publisher, b.edition_year))
  )

  let imported = 0
  const skipped: string[] = [...parsed.skipped]

  for (const book of parsed.books) {
    const key = bookIdentityKey(book.title, book.publisher ?? null, book.editionYear ?? null)
    if (seen.has(key)) {
      skipped.push(`${book.title} — havuzda zaten var`)
      continue
    }

    const { data, error } = await supabase.rpc('create_book_with_sections_and_tests', {
      p_workspace_id: workspaceId,
      p_academic_term_id: null,
      p_title: book.title,
      p_subject: book.subject,
      p_publisher: book.publisher || null,
      p_level_exam: book.levelExam || null,
      p_edition_year: book.editionYear ?? null,
      p_description: book.description || null,
      p_sections: book.sections,
      p_tracking_mode: book.trackingMode,
      p_video_mode: book.videoMode,
      p_video_url: book.videoUrl || null,
    })

    if (error) {
      skipped.push(`${book.title} — ${dbErrorToTr(error.message)}`)
      continue
    }

    // Aynı dosyada tekrarlanan kitap ikinci kez eklenmesin.
    seen.add(key)
    imported++

    const newBookId = (data as { book_id?: string } | null)?.book_id
    if (newBookId) {
      await logAudit(supabase, {
        workspaceId,
        action: 'book.import',
        entityType: 'book',
        entityId: newBookId,
      })
    }
  }

  revalidatePath('/teacher/books')

  return {
    success: true,
    imported,
    // Rapor uzayabilir; ekranda ilk 20'si gösterilip gerisi sayılıyor.
    skipped,
  }
}

/**
 * HAVUZ TEMİZLİĞİ (R7 §7.3).
 *
 * Havuzda iki farklı "kirli kayıt" var ve ikisi AYNI FİİLLE temizlenemez:
 *
 *   hiç atanmamış yanlış kayıt -> SİL (bu fonksiyon). Yanlış girilmiş bir
 *                                 kaynağı sonsuza dek arşivde taşımak
 *                                 havuzu kirli tutar.
 *   atanmış/kullanılmış kaynak -> ARŞİVLE (archiveBookAction). Geçmiş
 *                                 kayıtlar bozulmamalı.
 *
 * Ataması olup olmadığı kontrolü RPC'nin içindedir; arayüz yalnız doğru
 * düğmeyi gösterir, kararı vermez.
 */
export async function deleteUnassignedBookAction(bookId: string) {
  const parsed = uuidSchema.safeParse(bookId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_unassigned_book', {
    p_workspace_id: workspaceId,
    p_book_id: parsed.data,
  })

  if (error) {
    // RPC atanmış kaynakta bilinçli olarak hata veriyor; kullanıcıya
    // doğru alternatifi söylemek "bir şeyler ters gitti"den yararlı.
    if (error.message.includes('Book is assigned')) {
      return {
        error: 'Bu kaynak öğrencilere atanmış. Silmek yerine arşivleyin; geçmiş kayıtlar korunur.',
      }
    }
    return { error: dbErrorToTr(error.message) }
  }

  await logAudit(supabase, {
    workspaceId,
    action: 'book.delete',
    entityType: 'book',
    entityId: parsed.data,
  })

  revalidatePath('/teacher/books')
  redirect('/teacher/books')
}

export async function archiveBookAction(bookId: string) {
  const parsed = uuidSchema.safeParse(bookId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('books')
    .update({ status: 'archived' })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }

  // Arşivlenen kitap havuzdan düşer ve atamalarda görünmez olur.
  await logAudit(supabase, {
    workspaceId,
    action: 'book.archive',
    entityType: 'book',
    entityId: parsed.data,
  })

  revalidatePath('/teacher/books')
  redirect('/teacher/books')
}


/**
 * KÜTÜPHANEDEN HAVUZA KOPYALA (069).
 *
 * Yeni koçun havuzu bomboş açılıyor ve tek çıkış yolu her kaynağı elle
 * girmekti. Kütüphane, o kaynakların bir kez düzgün kurulmuş hâlini
 * herkese açar; koç filtreyle bulur, çoklu seçer, kopyalar.
 *
 * ATLAMA HATA DEĞİL: seçilen 12 kitabın ikisi havuzda zaten varsa
 * işlemin tamamını geri almak koça hiçbir şey kazandırmaz. RPC atlananı
 * sayar, kullanıcı sonucu okur.
 */
export async function copyLibraryBooksAction(bookIds: string[]) {
  const parsed = librarySelectionSchema.safeParse({ bookIds })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('copy_library_books', {
    p_workspace_id: workspaceId,
    p_book_ids: parsed.data.bookIds,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  const result = (data ?? {}) as { copied?: number; skipped?: number }

  await logAudit(supabase, {
    workspaceId,
    action: 'book.library_copy',
    entityType: 'book',
    detail: { copied: result.copied ?? 0, skipped: result.skipped ?? 0 },
  })

  revalidatePath('/teacher/books')
  revalidatePath('/teacher/books/library')

  return { success: true, copied: result.copied ?? 0, skipped: result.skipped ?? 0 }
}

/**
 * KİTABI KÜTÜPHANEYE ÖNER (069).
 *
 * Kitap TAŞINMAZ, yalnız 'pending' işaretlenir: koçun öğrencileri
 * kaynağı kullanmaya devam eder. Onay anında kütüphaneye ayrı bir kopya
 * girer, böylece koç kendi kitabını sonradan değiştirdiğinde yayındaki
 * sürüm sessizce değişmez.
 */
export async function submitBookToLibraryAction(bookId: string) {
  const parsed = uuidSchema.safeParse(bookId)
  if (!parsed.success) return { error: 'Geçersiz kayıt kimliği.' }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('submit_book_to_library', {
    p_book_id: parsed.data,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'book.library_submit',
    entityType: 'book',
    entityId: parsed.data,
  })

  revalidatePath(`/teacher/books/${parsed.data}`)
  return { success: true }
}
