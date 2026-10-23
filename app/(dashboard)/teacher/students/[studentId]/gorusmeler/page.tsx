import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { contactKindOf, deriveMainContact, nextContact, type ServiceLike } from '@/lib/service-structure'
import { isAwaitingOutcome } from '@/lib/service-structure'
import { buildMonthSummary } from '@/lib/session-state'
import { localDateString } from '@/lib/homework-status'
import {
  isoWeekKey,
  isValidWeekKey,
  monthWeeks,
  shiftWeek,
  weekDays,
  weekDateRangeLabel,
  weekMonths,
  weekRange,
} from '@/lib/iso-week'
import { academicWeekNumber, academicWeekLabel } from '@/lib/weekly-flow'
import { buildNextWeekPreview } from '@/lib/next-week-preview'
import { buildMonthWeekRows, monthColumnsFor, type MonthServiceLike } from '@/lib/month-sessions'
import { monthLabel as ledgerMonthLabel, isValidMonth, shiftMonth, sessionPaymentStates } from '@/lib/finance-ledger'
import { ACCRUAL_SELECT, PAYMENT_SELECT, mapAccrual, mapPayment } from '../../../finans/data'
import { SessionsClient, type ArchiveMonth, type MonthSummary } from './sessions-client'
import {
  SESSION_SELECT,
  SERVICE_SELECT,
  mapServiceRow,
  mapSessionRow,
  findUnpricedSessions,
  financeLinkMismatchServiceIds,
  monthsToGenerate,
  quickCollectSessionIds,
  serviceInfo,
} from './load'
import type { FinanceModelInfo } from './types'

// DERS & GÖRÜŞMELER V1 — öğrenci sayfası (M1.0-02 §4, M1.0-05 aylık görünüm).
//
// VARSAYILAN GÖRÜNÜM ARTIK AY (M1.0-05): "?hafta=" YOKSA ay görünümü
// açılır (?ay=2026-11, varsayılan bu ay) — ay içindeki haftalar satır,
// hizmet türü sütun olur (lib/month-sessions.ts). "?hafta=" VARSA eski
// haftalık operasyon ekranı (WeekSessions) AÇILIR — reschedule, telafi
// kararı, iptal gibi daha seyrek işlemler orada tam donanımlı kalır; ay
// görünümündeki her satırın "Bu haftaya git" bağlantısı oraya gider.
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

  const { supabase, workspaceId, role } = await getTeacherContext()
  const isOwner = role === 'owner'

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, status, grade_level, exam_type')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  const studentMeta = {
    id: studentId,
    name: student.full_name as string,
    meta: [student.grade_level, student.exam_type].filter(Boolean).join(' · ') || null,
  }

  if (isValidWeekKey(hafta)) {
    return (
      <WeekView
        studentId={studentId}
        student={studentMeta}
        week={hafta}
        now={now}
        isOwner={isOwner}
      />
    )
  }

  const currentMonth = localDateString(now).slice(0, 7)
  const month = isValidMonth(ay) ? ay : currentMonth

  return (
    <MonthView
      studentId={studentId}
      student={studentMeta}
      month={month}
      currentMonth={currentMonth}
      now={now}
      isOwner={isOwner}
    />
  )
}

interface StudentMeta {
  id: string
  name: string
  meta: string | null
}

