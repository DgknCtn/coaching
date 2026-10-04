'use client'

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  BadgeTurkishLira,
  CalendarPlus,
  History,
  Search,
  SearchX,
  Tag,
  Trash2,
} from 'lucide-react'
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
import { EmptyState } from '@/components/shared/empty-state'
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
  deletePaymentNoticeAction,
  deleteStudentFeeAction,
  listStudentEntriesAction,
  purgeStudentFinanceAction,
  setStudentFeeAction,
  type FinanceEntry,
  type PaymentNotice,
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

  const clearFilters = useCallback(() => {
    setFilter('all')
    setQuery('')
  }, [])

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
        // Boş durum diğer listelerle aynı bileşende: çıplak bir cümle,
        // süzgeci nasıl temizleyeceğini söylemeden bırakıyordu.
        <EmptyState
          icon={SearchX}
          title="Eşleşen öğrenci yok"
          description={
            query
              ? 'Arama metnini ya da süzgeci değiştirin.'
              : 'Bu süzgeçle eşleşen öğrenci yok.'
          }
          className="py-10"
          action={{ label: 'Süzgeci temizle', onClick: clearFilters }}
        />
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
                      {/* Silme ve temizlik bu pencerede; simge tek başına
                          bulunmuyordu, bu yüzden yazılı (137). */}
                      <Button
                        type="button"
                        size="xs"
                        variant="outline"
                        title="Kayıtları gör, düzelt ve sil"
                        aria-label={`${row.fullName} — hareketler ve silme`}
                        onClick={() => setActive({ row, kind: 'history' })}
                      >
                        <History />
                        Hareketler
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
const NOTICE_STATUS_LABEL: Record<PaymentNotice['status'], string> = {
  pending: 'Bekliyor',
  confirmed: 'Onaylandı',
  rejected: 'Reddedildi',
}

const monthFmt = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul',
  month: 'long',
  year: 'numeric',
})

