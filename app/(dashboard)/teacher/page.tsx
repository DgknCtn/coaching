import Link from 'next/link'
import { ArrowUpRight, Bell, CalendarDays, Clock, FileText, Plus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import {
  computeStudentStatus,
  expectedProgressPercent,
  noticeSignal,
} from '@/lib/student-status'
import { localDateString, todayDateString } from '@/lib/homework-status'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { TrialBanner } from '@/components/shared/trial-banner'
import { QuotaNotice } from '@/components/shared/quota-notice'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { Section } from '@/components/shared/section'
import { StudentsTable, type DashboardRow } from './students-table'

export const dynamic = 'force-dynamic'

/** 080 · teacher_student_operation_view — Dashboard'un tek kaynağı. */
type StudentRow = {
  student_id: string
  student_full_name: string | null
  exam_type: string | null
  grade_level: string | null
  flow_started_at: string | null
  weekly_total: number | null
  weekly_submitted: number | null
  weekly_submitted_percent: number | null
  approval_pending_count: number | null
  overdue_work_count: number | null
  last_check_in_at: string | null
  status_update_due_at: string | null
  has_important_note: boolean | null
  next_contact_at: string | null
  next_contact_kind: 'ders' | 'kocluk' | null
  next_contact_participation: 'birebir' | 'grup' | null
  submission_cutoff_at: string | null
}

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

/**
 * "Cuma 18:00" / "Bugün 20:00" / "24 Eyl 09:00" (§6).
 *
 * Bir hafta içindeki temaslar GÜN ADIYLA yazılıyor: "Cuma 18:00"
 * öğretmenin takviminde doğrudan bir yere oturur, "19.09 18:00" ise
 * zihinsel çeviri ister. Bir haftayı aşanlarda gün adı ayırt edici
 * olmaktan çıktığı için tarihe dönülüyor.
 */
function formatContactMoment(at: Date, now: Date): string {
  const time = at.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
  if (localDateString(at) === localDateString(now)) return `Bugün ${time}`

  const days = Math.floor((at.getTime() - now.getTime()) / 86_400_000)
  if (days < 7) return `${DAY_NAMES[at.getDay()]} ${time}`

  return `${at.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} ${time}`
}

/** "5 saat kaldı" / "2 gün kaldı" — §6'nın operasyonel bağlamı. */
function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'zamanı geldi'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) return `${Math.max(1, hours)} saat kaldı`
  return `${Math.floor(hours / 24)} gün kaldı`
}

