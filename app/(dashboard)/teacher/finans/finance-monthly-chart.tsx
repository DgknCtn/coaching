import { formatKurusShort } from '@/lib/billing/pricing'

// AYLIK TAHAKKUK / TAHSİLAT GRAFİĞİ.
//
// ============================================================
// KÜTÜPHANE YOK — İKİ ÇUBUK, SAF CSS
//
// Altı ay × iki seri için bir grafik kütüphanesi yüklemek, sayfaya
// yüzlerce kilobayt eklemek demek. Yükseklikler yüzdeyle veriliyor;
// tarayıcı zaten bunu ölçeklemekte iyi.
//
// İKİ SERİ YAN YANA, ÜST ÜSTE DEĞİL: yığılmış çubuk "ne kadar hizmet
// verdim" ile "ne kadar tahsil ettim" arasındaki FARKI okunmaz kılar —
// oysa bu ekranın tek sorusu o fark.
//
// ORTAK ÖLÇEK: iki seri de aynı en büyük değere göre ölçekleniyor.
// Ayrı ölçek, tahsilatı tahakkukla eşit yükseklikte gösterip "her şey
// tahsil edilmiş" izlenimi verirdi.
// ============================================================

export interface MonthlyPoint {
  /** Ayın ilk günü (ISO tarih). */
  monthStart: string
  accruedKurus: number
  collectedKurus: number
}

const MONTHS_TR = [
  'Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz',
  'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara',
]

function monthLabel(iso: string): string {
  // `new Date(iso)` yerine elle ayrıştırma: "2026-09-01" UTC olarak
  // yorumlanıp yerel saatte 31 Ağustos'a düşebiliyor ve grafik bir ay
  // kaymış görünüyordu.
  const [, month] = iso.split('-')
  return MONTHS_TR[Number(month) - 1] ?? iso
}

export function FinanceMonthlyChart({ points }: { points: MonthlyPoint[] }) {
  const max = Math.max(
    1,
    ...points.map((p) => Math.max(p.accruedKurus, p.collectedKurus))
  )

  const hasData = points.some((p) => p.accruedKurus > 0 || p.collectedKurus > 0)

  if (!hasData) {
    return (
      <div className="flex h-48 flex-col items-center justify-center text-center">
        <p className="text-sm font-medium">Henüz veri yok</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">
          Ders ve ödeme kayıtları girildikçe aylık gelir eğiliminiz burada görünür.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-end justify-between gap-2" style={{ height: 176 }}>
        {points.map((p) => (
          <div key={p.monthStart} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <div className="flex h-full w-full items-end justify-center gap-1">
              <div
                className="w-1/3 rounded-t-sm bg-primary/70"
                style={{ height: `${(p.accruedKurus / max) * 100}%` }}
                title={`Tahakkuk: ${formatKurusShort(p.accruedKurus)}`}
              />
              <div
                className="w-1/3 rounded-t-sm bg-success"
                style={{ height: `${(p.collectedKurus / max) * 100}%` }}
                title={`Tahsilat: ${formatKurusShort(p.collectedKurus)}`}
              />
            </div>
            <span className="text-[11px] text-muted-foreground">{monthLabel(p.monthStart)}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary/70" aria-hidden />
          Tahakkuk
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-success" aria-hidden />
          Tahsilat
        </span>
        <span className="ml-auto tabular-nums">en yüksek: {formatKurusShort(max)}</span>
      </div>
    </div>
  )
}
