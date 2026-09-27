import { logAuthEvent, resolveProfileIdByEmail } from '@/lib/auth-audit'
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Supabase Auth'un döndüğü yer: e-posta bağlantıları (şifre sıfırlama) ve
 * Google girişi (signInWithGoogleAction). Gelen `code` oturuma çevrilir ve
 * kullanıcı `next` hedefine yönlendirilir. İlk Google girişinde çalışma
 * alanı burada DEĞİL, `/` sayfasında kuruluyor (app/page.tsx).
 *
 * Hata kodları giriş sayfasında kullanıcıya gösteriliyor (CALLBACK_ERRORS).
 *
 * `next` yalnızca uygulama içi bir yol olabilir — dışarıdan gelen mutlak URL
 * ile açık yönlendirme (open redirect) yapılmasını engellemek için.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const nextParam = searchParams.get('next') ?? '/'
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : '/'

  // Sağlayıcı hatası: kullanıcı Google ekranında vazgeçti ya da sağlayıcı
  // yapılandırması eksik. `code` gelmez, `error` gelir.
  if (searchParams.get('error')) {
    return NextResponse.redirect(`${origin}/login?error=google`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=gecersiz_baglanti`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=baglanti_suresi_doldu`)
  }

  // GİRİŞ KAYDI (122 dönemi). Google girişi auth_events'e hiç yazılmıyordu;
  // yönetimdeki "aktif kullanıcı" sayıları bu yüzden eksik çıkıyordu.
  // Şifre sıfırlama bağlantısı da buradan geçer — o durumda yöntem 'link'.
  // İlk girişte profil henüz yok (kurulum /'da); profileId null olabilir.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const provider = (user?.app_metadata as { provider?: string } | undefined)?.provider
  await logAuthEvent({
    type: 'login.success',
    profileId: user?.email ? await resolveProfileIdByEmail(supabase, user.email) : null,
    detail: { method: provider === 'google' ? 'google' : 'link' },
  })

  return NextResponse.redirect(`${origin}${next}`)
}
