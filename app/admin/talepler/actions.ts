'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'

// YÖNETİM TARAFI DESTEK AKSİYONLARI.
//
// Yetki kontrolü BURADA YAPILMIYOR ve bu bilinçli: çağrılan RPC'ler
// (`reply_support_ticket`, `close_support_ticket`, `admin_ticket_messages`)
// kendi içlerinde `is_platform_admin()` ya da çalışma alanı rolü
// kontrol ediyor (060). Yetkiyi burada da tekrarlamak, iki ayrı
// doğruluk kaynağı yaratır ve biri güncellenirken diğeri unutulur.
//
// `is_staff` gönderilmiyor: sunucu çağıranın yönetici olup olmadığına
// bakarak kendisi türetiyor. İstemciye bırakılsaydı bir kullanıcı kendi
// mesajını "Destek Ekibi" gibi gösterebilirdi.

export async function adminReplyAction(
  ticketId: string,
  body: string
): Promise<{ error?: string }> {
  const trimmed = body.trim()
  if (trimmed.length < 1 || trimmed.length > 5000) {
    return { error: 'Mesaj boş olamaz ve 5000 karakteri aşamaz.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('reply_support_ticket', {
    p_ticket_id: ticketId,
    p_body: trimmed,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/talepler')
  return {}
}

export async function adminCloseTicketAction(
  ticketId: string
): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('close_support_ticket', {
    p_ticket_id: ticketId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/talepler')
  return {}
}

export interface AdminMessage {
  author_name: string | null
  body: string
  is_staff: boolean
  created_at: string
}

/** Yazışmayı talep açıldığında yükler — hepsini önden çekmek gereksiz. */
export async function adminLoadMessagesAction(
  ticketId: string
): Promise<{ error?: string; messages?: AdminMessage[] }> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_ticket_messages', {
    p_ticket_id: ticketId,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  return { messages: (data ?? []) as unknown as AdminMessage[] }
}
