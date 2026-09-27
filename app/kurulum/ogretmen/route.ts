import { logAuthEvent, resolveProfileIdByEmail } from '@/lib/auth-audit'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { readReferralCode, clearReferralCode, normalizeReferralCode } from '@/lib/referral'

/**
 * ÖĞRETMEN ÇALIŞMA ALANINI KUR — açık niyetle gelinen tek yer.
 *
 * Buraya üç yoldan gelinir:
 *   - kayıt sayfasındaki Google düğmesi (callback `next=/kurulum/ogretmen`),
 *   - e-posta doğrulaması açıkken kayıt olan öğretmenin ilk girişi
 *     (app/page.tsx, üst veride öğretmen niyeti var),
 *   - /hosgeldin'deki "Öğretmen / koçum" kartı.
 *
 * Önceden bu kod app/page.tsx'teydi ve çalışma alanı olmayan HERKES için
 * çalışıyordu; davetli öğrenci de öğretmen yapılıyordu. Ayrıca sayfa bir
 * Server Component olduğu için davet çerezini silemiyordu (20cd4ed).
 * Route Handler ikisini de çözüyor.
 *
 * TEKRAR ÇAĞRILMASI ZARARSIZ: create_teacher_workspace idempotent (095);
 * alanı zaten olan kullanıcı panele döner.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return NextResponse.redirect(new URL('/login', origin))

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
    return NextResponse.redirect(new URL('/erisim', origin))
  }

  // HESAP OLUŞTURMA KAYDI: 'register' olay türü tanımlıydı ama hiçbir yer
  // yazmıyordu; yönetimdeki "yeni kayıt" eğilimi bu satırdan besleniyor.
  // create_teacher_workspace idempotent — tekrar çağrıda da bir satır
  // düşer; yöntem ayrımı için detail.
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
  return NextResponse.redirect(new URL('/', origin))
}
