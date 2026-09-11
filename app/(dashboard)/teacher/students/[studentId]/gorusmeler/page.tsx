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

  // AYIN KİMLİĞİ — 'YYYY-MM-01'.
  //
  // Artık tarih ARALIĞI değil, view'ın hesapladığı `attributed_month`
  // kullanılıyor. Fark kritik: telafi kaydının kendi `planned_at`'i
  // Ekim'de olsa bile Eylül'ün borcuna aittir (§7-C) ve aralıkla
  // süzülen bir sorgu onu Ekim'e koyuyordu.
  const attributedMonth = `${year}-${String(month).padStart(2, '0')}-01`

  const [
    { data: serviceRows },
    { data: sessionRows },
    { data: groupRows },
    { data: monthCounters },
    { data: archiveRows },
    { data: monthFinanceRows },
    { data: seasonRows },
  ] = await Promise.all([
      supabase
        .from('student_services')
        .select(
          'id, kind, participation, medium, group_id, weekday, start_time, planned_duration_minutes, start_date, submission_offset_minutes, finance_link, status'
        )
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .order('status')
        .order('weekday'),
      // 082: satırın ayı `attributed_month`'tan gelir — telafi asıl
      // ayın listesinde görünür, kendi ayında değil.
      supabase
        .from('student_service_session_view')
        .select(
          'id, service_id, group_session_id, planned_at, actual_at, duration_minutes, status, attended, note, makeup_of_session_id, makeup_decision, origin_planned_at'
        )
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .eq('attributed_month', attributedMonth)
        .order('planned_at'),
      supabase
        .from('student_groups')
        .select('id, name')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('name'),
      // Sayaçlar da AYNI kuraldan (075). Ekran kendi toplamını
      // hesaplasaydı listeyle ayrışabilirdi.
      supabase
        .from('student_service_month_view')
        .select('service_id, kind, planlanan, yapilan, bekleyen, yapilmayan, iptal')
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .eq('ay', attributedMonth),
      // GEÇMİŞ AYLAR (§3 no.6: "Aylık hizmet kayıtları silinmez;
      // arşivlenir"). Ay ay ileri geri gitmek yerine doğrudan atlamak
      // için son on iki ayın özeti.
      supabase
        .from('student_service_month_view')
        .select('ay, planlanan, yapilan, yapilmayan')
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .order('ay', { ascending: false })
        .limit(60),
      // ÖDEME DURUMU (§7 no.4) — yalnız bu ay.
      //
      // FİNANS 'owner'A KİLİTLİ (066). Sahip olmayan bir öğretmen için
      // sorgu boş döner; ekran rozeti hiç göstermez. Hata verilmiyor:
      // görmemesi gereken bir şeyin yokluğu bir arıza değil.
      supabase
        .from('student_month_finance_view')
        .select('accrued_kurus, collected_kurus, balance_kurus')
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .eq('month_start', attributedMonth)
        .maybeSingle(),
      // SEZON ÖZETİ (§9). Oturum sayıları herkese, parasal sütunlar
      // yalnız sahibe görünür — view security_invoker.
      supabase
        .from('student_season_summary_view')
        .select(
          'birebir_ders_count, birebir_ders_minutes, grup_ders_count, grup_ders_minutes, kocluk_count, kocluk_minutes, total_count, total_minutes, accrued_kurus, collected_kurus, balance_kurus'
        )
        .eq('student_id', studentId)
        .eq('workspace_id', workspaceId)
        .maybeSingle(),
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
    groupSessionId: (r.group_session_id as string | null) ?? null,
    isMakeup: r.makeup_of_session_id !== null,
    makeupDecision: (r.makeup_decision as 'pending' | 'waived' | null) ?? null,
    originPlannedAt: (r.origin_planned_at as string | null) ?? null,
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

  // AYLIK SAYAÇLAR ARTIK VIEW'DAN (075).
  //
  // Burada JavaScript'te yeniden hesaplanıyordu ve telafi ay atfını
  // görmüyordu. İki yerde iki hesap, iki farklı sayı demekti; şimdi
  // toplama yalnız view satırlarını topluyor.
  //
  // İPTAL PLANLANANA SAYILMAZ: view'ın `planlanan` sütunu zaten iptali
  // dışarıda bırakıyor — taraflar önceden anlaşmışsa o hizmet hiç borç
  // doğurmamıştır.
  const counters = (monthCounters ?? []) as {
    service_id: string
    kind: 'ders' | 'kocluk'
    planlanan: number
    yapilan: number
    bekleyen: number
    yapilmayan: number
    iptal: number
  }[]
  const sum = (key: 'planlanan' | 'yapilan' | 'bekleyen' | 'yapilmayan') =>
    counters.reduce((n, c) => n + Number(c[key] ?? 0), 0)

  // Hizmet bazlı sayaçlar (§3 no.3: "Grup 4/5", "Koçluk 3/4").
  const serviceCounters = counters.map((c) => ({
    serviceId: c.service_id,
    planned: Number(c.planlanan ?? 0),
    done: Number(c.yapilan ?? 0),
  }))

  // Geçmiş aylar — bulunulan ay listede tekrar edilmez.
  const archive = ((archiveRows ?? []) as { ay: string; planlanan: number; yapilan: number; yapilmayan: number }[])
    .filter((r) => r.ay !== attributedMonth)
    .slice(0, 12)
    .map((r) => {
      const [ry, rm] = r.ay.split('-').map(Number)
      return {
        param: monthParam(ry, rm),
        label: monthLabel(ry, rm),
        planned: Number(r.planlanan ?? 0),
        done: Number(r.yapilan ?? 0),
        missed: Number(r.yapilmayan ?? 0),
      }
    })

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
            value: sum('planlanan'),
            hint: `${monthLabel(year, month)} · temas`,
            icon: CalendarClock,
          },
          { label: 'Yapıldı', value: sum('yapilan'), tone: 'success', icon: CalendarCheck },
          { label: 'Kalan', value: sum('bekleyen'), icon: Clock },
          {
            label: 'Yapılmadı',
            value: sum('yapilmayan'),
            tone: sum('yapilmayan') > 0 ? 'destructive' : 'default',
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
        serviceCounters={serviceCounters}
        archive={archive}
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
        monthFinance={
          monthFinanceRows
            ? {
                accruedKurus: Number(monthFinanceRows.accrued_kurus ?? 0),
                collectedKurus: Number(monthFinanceRows.collected_kurus ?? 0),
                balanceKurus: Number(monthFinanceRows.balance_kurus ?? 0),
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
                // null = finans satırlarını görme yetkisi yok.
                accruedKurus:
                  seasonRows.accrued_kurus == null ? null : Number(seasonRows.accrued_kurus),
                collectedKurus:
                  seasonRows.collected_kurus == null
                    ? null
                    : Number(seasonRows.collected_kurus),
                balanceKurus:
                  seasonRows.balance_kurus == null ? null : Number(seasonRows.balance_kurus),
              }
            : null
        }
      />
    </div>
  )
}
