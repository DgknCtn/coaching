import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BookOpen, CircleDashed, Gauge, Layers, Target } from 'lucide-react'
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
import { MetricTiles } from '@/components/shared/metric-tiles'
import { LinkTabs } from '@/components/shared/link-tabs'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { loadAssignableBooks } from '@/lib/assignable-books'
import { AssignBookDialog } from '../assign-book-dialog'

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

/** Kaynak durumunun rozet karşılığı — grup kovasıyla aynı indirgeme. */
const GROUP_BADGE: Record<BookPlanGroup, 'success' | 'warning' | 'neutral'> = {
  active: 'success',
  pending: 'warning',
  completed: 'neutral',
}

// Ekranın iki yüzdesi ve tempo kuralı, altta tek paragraf yerine madde
// madde. Metinler R5.1 §3.2/§3.4'ün davranışını anlatır.
const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'İki yüzde neden farklı?',
    description:
      "420 testlik kitapta 276 test hedeflendi ve 276'sı onaylandıysa Plan %100, Kitap %66'dır.",
    items: [
      { text: 'Plan %: hedef kapsamında onaylanan / hedef kapsam toplamı. Ana göstergedir.', tone: 'positive' },
      { text: 'Kitap %: kitapta onaylanan / kitabın takip edilebilir toplamı. Fiziksel bilgidir.' },
      { text: 'Plan %100 tamamlanmış olsa bile kitap kapsamı daha düşük olabilir; bu bir hata değildir.' },
    ],
  },
  {
    title: 'Neler plana girmez?',
    items: [
      { text: 'Onay bekleyen çalışma plan hesabına girmez; ayrı gösterilir.', tone: 'negative' },
      { text: 'Video kaynakları plan temposuna dahil edilmez.', tone: 'negative' },
      { text: 'Bekleyen ve hedefi tamamlanan kaynaklar üst özet toplamlarına katılmaz.', tone: 'negative' },
    ],
  },
  {
    title: 'Tempo ve hedefler',
    items: [
      { text: 'Gerekli tempo her zaman Kaynak Hedefinden hesaplanır; Ara Hedef onu değiştirmez.' },
      { text: 'Haftalık tempo yalnız tek tür birimde gösterilir: 3 test/hafta ile 40 sayfa/hafta toplanamaz.' },
      { text: 'Hedef yoksa kapsam kitabın tamamıdır ve iki yüzde birbirine eşitlenir.' },
      { text: 'Kaynağın rolü öğrenci-kitap ilişkisinin özelliğidir; değiştirmek ilerleme verisine dokunmaz.' },
    ],
  },
]

