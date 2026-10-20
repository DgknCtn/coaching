import Link from 'next/link'
import { BLOG_CATEGORY_OPTIONS, type BlogCategory } from '@/lib/blog-categories'
import { cn } from '@/lib/utils'

// KATEGORİ ŞERİDİ.
//
// SUNUCU BİLEŞENİ, `'use client'` DEĞİL: filtre bir `Link` listesi ve
// durum adresin kendisinde (/blog?kategori=...). Böylece filtrelenmiş
// liste PAYLAŞILABİLİR ve arama motoru tarafından taranabilir bir adres
// oluyor; istemci durumuyla yapılsa adres hiç değişmezdi.
//
// "Tümü" için parametre HİÇ YAZILMIYOR (`/blog`, `/blog?kategori=` değil):
// aynı içeriğin iki adresi olması kopya içerik demek.

export function CategoryFilter({ active }: { active: BlogCategory | null }) {
  const items = [
    { value: null, label: 'Tümü', href: '/blog' },
    ...BLOG_CATEGORY_OPTIONS.map((option) => ({
      value: option.value as BlogCategory | null,
      label: option.label,
      href: `/blog?kategori=${option.value}`,
    })),
  ]

  return (
    // nav + aria-label: ekran okuyucuda "kategori filtresi" olarak
    // duyuruluyor; etiketsiz bir <nav> yalnız "navigasyon" der.
    <nav aria-label="Kategori filtresi" className="flex flex-wrap gap-2">
      {items.map((item) => {
        const selected = item.value === active
        return (
          <Link
            key={item.label}
            href={item.href}
            // aria-current: seçili olanı yalnız renkle değil anlamsal
            // olarak da işaretler (renk tek başına erişilebilir değil).
            aria-current={selected ? 'page' : undefined}
            className={cn(
              'touch-target rounded-sm border px-3 py-1.5 text-sm transition-colors',
              selected
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
            )}
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
