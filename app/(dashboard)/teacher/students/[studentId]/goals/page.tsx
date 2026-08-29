import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap, type BookMapBook } from '@/lib/book-map'
import { resolvePlanScope, type PlanScope } from '@/lib/plan-scope'
import { calculatePlanTempo } from '@/lib/plan-pace'
import {
  BOOK_PLAN_GROUP_LABEL,
  bookPlanGroup,
  bookPlanStatusLabel,
  bookRoleLabel,
  targetTypeLabel,
  type BookPlanGroup,
} from '@/lib/resource-plan'
import { formatTempo, formatUnitCount, unitLabel } from '@/lib/unit-labels'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { ProgressBar } from '@/components/shared/progress-bar'
import { Section } from '@/components/shared/section'

// Öğrenci Kaynak Planı (R5.1).
//
// Cevapladığı soru: "Bu kaynak bu öğrenci için neden kullanılıyor, ne
// kadarının tamamlanmasını planladık ve hedef tarihe göre neredeyiz?"
//
// Bu ekran eski "Hedef" ekranının yerine geçer. Eski sürüm
// student_book_progress_view'dan besleniyordu ve KAPSAM-DUYARLI DEĞİLDİ:
// hedef yalnız birkaç bölüm olsa bile kitabın tamamı üzerinden yüzde
// gösteriyordu. Artık veri loadBookMap + resolvePlanScope'tan gelir.
//
// İKİ AYRI YÜZDE (§3.2) — karıştırılmamalı:
//   Plan %  = hedef kapsamında onaylanan / hedef kapsam toplamı  (ANA gösterge)
//   Kitap % = kitapta onaylanan / kitabın takip edilebilir toplamı (fiziksel bilgi)
// 420 testlik kitapta 276 hedef ve 276 onay -> Plan %100, Kitap %66.

export const dynamic = 'force-dynamic'

const GROUP_ORDER: BookPlanGroup[] = ['active', 'pending', 'completed']

export default async function StudentResourcePlanPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, exam_type, grade_level, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // Bekliyor ve Hedef Tamamlandı grupları da görünmeli; loadBookMap'in
  // varsayılanı yalnız 'active'dir.
  const books = await loadBookMap(supabase, {
    workspaceId,
    studentId,
    statuses: ['active', 'pending', 'paused', 'completed'],
  })

  const grouped = new Map<BookPlanGroup, BookMapBook[]>()
  for (const book of books) {
    const group = bookPlanGroup(book.status)
    grouped.set(group, [...(grouped.get(group) ?? []), book])
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6 md:p-8">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} — Kaynak Planı`}
        subtitle="Her kaynağın rolü, hedef kapsamı ve hedef tarihe göre durumu"
        badges={
          <>
            {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
            {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
          </>
        }
      />

      {books.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={BookOpen}
            title="Atanmış kaynak yok"
            description="Bu öğrenciye kitap atandığında kaynak planı burada görünür."
          />
        </div>
      ) : (
        GROUP_ORDER.map(group => {
          const groupBooks = grouped.get(group) ?? []
          if (groupBooks.length === 0) return null
          return (
            <Section key={group} title={BOOK_PLAN_GROUP_LABEL[group]}>
              <div className="space-y-3">
                {groupBooks.map(book => (
                  <ResourceCard key={book.assignmentId} studentId={studentId} book={book} />
                ))}
              </div>
            </Section>
          )
        })
      )}

      <p className="text-xs text-muted-foreground">
        Plan % hedef kapsamı üzerinden hesaplanır ve ana göstergedir. Kitap % kaynağın
        fiziksel kapsamını gösterir; plan tamamlanmış olsa bile daha düşük olabilir.
        Onay bekleyen çalışma plan hesabına girmez.
      </p>
    </div>
  )
}

function ResourceCard({ studentId, book }: { studentId: string; book: BookMapBook }) {
  const scope: PlanScope = resolvePlanScope(book)

  const tempo = calculatePlanTempo({
    startDate: scope.startDate,
    targetEndDate: scope.targetEndDate,
    totalUnits: scope.totalUnits,
    completedUnits: scope.completedUnits,
    trackingMode: book.trackingMode,
  })

  // Onay bekleyen AYRI gösterilir ve plana girmez (§3.4, KP-02).
  const pendingApproval = book.sections.reduce(
    (n, s) => n + s.tests.filter(t => t.state === 'pending_approval').length,
    0
  )

  const role = bookRoleLabel(book.role)
  const remaining = Math.max(0, scope.totalUnits - scope.completedUnits)

  return (
    <Link
      href={`/teacher/students/${studentId}/books/${book.bookId}`}
      className="block rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{book.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <span>{bookPlanStatusLabel(book.status)}</span>
            {role && (
              <>
                <span aria-hidden>·</span>
                <span>{role}</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>{targetTypeLabel(scope.scopeType)}</span>
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold tabular-nums">%{scope.percentage}</p>
          <p className="text-[11px] text-muted-foreground">Plan</p>
        </div>
      </div>

      <ProgressBar value={scope.percentage} label={`${book.title} plan ilerlemesi`} />

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Plan kapsamı</dt>
          <dd className="mt-0.5 tabular-nums">
            {scope.completedUnits} / {scope.totalUnits} {unitLabel(book.trackingMode)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Planda kalan</dt>
          <dd className="mt-0.5 tabular-nums">
            {formatUnitCount(remaining, book.trackingMode)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Hedef tarih</dt>
          <dd className="mt-0.5 tabular-nums">
            {scope.targetEndDate
              ? new Date(scope.targetEndDate).toLocaleDateString('tr-TR')
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Gerekli tempo</dt>
          <dd className="mt-0.5 tabular-nums">
            {tempo.isTargetReached
              ? `${formatUnitCount(tempo.remainingUnits, book.trackingMode)} kaldı`
              : formatTempo(tempo.requiredPacePerWeek, book.trackingMode)}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-2 text-[11px] text-muted-foreground">
        <span>
          Kitap kapsamı: {scope.bookCompletedUnits} / {scope.bookTotalUnits} ·{' '}
          <span className="tabular-nums">%{scope.bookPercentage}</span>
        </span>
        {pendingApproval > 0 && (
          <span className="text-info-foreground">
            {formatUnitCount(pendingApproval, book.trackingMode)} onay bekliyor
          </span>
        )}
        {scope.scopeType !== 'whole_book' && <span>Kapsam: {scope.label}</span>}
      </div>
    </Link>
  )
}
