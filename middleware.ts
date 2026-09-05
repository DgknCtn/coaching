import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'
import {
  ACTIVE_WORKSPACE_COOKIE,
  resolveActiveWorkspaceId,
  rolesInWorkspace,
  type WorkspaceMembership,
} from '@/lib/active-workspace'
import {
  ROLE_CACHE_COOKIE,
  ROLE_CACHE_MAX_AGE_SECONDS,
  parseRoleCache,
  serializeRoleCache,
} from '@/lib/role-cache'
import {
  REFERRAL_COOKIE,
  REFERRAL_MAX_AGE_SECONDS,
  normalizeReferralCode,
} from '@/lib/referral-code'

/**
 * Giriş gerektirmeyen herkese açık rotalar (tam eşleşme veya segment sınırı).
 *
 * SIRA ÖNEMLİ: bu karar artık auth çağrısından ÖNCE veriliyor. Eskiden
 * `supabase.auth.getUser()` koşulsuz çalışıyor, sonuç ancak aşağıda
 * kullanılıyordu; yani ana sayfayı açan, gizlilik metnini okuyan ya da
 * ödeme callback'i atan HER istek Supabase Auth sunucusuna bir HTTP turu
 * ödüyordu — oturumu olmayan ziyaretçiler için tamamen boşuna.
 */
function isPublicPath(pathname: string): boolean {
  return (
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
  )
}

