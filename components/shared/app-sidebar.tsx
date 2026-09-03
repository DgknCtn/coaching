'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  GraduationCap,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/actions'
import {
  navByRole,
  studentContextNav,
  type NavItem,
  type Role,
} from '@/components/nav-config'
import { StudentSwitcher, type SwitcherStudent } from '@/components/shared/student-switcher'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SIDEBAR_COOKIE } from '@/lib/sidebar-cookie'

interface Panel {
  label: string
  items: string[]
}

interface AppSidebarProps {
  /** Sidebar başlığında görünen ad (workspace veya kullanıcı adı). */
  title: string
  /**
   * Nav listesi bu roldan türetilir. Dizinin kendisi prop olarak alınamaz:
   * NavItem.icon bir bileşen fonksiyonu ve Server Component -> Client
   * Component sınırından fonksiyon geçirilemez.
   */
  role: Role
  /** Rol etiketi — alt kullanıcı satırında gösterilir. */
  roleLabel: string
  userName: string
  /** Nav altındaki bilgi kutusu (aktif dönem, takip edilen öğrenciler vb.). */
  panel?: Panel
  /**
   * Öğretmenin öğrencileri. Verilirse ve geçerli rota bir öğrenci bağlamındaysa
   * markanın altında aktif öğrenci seçici gösterilir.
   */
  students?: SwitcherStudent[]
  /**
   * Masaüstü rail'in başlangıç durumu. Layout tarafında cookie'den okunur
   * (lib/sidebar-prefs.ts) — böylece ilk boyada genişten dara zıplama olmaz.
   */
  defaultCollapsed?: boolean
}

