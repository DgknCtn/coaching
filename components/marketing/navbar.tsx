'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { GraduationCap, Menu, X } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
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
          ? 'bg-background/90 backdrop-blur-md border-b border-border/50 shadow-sm'
          : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center shadow-md"
              style={{
                background:
                  'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
              }}
            >
              <GraduationCap className="size-4 text-white" />
            </div>
            <span className="font-black text-lg tracking-tight">KoçTakip</span>
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
            <Link
              href="/demo"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Demo
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <Link href="/login" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
              Giriş Yap
            </Link>
            <Link href="/register" className={buttonVariants({ size: 'sm' })}>
              Ücretsiz Başla
            </Link>
          </div>

          <button
            className="md:hidden p-2 rounded-lg hover:bg-accent transition-colors"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Menü"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden bg-background border-b border-border px-4 pb-4 shadow-lg">
          <nav className="flex flex-col gap-1 pt-2">
            <a
              href="#ozellikler"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 text-sm font-medium hover:bg-accent rounded-lg transition-colors"
            >
              Özellikler
            </a>
            <a
              href="#nasil-calisir"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 text-sm font-medium hover:bg-accent rounded-lg transition-colors"
            >
              Nasıl Çalışır
            </a>
            <Link
              href="/demo"
              onClick={() => setMobileOpen(false)}
              className="px-3 py-2.5 text-sm font-medium hover:bg-accent rounded-lg transition-colors"
            >
              Demo
            </Link>
          </nav>
          <div className="flex flex-col gap-2 mt-3 pt-3 border-t border-border">
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
