'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, BookOpen, CalendarDays, LogOut, Menu, X, GraduationCap,
} from 'lucide-react'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/actions'

const navItems = [
  { href: '/teacher', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/teacher/students', label: 'Öğrenciler', icon: Users },
  { href: '/teacher/books', label: 'Kitap Havuzu', icon: BookOpen },
  { href: '/teacher/terms', label: 'Eğitim Dönemi', icon: CalendarDays },
]

interface Props {
  workspaceName: string
  userName: string
  activeTerm?: string | null
}

export function TeacherSidebar({ workspaceName, userName, activeTerm }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href
    return pathname.startsWith(href)
  }

  function handleLogout() {
    startTransition(async () => { await logoutAction() })
  }

  const logo = (
    <div className="flex items-center gap-2.5 mb-7 px-1">
      <div className="w-8 h-8 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
        <GraduationCap className="size-4 text-sidebar-foreground" />
      </div>
      <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">
        {workspaceName}
      </p>
    </div>
  )

  const nav = (
    <nav className="flex flex-col gap-0.5 flex-1">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150',
            isActive(item.href, item.exact)
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <item.icon className="size-4 shrink-0" />
          {item.label}
        </Link>
      ))}
    </nav>
  )

  const footer = (
    <div className="border-t border-sidebar-border pt-3 space-y-1 mt-2">
      {activeTerm && (
        <div className="px-3 py-2 rounded-lg bg-sidebar-accent/50 mb-2">
          <p className="text-[10px] text-sidebar-foreground/45 uppercase tracking-wider font-semibold">
            Aktif Dönem
          </p>
          <p className="text-xs text-sidebar-foreground/75 truncate mt-0.5">{activeTerm}</p>
        </div>
      )}
      <div className="flex items-center gap-2.5 px-3 py-2">
        <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
          <span className="text-[11px] font-bold text-sidebar-foreground">
            {userName.charAt(0).toUpperCase()}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-sidebar-foreground truncate">{userName}</p>
          <p className="text-[10px] text-sidebar-foreground/45">Öğretmen</p>
        </div>
      </div>
      <button
        onClick={handleLogout}
        disabled={isPending}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/55 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors disabled:opacity-40"
      >
        <LogOut className="size-4 shrink-0" />
        Çıkış Yap
      </button>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-sidebar h-screen sticky top-0 p-4">
        {logo}
        {nav}
        {footer}
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="size-4 text-sidebar-foreground/70" />
          <h1 className="font-semibold text-sm text-sidebar-foreground truncate">{workspaceName}</h1>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70"
          aria-label="Menu"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-14">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-sidebar flex flex-col p-4">
            {logo}
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  )
}
