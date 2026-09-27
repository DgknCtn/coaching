'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { inviteErrorToTr } from '@/lib/auth-errors'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { finishInviteAcceptance } from '@/lib/invite-accept'

/**
 * /hosgeldin listesinden tek tıkla davet kabulü (116).
 *
 * Yalnız oturumdaki e-postaya kesilmiş davetler kabul edilebilir; kural
 * veritabanında (accept_invitation_by_id -> accept_invitation).
 */
export async function acceptInvitationByIdAction(invitationId: string) {
  const parsed = uuidSchema.safeParse(invitationId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profil adı kabulde YENİDEN YAZILIYOR (024). Varsa mevcut ad korunur;
  // yoksa Google'ın verdiği ad, o da yoksa e-postanın yerel kısmı.
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name')
    .eq('auth_user_id', user.id)
    .maybeSingle()
  const meta = user.user_metadata as { full_name?: string; name?: string } | undefined
  const fullName =
    (profile?.full_name as string | undefined)?.trim() ||
    meta?.full_name?.trim() ||
    meta?.name?.trim() ||
    user.email?.split('@')[0] ||
    'Kullanıcı'

  const { data, error } = await supabase.rpc('accept_invitation_by_id', {
    p_invitation_id: parsed.data,
    p_full_name: fullName,
  })
  if (error) return { error: inviteErrorToTr(error.message) }

  redirect(await finishInviteAcceptance(data))
}