export function AppSidebar({
  title,
  role,
  roleLabel,
  userName,
  panel,
  students,
  defaultCollapsed = false,
}: AppSidebarProps) {
  const items = navByRole[role]
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const [isPending, startTransition] = useTransition()
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerRef = useRef<HTMLElement>(null)

  // Seçici yalnız öğrenci bağlamındaki rotalarda görünür. Layout bir server
  // component olduğu için pathname'i okuyamaz; türetme burada yapılır.
  const activeStudentId = pathname.match(/^\/teacher\/students\/([0-9a-fA-F-]{36})/)?.[1]

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  const handleLogout = useCallback(() => {
    startTransition(async () => {
      await logoutAction()
    })
  }, [])

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev
      // Bir sonraki isteğin sunucuda doğru genişlikle render edilmesi için.
      document.cookie = `${SIDEBAR_COOKIE}=${next ? '1' : '0'}; path=/; max-age=31536000; SameSite=Lax`
      return next
    })
  }

  // Mobil menü açıkken Escape ile kapat, arka planı kilitle ve odağı yönet.
  useEffect(() => {
    if (!mobileOpen) return

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Çekmece açılınca odak içeri taşınır; kapanınca (cleanup) hamburger'a döner.
    drawerRef.current?.querySelector<HTMLElement>('a, button')?.focus()

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previousOverflow
      // Kural burada ref'i efekt içinde bir değişkene kopyalamayı öneriyor.
      // Kasıtlı olarak yapılmıyor: hamburger düğmesi çekmece açıkken de
      // BAĞLI KALIR, yani temizlik anında okunan .current zaten aynı
      // düğmedir. Kopyalamak, düğme yeniden bağlanırsa ESKİ düğmeye odak
      // vermeye çalışmak demek olurdu — canlı değeri okumak daha doğru.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      menuButtonRef.current?.focus()
    }
  }, [mobileOpen])

  /**
   * Rail içeriği. `compact` yalnız masaüstü daraltılmış rail için true olur;
   * mobil çekmece her zaman tam etiketli render edilir.
   */
  function inner(compact: boolean) {
    const brand = (
      <div className={cn('mb-4 flex items-center gap-2.5', compact ? 'justify-center px-3' : 'px-5')}>
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sidebar-primary to-primary">
          <GraduationCap className="size-4 text-sidebar-primary-foreground" />
        </div>
        {!compact && (
          <p className="truncate text-base font-semibold tracking-tight text-sidebar-foreground">
            {title}
          </p>
        )}
      </div>
    )

    // Dar rail'de seçici okunamayacak kadar sıkışıyor; gizleniyor.
    const switcher = !compact && students && students.length > 0 && activeStudentId && (
      <div className="mb-4">
        <StudentSwitcher students={students} activeStudentId={activeStudentId} />
      </div>
    )

    // Tek bir nav bloğu. İki yerde kullanılıyor (ana menü ve öğrenci
    // bağlamı), bu yüzden link görünümü tek yerde tanımlı.
    function navBlock(navItems: NavItem[], label: string, heading?: string) {
      if (navItems.length === 0) return null
      return (
        <nav aria-label={label} className="flex flex-col gap-1 px-3">
          {heading && !compact && (
            <p className="px-3 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-sidebar-foreground/40">
              {heading}
            </p>
          )}
          {navItems.map((item) => {
            const active = isActive(item)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                aria-label={compact ? item.label : undefined}
                title={compact ? item.label : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  // py-2.5 md:py-2 — mobil çekmecede dokunma hedefini büyütür,
                  // masaüstü rail (md ve üzeri) eski yoğunluğunda kalır.
                  'flex items-center gap-3 rounded-lg py-2.5 text-sm transition-colors md:py-2',
                  compact ? 'justify-center px-0' : 'px-3',
                  active
                    ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {!compact && item.label}
              </Link>
            )
          })}
        </nav>
      )
    }

    const nav = navBlock(items, 'Ana menü')

    // Öğrenci bağlamı: bir öğrencinin herhangi bir ekranı açıkken o
    // öğrencinin bütün ekranları tek tıkla erişilebilir olmalı. Öğrenci
    // dışındaki sayfalarda blok hiç render edilmez — menü bugünkü hâlinde
    // kalır. Dar rail'de başlık gizlenir, ikonlar kalır (title ile).
    const studentNavBlock = role === 'teacher' && activeStudentId && (
      <div className="mt-4 border-t border-sidebar-border pt-4">
        {navBlock(studentContextNav(activeStudentId), 'Öğrenci menüsü', 'Öğrenci')}
      </div>
    )

    const panelBlock = !compact && panel && panel.items.length > 0 && (
      <div className="mt-6 px-6">
        <p className="text-xs text-sidebar-foreground/50">{panel.label}</p>
        <div className="mt-2 space-y-1">
          {panel.items.map((value) => (
            <p key={value} className="truncate text-sm text-sidebar-foreground/80">
              {value}
            </p>
          ))}
        </div>
      </div>
    )

    const footer = (
      <div className="mt-auto border-t border-sidebar-border px-3 pt-3">
        <div
          className={cn(
            'flex items-center gap-3 py-2',
            compact ? 'justify-center px-0' : 'px-3'
          )}
        >
          <div
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent"
            title={compact ? `${userName} · ${roleLabel}` : undefined}
          >
            <span className="text-xs font-medium text-sidebar-foreground">
              {userName.charAt(0).toUpperCase()}
            </span>
          </div>
          {!compact && (
            <div className="min-w-0">
              <p className="truncate text-sm text-sidebar-foreground">{userName}</p>
              <p className="text-xs text-sidebar-foreground/50">{roleLabel}</p>
            </div>
          )}
        </div>
        <ThemeToggle
          variant="sidebar"
          showLabel={!compact}
          className={compact ? 'justify-center px-0' : undefined}
        />
        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          aria-label={compact ? 'Çıkış Yap' : undefined}
          title={compact ? 'Çıkış Yap' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-md py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-40',
            compact ? 'justify-center px-0' : 'px-3'
          )}
        >
          <LogOut className="size-4 shrink-0" />
          {!compact && 'Çıkış Yap'}
        </button>
      </div>
    )

    return (
      <>
        {brand}
        {switcher}
        {nav}
        {studentNavBlock}
        {panelBlock}
        {footer}
      </>
    )
  }

  return (
    <>
      {/* Masaüstü */}
      <aside
        id="app-sidebar"
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col bg-sidebar py-5 transition-[width] duration-200 ease-out md:flex',
          collapsed ? 'w-16' : 'w-60'
        )}
      >
        {inner(collapsed)}
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            aria-label={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            title={collapsed ? 'Menüyü genişlet' : 'Menüyü daralt'}
            className={cn(
              'flex w-full items-center gap-3 rounded-md py-2 text-sm text-sidebar-foreground/50 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground',
              collapsed ? 'justify-center px-0' : 'px-3'
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4 shrink-0" />
            ) : (
              <PanelLeftClose className="size-4 shrink-0" />
            )}
            {!collapsed && 'Daralt'}
          </button>
        </div>
      </aside>

      {/*
        Mobil başlık. h-14 yüksekliği rol layout'larındaki
        <main className="pt-14 md:pt-0"> ile eşleşmek zorunda.
      */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between gap-2 border-b border-sidebar-border bg-sidebar px-2 md:hidden">
        <div className="flex min-w-0 items-center gap-1">
          <button
            ref={menuButtonRef}
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={mobileOpen}
            aria-controls="mobile-nav"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{title}</p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ThemeToggle variant="sidebar" className="w-auto px-2" />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Kullanıcı menüsü"
              className="flex size-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-medium text-sidebar-foreground transition-colors hover:bg-sidebar-accent/70"
            >
              {userName.charAt(0).toUpperCase()}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>
                <span className="block truncate">{userName}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {roleLabel}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={isPending} onClick={handleLogout}>
                <LogOut className="size-4 shrink-0" />
                Çıkış Yap
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 pt-14 md:hidden">
          <div
            // Sabit siyah: bg-foreground/40 token olduğu için koyu temada ters
            // dönüp beyaz bir perde oluyordu.
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            ref={drawerRef}
            id="mobile-nav"
            // 85vw tavanı: 320px'lik telefonlarda çekmece ekranı tamamen
            // kaplayıp arkadaki perdeyi görünmez bırakıyordu.
            className="relative flex h-full w-[min(18rem,85vw)] flex-col overflow-y-auto bg-sidebar py-6"
          >
            {inner(false)}
          </aside>
        </div>
      )}
    </>
  )
}
