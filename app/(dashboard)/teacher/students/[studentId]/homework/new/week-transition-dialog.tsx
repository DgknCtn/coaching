'use client'

import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatSelectedUnits } from '@/lib/book-map'
import { formatSessionLong } from '@/lib/service-structure'
import { flowShortLabel, type FlowRef, type OpenWorkItem } from '@/lib/open-homework'

// HAFTA GEÇİŞİ ONAYI — İz V2 R04.
//
// Planın son teslimi aktif haftanın dışına düşüyorsa (ya da açık hafta
// yoksa) yayın bu pencereden geçer: önceki hafta kapanır, yeni hafta
// açılır, plan yeni haftaya yayınlanır. Aktarılacak açık işler AYRICA
// seçilir; "Gelecek haftaya devret" ile işaretlenenler seçili gelir.
//
// Onaya gönderilmiş (öğrencinin teslim ettiği) iş aktarılmaz: öğrenci işini
// yapmış, öğretmen onayı bekliyor. Listede görünür ama seçilemez.

function unitText(item: OpenWorkItem): string {
  if (item.unitNumber != null && item.trackingMode) {
    const label = formatSelectedUnits([item.unitNumber], item.trackingMode)
    if (label) return label
  }
  return item.unitTitle ?? 'Çalışma'
}

export function WeekTransitionDialog({
  open,
  onOpenChange,
  activeFlowDueAt,
  newDueAt,
  items,
  flows,
  selected,
  onToggle,
  onToggleAll,
  pending,
  onConfirm,
  onPublishWithoutWeek,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Kapanacak haftanın son teslimi; açık hafta yoksa null. */
  activeFlowDueAt: string | null
  newDueAt: Date | null
  items: OpenWorkItem[]
  flows: FlowRef[]
  selected: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[], on: boolean) => void
  pending: boolean
  onConfirm: () => void
  /** Yalnız kitap çalışması varken: eski yol (haftaya bağlamadan). */
  onPublishWithoutWeek: (() => void) | null
}) {
  const flowById = new Map(flows.map(f => [f.id, f]))
  const carryable = items.filter(i => i.status === 'pending')
  const allOn = carryable.length > 0 && carryable.every(i => selected.has(i.id))

  return (
    <Dialog open={open} onOpenChange={next => !pending && onOpenChange(next)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Yeni haftaya yayınla</DialogTitle>
          <DialogDescription>
            {activeFlowDueAt
              ? `Planın son teslimi aktif haftanın kapanışını (${formatSessionLong(activeFlowDueAt)}) aşıyor. Aktif hafta kapanır, sonucu korunur; plan yeni haftaya yayınlanır.`
              : 'Bu öğrencide açık bir çalışma haftası yok. Yeni hafta açılır ve plan o haftaya yayınlanır.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <p className="rounded-md border bg-muted/40 px-3 py-2">
            <span className="font-medium">Yeni hafta · son teslim:</span>{' '}
            {newDueAt ? formatSessionLong(newDueAt.toISOString()) : '—'}
          </p>

          {items.length > 0 ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium">Yeni haftaya aktarılacak açık işler</p>
                {carryable.length > 0 && (
                  <button
                    type="button"
                    className="text-xs text-muted-foreground underline underline-offset-2"
                    onClick={() => onToggleAll(carryable.map(i => i.id), !allOn)}
                  >
                    {allOn ? 'Tümünü kaldır' : 'Tümünü seç'}
                  </button>
                )}
              </div>
              <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                {items.map(item => {
                  const submitted = item.status === 'pending_approval'
                  return (
                    <li key={item.id} className="flex items-start gap-2 px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 shrink-0 accent-primary"
                        checked={!submitted && selected.has(item.id)}
                        disabled={submitted || pending}
                        onChange={() => onToggle(item.id)}
                        aria-label={`${item.bookTitle ?? ''} ${unitText(item)} aktar`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          {[item.sectionTitle, unitText(item)].filter(Boolean).join(' · ')}
                        </p>
                        <p className="truncate text-muted-foreground">
                          {flowShortLabel(item.flowId ? flowById.get(item.flowId) : null)} ·{' '}
                          {item.bookTitle ?? item.batchTitle ?? 'Ödev'}
                        </p>
                      </div>
                      {submitted ? (
                        <Badge variant="info" className="shrink-0">Onaya gönderildi</Badge>
                      ) : item.carryRequested ? (
                        <Badge variant="neutral" className="shrink-0">Devir istendi</Badge>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
              <p className="text-[11px] text-muted-foreground">
                Yalnız teslim edilmemiş iş aktarılır; eski haftanın sonucu değişmez. Seçilmeyen işler
                açık kalır, sonra da devredilebilir.
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">Aktarılacak açık iş yok.</p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {onPublishWithoutWeek ? (
            <Button variant="ghost" size="sm" disabled={pending} onClick={onPublishWithoutWeek}>
              Haftaya bağlamadan yayınla
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={pending} onClick={() => onOpenChange(false)}>
              Vazgeç
            </Button>
            <Button size="sm" disabled={pending || !newDueAt} onClick={onConfirm}>
              {pending && <Loader2 className="animate-spin" />}
              {activeFlowDueAt ? 'Haftayı kapat ve yayınla' : 'Haftayı aç ve yayınla'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
