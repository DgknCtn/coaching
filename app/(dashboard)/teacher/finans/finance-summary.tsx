import { formatKurus } from '@/lib/billing/pricing'
import type { FinanceTotals } from '@/lib/finance'
import { cn } from '@/lib/utils'

// ÖZET KUTULARI.
//
// DÖRT RAKAM, DÖRT AYRI SORU:
//   Toplam Alacak  → "ne kadar para tahsil edeceğim"   (yalnız borçlular)
//   Toplam Tahsilat→ "ne kadar para aldım"
//   Toplam Tahakkuk→ "ne kadar hizmet verdim"
//   Net Bakiye     → "defterin net durumu"             (tahakkuk − tahsilat)
//
// ALACAK İLE NET BAKİYE AYRI DURUYOR ve bu bilinçli: fazla ödeme yapan
// bir öğrenci net bakiyeyi düşürür ama kimsenin borcunu azaltmaz. Tek
// rakam göstermek, tahsil edilecek parayı olduğundan az gösterirdi.

interface Tile {
  label: string
  value: string
  hint: string
  tone?: 'danger' | 'success' | 'neutral'
}

export function FinanceSummary({ totals }: { totals: FinanceTotals }) {
  const tiles: Tile[] = [
    {
      label: 'Toplam Alacak',
      value: formatKurus(totals.receivableKurus),
      hint: `${totals.debtorCount} borçlu öğrenci`,
      // Alacak KIRMIZI değil çünkü kötü bir şey değil; ama dikkat
      // çekmesi gereken tek rakam bu, çünkü eylem gerektiren tek rakam o.
      tone: totals.receivableKurus > 0 ? 'danger' : 'neutral',
    },
    {
      label: 'Toplam Tahsilat',
      value: formatKurus(totals.collectedKurus),
      hint: 'Tüm zamanlar',
      tone: 'success',
    },
    {
      label: 'Toplam Tahakkuk',
      value: formatKurus(totals.accruedKurus),
      hint:
        totals.unpricedCount > 0
          ? `${totals.unpricedCount} öğrencinin ücreti tanımsız`
          : 'Yapılan derslerin toplamı',
    },
    {
      label: 'Net Bakiye',
      value: formatKurus(totals.netKurus),
      hint: 'Tahakkuk − Tahsilat',
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((tile) => (
        <div key={tile.label} className="rounded-lg border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tile.label}
          </p>
          <p
            className={cn(
              'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
              tile.tone === 'danger' && 'text-destructive-foreground',
              tile.tone === 'success' && 'text-success-foreground'
            )}
          >
            {tile.value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{tile.hint}</p>
        </div>
      ))}
    </div>
  )
}
