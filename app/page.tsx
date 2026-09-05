import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { readReferralCode, clearReferralCode } from '@/lib/referral'
import { LandingPage } from '@/components/marketing/landing-page'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return <LandingPage />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, default_workspace_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // GEÇ KURULUM (Faz 3): e-posta doğrulaması açıkken kayıt anında oturum
  // olmadığı için workspace kurulamıyor — create_teacher_workspace'in
  // auth.uid() kontrolü (024) başarısız olur. Kullanıcı e-postasını
  // doğrulayıp ilk kez buraya geldiğinde oturum VARDIR; workspace o anda,
  // kayıtta üst veriye yazılan bilgilerle kurulur.
  //
  // Doğrulama kapalıyken bu dal hiç çalışmaz: workspace zaten kayıt
  // sırasında kurulmuş olur.
  if (!profile?.default_workspace_id) {
    const meta = user.user_metadata as
      | { full_name?: string; name?: string; workspace_name?: string | null }
      | undefined

    // AD İÇİN YEDEK ZİNCİRİ.
    //
    // Bu dal artık Google ile girenler için de çalışıyor ve orada kayıt
    // formu YOK. Google çoğu zaman `full_name` veriyor ama garanti
    // değil; ad boş kalırsa kullanıcı sessizce /login'e atılıyor,
    // çalışma alanı hiç kurulmuyor ve sonsuz döngüye giriyordu.
    // E-postanın yerel kısmı, hiç yoktan iyidir ve kullanıcı adını
    // sonradan değiştirebilir.
    const fullName =
      meta?.full_name?.trim() ||
      meta?.name?.trim() ||
      user.email?.split('@')[0] ||
      'Kullanıcı'

    {
      const { error } = await supabase.rpc('create_teacher_workspace', {
        p_auth_user_id: user.id,
        p_full_name: fullName,
        p_email: user.email ?? '',
        p_workspace_name: meta?.workspace_name ?? null,
        p_partner_code: await readReferralCode(),
      })
      if (!error) await clearReferralCode()
      // Kurulum başarılıysa aynı sayfaya dönülür ve bu kez profil dolu
      // gelir.
      if (!error) redirect('/')
      console.error('[kurulum] çalışma alanı kurulamadı', error)
    }

    // KURULUM BAŞARISIZ → /erisim, /login DEĞİL (068 · rapor bulgusu 3).
    //
    // Buradaki eski yorum "sonsuz döngü olmaz çünkü /login korumasız bir
    // rota" diyordu ve bu ARTIK DOĞRU DEĞİL: /login public olsa da
    // middleware oturumu olan kullanıcıyı /login'den geri /'a
    // yönlendiriyor. Yani oturumu olup çalışma alanı kurulamamış
    // kullanıcı / → /login → / arasında kilitleniyordu.
    //
    // /erisim ne olduğunu anlatıyor ve oturumu kapatma yolu sunuyor.
    redirect('/erisim')
  }

  const { data: member } = await supabase
    .from('workspace_members')
    .select('role')
    .eq('profile_id', profile.id)
    .eq('workspace_id', profile.default_workspace_id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  // ÜYELİK YOK: kullanıcı yetkisiz değil, çalışma alanına BAĞLI DEĞİL —
  // askıya alınmış bir kiracının üyelikleri de RLS tarafından süzülüp
  // buraya boş düşüyor. Giriş ekranına atmak, doğru şifreyle tekrar
  // tekrar denemekten başka bir şey bırakmıyordu.
  if (!member) redirect('/erisim')

  if (member.role === 'owner' || member.role === 'teacher') redirect('/teacher')
  if (member.role === 'student') redirect('/student')
  if (member.role === 'parent') redirect('/parent')

  // Tanınmayan rol: veri şemayla uyuşmuyor. Yine /login değil — oturum
  // geçerli, sorun oturumda değil.
  redirect('/erisim')
}
