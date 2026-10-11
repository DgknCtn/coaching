import type { Metadata } from 'next'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Lock, Receipt, TrendingUp, Wallet, WalletCards } from 'lucide-react'
import { PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/empty-state'
import { Section } from '@/components/shared/section'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { LinkTabs } from '@/components/shared/link-tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { getTeacherContext } from '@/lib/workspace'
import { formatKurus } from '@/lib/billing/pricing'
import { todayDateString } from '@/lib/homework-status'
import {
  PERIOD_STATE_LABEL,
  isValidMonth,
  monthLabel,
  periodSummary,
  shiftMonth,
  type PeriodState,
} from '@/lib/finance-ledger'
import { FINANCE_MODEL_LABEL, modelAt, type FinanceModel } from '@/lib/pricing-history'
import { FinanceMonthlyChart, type MonthlyPoint } from './finance-monthly-chart'
import {
  ACCRUAL_SELECT,
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_SELECT,
  PAYMENT_SELECT,
  mapAccrual,
  mapExpense,
  mapPayment,
} from './data'
import { ExpensePanel } from './expense-panel'

export const metadata: Metadata = { title: 'Finans' }
export const dynamic = 'force-dynamic'

// FİNANS V1 (M1.0-02 §6).
//
// "Muhasebe programı değil, öğretmen ve çalışma alanı sahibi için yaşayan
// para defteri: bu ay ne oluştu, ne geldi, kimden bekleniyor, hangi
// giderler var?"
//
// SAHİBE ÖZEL (066): asıl savunma RLS ve RPC'lerde; buradaki kontrol
// yalnız düzgün bir açıklama göstermek için.
//
// HER KAYIT BU ÇALIŞMA ALANININ (§9): bütün sorgular workspace_id ile
// süzülür; bağımsız öğretmenin defteri başka bir alana karışmaz.

const STATE_VARIANT: Record<PeriodState, 'success' | 'warning' | 'info' | 'neutral'> = {
  odendi: 'success',
  kismi: 'warning',
  bekliyor: 'warning',
  alacak: 'info',
  yok: 'neutral',
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<{ ay?: string; sekme?: string }>
}) {
  const { ay, sekme } = await searchParams
  const { supabase, workspaceId, role } = await getTeacherContext()

  if (role !== 'owner') {
    return (
      <div className="max-w-6xl p-6 md:p-8">
        <PageHeader title="Finans" subtitle="Dönem toplamı, tahsilat, bekleyen alacak ve giderler" />
        <Section variant="card">
          <EmptyState
            icon={Lock}
            title="Bu ekran çalışma alanı sahibine özel"
            description="Öğrenci ücretleri ve ödeme kayıtları yalnız çalışma alanının sahibi tarafından görülebilir."
          />
        </Section>
      </div>
    )
  }

  const today = todayDateString()
  const thisMonth = today.slice(0, 7)
  const month = isValidMonth(ay) ? ay : thisMonth
  const tab = sekme === 'giderler' ? 'giderler' : 'ogrenciler'

  // Aylık sabit dönem ücretleri tembel üretilir (141); idempotent.
  const { error: ensureError } = await supabase.rpc('ensure_period_accruals', { p_workspace_id: workspaceId })
  if (ensureError) console.error('[finans] aylık ücretler üretilemedi:', ensureError.message)

  const [
    { data: studentRows },
    { data: accrualRows, error: accrualError },
    { data: paymentRows, error: paymentError },
    { data: expenseRows },
    { data: modelRows },
    { data: overviewRows },
    { data: monthlyRows },
  ] = await Promise.all([
    supabase.from('students').select('id, full_name, status').eq('workspace_id', workspaceId).order('full_name'),
    supabase.from('finance_lessons').select(ACCRUAL_SELECT).eq('workspace_id', workspaceId).limit(10000),
    supabase.from('finance_payments').select(PAYMENT_SELECT).eq('workspace_id', workspaceId).limit(10000),
    supabase
      .from('finance_expenses')
      .select(EXPENSE_SELECT)
      .eq('workspace_id', workspaceId)
      .order('spent_on', { ascending: false })
      .limit(500),
    supabase
      .from('student_finance_models')
      .select('student_id, model, collection_timing, valid_from, created_at')
      .eq('workspace_id', workspaceId),
    supabase.rpc('finance_period_overview', { p_workspace_id: workspaceId, p_month: `${month}-01` }),
    supabase.rpc('finance_monthly_summary', { p_workspace_id: workspaceId, p_months: 6 }),
  ])

  if (accrualError || paymentError) {
    console.error('[finans] defter okunamadı:', (accrualError ?? paymentError)!.message)
  }

  const accruals = (accrualRows ?? []).map((r) => mapAccrual(r as Record<string, unknown>))
  const payments = (paymentRows ?? []).map((r) => mapPayment(r as Record<string, unknown>))
  const expenses = (expenseRows ?? []).map((r) => mapExpense(r as Record<string, unknown>))
  const students = (studentRows ?? []) as { id: string; full_name: string; status: string }[]
  const names = new Map(students.map((s) => [s.id, s.full_name]))

  const monthEnd = `${month}-31`
  const modelsByStudent = new Map<string, { model: FinanceModel; collectionTiming: 'ay_basi' | 'ay_sonu' | 'ders_sonrasi'; validFrom: string; createdAt: string }[]>()
  for (const m of (modelRows ?? []) as Record<string, unknown>[]) {
    const list = modelsByStudent.get(m.student_id as string) ?? []
    list.push({
      model: m.model as FinanceModel,
      collectionTiming: m.collection_timing as 'ay_basi' | 'ay_sonu' | 'ders_sonrasi',
      validFrom: m.valid_from as string,
      createdAt: m.created_at as string,
    })
    modelsByStudent.set(m.student_id as string, list)
  }

  // ÖĞRENCİ TABLOSU — "kimden ödeme bekleniyor" 5 saniyede (§12).
  // Kalan büyükten küçüğe; hareketsiz arşivli öğrenci hiç görünmez.
  const table = students
    .map((s) => {
      const a = accruals.filter((x) => x.studentId === s.id)
      const p = payments.filter((x) => x.studentId === s.id)
      const summary = periodSummary(a, p, month)
      const model = modelAt(modelsByStudent.get(s.id) ?? [], monthEnd)
      return { student: s, summary, model: model?.model ?? null, hasAny: a.length + p.length > 0 }
    })
    .filter((r) => r.hasAny || (r.student.status === 'active' && r.model !== null))
    .filter((r) => r.student.status === 'active' || r.summary.closingBalanceKurus !== 0)
    .sort((x, y) => y.summary.closingBalanceKurus - x.summary.closingBalanceKurus)

  const overview = ((overviewRows ?? []) as Record<string, unknown>[])[0]
  const accrued = Number(overview?.accrued_kurus ?? 0)
  const collected = Number(overview?.collected_kurus ?? 0)
  const expense = Number(overview?.expense_kurus ?? 0)
  const receivable = Number(overview?.receivable_kurus ?? 0)
  const result = collected - expense

  const monthly: MonthlyPoint[] = ((monthlyRows ?? []) as Record<string, unknown>[]).map((m) => ({
    monthStart: m.month_start as string,
    accruedKurus: Number(m.accrued_kurus ?? 0),
    collectedKurus: Number(m.collected_kurus ?? 0),
  }))

  // SON HAREKETLER — "yaşayan defter" hissi (§6).
  const recent = [
    ...payments.map((p) => ({
      id: `p-${p.id}`,
      date: p.date,
      sign: 1,
      amount: p.amountKurus,
      text: `${names.get(p.studentId) ?? '—'} · Tahsilat`,
      href: `/teacher/finans/${p.studentId}`,
    })),
    ...expenses.map((e) => ({
      id: `e-${e.id}`,
      date: e.date,
      sign: -1,
      amount: e.amountKurus,
      text: `${e.studentId ? `${names.get(e.studentId) ?? '—'} · ` : ''}${e.note ?? EXPENSE_CATEGORY_LABEL[e.category]}`,
      href: e.studentId ? `/teacher/finans/${e.studentId}` : '?sekme=giderler',
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8)

  const monthExpenses = expenses.filter((e) => e.date.slice(0, 7) === month)
  const qs = (next: { ay?: string; sekme?: string }) => {
    const params = new URLSearchParams()
    params.set('ay', next.ay ?? month)
    if ((next.sekme ?? tab) === 'giderler') params.set('sekme', 'giderler')
    return `?${params.toString()}`
  }

  return (
    <div className="max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Finans"
        subtitle="Bu ay ne oluştu, ne geldi, kimden bekleniyor, hangi giderler var."
        badges={
          <span
            className="flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs text-muted-foreground"
            title="Bu ekranı yalnız çalışma alanının sahibi görebilir."
          >
            <Lock className="size-3" aria-hidden />
            Yalnızca size özel
          </span>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" render={<Link href={qs({ ay: shiftMonth(month, -1) })} />}>
          <ChevronLeft className="size-4" />
          <span className="sr-only">Önceki ay</span>
        </Button>
        <span className="min-w-28 text-center font-medium">{monthLabel(month)}</span>
        <Button size="sm" variant="outline" render={<Link href={qs({ ay: shiftMonth(month, 1) })} />}>
          <ChevronRight className="size-4" />
          <span className="sr-only">Sonraki ay</span>
        </Button>
        {month !== thisMonth && (
          <Button size="sm" variant="ghost" render={<Link href={qs({ ay: thisMonth })} />}>
            Bu ay
          </Button>
        )}
      </div>

      <MetricTiles
        className="xl:grid-cols-5"
        metrics={[
          { label: 'Dönem toplamı', value: formatKurus(accrued), hint: 'oluşan öğrenci ücretleri', icon: Receipt },
          { label: 'Tahsil edilen', value: formatKurus(collected), hint: 'bu ay alınan', tone: 'success', icon: Wallet },
          {
            label: 'Bekleyen alacak',
            value: formatKurus(receivable),
            hint: 'bugün açık bakiyeler',
            tone: receivable > 0 ? 'warning' : 'default',
            icon: WalletCards,
          },
          { label: 'Gider + kesinti', value: formatKurus(expense), hint: 'bu ay', icon: Receipt },
          {
            label: 'Faaliyet sonucu',
            value: formatKurus(result),
            hint: 'tahsil − gider · muhasebe net kârı değildir',
            tone: result < 0 ? 'warning' : 'default',
            icon: TrendingUp,
          },
        ]}
      />

      {/* Hakedişler sekmesi P1: çalışma alanında ekip yokken gizli (§6). */}
      <LinkTabs
        ariaLabel="Finans görünümü"
        activeKey={tab}
        tabs={[
          { key: 'ogrenciler', href: qs({ sekme: 'ogrenciler' }), label: 'Öğrenciler', count: table.length },
          { key: 'giderler', href: qs({ sekme: 'giderler' }), label: 'Giderler', count: monthExpenses.length },
        ]}
      />

      {tab === 'ogrenciler' ? (
        <Section variant="card" contentClassName="p-0">
          {table.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={Wallet}
                title="Bu dönemde finans hareketi yok"
                description="Öğrencinin Hizmet Yapısı'ndan ücretlendirme modelini tanımlayın; gerçekleşen dersler buraya kendiliğinden yansır."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Öğrenci</th>
                    <th className="px-3 py-2 text-left font-medium">Model</th>
                    <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Devreden</th>
                    <th className="px-3 py-2 text-right font-medium">Dönem</th>
                    <th className="px-3 py-2 text-right font-medium">Tahsil</th>
                    <th className="px-3 py-2 text-right font-medium">Kalan</th>
                    <th className="px-3 py-2 text-left font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {table.map(({ student, summary, model }) => (
                    <tr key={student.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">
                        <Link href={`/teacher/finans/${student.id}?ay=${month}`} className="font-medium hover:underline">
                          {student.full_name}
                        </Link>
                        {student.status !== 'active' && (
                          <span className="ml-1 text-xs text-muted-foreground">(arşiv)</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{model ? FINANCE_MODEL_LABEL[model] : '—'}</td>
                      <td className="hidden px-3 py-2 text-right tabular-nums text-muted-foreground md:table-cell">
                        {summary.carriedInKurus !== 0 ? formatKurus(summary.carriedInKurus) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKurus(summary.periodAccruedKurus)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatKurus(summary.periodCollectedKurus)}</td>
                      <td
                        className={`px-3 py-2 text-right font-medium tabular-nums ${
                          summary.closingBalanceKurus > 0 ? 'text-destructive-foreground' : ''
                        }`}
                      >
                        {summary.closingBalanceKurus < 0
                          ? `+${formatKurus(-summary.closingBalanceKurus)}`
                          : formatKurus(summary.closingBalanceKurus)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATE_VARIANT[summary.state]}>{PERIOD_STATE_LABEL[summary.state]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      ) : (
        <ExpensePanel
          month={month}
          monthLabel={monthLabel(month)}
          expenses={monthExpenses.map((e) => ({
            ...e,
            studentName: e.studentId ? (names.get(e.studentId) ?? null) : null,
          }))}
          students={students.filter((s) => s.status === 'active').map((s) => ({ id: s.id, name: s.full_name }))}
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Son hareketler" variant="card" contentClassName="p-4">
          {recent.length === 0 ? (
            <p className="text-sm text-muted-foreground">Henüz tahsilat ya da gider yok.</p>
          ) : (
            <ul className="divide-y text-sm">
              {recent.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-3 py-2">
                  <Link href={m.href} className="min-w-0 truncate hover:underline">
                    <span className="text-xs text-muted-foreground tabular-nums">{m.date.split('-').reverse().join('.')}</span>{' '}
                    {m.text}
                  </Link>
                  <span
                    className={`shrink-0 font-medium tabular-nums ${m.sign > 0 ? 'text-success-foreground' : 'text-destructive-foreground'}`}
                  >
                    {m.sign > 0 ? '+' : '−'}
                    {formatKurus(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <Section title="Aylık tahakkuk ve tahsilat" description="Son 6 ay" variant="card" contentClassName="p-4">
          <FinanceMonthlyChart points={monthly} />
        </Section>
      </div>
    </div>
  )
}
