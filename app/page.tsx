import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { decideLanding } from '@/lib/landing-decision'
import {
  ACTIVE_WORKSPACE_COOKIE,
  resolveActiveWorkspaceId,
  rolesInWorkspace,
} from '@/lib/active-workspace'
import { LandingPage } from '@/components/marketing/landing-page'
import { StructuredData } from '@/components/marketing/structured-data'

export const dynamic = 'force-dynamic'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    // Yapılandırılmış veri YALNIZ tanıtım sayfasında: oturumu olan
    // kullanıcı panele yönlendiriliyor, orada arama motoru yok.
    return (
      <>
        <StructuredData />
        <LandingPage />
      </>
    )
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, default_workspace_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  // "PROFİL YOK" İLE "PROFİL OKUNAMADI" AYNI ŞEY DEĞİL.
  //
  // Bu okumanın hatası atılıyordu ve aşağıdaki `!profile?...` koşulu iki
  // durumu tek kefeye koyuyordu:
  //
  //   * profil gerçekten yok  -> geç kurulum DOĞRU (Google ile ilk giriş)
  //   * profil OKUNAMADI      -> geç kurulum TAMAMEN YANLIŞ
  //
  // İkincisinde sapasağlam bir hesap için sıfırdan çalışma alanı
  // açılıyordu. 12 Eylül 2026'da bir koçun hesabında tam bu oldu:
  // 14 Ağustos'tan beri 12 öğrenci ve 71 kitapla çalışan alanın yanına
  // boş bir ikinci alan açıldı, `default_workspace_id` ona kaydı ve
  // panel "henüz aktif dönem yok" demeye başladı. Kullanıcı hiçbir hata
  // görmedi; verisi kayıp gibi göründü.
  //
  // Geçici bir okuma hatası (pooler, ağ, RLS) veri çoğaltmaya yol
  // açmamalı: hata varken karar verilmez. /erisim ne olduğunu anlatıyor
  // ve oturumu kapatma yolu sunuyor; kullanıcı sayfayı yenilediğinde
  // okuma başarılı olursa normal akışa döner.
  if (profileError) {
    console.error(
      '[kurulum] profil okunamadı; geç kurulum ÇALIŞTIRILMADI:',
      JSON.stringify({ authUserId: user.id, message: profileError.message })
    )
    redirect('/erisim')
  }

  // ============================================================
  // ÇALIŞMA ALANI YOKSA: KİM OLDUĞU DEĞİL, NE İSTEDİĞİ BELİRLER
  //
  // Önceden burada alanı olmayan HERKES için öğretmen alanı kuruluyordu.
  // Google girişi açılınca davet linkini kullanmadan giren öğrenci ya da
  // veli de öğretmen yapılıyordu. Karar artık lib/landing-decision.ts'te:
  //
  //   - öğretmen niyeti belli (kayıt formu üst verisi) -> alanı kur
  //   - belli değil -> /hosgeldin: bekleyen davetler ya da rol seçimi
  //
  // Kurulumun kendisi /kurulum/ogretmen'de (Route Handler): burası bir
  // Server Component ve davet çerezini silemiyordu (20cd4ed).
  // ============================================================
  const landing = decideLanding({
    profileError: false,
    hasWorkspace: Boolean(profile?.default_workspace_id),
    metadata: user.user_metadata,
  })
  if (landing === 'setup-teacher') redirect('/kurulum/ogretmen')
  if (landing === 'welcome' || !profile?.default_workspace_id) redirect('/hosgeldin')

  // ROL AKTİF ALANDAN (B18) — middleware ile aynı kural (çerez →
  // varsayılan → ilk üyelik). Önceden yalnız varsayılan alan okunuyordu:
  // seçiciyle veli paneline geçen öğretmen ana sayfaya dönünce yeniden
  // öğretmen paneline atılıyordu.
  const { data: rows } = await supabase
    .from('workspace_members')
    .select('role, workspace_id')
    .eq('profile_id', profile.id)
    .eq('status', 'active')
    .order('created_at', { ascending: true })
  const memberships = (rows ?? []).map((r) => ({
    workspaceId: r.workspace_id as string,
    role: r.role as string,
  }))
  const activeId = resolveActiveWorkspaceId(
    memberships,
    (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null,
    profile.default_workspace_id
  )
  const roles = rolesInWorkspace(memberships, activeId)
  const member = roles.length > 0 ? { role: roles.includes('owner') || roles.includes('teacher') ? 'teacher' : roles[0] } : null

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
