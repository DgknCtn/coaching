'use server'

import { revalidatePath } from 'next/cache'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr } from '@/lib/auth-errors'

// VERİ SİLME TALEBİ (068).
//
// RPC'ler 053'te yazılmıştı ama hiçbir arayüze bağlı değildi: kullanıcı
// KVKK kapsamındaki silme hakkını üründen kullanamıyordu, gizlilik metni
// ise silmeyi taahhüt ediyordu. Burada yeni bir SQL yazılmıyor; var olan
// iki fonksiyon bağlanıyor.
//
// Yetki kontrolü RPC'lerin İÇİNDE (053): çalışma alanı silmeyi yalnız
// sahip açabilir, öğrenci silmeyi öğretmen de. Burada tekrarlamak iki
// ayrı doğruluk kaynağı yaratırdı.

export async function requestWorkspaceDeletionAction(
  reason: string
): Promise<{ error?: string; requestId?: string }> {
  const { supabase, workspaceId } = await getTeacherContext()

  const { data, error } = await supabase.rpc('request_data_deletion', {
    p_workspace_id: workspaceId,
    p_scope: 'workspace',
    p_student_id: null,
    p_reason: reason.trim() || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/ayarlar/veri')
  return { requestId: (data as unknown as { request_id: string })?.request_id }
}

export async function cancelDeletionAction(
  requestId: string
): Promise<{ error?: string }> {
  // Bağlam çağrısı yetki kapısı: oturumsuz bir istek buraya hiç
  // ulaşmasın. Asıl kontrol yine RPC'nin içinde.
  const { supabase } = await getTeacherContext()

  const { error } = await supabase.rpc('cancel_data_deletion', {
    p_request_id: requestId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/ayarlar/veri')
  return {}
}
