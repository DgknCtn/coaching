import Link from 'next/link'
import { unitLabel } from '@/lib/unit-labels'
import { ResourceMap } from './resource-map'
import { ResourcePlanCard } from './plan-card'
import { notFound } from 'next/navigation'
import { BookOpen, Plus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { resolveInterimScope, resolvePlanScope } from '@/lib/plan-scope'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricRow } from '@/components/shared/metric-row'
import { PageHeader } from '@/components/shared/page-header'
import { ProgressBar } from '@/components/shared/progress-bar'
import { PlanTempoCard } from '@/components/shared/plan-tempo-card'
import { Section } from '@/components/shared/section'
import { TargetCard } from './target-card'
import { VideoPreference } from './video-preference'

export const dynamic = 'force-dynamic'

export default async function StudentBookDetailPage({
  params,
}: {
  params: Promise<{ studentId: string; bookId: string }>
}) {
  const { studentId, bookId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, grade_level, exam_type, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // Durumlar Kitap Haritası ile aynı yükleyiciden gelir; bu sayfa ile harita
  // aynı test için aynı aktif durumu göstermek zorunda (R3 v2 "Tutarlılık").
  //
  // R5.1: Bekliyor ve Hedef Tamamlandı durumundaki kaynaklar da açılabilmeli.
  // loadBookMap'in varsayılanı yalnız 'active' olduğu için o kaynaklara
  // Kaynak Planı'ndan tıklandığında bu sayfa notFound() veriyordu.
  //
  // Aidiyet kontrolü de buradan gelir: loadBookMap zaten student_id ve
  // workspace_id ile süzüyor, sonuç boşsa kitap bu öğrenciye atanmamıştır.
  // Önceden bu kontrol student_book_progress_view üzerinden yapılıyordu ama
  // o view yalnız status='active' satırları döndürdüğü için Bekliyor ve
  // Hedef Tamamlandı kaynakları açılamıyordu.
  const [book] = await loadBookMap(supabase, {
    workspaceId,
    studentId,
    bookIds: [bookId],
    statuses: ['active', 'pending', 'paused', 'completed'],
  })

  if (!book) notFound()

  // Plan matematiği hedef kapsamından beslenir (R4 §5). Hedef yoksa kapsam
  // tüm kitaptır ve değerler view'inkiyle birebir aynı kalır.
  const scope = resolvePlanScope(book)
  const interim = resolveInterimScope(book)
  const totalTests = scope.totalUnits
  const completedTests = scope.completedUnits
  const pendingApprovalCount = book.sections.reduce(
    (sum, s) => sum + s.tests.filter(t => t.state === 'pending_approval').length,
    0
  )
  const overdueCount = book.sections.reduce(
    (sum, s) => sum + s.tests.filter(t => t.state === 'overdue').length,
    0
  )
  const percentage =
    totalTests === 0 ? 0 : Math.round((completedTests / totalTests) * 100)

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-6 md:p-8">
      <PageHeader
        backHref={`/teacher/students/${studentId}`}
        title={`${student.full_name} › ${book.title}`}
        subtitle={[book.subject, book.publisher].filter(Boolean).join(' · ')}
        badges={
          // R6-16: canonical değer level_exam; exam_type yalnız fallback.
          book.levelExam || book.examType ? (
            <Badge variant="neutral">{book.levelExam || book.examType}</Badge>
          ) : undefined
        }
        action={
          <Button size="sm" render={<Link href={`/teacher/students/${studentId}/homework/new`} />}>
            <Plus />
            Ödev Ver
          </Button>
        }
      />

      <MetricRow
        className="md:grid-cols-5"
        metrics={[
          { label: `Toplam ${unitLabel(book.trackingMode)}`, value: totalTests },
          { label: 'Tamamlanan', value: completedTests },
          { label: 'Onay Bekleyen', value: pendingApprovalCount },
          { label: 'Süresi Geçen', value: overdueCount },
          { label: 'Kalan', value: Math.max(0, totalTests - completedTests) },
        ]}
      />

      <div className="space-y-2 rounded-lg border bg-card p-4">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {completedTests} / {totalTests} {unitLabel(book.trackingMode)} tamamlandı
          </span>
          <span className="font-medium tabular-nums">{percentage}%</span>
        </div>
        <ProgressBar value={percentage} label={`${book.title} ilerlemesi`} />
        <p className="text-xs text-muted-foreground">
          Hedef kapsamı: {scope.label}
          {scope.targetEndDate &&
            ` · ${new Date(scope.targetEndDate).toLocaleDateString('tr-TR')}`}
        </p>
        {/* Kapsam kitabın tamamı değilse iki yüzde ayrı gösterilir: plan
            bitmiş olabilir ama kitap hâlâ bitmemiştir (R6-04 kabul #34). */}
        {scope.scopeType !== 'whole_book' && (
          <p className="text-xs text-muted-foreground">
            Kitabın geneli: {scope.bookCompletedUnits} / {scope.bookTotalUnits}{' '}
            {unitLabel(book.trackingMode)} · %{scope.bookPercentage}
          </p>
        )}
      </div>

      <Section
        title="Plan ve tempo"
        description="Hedef tarihe göre konum ve bugün gereken ortalama tempo."
      >
        <PlanTempoCard
          bookTitle={book.title}
          startDate={scope.startDate}
          targetEndDate={scope.targetEndDate}
          totalUnits={totalTests}
          completedUnits={completedTests}
          trackingMode={book.trackingMode}
        />
      </Section>

      <Section
        title="Kaynak planı"
        description="Bu kaynağın öğrencinin planındaki durumu ve rolü."
      >
        <ResourcePlanCard studentId={studentId} book={book} />
      </Section>

      <Section
        title="Hedefler"
        description="Kaynak Hedefi nihai kapsam ve tarihtir; güncel tempo her zaman ondan hesaplanır. Ara Hedef kısa menzillidir ve Kaynak Hedefini değiştirmez."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <TargetCard studentId={studentId} book={book} kind="resource" />
          <TargetCard studentId={studentId} book={book} kind="interim" />
        </div>
        {interim && (
          <p className="mt-3 text-xs text-muted-foreground">
            Ara hedef kapsamı: {interim.label} · {interim.completedUnits} /{' '}
            {interim.totalUnits} {unitLabel(book.trackingMode)} · %{interim.percentage}
            {interim.targetEndDate &&
              ` · ${new Date(interim.targetEndDate).toLocaleDateString('tr-TR')}`}
          </p>
        )}
      </Section>

      <Section
        title="Video kaynakları"
        description="Video plan temposuna dahil edilmez; öğrenci onayı gerekmez."
      >
        <VideoPreference studentId={studentId} book={book} />
      </Section>

      <Section
        title="Kaynak Haritası"
        description="Bu öğrencinin bu kitaptaki durumu. Ödev verme, onaylama ve düzeltme işlemleri tek Kitap Haritasında yapılır."
      >
        {book.sections.length === 0 ? (
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={BookOpen}
              title="Bu kitapta aktif test yok"
              description="Kitaba bölüm ve test ekledikten sonra ilerleme burada görünür."
            />
          </div>
        ) : (
          <ResourceMap studentId={studentId} book={book} />
        )}
      </Section>
    </div>
  )
}
