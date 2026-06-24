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

  const brand = (
    <div className="px-3 mb-6">
      <div
        className="rounded-2xl px-3.5 py-3 border border-white/8"
        style={{ background: 'linear-gradient(135deg, oklch(0.55 0.22 20 / 0.20) 0%, oklch(0.47 0.20 8 / 0.10) 100%)' }}
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
            style={{ background: 'linear-gradient(135deg, oklch(0.60 0.20 20), oklch(0.52 0.18 8))' }}
          >
            <GraduationCap className="size-4 text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-sidebar-foreground/40 uppercase tracking-widest font-bold mb-0.5">
              Veli Paneli
            </p>
            <p className="text-sm font-bold text-sidebar-foreground truncate leading-tight">
              {parentName}
            </p>
          </div>
        </div>
      </div>
    </div>
  )

  const inner = (
    <>
      {brand}

      {studentNames.length > 0 && (
        <div className="px-3 mb-4">
          <div className="rounded-xl bg-sidebar-accent/50 border border-sidebar-border/50 px-3.5 py-3">
            <p className="text-[9px] text-sidebar-foreground/35 uppercase tracking-widest font-bold mb-2">
              Takip Edilen
            </p>
            {studentNames.map((n) => (
              <div key={n} className="flex items-center gap-2 py-1">
                <Heart className="size-3 text-rose-400/70 shrink-0" />
                <p className="text-xs text-sidebar-foreground/75 font-medium truncate">{n}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex-1" />

      <div className="px-3 mt-auto">
        <div className="border-t border-sidebar-border pt-3 space-y-0.5">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 ring-1 ring-sidebar-border"
              style={{ background: 'linear-gradient(135deg, oklch(0.60 0.20 20 / 0.4), oklch(0.52 0.18 8 / 0.3))' }}
            >
              <span className="text-xs font-bold text-sidebar-foreground">
                {parentName.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-sidebar-foreground truncate">{parentName}</p>
              <p className="text-[10px] text-sidebar-foreground/35 font-medium">Veli</p>
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
    </>
  )

  return (
    <>
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-sidebar h-screen sticky top-0 py-5">
        {inner}
      </aside>

      <div className="md:hidden fixed top-0 inset-x-0 z-40 flex items-center justify-between h-14 px-4 bg-sidebar border-b border-sidebar-border">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, oklch(0.60 0.20 20), oklch(0.52 0.18 8))' }}
          >
            <GraduationCap className="size-4 text-white" />
          </div>
          <p className="font-bold text-sm text-sidebar-foreground">Veli Paneli</p>
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
          <aside className="relative w-72 h-full bg-sidebar flex flex-col py-5 shadow-2xl">
            {inner}
          </aside>
        </div>
      )}
    </>
  )
}
