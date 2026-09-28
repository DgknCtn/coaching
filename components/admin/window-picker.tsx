import Link from 'next/link'
import { cn } from '@/lib/utils'

// ZAMAN PENCERESİ — yönetim sayfalarının ortak filtresi (dataviz: tek satır,
// grafiklerin üstünde, tarih aralığı önce; hazır seçenekler).
// URL'de ?gun= (ya da `param`) — paylaşılabilir, geri tuşu çalışır.
// Geçersiz değer varsayılana düşer.

export const WINDOW_OPTIONS = [7, 30, 90, 365] as const

export function parseWindow(
  value: string | undefined,
  fallback = 30,
  options: readonly number[] = WINDOW_OPTIONS
): number {
  const n = Number(value)
  return options.includes(n) ? n : fallback
}

function dayLabel(d: number) {
  return d === 365 ? '1 yıl' : `${d} gün`
}

export function WindowPicker({
  basePath,
  value,
  extra,
  param = 'gun',
  options = WINDOW_OPTIONS,
  label = dayLabel,
}: {
  basePath: string
  value: number
  /** Korunacak diğer sorgu parametreleri. */
  extra?: Record<string, string | undefined>
  param?: string
  options?: readonly number[]
  label?: (n: number) => string
}) {
  function href(n: number) {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(extra ?? {})) if (v) params.set(k, v)
    params.set(param, String(n))
    return `${basePath}?${params.toString()}`
  }
  return (
    <nav aria-label="Zaman aralığı" className="flex flex-wrap gap-1.5 text-sm">
      {options.map((n) => (
        <Link
          key={n}
          href={href(n)}
          aria-current={n === value ? 'page' : undefined}
          className={cn(
            'rounded-md border px-3 py-1 transition-colors',
            n === value
              ? 'border-primary bg-primary/10 font-medium text-foreground'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          )}
        >
          {label(n)}
        </Link>
      ))}
    </nav>
  )
}
