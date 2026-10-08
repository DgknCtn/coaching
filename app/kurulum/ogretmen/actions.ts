'use server'

import { redirect } from 'next/navigation'
import { logAuthEvent, resolveProfileIdByEmail } from '@/lib/auth-audit'
import { createClient } from '@/lib/supabase/server'
import { readReferralCode, clearReferralCode, normalizeReferralCode } from '@/lib/referral'

/**
 * ÖĞRETMEN ÇALIŞMA ALANINI KUR — onay ekranındaki düğme (138).
 *
 * Önceden /kurulum/ogretmen bir GET Route Handler'dı ve adrese gelmek
 * alanı kurmaya yetiyordu: kayıt sayfasındaki Google düğmesine ya da
 * /hosgeldin'deki karta tıklayan öğrenci, ne olduğunu görmeden koç
 * oldu. Artık kurulum bu aksiyonla, ekrandaki açık onaydan sonra.
 *
 * Server action çerez silebiliyor; Route Handler'a taşınma gerekçesi
 * (20cd4ed, Server Component çerez silemiyordu) burada da karşılanıyor.
 *
 * TEKRAR ÇAĞRILMASI ZARARSIZ: create_teacher_workspace idempotent (095);
 * alanı zaten olan kullanıcı panele döner.
 */
export async function setupTeacherWorkspaceAction() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const meta = user.user_metadata as
    | {
        full_name?: string
        name?: string
        workspace_name?: string | null
        partner_code?: string | null
      }
    | undefined

  // AD İÇİN YEDEK ZİNCİRİ: Google çoğu zaman `full_name` verir ama garanti
  // değil. E-postanın yerel kısmı hiç yoktan iyidir; kullanıcı sonradan
  // değiştirebilir.
  const fullName =
    meta?.full_name?.trim() || meta?.name?.trim() || user.email?.split('@')[0] || 'Kullanıcı'

  const { error } = await supabase.rpc('create_teacher_workspace', {
    p_auth_user_id: user.id,
    p_full_name: fullName,
    p_email: user.email ?? '',
    p_workspace_name: meta?.workspace_name ?? null,
    // Kayıt formuna ELLE girilen kod üst veride taşınır; yoksa `?ref=`
    // çerezine düşülür.
    p_partner_code: normalizeReferralCode(meta?.partner_code) ?? (await readReferralCode()),
  })

  if (error) {
    console.error('[kurulum] çalışma alanı kurulamadı', error)
    // /login DEĞİL: middleware oturumu olanı /login'den geri çevirir ve
    // kullanıcı döngüye girer. /erisim ne olduğunu anlatır.
    redirect('/erisim')
  }

  // Bir önceki "yanlışlıkla açtım" vazgeçişi (signup_intent: 'member')
  // açık bir yeni seçimle geri alınır; yoksa sonraki girişlerde niyet
  // kararı tutarsız kalırdı.
  if ((user.user_metadata as { signup_intent?: string } | undefined)?.signup_intent === 'member') {
    await supabase.auth.updateUser({ data: { signup_intent: 'teacher' } })
  }

  // HESAP OLUŞTURMA KAYDI: yönetimdeki "yeni kayıt" eğilimi bu satırdan
  // besleniyor. Yöntem ayrımı için detail.
  await logAuthEvent({
    type: 'register',
    profileId: user.email ? await resolveProfileIdByEmail(supabase, user.email) : null,
    detail: {
      method:
        (user.app_metadata as { provider?: string } | undefined)?.provider === 'google'
          ? 'google'
          : 'email',
    },
  })

  // Atıf kullanıldı; aynı tarayıcıdan açılan ikinci hesap aynı partnere
  // yazılmasın.
  await clearReferralCode()
  redirect('/')
}
