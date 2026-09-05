import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { academicYearLabel, demoRelative } from '@/lib/demo-data'
import { DataTable, type Column } from '@/components/shared/data-table'
import { ProgressBar } from '@/components/shared/progress-bar'

type MockStudent = (typeof mockStudents)[number]

const mockStudents = [
  {
    id: '1',
    name: 'Ayşe Y.',
    doneTasks: 8,
    totalTasks: 8,
    lastActiveDays: 0,
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'green' as const,
    completion: 92,
    overdue: 0,
    books: 3,
  },
  {
    id: '2',
    name: 'Mehmet K.',
    doneTasks: 5,
    totalTasks: 8,
    lastActiveDays: 2,
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'yellow' as const,
    completion: 67,
    overdue: 2,
    books: 4,
  },
  {
    id: '3',
    name: 'Zeynep A.',
    doneTasks: 3,
    totalTasks: 9,
    lastActiveDays: 4,
    exam: 'YKS',
    grade: '11. Sınıf',
    status: 'red' as const,
    completion: 34,
    overdue: 5,
    books: 2,
  },
  {
    id: '4',
    name: 'Ali Rıza D.',
    doneTasks: 7,
    totalTasks: 8,
    lastActiveDays: 0,
    exam: 'LGS',
    grade: '8. Sınıf',
    status: 'green' as const,
    completion: 78,
    overdue: 1,
    books: 3,
  },
  {
    id: '5',
    name: 'Elif Ş.',
    doneTasks: 4,
    totalTasks: 8,
    lastActiveDays: 1,
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'yellow' as const,
    completion: 55,
    overdue: 3,
    books: 5,
  },
]

export function TeacherDemo() {
  const columns: Column<MockStudent>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (s) => (
        <div>
          <p className="font-medium">{s.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.grade}</p>
        </div>
      ),
    },
    {
      key: 'exam',
      header: 'Sınav',
      hideBelow: 'sm',
      render: (s) => <Badge variant="neutral">{s.exam}</Badge>,
    },
    {
      key: 'status',
      header: 'Durum',
      align: 'center',
      render: (s) => <StatusBadge status={s.status} />,
    },
    {
      key: 'progress',
      header: 'İlerleme',
      hideBelow: 'md',
      className: 'w-40',
      render: (s) => (
        <div className="flex items-center gap-3">
          <ProgressBar value={s.completion} label={`${s.name} ilerlemesi`} className="w-20" />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
            {s.completion}%
          </span>
        </div>
      ),
    },
    {
      key: 'tasks',
      header: 'Ödevler',
      align: 'center',
      hideBelow: 'md',
      render: (s) => (
        <span className="tabular-nums">
          {s.doneTasks}
          <span className="text-muted-foreground">/{s.totalTasks}</span>
        </span>
      ),
    },
    {
      key: 'activity',
      header: 'Son Aktivite',
      hideBelow: 'lg',
      render: (s) => (
        <span className="text-muted-foreground">{demoRelative(s.lastActiveDays)}</span>
      ),
    },
    {
      key: 'overdue',
      header: 'Geciken',
      align: 'center',
      hideBelow: 'lg',
      render: (s) =>
        s.overdue > 0 ? (
          <span className="tabular-nums text-destructive">{s.overdue}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ]

  return (
    <div className="space-y-6">
      {/* SAYI DEĞİL, SORU. "Risk altında 3" bir veritabanı sayımı;
          "Kritik Öğrenci — müdahale gereken öğrenciler" öğretmenin
          zihninde bir iş. Kelime ürünün kendi rozet sözlüğünden
          (status-badge.tsx): kullanıcı kaydolduktan sonra AYNI kelimeyi
          görüyor, demoya özel bir dil uydurulmuyor. */}
      <MetricRow
        metrics={[
          { label: 'Aktif Öğrenci', value: 24 },
          { label: 'Bu Haftaki Görev Tamamlama', value: '74%' },
          { label: 'Geciken Görev', value: 11 },
          {
            label: 'Kritik Öğrenci',
            value: 3,
            hint: 'Müdahale gereken öğrenciler',
          },
        ]}
      />

      <Section
        title="Öğrenciler"
        description={`${academicYearLabel()} YKS dönemi`}
        variant="card"
      >
        <DataTable columns={columns} rows={mockStudents} rowKey={(s) => s.id} />
      </Section>
    </div>
  )
}
