import Link from 'next/link'
import { ArrowUpRight, Plus, Users } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { describeStudentAttention, formatRelativeTime } from '@/lib/student-attention'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { AlertBanner } from '@/components/shared/alert-banner'
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
  const { supabase, workspaceId, activeTerm, profile } = await getTeacherContext()

  // Durum bildirimleri tembel materyalize edilir (cron yok): planı olup
  // açık bildirimi olmayan öğrenciler için sıradaki kaydı açar. Idempotent.
  await supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId })

  const { data: students } = await supabase
    .from('teacher_student_overview_view')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')

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
      header: 'Onay bekleyen',
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
      header: 'Geciken',
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

      {!activeTerm && (
        <AlertBanner
          tone="info"
          title="Başlamak için bir eğitim dönemi oluşturun"
          description="Dönem tanımlamadan ödev ve ilerleme takibi yapılamaz."
          action={
            <Button variant="outline" size="sm" render={<Link href="/teacher/terms" />}>
              Dönem oluştur
            </Button>
          }
        />
      )}

      <MetricRow
        metrics={[
          {
            label: 'Onay bekleyen',
            value: totalPendingApproval,
            href: '/teacher/tasks?filter=approval',
          },
          {
            label: 'Geciken çalışma',
            value: totalOverdue,
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
