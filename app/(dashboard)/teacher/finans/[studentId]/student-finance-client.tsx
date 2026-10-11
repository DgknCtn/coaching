'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Plus, Settings2, Trash2 } from 'lucide-react'
import { formatKurus } from '@/lib/billing/pricing'
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, parseLiraToKurus } from '@/lib/finance'
import {
  ACCRUAL_KIND_LABEL,
  PERIOD_STATE_LABEL,
  allocatePayments,
  monthLabel,
  periodLines,
  periodSummary,
  shiftMonth,
} from '@/lib/finance-ledger'
import {
  COLLECTION_TIMING_LABEL,
  FINANCE_MODEL_LABEL,
  modelAt,
  priceAt,
  type FinanceModelVersion,
  type PriceVersion,
} from '@/lib/pricing-history'
import { formatUnits } from '@/lib/session-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Section } from '@/components/shared/section'
import { SegmentedField } from '@/components/shared/segmented-field'
import {
  addManualAccrualAction,
  addPaymentV2Action,
  deleteFinanceEntryAction,
  deletePaymentNoticeAction,
  purgeStudentFinanceAction,
} from '../actions'
import type { AccrualRow, ExpenseRow, PaymentRow } from '../data'
import { ExpensePanel } from '../expense-panel'

const dateTr = (iso: string) => iso.split('-').reverse().join('.')

