'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'

// Yetki kontrolü RPC'nin İÇİNDE (060): admin_mark_commissions_paid
// girişinde is_platform_admin() bakıyor. Burada tekrarlamak iki ayrı
// doğruluk kaynağı yaratırdı.

export async function markCommissionsPaidAction(
  partnerId: string
): Promise<{ error?: string; marked?: number }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_mark_commissions_paid', {
    p_partner_id: partnerId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/partnerler')
  return { marked: (data as unknown as { marked: number })?.marked ?? 0 }
}
