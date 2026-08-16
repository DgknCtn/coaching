'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GraduationCap, LogOut, Menu, X } from 'lucide-react'
import { useEffect, useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/actions'
import { navByRole, type NavItem, type Role } from '@/components/nav-config'

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
}

export function AppSidebar({ title, role, roleLabel, userName, panel }: AppSidebarProps) {
  const items = navByRole[role]
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function isActive(item: NavItem) {
    return item.exact ? pathname === item.href : pathname.startsWith(item.href)
  }

  function handleLogout() {
    startTransition(async () => {
      await logoutAction()
    })
  }

  // Mobil menü açıkken Escape ile kapat (klavye erişilebilirliği).
  useEffect(() => {
    if (!mobileOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  const brand = (
    <div className="mb-6 flex items-center gap-3 px-6">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
        <GraduationCap className="size-4 text-sidebar-foreground" />
      </div>
      <p className="truncate text-sm font-semibold text-sidebar-foreground">{title}</p>
    </div>
  )

  const nav = items.length > 0 && (
    <nav aria-label="Ana menü" className="flex flex-col gap-1 px-3">
      {items.map((item) => {
        const active = isActive(item)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={() => setMobileOpen(false)}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              active
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground'
            )}
          >
            <item.icon className="size-4 shrink-0" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const panelBlock = panel && panel.items.length > 0 && (
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
      <div className="flex items-center gap-3 px-3 py-2">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sidebar-accent">
          <span className="text-xs font-medium text-sidebar-foreground">
            {userName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm text-sidebar-foreground">{userName}</p>
          <p className="text-xs text-sidebar-foreground/50">{roleLabel}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={isPending}
        className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground disabled:opacity-40"
      >
        <LogOut className="size-4 shrink-0" />
        Çıkış Yap
      </button>
    </div>
  )

  const inner = (
    <>
      {brand}
      {nav}
      {panelBlock}
      {footer}
    </>
  )

  return (
    <>
      {/* Masaüstü */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar py-6 md:flex">
        {inner}
      </aside>

      {/*
        Mobil başlık. h-14 yüksekliği rol layout'larındaki
        <main className="pt-14 md:pt-0"> ile eşleşmek zorunda.
      */}
      <div className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-sidebar-border bg-sidebar px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-sidebar-accent">
            <GraduationCap className="size-4 text-sidebar-foreground" />
          </div>
          <p className="truncate text-sm font-semibold text-sidebar-foreground">{title}</p>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-md p-2 text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
          aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
          aria-expanded={mobileOpen}
          aria-controls="mobile-nav"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-30 pt-14 md:hidden">
          <div
            className="absolute inset-0 bg-foreground/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <aside
            id="mobile-nav"
            className="relative flex h-full w-72 flex-col bg-sidebar py-6"
          >
            {inner}
          </aside>
        </div>
      )}
    </>
  )
}