export function StudentFinanceClient({
  student,
  month,
  today,
  accruals,
  payments,
  expenses,
  models,
  prices,
  notices,
}: {
  student: { id: string; name: string }
  month: string
  today: string
  accruals: (AccrualRow & { serviceLabel: string | null })[]
  payments: PaymentRow[]
  expenses: ExpenseRow[]
  models: (FinanceModelVersion & { id: string })[]
  prices: (PriceVersion & { id: string })[]
  notices: { id: string; monthStart: string; status: 'pending' | 'confirmed' | 'rejected'; note: string | null }[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<null | 'payment' | 'accrual'>(null)

  const summary = periodSummary(accruals, payments, month)
  const lines = periodLines(accruals, month) as (AccrualRow & { serviceLabel: string | null })[]
  const monthPayments = payments.filter((p) => p.date.slice(0, 7) === month).sort((a, b) => a.date.localeCompare(b.date))
  const allocation = useMemo(() => allocatePayments(accruals, payments), [accruals, payments])
  const units = lines
    .filter((l) => l.kind === 'ders' || l.kind === 'ek_ders')
    .reduce((s, l) => s + (l.unitCount ?? 0), 0)

  const model = modelAt(models, today)
  const mainPrice = model ? priceAt(prices, model.model === 'aylik_sabit' ? 'aylik' : 'ders_basi', today) : null
  const extraPrice = model?.model === 'aylik_sabit' ? priceAt(prices, 'ek_ders', today) : null

  function run(action: () => Promise<{ error?: string; success?: boolean }>, ok: string, after?: () => void) {
    startTransition(async () => {
      const r = await action()
      if (r?.error) {
        toast.error(r.error)
        return
      }
      toast.success(ok)
      after?.()
      router.refresh()
    })
  }

  const movements = [
    ...accruals.map((a) => ({ type: 'lesson' as const, id: a.id, date: a.date, amount: a.amountKurus, row: a })),
    ...payments.map((p) => ({ type: 'payment' as const, id: p.id, date: p.date, amount: p.amountKurus, row: p })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="space-y-6">
      {/* Model + ay seçici */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?ay=${shiftMonth(month, -1)}`} />}>
            <ChevronLeft className="size-4" />
            <span className="sr-only">Önceki ay</span>
          </Button>
          <span className="min-w-28 text-center font-medium">{monthLabel(month)}</span>
          <Button size="sm" variant="outline" nativeButton={false} render={<Link href={`?ay=${shiftMonth(month, 1)}`} />}>
            <ChevronRight className="size-4" />
            <span className="sr-only">Sonraki ay</span>
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            {model
              ? `${FINANCE_MODEL_LABEL[model.model]} ${mainPrice != null ? formatKurus(mainPrice) : '—'}${
                  model.model === 'aylik_sabit' ? ' / ay' : ' / ders'
                } · ${COLLECTION_TIMING_LABEL[model.collectionTiming]}${
                  extraPrice != null ? ` · Ek ders ${formatKurus(extraPrice)}` : ''
                }`
              : 'Ücretlendirme modeli yok'}
          </span>
          <Button size="sm" variant="ghost" nativeButton={false} render={<Link href={`/teacher/students/${student.id}/gorusmeler`} />}>
            <Settings2 className="size-4" />
            Hizmet Yapısı
          </Button>
        </div>
      </div>

      {/* DÖNEM */}
      <Section
        title={`${monthLabel(month)} dönemi`}
        variant="card"
        action={
          <div className="flex items-center gap-1">
            <Button size="sm" onClick={() => setForm(form === 'payment' ? null : 'payment')}>
              <Plus className="size-4" />
              Tahsilat ekle
            </Button>
            <Button size="sm" variant="outline" onClick={() => setForm(form === 'accrual' ? null : 'accrual')}>
              Devir / tahakkuk ekle
            </Button>
          </div>
        }
      >
        {form === 'payment' && (
          <PaymentForm
            studentId={student.id}
            month={month}
            today={today}
            disabled={isPending}
            onDone={() => setForm(null)}
            run={run}
          />
        )}
        {form === 'accrual' && (
          <AccrualForm studentId={student.id} today={today} disabled={isPending} onDone={() => setForm(null)} run={run} />
        )}

        {summary.carriedInKurus !== 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            Önceki dönemlerden devreden:{' '}
            <span className="font-medium tabular-nums text-foreground">
              {summary.carriedInKurus < 0
                ? `${formatKurus(-summary.carriedInKurus)} alacak`
                : formatKurus(summary.carriedInKurus)}
            </span>
          </p>
        )}

        {lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">Bu dönemde tahakkuk yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-3 py-2 text-left font-medium">Tarih</th>
                  <th className="px-3 py-2 text-left font-medium">Kalem</th>
                  <th className="px-3 py-2 text-right font-medium">Birim</th>
                  <th className="px-3 py-2 text-right font-medium">Tutar</th>
                  <th className="hidden px-3 py-2 text-left font-medium sm:table-cell">Kapanış</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => {
                  const paid = allocation.paidByAccrual.get(l.id) ?? 0
                  const state =
                    l.amountKurus === 0 ? '—' : paid >= l.amountKurus ? 'Ödendi' : paid > 0 ? `Kısmi (${formatKurus(paid)})` : 'Açık'
                  return (
                    <tr key={l.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 tabular-nums">{dateTr(l.date)}</td>
                      <td className="px-3 py-2">
                        {l.kind === 'ders' && l.serviceLabel ? l.serviceLabel : ACCRUAL_KIND_LABEL[l.kind]}
                        {l.kind === 'ek_ders' && l.rateKurus != null && (
                          <span className="text-muted-foreground"> · {formatUnits(l.unitCount)} × {formatKurus(l.rateKurus)}</span>
                        )}
                        {l.note && !l.auto && <span className="text-muted-foreground"> · {l.note}</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.kind === 'ders' || l.kind === 'ek_ders' ? formatUnits(l.unitCount) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKurus(l.amountKurus)}</td>
                      <td className="hidden px-3 py-2 text-xs text-muted-foreground sm:table-cell">{state}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ÖZET — "5,5 ders birimi | Ekim dönemi toplamı 13.750 TL | Tahsil edilen 10.000 TL | Kalan 3.750 TL" */}
        <dl className="mt-4 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted-foreground">Ders birimi</dt>
            <dd className="font-medium tabular-nums">{units > 0 ? formatUnits(units) : '—'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Dönem toplamı</dt>
            <dd className="font-medium tabular-nums">{formatKurus(summary.periodAccruedKurus)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Tahsil edilen (bu ay)</dt>
            <dd className="font-medium tabular-nums">{formatKurus(summary.periodCollectedKurus)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">{summary.closingBalanceKurus < 0 ? 'Alacak (fazla ödeme)' : 'Kalan'}</dt>
            <dd className="flex items-center gap-2 font-medium tabular-nums">
              {formatKurus(Math.abs(summary.closingBalanceKurus))}
              <Badge variant={summary.state === 'odendi' ? 'success' : summary.state === 'alacak' ? 'info' : summary.state === 'yok' ? 'neutral' : 'warning'}>
                {PERIOD_STATE_LABEL[summary.state]}
              </Badge>
            </dd>
          </div>
        </dl>

        {monthPayments.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {monthPayments.map((p) => (
              <li key={p.id}>
                {dateTr(p.date)} · +{formatKurus(p.amountKurus)} · {PAYMENT_METHOD_LABEL[p.method] ?? p.method}
                {p.account && ` · ${p.account}`}
                {p.appliesToMonth && ` · ${monthLabel(p.appliesToMonth.slice(0, 7))} dönemine`}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Tahsilat en eski açık alacaktan başlayarak kapatır; fazlası alacak olarak sonraki döneme düşer. Geçmiş dönem
          toplamları değişmez.
        </p>
      </Section>

      <ExpensePanel
        month={month}
        monthLabel={monthLabel(month)}
        expenses={expenses.filter((e) => e.date.slice(0, 7) === month).map((e) => ({ ...e, studentName: null }))}
        students={[{ id: student.id, name: student.name }]}
        defaultStudentId={student.id}
      />

      {/* TÜM HAREKETLER — düzeltilebilen defter */}
      <Section title="Tüm hareketler" description="Tahakkuk ve tahsilat, yeniden eskiye." variant="card">
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">Kayıt yok.</p>
        ) : (
          <ul className="divide-y text-sm">
            {movements.map((m) => (
              <li key={`${m.type}-${m.id}`} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate">
                    {m.type === 'payment'
                      ? `Tahsilat · ${PAYMENT_METHOD_LABEL[(m.row as PaymentRow).method] ?? ''}`
                      : `${ACCRUAL_KIND_LABEL[(m.row as AccrualRow).kind]}${(m.row as AccrualRow).auto ? ' · otomatik' : ''}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {dateTr(m.date)}
                    {m.row.note ? ` · ${m.row.note}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`font-medium tabular-nums ${m.type === 'payment' ? 'text-success-foreground' : ''}`}>
                    {m.type === 'payment' ? '+' : ''}
                    {formatKurus(m.amount)}
                  </span>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Kaydı sil"
                    disabled={isPending}
                    onClick={() => {
                      const auto = m.type === 'lesson' && (m.row as AccrualRow).auto
                      const monthly = m.type === 'lesson' && (m.row as AccrualRow).kind === 'aylik'
                      const msg = monthly
                        ? 'Bu ayın sabit ücreti sıfırlansın mı? (Satır silinmez; yeniden üretilmesin diye 0 TL olarak kalır.)'
                        : auto
                          ? 'Bu tahakkuk bir oturumdan otomatik geldi; oturum yeniden işaretlenirse geri yazılır. Silinsin mi?'
                          : 'Kayıt silinsin mi?'
                      if (!window.confirm(msg)) return
                      run(() => deleteFinanceEntryAction(m.type, m.id), 'Kayıt güncellendi.')
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {notices.length > 0 && (
        <Section title="Veli ödeme bildirimleri" variant="card">
          <ul className="divide-y text-sm">
            {notices.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 py-2">
                <span>
                  {monthLabel(n.monthStart.slice(0, 7))} ·{' '}
                  {n.status === 'pending' ? 'Bekliyor' : n.status === 'confirmed' ? 'Onaylandı' : 'Reddedildi'}
                  {n.note && <span className="text-muted-foreground"> · {n.note}</span>}
                </span>
                <Button
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Bildirimi sil"
                  disabled={isPending}
                  onClick={() => {
                    if (!window.confirm('Bildirim silinsin mi? Deftere yazılmış tahsilat ayrı kalır.')) return
                    run(() => deletePaymentNoticeAction(n.id), 'Bildirim silindi.')
                  }}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <PurgeSection student={student} disabled={isPending} run={run} />
    </div>
  )
}

function PaymentForm({
  studentId,
  month,
  today,
  disabled,
  onDone,
  run,
}: {
  studentId: string
  month: string
  today: string
  disabled: boolean
  onDone: () => void
  run: (action: () => Promise<{ error?: string; success?: boolean }>, ok: string, after?: () => void) => void
}) {
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('havale')
  const [account, setAccount] = useState('')
  const [apply, setApply] = useState<'bakiye' | 'donem'>('bakiye')
  const [note, setNote] = useState('')

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="payAmount">Tutar (TL)</Label>
          <Input id="payAmount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="44000" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payDate">Tarih</Label>
          <Input id="payDate" type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payMethod">Yöntem</Label>
          <NativeSelect id="payMethod" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payAccount">Hesap / banka</Label>
          <Input id="payAccount" value={account} onChange={(e) => setAccount(e.target.value)} placeholder="İsteğe bağlı" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SegmentedField
          label="Uygula"
          value={apply}
          onChange={setApply}
          options={[
            { value: 'bakiye', label: 'Mevcut bakiyeye' },
            { value: 'donem', label: `${monthLabel(month)} dönemine` },
          ]}
        />
        <div className="space-y-1.5">
          <Label htmlFor="payNote">Not</Label>
          <Input id="payNote" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            const kurus = parseLiraToKurus(amount)
            if (kurus === null || kurus <= 0) {
              toast.error('Geçerli bir tutar girin.')
              return
            }
            run(
              () =>
                addPaymentV2Action({
                  studentId,
                  paidOn: date,
                  amountKurus: kurus,
                  method,
                  account,
                  appliesToMonth: apply === 'donem' ? month : '',
                  note,
                }),
              'Tahsilat kaydedildi.',
              onDone
            )
          }}
        >
          Kaydet
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

function AccrualForm({
  studentId,
  today,
  disabled,
  onDone,
  run,
}: {
  studentId: string
  today: string
  disabled: boolean
  onDone: () => void
  run: (action: () => Promise<{ error?: string; success?: boolean }>, ok: string, after?: () => void) => void
}) {
  const [kind, setKind] = useState<'devir' | 'manuel'>('devir')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border bg-muted/40 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <SegmentedField
          label="Tür"
          value={kind}
          onChange={setKind}
          options={[
            { value: 'devir', label: 'Devreden bakiye' },
            { value: 'manuel', label: 'Diğer' },
          ]}
        />
        <div className="space-y-1.5">
          <Label htmlFor="accAmount">Tutar (TL)</Label>
          <Input id="accAmount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3800" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="accDate">Tarih</Label>
          <Input id="accDate" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="accNote">Açıklama</Label>
        <Input
          id="accNote"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'devir' ? 'Örn. 8 Mart tarihinden kalan' : ''}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => {
            const kurus = parseLiraToKurus(amount)
            if (kurus === null || kurus <= 0) {
              toast.error('Geçerli bir tutar girin.')
              return
            }
            run(
              () => addManualAccrualAction({ studentId, kind, amountKurus: kurus, date, note }),
              'Tahakkuk eklendi.',
              onDone
            )
          }}
        >
          Kaydet
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
      </div>
    </div>
  )
}

function PurgeSection({
  student,
  disabled,
  run,
}: {
  student: { id: string; name: string }
  disabled: boolean
  run: (action: () => Promise<{ error?: string; success?: boolean }>, ok: string, after?: () => void) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  return (
    <Section title="Tehlikeli işlem" variant="card">
      {!open ? (
        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setOpen(true)}>
          Bu öğrencinin tüm finans kayıtlarını sil…
        </Button>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Fiyatlar, model, tahakkuklar, tahsilatlar, giderler ve veli bildirimleri kalıcı silinir. Öğrenci ve
            görüşme kayıtları kalır. Onay için adı birebir yazın: <strong>{student.name}</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input aria-label="Öğrenci adı" value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-60" />
            <Button
              size="sm"
              variant="destructive"
              disabled={disabled || name.trim() !== student.name.trim()}
              onClick={() => run(() => purgeStudentFinanceAction(student.id, name.trim()), 'Finans kayıtları silindi.', () => setOpen(false))}
            >
              Kalıcı sil
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
          </div>
        </div>
      )}
    </Section>
  )
}
