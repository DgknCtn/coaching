'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { approveSelectedItemsAction } from './actions'
import { Button } from '@/components/ui/button'
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { formatUnitCount } from '@/lib/unit-labels'
import { formatRelativeTime } from '@/lib/student-attention'

// Toplu onay (R3 v2 §E + R6-08).
//
// R3 v2 bu şeridi "100 test için 100 tıklama" yükünü kaldırmak için ekledi
// ve işe yaradı; ama gruba basmak 35 çalışmayı İÇERİK GÖRÜLMEDEN anında
// onaylıyordu. R6-08 araya bir gözden geçirme adımı koyuyor:
//
//   gruba bas -> sağ drawer açılır -> hepsi seçili gelir -> eğitmen
//   bazılarını çıkarır -> onaylar
//
// Hız korunur (tek tıkla hepsi seçili), görünürlük kazanılır. Drawer
// kapatılırsa HİÇBİR veri değişmez (kabul #54).

export interface ApprovalGroupItem {
  id: string
  sectionTitle: string | null
  unitTitle: string | null
  submittedAt: string | null
}

export interface ApprovalGroup {
  key: string
  batchId: string
  bookId: string | null
  batchTitle: string | null
  dueDate: string | null
  studentName: string
  bookTitle: string
  /** Birim etiketi için (R6-01): sayfa kaynağında "12 sayfa onaylandı". */
  trackingMode: string
  count: number
  items: ApprovalGroupItem[]
}

export function BulkApprovalBar({ groups }: { groups: ApprovalGroup[] }) {
  const [done, setDone] = useState<Set<string>>(new Set())
  const [active, setActive] = useState<ApprovalGroup | null>(null)

  const visible = groups.filter(g => g.count > 1 && !done.has(g.key))

  if (visible.length === 0) return null

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">
        Kitap/ödev grubu bazında toplu onay. Gruba tıkladığınızda çalışmalar
        onaylanmadan önce listelenir. Tek tek onay/red için aşağıdaki listeyi kullanın.
      </p>
      <div className="flex flex-wrap gap-2">
        {visible.map(group => (
          <Button
            key={group.key}
            size="xs"
            variant="outline"
            onClick={() => setActive(group)}
          >
            <Check className="size-3.5" />
            {group.studentName} · {group.bookTitle}
            <span className="tabular-nums">({group.count})</span>
          </Button>
        ))}
      </div>

      {active && (
        <ApprovalDrawer
          group={active}
          onClose={() => setActive(null)}
          onApproved={() => {
            setDone(prev => new Set(prev).add(active.key))
            setActive(null)
          }}
        />
      )}
    </div>
  )
}

function ApprovalDrawer({
  group,
  onClose,
  onApproved,
}: {
  group: ApprovalGroup
  onClose: () => void
  onApproved: () => void
}) {
  // Hepsi VARSAYILAN OLARAK SEÇİLİ gelir: yaygın durum "hepsini onayla"dır,
  // eğitmen yalnız istisnaları çıkarır.
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    setExcluded(new Set())
  }, [group.key])

  const selectedIds = useMemo(
    () => group.items.filter(i => !excluded.has(i.id)).map(i => i.id),
    [group, excluded]
  )

  function toggle(id: string) {
    setExcluded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function approve() {
    if (selectedIds.length === 0) return
    startTransition(async () => {
      const result = await approveSelectedItemsAction(selectedIds)
      if (result.error) {
        toast.error(result.error)
        return
      }
      toast.success(
        `${group.studentName} · ${group.bookTitle}: ` +
          `${formatUnitCount(result.approved ?? selectedIds.length, group.trackingMode)} onaylandı.`
      )
      onApproved()
    })
  }

  return (
    <Drawer
      open
      onOpenChange={(open: boolean) => {
        // Kapatmak hiçbir şey onaylamaz.
        if (!open && !isPending) onClose()
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{group.studentName}</DrawerTitle>
          <DrawerDescription>
            {group.bookTitle}
            {group.batchTitle && ` · ${group.batchTitle}`}
            {group.dueDate && ` · Teslim: ${new Date(group.dueDate).toLocaleDateString('tr-TR')}`}
          </DrawerDescription>
        </DrawerHeader>

        <DrawerBody>
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {group.count} çalışma · {selectedIds.length} seçili
            </p>
            <Button
              size="xs"
              variant="ghost"
              disabled={isPending}
              onClick={() =>
                setExcluded(prev =>
                  prev.size === 0 ? new Set(group.items.map(i => i.id)) : new Set()
                )
              }
            >
              {excluded.size === 0 ? 'Tümünü kaldır' : 'Tümünü seç'}
            </Button>
          </div>

          <ul className="divide-y rounded-lg border">
            {group.items.map(item => {
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
                      <span className="block truncate">{item.unitTitle ?? 'Çalışma'}</span>
                      {item.sectionTitle && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.sectionTitle}
                        </span>
                      )}
                    </span>
                    {item.submittedAt && (
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatRelativeTime(item.submittedAt)}
                      </span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </DrawerBody>

        <DrawerFooter>
          <Button onClick={approve} disabled={isPending || selectedIds.length === 0}>
            {isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {selectedIds.length} çalışmayı onayla
          </Button>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}
