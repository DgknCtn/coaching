import { BookOpen, Users } from 'lucide-react'
import { deriveBatchState, isOpenBatch } from '@/lib/homework-status'
import { getParentContext } from '@/lib/workspace'
import { Badge } from '@/components/ui/badge'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { MetricRow } from '@/components/shared/metric-row'
import { counterLabel, OVERDUE_HINT } from '@/lib/homework-status'
import { LinkTabs } from '@/components/shared/link-tabs'
import { ExplainerCards, type ExplainerCard } from '@/components/shared/explainer-cards'
import { AlertBanner } from '@/components/shared/alert-banner'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import { buildHomeworkDetail, type HomeworkDetailItem } from '@/lib/homework-detail'
import { ParentTempoRow } from '@/components/shared/parent-tempo-row'
import { monthPaymentLabel, type MonthPaymentState } from '@/lib/finance'
import { allOk, listResult, singleResult } from '@/lib/data-result'
import { parentStatusBanner } from '@/lib/parent-status'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { PaymentNoticeButton } from './payment-notice-button'

export const dynamic = 'force-dynamic'

// Velinin ekranı okumasını sağlayan kurallar. Diğer üç ekranla aynı kalıp.
const EXPLAINERS: ExplainerCard[] = [
  {
    title: 'Sayılar ne anlama geliyor?',
    items: [
      { text: '"Tamamlanan" yalnız öğretmenin onayladığı çalışmaları sayar.', tone: 'positive' },
      { text: '"Onay Bekleyen" öğrencinin gönderdiği ama henüz onaylanmamış çalışmadır; tamamlanan sayısına girmez.', tone: 'negative' },
      { text: '"Süresi Geçen" ayrı bir toplam değildir — bekleyenlerin içindeki teslim tarihi geçmiş kısımdır.' },
    ],
  },
  {
    title: 'Tempo nasıl okunur?',
    items: [
      { text: 'Her kaynak için hedef tarihe göre haftada ne kadar gerektiği yazar.' },
      { text: 'Hedef tarihi belirlenmemiş bir kaynakta tempo hesaplanamaz; o satırda yalnız kalan miktar görünür.' },
      { text: 'Video çalışmaları tempoya dahil edilmez.' },
    ],
  },
  {
    title: 'Bu panel ne yapmaz?',
    items: [
      { text: 'Buradan ödev verilemez, hedef değiştirilemez; panel yalnız görüntülemedir.' },
      { text: 'Öğrencinin konu planı ve tekrar listesi öğretmen ile öğrenci arasındadır, bu panelde yer almaz.' },
      { text: 'Bir gecikme gördüğünüzde öğretmenle iletişime geçmek en hızlı yoldur.' },
    ],
  },
]

/** Supabase iç içe select'i tek kayıt için de dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

/** İçinde bulunulan ayın ilk günü, YEREL takvime göre. */
function currentMonthStartLocal(): string {
  // UTC'den okunsaydı ayın ilk gecesi bir önceki ay açılırdı.
  const ym = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Istanbul',
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
  return `${ym}-01`
}

function currentMonthLabel(): string {
  return new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(new Date())
}

