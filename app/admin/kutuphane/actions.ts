'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import { libraryReviewSchema, firstIssue } from '@/lib/validation'

// KÜTÜPHANE ÖNERİ KARARLARI — yönetim tarafı (069).
//
// Yetki kontrolü BURADA YAPILMIYOR ve bu, /admin/talepler ile aynı
// bilinçli karar: çağrılan RPC'ler gövdelerinde `is_platform_admin()`
// kontrol ediyor. Yetkiyi burada tekrarlamak ikinci bir doğruluk kaynağı
// yaratır ve biri güncellenirken diğeri unutulur.

export async function approveLibrarySubmissionAction(
  bookId: string
): Promise<{ error?: string }> {
  const parsed = libraryReviewSchema.safeParse({ bookId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('approve_book_for_library', {
    p_book_id: parsed.data.bookId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/kutuphane')
  revalidatePath('/teacher/books/library')
  return {}
}

export async function rejectLibrarySubmissionAction(
  bookId: string,
  reason: string
): Promise<{ error?: string }> {
  const parsed = libraryReviewSchema.safeParse({ bookId, reason })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reject_book_for_library', {
    p_book_id: parsed.data.bookId,
    p_reason: parsed.data.reason || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/kutuphane')
  return {}
}

/**
 * Kütüphane çalışma alanını kur.
 *
 * Alanın elle SQL ile açılması gerekmesin diye: yönetici bir kez basar,
 * alan yoksa oluşturulur ve kendisi owner olarak eklenir. Zaten varsa
 * hiçbir şey olmaz (RPC idempotent).
 */
export async function ensureLibraryWorkspaceAction(): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('ensure_library_workspace')

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/kutuphane')
  return {}
}
