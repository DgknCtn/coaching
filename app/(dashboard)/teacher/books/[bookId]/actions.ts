'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr } from '@/lib/auth-errors'
import {
  uuidSchema,
  firstIssue,
  bookUpdateSchema,
  bookEditionSchema,
  sectionTitleSchema,
  sectionTestCountSchema,
  newSectionSchema,
  bookTrackingModeSchema,
  sectionPageRangeSchema,
  bookPartSchema,
  bookPartRenameSchema,
  sectionPartSchema,
  subsectionSchema,
  subsectionRenameSchema,
  subsectionTestRangeSchema,
  sectionTopicsSchema,
} from '@/lib/validation'

const pageSectionSchema = z
  .object({
    bookId: uuidSchema,
    title: z.string().trim().min(1, 'Bölüm adı boş olamaz.').max(200),
    pageStart: z.number({ message: 'Başlangıç sayfası sayı olmalı.' }).int().min(1).max(100000),
    pageEnd: z.number({ message: 'Bitiş sayfası sayı olmalı.' }).int().min(1).max(100000),
    note: z.string().trim().max(500).optional().or(z.literal('')),
  })
  .refine((v) => v.pageEnd >= v.pageStart, {
    message: 'Bitiş sayfası başlangıçtan küçük olamaz.',
    path: ['pageEnd'],
  })
  .refine((v) => v.pageEnd - v.pageStart + 1 <= 1000, {
    message: 'Bir bölüm en fazla 1000 sayfa olabilir.',
    path: ['pageEnd'],
  })

const pageRangeSchema = z.object({
  bookTestId: uuidSchema,
  pageStart: z.number({ message: 'Başlangıç sayfası sayı olmalı.' }).int().min(1).max(100000).optional(),
  pageEnd: z.number({ message: 'Bitiş sayfası sayı olmalı.' }).int().min(1).max(100000).optional(),
}).refine(
  (v) => v.pageStart == null || v.pageEnd == null || v.pageEnd >= v.pageStart,
  { message: 'Bitiş sayfası başlangıçtan küçük olamaz.', path: ['pageEnd'] }
)

