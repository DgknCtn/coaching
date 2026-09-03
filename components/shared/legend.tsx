import { cn } from '@/lib/utils'

// Genel durum renk açıklaması.
//
// Kitap Haritasının kendi göstergesi var (BookMapLegend, book-map-grid.tsx)
// ve o haritanın altı durumuna sıkı sıkıya bağlı. Bu bileşen ise akış ve
// havuz gibi başka durum kümeleri için: çağıran kendi etiket/renk çiftlerini
// verir.
//
// Renk tek başına anlam taşımaz: her örnek noktanın yanında adı yazar.

export interface LegendEntry {
  label: string
  /** Örnek noktanın Tailwind sınıfı — semantik token kullanın, ham palet değil. */
  className: string
}

export function Legend({
  entries,
  className,
}: {
  entries: LegendEntry[]
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5', className)}>
      {entries.map(entry => (
        <span key={entry.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className={cn('size-2.5 shrink-0 rounded-full', entry.className)} />
          {entry.label}
        </span>
      ))}
    </div>
  )
}
