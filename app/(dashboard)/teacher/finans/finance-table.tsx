'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { BadgeTurkishLira, CalendarPlus, History, Search, Tag, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Section } from '@/components/shared/section'
import { formatKurus } from '@/lib/billing/pricing'
import {
  balanceState,
  filterFinanceRows,
  kurusToInput,
  parseLiraToKurus,
  paymentMethodLabel,
  FINANCE_FILTER_LABEL,
  PAYMENT_METHODS,
  type FinanceFilter,
  type StudentFinanceRow,
} from '@/lib/finance'
import { formatDateTr } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  addLessonAction,
  addPaymentAction,
  deleteFinanceEntryAction,
  listStudentEntriesAction,
  setStudentFeeAction,
  type FinanceEntry,
} from './actions'

// ÖĞRENCİ BAZINDA TAKİP.
//
// ============================================================
// SÜZME VE ARAMA İSTEMCİDE
//
// Liste en fazla 500 satır ve zaten tamamı sunucudan indi. Her arama
// harfinde sunucuya gitmek, hiçbir şey kazandırmadan yazmayı
// takılmalı hâle getirirdi.
//
// ÜÇ EYLEM, TEK SATIRDA: ücret tanımla, ders ekle, tahsilat ekle.
// Öğretmenin bu ekranda yaptığı iş bunlar; her biri için ayrı bir
// sayfaya gitmek, bir ayın kayıtlarını girmeyi onlarca gezinmeye
// çevirirdi.
//
// DERS EKLE, ÜCRETSİZ ÖĞRENCİDE KAPALI: sunucu zaten reddediyor
// (066'daki RPC "önce ücret tanımlayın" diyor). Düğmeyi kapatmak,
// kullanıcıyı reddedilecek bir işe girişmekten kurtarıyor.
// ============================================================

const FILTERS: FinanceFilter[] = ['all', 'debtor', 'credit', 'unpriced']

/** Bugünün tarihi, YEREL saatle. `toISOString()` UTC'ye çevirip
 *  Türkiye'de akşam 21:00'den sonra ertesi günü yazardı. */
