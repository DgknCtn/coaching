'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Copy, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import type { BookMapBook } from '@/lib/book-map'
import { planDisplayTitle, type HomeworkPlanRef } from '@/lib/homework-plan'
import { planContinuation } from '@/lib/plan-copy'
import { formatUnitCount } from '@/lib/unit-labels'
import { copyPlanAction } from './actions'

// PLANI KOPYALA (PRD 10.4 · Faz 2a). Görevler taslak olarak kopyalanır;
// kitaplarda aynı miktarın DEVAMI sepete önerilir. Hiçbir şey yayımlanmaz.

export function PlanCopyControl({
  studentId,
  plans,
  books,
  onAddUnits,
}: {
  studentId: string
  plans: HomeworkPlanRef[]
  books: BookMapBook[]
  onAddUnits: (ids: string[]) => void
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const sorted = [...plans].sort((a, b) => b.planNo - a.planNo)
  const [planId, setPlanId] = useState(sorted[0]?.id ?? '')

  if (sorted.length === 0) return null

  function copy() {
    startTransition(async () => {
      const r = await copyPlanAction(studentId, planId)
      if (r.error) {
        toast.error(r.error)
        return
      }
      const cont = planContinuation(books, r.books ?? [])
      const ids = cont.flatMap(c => c.ids)
      if (ids.length > 0) onAddUnits(ids)

      const parts: string[] = []
      if (r.tasksCopied) parts.push(`${r.tasksCopied} görev taslak olarak eklendi`)
      for (const c of cont) {
        const mode = books.find(b => b.bookId === c.bookId)?.trackingMode
        parts.push(
          c.ids.length === c.asked
            ? `${c.title}: sıradaki ${formatUnitCount(c.ids.length, mode)}`
            : `${c.title}: ${c.asked} istendi, ${c.ids.length} verilebilir birim kaldı`
        )
      }
      const skipped = (r.books?.length ?? 0) - cont.length
      if (skipped > 0) parts.push(`${skipped} kitap artık aktif değil, atlandı`)
      if (parts.length === 0) toast.info('Bu planda kopyalanacak görev ya da kitap çalışması yok.')
      else toast.success(parts.join(' · '))
      router.refresh()
    })
  }

  return (
    <div className="space-y-1.5 rounded-md border border-dashed p-2.5">
      <p className="text-xs font-medium">Önceki plandan kopyala</p>
      <div className="flex items-center gap-1.5">
        <NativeSelect
          aria-label="Kopyalanacak plan"
          value={planId}
          onChange={e => setPlanId(e.target.value)}
          className="min-w-0 flex-1 text-xs"
          disabled={isPending}
        >
          {sorted.slice(0, 12).map(p => (
            <option key={p.id} value={p.id}>
              {planDisplayTitle(p)}
            </option>
          ))}
        </NativeSelect>
        <Button size="sm" variant="outline" disabled={isPending || !planId} onClick={copy}>
          {isPending ? <Loader2 className="animate-spin" /> : <Copy />}
          Kopyala
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Görevler aynen gelir; kitaplarda aynı miktarın devamı seçilir. Yayımlamadan önce düzenleyebilirsiniz.
      </p>
    </div>
  )
}