// Rol bazlı panel koruması: bir kullanıcının rolüne ait olmayan panele
// girmesini engelle ve doğru paneline yönlendir (getXContext'in /login'e
// atmasından daha iyi UX + ek savunma katmanı).
//
// 'assistant' KALDIRILDI (051): rol şemada vardı ama fiilen kırıktı —
// middleware onu buraya alıyor, getTeacherContext ise reddedip
// /login'e atıyordu. Yarım bir rol, yarım bir yetkilendirmedir.
const roleAreas = [
  { prefix: '/teacher', roles: ['owner', 'teacher'] },
  { prefix: '/student', roles: ['student'] },
  { prefix: '/parent', roles: ['parent'] },
] as const

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })
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
  //
  // AUTH'TAN ÖNCE: atıf yakalama oturumdan bağımsızdır ve herkese açık
  // sayfalarda olur; aşağıdaki erken dönüşün onu atlamaması gerekiyor.
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

  // Herkese açık rota: hiçbir ağ turu ödemeden çık. Tek istisna, giriş
  // yapmış kullanıcının /login ya da /register'a gitmesi — orada oturumun
  // var olup olmadığını bilmemiz gerekiyor.
  const isAuthPage = pathname === '/login' || pathname === '/register'
  if (isPublicPath(pathname) && !isAuthPage) return supabaseResponse

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

  // getUser() DEĞİL getClaims(): getUser HER çağrıda Supabase Auth
  // sunucusuna bir HTTP isteği atar. getClaims, proje asimetrik imzalama
  // anahtarı kullanıyorsa JWT'yi YERELDE doğrular (sıfır ağ turu);
  // kullanmıyorsa aynı sunucu doğrulamasına düşer. Yani hiçbir durumda
  // eskisinden yavaş değil, tipik durumda gezinme başına bir tur ucuz.
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub ?? null

  // Giriş yapmış kullanıcı auth sayfasına gitmeye çalışıyor
  if (userId && isAuthPage) {
    const dashboardUrl = request.nextUrl.clone()
    dashboardUrl.pathname = '/'
    return NextResponse.redirect(dashboardUrl)
  }

  // Giriş yapmamış kullanıcı korumalı rotaya girmeye çalışıyor
  if (!userId) {
    if (isPublicPath(pathname)) return supabaseResponse
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  const area = roleAreas.find((a) => pathname.startsWith(a.prefix))
  if (!area) return supabaseResponse

  const preferredWorkspaceId =
    request.cookies.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
  const now = Math.floor(Date.now() / 1000)

  /**
   * Rolleri veritabanından çözer ve önbelleğe yazar.
   *
   * Profil ve üyelikler TEK sorguda alınır: bunlar iki ayrı istek olarak
   * yapıldığında her sayfa gezinmesine (ve her prefetch'e) fazladan bir
   * gidiş-dönüş biniyordu. Gömülü select aynı veriyi tek turda döner.
   *
   * `null` dönmesi "profil yok" demektir — çağıran /login'e yönlendirir.
   */
  const loadRolesFromDb = async (): Promise<{ roles: string[] } | null> => {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, default_workspace_id, workspace_members(role, workspace_id, status)')
      .eq('auth_user_id', userId)
      .maybeSingle()

    if (!profile) return null

    const members = (profile.workspace_members ?? []) as unknown as {
      role: string
      workspace_id: string
      status: string
    }[]

    // AKTİF WORKSPACE aynı fonksiyondan çözülür (lib/active-workspace.ts).
    // Middleware ile sunucu bileşenlerinin ayrı mantık kullanması, bu kod
    // tabanında zaten bir kez soruna yol açtı (assistant rolü): biri
    // erişim verirken diğeri reddediyordu. Tek kaynak, tek karar.
    const memberships: WorkspaceMembership[] = members
      .filter((m) => m.status === 'active')
      .map((m) => ({ workspaceId: m.workspace_id, role: m.role }))

    const workspaceId = resolveActiveWorkspaceId(
      memberships,
      preferredWorkspaceId,
      profile.default_workspace_id
    )
    const roles = rolesInWorkspace(memberships, workspaceId)

    supabaseResponse.cookies.set(
      ROLE_CACHE_COOKIE,
      serializeRoleCache({
        sub: userId,
        workspaceId,
        roles,
        exp: now + ROLE_CACHE_MAX_AGE_SECONDS,
      }),
      {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        maxAge: ROLE_CACHE_MAX_AGE_SECONDS,
        secure: process.env.NODE_ENV === 'production',
      }
    )

    return { roles }
  }

  const cached = parseRoleCache(
    request.cookies.get(ROLE_CACHE_COOKIE)?.value,
    userId,
    preferredWorkspaceId,
    now
  )

  let roles = cached?.roles ?? null
  if (!roles) {
    const fresh = await loadRolesFromDb()
    // Profil yok ya da varsayılan workspace atanmamış. Önceden bu dal
    // rol kontrolünü tamamen atlıyordu; sayfaya girildiğinde getXContext
    // zaten /login'e yönlendirdiği için sonuç aynıydı ama middleware'in
    // "ek savunma katmanı" olma iddiası bu durumda geçerli değildi.
    if (!fresh) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    roles = fresh.roles
  }

  let hasAccess = roles.some((r) => area.roles.includes(r as never))

  // ÖNBELLEK ASİMETRİK KULLANILIR (bkz. lib/role-cache.ts): "erişim yok"
  // kararı asla eski ya da uydurulmuş bir çerezle verilmez —
  // yönlendirmeden önce veritabanına sorulur. Aksi hâlde davetini yeni
  // kabul etmiş bir kullanıcı bir dakika boyunca kendi panelinden
  // kilitlenirdi.
  if (!hasAccess && cached) {
    const fresh = await loadRolesFromDb()
    if (!fresh) {
      const url = request.nextUrl.clone()
      url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    roles = fresh.roles
    hasAccess = roles.some((r) => area.roles.includes(r as never))
  }

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
    const home = roles.includes('student')
      ? '/student'
      : roles.includes('parent')
        ? '/parent'
        : roles.some((r) => ['owner', 'teacher'].includes(r))
          ? '/teacher'
          : '/erisim'
    const url = request.nextUrl.clone()
    url.pathname = home
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // API uçları BİLİNÇLİ OLARAK DIŞARIDA: her biri kendi kimlik
    // doğrulamasını yapıyor (ödeme uçlarında imza doğrulaması, diğer
    // yerlerde sunucu istemcisi + RLS). Middleware'in onları da
    // taraması, istek başına fazladan bir auth turu demekti.
    // Statik varlıklar ve font/resim uzantıları da dışarıda.
    '/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff|woff2|ttf|otf|txt|xml|webmanifest)$).*)',
  ],
}