export default async function StudentResourcePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  /** Durum filtresi URL'de tutulur: filtreli görünüm paylaşılabilir olsun. */
  searchParams: Promise<{ group?: string }>
}) {
  const { studentId } = await params
  const { group: groupFilter } = await searchParams
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

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

  // Kaynak eklemek bu ekranın birincil eylemidir: kapsam ve tempo burada
  // okunuyor, eksik kaynak da burada fark ediliyor. Öğrenci genel bakışına
  // dönmek zorunda kalmamalı.
  const availableBooks = await loadAssignableBooks(supabase, {
    workspaceId,
    termId: activeTerm?.id ?? null,
    assignedBookIds: books.map(b => b.bookId),
  })

  const grouped = new Map<BookPlanGroup, BookMapBook[]>()
  for (const book of books) {
    const group = bookPlanGroup(book.status)
    grouped.set(group, [...(grouped.get(group) ?? []), book])
  }

  // ============================================================
  // Üst özet şeridi
  //
  // Ekran bugüne kadar yalnız kaynak kartlarını listeliyordu; "bu öğrencide
  // toplam ne kadar plan var, ne kadarı bitti?" sorusu ancak kartlar tek tek
  // okunarak yanıtlanabiliyordu.
  //
  // Toplamlar AKTİF kaynaklar üzerinden alınır: bekleyen bir kaynağın
  // kapsamı henüz çalışılmıyor, tamamlananınki ise bitmiş. İkisini toplama
  // katmak "kalan" sayısını yanıltıcı yapardı.
  //
  // Birimler kaynaklar arasında karışabilir (test + sayfa); bu yüzden toplam
  // satırında nötr "çalışma" denir — tek tür varsa onun adı kullanılır
  // (lib/unit-labels.ts ile aynı ilke).
  // ============================================================
  const activeBooks = books.filter(b => bookPlanGroup(b.status) === 'active')
  const activeScopes = activeBooks.map(b => ({ book: b, scope: resolvePlanScope(b) }))

  const totals = activeScopes.reduce(
    (acc, { scope }) => ({
      planned: acc.planned + scope.totalUnits,
      completed: acc.completed + scope.completedUnits,
      bookTotal: acc.bookTotal + scope.bookTotalUnits,
    }),
    { planned: 0, completed: 0, bookTotal: 0 }
  )
  const remainingUnits = Math.max(0, totals.planned - totals.completed)
  const planPercentage =
    totals.planned === 0 ? 0 : Math.round((totals.completed / totals.planned) * 100)

  // Geçersiz bir ?group= değeri filtreyi sessizce kapatır: kullanıcı yanlış
  // bir bağlantıyla boş ekran görmemeli.
  const activeGroup = GROUP_ORDER.includes(groupFilter as BookPlanGroup)
    ? (groupFilter as BookPlanGroup)
    : null

  const groupTabs = [
    {
      key: 'all',
      label: 'Tümü',
      href: `/teacher/students/${studentId}/goals`,
      count: books.length,
    },
    ...GROUP_ORDER.map(group => ({
      key: group,
      label: BOOK_PLAN_GROUP_LABEL[group],
      href: `/teacher/students/${studentId}/goals?group=${group}`,
      count: (grouped.get(group) ?? []).length,
    })),
  ].filter(tab => tab.key === 'all' || tab.count > 0)

  const modes = new Set(activeBooks.map(b => b.trackingMode))
  const summaryUnit = modes.size === 1 ? unitLabel([...modes][0]) : 'çalışma'

  // Haftalık tempo yalnız tek tür birimde anlamlı: 3 test/hafta ile 40
  // sayfa/hafta toplanamaz. Karışıksa gösterilmez.
  const weeklyTempo =
    modes.size === 1
      ? activeScopes.reduce((sum, { book, scope }) => {
          const tempo = calculatePlanTempo({
            startDate: scope.startDate,
            targetEndDate: scope.targetEndDate,
            totalUnits: scope.totalUnits,
            completedUnits: scope.completedUnits,
            trackingMode: book.trackingMode,
          })
          return sum + (tempo.requiredPacePerWeek ?? 0)
        }, 0)
      : null

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
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
        action={
          availableBooks.length > 0 ? (
            <AssignBookDialog studentId={studentId} books={availableBooks} />
          ) : undefined
        }
      />

      {activeBooks.length > 0 && (
        <MetricTiles
          className="xl:grid-cols-5"
          metrics={[
            {
              label: 'Planlanan kapsam',
              value: `${totals.planned.toLocaleString('tr-TR')} ${summaryUnit}`,
              icon: Target,
              hint: `${activeBooks.length} aktif kaynak`,
            },
            {
              label: 'Tamamlanan',
              value: totals.completed.toLocaleString('tr-TR'),
              tone: 'success',
              progress: planPercentage,
              hint: 'Plana göre',
            },
            {
              label: 'Kalan',
              value: remainingUnits.toLocaleString('tr-TR'),
              tone: 'warning',
              icon: CircleDashed,
            },
            {
              label: 'Kitap kapsamı',
              value: totals.bookTotal.toLocaleString('tr-TR'),
              icon: Layers,
              hint: 'Aktif kaynakların fiziksel toplamı',
            },
            {
              label: 'Haftalık tempo',
              value:
                weeklyTempo === null
                  ? '—'
                  : formatTempo(Math.round(weeklyTempo * 10) / 10, [...modes][0]),
              icon: Gauge,
              hint: weeklyTempo === null ? 'Karışık birim' : 'Hedeflere göre gerekli',
            },
          ]}
        />
      )}

      {books.length > 1 && (
        <LinkTabs tabs={groupTabs} activeKey={activeGroup ?? 'all'} />
      )}

      {books.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={BookOpen}
            title="Atanmış kaynak yok"
            description="Bu öğrenciye kitap atandığında kaynak planı burada görünür."
          />
        </div>
      ) : (
        GROUP_ORDER.filter(g => !activeGroup || g === activeGroup).map(group => {
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

      <ExplainerCards cards={EXPLAINERS} />
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
            {/* Durum artık düz metin değil rozet: kart listesinde hangi
                kaynağın aktif olduğu tek bakışta okunmalı. */}
            <Badge variant={GROUP_BADGE[bookPlanGroup(book.status)]}>
              {bookPlanStatusLabel(book.status)}
            </Badge>
            {role && <span>{role}</span>}
            <span aria-hidden>·</span>
            <span>{targetTypeLabel(scope.scopeType)}</span>
          </p>
        </div>
      </div>

      {/* İki yüzde YAN YANA gösterilir (§3.2). Tek bar gösterip kitap
          kapsamını dipnota atmak, "plan bitti = kitap bitti" yanılgısını
          besliyordu: 276/276 hedef Plan %100'dür ama kitap %66'dır. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="font-medium">Plan</span>
            <span className="tabular-nums">
              %{scope.percentage}
              <span className="ml-1.5 text-muted-foreground">
                {scope.completedUnits}/{scope.totalUnits}
              </span>
            </span>
          </div>
          <ProgressBar value={scope.percentage} label={`${book.title} plan ilerlemesi`} />
        </div>

        <div className="space-y-1">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">Kitap kapsamı</span>
            <span className="tabular-nums text-muted-foreground">
              %{scope.bookPercentage}
              <span className="ml-1.5">
                {scope.bookCompletedUnits}/{scope.bookTotalUnits}
              </span>
            </span>
          </div>
          <ProgressBar
            value={scope.bookPercentage}
            label={`${book.title} kitap kapsamı ilerlemesi`}
          />
        </div>
      </div>

      {/* "Plan kapsamı" satırı kaldırıldı: aynı x/y artık Plan barının
          başlığında duruyordu. */}
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">Seçili kapsam</dt>
          <dd className="mt-0.5">{scope.label}</dd>
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

      {/* Kapsam etiketi yukarıdaki "Seçili kapsam" hücresine taşındı; burada
          yalnız plana GİRMEYEN çalışma kalır (§3.4). */}
      {pendingApproval > 0 && (
        <p className="mt-3 border-t pt-2 text-[11px] text-info-foreground">
          {formatUnitCount(pendingApproval, book.trackingMode)} onay bekliyor — plan
          hesabına girmez
        </p>
      )}
    </Link>
  )
}
