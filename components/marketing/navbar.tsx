'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { GraduationCap, Menu, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { BRAND } from '@/lib/brand'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { cn } from '@/lib/utils'

export function Navbar() {
  const [scrolled, setScrolled] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', handler, { passive: true })
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header
      className={cn(
        'fixed top-0 inset-x-0 z-50 transition-all duration-300',
        scrolled
          ? 'border-b bg-background/90 backdrop-blur-md'
          : 'bg-transparent'
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary">
              <GraduationCap className="size-4 text-primary-foreground" />
            </div>
            <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
          </Link>

          <nav className="hidden md:flex items-center">
            <a
              href="#ozellikler"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Özellikler
            </a>
            <a
              href="#nasil-calisir"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Nasıl Çalışır
            </a>
            <a
              href="#fiyatlar"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Fiyatlar
            </a>
            <Link
              href="/demo"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Demo
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <ThemeToggle />
            <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Giriş Yap
            </Link>
            <Link href="/register" className={buttonVariants({ size: 'sm' })}>
              Ücretsiz Başla
            </Link>
          </div>

          <button
            type="button"
            className="rounded-md p-2 transition-colors hover:bg-muted md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menü"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        // max-h + scroll: yatay tutulan telefonlarda panel ekranı taşıyordu.
        <div className="max-h-[calc(100dvh-4rem)] overflow-y-auto border-b bg-background px-6 pb-4 md:hidden">
          <nav className="flex flex-col gap-1 pt-2">
            <a
              href="#ozellikler"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Özellikler
            </a>
            <a
              href="#nasil-calisir"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Nasıl Çalışır
            </a>
            <a
              href="#fiyatlar"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Fiyatlar
            </a>
            <Link
              href="/demo"
              onClick={() => setMobileOpen(false)}
              className="rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              Demo
            </Link>
          </nav>
          <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-border">
            <ThemeToggle showLabel className="w-full" onToggled={() => setMobileOpen(false)} />
            <Link href="/login" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full' })}>
              Giriş Yap
            </Link>
            <Link href="/register" className={buttonVariants({ size: 'sm', className: 'w-full' })}>
              Ücretsiz Başla
            </Link>
          </div>
        </div>
      )}
    </header>
  )
}
