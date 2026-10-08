'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/active-workspace'
import { ROLE_CACHE_COOKIE } from '@/lib/role-cache'
import { dbErrorToTr } from '@/lib/auth-errors'

/**
 * "ÖĞRENCİ YA DA VELİYİM, BU ALANI YANLIŞLIKLA AÇTIM" (138).
 *
 * Koşullar veritabanında (close_own_empty_workspace): sahibi tek kişi,
 * 14 günden yeni, öğrenci/kitap/ödev/sipariş yok.
 *
 * Üst veriye `signup_intent: 'member'` yazılır: kayıt formunun bıraktığı
 * öğretmen niyeti silinemediği için, bu olmazsa `/` alanı hemen yeniden
 * kurardı (lib/landing-decision.ts).
 */
export async function closeOwnEmptyWorkspaceAction() {
  const { supabase, workspaceId } = await getTeacherContext()

  const { error } = await supabase.rpc('close_own_empty_workspace', {
    p_workspace_id: workspaceId,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  await supabase.auth.updateUser({ data: { signup_intent: 'member' } })

  // Silinen alanı gösteren aktif alan ve rol önbelleği çerezleri
  // temizlenir; middleware bir sonraki istekte yeniden hesaplar.
  const jar = await cookies()
  jar.delete(ACTIVE_WORKSPACE_COOKIE)
  jar.delete(ROLE_CACHE_COOKIE)

  redirect('/')
}
