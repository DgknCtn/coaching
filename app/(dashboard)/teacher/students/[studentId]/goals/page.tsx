import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AlertTriangle, BookOpen, CheckCircle2, Gauge, LayoutGrid, Minus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap, type BookMapBook } from '@/lib/book-map'
import { resolvePlanScope, type PlanScope } from '@/lib/plan-scope'
import { calculatePlanTempo } from '@/lib/plan-pace'
import {
  bookPlanGroup,
  bookPlanStatusLabel,
  bookRoleLabel,
} from '@/lib/resource-plan'
import { resolvePlanDeviation, type PlanDeviation } from '@/lib/resource-status'
import {
  emptyResourceWeekSignal,
  loadResourceWeekSignals,
  type ResourceWeekSignal,
} from '@/lib/weekly-resource-signal'
import {
  groupByScope,
  loadStudentScopes,
  loadWorkspaceScopes,
  UNASSIGNED_SCOPE_KEY,
} from '@/lib/student-scopes'
import { formatTempo, unitLabel } from '@/lib/unit-labels'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { ProgressBar } from '@/components/shared/progress-bar'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { LinkTabs } from '@/components/shared/link-tabs'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { loadAssignableBooks } from '@/lib/assignable-books'
import { AssignBookDialog } from '../assign-book-dialog'

// Öğrenci Kaynak Planı (R5.1 + R7 Kaynak Mimarisi).
//
// Cevapladığı soru: "Bu kaynakları NASIL ve NE ZAMAN kullanıyoruz?"
// Envanter sorusu ("hangi kaynaklar var?") Kitaplar ekranına aittir; iki
// ekran aynı bilgiyi TEKRAR ETMEZ (§4.3 görev ayrımı).
//
// R7'DE DEĞİŞEN — ekran artık kart listesi değil, DERS BAZLI KOMPAKT
// KONTROL EKRANI:
//
//   önce: her kaynak büyük bir kart, iki uzun progress bar, alt alta
//         istiflenmiş. 10-30 kaynakta öğretmen dersler arası durumu ve
//         haftalık teması tarayarak buluyordu.
//   şimdi: ders/kapsam blokları + satır başına sekiz alan. Tempo, plan
//         durumu ve "bu hafta çalışma verildi" sinyali AYNI SATIRDA.
//
// ÜST ÖZET HAFTALIK KARAR EKSENİNDE (§5.1): kapsam toplamları yerine
// "kaç kaynak aktif, kaçından bu hafta çalışma verildi, hangi alan boş,
// haftalık tempo ne". "Kitap kapsamı" kartı kaldırıldı — fiziksel kapsam
// kitap detayında yaşamaya devam ediyor.

export const dynamic = 'force-dynamic'

/** §5.2: "Sadece aktifler" filtresi bekleyenleri gizler, "Tümü" gösterir. */
const VIEW_KEYS = ['all', 'active', 'unassigned'] as const
type ViewKey = (typeof VIEW_KEYS)[number]

const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Plan durumu nasıl üretilir?',
    description:
      'Etiket ham ilerleme yüzdesinden değil, hedefe yetişmek için bugün gereken temponun planlanan tempoya oranından çıkar.',
    items: [
      { text: 'Planlanan tempo kaynak hedefinden; gerekli tempo kalan kapsam ve kalan süreden hesaplanır.' },
      { text: 'Hedef kapsam tüm kitap değilse hesap yalnız seçili kapsam üzerinden yapılır.' },
      { text: 'Bekleyen ve başlangıç tarihi gelmemiş kaynaklarda plan durumu üretilmez.', tone: 'negative' },
    ],
  },
  {
    title: 'Bu hafta çalışma verildi mi?',
    items: [
      { text: 'Yeşil tik, o kaynaktan bu hafta çalışma verildiğini gösterir.', tone: 'positive' },
      { text: '0 çalışma "eksik" ya da "tamamlanmadı" demek değildir; öğretmen bilinçli olarak daha az verebilir.' },
      { text: 'Açık ödev ayrı gösterilir. Geçmiş haftadan kalan iş bu haftanın hesabından düşülmez.' },
    ],
  },
  {
    title: 'Neler tempoya girmez?',
    items: [
      { text: 'Bekleyen ve başlangıç tarihi gelmemiş kaynaklar haftalık genel tempoya katılmaz.', tone: 'negative' },
      { text: 'Onay bekleyen çalışma plan hesabına girmez.', tone: 'negative' },
      { text: 'Video kaynakları plan temposuna dahil edilmez.', tone: 'negative' },
      { text: 'Ara Hedef, Kaynak Hedefinin kapsamını veya tarihini değiştirmez.' },
    ],
  },
]