/** İki görünümün paylaştığı, aralıktan bağımsız sorgular + hesaplar. */
async function loadShared(
  supabase: Awaited<ReturnType<typeof getTeacherContext>>['supabase'],
  { studentId, workspaceId, isOwner, summaryMonthStart }: { studentId: string; workspaceId: string; isOwner: boolean; summaryMonthStart: string }
) {
  const [
    { data: serviceRows },
    { data: groupRows },
    { data: archiveRows },
    accrualRes,
    paymentRes,
    { data: seasonRows },
    { data: noticeRow },
    modelsRes,
    pricesRes,
    { data: firstFlowRow },
  ] = await Promise.all([
    supabase
      .from('student_services')
      .select(SERVICE_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('status')
      .order('weekday'),
    supabase
      .from('student_groups')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('name'),
    supabase
      .from('student_service_month_view')
      .select('ay, planlanan, yapilan, yapilmayan')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('ay', { ascending: false })
      .limit(60),
    isOwner
      ? supabase.from('finance_lessons').select(ACCRUAL_SELECT).eq('student_id', studentId).eq('workspace_id', workspaceId)
      : Promise.resolve({ data: null }),
    isOwner
      ? supabase.from('finance_payments').select(PAYMENT_SELECT).eq('student_id', studentId).eq('workspace_id', workspaceId)
      : Promise.resolve({ data: null }),
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
    // T04-02: akademik hafta numarası İÇİN öğrencinin EN ESKİ
    // weekly_flows.starts_at'i (satırlar asla silinmez, kronolojik sabit).
    supabase
      .from('weekly_flows')
      .select('starts_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  const groupNames = new Map((groupRows ?? []).map(g => [g.id as string, g.name as string]))
  const services = (serviceRows ?? []).map(r => mapServiceRow(r as Record<string, unknown>, groupNames))

  const finance: FinanceModelInfo | null = isOwner
    ? {
        models: ((modelsRes.data ?? []) as Record<string, unknown>[]).map(m => ({
          id: m.id as string,
          model: m.model as 'aylik_sabit' | 'ders_basi',
          collectionTiming: m.collection_timing as 'ay_basi' | 'ay_sonu' | 'ders_sonrasi',
          validFrom: m.valid_from as string,
          createdAt: m.created_at as string,
        })),
        prices: ((pricesRes.data ?? []) as Record<string, unknown>[]).map(p => ({
          id: p.id as string,
          priceType: p.price_type as 'aylik' | 'ek_ders' | 'ders_basi',
          amountKurus: Number(p.amount_kurus),
          validFrom: p.valid_from as string,
          createdAt: p.created_at as string,
        })),
      }
    : null

  const archive: ArchiveMonth[] = ((archiveRows ?? []) as { ay: string; planlanan: number; yapilan: number; yapilmayan: number }[])
    .filter(r => r.ay !== summaryMonthStart)
    .slice(0, 12)
    .map(r => ({
      month: r.ay.slice(0, 7),
      label: ledgerMonthLabel(r.ay.slice(0, 7)),
      // M1.0-05: arşivden eski bir aya geçiş artık o ayın GÖRÜNÜMÜNE
      // gider (eskiden ilk haftasına).
      monthParam: r.ay.slice(0, 7),
      planned: Number(r.planlanan ?? 0),
      done: Number(r.yapilan ?? 0),
      missed: Number(r.yapilmayan ?? 0),
    }))

  const accrualRows = (accrualRes.data ?? []) as Record<string, unknown>[]
  const ledgerAccruals = accrualRows.map(mapAccrual)
  const ledgerPayments = ((paymentRes.data ?? []) as Record<string, unknown>[]).map(mapPayment)
  const money = isOwner ? Object.fromEntries(sessionPaymentStates(ledgerAccruals, ledgerPayments)) : {}

  const season =
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

  const paymentNotice = noticeRow
    ? { id: noticeRow.id as string, note: (noticeRow.note as string | null) ?? null, createdAt: noticeRow.created_at as string }
    : null

  const firstFlowStartedAt = (firstFlowRow?.starts_at as string | undefined) ?? null

  return {
    services,
    groupRows: groupRows ?? [],
    finance,
    archive,
    accrualRows,
    money,
    season,
    paymentNotice,
    firstFlowStartedAt,
  }
}

async function WeekView({
  studentId,
  student,
  week,
  now,
  isOwner,
}: {
  studentId: string
  student: StudentMeta
  week: string
  now: Date
  isOwner: boolean
}) {
  const { supabase, workspaceId } = await getTeacherContext()
  const currentWeek = isoWeekKey(now)
  const nextWeek = shiftWeek(week, 1)

  const monthsTouched = new Set([...weekMonths(week), ...weekMonths(nextWeek)])
  for (const { year, month } of monthsToGenerate([...monthsTouched])) {
    const { error } = await supabase.rpc('generate_service_sessions', { p_student_id: studentId, p_year: year, p_month: month })
    if (error) {
      console.error('[gorusmeler] oturum üretilemedi:', JSON.stringify({ studentId, year, month, message: error.message }))
    }
  }

  const { from, to } = weekRange(week)
  const nextWeekRange = weekRange(nextWeek)
  const summaryMonth = weekDays(week)[3].slice(0, 7)
  const summaryMonthStart = `${summaryMonth}-01`

  const [
    { services, groupRows, finance, archive, accrualRows, money, season, paymentNotice, firstFlowStartedAt },
    { data: sessionRows },
    { data: monthCounters },
    { data: nextWeekSessionRows },
  ] = await Promise.all([
    loadShared(supabase, { studentId, workspaceId, isOwner, summaryMonthStart }),
    supabase
      .from('student_service_session_view')
      .select(SESSION_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .gte('current_planned_at', from.toISOString())
      .lt('current_planned_at', to.toISOString())
      .order('current_planned_at'),
    supabase
      .from('student_service_month_view')
      .select('service_id, kind, participation, planlanan, yapilan, bekleyen, yapilmayan, ek_ders, telafi_bekleyen')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('ay', summaryMonthStart),
    supabase
      .from('student_service_session_view')
      .select(SESSION_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .gte('current_planned_at', nextWeekRange.from.toISOString())
      .lt('current_planned_at', nextWeekRange.to.toISOString())
      .order('current_planned_at'),
  ])

  const sessions = (sessionRows ?? []).map(r => mapSessionRow(r as Record<string, unknown>))
  const mainContact = deriveMainContact(services as ServiceLike[])
  const upcoming = nextContact((services as ServiceLike[]).filter(s => s.status === 'active'), now)

  const flexibleIds = new Set(services.filter(s => s.cadence === 'esnek').map(s => s.id))
  const monthSummary: MonthSummary = buildMonthSummary(
    ledgerMonthLabel(summaryMonth),
    ((monthCounters ?? []) as Record<string, unknown>[]).map(c => ({
      kind: c.kind as 'ders' | 'kocluk',
      flexible: flexibleIds.has(c.service_id as string),
      planlanan: Number(c.planlanan ?? 0),
      yapilan: Number(c.yapilan ?? 0),
      bekleyen: Number(c.bekleyen ?? 0),
      ek_ders: c.ek_ders == null ? null : Number(c.ek_ders),
      telafi_bekleyen: c.telafi_bekleyen == null ? null : Number(c.telafi_bekleyen),
    }))
  )

  const quickCollectIds = isOwner && finance
    ? quickCollectSessionIds({ sessions, serviceById: new Map(services.map(s => [s.id, s])), modelsByStudent: new Map([[studentId, finance.models]]) })
    : []
  const unpricedIds = isOwner && finance
    ? findUnpricedSessions({
        sessions,
        financeLinkByService: new Map(services.map(s => [s.id, s.financeLink])),
        modelsByStudent: new Map([[studentId, finance.models]]),
        accruedSessionIds: new Set(accrualRows.map(r => r.service_session_id as string | null).filter((x): x is string => !!x)),
      })
    : []
  const financeMismatchIds = isOwner && finance
    ? financeLinkMismatchServiceIds({ services, models: finance.models, today: localDateString(now) })
    : []

  const weekTotal = sessions.filter(s => s.status !== 'iptal').length
  const weekDone = sessions.filter(s => s.status === 'yapildi').length
  const weekAwaiting = sessions.filter(s => isAwaitingOutcome({ status: s.status, effectiveAt: new Date(s.currentPlannedAt) }, now)).length

  const infoById = Object.fromEntries(services.map(s => [s.id, serviceInfo(s)]))
  const nextWeekPreview = buildNextWeekPreview(((nextWeekSessionRows ?? []) as Record<string, unknown>[]).map(r => mapSessionRow(r)), infoById)

  const academicWeek = firstFlowStartedAt ? academicWeekNumber(firstFlowStartedAt, week) : null
  const weekTitle = academicWeek !== null ? academicWeekLabel(academicWeek, week) : weekDateRangeLabel(week)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader title="Ders & Görüşmeler" subtitle="Bu hafta ne planlandı, ne yapıldı, ne telafi bekliyor." />
      <SessionsClient
        studentId={studentId}
        student={student}
        services={services}
        serviceInfo={infoById}
        sessions={sessions}
        groups={groupRows.map(g => ({ id: g.id as string, name: g.name as string }))}
        view={{
          mode: 'week',
          week: {
            title: weekTitle,
            prevHref: `?hafta=${shiftWeek(week, -1)}`,
            nextHref: `?hafta=${shiftWeek(week, 1)}`,
            currentHref: `?hafta=${currentWeek}`,
            isCurrent: week === currentWeek,
          },
          weekStats: { done: weekDone, total: weekTotal, awaiting: weekAwaiting },
          nextWeekPreview,
        }}
        monthSummary={monthSummary}
        archive={archive}
        mainContactId={mainContact?.id ?? null}
        nextContactAt={upcoming?.at.toISOString() ?? null}
        nowIso={now.toISOString()}
        finance={finance}
        unpricedIds={unpricedIds}
        financeMismatchIds={financeMismatchIds}
        quickCollectIds={quickCollectIds}
        money={money}
        financeHref={isOwner ? `/teacher/finans/${studentId}` : null}
        paymentNotice={paymentNotice}
        season={season}
      />
    </div>
  )
}

async function MonthView({
  studentId,
  student,
  month,
  currentMonth,
  now,
  isOwner,
}: {
  studentId: string
  student: StudentMeta
  month: string
  currentMonth: string
  now: Date
  isOwner: boolean
}) {
  const { supabase, workspaceId } = await getTeacherContext()
  const weekKeys = monthWeeks(month)
  const summaryMonthStart = `${month}-01`

  // TEMBEL ÜRETİM: ayın gösterdiği HER haftanın dokunduğu takvim ayı
  // (sınır haftaları iki aya dokunabilir, bkz. weekMonths).
  const monthsTouched = new Set(weekKeys.flatMap(w => weekMonths(w)))
  for (const { year, month: m } of monthsToGenerate([...monthsTouched])) {
    const { error } = await supabase.rpc('generate_service_sessions', { p_student_id: studentId, p_year: year, p_month: m })
    if (error) {
      console.error('[gorusmeler] oturum üretilemedi:', JSON.stringify({ studentId, year, month: m, message: error.message }))
    }
  }

  const monthFrom = weekRange(weekKeys[0]).from
  const monthTo = weekRange(weekKeys[weekKeys.length - 1]).to

  const [
    { services, groupRows, finance, archive, accrualRows, money, season, paymentNotice, firstFlowStartedAt },
    { data: sessionRows },
    { data: monthCounters },
  ] = await Promise.all([
    loadShared(supabase, { studentId, workspaceId, isOwner, summaryMonthStart }),
    supabase
      .from('student_service_session_view')
      .select(SESSION_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .gte('current_planned_at', monthFrom.toISOString())
      .lt('current_planned_at', monthTo.toISOString())
      .order('current_planned_at'),
    supabase
      .from('student_service_month_view')
      .select('service_id, kind, participation, planlanan, yapilan, bekleyen, yapilmayan, ek_ders, telafi_bekleyen')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('ay', summaryMonthStart),
  ])

  const sessions = (sessionRows ?? []).map(r => mapSessionRow(r as Record<string, unknown>))
  const mainContact = deriveMainContact(services as ServiceLike[])
  const upcoming = nextContact((services as ServiceLike[]).filter(s => s.status === 'active'), now)

  const flexibleIds = new Set(services.filter(s => s.cadence === 'esnek').map(s => s.id))
  const monthSummary: MonthSummary = buildMonthSummary(
    ledgerMonthLabel(month),
    ((monthCounters ?? []) as Record<string, unknown>[]).map(c => ({
      kind: c.kind as 'ders' | 'kocluk',
      flexible: flexibleIds.has(c.service_id as string),
      planlanan: Number(c.planlanan ?? 0),
      yapilan: Number(c.yapilan ?? 0),
      bekleyen: Number(c.bekleyen ?? 0),
      ek_ders: c.ek_ders == null ? null : Number(c.ek_ders),
      telafi_bekleyen: c.telafi_bekleyen == null ? null : Number(c.telafi_bekleyen),
    }))
  )

  const quickCollectIds = isOwner && finance
    ? quickCollectSessionIds({ sessions, serviceById: new Map(services.map(s => [s.id, s])), modelsByStudent: new Map([[studentId, finance.models]]) })
    : []
  const unpricedIds = isOwner && finance
    ? findUnpricedSessions({
        sessions,
        financeLinkByService: new Map(services.map(s => [s.id, s.financeLink])),
        modelsByStudent: new Map([[studentId, finance.models]]),
        accruedSessionIds: new Set(accrualRows.map(r => r.service_session_id as string | null).filter((x): x is string => !!x)),
      })
    : []
  const financeMismatchIds = isOwner && finance
    ? financeLinkMismatchServiceIds({ services, models: finance.models, today: localDateString(now) })
    : []

  const infoById = Object.fromEntries(services.map(s => [s.id, serviceInfo(s)]))

  // M1.0-05: sütunlar (Birebir Ders / Grup Dersi / Koçluk) yalnız bu
  // öğrencinin AKTİF hizmeti olan türler için açılır (Örnek A tek
  // sütun, Örnek B iki sütun — PDF).
  const activeServices: MonthServiceLike[] = services
    .filter(s => s.status === 'active')
    .map(s => ({ contactKind: contactKindOf(s as unknown as ServiceLike) }))
  const columns = monthColumnsFor(activeServices)

  const serviceContactById = new Map(
    services.map(s => [s.id, { contactKind: contactKindOf(s as unknown as ServiceLike) }])
  )
  const weekRows = buildMonthWeekRows(month, ledgerMonthLabel(month).split(' ')[0], sessions, serviceContactById)

  // "Öğrenciyle N. Hafta" — her satır için akışın kendi akademik hafta
  // numarası (lib/weekly-flow.ts), takvim yılı hafta numarası DEĞİL.
  const academicWeekLabelByWeekKey: Record<string, string | null> = {}
  for (const weekKey of weekKeys) {
    const n = firstFlowStartedAt ? academicWeekNumber(firstFlowStartedAt, weekKey) : null
    academicWeekLabelByWeekKey[weekKey] = n !== null ? `Öğrenciyle ${n}. Hafta` : null
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader title="Ders & Görüşmeler" subtitle="Bu ay ne planlandı, ne yapıldı, ne telafi bekliyor." />
      <SessionsClient
        studentId={studentId}
        student={student}
        services={services}
        serviceInfo={infoById}
        sessions={sessions}
        groups={groupRows.map(g => ({ id: g.id as string, name: g.name as string }))}
        view={{
          mode: 'month',
          month: {
            title: ledgerMonthLabel(month),
            prevHref: `?ay=${shiftMonth(month, -1)}`,
            nextHref: `?ay=${shiftMonth(month, 1)}`,
            currentHref: `?ay=${currentMonth}`,
            isCurrent: month === currentMonth,
          },
          weekRows,
          columns,
          academicWeekLabelByWeekKey,
          hasAnyService: activeServices.length > 0,
        }}
        monthSummary={monthSummary}
        archive={archive}
        mainContactId={mainContact?.id ?? null}
        nextContactAt={upcoming?.at.toISOString() ?? null}
        nowIso={now.toISOString()}
        finance={finance}
        unpricedIds={unpricedIds}
        financeMismatchIds={financeMismatchIds}
        quickCollectIds={quickCollectIds}
        money={money}
        financeHref={isOwner ? `/teacher/finans/${studentId}` : null}
        paymentNotice={paymentNotice}
        season={season}
      />
    </div>
  )
}
