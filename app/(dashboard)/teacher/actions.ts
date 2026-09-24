'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

// ÖĞRETMEN PANELİ EYLEMLERİ (R8).

/**
 * Bir gün notunu "görüldü" olarak işaretler (§17A).
 *
 * Bu bir görev tamamlama DEĞİL, liste temizleme. Öğretmen bir notu hiç
 * işaretlemezse sistemde bozulan bir şey olmaz; akış yalnız daha uzun
 * kalır. Bu yüzden burada bir "tümünü gördüm" zorlaması ya da okunmamış
 * sayacını öne çıkaran bir baskı yok (§21: her hareket bildirim değil).
 *
 * RPC üzerinden yazılıyor çünkü not ÖĞRENCİNİN satırı; öğretmene genel
 * UPDATE açmak, notun metnini de değiştirebilmesi demekti (104).
 */
export async function markDayNoteSeenAction(noteId: string) {
  const parsed = uuidSchema.safeParse(noteId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('mark_day_note_seen', {
    p_note_id: parsed.data,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher')
  return { success: true }
}
