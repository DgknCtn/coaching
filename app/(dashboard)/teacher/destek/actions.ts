'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'

// DESTEK TALEBİ AKSİYONLARI.
//
// `is_staff` bilinçli olarak GÖNDERİLMİYOR: sunucu, çağıranın platform
// yöneticisi olup olmadığına bakarak kendisi türetiyor (060). İstemciye
// bırakılsaydı bir kullanıcı kendi mesajını "Destek Ekibi" gibi
// gösterebilirdi.

const SUBJECT_MIN = 3
const SUBJECT_MAX = 200
const BODY_MAX = 5000

export async function openTicketAction(
  subject: string,
  body: string,
  category: string
): Promise<{ error?: string }> {
  const trimmedSubject = subject.trim()
  const trimmedBody = body.trim()

  if (trimmedSubject.length < SUBJECT_MIN || trimmedSubject.length > SUBJECT_MAX) {
    return { error: 'Konu 3 ile 200 karakter arasında olmalı.' }
  }
  if (trimmedBody.length < 1 || trimmedBody.length > BODY_MAX) {
    return { error: 'Mesaj boş olamaz ve 5000 karakteri aşamaz.' }
  }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('open_support_ticket', {
    p_workspace_id: workspaceId,
    p_subject: trimmedSubject,
    p_body: trimmedBody,
    p_category: category || 'genel',
  })

  if (error) return { error: dbErrorToTr(error.message) }

  const created = data as unknown as { ticket_id: string }
  revalidatePath('/teacher/destek')
  redirect(`/teacher/destek/${created.ticket_id}`)
}

export async function replyTicketAction(
  ticketId: string,
  body: string
): Promise<{ error?: string }> {
  const trimmed = body.trim()
  if (trimmed.length < 1 || trimmed.length > BODY_MAX) {
    return { error: 'Mesaj boş olamaz ve 5000 karakteri aşamaz.' }
  }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('reply_support_ticket', {
    p_ticket_id: ticketId,
    p_body: trimmed,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/destek/${ticketId}`)
  return {}
}

export async function closeTicketAction(ticketId: string): Promise<{ error?: string }> {
  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('close_support_ticket', { p_ticket_id: ticketId })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/destek/${ticketId}`)
  revalidatePath('/teacher/destek')
  return {}
}
