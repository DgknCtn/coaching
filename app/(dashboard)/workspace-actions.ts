'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/active-workspace'
import { firstIssue, uuidSchema } from '@/lib/validation'

/**
 * Aktif çalışma alanını değiştirir (Faz 3).
 *
 * DOĞRULAMA ZORUNLU: çerez kullanıcı tarafından değiştirilebilir, bu yüzden
 * yazmadan önce üyelik kontrol edilir. Kontrol atlanırsa çerez uydurma bir
 * id taşır ve kullanıcı boş bir bağlama düşer — RLS veriyi yine korur ama
 * arayüz sebepsiz boşalır ve kullanıcı ne olduğunu anlamaz.
 *
 * Sorgu RLS altında çalışır: askıya alınmış bir workspace'in üyeliği
 * `has_workspace_role` üzerinden zaten süzülür (051), yani askıdaki bir
 * kiracıya geçiş de burada engellenmiş olur.
 */
export async function switchWorkspaceAction(workspaceId: string) {
  const parsed = uuidSchema.safeParse(workspaceId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Oturum bulunamadı.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (!profile) return { error: 'Profil bulunamadı.' }

  const { data: membership, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('profile_id', profile.id)
    .eq('workspace_id', parsed.data)
    .eq('status', 'active')
    .in('role', ['owner', 'teacher'])
    .maybeSingle()

  if (error) return { error: dbErrorToTr(error.message) }
  if (!membership) return { error: 'Bu çalışma alanına erişiminiz yok.' }

  const store = await cookies()
  store.set(ACTIVE_WORKSPACE_COOKIE, parsed.data, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })

  // Tüm öğretmen ekranları workspace'e bağlı; kök layout dahil hepsi
  // yeniden çizilmeli.
  revalidatePath('/', 'layout')
  return { success: true }
}