/**
 * Öğrencinin finans merkezi: hareket dökümü + temizlik (137).
 *
 * SİLME İKİ ADIMLI: çöp kutusuna basmak satırı "Sil / Vazgeç" onayına
 * çevirir. Önceden tek tık kaydı siliyordu; tutar taşıyan bir satırda bu
 * fazla hızlıydı. İç içe pencere açmak yerine satır içi onay — liste
 * kaydırma konumu korunur.
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
  const [notices, setNotices] = useState<PaymentNotice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [purgeOpen, setPurgeOpen] = useState(false)
  const [purgeName, setPurgeName] = useState('')
  const [pending, startTransition] = useTransition()

  const load = useCallback(() => {
    startTransition(async () => {
      const res = await listStudentEntriesAction(row.studentId)
      if (res.error) {
        setError(res.error)
        return
      }
      setEntries(res.entries ?? [])
      setNotices(res.notices ?? [])
    })
  }, [row.studentId])

  useEffect(load, [load])

  function run(
    task: () => Promise<{ error?: string }>,
    success: string,
    after: () => void
  ) {
    startTransition(async () => {
      const res = await task()
      setConfirming(null)
      if (res.error) {
        toast.error(res.error)
        return
      }
      after()
      toast.success(success)
      router.refresh()
    })
  }

  function removeEntry(entry: FinanceEntry) {
    run(
      () => deleteFinanceEntryAction(entry.kind, entry.id),
      'Kayıt silindi.',
      // Listeyi yerinde güncelle: yeniden yüklemek kaydırma konumunu atar.
      () => setEntries((prev) => prev?.filter((e) => e.id !== entry.id) ?? null)
    )
  }

  function removeNotice(notice: PaymentNotice) {
    run(
      () => deletePaymentNoticeAction(notice.id),
      'Ödeme bildirimi silindi.',
      () => setNotices((prev) => prev.filter((n) => n.id !== notice.id))
    )
  }

  function removeFee() {
    run(() => deleteStudentFeeAction(row.studentId), 'Ders ücreti tanımı kaldırıldı.', () => {})
  }

  function purgeAll() {
    run(
      () => purgeStudentFinanceAction(row.studentId, purgeName.trim()),
      'Öğrencinin tüm finans kayıtları silindi.',
      () => {
        setEntries([])
        setNotices([])
        setPurgeOpen(false)
        setPurgeName('')
      }
    )
  }

  /** Satır içi iki adımlı silme düğmesi. */
  function DeleteControl({ id, onConfirm }: { id: string; onConfirm: () => void }) {
    if (confirming === id) {
      return (
        <span className="flex items-center gap-1">
          <Button type="button" size="xs" variant="destructive" disabled={pending} onClick={onConfirm}>
            Sil
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            disabled={pending}
            onClick={() => setConfirming(null)}
          >
            Vazgeç
          </Button>
        </span>
      )
    }
    return (
      <Button
        type="button"
        size="icon-sm"
        variant="ghost"
        disabled={pending}
        title="Kaydı sil"
        aria-label="Kaydı sil"
        onClick={() => setConfirming(id)}
      >
        <Trash2 />
      </Button>
    )
  }

  const nameMatches = purgeName.trim() === row.fullName.trim()

  return (
    <Dialog open onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Hareketler — {row.fullName}</DialogTitle>
          <DialogDescription>
            Ders ve tahsilat kayıtları, tarihe göre. Yanlış girilen bir kaydı çöp kutusuyla
            silebilirsiniz.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            {error}
          </p>
        ) : entries === null ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Yükleniyor…</p>
        ) : (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto">
            {entries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Bu öğrenci için ders veya tahsilat kaydı yok.
              </p>
            ) : (
              <ul className="divide-y">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm">
                        {entry.kind === 'lesson' ? (
                          <>
                            {entry.quantity} ders
                            <span className="text-muted-foreground"> · tahakkuk</span>
                            {entry.auto && (
                              <span
                                className="text-muted-foreground"
                                title="Görüşmeler'den otomatik. Oturum yeniden kaydedilirse geri yazılabilir; kalıcı çözüm oturumun durumunu düzeltmek."
                              >
                                {' '}
                                · otomatik
                              </span>
                            )}
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
                      {/* İŞARET TUTARIN ÖNÜNDE: renk tek başına ayırt etmeye
                          yetmez (renk körlüğü); + / − her koşulda okunur. */}
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
                      <DeleteControl id={entry.id} onConfirm={() => removeEntry(entry)} />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {notices.length > 0 && (
              <section className="space-y-1">
                <h3 className="text-xs font-medium text-muted-foreground">Veli ödeme bildirimleri</h3>
                <ul className="divide-y rounded-md border">
                  {notices.map((n) => (
                    <li key={n.id} className="flex items-center justify-between gap-3 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm">
                          {monthFmt.format(new Date(`${n.monthStart}T12:00:00Z`))}
                          <span className="text-muted-foreground">
                            {' '}
                            · {NOTICE_STATUS_LABEL[n.status]}
                          </span>
                        </p>
                        {n.note && (
                          <p className="truncate text-xs text-muted-foreground">{n.note}</p>
                        )}
                      </div>
                      <DeleteControl id={n.id} onConfirm={() => removeNotice(n)} />
                    </li>
                  ))}
                </ul>
                <p className="text-[11px] text-muted-foreground">
                  Bildirim para kaydı değildir; onaylanan bildirimin deftere yazılan tahsilatı
                  ayrıca durur.
                </p>
              </section>
            )}

            {/* TEMİZLİK — ücret tanımı ve toptan silme (137). */}
            <section className="space-y-3 border-t pt-4">
              {row.perLessonKurus !== null && (
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 text-sm">
                    Ders ücreti: {formatKurus(row.perLessonKurus)}
                    <p className="text-[11px] text-muted-foreground">
                      Kaldırılırsa geçmiş tahakkuklar kalır; yeni ders eklenemez.
                    </p>
                  </div>
                  {confirming === 'fee' ? (
                    <span className="flex items-center gap-1">
                      <Button type="button" size="xs" variant="destructive" disabled={pending} onClick={removeFee}>
                        Kaldır
                      </Button>
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={pending}
                        onClick={() => setConfirming(null)}
                      >
                        Vazgeç
                      </Button>
                    </span>
                  ) : (
                    <Button
                      type="button"
                      size="xs"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setConfirming('fee')}
                    >
                      Ücret tanımını kaldır
                    </Button>
                  )}
                </div>
              )}

              {!purgeOpen ? (
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  className="text-destructive-foreground"
                  disabled={pending}
                  onClick={() => setPurgeOpen(true)}
                >
                  <Trash2 />
                  Tüm finans kayıtlarını temizle
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-destructive/40 p-3">
                  <p className="text-sm">
                    <strong>{row.fullName}</strong> için bütün dersler, tahsilatlar, veli
                    bildirimleri ve ücret tanımı <strong>geri alınamaz</strong> şekilde silinir.
                    Öğrenci silinmez. Test kayıtları için kullanın.
                  </p>
                  <Label htmlFor="purge-name" className="text-xs">
                    Onaylamak için <span className="font-semibold">{row.fullName}</span> yazın
                  </Label>
                  <Input
                    id="purge-name"
                    autoComplete="off"
                    value={purgeName}
                    onChange={(e) => setPurgeName(e.target.value)}
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => {
                        setPurgeOpen(false)
                        setPurgeName('')
                      }}
                    >
                      Vazgeç
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      disabled={pending || !nameMatches}
                      onClick={purgeAll}
                    >
                      Hepsini sil
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
            Kapat
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
