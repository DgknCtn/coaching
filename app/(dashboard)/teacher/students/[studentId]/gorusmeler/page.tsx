import { notFound } from 'next/navigation'
import { CalendarCheck, CalendarClock, CalendarX, Clock } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { PageHeader } from '@/components/shared/page-header'
import { MetricTiles } from '@/components/shared/metric-tiles'
import {
  contactKindOf,
  deriveMainContact,
  nextContact,
  CONTACT_KIND_LABEL,
  type ServiceLike,
  type Weekday,
} from '@/lib/service-structure'
import { SessionsClient, type ServiceRow, type SessionRow } from './sessions-client'

// DERS & GÖRÜŞMELER (R7-04 Rev.3).
//
// Ekranın cevapladığı soru: "Bu öğrenciye bu ay hangi hizmetleri
// planladık, hangilerini gerçekten verdik ve aylık hizmet kaydı nerede?"
//
// SINIR: burası hizmetin GERÇEĞİNİ tutar. Tahakkuk ve tahsilatın
// ayrıntılı evi Finans ekranıdır; ikisi aynı gerçekleşmiş oturum
// kayıtlarına bakar ama para toplamı iki yerde yapılmaz.

export const dynamic = 'force-dynamic'

/** Ay seçicideki değer: 'YYYY-MM'. Yoksa içinde bulunulan ay. */
function parseMonthParam(raw: string | undefined): { year: number; month: number } {
  const match = raw?.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const year = Number(match[1])
    const month = Number(match[2])
    if (year >= 2000 && year <= 2100 && month >= 1 && month <= 12) return { year, month }
  }
  // İçinde bulunulan ay YEREL takvime göre — UTC'den okunsaydı ayın ilk
  // gecesi bir önceki ay açılırdı.
  const now = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
  const [y, m] = now.split('-').map(Number)
  return { year: y, month: m }
}

function monthLabel(year: number, month: number): string {
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(
    new Date(Date.UTC(year, month - 1, 15))
  )
}

