import { CalendarCheck, CalendarClock, Clock, RotateCcw } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { WeekSessions } from '@/components/sessions/week-sessions'
import { isAwaitingOutcome } from '@/lib/service-structure'
import { isoWeekKey, isValidWeekKey, shiftWeek, weekLabel, weekMonths, weekRange } from '@/lib/iso-week'
import {
  SESSION_SELECT,
  SERVICE_SELECT,
  mapServiceRow,
  mapSessionRow,
  monthsToGenerate,
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

export const dynamic = 'force-dynamic'

export default async function WeeklySessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ hafta?: string }>
}) {
  const { hafta } = await searchParams
  const now = new Date()
  const currentWeek = isoWeekKey(now)
  const week = isValidWeekKey(hafta) ? hafta : currentWeek
  const { supabase, workspaceId } = await getTeacherContext()

  // Tembel üretim, çalışma alanı düzeyinde tek çağrı (140). Hata ekranı
  // durdurmaz: üretilememiş oturum, haftayı göstermemek için sebep değil.
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

  const { from, to } = weekRange(week)

  const [{ data: sessionRows, error: sessionError }, { data: studentRows }, { data: groupRows }] =
    await Promise.all([
      supabase
        .from('student_service_session_view')
        .select(SESSION_SELECT)
        .eq('workspace_id', workspaceId)
        .gte('current_planned_at', from.toISOString())
        .lt('current_planned_at', to.toISOString())
        .order('current_planned_at')
        .limit(1000),
      supabase
        .from('students')
        .select('id, full_name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active'),
      supabase.from('student_groups').select('id, name').eq('workspace_id', workspaceId),
    ])

  if (sessionError) {
    console.error('[gorusmeler] hafta okunamadı:', sessionError.message)
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

  const awaiting = sessions.filter((s) =>
    isAwaitingOutcome({ status: s.status, effectiveAt: new Date(s.currentPlannedAt) }, now)
  ).length
  const makeupPending = sessions.filter((s) => s.makeupStatus === 'decision_pending').length

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Ders & Görüşmeler"
        subtitle="Bu hafta kimle ne var, ne yapıldı, ne taşındı, ne telafi bekliyor."
      />

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
            label: 'Durum bekliyor',
            value: awaiting,
            tone: awaiting > 0 ? 'warning' : 'default',
            icon: Clock,
          },
          {
            label: 'Telafi kararı',
            value: makeupPending,
            tone: makeupPending > 0 ? 'warning' : 'default',
            icon: RotateCcw,
          },
        ]}
      />

      <WeekSessions
        rows={sessions}
        services={infoById}
        weekTitle={weekLabel(week)}
        prevHref={`?hafta=${shiftWeek(week, -1)}`}
        nextHref={`?hafta=${shiftWeek(week, 1)}`}
        currentHref={`?hafta=${currentWeek}`}
        isCurrentWeek={week === currentWeek}
        nowIso={now.toISOString()}
        showStudent
        emptyHint="Esnek ritimli derslerin oturumları öğrencinin Ders & Görüşmeler sayfasından eklenir."
      />
    </div>
  )
}
