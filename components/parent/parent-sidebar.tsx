'use client'

import { LogOut, Menu, X, GraduationCap, Heart } from 'lucide-react'
import { useState, useTransition } from 'react'
import { logoutAction } from '@/app/(auth)/actions'

interface Props {
  parentName: string
  studentNames: string[]
}

export function ParentSidebar({ parentName, studentNames }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleLogout() {
    startTransition(async () => { await logoutAction() })
  }

  const inner = (
    <>
      <div className="flex items-center gap-2.5 mb-7 px-1">
        <div className="w-8 h-8 rounded-lg bg-sidebar-accent flex items-center justify-center shrink-0">
          <GraduationCap className="size-4 text-sidebar-foreground" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] text-sidebar-foreground/45 uppercase tracking-wider font-semibold">Veli Paneli</p>
          <p className="text-sm font-semibold text-sidebar-foreground truncate leading-tight">{parentName}</p>
        </div>
      </div>

      {studentNames.length > 0 && (
        <div className="px-3 py-2.5 rounded-lg bg-sidebar-accent/50 mb-4">
          <p className="text-[10px] text-sidebar-foreground/45 uppercase tracking-wider font-semibold mb-1.5">
            Takip Edilen Öğrenciler
          </p>
          {studentNames.map((n) => (
            <div key={n} className="flex items-center gap-2 py-0.5">
              <Heart className="size-2.5 text-sidebar-foreground/40 shrink-0" />
              <p className="text-xs text-sidebar-foreground/75 truncate">{n}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1" />

      <div className="border-t border-sidebar-border pt-3 mt-2">
        <div className="flex items-center gap-2.5 px-3 py-2 mb-1">
          <div className="w-7 h-7 rounded-full bg-sidebar-accent flex items-center justify-center shrink-0">
            <span className="text-[11px] font-bold text-sidebar-foreground">
              {parentName.charAt(0).toUpperCase()}
            </span>
          </div>
          <p className="text-xs font-medium text-sidebar-foreground truncate">{parentName}</p>
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
    </>
  )

  return (
    <>
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-sidebar h-screen sticky top-0 p-4">
        {inner}
      </aside>
      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <GraduationCap className="size-4 text-sidebar-foreground/70" />
          <p className="font-semibold text-sm text-sidebar-foreground">Veli Paneli</p>
        </div>
        <button
          onClick={() => setMobileOpen((v) => !v)}
          className="p-2 rounded-lg hover:bg-sidebar-accent text-sidebar-foreground/70"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-30 pt-14">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-64 h-full bg-sidebar flex flex-col p-4">{inner}</aside>
        </div>
      )}
    </>
  )
}
