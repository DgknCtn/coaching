'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, LogOut, Menu, X, GraduationCap } from 'lucide-react'
import { useState, useTransition } from 'react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/actions'

interface Props {
  studentName: string
}

export function StudentSidebar({ studentName }: Props) {
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => { await logoutAction() })
  }

  const isActive = pathname === '/student'

  const brand = (
    <div className="px-3 mb-6">
      <div
        className="rounded-2xl px-3.5 py-3 border border-white/8"
        style={{ background: 'linear-gradient(135deg, oklch(0.50 0.18 155 / 0.20) 0%, oklch(0.43 0.16 168 / 0.10) 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: 'linear-gradient(135deg, oklch(0.50 0.18 155), oklch(0.43 0.16 168))' }}
          >
            <GraduationCap className="size-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-bold mb-0.5">
              Öğrenci
            </p>
            <p className="text-sm font-bold text-sidebar-foreground truncate leading-tight">
              {studentName}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const nav = (
    <nav className="flex flex-col gap-0.5 flex-1 px-3">
      <Link
        href="/student"
        onClick={() => setMobileOpen(false)}
        className={cn(
          'relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150',
          isActive
            ? 'bg-sidebar-accent text-sidebar-foreground nav-active-indicator'
            : 'text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground/85'
        )}
      >
        <ClipboardList className={cn('size-4 shrink-0', isActive ? 'text-emerald-400' : '')} />
        Ödevlerim
        {isActive && (
          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />
        )}
      </Link>
    </nav>
  )

  const footer = (
    <div className="px-3 mt-auto">
      <div className="border-t border-sidebar-border pt-3 space-y-0.5">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ring-1 ring-sidebar-border"
            style={{ background: 'linear-gradient(135deg, oklch(0.50 0.18 155 / 0.4), oklch(0.43 0.16 168 / 0.3))' }}
          >
            <span className="text-xs font-bold text-sidebar-foreground">
              {studentName.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-sidebar-foreground truncate">{studentName}</p>
            <p className="text-[10px] text-sidebar-foreground/35 font-medium">Öğrenci</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          disabled={isPending}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-sidebar-foreground/40 hover:bg-sidebar-accent hover:text-sidebar-foreground/80 transition-colors disabled:opacity-40"
        >
          <LogOut className="size-4 shrink-0" />
          Çıkış Yap
        </button>
      </div>
    </div>
  )

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-sidebar h-screen sticky top-0 py-5 gap-2">
        {brand}
        {nav}
        {footer}
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, oklch(0.50 0.18 155), oklch(0.43 0.16 168))' }}
          >
            <GraduationCap className="size-4 text-white" />
          </div>
          <p className="font-bold text-sm text-sidebar-foreground truncate">{studentName}</p>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-xl hover:bg-sidebar-accent text-sidebar-foreground/60"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-14">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 h-full bg-sidebar flex flex-col py-5 gap-2 shadow-2xl">
            {brand}
            {nav}
            {footer}
          </aside>
        </div>
      )}
    </>
  )
}