function today(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

type DialogKind = 'fee' | 'lesson' | 'payment' | 'history'

export function FinanceTable({ rows }: { rows: StudentFinanceRow[] }) {
  const [filter, setFilter] = useState<FinanceFilter>('all')
  const [query, setQuery] = useState('')
  const [active, setActive] = useState<{ row: StudentFinanceRow; kind: DialogKind } | null>(null)

  const visible = useMemo(() => filterFinanceRows(rows, filter, query), [rows, filter, query])

  return (
    <Section
      title="Öğrenci Bazında Takip"
      description={`${visible.length} öğrenci listeleniyor`}
      variant="card"
      contentClassName="p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Öğrenci ara…"
            aria-label="Öğrenci ara"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Button
              key={f}
              type="button"
              size="sm"
              variant={filter === f ? 'default' : 'outline'}
              onClick={() => setFilter(f)}
              aria-pressed={filter === f}
            >
              {FINANCE_FILTER_LABEL[f]}
            </Button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Bu süzgeçle eşleşen öğrenci yok.
        </p>
      ) : (
        <ul className="mt-4 divide-y">
          {visible.map((row) => {
            const state = balanceState(row.balanceKurus)
            return (
              <li key={row.studentId} className="py-3">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0">
                    <Link
                      href={`/teacher/students/${row.studentId}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {row.fullName}
                    </Link>
                    {row.status === 'archived' && (
                      <span className="ml-2 text-xs text-muted-foreground">arşivde</span>
                    )}

                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.perLessonKurus === null ? (
                        // Ücreti olmayan öğrenci sessizce hiç tahakkuk
                        // etmez; bunu söylemek, ayın sonunda eksik çıkan
                        // rakamı açıklamaktan iyidir.
                        <span className="text-warning-foreground">Ders ücreti tanımsız</span>
                      ) : (
                        <>
                          {formatKurus(row.perLessonKurus)} / ders · {row.lessonCount} ders
                        </>
                      )}
                      {row.lastPaymentOn && ` · son ödeme ${formatDateTr(row.lastPaymentOn)}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p
                        className={cn(
                          'text-sm font-medium tabular-nums',
                          state === 'debt' && 'text-destructive-foreground',
                          state === 'credit' && 'text-success-foreground'
                        )}
                      >
                        {state === 'settled' ? 'Kapalı' : formatKurus(Math.abs(row.balanceKurus))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {state === 'debt'
                          ? 'borç'
                          : state === 'credit'
                            ? 'fazla ödeme'
                            : 'bakiye'}
                      </p>
                    </div>

                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Ders ücreti"
                        aria-label={`${row.fullName} — ders ücreti tanımla`}
                        onClick={() => setActive({ row, kind: 'fee' })}
                      >
                        <Tag />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title={
                          row.perLessonKurus === null
                            ? 'Önce ders ücreti tanımlayın'
                            : 'Ders ekle'
                        }
                        aria-label={`${row.fullName} — ders ekle`}
                        disabled={row.perLessonKurus === null}
                        onClick={() => setActive({ row, kind: 'lesson' })}
                      >
                        <CalendarPlus />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Tahsilat ekle"
                        aria-label={`${row.fullName} — tahsilat ekle`}
                        onClick={() => setActive({ row, kind: 'payment' })}
                      >
                        <BadgeTurkishLira />
                      </Button>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        title="Hareketler"
                        aria-label={`${row.fullName} — hareket dökümü`}
                        onClick={() => setActive({ row, kind: 'history' })}
                      >
                        <History />
                      </Button>
                    </div>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {active &&
        (active.kind === 'history' ? (
          <HistoryDialog row={active.row} onClose={() => setActive(null)} />
        ) : (
          <EntryDialog row={active.row} kind={active.kind} onClose={() => setActive(null)} />
        ))}
    </Section>
  )
}

/**
 * Üç işi de gören tek diyalog.
 *
 * Üç ayrı bileşen yazmak, açılış/kapanış/hata/bekleme mantığını üç kez
 * kopyalamak olurdu; aralarındaki fark yalnız birkaç alan.
 */
function EntryDialog({
  row,
  kind,
  onClose,
}: {
  row: StudentFinanceRow
  kind: Exclude<DialogKind, 'history'>
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [amount, setAmount] = useState(
    kind === 'fee' && row.perLessonKurus !== null
      ? kurusToInput(row.perLessonKurus)
      : kind === 'payment' && row.balanceKurus > 0
        ? // BORÇ KADAR ÖNERİLİR: tahsilatın ezici çoğunluğu borcun
          // tamamının kapatılması. Öneri, değiştirilebilir bir başlangıç.
          kurusToInput(row.balanceKurus)
        : ''
  )
  const [date, setDate] = useState(today())
  const [quantity, setQuantity] = useState('1')
  const [method, setMethod] = useState<string>('nakit')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const titles: Record<Exclude<DialogKind, 'history'>, string> = {
    fee: 'Ders ücreti',
    lesson: 'Ders ekle',
    payment: 'Tahsilat ekle',
  }

  const descriptions: Record<Exclude<DialogKind, 'history'>, string> = {
    fee: 'Bu ücret yalnız BUNDAN SONRAKİ derslere uygulanır; girilmiş dersler eski ücretiyle kalır.',
    lesson: `Her ders, tanımlı ücret kadar borç doğurur (${
      row.perLessonKurus !== null ? formatKurus(row.perLessonKurus) : '—'
    }).`,
    payment: 'Öğrenciden alınan tutar. Bakiyeden düşülür.',
  }

  function submit() {
    setError(null)

    if (kind === 'fee' || kind === 'payment') {
      const kurus = parseLiraToKurus(amount)
      if (kurus === null) {
        setError('Geçerli bir tutar girin. Örnek: 1500 ya da 1.500,50')
        return
      }
      if (kind === 'payment' && kurus < 1) {
        setError('Tahsilat tutarı sıfırdan büyük olmalı.')
        return
      }

      startTransition(async () => {
        const res =
          kind === 'fee'
            ? await setStudentFeeAction({
                studentId: row.studentId,
                perLessonKurus: kurus,
                note: note || undefined,
              })
            : await addPaymentAction({
                studentId: row.studentId,
                paidOn: date,
                amountKurus: kurus,
                method,
                note: note || undefined,
              })

        if (res.error) {
          setError(res.error)
          return
        }
        toast.success(kind === 'fee' ? 'Ders ücreti güncellendi.' : 'Tahsilat kaydedildi.')
        onClose()
        router.refresh()
      })
      return
    }

    const qty = Number.parseInt(quantity, 10)
    if (!Number.isInteger(qty) || qty < 1 || qty > 20) {
      setError('Ders sayısı 1 ile 20 arasında olmalı.')
      return
    }

    startTransition(async () => {
      const res = await addLessonAction({
        studentId: row.studentId,
        lessonDate: date,
        quantity: qty,
        note: note || undefined,
      })
      if (res.error) {
        setError(res.error)
        return
      }
      toast.success(`${qty} ders kaydedildi.`)
      onClose()
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {titles[kind]} — {row.fullName}
          </DialogTitle>
          <DialogDescription>{descriptions[kind]}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {(kind === 'fee' || kind === 'payment') && (
            <div className="space-y-1.5">
              <Label htmlFor="fin-amount">Tutar (₺)</Label>
              <Input
                id="fin-amount"
                inputMode="decimal"
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="1500"
                className="tabular-nums"
              />
            </div>
          )}

          {kind === 'lesson' && (
            <div className="space-y-1.5">
              <Label htmlFor="fin-qty">Ders sayısı</Label>
              <Input
                id="fin-qty"
                type="number"
                inputMode="numeric"
                min={1}
                max={20}
                autoFocus
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="tabular-nums"
              />
            </div>
          )}

          {kind !== 'fee' && (
            <div className="space-y-1.5">
              <Label htmlFor="fin-date">{kind === 'lesson' ? 'Ders tarihi' : 'Ödeme tarihi'}</Label>
              <Input
                id="fin-date"
                type="date"
                value={date}
                max={today()}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
          )}

          {kind === 'payment' && (
            <div className="space-y-1.5">
              <Label htmlFor="fin-method">Ödeme yöntemi</Label>
              {/* Yerel select: dört seçenek için özel bileşen gereksiz,
                  mobilde yerel seçici her zaman daha kullanışlı. */}
              <select
                id="fin-method"
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {paymentMethodLabel(m)}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="fin-note">Not (isteğe bağlı)</Label>
            <Input
              id="fin-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
            />
          </div>

          {error && (
            <p role="alert" className="text-sm text-destructive-foreground">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={onClose}>
            Vazgeç
          </Button>
          <Button type="button" disabled={pending} onClick={submit}>
            {pending ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


/**
 * HAREKET DÖKÜMÜ — "neden bu kadar borçlu" sorusunun cevabı.
 *
 * SİLME BURADA, ÇÜNKÜ DÜZELTİLEMEYEN DEFTER KULLANILMAZ. Yanlış girilen
 * tek bir ders, bakiyeyi kalıcı olarak bozar; öğretmen bunu
 * düzeltemezse ekrana güvenmeyi bırakır ve kendi Excel'ine döner.
 *
 * ONAY YOK, GERİ ALMA DA YOK: tek satırlık bir kaydı silmek için ikinci
 * bir diyalog açmak, asıl işi (bir ayın kayıtlarını düzeltmek) yorucu
 * kılardı. Silinen satır zaten ekranda duruyordu ve yeniden girmek bir
 * diyalog uzaklıkta.
 */
function HistoryDialog({
  row,
  onClose,
}: {
  row: StudentFinanceRow
  onClose: () => void
}) {
  const router = useRouter()
  const [entries, setEntries] = useState<FinanceEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listStudentEntriesAction(row.studentId)
      if (res.error) {
        setError(res.error)
        return
      }
      setEntries(res.entries ?? [])
    })
  }, [row.studentId])

  useEffect(load, [load])

  function remove(entry: FinanceEntry) {
    startTransition(async () => {
      const res = await deleteFinanceEntryAction(entry.kind, entry.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      // Listeyi yerinde güncelle: yeniden yüklemek, uzun bir dökümde
      // kaydırma konumunu başa atardı.
      setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null)
      toast.success('Kayıt silindi.')
      router.refresh()
    })
  }

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hareketler — {row.fullName}</DialogTitle>
          <DialogDescription>
            Ders ve tahsilat kayıtları, tarihe göre. Yanlış girilen bir kaydı buradan
            silebilirsiniz.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : entries === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Yükleniyor…</p>
        ) : entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Bu öğrenci için henüz kayıt yok.
          </p>
        ) : (
          <ul className="max-h-80 divide-y overflow-y-auto">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm">
                    {entry.kind === 'lesson' ? (
                      <>
                        {entry.quantity} ders
                        <span className="text-muted-foreground"> · tahakkuk</span>
                      </>
                    ) : (
                      <>
                        Tahsilat
                        <span className="text-muted-foreground">
                          {' '}
                          · {paymentMethodLabel(entry.method ?? 'nakit')}
                        </span>
                      </>
                    )}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {formatDateTr(entry.date)}
                    {entry.note && ` · ${entry.note}`}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* İŞARET TUTARIN ÖNÜNDE: aynı sütunda hem borç hem
                      ödeme var; renk tek başına ayırt etmeye yetmez
                      (renk körlüğü) ve + / − işareti her koşulda okunur. */}
                  <span
                    className={cn(
                      'text-sm font-medium tabular-nums',
                      entry.kind === 'lesson'
                        ? 'text-destructive-foreground'
                        : 'text-success-foreground'
                    )}
                  >
                    {entry.kind === 'lesson' ? '+' : '−'}
                    {formatKurus(entry.amountKurus)}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="ghost"
                    disabled={pending}
                    title="Kaydı sil"
                    aria-label="Kaydı sil"
                    onClick={() => remove(entry)}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
