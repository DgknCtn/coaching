import { CalendarCheck, CalendarClock, Clock, RotateCcw } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { WeekSessions, type SessionMoney } from '@/components/sessions/week-sessions'
import { LinkTabs, type LinkTab } from '@/components/shared/link-tabs'
import { sessionPaymentStates } from '@/lib/finance-ledger'
import type { FinanceModelVersion } from '@/lib/pricing-history'
import { ACCRUAL_SELECT, PAYMENT_SELECT, mapAccrual, mapPayment } from '../finans/data'
import { isAwaitingOutcome } from '@/lib/service-structure'
import { isoWeekKey, isValidWeekKey, shiftWeek, weekLabel, weekMonths, weekRange } from '@/lib/iso-week'
import {
  SESSION_SELECT,
  SERVICE_SELECT,
  mapServiceRow,
  findUnpricedSessions,
  mapSessionRow,
  monthsToGenerate,
  quickCollectSessionIds,
  serviceInfo,
} from '../students/[studentId]/gorusmeler/load'

// DERS & GÖRÜŞMELER — koç geneli haftalık operasyon ekranı (M1.0-02 §4).
//
// "Bugün kimle ne var, ne yapıldı, ne taşındı, ne telafi bekliyor?"
// Mevcut hafta ve bugün 5 saniyede anlaşılmalı (§12 UI kabul): tablo
// kronolojik, bugünün satırları vurgulu, durumu güncellenmemiş oturum
// sarı rozetle öne çıkar.
//
// Satır davranışları öğrenci sayfasıyla AYNI bileşenden gelir.
//
// ============================================================
// EKLE (M1.0-04): ?gorunum=tum-telafiler — HAFTA SINIRI OLMAYAN telafi listesi
//
// Mevcut "Telafi kararı" metriği yalnız SEÇİLİ HAFTANIN satırlarından
// sayıyordu; geçmiş haftalarda karar verilmemiş telafiler hiç
// görünmüyordu. Belgenin kendi metni: "Aynı veri öğretmenin genel
// ekranında tüm öğrencilerde birikmiş telafileri tek listede
// gösterebilir." Yeni tablo/RPC gerekmiyor — aynı
// `student_service_session_view` (140) hafta filtresi olmadan,
// `makeup_status='decision_pending'` ile sorgulanıyor.
//
// Bu modda finans hesaplaması (unpriced/quickCollect/money) ve haftalık
// "Bu hafta"/"Yapıldı"/"Sonuç bekleyen" metrikleri BİLİNÇLİ OLARAK
// atlanıyor — bunlar "bu hafta ne oldu" sorusuna cevap veriyor, bu
// görünüm ise "hangi telafi kararları hâlâ bekliyor" sorusuna. İkisini
// aynı sayılarla göstermek yanıltıcı olurdu.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function WeeklySessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ hafta?: string; gorunum?: string }>
}) {
  const { hafta, gorunum } = await searchParams
  const now = new Date()
  const currentWeek = isoWeekKey(now)
  const week = isValidWeekKey(hafta) ? hafta : currentWeek
  const { supabase, workspaceId, role } = await getTeacherContext()

  const allPendingMode = gorunum === 'tum-telafiler'

  // Tembel üretim, çalışma alanı düzeyinde tek çağrı (140). Hata ekranı
  // durdurmaz: üretilememiş oturum, haftayı göstermemek için sebep değil.
  // "Tüm bekleyenler" modunda GEREKMEZ: telafi kararı bekleyen oturumlar
  // zaten var olan kayıtlardır, bir hafta penceresinin takvimden
  // üretilmesine bağlı değildir.
  if (!allPendingMode) {
    for (const { year, month } of monthsToGenerate(weekMonths(week))) {
      const { error } = await supabase.rpc('generate_workspace_sessions', {
        p_workspace_id: workspaceId,
        p_year: year,
        p_month: month,
      })
      if (error) {
        console.error('[gorusmeler] çalışma alanı oturumları üretilemedi:', JSON.stringify({ year, month, message: error.message }))
      }
    }
  }

  const { from, to } = weekRange(week)

  const sessionQuery = allPendingMode
    ? supabase
        .from('student_service_session_view')
        .select(SESSION_SELECT)
        .eq('workspace_id', workspaceId)
        .eq('makeup_status', 'decision_pending')
        .order('current_planned_at')
        .limit(1000)
    : supabase
        .from('student_service_session_view')
        .select(SESSION_SELECT)
        .eq('workspace_id', workspaceId)
        .gte('current_planned_at', from.toISOString())
        .lt('current_planned_at', to.toISOString())
        .order('current_planned_at')
        .limit(1000)

  const [{ data: sessionRows, error: sessionError }, { data: studentRows }, { data: groupRows }] =
    await Promise.all([
      sessionQuery,
      supabase
        .from('students')
        .select('id, full_name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active'),
      supabase.from('student_groups').select('id, name').eq('workspace_id', workspaceId),
    ])

  if (sessionError) {
    console.error('[gorusmeler] oturumlar okunamadı:', JSON.stringify({ allPendingMode, message: sessionError.message }))
  }

  const names = new Map((studentRows ?? []).map((s) => [s.id as string, s.full_name as string]))
  // Arşivli öğrencinin oturumu haftalık operasyonda görünmez (M1.0-01 §1.1).
  const sessions = (sessionRows ?? [])
    .filter((r) => names.has(r.student_id as string))
    .map((r) => mapSessionRow(r as Record<string, unknown>, names.get(r.student_id as string)))

  const serviceIds = Array.from(new Set(sessions.map((s) => s.serviceId)))
  const { data: serviceRows } = serviceIds.length
    ? await supabase.from('student_services').select(SERVICE_SELECT).in('id', serviceIds)
    : { data: [] }
  const groupNames = new Map((groupRows ?? []).map((g) => [g.id as string, g.name as string]))
  const infoById = Object.fromEntries(
    (serviceRows ?? []).map((r) => {
      const svc = mapServiceRow(r as Record<string, unknown>, groupNames)
      return [svc.id, serviceInfo(svc)]
    })
  )

  // Finans yalnız sahibe (finans RLS'i zaten başkasına boş döner):
  // "Fiyatsız" uyarısı, satırdaki tahsil durumu ve hızlı tahsil akışı.
  // "Tüm bekleyenler" modunda hiç hesaplanmıyor — bkz. dosya başı notu.
  let unpricedIds: string[] = []
  let quickCollectIds: string[] = []
  const money: Record<string, SessionMoney> = {}
  const weekStudents = Array.from(new Set(sessions.map((s) => s.studentId)))
  if (!allPendingMode && role === 'owner' && weekStudents.length > 0) {
    const [{ data: accrualRows }, { data: paymentRows }, { data: modelRows }] = await Promise.all([
      supabase.from('finance_lessons').select(ACCRUAL_SELECT).eq('workspace_id', workspaceId).in('student_id', weekStudents),
      supabase.from('finance_payments').select(PAYMENT_SELECT).eq('workspace_id', workspaceId).in('student_id', weekStudents),
      supabase
        .from('student_finance_models')
        .select('student_id, model, collection_timing, valid_from, created_at')
        .in('student_id', weekStudents),
    ])
    const modelsByStudent = new Map<string, FinanceModelVersion[]>()
    for (const m of (modelRows ?? []) as Record<string, unknown>[]) {
      const list = modelsByStudent.get(m.student_id as string) ?? []
      list.push({
        model: m.model as FinanceModelVersion['model'],
        collectionTiming: m.collection_timing as FinanceModelVersion['collectionTiming'],
        validFrom: m.valid_from as string,
        createdAt: m.created_at as string,
      })
      modelsByStudent.set(m.student_id as string, list)
    }
    const accruals = ((accrualRows ?? []) as Record<string, unknown>[]).map(mapAccrual)
    const payments = ((paymentRows ?? []) as Record<string, unknown>[]).map(mapPayment)
    // FIFO öğrenci başına: bir öğrencinin ödemesi diğerinin dersini kapatmaz.
    for (const studentId of weekStudents) {
      const states = sessionPaymentStates(
        accruals.filter((x) => x.studentId === studentId),
        payments.filter((x) => x.studentId === studentId)
      )
      for (const [id, state] of states) money[id] = state
    }
    const services = (serviceRows ?? []).map((r) => mapServiceRow(r as Record<string, unknown>, groupNames))
    unpricedIds = findUnpricedSessions({
      sessions,
      financeLinkByService: new Map(services.map((x) => [x.id, x.financeLink])),
      modelsByStudent,
      accruedSessionIds: new Set(accruals.map((x) => x.sessionId).filter((x): x is string => !!x)),
    })
    quickCollectIds = quickCollectSessionIds({
      sessions,
      serviceById: new Map(services.map((x) => [x.id, x])),
      modelsByStudent,
    })
  }

  const awaiting = sessions.filter((s) =>
    isAwaitingOutcome({ status: s.status, effectiveAt: new Date(s.currentPlannedAt) }, now)
  ).length
  // "Tüm bekleyenler" modunda `sessions` ZATEN yalnız bekleyen telafiler
  // — sayı doğrudan uzunluk. Hafta modunda ise seçili haftanın satırları
  // arasından sayılıyor (eski davranış, değişmedi).
  const makeupPending = allPendingMode
    ? sessions.length
    : sessions.filter((s) => s.makeupStatus === 'decision_pending').length

  const tabs: LinkTab[] = [
    { key: 'hafta', label: 'Bu hafta', href: '/teacher/gorusmeler' },
    { key: 'tum-telafiler', label: 'Tüm bekleyenler', href: '/teacher/gorusmeler?gorunum=tum-telafiler' },
  ]

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Ders & Görüşmeler"
        subtitle={
          allPendingMode
            ? 'Hafta sınırı olmadan, kararı bekleyen tüm telafiler.'
            : 'Bu hafta kimle ne var, ne yapıldı, ne taşındı, ne telafi bekliyor.'
        }
      />

      <LinkTabs tabs={tabs} activeKey={allPendingMode ? 'tum-telafiler' : 'hafta'} ariaLabel="Görünüm seçimi" />

      {allPendingMode ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{makeupPending}</span> bekleyen telafi — tüm öğrenciler, tüm zamanlar.
        </p>
      ) : (
        <MetricTiles
          className="xl:grid-cols-4"
          metrics={[
            {
              label: 'Bu hafta',
              value: sessions.filter((s) => s.status !== 'iptal').length,
              hint: 'oturum',
              icon: CalendarClock,
            },
            {
              label: 'Yapıldı',
              value: sessions.filter((s) => s.status === 'yapildi').length,
              tone: 'success',
              icon: CalendarCheck,
            },
            {
              // M1.0-04 dil düzeltmesi: "Durum bekliyor" belirsizdi —
              // "Telafi kararı" kutusuyla karıştırılıyordu. Bu metrik
              // dersin zamanı GEÇTİĞİ hâlde Yapıldı/İptal/Yapılmadı
              // İŞARETLENMEDİĞİ oturumları sayıyor (isAwaitingOutcome).
              label: 'Sonuç bekleyen',
              value: awaiting,
              tone: awaiting > 0 ? 'warning' : 'default',
              icon: Clock,
            },
            {
              label: 'Telafi kararı',
              value: makeupPending,
              tone: makeupPending > 0 ? 'warning' : 'default',
              icon: RotateCcw,
              // EKLE: bu hafta içindeki sayıdan "tüm bekleyenler"
              // listesine geçiş — aynı metrik, iki farklı pencere.
              href: '/teacher/gorusmeler?gorunum=tum-telafiler',
            },
          ]}
        />
      )}

      <WeekSessions
        rows={sessions}
        services={infoById}
        weekTitle={allPendingMode ? 'Tüm bekleyen telafiler' : weekLabel(week)}
        prevHref={`?hafta=${shiftWeek(week, -1)}`}
        nextHref={`?hafta=${shiftWeek(week, 1)}`}
        currentHref={`?hafta=${currentWeek}`}
        isCurrentWeek={week === currentWeek}
        hideWeekNav={allPendingMode}
        nowIso={now.toISOString()}
        showStudent
        unpricedIds={unpricedIds}
        quickCollectIds={quickCollectIds}
        money={money}
        financeDetail={!allPendingMode && role === 'owner'}
        emptyTitle={allPendingMode ? 'Bekleyen telafi yok' : undefined}
        emptyHint={
          allPendingMode
            ? 'Kararı bekleyen telafi oturumu yok.'
            : 'Esnek ritimli derslerin oturumları öğrencinin Ders & Görüşmeler sayfasından eklenir.'
        }
      />
    </div>
  )
}
