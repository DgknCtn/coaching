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
    pathname === '/api/health' ||
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
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, default_workspace_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (profile?.default_workspace_id) {
      const { data: members } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('profile_id', profile.id)
        .eq('workspace_id', profile.default_workspace_id)
        .eq('status', 'active')

      const userRoles = (members ?? []).map((m) => m.role as string)
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
    }
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
