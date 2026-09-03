'use client'

import { X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { cn } from '@/lib/utils'

// Seçili kayıt detay paneli (Müfredat Akışı ve Koruma Havuzu).
//
// Neden ortak bileşen: iki ekranda da aynı iş yapılıyor — listede bir satır
// seçiliyor, sağda o satırın alan/değer dökümü ve birincil eylemleri
// gösteriliyor. İki ayrı kopya yazılsaydı boşluklar, sticky davranışı ve
// mobil karşılığı ayrışırdı.
//
// MASAÜSTÜ / MOBİL AYRIMI: geniş ekranda panel sağ kolonda sticky durur.
// `lg` altında sağ kolon kavramı yok — panel alttan açılan drawer'a döner
// (mevcut components/ui/drawer). İçerik TEK yerde yazılır, iki kez değil.
//
// Panel VERİ DEĞİŞTİRMEZ: yalnız gösterir ve çağıranın verdiği eylemleri
// render eder. Seçim durumu çağıranda kalır.

export interface DetailRow {
  label: string
  value: React.ReactNode
}

interface Props {
  /** Panel başlığı — genelde seçili konunun/kaydın adı. */
  title: string
  /** Başlığın yanındaki durum rozeti. */
  badge?: { label: string; variant?: React.ComponentProps<typeof Badge>['variant'] }
  rows: DetailRow[]
  /** Alt aksiyon alanı: birincil/ikincil butonlar. */
  actions?: React.ReactNode
  /** Ek serbest içerik (rows ile actions arasına girer). */
  children?: React.ReactNode
  onClose: () => void
  className?: string
}

export function DetailPanel({ title, badge, rows, actions, children, onClose, className }: Props) {
  const body = (
    <div className="space-y-4">
      <dl className="space-y-2.5">
        {rows.map(row => (
          <div key={row.label} className="flex items-start justify-between gap-3 text-sm">
            <dt className="shrink-0 text-xs text-muted-foreground">{row.label}</dt>
            <dd className="min-w-0 text-right">{row.value}</dd>
          </div>
        ))}
      </dl>

      {children}

      {actions && <div className="flex flex-col gap-2">{actions}</div>}
    </div>
  )

  return (
    <>
      {/* Masaüstü: sağ kolonda sticky kart. */}
      <aside
        className={cn(
          'hidden lg:sticky lg:top-6 lg:block lg:self-start',
          className
        )}
      >
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <h2 className="truncate text-sm font-semibold">{title}</h2>
              {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Detay panelini kapat"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted"
            >
              <X className="size-4" />
            </button>
          </div>
          {body}
        </div>
      </aside>

      {/* Mobil: alttan açılan drawer. */}
      <Drawer open onOpenChange={open => !open && onClose()}>
        <DrawerContent className="lg:hidden">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2">
              <span className="truncate">{title}</span>
              {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
            </DrawerTitle>
          </DrawerHeader>
          <div className="px-4 pb-6">{body}</div>
        </DrawerContent>
      </Drawer>
    </>
  )
}
