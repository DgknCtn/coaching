'use client'

import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

// YAPIŞKAN KATEGORİ ÇUBUĞU (PRD §9.2): kategoriye atla, başa dön. Görünür
// bölüm IntersectionObserver ile vurgulanır; yatay kaydırılır (mobil).

export function FeatureCategoryNav({ items }: { items: { slug: string; name: string }[] }) {
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    // Görünür kategoriler kümesi: hiçbiri görünmüyorsa (iş akışı, fiyat…)
    // vurgu kalkar; eskiden son görülen kategori yanlışlıkla vurgulu kalıyordu.
    const visible = new Set<string>()
    const order = items.map(i => i.slug)
    const io = new IntersectionObserver(
      entries => {
        for (const e of entries) {
          if (e.isIntersecting) visible.add(e.target.id)
          else visible.delete(e.target.id)
        }
        setActive(order.find(slug => visible.has(slug)) ?? null)
      },
      { rootMargin: '-120px 0px -60% 0px' }
    )
    for (const it of items) {
      const el = document.getElementById(it.slug)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [items])

  return (
    <nav
      aria-label="Özellik kategorileri"
      className="sticky top-16 z-30 border-y bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-6">
        <ul className="-mx-2 flex flex-1 gap-1 overflow-x-auto px-2 py-2">
          {items.map(it => (
            <li key={it.slug} className="shrink-0">
              <a
                href={`#${it.slug}`}
                aria-current={active === it.slug ? 'location' : undefined}
                className={cn(
                  'inline-block rounded-full px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-primary',
                  active === it.slug ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                {it.name}
              </a>
            </li>
          ))}
        </ul>
        <a
          href="#top"
          aria-label="Başa dön"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary"
        >
          <ArrowUp className="size-4" />
        </a>
      </div>
    </nav>
  )
}
