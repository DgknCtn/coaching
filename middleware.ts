import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/types/database'

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

  // Giriş gerektirmeyen herkese açık rotalar (tam eşleşme veya segment sınırı)
  const isPublicPath =
    pathname === '/' ||
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/demo' ||
    pathname === '/forgot-password' ||
    pathname === '/api/health' ||
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
    { prefix: '/teacher', roles: ['owner', 'teacher', 'assistant'] },
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

    if (profile?.default_workspace_id) {
      const members = (profile.workspace_members ?? []) as unknown as {
        role: string
        workspace_id: string
        status: string
      }[]

      // Filtreleme artık istemci tarafında: sorgu tüm üyelikleri getiriyor,
      // aktif dönem workspace'ine ait ve 'active' olanlar seçiliyor. Sonuç
      // önceki iki sorgulu halle birebir aynı.
      const userRoles = members
        .filter((m) => m.workspace_id === profile.default_workspace_id && m.status === 'active')
        .map((m) => m.role)
      const hasAccess = userRoles.some((r) => area.roles.includes(r as never))

      if (!hasAccess) {
        // Kullanıcıyı sahip olduğu role uygun panele yönlendir
        const home = userRoles.includes('student')
          ? '/student'
          : userRoles.includes('parent')
            ? '/parent'
            : userRoles.some((r) => ['owner', 'teacher', 'assistant'].includes(r))
              ? '/teacher'
              : '/login'
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
