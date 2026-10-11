import { notFound } from 'next/navigation'
import { CalendarCheck, CalendarClock, Clock, Wallet } from 'lucide-react'
import { monthPaymentLabel, monthPaymentState } from '@/lib/finance'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { deriveMainContact, nextContact, type ServiceLike } from '@/lib/service-structure'
import { isAwaitingOutcome } from '@/lib/service-structure'
import {
  isoWeekKey,
  isValidWeekKey,
  isoWeekKeyOfDate,
  shiftWeek,
  weekDays,
  weekLabel,
  weekMonths,
  weekRange,
} from '@/lib/iso-week'
import { monthLabel as ledgerMonthLabel } from '@/lib/finance-ledger'
import { SessionsClient, type ArchiveMonth, type MonthSummary } from './sessions-client'
import {
  SESSION_SELECT,
  SERVICE_SELECT,
  mapServiceRow,
  mapSessionRow,
  monthsToGenerate,
  serviceInfo,
} from './load'
import type { FinanceModelInfo } from './types'

// DERS & GÖRÜŞMELER V1 — öğrenci sayfası (M1.0-02 §4).
//
// "Bu hafta gerçekte ne oldu?" Ana görünüm ISO hafta merkezlidir
// (?hafta=2026-W41, varsayılan bu hafta). Ay arşivi ve sezon özeti alt
// bölümde kalır.
//
// SINIR: burası hizmetin GERÇEĞİNİ tutar. Para toplamı Finans'ta.

export const dynamic = 'force-dynamic'

