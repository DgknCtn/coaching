import { Badge } from '@/components/ui/badge'
import { StatusBadge } from '@/components/shared/status-badge'
import { MetricRow } from '@/components/shared/metric-row'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { ProgressBar } from '@/components/shared/progress-bar'

type MockStudent = (typeof mockStudents)[number]

const mockStudents = [
  {
    id: '1',
    name: 'Ayşe Yılmaz',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'green' as const,
    completion: 92,
    overdue: 0,
    books: 3,
  },
  {
    id: '2',
    name: 'Mehmet Kaya',
    exam: 'YKS',
    grade: '12. Sınıf',
    status: 'yellow' as const,
    completion: 67,
    overdue: 2,
    books: 4,
  },
  {
    id: '3',
    name: 'Zeynep Arslan',
    exam: 'YKS',
    grade: '11. Sınıf',
    status: 'red' as const,
    completion: 34,
    overdue: 5,
    books: 2,
  },
  {
    id: '4',
    name: 'Ali Rıza Demir',
    exam: 'LGS',
    grade: '8. Sınıf',
    status: 'green' as const,
    completion: 78,
    overdue: 1,
    books: 3,
  },
  {
    id: '5',
    name: 'Elif Şahin',
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
      <MetricRow
        metrics={[
          { label: 'Toplam öğrenci', value: 24 },
          { label: 'Haftalık tamamlama', value: '74%' },
          { label: 'Geciken ödev', value: 11 },
          { label: 'Risk altında', value: 3 },
        ]}
      />

      <Section title="Öğrenciler" description="2025–2026 YKS dönemi" variant="card">
        <DataTable columns={columns} rows={mockStudents} rowKey={(s) => s.id} />
      </Section>
    </div>
  )
}