// Sayfa-bazlı takip yapılan kitaplarda, oluşturma sonrası her birim
// (book_tests satırı) için sayfa aralığı girilir/düzenlenir.
export async function updateBookTestPageRangeAction(
  bookId: string,
  bookTestId: string,
  pageStart: number | undefined,
  pageEnd: number | undefined
) {
  const parsed = pageRangeSchema.safeParse({ bookTestId, pageStart, pageEnd })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('book_tests')
    .update({
      page_start: parsed.data.pageStart ?? null,
      page_end: parsed.data.pageEnd ?? null,
    })
    .eq('id', parsed.data.bookTestId)
    .eq('book_id', bookId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

// ---------------------------------------------------------------
// Kitap düzenleme (018). Hepsi SECURITY DEFINER RPC'lere delege eder;
// yetki ve "kullanılmış testi silme" kuralları orada tek yerde duruyor.
// ---------------------------------------------------------------

export interface BookMetadataInput {
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
  videoMode?: string
  videoUrl?: string
}

export async function updateBookAction(bookId: string, input: BookMetadataInput) {
  const parsed = bookUpdateSchema.safeParse({ bookId, ...input })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  // exam_type artık gönderilmiyor: 021'deki update_book_metadata onu
  // level_exam'dan derive_exam_type ile türetiyor (tek kaynak).
  const { error } = await supabase.rpc('update_book_metadata', {
    p_book_id: parsed.data.bookId,
    p_title: parsed.data.title,
    p_subject: parsed.data.subject,
    p_publisher: parsed.data.publisher || null,
    p_level_exam: parsed.data.levelExam || null,
    p_edition_year: parsed.data.editionYear ?? null,
    p_description: parsed.data.description || null,
    p_video_mode: parsed.data.videoMode || 'none',
    p_video_url: parsed.data.videoUrl || null,
    p_curriculum_program: parsed.data.curriculumProgram || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  // R7-02 §6.2-6.3: sınıflama ayrı RPC'de. update_book_metadata 018'den beri
  // sabit ve başka çağrıları var; imzasını genişletmek yerine tek işli
  // yardımcı kullanılır (034'ün set_book_curriculum_program gerekçesi).
  const { error: classificationError } = await supabase.rpc('set_book_classification', {
    p_book_id: parsed.data.bookId,
    p_resource_type: parsed.data.resourceType,
    p_structure_kind: parsed.data.structureKind,
  })
  if (classificationError) return { error: dbErrorToTr(classificationError.message) }

  revalidatePath(`/teacher/books/${bookId}`)
  revalidatePath('/teacher/books')
  return { success: true }
}

// R4 §1B: aynı kitabın 2025 ve 2026 baskısı ayrı kayıtlar olarak tutulur.
// Kaynak kitap değiştirilmez; bölüm/test yapısı kopyalanır, ilerleme kopyalanmaz.
export async function duplicateBookAsEditionAction(
  bookId: string,
  editionYear: number,
  title?: string
) {
  const parsed = bookEditionSchema.safeParse({ bookId, editionYear, title })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('duplicate_book_as_edition', {
    p_book_id: parsed.data.bookId,
    p_edition_year: parsed.data.editionYear,
    p_title: parsed.data.title || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/teacher/books')
  return { success: true, bookId: (data as { book_id?: string } | null)?.book_id ?? null }
}

export async function renameSectionAction(bookId: string, sectionId: string, title: string) {
  const parsed = sectionTitleSchema.safeParse({ sectionId, title })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('rename_book_section', {
    p_section_id: parsed.data.sectionId,
    p_title: parsed.data.title,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function setSectionTestCountAction(bookId: string, sectionId: string, testCount: number) {
  const parsed = sectionTestCountSchema.safeParse({ sectionId, testCount })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_section_test_count', {
    p_section_id: parsed.data.sectionId,
    p_test_count: parsed.data.testCount,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function addSectionAction(bookId: string, title: string, testCount: number) {
  const parsed = newSectionSchema.safeParse({ bookId, title, testCount })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('add_book_section', {
    p_book_id: parsed.data.bookId,
    p_title: parsed.data.title,
    p_test_count: parsed.data.testCount,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

// R4 §2A: sayfa takipli kitapta bölüm, test sayısıyla değil fiziksel
// kapsamıyla tanımlanır ("Üçgenler | sf. 1-56"). RPC aralıktaki her sayfa
// için bir birim satırı açar; ilerleme böylece gerçek sayfa üzerinden
// hesaplanır (022).
export async function addPageSectionAction(
  bookId: string,
  title: string,
  pageStart: number,
  pageEnd: number,
  note?: string
) {
  const parsed = pageSectionSchema.safeParse({ bookId, title, pageStart, pageEnd, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('create_page_section', {
    p_book_id: parsed.data.bookId,
    p_title: parsed.data.title,
    p_page_start: parsed.data.pageStart,
    p_page_end: parsed.data.pageEnd,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function deleteSectionAction(bookId: string, sectionId: string) {
  const parsed = uuidSchema.safeParse(sectionId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_book_section', { p_section_id: parsed.data })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

// ---------------------------------------------------------------
// KALDIRILAN İKİ ACTION (R6 denetimi)
//
// setSectionGroupingAction (R6-17 fasikül/tema) ve setSectionTopicAction
// (R5.3 tekil müfredat eşlemesi) R7'den sonra hiçbir arayüzden çağrılmıyor:
// fasikül/tema alanlarının yerini gerçek Parça nesnesi, tekil eşlemenin
// yerini setSectionTopicsAction (çoklu) aldı.
//
// Karşılık gelen RPC'ler (set_section_grouping, set_book_section_topic)
// veritabanında KALIR: eski etiket verisi duruyor ve 040/035'in geri alma
// yolu korunmalı. Kaldırılan yalnız çağrılmayan iki sunucu eylemidir.
// ---------------------------------------------------------------

/**
 * Takip türünü düzeltir (R7-02 §6.5, kabul #1).
 *
 * 018 bu alanı bilinçli olarak dışarıda bırakmıştı: tür değişimi mevcut
 * tamamlama kayıtlarını anlamsızlaştırır. Gerekçe hâlâ geçerli, bu yüzden
 * kilit KALKMIYOR — RPC yalnız kaynakta hiç ilerleme yokken izin verir.
 * Kazanılan: yarım kalmış 3D VDD gibi kayıtlar silinip yeniden kurulmak
 * zorunda kalmadan düzeltilebiliyor.
 */
export async function setBookTrackingModeAction(bookId: string, trackingMode: string) {
  const parsed = bookTrackingModeSchema.safeParse({ bookId, trackingMode })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_book_tracking_mode', {
    p_book_id: parsed.data.bookId,
    p_tracking_mode: parsed.data.trackingMode,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  revalidatePath('/teacher/books')
  return { success: true }
}

/**
 * Bölümün sayfa aralığını düzenler (R7-02 §6.5, kabul #2).
 *
 * Değerler 022'den beri book_sections.page_start/page_end'de saklanıyordu;
 * eksik olan yalnız düzenleme yoluydu. Aralık değişince birim satırları
 * create_page_section ile aynı mantıkla yeniden kurulur.
 */
export async function setSectionPageRangeAction(
  bookId: string,
  sectionId: string,
  pageStart: number,
  pageEnd: number
) {
  const parsed = sectionPageRangeSchema.safeParse({ sectionId, pageStart, pageEnd })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_section_page_range', {
    p_section_id: parsed.data.sectionId,
    p_page_start: parsed.data.pageStart,
    p_page_end: parsed.data.pageEnd,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

// ---------------------------------------------------------------
// Parça yönetimi (R7-02 §6.4)
//
// Parça bir GRUPLAMA katmanıdır: MÖF F1-F5 ayrı kitap açılmadan tek
// kaynağın altında tutulur. Takip birimi değildir; ilerleme yüzdesi yine
// bölüm/birim üzerinden hesaplanır.
// ---------------------------------------------------------------

export async function addBookPartAction(bookId: string, title: string) {
  const parsed = bookPartSchema.safeParse({ bookId, title })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('add_book_part', {
    p_book_id: parsed.data.bookId,
    p_title: parsed.data.title,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function renameBookPartAction(bookId: string, partId: string, title: string) {
  const parsed = bookPartRenameSchema.safeParse({ partId, title })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('rename_book_part', {
    p_part_id: parsed.data.partId,
    p_title: parsed.data.title,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

/** Parça silmek BÖLÜM SİLMEZ: bölümler parçasız kalır. Yanlış kurulmuş bir
 *  yapı, ilerleme verisi riske atılmadan geri alınabilmeli. */
export async function deleteBookPartAction(bookId: string, partId: string) {
  const parsed = uuidSchema.safeParse(partId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_book_part', { p_part_id: parsed.data })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function setSectionPartAction(
  bookId: string,
  sectionId: string,
  partId: string | null
) {
  const parsed = sectionPartSchema.safeParse({ sectionId, partId: partId || null })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_section_part', {
    p_section_id: parsed.data.sectionId,
    p_part_id: parsed.data.partId,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

/**
 * Bölümü birden fazla müfredat konusuna bağlar (R7-02 §8, kabul #9).
 *
 * setSectionTopicAction'ın çoklu karşılığı. Boş liste eşlemeyi kaldırır.
 * RPC birincil eşlemeyi (book_sections.topic_id) listenin ilk elemanıyla
 * senkron tutar; böylece R5.3 müfredat sinyali aynen çalışmaya devam eder.
 *
 * Eşleme müfredat sinyalinden başka hiçbir şeyi etkilemez: bölümün
 * tamamlanması konuyu otomatik "öğrenildi" yapmaz.
 */
export async function setSectionTopicsAction(
  bookId: string,
  sectionId: string,
  topicIds: string[]
) {
  const parsed = sectionTopicsSchema.safeParse({ sectionId, topicIds })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_book_section_topics', {
    p_section_id: parsed.data.sectionId,
    p_topic_ids: parsed.data.topicIds,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

// ---------------------------------------------------------------
// R7-03: Alt Bölüm ve test aralığı
//
// Parça action'larıyla aynı kalıp. Fark: alt bölüm kitap değil BÖLÜM
// düzeyinde yaşar ve testlerin gerçek sahibidir — bu yüzden aralık
// değişimi birim satırlarını yeniden kurar (RPC tarafında).
// ---------------------------------------------------------------

export async function addSubsectionAction(
  bookId: string,
  sectionId: string,
  title: string,
  testStart: number,
  testEnd: number
) {
  const parsed = subsectionSchema.safeParse({ sectionId, title, testStart, testEnd })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('add_book_subsection', {
    p_section_id: parsed.data.sectionId,
    p_title: parsed.data.title,
    p_test_start: parsed.data.testStart,
    p_test_end: parsed.data.testEnd,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function renameSubsectionAction(
  bookId: string,
  subsectionId: string,
  title: string
) {
  const parsed = subsectionRenameSchema.safeParse({ subsectionId, title })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('rename_book_subsection', {
    p_subsection_id: parsed.data.subsectionId,
    p_title: parsed.data.title,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function setSubsectionTestRangeAction(
  bookId: string,
  subsectionId: string,
  testStart: number,
  testEnd: number
) {
  const parsed = subsectionTestRangeSchema.safeParse({ subsectionId, testStart, testEnd })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  // RPC birim satırlarını siler ve aralıktan yeniden üretir; ödevde ya da
  // tamamlama kaydında kullanılmış bir teste denk gelirse reddeder.
  const { error } = await supabase.rpc('set_subsection_test_range', {
    p_subsection_id: parsed.data.subsectionId,
    p_test_start: parsed.data.testStart,
    p_test_end: parsed.data.testEnd,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function deleteSubsectionAction(bookId: string, subsectionId: string) {
  const parsed = uuidSchema.safeParse(subsectionId)
  if (!parsed.success) return { error: 'Geçersiz alt bölüm.' }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_book_subsection', {
    p_subsection_id: parsed.data,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}
