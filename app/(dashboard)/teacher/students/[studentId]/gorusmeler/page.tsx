import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { deriveMainContact, nextContact, type ServiceLike } from '@/lib/service-structure'
import { isAwaitingOutcome } from '@/lib/service-structure'
import { buildMonthSummary } from '@/lib/session-state'
import { localDateString } from '@/lib/homework-status'
import {
  isoWeekKey,
  isValidWeekKey,
  isoWeekKeyOfDate,
  shiftWeek,
  weekDays,
  weekDateRangeLabel,
  weekMonths,
  weekRange,
} from '@/lib/iso-week'
import { academicWeekNumber, academicWeekLabel } from '@/lib/weekly-flow'
import { buildNextWeekPreview } from '@/lib/next-week-preview'
import { monthLabel as ledgerMonthLabel, sessionPaymentStates } from '@/lib/finance-ledger'
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

  // EKLE (M1.0-04): gelecek hafta özeti için gelecek haftanın da
  // tembel üretimi gerekiyor — ay sınırındaysa iki ayrı ay dokunabilir.
  const nextWeek = shiftWeek(week, 1)

  // TEMBEL ÜRETİM: bu hafta VE gelecek haftanın dokunduğu her ay
  // (tekrarsız). Hata sayfayı durdurmaz.
  const monthsTouched = new Set([...weekMonths(week), ...weekMonths(nextWeek)])
  for (const { year, month } of monthsToGenerate([...monthsTouched])) {
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
  const nextWeekRange = weekRange(nextWeek)
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
    accrualRes,
    paymentRes,
    { data: seasonRows },
    { data: noticeRow },
    modelsRes,
    pricesRes,
    { data: firstFlowRow },
    { data: nextWeekSessionRows },
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
    // ÖDEME DURUMU ÖĞRENCİ CARİ HESABINDAN (M1.0-02 §7): devreden borç ve
    // fazla ödeme dahil — Finans detayıyla aynı fonksiyon (periodSummary).
    // Finans yalnız sahibe açık; değilse hiç sorulmaz.
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
    // T04-02: akademik hafta numarası İÇİN öğrencinin EN ESKİ
    // weekly_flows.starts_at'i. Satırlar asla silinmediği için
    // (kabul #12) bu değer kronolojik olarak sabittir — hiç akış
    // açılmadıysa boş gelir, "N. Hafta" hiç gösterilmez (bkz.
    // lib/weekly-flow.ts academicWeekNumber).
    supabase
      .from('weekly_flows')
      .select('starts_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('starts_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // EKLE: gelecek hafta özeti için gelecek haftanın oturumları.
    // Aynı SESSION_SELECT/mapSessionRow kullanılıyor — ayrı bir dar
    // sorgu, aynı satır şeklini iki kez tanımlamaktan daha kırılgan
    // olurdu (bir kolon eklenince biri unutulabilirdi).
    supabase
      .from('student_service_session_view')
      .select(SESSION_SELECT)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .gte('current_planned_at', nextWeekRange.from.toISOString())
      .lt('current_planned_at', nextWeekRange.to.toISOString())
      .order('current_planned_at'),
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
  // Esnek ritimli hizmette payda yok (lib/session-state buildMonthSummary).
  const flexibleIds = new Set(services.filter((s) => s.cadence === 'esnek').map((s) => s.id))
  const monthSummary: MonthSummary = buildMonthSummary(
    ledgerMonthLabel(summaryMonth),
    ((monthCounters ?? []) as Record<string, unknown>[]).map((c) => ({
      kind: c.kind as 'ders' | 'kocluk',
      flexible: flexibleIds.has(c.service_id as string),
      planlanan: Number(c.planlanan ?? 0),
      yapilan: Number(c.yapilan ?? 0),
      bekleyen: Number(c.bekleyen ?? 0),
      ek_ders: c.ek_ders == null ? null : Number(c.ek_ders),
      telafi_bekleyen: c.telafi_bekleyen == null ? null : Number(c.telafi_bekleyen),
    }))
  )

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

  const accrualRows = (accrualRes.data ?? []) as Record<string, unknown>[]
  const ledgerAccruals = accrualRows.map(mapAccrual)
  const ledgerPayments = ((paymentRes.data ?? []) as Record<string, unknown>[]).map(mapPayment)
  // Satırdaki "1.750 TL tahsil edildi / bekliyor": cari hesabın FIFO dağıtımı.
  const money = isOwner
    ? Object.fromEntries(sessionPaymentStates(ledgerAccruals, ledgerPayments))
    : {}
  const quickCollectIds = isOwner && finance
    ? quickCollectSessionIds({
        sessions,
        serviceById: new Map(services.map((s) => [s.id, s])),
        modelsByStudent: new Map([[studentId, finance.models]]),
      })
    : []
  // T04-05: "Ödeme Durumu" kartı bu ekrandan TAMAMEN kaldırıldı —
  // öğrenciyle ders ekranı açıkken fiyat/bakiye gereksiz görünüyordu.
  // Period summary (`periodSummary`/`PERIOD_STATE_LABEL`) artık burada
  // hiç hesaplanmıyor; finans yalnız `/teacher/finans/${studentId}`de
  // yaşıyor (link WeekSessions'ın özet satırında zaten var).

  const unpricedIds = isOwner && finance
    ? findUnpricedSessions({
        sessions,
        financeLinkByService: new Map(services.map((s) => [s.id, s.financeLink])),
        modelsByStudent: new Map([[studentId, finance.models]]),
        accruedSessionIds: new Set(
          accrualRows.map((r) => r.service_session_id as string | null).filter((x): x is string => !!x)
        ),
      })
    : []

  // FİN-01: yalnız sahip görebiliyor — finans modeli zaten yalnız ona
  // açık (139 RLS). Öğretmen rolünde finans verisi hiç gelmediği için
  // bu kontrol de hiç çalışmaz; bu BİLİNÇLİ — öğretmen finansı
  // göremiyorsa uyarıyı da göremez, bug değil.
  const financeMismatchIds = isOwner && finance
    ? financeLinkMismatchServiceIds({ services, models: finance.models, today: localDateString(now) })
    : []

  // T04-04: tek kompakt özet için üçü — eskiden ayrı ayrı büyük
  // kartlardı ("Bu hafta", "Yapıldı", "Durum bekliyor").
  const weekTotal = sessions.filter((s) => s.status !== 'iptal').length
  const weekDone = sessions.filter((s) => s.status === 'yapildi').length
  const weekAwaiting = sessions.filter((s) =>
    isAwaitingOutcome({ status: s.status, effectiveAt: new Date(s.currentPlannedAt) }, now)
  ).length

  const infoById = Object.fromEntries(services.map((s) => [s.id, serviceInfo(s)]))

  // EKLE: gelecek hafta özeti — iptal hariç, sıralı, tek satır.
  const nextWeekPreview = buildNextWeekPreview(
    ((nextWeekSessionRows ?? []) as Record<string, unknown>[]).map((r) => mapSessionRow(r)),
    infoById
  )

  // T04-02: takvim yılı hafta numarası ("43. Hafta") yerine öğrenciye
  // özel akademik hafta. Takip hiç başlamadıysa (akış hiç açılmadıysa)
  // ya da görüntülenen hafta takipten ÖNCEYSE numara yok, yalnız tarih
  // aralığı gösterilir — "numarasız gerçek" "yanlış sayı"dan iyidir.
  const firstFlowStartedAt = (firstFlowRow?.starts_at as string | undefined) ?? null
  const academicWeek = firstFlowStartedAt ? academicWeekNumber(firstFlowStartedAt, week) : null
  const weekTitle = academicWeek !== null ? academicWeekLabel(academicWeek, week) : weekDateRangeLabel(week)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Ders & Görüşmeler"
        subtitle="Bu hafta ne planlandı, ne yapıldı, ne telafi bekliyor."
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
          title: weekTitle,
          prevHref: `?hafta=${shiftWeek(week, -1)}`,
          nextHref: `?hafta=${shiftWeek(week, 1)}`,
          currentHref: `?hafta=${currentWeek}`,
          isCurrent: week === currentWeek,
        }}
        weekStats={{ done: weekDone, total: weekTotal, awaiting: weekAwaiting }}
        nextWeekPreview={nextWeekPreview}
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
