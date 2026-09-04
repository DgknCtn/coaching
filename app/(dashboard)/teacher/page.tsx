import Link from 'next/link'
import { ArrowUpRight, Plus, Users } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { describeStudentAttention, formatRelativeTime } from '@/lib/student-attention'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { TrialBanner } from '@/components/shared/trial-banner'
import { QuotaNotice } from '@/components/shared/quota-notice'
import { MetricRow } from '@/components/shared/metric-row'
import { COUNTER_LABEL, OVERDUE_HINT } from '@/lib/homework-status'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

type StudentRow = {
  student_id: string
  student_full_name: string | null
  exam_type: string | null
  current_week_assigned_tests: number | null
  current_week_completed_tests: number | null
  total_pending_approval_items: number | null
  total_overdue_items: number | null
  last_check_in_at: string | null
  pending_check_in_since: string | null
  is_check_in_overdue: boolean | null
}

export default async function TeacherDashboard() {
  const { supabase, workspaceId, activeTerm, profile, usage } = await getTeacherContext()

  // Lisansı olmayanlara deneme şeridi gösterilecek.
  const { data: licenseRow } = await supabase
    .from('workspace_licenses')
    .select('id')
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  const hasLicense = !!licenseRow

  // Durum bildirimleri tembel materyalize edilir (cron yok): planı olup
  // açık bildirimi olmayan öğrenciler için sıradaki kaydı açar. Idempotent.
  await supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId })

  const [{ data: students }, { count: bookCount }] = await Promise.all([
    supabase
      .from('teacher_student_overview_view')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('student_full_name'),
    // Kurulum adımları için: havuzda kaynak var mı? HEAD sayımı, satır
    // gövdesi taşınmaz.
    supabase
      .from('books')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'active'),
  ])

  // Aksiyon gerektiren öğrenciler üstte: kayıp temas > geciken > onay kuyruğu.
  // (describeStudentAttention ile aynı öncelik sırası.)
  const rows = ((students ?? []) as StudentRow[]).slice().sort((a, b) => {
    const score = (s: StudentRow) =>
      (s.is_check_in_overdue ? 1_000_000 : 0) +
      Number(s.total_overdue_items ?? 0) * 1_000 +
      Number(s.total_pending_approval_items ?? 0)
    return score(b) - score(a)
  })

  const weekAssigned = rows.reduce((sum, s) => sum + Number(s.current_week_assigned_tests ?? 0), 0)
  const weekCompleted = rows.reduce((sum, s) => sum + Number(s.current_week_completed_tests ?? 0), 0)
  const totalPendingApproval = rows.reduce(
    (sum, s) => sum + Number(s.total_pending_approval_items ?? 0),
    0
  )
  const totalOverdue = rows.reduce((sum, s) => sum + Number(s.total_overdue_items ?? 0), 0)
  const checkInWaiting = rows.filter((s) => s.is_check_in_overdue).length
  const weekRate = weekAssigned > 0 ? Math.round((weekCompleted / weekAssigned) * 100) : 0

  const firstName = profile.full_name.split(' ')[0]

  const columns: Column<StudentRow>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (s) => (
        <div>
          <p className="font-medium">{s.student_full_name}</p>
          {s.exam_type && (
            <p className="mt-0.5 text-xs text-muted-foreground">{s.exam_type}</p>
          )}
        </div>
      ),
    },
    {
      key: 'week',
      header: 'Bu hafta',
      align: 'center',
      render: (s) => (
        <span className="tabular-nums">
          {s.current_week_completed_tests ?? 0}
          <span className="text-muted-foreground">/{s.current_week_assigned_tests ?? 0}</span>
        </span>
      ),
    },
    {
      key: 'approval',
      header: COUNTER_LABEL.pendingApproval,
      align: 'center',
      hideBelow: 'sm',
      render: (s) =>
        Number(s.total_pending_approval_items) > 0 ? (
          <span className="tabular-nums font-medium">
            {s.total_pending_approval_items}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'overdue',
      header: COUNTER_LABEL.overdue,
      align: 'center',
      render: (s) =>
        Number(s.total_overdue_items) > 0 ? (
          <span className="tabular-nums text-destructive">{s.total_overdue_items}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'contact',
      header: 'Son durum / temas',
      hideBelow: 'md',
      render: (s) => (
        <span
          className={cn(
            'text-sm',
            s.is_check_in_overdue ? 'text-destructive' : 'text-muted-foreground'
          )}
        >
          {formatRelativeTime(s.last_check_in_at)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'right',
      render: (s) => {
        const attention = describeStudentAttention({
          pending_check_in_since: s.pending_check_in_since,
          pending_approval: s.total_pending_approval_items,
          overdue: s.total_overdue_items,
        })
        return (
          <span
            className={cn(
              'text-sm',
              attention.tone === 'attention' && 'font-medium text-destructive',
              attention.tone === 'warning' && 'font-medium text-foreground',
              attention.tone === 'none' && 'text-muted-foreground'
            )}
          >
            {attention.label}
          </span>
        )
      },
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
        }}
      />

      {usage && <QuotaNotice usage={usage} />}

      <MetricRow
        metrics={[
          {
            label: COUNTER_LABEL.pendingApproval,
            value: totalPendingApproval,
            href: '/teacher/tasks?filter=approval',
          },
          {
            label: COUNTER_LABEL.overdue,
            value: totalOverdue,
            hint: OVERDUE_HINT,
            href: '/teacher/tasks?filter=overdue',
          },
          {
            label: 'Durum bildirimi bekleyen',
            value: checkInWaiting,
            hint: '24 saati geçen',
            href: '/teacher/tasks?filter=checkin',
          },
          {
            label: 'Bu hafta tamamlanan',
            value: weekCompleted,
            subValue: `/${weekAssigned}`,
            hint: weekAssigned > 0 ? `%${weekRate}` : undefined,
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
