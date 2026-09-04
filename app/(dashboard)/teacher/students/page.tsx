import Link from 'next/link'
import { Plus, Users } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { QuotaNotice } from '@/components/shared/quota-notice'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { StatusBadge } from '@/components/shared/status-badge'
import { ProgressBar } from '@/components/shared/progress-bar'

export const dynamic = 'force-dynamic'

type StudentRow = {
  student_id: string
  student_full_name: string | null
  exam_type: string | null
  grade_level: string | null
  current_week_assigned_tests: number | null
  current_week_completed_tests: number | null
  overdue_tests: number | null
  completion_percentage: number | null
  risk_status: string | null
}

export default async function StudentsPage() {
  const { supabase, workspaceId, usage } = await getTeacherContext()

  const { data: students } = await supabase
    .from('teacher_student_overview_view')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')
    .limit(500)

  const rows = (students ?? []) as StudentRow[]

  const columns: Column<StudentRow>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (s) => (
        <div>
          <p className="font-medium">{s.student_full_name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {[s.exam_type, s.grade_level].filter(Boolean).join(' · ')}
          </p>
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
      key: 'overdue',
      header: 'Geciken',
      align: 'center',
      render: (s) =>
        Number(s.overdue_tests) > 0 ? (
          <span className="tabular-nums text-destructive">{s.overdue_tests}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      key: 'progress',
      header: 'İlerleme',
      hideBelow: 'md',
      className: 'w-40',
      render: (s) => (
        <div className="flex items-center gap-3">
          <ProgressBar
            value={Number(s.completion_percentage ?? 0)}
            label={`${s.student_full_name} ilerlemesi`}
            className="w-20"
          />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {s.completion_percentage ?? 0}%
          </span>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'center',
      render: (s) => <StatusBadge status={s.risk_status ?? 'neutral'} />,
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (s) => (
        <Button
          variant="ghost"
          size="sm"
          render={<Link href={`/teacher/students/${s.student_id}`} />}
        >
          Detay
        </Button>
      ),
    },
  ]

  return (
    <div className="max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Öğrenciler"
        subtitle={rows.length ? `${rows.length} öğrenci` : undefined}
        action={
          <Button size="sm" render={<Link href="/teacher/students/new" />}>
            <Plus />
            Yeni Öğrenci
          </Button>
        }
      />

      {/* Kota göstergesi burada: yeni öğrenci düğmesinin hemen altında,
          yani sınıra dayanmış bir öğretmen düğmeye basmadan ÖNCE görüyor. */}
      {usage && <QuotaNotice usage={usage} />}

      <Section variant="card">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(s) => s.student_id}
          empty={{
            icon: Users,
            title: 'Henüz öğrenci yok',
            description: 'İlk öğrencini ekleyerek takip etmeye başla.',
            action: { label: 'İlk öğrenciyi ekle', href: '/teacher/students/new' },
          }}
        />
      </Section>
    </div>
  )
}
