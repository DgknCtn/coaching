'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import {
  uuidSchema,
  firstIssue,
  bookUpdateSchema,
  sectionTitleSchema,
  sectionTestCountSchema,
  newSectionSchema,
} from '@/lib/validation'

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

  if (error) return { error: error.message }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

// ---------------------------------------------------------------
// Kitap düzenleme (018). Hepsi SECURITY DEFINER RPC'lere delege eder;
// yetki ve "kullanılmış testi silme" kuralları orada tek yerde duruyor.
// ---------------------------------------------------------------

export async function updateBookAction(
  bookId: string,
  title: string,
  subject: string,
  publisher?: string,
  examType?: string,
  description?: string
) {
  const parsed = bookUpdateSchema.safeParse({ bookId, title, subject, publisher, examType, description })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('update_book_metadata', {
    p_book_id: parsed.data.bookId,
    p_title: parsed.data.title,
    p_subject: parsed.data.subject,
    p_publisher: parsed.data.publisher || null,
    p_exam_type: parsed.data.examType || null,
    p_description: parsed.data.description || null,
  })

  if (error) return { error: error.message }
  revalidatePath(`/teacher/books/${bookId}`)
  revalidatePath('/teacher/books')
  return { success: true }
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

  if (error) return { error: error.message }
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

  if (error) return { error: error.message }
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

  if (error) return { error: error.message }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}

export async function deleteSectionAction(bookId: string, sectionId: string) {
  const parsed = uuidSchema.safeParse(sectionId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('delete_book_section', { p_section_id: parsed.data })

  if (error) return { error: error.message }
  revalidatePath(`/teacher/books/${bookId}`)
  return { success: true }
}