/** Bir kaynağın ekranda gereken tüm türetilmiş değerleri. */
interface ResourceRowData {
  book: BookMapBook
  scopeId: string | null
  scope: PlanScope
  plannedPacePerWeek: number | null
  requiredPacePerWeek: number | null
  deviation: PlanDeviation
  signal: ResourceWeekSignal
  /** Aktif VE başlangıcı gelmiş: haftalık genel tempoya yalnız bunlar girer. */
  countsTowardTempo: boolean
}

export default async function StudentResourcePlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  /** Görünüm filtresi URL'de tutulur: filtreli ekran paylaşılabilir olsun. */
  searchParams: Promise<{ view?: string }>
}) {
  const { studentId } = await params
  const { view } = await searchParams
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
  const [books, scopes, workspaceScopes, signals] = await Promise.all([
    loadBookMap(supabase, {
      workspaceId,
      studentId,
      statuses: ['active', 'pending', 'paused', 'completed'],
    }),
    loadStudentScopes(supabase, { workspaceId, studentId }),
    loadWorkspaceScopes(supabase, { workspaceId }),
    loadResourceWeekSignals(supabase, { workspaceId, studentId }),
  ])

  // Kaynak eklemek bu ekranın birincil eylemidir: kapsam ve tempo burada
  // okunuyor, eksik kaynak da burada fark ediliyor.
  const availableBooks = await loadAssignableBooks(supabase, {
    workspaceId,
    termId: activeTerm?.id ?? null,
    assignedBookIds: books.map(b => b.bookId),
  })

  const today = new Date()

  const rows: ResourceRowData[] = books.map(book => {
    const scope = resolvePlanScope(book)
    const tempo = calculatePlanTempo({
      startDate: scope.startDate,
      targetEndDate: scope.targetEndDate,
      totalUnits: scope.totalUnits,
      completedUnits: scope.completedUnits,
      trackingMode: book.trackingMode,
    })

    const group = bookPlanGroup(book.status)
    const started = !scope.startDate || new Date(scope.startDate) <= today

    return {
      book,
      scopeId: book.scopeId,
      scope,
      plannedPacePerWeek: tempo.initialPacePerWeek,
      requiredPacePerWeek: tempo.requiredPacePerWeek,
      deviation: resolvePlanDeviation({
        status: book.status,
        plannedPacePerWeek: tempo.initialPacePerWeek,
        requiredPacePerWeek: tempo.requiredPacePerWeek,
        remainingUnits: tempo.remainingUnits,
        isTargetReached: tempo.isTargetReached,
        startDate: scope.startDate,
        today,
      }),
      signal: signals.get(book.assignmentId) ?? emptyResourceWeekSignal(),
      countsTowardTempo: group === 'active' && started,
    }
  })

  const groups = groupByScope(rows, scopes)
  const activeRows = rows.filter(r => bookPlanGroup(r.book.status) === 'active')

  // ============================================================
  // Üst özet (§5.1)
  //
  // Dört kart, dört soru: kaç kaynak çalışır durumda, kaçına bu hafta
  // dokunuldu, hangi alan boş kaldı, haftalık yük ne kadar.
  //
  // HAFTALIK GENEL TEMPO yalnız AKTİF ve BAŞLANGICI GELMİŞ kaynaklardan
  // toplanır. Bekleyen bir kaynağın temposunu toplama katmak, öğretmene
  // henüz vermediği bir yükü vermiş gibi gösterirdi.
  //
  // Birim karışabilir (test + sayfa); bu yüzden tek tür yoksa nötr
  // "çalışma" denir (lib/unit-labels.ts ile aynı ilke). Eski sürüm bu
  // durumda tempoyu HİÇ göstermiyordu ("—"); oysa öğretmenin ihtiyacı
  // olan sayı toplam haftalık yüktür, birimin adı değil.
  // ============================================================
  //
  // TOPLAM PLANLANAN TEMPODAN ALINIR, gerekli tempodan değil (§5.1:
  // "yalnız Aktif ve başlangıç tarihi gelmiş kaynakların PLANINDAN
  // oluşur"). Gerekli tempo sapmaya göre şişer; üst kartta onu göstermek
  // haftalık yükü olduğundan büyük gösterirdi. Sapma zaten satır bazında
  // plan durumu rozetiyle okunuyor.
  const tempoRows = rows.filter(r => r.countsTowardTempo)
  const weeklyTempo = tempoRows.reduce((sum, r) => sum + (r.plannedPacePerWeek ?? 0), 0)
  const tempoModes = new Set(tempoRows.map(r => r.book.trackingMode))
  const tempoUnit = tempoModes.size === 1 ? unitLabel([...tempoModes][0]) : 'çalışma'

  const touchedThisWeek = activeRows.filter(r => r.signal.assignedThisWeek > 0).length
  const emptyScopes = groups.filter(g => g.key !== UNASSIGNED_SCOPE_KEY && g.items.length === 0)

  const activeView: ViewKey = VIEW_KEYS.includes(view as ViewKey) ? (view as ViewKey) : 'all'

  const base = `/teacher/students/${studentId}/goals`
  const viewTabs = [
    { key: 'all', label: 'Tümü', href: base, count: books.length },
    { key: 'active', label: 'Sadece aktifler', href: `${base}?view=active`, count: activeRows.length },
    {
      key: 'unassigned',
      label: 'Kaynak atanmayanlar',
      href: `${base}?view=unassigned`,
      count: emptyScopes.length,
    },
  ]

  const assignDialog = (scopeId?: string | null, label?: string) =>
    availableBooks.length > 0 ? (
      <AssignBookDialog
        studentId={studentId}
        books={availableBooks}
        scopes={workspaceScopes}
        defaultScopeId={scopeId ?? null}
        triggerLabel={label}
      />
    ) : undefined

  // "Kaynak atanmayanlar" görünümünde yalnız boş alanlar kalır; "Sadece
  // aktifler"de bekleyenler gizlenir ama alan başlıkları durur — öğretmen
  // hangi alanda hiç aktif kaynak kalmadığını da görmeli.
  const visibleGroups = groups
    .map(g =>
      activeView === 'active'
        ? { ...g, items: g.items.filter(r => bookPlanGroup(r.book.status) === 'active') }
        : g
    )
    .filter(g => (activeView === 'unassigned' ? g.items.length === 0 : true))

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        // BAŞLIKTA ÖĞRENCİ ADI YOK (067): ad, sınıf ve sınav rozetleri
        // çalışma masasının üst şeridinde duruyor.
        title="Kaynak Planı"
        subtitle="Her kaynağın rolü, temposu ve hedef tarihe göre durumu"
        action={assignDialog(null, 'Kaynak Ekle')}
      />

      {books.length > 0 && (
        <MetricTiles
          className="xl:grid-cols-4"
          metrics={[
            {
              label: 'Aktif Kaynak',
              value: activeRows.length,
              icon: BookOpen,
              hint: `Toplam ${books.length} kaynaktan`,
            },
            {
              label: 'Bu Hafta Çalışma Verilen Kaynak',
              value: touchedThisWeek,
              tone: 'success',
              icon: CheckCircle2,
              hint: `${activeRows.length} aktif kaynaktan`,
            },
            {
              label: 'Kaynak Atanmayan Alan',
              value: emptyScopes.length,
              tone: emptyScopes.length > 0 ? 'warning' : 'default',
              icon: AlertTriangle,
              hint: `Toplam ${scopes.length} alan içinde`,
              href: emptyScopes.length > 0 ? `${base}?view=unassigned` : undefined,
            },
            {
              label: 'Haftalık Genel Tempo',
              value: `${roundTempo(weeklyTempo).toLocaleString('tr-TR')} ${tempoUnit}`,
              icon: Gauge,
              // Günlük ortalama haftalık tempodan türetilir; öğretmen için
              // planlama referansıdır, bir kota değildir (§5.1).
              hint: `Günlük ort. ${roundTempo(weeklyTempo / 7).toLocaleString('tr-TR')} ${tempoUnit}`,
            },
          ]}
        />
      )}

      {books.length > 0 && <LinkTabs tabs={viewTabs} activeKey={activeView} />}

      {books.length === 0 && scopes.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={BookOpen}
            title="Atanmış kaynak yok"
            description="Bu öğrenciye kitap atandığında kaynak planı burada görünür."
          />
        </div>
      ) : (
        <div className="space-y-5">
          {visibleGroups.map(group => (
            <ScopeBlock
              key={group.key}
              studentId={studentId}
              label={group.label}
              rows={group.items}
              assignAction={
                group.key === UNASSIGNED_SCOPE_KEY
                  ? undefined
                  : assignDialog(group.key, 'Kaynak Ekle')
              }
            />
          ))}
        </div>
      )}

      <ExplainerCards cards={EXPLAINERS} />
    </div>
  )
}

