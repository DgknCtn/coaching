import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import {
  ACTIVE_WORKSPACE_COOKIE,
  resolveActiveWorkspaceId,
  rolesInWorkspace,
} from '@/lib/active-workspace'
import {
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE_SECONDS,
  normalizeReferralCode,
} from '@/lib/referral-code'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // ---- PARTNER ATIF YAKALAMA (059) ----
  //
  // `?ref=KOD` ile gelen ziyaretçinin kodu ÇEREZE yazılır. Sorgu
  // parametresi olarak taşınsaydı, kullanıcı Google ile kaydolurken
  // tarayıcı Google'a gidip dönerken kaybolurdu.
  //
  // Biçim kuralı lib/referral-code.ts'te: middleware (Edge), sunucu
  // aksiyonu ve testler aynı kuralı kullanıyor. Üç yerde elle
  // tekrarlansaydı biri düzeltilirken diğerleri unutulurdu.
  const code = normalizeReferralCode(request.nextUrl.searchParams.get('ref'))
  if (code) {
    supabaseResponse.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: REFERRAL_MAX_AGE_SECONDS,
      secure: process.env.NODE_ENV === 'production',
    })
  }

  // Giriş gerektirmeyen herkese açık rotalar (tam eşleşme veya segment sınırı)
  const isPublicPath =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/demo' ||
    pathname === '/forgot-password' ||
    pathname === '/api/health' ||
    // HUKUKİ METİNLER: bunların herkese açık olması yasal zorunluluk ve
    // zaten alıcı ADAYI okur — oturumu olmayan ziyaretçi. Footer'dan
    // tıklayan ziyaretçi /login'e düşüyordu.
    pathname === '/gizlilik' ||
    pathname === '/kosullar' ||
    pathname === '/mesafeli-satis' ||
    pathname === '/on-bilgilendirme' ||
    pathname === '/iade' ||
    // ÖDEME UÇLARI: sağlayıcı OTURUMSUZ POST atar. Buraya oturum şartı
    // koymak, callback'i /login'e yönlendirip hiçbir ödemenin
    // kapanmaması demekti. Kimlik doğrulaması bu uçların İÇİNDE
    // yapılıyor: imza doğrulaması ve sağlayıcıya sorma.
    pathname.startsWith('/api/billing/') ||
    // Supabase auth e-posta bağlantılarının döndüğü callback; oturumu burada
    // kuruyoruz, dolayısıyla giriş kontrolünden muaf olmalı.
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/invite/')

  // Giriş yapmamış kullanıcı korumalı rotaya girmeye çalışıyor
  if (!user && !isPublicPath) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  // Giriş yapmış kullanıcı auth sayfasına gitmeye çalışıyor
  if (user && (pathname === '/login' || pathname === '/register')) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/'
    return NextResponse.redirect(dashboardUrl)
  }

  // Rol bazlı panel koruması: bir kullanıcının rolüne ait olmayan panele
  // girmesini engelle ve doğru paneline yönlendir (getXContext'in /login'e
  // atmasından daha iyi UX + ek savunma katmanı).
  const roleAreas = [
    // 'assistant' KALDIRILDI (051): rol şemada vardı ama fiilen kırıktı —
    // middleware onu buraya alıyor, getTeacherContext ise reddedip
    // /login'e atıyordu. Yarım bir rol, yarım bir yetkilendirmedir.
    { prefix: '/teacher', roles: ['owner', 'teacher'] },
    { prefix: '/student', roles: ['student'] },
    { prefix: '/parent', roles: ['parent'] },
  ] as const
  const area = user ? roleAreas.find((a) => pathname.startsWith(a.prefix)) : undefined

  if (user && area) {
    // Profil ve üyelikler TEK sorguda alınır: bunlar iki ayrı istek olarak
    // yapıldığında her sayfa gezinmesine (ve her prefetch'e) fazladan bir
    // gidiş-dönüş biniyordu. Gömülü select aynı veriyi tek turda döner.
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, default_workspace_id, workspace_members(role, workspace_id, status)')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile) {
      const members = (profile.workspace_members ?? []) as unknown as {
        role: string
        workspace_id: string
        status: string
      }[]

      // AKTİF WORKSPACE aynı fonksiyondan çözülür (lib/active-workspace.ts).
      // Middleware ile sunucu bileşenlerinin ayrı mantık kullanması, bu kod
      // tabanında zaten bir kez soruna yol açtı (assistant rolü): biri
      // erişim verirken diğeri reddediyordu. Tek kaynak, tek karar.
      const memberships = members
        .filter((m) => m.status === 'active')
        .map((m) => ({ workspaceId: m.workspace_id, role: m.role }))

      const activeWorkspaceId = resolveActiveWorkspaceId(
        memberships,
        request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null,
        profile.default_workspace_id
      )

      const userRoles = rolesInWorkspace(memberships, activeWorkspaceId)
      const hasAccess = userRoles.some((r) => area.roles.includes(r as never))

      if (!hasAccess) {
        // Kullanıcıyı sahip olduğu role uygun panele yönlendir.
        //
        // HİÇ ROL YOKSA /erisim'e gidilir, /login'e değil: 052'den sonra
        // askıya alınmış ya da denemesi dolmuş bir çalışma alanının
        // üyelikleri RLS tarafından süzülüyor ve buraya boş bir rol
        // listesi olarak düşüyor. Bu kullanıcı yetkisiz değil,
        // ENGELLENMİŞ; giriş ekranına atmak ona doğru şifreyle tekrar
        // tekrar denemekten başka bir şey bırakmaz. /erisim sayfası
        // gerçekten yetkisizse zaten /login'e geri gönderir.
        const home = userRoles.includes('student')
          ? '/student'
          : userRoles.includes('parent')
            ? '/parent'
            : userRoles.some((r) => ['owner', 'teacher'].includes(r))
              ? '/teacher'
              : '/erisim'
        const url = request.nextUrl.clone()
        url.pathname = home
        return NextResponse.redirect(url)
      }
    } else {
      // Profil yok ya da varsayılan workspace atanmamış. Önceden bu dal
      // rol kontrolünü tamamen atlıyordu; sayfaya girildiğinde getXContext
      // zaten /login'e yönlendirdiği için sonuç aynıydı ama middleware'in
      // "ek savunma katmanı" olma iddiası bu durumda geçerli değildi.
      // Aynı son duruma burada da varılır.
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
