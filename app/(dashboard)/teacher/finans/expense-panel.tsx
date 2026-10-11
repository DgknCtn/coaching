'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Receipt, Trash2 } from 'lucide-react'
import { formatKurus } from '@/lib/billing/pricing'
import { parseLiraToKurus } from '@/lib/finance'
import { todayDateString } from '@/lib/homework-status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Section } from '@/components/shared/section'
import { EmptyState } from '@/components/shared/empty-state'
import { addExpenseAction, deleteFinanceEntryAction } from './actions'
import { EXPENSE_CATEGORY_LABEL, type ExpenseRow } from './data'

/**
 * GİDERLER (M1.0-02 §8).
 *
 * Dört tür: sabit (yazılım, sunucu), öğrenciye bağlı (materyal), oturuma
 * bağlı (yüz yüze ders yol gideri), tahsilata bağlı kesinti (banka,
 * vergi). Otomatik gider kuralı ("yüz yüze oturum Yapıldı → 350 TL yol")
 * P1; şimdilik elle.
 */
export function ExpensePanel({
  month,
  monthLabel,
  expenses,
  students,
  defaultStudentId,
}: {
  month: string
  monthLabel: string
  expenses: (ExpenseRow & { studentName: string | null })[]
  students: { id: string; name: string }[]
  /** Öğrenci detayından açıldığında seçili gelir. */
  defaultStudentId?: string
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState<ExpenseRow['category']>(defaultStudentId ? 'ogrenci' : 'sabit')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(() => {
    const t = todayDateString()
    return t.startsWith(month) ? t : `${month}-01`
  })
  const [studentId, setStudentId] = useState(defaultStudentId ?? '')
  const [note, setNote] = useState('')

  const needsStudent = category === 'ogrenci' || category === 'oturum'
  const total = expenses.reduce((s, e) => s + e.amountKurus, 0)

  function submit() {
    const kurus = parseLiraToKurus(amount)
    if (kurus === null || kurus <= 0) {
      toast.error('Geçerli bir tutar girin.')
      return
    }
    startTransition(async () => {
      const r = await addExpenseAction({
        category,
        amountKurus: kurus,
        spentOn: date,
        studentId: needsStudent || studentId ? studentId : null,
        note,
      })
      if (r.error) {
        toast.error(r.error)
        return
      }
      toast.success('Gider eklendi.')
      setAmount('')
      setNote('')
      setOpen(false)
      router.refresh()
    })
  }

  function remove(id: string) {
    if (!window.confirm('Gider kaydı silinsin mi?')) return
    startTransition(async () => {
      const r = await deleteFinanceEntryAction('expense', id)
      if (r.error) toast.error(r.error)
      else {
        toast.success('Gider silindi.')
        router.refresh()
      }
    })
  }

  return (
    <Section
      title={`${monthLabel} giderleri`}
      description={expenses.length > 0 ? `Toplam ${formatKurus(total)}` : undefined}
      variant="card"
      action={
        !open && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            <Plus className="size-4" />
            Gider ekle
          </Button>
        )
      }
    >
      {open && (
        <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="expCat">Tür</Label>
              <NativeSelect
                id="expCat"
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseRow['category'])}
              >
                {(Object.keys(EXPENSE_CATEGORY_LABEL) as ExpenseRow['category'][]).map((c) => (
                  <option key={c} value={c}>
                    {EXPENSE_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expAmount">Tutar (TL)</Label>
              <Input id="expAmount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="350" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expDate">Tarih</Label>
              <Input id="expDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expStudent">Öğrenci {needsStudent ? '' : '(isteğe bağlı)'}</Label>
              <NativeSelect id="expStudent" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">—</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="expNote">Açıklama</Label>
            <Input id="expNote" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. Yol gideri" />
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={isPending} onClick={submit}>
              Kaydet
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}

      {expenses.length === 0 ? (
        <EmptyState icon={Receipt} title="Bu ay gider yok" description="Yazılım, yol, materyal ya da banka/vergi kesintilerini buraya girin." />
      ) : (
        <ul className="divide-y text-sm">
          {expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate">
                  {e.note ?? EXPENSE_CATEGORY_LABEL[e.category]}
                  {e.studentName && <span className="text-muted-foreground"> · {e.studentName}</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  {e.date.split('-').reverse().join('.')} · {EXPENSE_CATEGORY_LABEL[e.category]}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="font-medium tabular-nums">−{formatKurus(e.amountKurus)}</span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Gideri sil"
                  disabled={isPending}
                  onClick={() => remove(e.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
