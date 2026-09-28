import Link from 'next/link'
import { cn } from '@/lib/utils'

// ZAMAN PENCERESİ — yönetim sayfalarının ortak filtresi (dataviz: tek satır,
// grafiklerin üstünde, tarih aralığı önce; hazır seçenekler).
// URL'de ?gun= — paylaşılabilir, geri tuşu çalışır. Geçersiz değer varsayılana düşer.

export const WINDOW_OPTIONS = [7, 30, 90, 365] as const

export function parseWindow(value: string | undefined, fallback = 30): number {
  const n = Number(value)
  return (WINDOW_OPTIONS as readonly number[]).includes(n) ? n : fallback
}

export function WindowPicker({
  basePath,
  value,
  extra,
}: {
  basePath: string
  value: number
  /** Korunacak diğer sorgu parametreleri. */
  extra?: Record<string, string | undefined>
}) {
  function href(days: number) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(extra ?? {})) if (v) params.set(k, v)
    params.set('gun', String(days))
    return `${basePath}?${params.toString()}`
  }
  return (
    <nav aria-label="Zaman aralığı" className="flex flex-wrap gap-1.5 text-sm">
      {WINDOW_OPTIONS.map((d) => (
        <Link
          key={d}
          href={href(d)}
          aria-current={d === value ? 'page' : undefined}
          className={cn(
            'rounded-md border px-3 py-1 transition-colors',
            d === value
              ? 'border-primary bg-primary/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {d === 365 ? '1 yıl' : `${d} gün`}
        </Link>
      ))}
    </nav>
  )
}
