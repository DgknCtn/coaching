'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { bookSchema, uuidSchema, firstIssue } from '@/lib/validation'
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

  const { data, error } = await supabase.rpc('create_book_with_sections_and_tests', {
    p_workspace_id: workspaceId,
    p_academic_term_id: parsed.data.termId || null,
    p_title: parsed.data.title,
    p_subject: parsed.data.subject,
    p_publisher: parsed.data.publisher || null,
    p_level_exam: parsed.data.levelExam || null,
    p_edition_year: parsed.data.editionYear ?? null,
    p_description: parsed.data.description || null,
    p_sections: parsed.data.sections,
    p_tracking_mode: parsed.data.trackingMode,
    p_video_mode: parsed.data.videoMode,
    p_video_url: parsed.data.videoUrl || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  // R6-14: öğretim programı ayrı bir çağrıyla yazılır. create RPC'si
  // bölüm/test üretimini de yapan uzun bir fonksiyon; ona alan eklemek
  // için gövdesini çoğaltmak yerine tek işli yardımcı kullanılır.
  const newBookId = (data as { book_id?: string } | null)?.book_id
  if (newBookId && parsed.data.curriculumProgram) {
    await supabase.rpc('set_book_curriculum_program', {
      p_book_id: newBookId,
      p_curriculum_program: parsed.data.curriculumProgram,
    })
  }

  // R7-02 §6.2-6.3: Kaynak Türü / Yapısı da aynı gerekçeyle ayrı çağrıdır.
  // Kolonların DEFAULT'u tutarlı olduğu için bu çağrı başarısız olsa da
  // kitap kullanılabilir kalır.
  if (newBookId) {
    await supabase.rpc('set_book_classification', {
      p_book_id: newBookId,
      p_resource_type: parsed.data.resourceType,
      p_structure_kind: parsed.data.structureKind,
    })

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
  }

  revalidatePath('/teacher/books')
  return { success: true, data }
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