/** Tempo göstergeleri bir ondalık basamakla gösterilir (plan-pace.ts ile aynı). */
function roundTempo(value: number): number {
  return Math.round(value * 10) / 10
}

// ============================================================
// Ders/kapsam bloğu (§5.2)
// ============================================================
function ScopeBlock({
  studentId,
  label,
  rows,
  assignAction,
}: {
  studentId: string
  label: string
  rows: ResourceRowData[]
  assignAction?: React.ReactNode
}) {
  const activeCount = rows.filter(r => bookPlanGroup(r.book.status) === 'active').length
  const touched = rows.filter(
    r => bookPlanGroup(r.book.status) === 'active' && r.signal.assignedThisWeek > 0
  ).length
  const totalThisWeek = rows.reduce((n, r) => n + r.signal.assignedThisWeek, 0)

  return (
    <section className="rounded-lg border bg-card">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <LayoutGrid className="size-4 text-muted-foreground" aria-hidden />
            {label}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {rows.length === 0 ? (
              'Bu alan öğrenci kapsamına dâhil ancak henüz kaynak atanmadı.'
            ) : (
              <>
                {activeCount} aktif kaynak
                {activeCount > 0 && (
                  <>
                    {' · '}
                    {touched}/{activeCount} kaynaktan bu hafta çalışma verildi
                  </>
                )}
                {totalThisWeek > 0 && <> · {totalThisWeek} çalışma</>}
              </>
            )}
          </p>
        </div>
        {assignAction}
      </header>

      {rows.length === 0 ? (
        <p className="flex items-center gap-2 px-4 py-3 text-xs text-warning-foreground">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Kaynak atanmadı
        </p>
      ) : (
        <div className="divide-y">
          {/* Sütun başlıkları yalnız geniş ekranda: dar ekranda her satır
              kendi etiketlerini taşır, iki kez yazmak yer israfı olurdu. */}
          <div className="hidden gap-3 px-4 py-2 text-[11px] text-muted-foreground lg:grid lg:grid-cols-[minmax(0,2.2fr)_repeat(6,minmax(0,1fr))_minmax(0,1fr)]">
            <span>Kaynak</span>
            <span>Rol</span>
            <span>Planlanan tempo</span>
            <span>Gerekli tempo</span>
            <span>Durum</span>
            <span>Bu hafta verilen</span>
            <span>Açık ödev</span>
            <span>İlerleme</span>
          </div>
          {rows.map(row => (
            <ResourceRow key={row.book.assignmentId} studentId={studentId} row={row} />
          ))}
        </div>
      )}
    </section>
  )
}

