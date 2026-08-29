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

/**
 * Bölümün fasikül / tema etiketlerini günceller (R6-17).
 *
 * Bunlar TAKİP BİRİMİ DEĞİL, üst grup metadata'sıdır: değiştirmek hiçbir
 * tamamlanma kaydını etkilemez (kabul #90).
 */
export async function setSectionGroupingAction(
  bookId: string,
  sectionId: string,
  groupLabel: string,
  themeLabel: string
) {
  const parsed = uuidSchema.safeParse(sectionId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const labels = z.string().trim().max(120)
  const parsedGroup = labels.safeParse(groupLabel)
  const parsedTheme = labels.safeParse(themeLabel)
  if (!parsedGroup.success) return { error: 'Fasikül adı en fazla 120 karakter olabilir.' }
  if (!parsedTheme.success) return { error: 'Tema adı en fazla 120 karakter olabilir.' }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_section_grouping', {
    p_section_id: parsed.data,
    p_group_label: parsedGroup.data || null,
    p_theme_label: parsedTheme.data || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/books/${bookId}/edit`)
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}