/** 'YYYY-MM' — ay seçicinin bağlantı değeri. */
function monthParam(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export default async function StudentSessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  searchParams: Promise<{ ay?: string }>
}) {
  const { studentId } = await params
  const { ay } = await searchParams
  const { year, month } = parseMonthParam(ay)
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // OTURUMLARI TEMBEL ÜRET (016'daki ensure_student_check_ins kalıbı).
  //
  // Ayrı bir cron altyapısı kurmak yerine ekran açılışında üretiliyor.
  // RPC idempotent olduğu için tekrar çağrılması zararsız; hata verirse
  // ekran yine de çizilir — üretilememiş oturum, bütün sayfayı
  // göstermemek için yeterli bir sebep değil.
  const { error: generateError } = await supabase.rpc('generate_service_sessions', {
    p_student_id: studentId,
    p_year: year,
    p_month: month,
  })
  if (generateError) {
    console.error(
      '[gorusmeler] oturum üretilemedi:',
      JSON.stringify({ studentId, year, month, message: generateError.message })
    )
  }

  // Ayın sınırları — sorgu için gerçek anlara çevrilir.
  const monthStart = new Date(Date.UTC(year, month - 1, 1))
  const monthEnd = new Date(Date.UTC(month === 12 ? year + 1 : year, month % 12, 1))

  const [{ data: serviceRows }, { data: sessionRows }, { data: groupRows }] =
    await Promise.all([
      supabase
        .from('student_services')
        .select(
          'id, kind, participation, medium, group_id, weekday, start_time, planned_duration_minutes, start_date, submission_offset_minutes, finance_link, status'
        )
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .order('status')
        .order('weekday'),
      supabase
        .from('service_sessions')
        .select(
          'id, service_id, planned_at, actual_at, duration_minutes, status, attended, note, makeup_of_session_id'
        )
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .gte('planned_at', monthStart.toISOString())
        .lt('planned_at', monthEnd.toISOString())
        .order('planned_at'),
      supabase
        .from('student_groups')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('name'),
    ])

  const groupNames = new Map((groupRows ?? []).map((g) => [g.id, g.name as string]))

  const services: ServiceRow[] = (serviceRows ?? []).map((r) => ({
    id: r.id as string,
    kind: r.kind as 'ders' | 'kocluk',
    participation: r.participation as 'birebir' | 'grup',
    medium: r.medium as 'online' | 'yuz_yuze',
    groupId: (r.group_id as string | null) ?? null,
    groupName: r.group_id ? (groupNames.get(r.group_id as string) ?? null) : null,
    weekday: r.weekday as Weekday,
    startTime: (r.start_time as string).slice(0, 5),
    plannedDurationMinutes: r.planned_duration_minutes as number,
    startDate: r.start_date as string,
    submissionOffsetMinutes: r.submission_offset_minutes as number,
    financeLink: r.finance_link as ServiceRow['financeLink'],
    status: r.status as 'active' | 'passive',
  }))

  const sessions: SessionRow[] = (sessionRows ?? []).map((r) => ({
    id: r.id as string,
    serviceId: r.service_id as string,
    plannedAt: r.planned_at as string,
    actualAt: (r.actual_at as string | null) ?? null,
    durationMinutes: (r.duration_minutes as number | null) ?? null,
    status: r.status as SessionRow['status'],
    attended: (r.attended as boolean | null) ?? null,
    note: (r.note as string | null) ?? null,
    isMakeup: r.makeup_of_session_id !== null,
  }))

  // Ana temas ve sıradaki temas SAF MODÜLDEN gelir (lib/service-structure).
  // Öğretmene ana temas seçtirilmez; Koçluk > Birebir > Grup kuralıyla
  // sistem belirler ve Haftalık Akışın varsayılan Son Teslimini bu üretir.
  const asServiceLike: ServiceLike[] = services.map((s) => ({ ...s }))
  const mainContact = deriveMainContact(asServiceLike)
  const upcoming = nextContact(
    asServiceLike.filter((s) => s.status === 'active'),
    new Date()
  )

  // Aylık sayaçlar. İPTAL PLANLANANA SAYILMAZ: taraflar önceden
  // anlaşmışsa o hizmet hiç borç doğurmamıştır.
  const counted = sessions.filter((s) => s.status !== 'iptal')
  const done = counted.filter((s) => s.status === 'yapildi' && s.attended !== false)
  const pending = counted.filter((s) => s.status === 'planlandi' || s.status === 'ertelendi')
  const missed = counted.filter((s) => s.status === 'yapilmadi')

  const prev = month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Ders & Görüşmeler"
        subtitle="Verilen hizmetler, aylık görüşme kaydı ve ödeme durumu."
      />

      <MetricTiles
        metrics={[
          {
            label: 'Planlanan',
            value: counted.length,
            hint: `${monthLabel(year, month)} · temas`,
            icon: CalendarClock,
          },
          { label: 'Yapıldı', value: done.length, tone: 'success', icon: CalendarCheck },
          { label: 'Kalan', value: pending.length, icon: Clock },
          {
            label: 'Yapılmadı',
            value: missed.length,
            tone: missed.length > 0 ? 'destructive' : 'default',
            icon: CalendarX,
          },
        ]}
      />

      <SessionsClient
        studentId={studentId}
        services={services}
        sessions={sessions}
        groups={(groupRows ?? []).map((g) => ({ id: g.id as string, name: g.name as string }))}
        monthLabel={monthLabel(year, month)}
        prevMonthParam={monthParam(prev.year, prev.month)}
        nextMonthParam={monthParam(next.year, next.month)}
        mainContactId={mainContact?.id ?? null}
        mainContactLabel={
          mainContact ? CONTACT_KIND_LABEL[contactKindOf(mainContact)] : null
        }
        nextContactAt={upcoming?.at.toISOString() ?? null}
        nextContactServiceId={upcoming?.service.id ?? null}
        // "Durum güncellenmedi" kararı için referans an. Sunucudan
        // geçiyor ki istemcinin saati kaymış olsa da ekran aynı şeyi
        // söylesin.
        nowIso={new Date().toISOString()}
      />
    </div>
  )
}
