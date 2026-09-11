import Link from 'next/link'
import { ArrowUpRight, Plus, Users } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import {
  computeStudentStatus,
  expectedProgressPercent,
  noticeSignal,
  STATUS_LABEL,
  type StudentStatus,
} from '@/lib/student-status'
import { localDateString, todayDateString } from '@/lib/homework-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { TrialBanner } from '@/components/shared/trial-banner'
import { QuotaNotice } from '@/components/shared/quota-notice'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { cn } from '@/lib/utils'

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

/** Durum etiketinin rozet varyantı — renk YALNIZ sinyal verir (§8). */
const STATUS_VARIANT: Record<StudentStatus, 'success' | 'warning' | 'destructive' | 'neutral'> = {
  yolunda: 'success',
  takip_et: 'warning',
  geride: 'warning',
  mudahale: 'destructive',
}

type Row = StudentRow & { computed: ReturnType<typeof computeStudentStatus> }

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

  // §5'in kolon sırası: Öğrenci | Teslim | Onay | Bildirim / Not |
  // Sonraki Temas | Durum. "Bu hafta" sütunu KALDIRILDI — belge: "0/0
  // veya 0/75 gibi değerler tek başına neyi temsil ettiğini yeterince
  // anlatmıyor."
  const columns: Column<Row>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (s) => (
        <div>
          <p className="font-medium">{s.student_full_name}</p>
          {(s.grade_level || s.exam_type) && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              {[s.grade_level, s.exam_type].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'submitted',
      header: 'Teslim',
      align: 'center',
      render: (s) => {
        const total = Number(s.weekly_total ?? 0)
        if (total === 0) {
          return <span className="text-muted-foreground">—</span>
        }
        return (
          <span className="tabular-nums">
            {s.weekly_submitted ?? 0}
            <span className="text-muted-foreground">/{total}</span>
            <span className="ml-1.5 text-xs text-muted-foreground">
              %{s.weekly_submitted_percent ?? 0}
            </span>
          </span>
        )
      },
    },
    {
      key: 'approval',
      header: 'Onay',
      align: 'center',
      hideBelow: 'sm',
      render: (s) =>
        Number(s.approval_pending_count) > 0 ? (
          <span className="font-medium tabular-nums">{s.approval_pending_count}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'notice',
      header: 'Bildirim / Not',
      hideBelow: 'md',
      render: (s) => {
        // NOT İÇERİĞİ BURAYA HİÇ GELMİYOR — view yalnız boolean
        // döndürüyor (§8, ekran paylaşımı gerekçesi).
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
        return (
          <span
            className={cn(
              'text-sm',
              notice.kind === 'check_in_late' && 'font-medium text-warning-foreground',
              notice.kind === 'none' && 'text-muted-foreground'
            )}
          >
            {notice.kind === 'check_in_done' && '✓ '}
            {notice.label}
          </span>
        )
      },
    },
    {
      key: 'contact',
      header: 'Sonraki Temas',
      render: (s) => {
        if (!s.next_contact_at) {
          return <span className="text-sm text-muted-foreground">Planlanmadı</span>
        }
        const at = new Date(s.next_contact_at)
        const isToday = localDateString(at) === today
        return (
          <div className="text-sm">
            <p className={cn(isToday && 'font-medium')}>
              {/* BUGÜN yalnız küçük bir etiketle vurgulanır; satır
                  yoğun renge boyanmaz (§6, §10.7). */}
              {isToday && (
                <span className="mr-1.5 rounded border border-warning-border bg-warning-subtle px-1 py-0.5 text-[10px] font-medium tracking-wide text-warning-foreground">
                  BUGÜN
                </span>
              )}
              {formatContactMoment(at, now)}
            </p>
            <p className="text-xs text-muted-foreground">
              {s.next_contact_kind === 'kocluk' ? 'Koçluk' : 'Ders'}
              {' · '}
              {formatTimeLeft(at.getTime() - now.getTime())}
            </p>
          </div>
        )
      },
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'right',
      render: (s) => (
        <Badge variant={STATUS_VARIANT[s.computed.status]}>
          {STATUS_LABEL[s.computed.status]}
        </Badge>
      ),
    },
  ]

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
      <MetricRow
        metrics={[
          {
            label: 'Öğrenciden Teslim Edilen',
            value: submittedWork,
            subValue: 'çalışma',
            hint: `${submittedStudents} öğrenci · kontrol bekliyor`,
            href: '/teacher/tasks?filter=approval',
          },
          {
            label: 'Süresi Geçen',
            value: overdueWork,
            subValue: 'çalışma',
            // OVERDUE_HINT ("Beklenenler içinde") burada KULLANILMIYOR:
            // o ipucu, yanında "Bekleyen" sayacı dururken gecikenlerin
            // onun alt kümesi olduğunu anlatmak için vardı. Bu şeritte
            // öyle bir komşu yok; ipucu bağlamsız kalıp kafa karıştırırdı.
            hint: `${overdueStudents} öğrenci · teslim tarihi geçen`,
            href: '/teacher/tasks?filter=overdue',
          },
          {
            label: 'Durum Bildirimi Bekleyen',
            value: checkInWaiting,
            subValue: 'öğrenci',
            hint: 'beklenen bildirimi geciken',
            href: '/teacher/tasks?filter=checkin',
          },
          {
            // HEDEFİ YOK ve bu bilinçli: belge bu kartı "sıradaki
            // ders/koçluk listesi"ne bağlamak istiyor ama öyle bir ekran
            // yok. Kırık bir bağlantı koymaktansa bağlantısız bırakmak
            // doğru — aşağıdaki tablo zaten sıradaki temasa göre sıralı
            // ve bugünküler en üstte.
            label: 'Yaklaşan Temaslar',
            value: todaySessions.length,
            subValue: todaySessions.length === 0 ? 'bugün yok' : 'bugün',
            hint:
              todaySessions.length > 0
                ? `${todayLessons} ders · ${todayCoaching} koçluk`
                : undefined,
          },
        ]}
      />

      <Section
        title="Öğrenci durumu"
        description={rows.length ? `${rows.length} öğrenci` : undefined}
        variant="card"
        action={
          <Button variant="ghost" size="sm" render={<Link href="/teacher/students" />}>
            Tümünü gör
            <ArrowUpRight />
          </Button>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.student_id}
          rowHref={(s) => `/teacher/students/${s.student_id}`}
          rowLabel={(s) => `${s.student_full_name} detayına git`}
          empty={{
            icon: Users,
            title: 'Henüz öğrenci yok',
            description: 'İlk öğrencini ekleyerek takip etmeye başla.',
            action: { label: 'Öğrenci Ekle', href: '/teacher/students/new' },
          }}
        />
      </Section>
    </div>
  )
}