// ============================================================
// Kaynak satırı (§5.3)
//
// Sekiz alan TEK SATIRDA: öğretmen tempo sapmasını ve haftalık temması
// metin aramadan görebilmeli. Eski kart sürümündeki iki uzun progress bar
// kaldırıldı; ilerleme tek "348 / 520" sayısı ve ince bir çizgi.
// ============================================================
function ResourceRow({ studentId, row }: { studentId: string; row: ResourceRowData }) {
  const { book, scope, deviation, signal } = row
  const role = bookRoleLabel(book.role)
  const group = bookPlanGroup(book.status)

  return (
    <Link
      href={`/teacher/students/${studentId}/books/${book.bookId}?from=kaynak-plani`}
      className="grid gap-x-3 gap-y-2 px-4 py-3 text-xs transition-colors hover:bg-muted/40 lg:grid-cols-[minmax(0,2.2fr)_repeat(6,minmax(0,1fr))_minmax(0,1fr)] lg:items-center"
    >
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{book.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          {group !== 'active' && (
            <Badge variant={group === 'pending' ? 'warning' : 'neutral'}>
              {bookPlanStatusLabel(book.status)}
            </Badge>
          )}
          {book.publisher && <span className="truncate">{book.publisher}</span>}
        </p>
      </div>

      <Field label="Rol">
        {role ? <Badge variant="secondary">{role}</Badge> : <Muted />}
      </Field>

      <Field label="Planlanan tempo">
        <span className="tabular-nums">
          {formatTempo(row.plannedPacePerWeek, book.trackingMode)}
        </span>
      </Field>

      <Field label="Gerekli tempo">
        <span className="tabular-nums">
          {formatTempo(row.requiredPacePerWeek, book.trackingMode)}
        </span>
      </Field>

      <Field label="Durum">
        {deviation.key === 'not_evaluated' ? (
          <Muted />
        ) : (
          <Badge variant={deviation.tone}>{deviation.label}</Badge>
        )}
      </Field>

      {/* §6.3: 0 çalışma NÖTRDÜR. Uyarı rengi veya eksiklik ikonu
          kullanılmaz; yalnız gri bir tire. */}
      <Field label="Bu hafta verilen">
        {signal.assignedThisWeek > 0 ? (
          <span className="flex items-center gap-1 text-success-foreground">
            <CheckCircle2 className="size-3.5 shrink-0" aria-hidden />
            <span className="tabular-nums">{signal.assignedThisWeek} çalışma</span>
          </span>
        ) : (
          <span className="flex items-center gap-1 text-muted-foreground">
            <Minus className="size-3.5 shrink-0" aria-hidden />
            <span className="tabular-nums">0 çalışma</span>
          </span>
        )}
      </Field>

      <Field label="Açık ödev">
        <span className="tabular-nums">{signal.openItems} çalışma</span>
      </Field>

      <Field label="İlerleme">
        <span className="tabular-nums">
          {scope.completedUnits.toLocaleString('tr-TR')} /{' '}
          {scope.totalUnits.toLocaleString('tr-TR')}
        </span>
        <ProgressBar
          className="mt-1"
          value={scope.percentage}
          label={`${book.title} plan ilerlemesi`}
        />
      </Field>
    </Link>
  )
}

/** Dar ekranda etiketi görünür, geniş ekranda sütun başlığına devreder. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <span className="mr-1.5 text-[11px] text-muted-foreground lg:hidden">{label}</span>
      {children}
    </div>
  )
}

function Muted() {
  return (
    <span className="text-muted-foreground" aria-label="Değer yok">
      —
    </span>
  )
}