/** "19 Eyl 10:00" — velinin ekranında tarih ve saat birlikte (§8). */
function formatSessionMoment(iso: string): string {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

const SESSION_STATUS_LABEL: Record<string, string> = {
  planlandi: 'Planlandı',
  yapildi: 'Yapıldı',
  ertelendi: 'Ertelendi',
  iptal: 'İptal edildi',
  yapilmadi: 'Yapılmadı',
}

export default async function ParentPage({
  searchParams,
}: {
  /** Seçili öğrenci URL'de tutulur: paylaşılabilir ve geri tuşuyla gezilebilir. */
  searchParams: Promise<{ student?: string }>
}) {
  const { student: requestedStudentId } = await searchParams
  const currentMonthStart = currentMonthStartLocal()
  const { supabase, workspaceId, linkedStudents } = await getParentContext()


  // ÖNCEDEN: bağlı tüm öğrenciler tek sayfada alt alta diziliyordu. Üç
  // çocuklu bir velide sayfa taranamaz hâle geliyordu ve her çocuk için
  // üç sorgu birden çalışıyordu. Artık tek çocuğun detayı gösterilir;
  // geçiş sekmelerle yapılır ve tek çocukta sekme hiç görünmez.
  const activeStudentId =
    requestedStudentId && linkedStudents.some(l => l.students.id === requestedStudentId)
      ? requestedStudentId
      : (linkedStudents[0]?.students.id ?? null)

  const activeLinks = linkedStudents.filter(l => l.students.id === activeStudentId)

  const studentData = await Promise.all(
    activeLinks.map(async (link) => {
      const studentId = link.students.id

      // YANITLAR BÜTÜN OLARAK ALINIYOR, `{ data }` DİYE AYRIŞTIRILMIYOR
      // (PRD · B01).
      //
      // Eskiden her sorgunun yalnız `data`sı alınıyor, `error` hiç
      // okunmuyordu. Hata sessizce null'a, null da `?? []` ile boş
      // diziye dönüşüyordu. Ölçülen sonucu: ödev sorgusu düştüğünde
      // gecikme sayısı 0 çıkıyor ve veliye "Her şey yolunda"
      // gösteriliyordu. Aşağıda her yanıt `listResult`/`singleResult`
      // ile hata ve başarı olarak ayrılıyor.
      const [
        bookProgressRes,
        batchesRes,
        allBatchesRes,
        weeklyRes,
        teacherRes,
        sessionsRes,
        countersRes,
        noticeRes,
        paymentRes,
      ] = await Promise.all([
        supabase
          .from('student_book_progress_view')
          .select('*')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId),
        supabase
          .from('homework_batches')
          .select(
            `id, title, description, due_date, status,
             homework_items(
               id, status, rejected_at, book_id, section_id,
               books(title, tracking_mode),
               book_sections(title),
               book_tests(order_index)
             )`
          )
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .eq('status', 'active')
          .order('due_date', { ascending: false })
          .limit(10),
        // DURUM KARARI LİSTEDEN AYRI (068 · rapor bulgusu 5).
        //
        // Yukarıdaki liste en yeni 10 grubu getiriyor; dolayısıyla ilk
        // 10'un dışında kalanlar EN ESKİ, yani gecikme riski en yüksek
        // gruplar. "Her şey yolunda" kararı o listeden türetildiğinde,
        // aylardır açık duran bir ödev velinin ekranına hiç yansımadan
        // olumlu bir mesaj gösterilebiliyordu.
        //
        // Bu sorgu SINIRSIZ ama hafif: yalnız tarih ve kalem durumları.
        // Sınır listede kalır, karara sızmaz.
        supabase
          .from('homework_batches')
          .select('id, due_date, homework_items(status, rejected_at)')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .eq('status', 'active'),
        supabase
          .from('student_weekly_homework_summary_view')
          .select('*')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        // Gecikme uyarısında "kime yazayım?" sorusunu yanıtlamak için.
        // profiles RLS'i veliye kapalıysa isim null döner ve uyarı genel
        // metne düşer — ekran bozulmaz.
        supabase
          .from('students')
          .select('profiles:primary_teacher_profile_id(full_name)')
          .eq('id', studentId)
          .maybeSingle(),
        // BU AYIN HİZMETLERİ (R7-04 §8: "Veli, içinde bulunulan ay kaç
        // hizmet planlandığını ve kaçının yapıldığını TARİH/SAAT ile
        // görür").
        //
        // Erişim 074'ün `service_sessions_read_self` politikasından
        // geliyor; veli için yeni bir kapı açılmadı.
        //
        // 082'nin ay atfı burada da geçerli: telafi asıl ayın
        // listesinde görünür. Veli ile öğretmen aynı ay için farklı
        // liste görmemeli.
        supabase
          .from('student_service_session_view')
          .select('id, planned_at, actual_at, duration_minutes, status, origin_planned_at')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .eq('attributed_month', currentMonthStart)
          .order('planned_at'),
        supabase
          .from('student_service_month_view')
          .select('planlanan, yapilan')
          .eq('student_id', studentId)
          .eq('workspace_id', workspaceId)
          .eq('ay', currentMonthStart),
        // Bekleyen bildirim varsa tuş yerine "onay bekleniyor" yazar.
        supabase
          .from('parent_payment_notices')
          .select('id, created_at')
          .eq('student_id', studentId)
          .eq('month_start', currentMonthStart)
          .eq('status', 'pending')
          .maybeSingle(),
        // ÖDEME DURUMU FONKSİYONDAN, TABLODAN DEĞİL. Finans tabloları
        // veliye kapalı (066); fonksiyon yalnız üç kelimeden birini
        // döndürüyor, hiçbir koşulda tutar sızdırmıyor.
        supabase.rpc('student_month_payment_state', {
          p_student_id: studentId,
          p_month_start: currentMonthStart,
        }),
      ])

      const bookProgress = listResult(bookProgressRes, 'parent.book_progress')
      const batches = listResult(batchesRes, 'parent.recent_batches')
      const allBatches = listResult(allBatchesRes, 'parent.batch_states')
      const weekly = singleResult(weeklyRes, 'parent.weekly_summary')
      const teacher = singleResult(teacherRes, 'parent.teacher_name')
      const sessions = listResult(sessionsRes, 'parent.month_sessions')
      const counters = listResult(countersRes, 'parent.month_counters')
      const notice = singleResult(noticeRes, 'parent.payment_notice')
      const payment = singleResult(paymentRes, 'parent.payment_state')

      // Özet, SINIRSIZ listeden türer (yukarıdaki yorum). Gruplar
      // deriveBatchState ile tek bir duruma indirgeniyor; "onay
      // bekleyen" iş öğrencinin gecikmesi sayılmıyor.
      //
      // SORGU DÜŞTÜYSE ÖZET YOK — SIFIR DEĞİL. `null`, "gecikme sayısı
      // bilinmiyor" demek; 0 ise "gecikme yok" demek. İkisini aynı
      // değerle taşımak, bu dosyanın yanlış olumlu özet üretmesinin
      // sebebiydi.
      const batchSummary = allBatches.ok
        ? (() => {
            const states = allBatches.data.map(b =>
              deriveBatchState({
                dueDate: b.due_date as string | null,
                items: (b.homework_items ?? []) as { status: string; rejected_at: string | null }[],
              })
            )
            return {
              overdue: states.filter(st => st === 'overdue').length,
              open: states.filter(isOpenBatch).length,
              total: states.length,
            }
          })()
        : null

      // Ay sayaçları: iki sorgunun İKİSİ de gelmeli. Yalnız biri gelirse
      // "2 / 5 hizmet yapıldı" cümlesi eksik veriyle kurulmuş olurdu.
      const monthCounts =
        counters.ok && sessions.ok
          ? {
              planned: counters.data.reduce((sum, c) => sum + Number(c.planlanan ?? 0), 0),
              done: counters.data.reduce((sum, c) => sum + Number(c.yapilan ?? 0), 0),
            }
          : null

      return {
        student: link.students,
        bookProgress,
        batches,
        weekly,
        sessions,
        batchSummary,
        monthCounts,
        // Ödeme rozeti ve bildirim düğmesi için. Bu iki sorgu düşerse
        // rozet görünmez — "ödenmedi" ya da "ödendi" gibi YANLIŞ bir
        // hüküm üretilmez, yalnız bilgi eksik kalır. Hata raporlanıyor.
        hasOpenNotice: notice.ok && Boolean(notice.data),
        paymentState: payment.ok ? ((payment.data as string | null) ?? null) : null,
        // İsim yalnız uyarı metnini kişiselleştiriyor; gelmezse metin
        // genel hâline düşer, anlamı değişmez.
        teacherName: teacher.ok
          ? (one(
              (teacher.data as { profiles: Nested<{ full_name: string }> } | null)?.profiles ?? null
            )?.full_name ?? null)
          : null,
      }
    })
  )

  return (
    <div className="mx-auto max-w-3xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Veli Paneli"
        subtitle={
          linkedStudents.length > 1
            ? 'Öğrencilerinizin gelişimini takip edin'
            : 'Öğrencinizin gelişimini takip edin'
        }
      />

      {/* Tek çocukta sekme hiç çizilmez — gereksiz bir seçim sunmaz. */}
      {linkedStudents.length > 1 && activeStudentId && (
        <LinkTabs
          tabs={linkedStudents.map(l => ({
            key: l.students.id,
            label: l.students.full_name,
            href: `/parent?student=${l.students.id}`,
          }))}
          activeKey={activeStudentId}
        />
      )}

      {studentData.length === 0 && (
        <Section variant="card">
          <EmptyState
            icon={Users}
            title="Bağlı öğrenci yok"
            description="Öğretmeninizden davet bekleniyor."
          />
        </Section>
      )}

      {studentData.map(
        ({
          student,
          bookProgress,
          batches,
          weekly,
          sessions,
          batchSummary,
          monthCounts,
          teacherName,
          hasOpenNotice,
          paymentState,
        }) => {
        // Veli dili "Ödendi", öğretmen dili "Tahsil edildi" (§8).
        const paymentLabel = monthPaymentLabel(paymentState as MonthPaymentState, 'parent')

        // "Tekrar dene" aynı öğrencinin sayfasına döner; sekme seçimi
        // kaybolmaz (PRD · B08: "çocuk seçimi korunur").
        const retryHref = `/parent?student=${student.id}`

        // Genel (dönem geneli) ilerleme — atanmış tüm kitaplar üzerinden.
        const books = bookProgress.ok ? bookProgress.data : []
        const overallTotal = books.reduce((s, p) => s + Number(p.total_tests ?? 0), 0)
        const overallCompleted = books.reduce((s, p) => s + Number(p.completed_tests ?? 0), 0)
        const overallPct = overallTotal > 0 ? Math.round((overallCompleted / overallTotal) * 100) : 0

        // Üst bandın kararı saf fonksiyonda (`lib/parent-status.ts`):
        // eskiden burada gömülüydü ve test edilemiyordu — yanlış olumlu
        // özet kusuru da tam o iki satırdaydı.
        const banner = parentStatusBanner(
          batchSummary,
          bookProgress.ok ? bookProgress.data.length : null
        )

        // Dönem geneli metriklerinin HEPSİ kitap verisinden geliyor, o
        // yüzden görünürlüğü de ona bağlı — banner'a değil. Banner'dan
        // türetilseydi ödev sorgusu düştüğünde, kitap verisi elde olduğu
        // hâlde bu bölüm de kaybolurdu.
        const showTermSummary =
          bookProgress.ok && (books.length > 0 || (batchSummary?.total ?? 0) > 0)

        return (
          <div key={student.id} className="space-y-6 border-t pt-8 first:border-t-0 first:pt-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold tracking-tight">{student.full_name}</h2>
              {student.exam_type && <Badge variant="neutral">{student.exam_type}</Badge>}
              {student.grade_level && <Badge variant="neutral">{student.grade_level}</Badge>}
            </div>

            {/* Ödev durumu alınamadıysa NE uyarı NE olumlu özet: ikisi
                de bilinmeyen bir sayıya dayanırdı. */}
            {banner.kind === 'unknown' && (
              <SectionUnavailable
                title="Ödev durumu şu an alınamadı"
                description="Gecikmiş çalışma olup olmadığı şu an gösterilemiyor. Bu, gecikme olmadığı anlamına gelmez."
                retryHref={retryHref}
              />
            )}

            {banner.kind === 'overdue' && (
              <AlertBanner
                tone="warning"
                title={`${banner.count} gecikmiş ödev grubu`}
                description={
                  teacherName
                    ? `Teslim tarihi geçmiş çalışmalar var. ${teacherName} ile iletişime geçebilirsiniz.`
                    : 'Teslim tarihi geçmiş çalışmalar var. Öğretmenle iletişime geçebilirsiniz.'
                }
              />
            )}

            {/* DAR VE DOĞRU İFADE (PRD · B08).
                Eski başlık "Her şey yolunda" idi. Ekranın gerçekten
                bildiği şey daha dar: gecikmiş çalışma görünmüyor.
                Öğrenmenin, konunun ya da genel gidişatın iyi olduğunu
                bu veri söylemiyor — başlık da söylememeli. */}
            {banner.kind === 'noOverdue' && (
              <AlertBanner
                tone="success"
                title="Gecikmiş çalışma görünmüyor"
                description={
                  // Bekleyen iş varken "hiç iş yok" demiyoruz: gecikme
                  // yokluğu ile boşluk farklı şeyler.
                  banner.open > 0
                    ? `${banner.open} çalışma zamanında devam ediyor.`
                    : 'Bekleyen çalışma yok.'
                }
              />
            )}

            {!weekly.ok && (
              <Section title="Bu hafta">
                <SectionUnavailable retryHref={retryHref} />
              </Section>
            )}

            {weekly.ok && weekly.data && (
              <Section title="Bu hafta">
                <MetricRow
                  className="md:grid-cols-5"
                  metrics={[
                    { label: counterLabel('assigned', 'parent'), value: weekly.data.assigned_tests ?? 0 },
                    { label: counterLabel('completed', 'parent'), value: weekly.data.completed_tests ?? 0 },
                    { label: counterLabel('pending', 'parent'), value: weekly.data.pending_tests ?? 0 },
                    {
                      label: counterLabel('pendingApproval', 'parent'),
                      value: weekly.data.pending_approval_tests ?? 0,
                    },
                    {
                      label: counterLabel('overdue', 'parent'),
                      value: weekly.data.overdue_tests ?? 0,
                      hint: OVERDUE_HINT,
                    },
                  ]}
                />
              </Section>
            )}

            {/* BU AYIN DERSLERİ (§8).

                Veli "kaç hizmet planlandı, kaçı yapıldı"yı TARİH/SAAT
                ile görüyor. Sayılar öğretmenin ekranıyla aynı view'dan
                geliyor (082 ay atfı dahil); ayrı hesaplansaydı iki
                taraf aynı ay için farklı sayı görürdü.

                ÖDEME DURUMU VAR, TUTAR YOK: finans tabloları veliye
                kapalı (066). Ekran yalnız "Ödendi / Kısmi / Bekliyor"
                diyor; rakamı öğretmen söyler.

                SORGU DÜŞTÜYSE BÖLÜM GİZLENMİYOR: eskiden `plannedCount`
                0'a düşüyor ve bölüm hiç çizilmiyordu — veli "bu ay ders
                yok" diye okurdu. */}
            {monthCounts === null && (
              <Section title={`${currentMonthLabel()} dersleri`}>
                <SectionUnavailable retryHref={retryHref} />
              </Section>
            )}

            {monthCounts !== null && sessions.ok && monthCounts.planned > 0 && (
              <Section
                title={`${currentMonthLabel()} dersleri`}
                description={`${monthCounts.done} / ${monthCounts.planned} hizmet yapıldı.`}
                variant="card"
              >
                {paymentLabel && (
                  <div className="mb-3 flex flex-wrap items-center gap-3">
                    <Badge variant={paymentState === 'paid' ? 'success' : 'warning'}>
                      {paymentLabel}
                    </Badge>
                    <PaymentNoticeButton
                      studentId={student.id}
                      monthStart={currentMonthStart}
                      monthLabel={currentMonthLabel()}
                      pending={hasOpenNotice}
                    />
                  </div>
                )}

                <ul className="divide-y text-sm">
                  {sessions.data.map((session) => {
                    const planned = session.planned_at as string
                    const actual = session.actual_at as string | null
                    // "19 Eyl 10:00 → 20 Eyl 11:00" (§7-A no.3): ilk
                    // planlanan tarih SİLİNMEZ, nihai durum yanında
                    // gösterilir. Veli neyin değiştiğini görebilmeli.
                    const moved = actual && actual !== planned
                    return (
                      <li
                        key={session.id as string}
                        className="flex flex-wrap items-baseline justify-between gap-2 py-2"
                      >
                        <span className="tabular-nums">
                          {moved ? (
                            <>
                              <span className="text-muted-foreground line-through">
                                {formatSessionMoment(planned)}
                              </span>{' '}
                              → {formatSessionMoment(actual)}
                            </>
                          ) : (
                            formatSessionMoment(planned)
                          )}
                          {session.duration_minutes != null && (
                            <span className="text-muted-foreground">
                              {' '}
                              · {session.duration_minutes} dk
                            </span>
                          )}
                        </span>
                        <Badge
                          variant={
                            session.status === 'yapildi'
                              ? 'success'
                              : session.status === 'planlandi'
                                ? 'neutral'
                                : 'warning'
                          }
                        >
                          {SESSION_STATUS_LABEL[session.status as string] ??
                            (session.status as string)}
                        </Badge>
                      </li>
                    )
                  })}
                </ul>
              </Section>
            )}

            {/* KİTAP VERİSİ GELMEDİYSE üç bölümün (dönem geneli, tempo,
                kitap kartları) yerine tek bir açık bildirim. Üçü de aynı
                sorgudan besleniyor; üç ayrı "yüklenemedi" kutusu aynı
                arızayı üç kez söylemek olurdu. */}
            {!bookProgress.ok && (
              <Section title="Kitap ilerlemesi">
                <SectionUnavailable retryHref={retryHref} />
              </Section>
            )}

            {showTermSummary && (
              <Section title="Dönem geneli">
                <MetricRow
                  metrics={[
                    // B11: yüzdenin PAYDASI yazılı. Birimler (test,
                    // sayfa, konu) karışık olabildiği için "test" denmiyor.
                    {
                      label: 'Genel ilerleme',
                      value: `${overallPct}%`,
                      hint: `${books.length} kitaptaki ${overallTotal} çalışmanın onaylananları`,
                    },
                    {
                      label: 'Tamamlanan çalışma',
                      value: overallCompleted,
                      subValue: `/${overallTotal}`,
                    },
                    { label: 'Aktif kitap', value: books.length },
                  ]}
                  className="md:grid-cols-3"
                />
              </Section>
            )}

            {books.length > 0 && (
              <Section
                title="Plan ve tempo"
                description="Her kaynakta hedefe göre nerede olunduğu."
              >
                <div className="space-y-3">
                  {books.map((p) => (
                    <ParentTempoRow
                      key={p.student_book_assignment_id}
                      bookTitle={p.book_title}
                      startDate={p.start_date}
                      targetEndDate={p.target_end_date}
                      totalUnits={Number(p.total_tests ?? 0)}
                      completedUnits={Number(p.completed_tests ?? 0)}
                      trackingMode={p.tracking_mode}
                    />
                  ))}
                </div>
              </Section>
            )}

            {books.length > 0 && (
              <Section title="Kitap ilerlemesi">
                <div className="grid gap-3 sm:grid-cols-2">
                  {books.map((p) => (
                    <BookCard
                      key={p.student_book_assignment_id}
                      href={`/parent/students/${student.id}/books/${p.book_id}`}
                      book={{
                        id: p.book_id,
                        title: p.book_title,
                        subject: p.subject,
                        tracking_mode: p.tracking_mode,
                      }}
                      progress={{
                        completed: p.completed_tests,
                        total: p.total_tests,
                        percentage: Number(p.completion_percentage),
                        targetDate: p.target_end_date,
                      }}
                    />
                  ))}
                </div>
              </Section>
            )}

            {!batches.ok && (
              <Section title="Son ödevler">
                <SectionUnavailable retryHref={retryHref} />
              </Section>
            )}

            {batches.ok && batches.data.length > 0 && (
              <Section title="Son ödevler" variant="card">
                <ul className="divide-y">
                  {batches.data.slice(0, 5).map((batch) => {
                    const items = batch.homework_items as unknown as {
                      id: string
                      status: string
                      rejected_at: string | null
                      book_id: string | null
                      section_id: string | null
                      books: Nested<{ title: string; tracking_mode: string }>
                      book_sections: Nested<{ title: string }>
                      book_tests: Nested<{ order_index: number }>
                    }[]
                    const detail = buildHomeworkDetail(
                      items.map<HomeworkDetailItem>((i) => ({
                        bookId: i.book_id,
                        bookTitle: one(i.books)?.title ?? null,
                        trackingMode: one(i.books)?.tracking_mode ?? null,
                        sectionId: i.section_id,
                        sectionTitle: one(i.book_sections)?.title ?? null,
                        orderIndex: one(i.book_tests)?.order_index ?? null,
                      }))
                    )
                    const total = items.filter((i) => i.status !== 'cancelled').length
                    const completed = items.filter((i) => i.status === 'completed').length
                    // Satır rozeti de aynı türeticiden: liste ile üstteki
                    // uyarı farklı kural kullanırsa veli çelişkili iki
                    // sayı görür.
                    const batchOverdue =
                      deriveBatchState({
                        dueDate: batch.due_date,
                        items,
                      }) === 'overdue'

                    return (
                      <li key={batch.id}>
                        <HomeworkBatchRow
                          title={batch.title}
                          dueDate={batch.due_date}
                          completed={completed}
                          total={total}
                          isOverdue={batchOverdue}
                          detail={detail}
                          note={batch.description}
                          dateStyle={{ day: 'numeric', month: 'long' }}
                        />
                      </li>
                    )
                  })}
                </ul>
              </Section>
            )}

            {/* "HENÜZ VERİ YOK" YALNIZ ÜÇ SORGU DA BAŞARILIYSA.
                Eskiden bu mesaj hata durumunda da çıkıyordu ve açıklaması
                "Öğretmen henüz kitap veya ödev atamamış" idi: bir arıza,
                öğretmeni yanlışlıkla suçlayan bir cümleye dönüşüyordu. */}
            {allOk(bookProgress, batches, weekly) &&
              books.length === 0 &&
              batches.ok &&
              batches.data.length === 0 &&
              weekly.ok &&
              !weekly.data && (
              <Section variant="card">
                <EmptyState
                  icon={BookOpen}
                  title="Henüz veri yok"
                  description="Öğretmen henüz kitap veya ödev atamamış."
                />
              </Section>
            )}
          </div>
        )
      })}

      {studentData.length > 0 && <ExplainerCards cards={EXPLAINERS} />}
    </div>
  )
}
