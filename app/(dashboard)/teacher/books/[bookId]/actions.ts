'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'

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
