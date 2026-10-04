'use client'

import { useMemo, useState, useTransition, type ComponentType } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'

// Sağ panelde toplu çalışma işlemi (R6-08 kalıbı, M1.0-01 §4).
//
// Görevler ekranındaki onay panelinden çıkarıldı; Yayınlanan Ödevler aynı
// kalıbı üç işlemle kullanır. Davranış sözleşmesi:
//
//   - Panel açıldığında BÜTÜN çalışmalar seçili gelir; öğretmen yalnız
//     istisnaları çıkarır.
//   - "Tümünü kaldır / Tümünü seç" tek düğme.
//   - Her işlemin düğme etiketi seçime göre CANLI sayar ("29 çalışmayı
//     onayla"). Sayı, seçili VE o işleme uygun çalışmalardır — onay
//     bekleyen olmayan çalışma "onayla" sayısına girmez.
//   - Kapatmak hiçbir veriyi değiştirmez; istek sürerken kapatılamaz.

export interface BulkDrawerItem {
  id: string
  primary: string
  secondary?: string | null
  meta?: string | null
  /** Satırdaki küçük durum rozeti (ör. "Onay bekliyor"). */
  badge?: { label: string; variant: 'info' | 'warning' | 'neutral' | 'success' } | null
}

export interface BulkDrawerAction {
  key: string
  label: (count: number) => string
  icon?: ComponentType<{ className?: string }>
  variant?: 'default' | 'outline' | 'secondary'
  /** Bu işlem hangi çalışmalara uygulanır. Verilmezse hepsine. */
  eligible?: (itemId: string) => boolean
  /** Verilirse panelde isteğe bağlı bir "neden" alanı açılır. */
  reasonLabel?: string
  run: (
    ids: string[],
    reason?: string
  ) => Promise<{ error?: string; message?: string } | undefined>
}

export function BulkItemDrawer({
  title,
  description,
  items,
  actions,
  footnote,
  onClose,
  onDone,
}: {
  title: string
  description?: string
  items: BulkDrawerItem[]
  actions: BulkDrawerAction[]
  /** Listenin altındaki açıklama (ör. "3 çalışma zaten tamamlandı"). */
  footnote?: string | null
  onClose: () => void
  /** Bir işlem başarıyla bittiğinde (panel kapanır). */
  onDone: (actionKey: string) => void
}) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [reason, setReason] = useState('')
  const [running, setRunning] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const selectedIds = useMemo(
    () => items.filter(i => !excluded.has(i.id)).map(i => i.id),
    [items, excluded]
  )

  const reasonAction = actions.find(a => a.reasonLabel)

  function toggle(id: string) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function eligibleIds(action: BulkDrawerAction) {
    return action.eligible ? selectedIds.filter(action.eligible) : selectedIds
  }

  function run(action: BulkDrawerAction) {
    const ids = eligibleIds(action)
    if (ids.length === 0) return
    setRunning(action.key)
    startTransition(async () => {
      const result = await action.run(ids, action.reasonLabel ? reason.trim() || undefined : undefined)
      setRunning(null)
      if (result?.error) {
        toast.error(result.error)
        return
      }
      if (result?.message) toast.success(result.message)
      onDone(action.key)
    })
  }

  return (
    <Drawer
      open
      onOpenChange={(open: boolean) => {
        if (!open && !isPending) onClose()
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>

        <DrawerBody>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {items.length} çalışma · {selectedIds.length} seçili
            </p>
            <Button
              size="xs"
              variant="ghost"
              disabled={isPending || items.length === 0}
              onClick={() =>
                setExcluded(prev =>
                  prev.size === 0 ? new Set(items.map(i => i.id)) : new Set()
                )
              }
            >
              {excluded.size === 0 ? 'Tümünü kaldır' : 'Tümünü seç'}
            </Button>
          </div>

          <ul className="divide-y rounded-lg border">
            {items.map(item => {
              const checked = !excluded.has(item.id)
              return (
                <li key={item.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-muted/40">
                    <input
                      type="checkbox"
                      className="size-4 shrink-0"
                      checked={checked}
                      disabled={isPending}
                      onChange={() => toggle(item.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{item.primary}</span>
                      {item.secondary && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.secondary}
                        </span>
                      )}
                    </span>
                    {item.badge && (
                      <Badge variant={item.badge.variant} className="shrink-0">
                        {item.badge.label}
                      </Badge>
                    )}
                    {item.meta && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {item.meta}
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>

          {footnote && <p className="mt-2 text-xs text-muted-foreground">{footnote}</p>}

          {reasonAction && (
            <div className="mt-4 space-y-1.5">
              <Label htmlFor="bulk-reason" className="text-xs">
                {reasonAction.reasonLabel}{' '}
                <span className="text-muted-foreground">(isteğe bağlı)</span>
              </Label>
              <Input
                id="bulk-reason"
                maxLength={500}
                value={reason}
                disabled={isPending}
                onChange={e => setReason(e.target.value)}
              />
            </div>
          )}
        </DrawerBody>

        <DrawerFooter>
          {actions.map(action => {
            const count = eligibleIds(action).length
            const Icon = action.icon
            return (
              <Button
                key={action.key}
                variant={action.variant ?? 'default'}
                onClick={() => run(action)}
                disabled={isPending || count === 0}
              >
                {running === action.key ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  Icon && <Icon className="size-4" />
                )}
                {action.label(count)}
              </Button>
            )
          })}
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