export default async function TeacherDashboard() {
  const { supabase, workspaceId, activeTerm, profile, usage } = await getTeacherContext()

  // İLK DALGA — birbirinden bağımsız olan her şey aynı anda.
  //
  // Önceden lisans sorgusu, check-in RPC'si ve aşağıdaki üçlü ARDIŞIK
  // çalışıyordu: dashboard açılışı dört ayrı gidiş-dönüş bekliyordu.
  // Yalnız öğrenci listesi RPC'ye bağımlı (aşağıya bakınız); geri kalanın
  // sırayla beklemesi için hiçbir sebep yoktu.
  const [{ data: licenseRow }, { count: bookCount }, { count: homeworkCount }] =
    await Promise.all([
      // Lisansı olmayanlara deneme şeridi gösterilecek.
      supabase
        .from('workspace_licenses')
        .select('id')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .maybeSingle(),
      // Kurulum adımları için: havuzda kaynak var mı? HEAD sayımı, satır
      // gövdesi taşınmaz.
      supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'active'),
      // Kurulum adımları için: hiç ödev verilmiş mi? Aynı HEAD sayımı
      // kalıbı; tek sorulan "sıfır mı, değil mi".
      supabase
        .from('homework_batches')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId),
      // Durum bildirimleri tembel materyalize edilir (cron yok): planı olup
      // açık bildirimi olmayan öğrenciler için sıradaki kaydı açar.
      // Idempotent.
      //
      // BU DALGANIN İÇİNDE ama sonucu okunmuyor: yazdığı satırları
      // AŞAĞIDAKİ öğrenci listesi okuyor, o yüzden ondan önce bitmeli.
      // (student/page.tsx'te aynı kalıp kullanılıyor.)
      supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId }),
    ])
  const hasLicense = !!licenseRow

  const [{ data: students }, { data: upcomingSessions }] = await Promise.all([
    supabase
      .from('teacher_student_operation_view')
      .select('*')
      .eq('workspace_id', workspaceId),
    // BUGÜNKÜ TEMASLAR (§3 kart 4). Öğrenci başına "sıradaki" temastan
    // türetilemez: bir öğrencinin aynı gün iki görüşmesi olabilir ve
    // yalnız biri "sıradaki"dir. Pencere geniş tutulup gün YEREL
    // takvimle aşağıda eleniyor — sabit bir +03:00 varsaymamak için.
    supabase
      .from('service_sessions')
      .select('id, planned_at, actual_at, status, student_services(kind)')
      .eq('workspace_id', workspaceId)
      .in('status', ['planlandi', 'ertelendi'])
      .gte('planned_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
      .lte('planned_at', new Date(Date.now() + 2 * 86_400_000).toISOString()),
  ])

  const now = new Date()
  const today = todayDateString(now)

  const todaySessions = (upcomingSessions ?? []).filter((s) => {
    const at = (s.actual_at ?? s.planned_at) as string | null
    return at !== null && localDateString(new Date(at)) === today
  })
  const todayLessons = todaySessions.filter(
    (s) =>
      (Array.isArray(s.student_services) ? s.student_services[0] : s.student_services)
        ?.kind === 'ders'
  ).length
  const todayCoaching = todaySessions.length - todayLessons

  const raw = (students ?? []) as StudentRow[]

  // Durum motoru satır satır burada çalışır (lib/student-status.ts).
  // View yalnız GİRDİLERİ döndürüyor; eşikler SQL'e gömülmedi ki
  // ayarlanabilir kalsınlar (§7 notu).
  const rows = raw.map((s) => {
    const cutoff = s.submission_cutoff_at ? new Date(s.submission_cutoff_at) : null
    const status = computeStudentStatus({
      submittedPercent: Number(s.weekly_submitted_percent ?? 0),
      expectedPercent: expectedProgressPercent({
        startedAt: s.flow_started_at ? new Date(s.flow_started_at) : null,
        submissionCutoffAt: cutoff,
        now,
      }),
      msToNextContact: s.next_contact_at
        ? new Date(s.next_contact_at).getTime() - now.getTime()
        : null,
      overdueWorkCount: Number(s.overdue_work_count ?? 0),
      checkInOverdueHours: s.status_update_due_at
        ? Math.max(
            0,
            (now.getTime() - new Date(s.status_update_due_at).getTime()) / 3_600_000
          )
        : 0,
      submissionCutoffPassed: cutoff !== null && cutoff.getTime() < now.getTime(),
    })
    return { ...s, computed: status }
  })

  // SIRALAMA: next_contact_at ASC (§6). Alfabetik sıralama KALDIRILDI —
  // "Bugünkü görüşmeler en üstte; ardından yarın ve sonraki günler
  // gelir. Temassız öğrenciler listenin sonunda kalır."
  rows.sort((a, b) => {
    const ta = a.next_contact_at ? new Date(a.next_contact_at).getTime() : Infinity
    const tb = b.next_contact_at ? new Date(b.next_contact_at).getTime() : Infinity
    if (ta !== tb) return ta - tb
    // Temassızlar arasında en azından sabit bir sıra kalsın.
    return (a.student_full_name ?? '').localeCompare(b.student_full_name ?? '', 'tr')
  })

  // Üst kartlar — §4'ün "yayılımı göster" kuralı: tek sayı yerine
  // çalışma + kaç öğrenciyi etkilediği birlikte.
  const submittedWork = rows.reduce((n, s) => n + Number(s.approval_pending_count ?? 0), 0)
  const submittedStudents = rows.filter((s) => Number(s.approval_pending_count ?? 0) > 0).length
  const overdueWork = rows.reduce((n, s) => n + Number(s.overdue_work_count ?? 0), 0)
  const overdueStudents = rows.filter((s) => Number(s.overdue_work_count ?? 0) > 0).length
  const checkInWaiting = rows.filter((s) => s.status_update_due_at !== null).length

  const firstName = profile.full_name.split(' ')[0]

  // SATIRLAR SUNUCUDA HAZIRLANIR (§5'in kolon sırasıyla: Öğrenci |
  // Teslim | Onay | Bildirim / Not | Sonraki Temas | Durum).
  //
  // Tablo artık istemci bileşeni (arama ve filtre için) ama eşikler,
  // saat farkları ve bildirim sinyali BURADA hesaplanıyor. İstemciye
  // ham zaman damgası geçilseydi, saati kaymış bir kullanıcıda "Bugün"
  // etiketi başka bir güne düşerdi.
  const tableRows: DashboardRow[] = rows.map((s) => {
    const notice = noticeSignal({
      checkInOverdueHours: s.status_update_due_at
        ? Math.max(
            0,
            (now.getTime() - new Date(s.status_update_due_at).getTime()) / 3_600_000
          )
        : 0,
      hasImportantNote: s.has_important_note === true,
      hasCheckedIn: s.last_check_in_at !== null,
    })

    const contactAt = s.next_contact_at ? new Date(s.next_contact_at) : null

    return {
      id: s.student_id,
      name: s.student_full_name ?? 'İsimsiz öğrenci',
      meta: [s.grade_level, s.exam_type].filter(Boolean).join(' · ') || null,

      weeklyTotal: Number(s.weekly_total ?? 0),
      weeklySubmitted: Number(s.weekly_submitted ?? 0),
      weeklyPercent: Number(s.weekly_submitted_percent ?? 0),

      approvalPending: Number(s.approval_pending_count ?? 0),

      noticeLabel: notice.label,
      noticeKind: notice.kind,

      contactLabel: contactAt ? formatContactMoment(contactAt, now) : null,
      contactLeft: contactAt ? formatTimeLeft(contactAt.getTime() - now.getTime()) : null,
      contactKindLabel: contactAt
        ? s.next_contact_kind === 'kocluk'
          ? 'Koçluk'
          : 'Ders'
        : null,
      contactIsToday: contactAt !== null && localDateString(contactAt) === today,

      status: s.computed.status,
    }
  })

  return (
    <div className="max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader
        title={`Merhaba, ${firstName}`}
        subtitle={activeTerm ? `${activeTerm.name} dönemi aktif` : 'Henüz aktif dönem yok'}
        action={
          <Button size="sm" render={<Link href="/teacher/students/new" />}>
            <Plus />
            Öğrenci Ekle
          </Button>
        }
      />

      {/* Deneme şeridi kurulum adımlarının ÜSTÜNDE: süre dolduğunda
          çalışma alanı kapanıyor (057), yani bu diğer her şeyden daha
          zaman duyarlı. Abonelik kurulduysa hiç görünmez. */}
      <TrialBanner
        trialEndsAt={usage?.trialEndsAt ?? null}
        hasLicense={hasLicense}
      />

      {/* Kurulum adımları tek bir kartta toplandı: önceden yalnız "dönem
          yok" uyarısı vardı ve kullanıcı sonraki iki adımı (kitap, öğrenci)
          kendi başına keşfetmek zorundaydı. Üçü de tamamlanınca kart
          tamamen kaybolur. */}
      <OnboardingChecklist
        state={{
          hasTerm: !!activeTerm,
          hasBook: (bookCount ?? 0) > 0,
          hasStudent: rows.length > 0,
          hasHomework: (homeworkCount ?? 0) > 0,
        }}
        firstStudentId={rows[0]?.student_id ?? null}
      />

      {usage && <QuotaNotice usage={usage} />}

      {/* §4'ün dört kartı. "Bu hafta tamamlanan" KALDIRILDI: belge
          "öğrenci bazında anlamlı olmadığı için toplam kart gereksiz"
          diyor. Kalan üçü tek sayı yerine YAYILIMI gösteriyor —
          "27 çalışma · 4 öğrenci" bir sayıdan fazlasını söyler. */}
      <MetricTiles
        className="xl:grid-cols-4"
        metrics={[
          {
            label: 'Öğrenciden Teslim Edilen',
            value: submittedWork,
            icon: FileText,
            hint: `${submittedStudents} öğrenci · kontrol bekliyor`,
            href: '/teacher/tasks?filter=approval',
          },
          {
            label: 'Süresi Geçen',
            value: overdueWork,
            // OVERDUE_HINT ("Beklenenler içinde") burada KULLANILMIYOR:
            // o ipucu, yanında "Bekleyen" sayacı dururken gecikenlerin
            // onun alt kümesi olduğunu anlatmak için vardı. Bu şeritte
            // öyle bir komşu yok; ipucu bağlamsız kalıp kafa karıştırırdı.
            hint: `${overdueStudents} öğrenci · teslim tarihi geçen`,
            href: '/teacher/tasks?filter=overdue',
            icon: Clock,
            tone: overdueWork > 0 ? 'destructive' : 'default',
          },
          {
            label: 'Durum Bildirimi Bekleyen',
            value: checkInWaiting,
            hint: 'öğrenci · beklenen bildirimi geciken',
            href: '/teacher/tasks?filter=checkin',
            icon: Bell,
            tone: checkInWaiting > 0 ? 'warning' : 'default',
          },
          {
            // HEDEFİ YOK ve bu bilinçli: belge bu kartı "sıradaki
            // ders/koçluk listesi"ne bağlamak istiyor ama öyle bir ekran
            // yok. Kırık bir bağlantı koymaktansa bağlantısız bırakmak
            // doğru — aşağıdaki tablo zaten sıradaki temasa göre sıralı
            // ve bugünküler en üstte.
            label: 'Yaklaşan Temaslar',
            value: todaySessions.length === 0 ? 'Bugün yok' : `Bugün ${todaySessions.length}`,
            icon: CalendarDays,
            hint:
              todaySessions.length > 0
                ? `${todayLessons} ders · ${todayCoaching} koçluk`
                : undefined,
          },
        ]}
      />

      <Section
        title="Öğrenci Takibi"
        description={
          rows.length
            ? `Toplam ${rows.length} öğrenci · sonraki temas tarihine göre sıralanır.`
            : undefined
        }
        variant="card"
        action={
          <Button variant="ghost" size="sm" render={<Link href="/teacher/students" />}>
            Tümünü gör
            <ArrowUpRight />
          </Button>
        }
      >
        <StudentsTable rows={tableRows} />
      </Section>
    </div>
  )
}
