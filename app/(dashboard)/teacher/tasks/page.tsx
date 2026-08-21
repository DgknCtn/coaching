import Link from 'next/link'
import { CheckCircle2, Clock, MessageSquareDashed } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { formatRelativeTime } from '@/lib/student-attention'
import { COUNTER_LABEL } from '@/lib/homework-status'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { DataTable, type Column } from '@/components/shared/data-table'
import { ApprovalActions } from './approval-actions'
import { BulkApprovalBar, type ApprovalGroup } from './bulk-approval-bar'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const FILTERS = ['approval', 'overdue', 'checkin'] as const
type Filter = (typeof FILTERS)[number]

const TABS: { key: Filter; label: string }[] = [
  { key: 'approval', label: COUNTER_LABEL.pendingApproval },
  { key: 'overdue', label: COUNTER_LABEL.overdue },
  { key: 'checkin', label: 'Durum bildirimi bekleyen' },
]

/** Supabase iç içe select'i tek kayıt için de dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

type ItemRow = {
  id: string
  submitted_at: string | null
  homework_batch_id: string
  book_id: string | null
  homework_batches: Nested<{
    due_date: string
    student_id: string
    students: Nested<{ full_name: string | null }>
  }>
  books: Nested<{ title: string | null }>
  book_sections: Nested<{ title: string | null }>
  book_tests: Nested<{ title: string | null }>
}

type CheckInRow = {
  student_id: string
  student_full_name: string | null
  last_check_in_at: string | null
  pending_check_in_since: string | null
}

const ITEM_SELECT = `
  id, submitted_at, homework_batch_id, book_id,
  homework_batches!inner(due_date, student_id, status, students(full_name)),
  books(title),
  book_sections(title),
  book_tests(title)
`

function daysBetween(from: string, to = new Date()): number {
  const ms = to.getTime() - new Date(from).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

export default async function TeacherTasksPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter: rawFilter } = await searchParams
  const filter: Filter = FILTERS.includes(rawFilter as Filter)
    ? (rawFilter as Filter)
    : 'approval'

  const { supabase, workspaceId } = await getTeacherContext()

  let itemRows: ItemRow[] = []
  let checkInRows: CheckInRow[] = []

  if (filter === 'approval') {
    const { data } = await supabase
      .from('homework_items')
      .select(ITEM_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending_approval')
      .eq('homework_batches.status', 'active')
      .order('submitted_at', { ascending: true })
    itemRows = (data ?? []) as unknown as ItemRow[]
  } else if (filter === 'overdue') {
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('homework_items')
      .select(ITEM_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .eq('homework_batches.status', 'active')
      .lt('homework_batches.due_date', today)
    itemRows = (data ?? []) as unknown as ItemRow[]
    itemRows.sort((a, b) => {
      const da = one(a.homework_batches)?.due_date ?? ''
      const db = one(b.homework_batches)?.due_date ?? ''
      return da.localeCompare(db)
    })
  } else {
    await supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId })
    const { data } = await supabase
      .from('teacher_student_overview_view')
      .select('student_id, student_full_name, last_check_in_at, pending_check_in_since')
      .eq('workspace_id', workspaceId)
      .not('pending_check_in_since', 'is', null)
    checkInRows = ((data ?? []) as CheckInRow[]).sort((a, b) =>
      (a.pending_check_in_since ?? '').localeCompare(b.pending_check_in_since ?? '')
    )
  }

  // Onay kuyruğunu öğrenci + ödev + kitap bazında grupla; birden fazla test
  // içeren gruplar toplu onaylanabilir hale gelsin (R3 v2 §E).
  const approvalGroups: ApprovalGroup[] = []
  if (filter === 'approval') {
    const map = new Map<string, ApprovalGroup>()
    for (const row of itemRows) {
      const key = `${row.homework_batch_id}:${row.book_id ?? '-'}`
      const existing = map.get(key)
      if (existing) {
        existing.count++
        continue
      }
      map.set(key, {
        key,
        batchId: row.homework_batch_id,
        bookId: row.book_id,
        studentName: one(one(row.homework_batches)?.students)?.full_name ?? '—',
        bookTitle: one(row.books)?.title ?? 'Kitap',
        count: 1,
      })
    }
    approvalGroups.push(...map.values())
  }

  const studentColumn: Column<ItemRow> = {
    key: 'student',
    header: 'Öğrenci',
    render: (r) => {
      const batch = one(r.homework_batches)
      return (
        <div>
          <p className="font-medium">{one(batch?.students)?.full_name ?? '—'}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {one(r.books)?.title ?? ''} · {one(r.book_sections)?.title ?? ''}
          </p>
        </div>
      )
    },
  }

  const testColumn: Column<ItemRow> = {
    key: 'test',
    header: 'Çalışma',
    hideBelow: 'sm',
    render: (r) => <span className="text-sm">{one(r.book_tests)?.title ?? '—'}</span>,
  }

  const approvalColumns: Column<ItemRow>[] = [
    studentColumn,
    testColumn,
    {
      key: 'submitted',
      header: 'Gönderildi',
      hideBelow: 'md',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(r.submitted_at)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => <ApprovalActions homeworkItemId={r.id} />,
    },
  ]

  const overdueColumns: Column<ItemRow>[] = [
    studentColumn,
    testColumn,
    {
      key: 'due',
      header: 'Teslim',
      align: 'center',
      render: (r) => {
        const due = one(r.homework_batches)?.due_date
        return (
          <span className="text-sm text-muted-foreground">
            {due ? new Date(due).toLocaleDateString('tr-TR') : '—'}
          </span>
        )
      },
    },
    {
      key: 'lateness',
      header: 'Gecikme',
      align: 'right',
      render: (r) => {
        const due = one(r.homework_batches)?.due_date
        return (
          <span className="text-sm font-medium text-destructive">
            {due ? `${daysBetween(due)} gün` : '—'}
          </span>
        )
      },
    },
  ]

  const checkInColumns: Column<CheckInRow>[] = [
    {
      key: 'student',
      header: 'Öğrenci',
      render: (r) => <span className="font-medium">{r.student_full_name}</span>,
    },
    {
      key: 'due',
      header: 'Beklenen bildirim',
      hideBelow: 'sm',
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {formatRelativeTime(r.pending_check_in_since)}
        </span>
      ),
    },
    {
      key: 'last',
      header: 'Son temas',
      align: 'right',
      render: (r) => (
        <span className="text-sm text-destructive">
          {formatRelativeTime(r.last_check_in_at)}
        </span>
      ),
    },
  ]

  const count = filter === 'checkin' ? checkInRows.length : itemRows.length

  return (
    <div className="max-w-5xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Görevler"
        subtitle="Bugün aksiyon almanı bekleyen işler."
      />

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/teacher/tasks?filter=${t.key}`}
            className={cn(
              'rounded-md border px-3 py-1.5 text-sm transition-colors',
              t.key === filter
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      <Section
        title={TABS.find((t) => t.key === filter)!.label}
        description={count ? `${count} kayıt` : undefined}
        variant="card"
      >
        {filter === 'checkin' ? (
          <DataTable
            columns={checkInColumns}
            rows={checkInRows}
            rowKey={(r) => r.student_id}
            rowHref={(r) => `/teacher/students/${r.student_id}`}
            rowLabel={(r) => `${r.student_full_name} detayına git`}
            empty={{
              icon: MessageSquareDashed,
              title: 'Bekleyen durum bildirimi yok',
              description: '24 saati geçmiş cevapsız bildirim bulunmuyor.',
            }}
          />
        ) : filter === 'approval' ? (
          <div className="space-y-3">
            <BulkApprovalBar groups={approvalGroups} />
            <DataTable
            columns={approvalColumns}
            rows={itemRows}
            rowKey={(r) => r.id}
            empty={{
              icon: CheckCircle2,
              title: 'Onay kuyruğu boş',
              description: 'Öğretmen onayı bekleyen çalışma yok.',
            }}
            />
          </div>
        ) : (
          <DataTable
            columns={overdueColumns}
            rows={itemRows}
            rowKey={(r) => r.id}
            rowHref={(r) => `/teacher/students/${one(r.homework_batches)?.student_id}`}
            rowLabel={(r) =>
              `${one(one(r.homework_batches)?.students)?.full_name} detayına git`
            }
            empty={{
              icon: Clock,
              title: 'Geciken çalışma yok',
              description: 'Teslim tarihi geçmiş tamamlanmamış görev bulunmuyor.',
            }}
          />
        )}
      </Section>
    </div>
  )
}
