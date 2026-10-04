'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import { approveSelectedItemsAction } from './actions'
import { Button } from '@/components/ui/button'
import { BulkItemDrawer } from '@/components/shared/bulk-item-drawer'
import { formatDueDateTime } from '@/lib/homework-load'
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
  // Panel davranışı (hepsi seçili gelir, istisna çıkarılır, kapatmak hiçbir
  // şey onaylamaz) ortak bileşende: Yayınlanan Ödevler aynı kalıbı kullanır
  // (M1.0-01 §4).
  return (
    <BulkItemDrawer
      key={group.key}
      title={group.studentName}
      description={[
        group.bookTitle,
        group.batchTitle,
        group.dueDate ? `Teslim: ${formatDueDateTime(group.dueDate)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')}
      items={group.items.map(item => ({
        id: item.id,
        primary: item.unitTitle ?? 'Çalışma',
        secondary: item.sectionTitle,
        meta: item.submittedAt ? formatRelativeTime(item.submittedAt) : null,
      }))}
      actions={[
        {
          key: 'approve',
          label: n => `${n} çalışmayı onayla`,
          icon: Check,
          run: async ids => {
            const result = await approveSelectedItemsAction(ids)
            if (result.error) return { error: result.error }
            return {
              message:
                `${group.studentName} · ${group.bookTitle}: ` +
                `${formatUnitCount(result.approved ?? ids.length, group.trackingMode)} onaylandı.`,
            }
          },
        },
      ]}
      onClose={onClose}
      onDone={onApproved}
    />
  )
}
