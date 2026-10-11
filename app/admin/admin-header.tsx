'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ChevronDown, Menu, ShieldCheck, X } from 'lucide-react'
import { activeAdminLink, adminNavSections, type AdminNavSection } from '@/components/nav-config'
import { BrandMark } from '@/components/shared/brand-mark'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BRAND } from '@/lib/brand'
import { cn } from '@/lib/utils'

/**
 * YÖNETİM BAŞLIĞI.
 *
 * İKİ SATIR, İKİ SORU:
 *   1. satır — "hangi bölümdeyim?" Marka, beş bölüm, hesap.
 *   2. satır — "bu bölümün hangi sayfasındayım?" Yalnız aktif bölümün
 *      sayfaları, sekme olarak.
 * Bölüm açılır menüsü yine var (her sayfaya iki tıkla ulaşılır), ama
 * yönetici çoğu zaman aynı bölüm içinde gezer; o gezinme tek tık kalır.
 *
 * MOBİL: bölümler yatay sığmıyor; sağdaki menü düğmesi tüm sayfaları
 * gruplu bir liste olarak açar. Sayfa değişince kendiliğinden kapanır.
 */
export function AdminHeader({ email }: { email: string | null }) {
  const pathname = usePathname()
  const active = activeAdminLink(pathname)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => setMobileOpen(false), [pathname])

  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link href="/admin" className="flex shrink-0 items-center gap-2.5" aria-label={`${BRAND.name} Yönetim — Genel Bakış`}>
          <BrandMark size={28} />
          <span className="text-sm font-semibold tracking-tight">{BRAND.name}</span>
          <span className="hidden items-center gap-1 rounded-md border bg-muted/60 px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground sm:inline-flex">
            <ShieldCheck className="size-3" aria-hidden />
            Yönetim
          </span>
        </Link>

        <nav aria-label="Yönetim bölümleri" className="ml-4 hidden items-center gap-0.5 lg:flex">
          {adminNavSections.map((section) => (
            <SectionButton key={section.id} section={section} active={active?.section.id === section.id} />
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          {email && (
            <span className="hidden max-w-48 truncate text-xs text-muted-foreground xl:inline" title={email}>
              {email}
            </span>
          )}
          <ThemeToggle className="px-2" />
          <Button size="sm" variant="outline" className="hidden sm:inline-flex" nativeButton={false} render={<Link href="/teacher" />}>
            <ArrowLeft className="size-4" />
            Koç paneli
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            className="lg:hidden"
            aria-label={mobileOpen ? 'Menüyü kapat' : 'Menüyü aç'}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
          >
            {mobileOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </Button>
        </div>
      </div>

      {/* 2. satır: aktif bölümün sayfaları. Tek sayfalı bölümde gereksiz. */}
      {active && active.section.items.length > 1 && !mobileOpen && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <nav aria-label={`${active.section.label} sayfaları`} className="-mb-px flex gap-1 overflow-x-auto">
            {active.section.items.map((item) => {
              const isActive = item.href === active.link.href
              const Icon = item.icon
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors',
                    isActive
                      ? 'border-primary font-medium text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}

      {mobileOpen && (
        <nav aria-label="Yönetim menüsü" className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t bg-card px-4 pb-4 lg:hidden">
          {adminNavSections.map((section) => (
            <div key={section.id} className="pt-3">
              <p className="px-2 pb-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {section.label}
              </p>
              <ul>
                {section.items.map((item) => {
                  const isActive = active?.link.href === item.href
                  const Icon = item.icon
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={isActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-md px-2 py-2 text-sm',
                          isActive ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                        )}
                      >
                        <Icon className="size-4" aria-hidden />
                        {item.label}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <Link
            href="/teacher"
            className="mt-3 flex items-center gap-2 rounded-md border px-2 py-2 text-sm text-muted-foreground hover:text-foreground sm:hidden"
          >
            <ArrowLeft className="size-4" />
            Koç paneline dön
          </Link>
        </nav>
      )}
    </header>
  )
}

function SectionButton({ section, active }: { section: AdminNavSection; active: boolean }) {
  const Icon = section.icon
  const base = cn(
    'flex h-9 items-center gap-1.5 rounded-md px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
    active ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
  )

  // Tek sayfalı bölüm doğrudan bağlantı.
  if (section.items.length === 1) {
    const only = section.items[0]
    return (
      <Link href={only.href} aria-current={active ? 'page' : undefined} className={base}>
        <Icon className="size-4" aria-hidden />
        {section.label}
      </Link>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={base} aria-current={active ? 'true' : undefined}>
        <Icon className="size-4" aria-hidden />
        {section.label}
        <ChevronDown className="size-3.5 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1">
        {section.items.map((item) => {
          const ItemIcon = item.icon
          return (
            <DropdownMenuItem key={item.href} render={<Link href={item.href} />} className="items-start gap-3 py-2">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-muted/50">
                <ItemIcon className="size-3.5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground">{item.label}</span>
                <span className="block text-xs text-muted-foreground">{item.description}</span>
              </span>
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
