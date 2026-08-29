import Link from 'next/link'
import { CheckCircle2, Clock, MessageSquareDashed } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { formatRelativeTime } from '@/lib/student-attention'
import { COUNTER_LABEL, todayDateString } from '@/lib/homework-status'
import {
  groupTasksByStudent,
  taskGroupLabel,
  type TaskRowLike,
  type TaskStudentGroup,
} from '@/lib/task-grouping'
import { formatUnitCount } from '@/lib/unit-labels'
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
    title: string | null
    student_id: string
    students: Nested<{ full_name: string | null }>
  }>
  books: Nested<{ title: string | null; tracking_mode: string | null }>
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
  homework_batches!inner(due_date, title, student_id, status, students(full_name)),
  books(title, tracking_mode),
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
  searchParams: Promise<{ filter?: string; student?: string }>
}) {
  const { filter: rawFilter, student: rawStudent } = await searchParams
  const filter: Filter = FILTERS.includes(rawFilter as Filter)
    ? (rawFilter as Filter)
    : 'approval'

  // R6-10: öğrenci detayındaki sayaçlar bu ekranı O ÖĞRENCİYE daraltarak
  // açar. Global sayaçlarla öğrenci bağlamı bilinçli olarak ayrıdır;
  // parametre URL'de olduğu için tarayıcı geri tuşu ve yenileme doğru çalışır.
  const studentFilter =
    rawStudent && /^[0-9a-f-]{36}$/i.test(rawStudent) ? rawStudent : null

  const { supabase, workspaceId } = await getTeacherContext()

  let itemRows: ItemRow[] = []
  let checkInRows: CheckInRow[] = []

  if (filter === 'approval') {
    let query = supabase
      .from('homework_items')
      .select(ITEM_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending_approval')
      .eq('homework_batches.status', 'active')
    if (studentFilter) query = query.eq('homework_batches.student_id', studentFilter)
    const { data } = await query.order('submitted_at', { ascending: true })
    itemRows = (data ?? []) as unknown as ItemRow[]
  } else if (filter === 'overdue') {
    // R6-02: yerel takvim günü. UTC günü kullanmak gece saatlerinde
    // gecikmiş kalemleri listeden düşürüyordu.
    const today = todayDateString()
    let query = supabase
      .from('homework_items')
      .select(ITEM_SELECT)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .eq('homework_batches.status', 'active')
      .lt('homework_batches.due_date', today)
    if (studentFilter) query = query.eq('homework_batches.student_id', studentFilter)
    const { data } = await query
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
      // R6-08: drawer onay öncesi içeriği göstermek zorunda, bu yüzden
      // grup yalnız sayı değil kalemlerin kendisini de taşır. Ek sorgu
      // yok — veri zaten elimizdeki pending approvals sonucundan geliyor.
      const item = {
        id: row.id,
        sectionTitle: one(row.book_sections)?.title ?? null,
        unitTitle: one(row.book_tests)?.title ?? null,
        submittedAt: row.submitted_at,
      }
      const existing = map.get(key)
      if (existing) {
        existing.count++
        existing.items.push(item)
        continue
      }
      map.set(key, {
        key,
        batchId: row.homework_batch_id,
        bookId: row.book_id,
        batchTitle: one(row.homework_batches)?.title ?? null,
        dueDate: one(row.homework_batches)?.due_date ?? null,
        studentName: one(one(row.homework_batches)?.students)?.full_name ?? '—',
        bookTitle: one(row.books)?.title ?? 'Kitap',
        trackingMode: one(row.books)?.tracking_mode ?? 'test',
        count: 1,
        items: [item],
      })
    }
    approvalGroups.push(...map.values())
  }

  // R6-09: Öğrenci > Ödev/Kaynak > Çalışma hiyerarşisi. Veri yapısı
  // değişmez; yalnız sorgu sonucu görüntüleme katmanında gruplanır.
  type GroupedRow = ItemRow & TaskRowLike
  const groupedRows: GroupedRow[] = itemRows.map((r) => {
    const batch = one(r.homework_batches)
    return {
      ...r,
      studentId: batch?.student_id ?? '—',
      studentName: one(batch?.students)?.full_name ?? '—',
      batchId: r.homework_batch_id,
      batchTitle: batch?.title ?? null,
      dueDate: batch?.due_date ?? null,
      bookId: r.book_id,
      bookTitle: one(r.books)?.title ?? 'Kaynak',
      trackingMode: one(r.books)?.tracking_mode ?? 'test',
    }
  })
  const studentGroups = groupTasksByStudent(groupedRows)

  // R6-09: Öğrenci ve ödev/kaynak bilgisi artık grup BAŞLIĞINDA duruyor;
  // satırda tekrar etmesi gereksiz gürültüydü. Satırın işi yalnız hangi
  // bölüm/çalışma olduğunu söylemek.
  const workColumn: Column<ItemRow> = {
    key: 'work',
    header: 'Çalışma',
    render: (r) => (
      <div className="min-w-0">
        <p className="truncate text-sm">{one(r.book_tests)?.title ?? '—'}</p>
        {one(r.book_sections)?.title && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {one(r.book_sections)?.title}
          </p>
        )}
      </div>
    ),
  }

  const approvalColumns: Column<ItemRow>[] = [
    workColumn,
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
    workColumn,
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
        subtitle={
          studentFilter
            ? `Tek öğrenciye daraltıldı: ${
                studentGroups[0]?.studentName ?? 'seçili öğrenci'
              }.`
            : 'Bugün aksiyon almanı bekleyen işler.'
        }
      />

      {/* R6-10: öğrenci bağlamı görünür ve geri dönülebilir olmalı. */}
      {studentFilter && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2 text-xs">
          <span className="text-muted-foreground">Yalnız bu öğrencinin çalışmaları gösteriliyor.</span>
          <Link href={`/teacher/tasks?filter=${filter}`} className="font-medium hover:underline">
            Tüm öğrencileri göster
          </Link>
          <Link
            href={`/teacher/students/${studentFilter}`}
            className="font-medium hover:underline"
          >
            Öğrenci detayı
          </Link>
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/teacher/tasks?filter=${t.key}${
              studentFilter ? `&student=${studentFilter}` : ''
            }`}
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
          <div className="space-y-4">
            <BulkApprovalBar groups={approvalGroups} />
            <GroupedTaskList
              groups={studentGroups}
              columns={approvalColumns}
              empty={{
                icon: CheckCircle2,
                title: 'Onay kuyruğu boş',
                description: 'Öğretmen onayı bekleyen çalışma yok.',
              }}
            />
          </div>
        ) : (
          <GroupedTaskList
            groups={studentGroups}
            columns={overdueColumns}
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

/**
 * Öğrenci > Ödev/Kaynak > Çalışma hiyerarşisi (R6-09).
 *
 * Tekil Onayla/Reddet düğmeleri satırlarda KALIR (kabul #56) — gruplama
 * yalnız görsel bir düzenlemedir, aksiyonları kaldırmaz.
 */
function GroupedTaskList({
  groups,
  columns,
  empty,
}: {
  groups: TaskStudentGroup<ItemRow & TaskRowLike>[]
  columns: Column<ItemRow>[]
  empty: { icon: typeof CheckCircle2; title: string; description: string }
}) {
  if (groups.length === 0) {
    return <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={empty} />
  }

  return (
    <div className="space-y-5">
      {groups.map((student) => (
        <section key={student.studentId} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link
              href={`/teacher/students/${student.studentId}`}
              className="text-sm font-medium hover:underline"
            >
              {student.studentName}
            </Link>
            <span className="text-xs tabular-nums text-muted-foreground">
              {student.count} çalışma
            </span>
          </div>

          {student.books.map((group) => (
            <div key={group.key} className="overflow-hidden rounded-lg border">
              <p className="flex flex-wrap items-baseline justify-between gap-2 border-b bg-muted/40 px-3 py-2 text-xs">
                <span className="truncate font-medium">{taskGroupLabel(group)}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {formatUnitCount(group.rows.length, group.trackingMode)}
                </span>
              </p>
              <DataTable columns={columns} rows={group.rows} rowKey={(r) => r.id} />
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}
