import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/invite'
import { finishInviteAcceptance } from '@/lib/invite-accept'

/**
 * DAVET LİNKİNİ OTURUMLA KABUL ET.
 *
 * İki yoldan gelinir:
 *   - davet sayfasındaki "Google ile kabul et" (callback `next` buraya),
 *   - oturumu zaten açık kullanıcının "<e-posta> olarak kabul et" düğmesi
 *     (ör. ikinci çocuğunun davetini açan veli).
 *
 * Önceden davet YALNIZ e-posta + şifre formuyla kabul ediliyordu: Google
 * hesabı olan öğrenci/veli daveti kabul edemiyordu, oturumu açık kullanıcı
 * da her seferinde formu doldurmak zorundaydı.
 *
 * Doğrulamanın tamamı veritabanında (accept_invitation, 024): e-posta bağı,
 * süre, tek kullanım. Bu uç yalnız sonucu yönlendirmeye çeviriyor.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const origin = request.nextUrl.origin
  const invitePath = `/invite/${encodeURIComponent(token)}`

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.redirect(new URL(invitePath, origin))

  // Profil adı kabulde yeniden yazılıyor (024): varsa mevcut ad korunur.
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

  const { data, error } = await supabase.rpc('accept_invitation', {
    p_token_hash: await hashToken(token),
    p_auth_user_id: user.id,
    p_full_name: fullName,
    p_email: user.email ?? '',
  })

  if (error) {
    const m = error.message.toLowerCase()
    // Yanlış hesap en sık durum: davet sayfası hangi adrese kesildiğini ve
    // kullanıcının hangi hesapla girdiğini maskeli gösterip "başka hesapla
    // gir" yolunu sunuyor.
    const code = m.includes('different email')
      ? 'eposta'
      : m.includes('expired')
        ? 'sure'
        : 'gecersiz'
    return NextResponse.redirect(new URL(`${invitePath}?hata=${code}`, origin))
  }

  const target = await finishInviteAcceptance(data)
  return NextResponse.redirect(new URL(target, origin))
}