export default async function StudentSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ hafta?: string; ay?: string }>
}) {
  const { studentId } = await params
  const { hafta, ay } = await searchParams
  const now = new Date()
  const currentWeek = isoWeekKey(now)

  // Eski ?ay=YYYY-MM bağlantıları ayın ilk haftasına düşer.
  const week =
    isValidWeekKey(hafta)
      ? hafta
      : ay && /^\d{4}-(0[1-9]|1[0-2])$/.test(ay)
        ? isoWeekKeyOfDate(`${ay}-01`)
        : currentWeek

  const { supabase, workspaceId, role } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, status, grade_level, exam_type')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // TEMBEL ÜRETİM: haftanın dokunduğu her ay. Hata sayfayı durdurmaz.
  for (const { year, month } of monthsToGenerate(weekMonths(week))) {
    const { error } = await supabase.rpc('generate_service_sessions', {
      p_student_id: studentId,
      p_year: year,
      p_month: month,
    })
    if (error) {
      console.error('[gorusmeler] oturum üretilemedi:', JSON.stringify({ studentId, year, month, message: error.message }))
    }
  }

  const { from, to } = weekRange(week)
  // Haftanın ayı ISO kuralıyla Perşembe'nin ayıdır.
  const summaryMonth = weekDays(week)[3].slice(0, 7)
  const summaryMonthStart = `${summaryMonth}-01`
  const isOwner = role === 'owner'

  const [
    { data: serviceRows },
    { data: sessionRows },
    { data: groupRows },
    { data: monthCounters },
    { data: archiveRows },
    { data: monthFinanceRow },
    { data: seasonRows },
    { data: noticeRow },
    modelsRes,
    pricesRes,
  ] = await Promise.all([
    supabase
      .from('student_services')
      .select(SERVICE_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('status')
      .order('weekday'),
    supabase
      .from('student_service_session_view')
      .select(SESSION_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .gte('current_planned_at', from.toISOString())
      .lt('current_planned_at', to.toISOString())
      .order('current_planned_at'),
    supabase
      .from('student_groups')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('student_service_month_view')
      .select('service_id, kind, participation, planlanan, yapilan, bekleyen, yapilmayan, ek_ders, telafi_bekleyen')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('ay', summaryMonthStart),
    supabase
      .from('student_service_month_view')
      .select('ay, planlanan, yapilan, yapilmayan')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('ay', { ascending: false })
      .limit(60),
    supabase
      .from('student_month_finance_view')
      .select('accrued_kurus, collected_kurus, balance_kurus')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('month_start', summaryMonthStart)
      .maybeSingle(),
    supabase
      .from('student_season_summary_view')
      .select(
        'birebir_ders_count, birebir_ders_minutes, grup_ders_count, grup_ders_minutes, kocluk_count, kocluk_minutes, total_count, total_minutes, accrued_kurus, collected_kurus, balance_kurus'
      )
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('parent_payment_notices')
      .select('id, note, created_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('month_start', summaryMonthStart)
      .eq('status', 'pending')
      .maybeSingle(),
    // Ücretlendirme yalnız sahibe (139 RLS). Sahip değilse hiç sorulmaz.
    isOwner
      ? supabase
          .from('student_finance_models')
          .select('id, model, collection_timing, valid_from, created_at')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
      : Promise.resolve({ data: null }),
    isOwner
      ? supabase
          .from('student_price_versions')
          .select('id, price_type, amount_kurus, valid_from, created_at')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
      : Promise.resolve({ data: null }),
  ])

  const groupNames = new Map((groupRows ?? []).map((g) => [g.id as string, g.name as string]))
  const services = (serviceRows ?? []).map((r) => mapServiceRow(r as Record<string, unknown>, groupNames))
  const sessions = (sessionRows ?? []).map((r) => mapSessionRow(r as Record<string, unknown>))

  const mainContact = deriveMainContact(services as ServiceLike[])
  const upcoming = nextContact(
    (services as ServiceLike[]).filter((s) => s.status === 'active'),
    now
  )

  const finance: FinanceModelInfo | null = isOwner
    ? {
        models: ((modelsRes.data ?? []) as Record<string, unknown>[]).map((m) => ({
          id: m.id as string,
          model: m.model as 'aylik_sabit' | 'ders_basi',
          collectionTiming: m.collection_timing as 'ay_basi' | 'ay_sonu' | 'ders_sonrasi',
          validFrom: m.valid_from as string,
          createdAt: m.created_at as string,
        })),
        prices: ((pricesRes.data ?? []) as Record<string, unknown>[]).map((p) => ({
          id: p.id as string,
          priceType: p.price_type as 'aylik' | 'ek_ders' | 'ders_basi',
          amountKurus: Number(p.amount_kurus),
          validFrom: p.valid_from as string,
          createdAt: p.created_at as string,
        })),
      }
    : null

  // §5 "Aylık hizmet özeti": Ders 3/5 yapıldı · Koçluk 2/5 · Telafi 1 bekliyor · Ek ders 1.
  const counters = (monthCounters ?? []) as {
    kind: 'ders' | 'kocluk'
    planlanan: number
    yapilan: number
    ek_ders: number | null
    telafi_bekleyen: number | null
  }[]
  const monthSummary: MonthSummary = {
    monthLabel: ledgerMonthLabel(summaryMonth),
    dersDone: counters.filter((c) => c.kind === 'ders').reduce((n, c) => n + Number(c.yapilan ?? 0), 0),
    dersPlanned: counters.filter((c) => c.kind === 'ders').reduce((n, c) => n + Number(c.planlanan ?? 0), 0),
    koclukDone: counters.filter((c) => c.kind === 'kocluk').reduce((n, c) => n + Number(c.yapilan ?? 0), 0),
    koclukPlanned: counters.filter((c) => c.kind === 'kocluk').reduce((n, c) => n + Number(c.planlanan ?? 0), 0),
    makeupPending: counters.reduce((n, c) => n + Number(c.telafi_bekleyen ?? 0), 0),
    extra: counters.reduce((n, c) => n + Number(c.ek_ders ?? 0), 0),
  }

  const archive: ArchiveMonth[] = ((archiveRows ?? []) as { ay: string; planlanan: number; yapilan: number; yapilmayan: number }[])
    .filter((r) => r.ay !== summaryMonthStart)
    .slice(0, 12)
    .map((r) => ({
      month: r.ay.slice(0, 7),
      label: ledgerMonthLabel(r.ay.slice(0, 7)),
      weekParam: isoWeekKeyOfDate(r.ay),
      planned: Number(r.planlanan ?? 0),
      done: Number(r.yapilan ?? 0),
      missed: Number(r.yapilmayan ?? 0),
    }))

  const monthFinance = monthFinanceRow
    ? {
        accruedKurus: Number(monthFinanceRow.accrued_kurus ?? 0),
        collectedKurus: Number(monthFinanceRow.collected_kurus ?? 0),
        balanceKurus: Number(monthFinanceRow.balance_kurus ?? 0),
      }
    : null
  const paymentState = monthFinance ? monthPaymentState(monthFinance) : null

  const weekDone = sessions.filter((s) => s.status === 'yapildi').length
  const weekAwaiting = sessions.filter((s) =>
    isAwaitingOutcome({ status: s.status, effectiveAt: new Date(s.currentPlannedAt) }, now)
  ).length

  const infoById = Object.fromEntries(services.map((s) => [s.id, serviceInfo(s)]))

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Ders & Görüşmeler"
        subtitle="Bu hafta ne planlandı, ne yapıldı, ne telafi bekliyor."
      />

      <MetricTiles
        className="xl:grid-cols-4"
        metrics={[
          { label: 'Bu hafta', value: sessions.filter((s) => s.status !== 'iptal').length, hint: 'oturum', icon: CalendarClock },
          { label: 'Yapıldı', value: weekDone, tone: 'success', icon: CalendarCheck },
          { label: 'Durum bekliyor', value: weekAwaiting, tone: weekAwaiting > 0 ? 'warning' : 'default', icon: Clock },
          {
            label: 'Ödeme durumu',
            value: ledgerMonthLabel(summaryMonth),
            hint: monthPaymentLabel(paymentState) ?? '—',
            tone: paymentState === 'paid' ? 'success' : paymentState === null ? 'default' : 'warning',
            icon: Wallet,
            href: isOwner ? `/teacher/finans/${studentId}` : undefined,
          },
        ]}
      />

      <SessionsClient
        studentId={studentId}
        student={{
          id: studentId,
          name: student.full_name as string,
          meta: [student.grade_level, student.exam_type].filter(Boolean).join(' · ') || null,
        }}
        services={services}
        serviceInfo={infoById}
        sessions={sessions}
        groups={(groupRows ?? []).map((g) => ({ id: g.id as string, name: g.name as string }))}
        week={{
          title: weekLabel(week),
          prevHref: `?hafta=${shiftWeek(week, -1)}`,
          nextHref: `?hafta=${shiftWeek(week, 1)}`,
          currentHref: `?hafta=${currentWeek}`,
          isCurrent: week === currentWeek,
        }}
        monthSummary={monthSummary}
        archive={archive}
        mainContactId={mainContact?.id ?? null}
        nextContactAt={upcoming?.at.toISOString() ?? null}
        nowIso={now.toISOString()}
        finance={finance}
        financeHref={isOwner ? `/teacher/finans/${studentId}` : null}
        paymentNotice={
          noticeRow
            ? {
                id: noticeRow.id as string,
                note: (noticeRow.note as string | null) ?? null,
                createdAt: noticeRow.created_at as string,
              }
            : null
        }
        season={
          seasonRows
            ? {
                birebirDersCount: Number(seasonRows.birebir_ders_count ?? 0),
                birebirDersMinutes: Number(seasonRows.birebir_ders_minutes ?? 0),
                grupDersCount: Number(seasonRows.grup_ders_count ?? 0),
                grupDersMinutes: Number(seasonRows.grup_ders_minutes ?? 0),
                koclukCount: Number(seasonRows.kocluk_count ?? 0),
                koclukMinutes: Number(seasonRows.kocluk_minutes ?? 0),
                totalCount: Number(seasonRows.total_count ?? 0),
                totalMinutes: Number(seasonRows.total_minutes ?? 0),
                accruedKurus: seasonRows.accrued_kurus == null ? null : Number(seasonRows.accrued_kurus),
                collectedKurus: seasonRows.collected_kurus == null ? null : Number(seasonRows.collected_kurus),
                balanceKurus: seasonRows.balance_kurus == null ? null : Number(seasonRows.balance_kurus),
              }
            : null
        }
      />
    </div>
  )
}
