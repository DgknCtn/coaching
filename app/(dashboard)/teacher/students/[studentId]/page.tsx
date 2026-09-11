import Link from 'next/link'
import { isOverdue } from '@/lib/homework-status'
import { buildHomeworkDetail, type HomeworkDetailItem } from '@/lib/homework-detail'
import { AcademicNotesPanel, type AcademicNote } from './academic-notes-panel'
import { notFound, redirect } from 'next/navigation'
import {
  Plus,
  BookOpen,
  ClipboardList,
  Users,
  FileText,
  Pencil,
  CircleCheck,
  CircleAlert,
  Hourglass,
  UserRound,
  History,
  Crosshair,
  StickyNote,
  ArrowRight,
} from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { formatRelativeTime } from '@/lib/student-attention'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { studentOverviewTabBySlug } from '@/components/nav-config'
import { AssignBookDialog } from './assign-book-dialog'
import { InviteList, type InviteListRow } from './invite-list'
import { deriveInviteStatus } from '@/lib/invite-status'
import { loadAssignableBooks } from '@/lib/assignable-books'
import { InviteDialog } from './invite-dialog'
import { PendingApprovalList } from './pending-approval-list'
import { BookCard } from '@/components/shared/book-card'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { COUNTER_LABEL, OVERDUE_HINT } from '@/lib/homework-status'
import { Section } from '@/components/shared/section'
import { HomeworkBatchRow } from '@/components/shared/homework-batch-row'
import { R5SummaryCards } from '@/components/shared/r5-summary-cards'
import { loadBookMap } from '@/lib/book-map'
import { resolvePlanScope } from '@/lib/plan-scope'
import { bookPlanGroup } from '@/lib/resource-plan'
import { buildProtectionPool } from '@/lib/protection-pool'
import {
  buildAcademicTrail,
  buildWeeklyFocus,
  summarizeAcademicFlow,
  summarizeProtectionPool,
  summarizeResourcePlan,
  type FlowSummaryItem,
  type ResourceSummaryItem,
} from '@/lib/student-overview'
import { formatUnitCount } from '@/lib/unit-labels'
import { calculateFlowPace, deliverySilence } from '@/lib/weekly-flow'
import { ThisWeekCard, type ThisWeekView } from '@/components/shared/this-week-card'

export const dynamic = 'force-dynamic'

/** Supabase iç içe select'i tek kayıt için de dizi tipinde çözebiliyor. */
type Nested<T> = T | T[] | null
function one<T>(value: Nested<T>): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

export default async function StudentDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  // ?sekme= — Kitaplar / Yayınlanan Ödevler / Veliler / Öğretmen Hafızası.
  // Değer YOKSA özet gösterilir; tanınmayan değer de özete düşer.
  searchParams: Promise<{ sekme?: string }>
}) {
  const { studentId } = await params
  const sekme = (await searchParams).sekme

  // ESKİ BAĞLANTI KIRILMIYOR (R7/05 §8): Durum Bildirimleri Haftalık
  // Akış'ın alt sekmesi oldu. `?sekme=durum` taşıyan kayıtlı linkler ve
  // tarayıcı geçmişi özete düşseydi kullanıcı aradığı ekranı bulamadan
  // "kaldırılmış" sanırdı.
  if (sekme === 'durum') {
    redirect(`/teacher/students/${studentId}/haftalik-akis?sekme=bildirim`)
  }

  const tab = studentOverviewTabBySlug(sekme)
  const { supabase, workspaceId, activeTerm } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, email, phone, grade_level, exam_type, notes, status, profile_id')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student || student.status === 'archived') notFound()

  // Buradan sonraki sorguların hiçbiri diğerinin sonucuna ihtiyaç duymuyor;
  // sıralı beklemek sayfa açılışına doğrudan 10 gidiş-dönüş ekliyordu.
  // Tek dalgada çalışırlar — dönen veriler ve aşağıdaki hesaplar aynı.
  //
  // Tek incelik: "atanabilir kitaplar" listesi bookProgress'e göre
  // FİLTRELENİYOR ama sorgusu ondan bağımsız. Bu yüzden sorgu paralel
  // çalışır, eleme sonuçlar geldikten sonra yapılır (aşağıda).
  const [
    { data: bookProgress },
    { data: homeworkBatches },
    { data: pendingApprovalItems },
    { data: parentLinks },
    { data: inviteRows },
    { data: weeklySummary },
    { data: pendingApprovalSummary },
    { data: overdueSummary },
    { data: weekOperation },
    { data: lastSubmittedRows },
    { data: academicNoteRows },
    { data: flowRows },
    { data: contactRows },
    { data: openWorkRows },
    { data: overrideRows },
    r5Books,
  ] = await Promise.all([
    supabase
      .from('student_book_progress_view')
      .select('*')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    // Durum bildirimi sorguları BURADAN KALKTI: panel Haftalık Akış'a
    // taşındı ve veriyi orası çekiyor. Bırakılsalardı her Genel Bakış
    // açılışında hiç okunmayan iki sorgu çalışırdı.
    supabase
      .from('homework_batches')
      .select(`
        id, title, description, due_date, status,
        homework_items(
          id, status, book_id, section_id,
          books(title, tracking_mode),
          book_sections(title),
          book_tests(order_index)
        )
      `)
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('due_date', { ascending: false })
      .limit(20),
    supabase
      .from('homework_items')
      .select(`
        id, book_id, homework_batch_id,
        books(title, tracking_mode),
        book_sections(title),
        book_tests(title),
        homework_batches!inner(student_id, workspace_id, title, due_date)
      `)
      .eq('status', 'pending_approval')
      .eq('homework_batches.student_id', studentId)
      .eq('homework_batches.workspace_id', workspaceId),
    supabase
      .from('parent_student_links')
      .select('id, relationship_type, status, parent_profile_id, profiles(full_name, email)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .neq('status', 'removed'),
    // Davet geçmişi: "gönderdim mi, açık mı, kabul edildi mi?" sorusunun
    // arayüzdeki tek cevabı. Son 10 kayıt yeter — eskisi arşiv değeri taşımaz.
    supabase
      .from('invitations')
      .select('id, role, status, expires_at, created_at, accepted_at, invited_email')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(10),
    supabase
      .from('student_weekly_homework_summary_view')
      .select('*')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // "Onay Bekleyen" ve "Süresi Geçen" hafta penceresinden BAĞIMSIZ sayılır.
    // weeklySummary yalnız bu haftaya düşen batch'leri görür; oysa yukarıdaki
    // pendingApprovalItems listesi (ve /teacher/tasks) tüm haftaları kapsıyor.
    // 017 bu düzeltmeyi dashboard'a uygulamıştı, bu sayfa atlanmıştı — sayaç
    // "2" derken altındaki liste 5 satır gösterebiliyordu.
    supabase
      .from('student_pending_approval_view')
      .select('pending_approval_items')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('student_overdue_homework_view')
      .select('overdue_items')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // "BU HAFTA" bloğu (R7/02 §1). DASHBOARD İLE AYNI SATIR: ikinci bir
    // hesap yazılsaydı öğretmen listede bir sayı, öğrenciye girince
    // başka bir sayı görürdü.
    supabase
      .from('teacher_student_operation_view')
      // TEK STRING LİTERAL: supabase-js select'i TİP DÜZEYİNDE ayrıştırıyor;
      // `+` ile birleştirilen bir ifade literal tip olmadığı için dönen
      // satır `GenericStringError`'a düşer ve bütün alanlar kaybolur.
      .select(
        'weekly_flow_id, flow_started_at, flow_due_at, first_published_at, weekly_total, weekly_submitted, weekly_submitted_percent, approval_pending_count, next_contact_at, next_contact_kind'
      )
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // Son gönderim anı: "3+ gündür yeni teslim yok" sinyalinin girdisi.
    // Ölçüt ÖĞRENCİNİN GÖNDERİMİ (submitted_at), onay değil — 081'in
    // düzelttiği hatanın aynısı buraya da sızabilirdi.
    supabase
      .from('homework_items')
      .select('submitted_at, homework_batches!inner(student_id, workspace_id)')
      .eq('homework_batches.student_id', studentId)
      .eq('homework_batches.workspace_id', workspaceId)
      .not('submitted_at', 'is', null)
      .order('submitted_at', { ascending: false })
      .limit(1),
    // Akademik Not (R6-07). RLS gereği bu sorgu yalnız eğitmen oturumunda
    // satır döndürür; öğrenci/veli için politika tanımlı değildir.
    supabase
      .from('academic_notes')
      .select('id, note_text, pinned, created_at, profiles(full_name)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(100),
    // R5.5: üç özet kartın verisi. Hepsi opsiyoneldir — R5 verisi olmayan
    // öğrencide boş döner ve kartlar nötr boş durum gösterir (OG-07).
    supabase
      .from('student_curriculum_items')
      .select('topic_id, scope_id, start_date, end_date, passed_at, topics(name), academic_scopes(name)')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_topic_contact_view')
      .select('topic_id, last_contact_date, last_contact_source, last_contact_amount')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_topic_open_work_view')
      .select('topic_id, open_items')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('student_topic_overrides')
      .select('topic_id, keep_active')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    // Kaynak Planı özeti kapsam-duyarlı olmalı: Plan % ana göstergedir
    // (OG-04), o da hedef kapsamından hesaplanır.
    loadBookMap(supabase, {
      workspaceId,
      studentId,
      statuses: ['active', 'pending', 'paused', 'completed'],
    }),
  ])

  const academicNotes: AcademicNote[] = ((academicNoteRows ?? []) as unknown as {
    id: string
    note_text: string
    pinned: boolean
    created_at: string
    profiles: Nested<{ full_name: string | null }>
  }[]).map(row => ({
    id: row.id,
    note_text: row.note_text,
    pinned: row.pinned,
    created_at: row.created_at,
    author_name: one(row.profiles)?.full_name ?? null,
  }))

  // Sinyal için sayılar — İÇERİK DEĞİL (R7/02 §4). `note_text` bu
  // sayfada artık hiçbir yerde render edilmiyor; Genel Bakış yalnız
  // "kaç not, kaçı önemli, en son ne zaman" diyor.
  //
  // Sorgu METNİ hâlâ çekiyor çünkü AYNI dizi `?sekme=not` panelini de
  // besliyor. Server component yalnız RENDER ETTİĞİNİ istemciye
  // gönderir: panel açık değilken metin tarayıcıya hiç inmez.
  const lastAcademicNote = academicNotes[0] ?? null
  const pinnedNoteCount = academicNotes.filter(n => n.pinned).length

  // ============================================================
  // "BU HAFTA" (R7/02 §1)
  // ============================================================
  // Hesaplar lib/weekly-flow.ts'te; sayfa yalnız veriyi topluyor.
  // Tempo eşikleri burada YAZILMIYOR — aynı bant Haftalık Akış
  // ekranında da gösteriliyor ve iki yerde ayrı yazılsaydı aynı öğrenci
  // iki ekranda iki farklı bant alırdı.
  const now = new Date()
  const lastSubmittedAt =
    (lastSubmittedRows?.[0]?.submitted_at as string | null | undefined) ?? null

  const thisWeek: ThisWeekView = {
    flowId: (weekOperation?.weekly_flow_id as string | null) ?? null,
    total: Number(weekOperation?.weekly_total ?? 0),
    submitted: Number(weekOperation?.weekly_submitted ?? 0),
    percent: Number(weekOperation?.weekly_submitted_percent ?? 0),
    approvalPending: Number(weekOperation?.approval_pending_count ?? 0),
    nextContactAt: (weekOperation?.next_contact_at as string | null) ?? null,
    nextContactKind: (weekOperation?.next_contact_kind as 'ders' | 'kocluk' | null) ?? null,
    lastSubmittedAt,
    silence: deliverySilence({
      lastDeliveryAt: lastSubmittedAt ? new Date(lastSubmittedAt) : null,
      now,
    }),
    pace: (() => {
      if (!weekOperation?.flow_due_at) return null
      const p = calculateFlowPace({
        totalUnits: Number(weekOperation.weekly_total ?? 0),
        deliveredUnits: Number(weekOperation.weekly_submitted ?? 0),
        firstPublishedAt: weekOperation.first_published_at
          ? new Date(weekOperation.first_published_at as string)
          : null,
        dueAt: new Date(weekOperation.flow_due_at as string),
        now,
      })
      return p
        ? { startingPerDay: p.startingPerDay, requiredPerDay: p.requiredPerDay, band: p.band }
        : null
    })(),
  }

  // ============================================================
  // R5.5 — üç özet kartın verisi
  //
  // Hesaplama lib/student-overview.ts'te; burası yalnız satırları
  // biçime çevirir. R5 verisi yoksa hepsi boş döner ve kartlar nötr
  // boş durum gösterir; ekran kırılmaz (OG-07).
  // ============================================================
  const flowItems: FlowSummaryItem[] = (
    (flowRows ?? []) as unknown as {
      topic_id: string
      scope_id: string
      start_date: string
      end_date: string
      passed_at: string | null
      topics: Nested<{ name: string }>
      academic_scopes: Nested<{ name: string }>
    }[]
  ).map(r => ({
    topicId: r.topic_id,
    topicName: one(r.topics)?.name ?? 'Konu',
    scopeId: r.scope_id,
    scopeName: one(r.academic_scopes)?.name ?? 'Kapsam',
    startDate: r.start_date,
    endDate: r.end_date,
    passed: r.passed_at !== null,
  }))

  const flowSummary = summarizeAcademicFlow(flowItems)

  const resourceSummary = summarizeResourcePlan(
    (r5Books as Awaited<ReturnType<typeof loadBookMap>>).map<ResourceSummaryItem>(b => {
      const scope = resolvePlanScope(b)
      return {
        bookId: b.bookId,
        title: b.title,
        group: bookPlanGroup(b.status),
        planPercentage: scope.percentage,
        bookPercentage: scope.bookPercentage,
        // Sunum alanları (özet hesabına girmez): tablo satırındaki rozet ve
        // kapsam metni. Birim adı kaynağın takip türünden gelir.
        role: b.role,
        status: b.status,
        scopeLabel: formatUnitCount(scope.totalUnits, b.trackingMode),
      }
    })
  )

  // Havuz, akıştaki konularla sınırlıdır (KH-17) — detay ekranıyla aynı kural.
  const contactByTopic = new Map(
    (
      (contactRows ?? []) as {
        topic_id: string
        last_contact_date: string
        last_contact_source: string
        last_contact_amount: number
      }[]
    ).map(r => [r.topic_id, r])
  )
  const openByTopic = new Map(
    ((openWorkRows ?? []) as { topic_id: string; open_items: number }[]).map(r => [
      r.topic_id,
      r.open_items,
    ])
  )
  const overrideByTopic = new Map(
    ((overrideRows ?? []) as { topic_id: string; keep_active: boolean }[]).map(r => [
      r.topic_id,
      r.keep_active,
    ])
  )

  const poolSummary = summarizeProtectionPool(
    buildProtectionPool(
      [...new Map(flowItems.map(f => [f.topicId, f])).values()].map(f => {
        const contact = contactByTopic.get(f.topicId)
        return {
          topicId: f.topicId,
          topicName: f.topicName,
          scopeId: f.scopeId,
          scopeName: f.scopeName,
          lastContactDate: contact?.last_contact_date ?? null,
          lastContactSource:
            (contact?.last_contact_source as 'homework' | 'lesson' | 'self_study' | null) ?? null,
          lastContactAmount: Number(contact?.last_contact_amount ?? 0),
          openWorkCount: Number(openByTopic.get(f.topicId) ?? 0),
          keepActive: overrideByTopic.get(f.topicId) === true,
          bookTitles: [],
        }
      })
    ).map(r => ({
      topicId: r.topicId,
      topicName: r.topicName,
      daysSinceContact: r.daysSinceContact,
    }))
  )

  // Son Akademik İz ve Bu Hafta Odak: ikisi de SAYFANIN ZATEN ÇEKTİĞİ
  // kümelerden türer, yeni sorgu yoktur (lib/student-overview.ts).
  const academicTrail = buildAcademicTrail({
    notes: academicNotes.map(n => ({
      id: n.id,
      note_text: n.note_text,
      created_at: n.created_at,
      author_name: n.author_name,
    })),
    homework: (homeworkBatches ?? []).map(batch => {
      const items = (batch.homework_items as unknown as { status: string }[]) ?? []
      return {
        id: batch.id,
        title: batch.title,
        due_date: batch.due_date,
        itemCount: items.length,
        completedCount: items.filter(i => i.status === 'completed').length,
      }
    }),
  })

  const weeklyFocus = buildWeeklyFocus({
    studentId,
    pendingApproval: pendingApprovalSummary?.pending_approval_items ?? 0,
    overdue: overdueSummary?.overdue_items ?? 0,
    pool: poolSummary,
    resources: resourceSummary,
  })

  // Atanabilir kitap listesi Kaynak Planı ekranıyla ORTAK yükleyiciden gelir;
  // iki ekran aynı listeyi göstermek zorunda (lib/assignable-books.ts).
  const availableBooks = await loadAssignableBooks(supabase, {
    workspaceId,
    termId: activeTerm?.id ?? null,
    assignedBookIds: (bookProgress ?? []).map(p => p.book_id),
  })

  const hasAccount = !!student.profile_id

  const invites: InviteListRow[] = (
    (inviteRows ?? []) as {
      id: string
      role: string
      status: string
      expires_at: string
      created_at: string
      accepted_at: string | null
      invited_email: string | null
    }[]
  ).map(r => ({
    id: r.id,
    role: r.role === 'student' ? 'student' : 'parent',
    status: r.status,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
    acceptedAt: r.accepted_at,
    invitedEmail: r.invited_email,
    createdByName: null,
  }))

  // "Yeni link eskisini iptal eder" uyarısı yalnız gerçekten açık davet
  // varken gösterilmeli; süresi dolmuş bir davet uyarıyı hak etmez.
  const hasPendingInvite = (role: 'student' | 'parent') =>
    invites.some(i => i.role === role && deriveInviteStatus(i) === 'active')

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6 md:p-8">
      <PageHeader
        // AD VE SINIF BURADA DEĞİL (067): çalışma masasının üst şeridinde,
        // sekmelerle birlikte duruyor ve gezinme boyunca yerinde kalıyor.
        // Burada kalan tek kimlik bilgisi İLETİŞİM — o şeride sığmayan ve
        // yalnız bu ekranda işe yarayan kısım.
        //
        // Geri düğmesi kaldırıldı: "Genel Bakış" artık bir sekme, listeye
        // dönüş yolu sol menüdeki "Öğrenciler".
        title={tab ? tab.label : 'Genel Bakış'}
        // İLETİŞİM VE EYLEMLER YALNIZ GENEL BAKIŞ'TA.
        //
        // Kitaplar / Ödevler / Durum / Veliler / Not ayrı rota değil, bu
        // sayfanın `?sekme=` varyantları. Aşağıdaki özet blokları zaten
        // `{!tab && ...}` ile korunuyordu ama başlık korunmuyordu: koç
        // hangi panele geçerse geçsin "Genel Bakış" başlığını ve
        // Düzenle / Rapor / Ödev Ver düğmelerini görmeye devam ediyordu.
        // Bir panelin başında o panelle ilgisi olmayan üç düğme durması,
        // hangisinin neye ait olduğunu okunamaz kılıyor.
        subtitle={
          tab
            ? undefined
            : [student.email, student.phone].filter(Boolean).join(' · ') || undefined
        }
        // Akış / Kaynak Planı / Koruma / Rapor üstteki sekme şeridinde;
        // başlıkta yalnız bu ekranın kendi eylemleri kalıyor.
        action={
          tab ? undefined : (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/teacher/students/${studentId}/edit`} />}
              >
                <Pencil />
                Düzenle
              </Button>
              <Button
                size="sm"
                variant="outline"
                render={<Link href={`/teacher/students/${studentId}/report`} />}
              >
                <FileText />
                Rapor
              </Button>
              <Button
                size="sm"
                render={<Link href={`/teacher/students/${studentId}/homework/new`} />}
              >
                <Plus />
                Ödev Ver
              </Button>
            </div>
          )
        }
      />

      {/* ÖZET YALNIZ GENEL BAKIŞ'TA (068): bir panel seçiliyken sayaçları,
          nabız kartlarını ve akademik izi de çizmek, kullanıcıyı aradığı
          panele ulaşmak için her seferinde aynı bloğun altına kaydırmaya
          zorlardı. Panelin bağlamı zaten üstteki şeritte. */}
      {!tab && (
        <>
      {/* BU HAFTA — sayfanın BİRİNCİ ve en güçlü operasyon bloğu
          (R7/02 §1). Belgenin tespiti: "Bu Hafta bilgisi ilk ve baskın
          blok değil." Öğretmenin bir öğrenciye girerken ilk sorusu bu;
          altındaki sayaç şeridi ve nabız kartları ikinci sırada. */}
      <ThisWeekCard studentId={studentId} view={thisWeek} now={now} />

      {weeklySummary && (
        <MetricTiles
          className="xl:grid-cols-5"
          metrics={[
            {
              label: COUNTER_LABEL.assigned,
              value: weeklySummary.assigned_tests ?? 0,
              icon: ClipboardList,
            },
            {
              label: COUNTER_LABEL.completed,
              value: weeklySummary.completed_tests ?? 0,
              tone: 'success',
              icon: CircleCheck,
            },
            {
              label: COUNTER_LABEL.pending,
              value: weeklySummary.pending_tests ?? 0,
              tone: 'warning',
              icon: UserRound,
            },
            // R6-10: sayaçlar Görevler'i BU ÖĞRENCİYE daraltarak açar.
            // Global sayaçlar (dashboard) öğrenci parametresi taşımaz.
            {
              label: COUNTER_LABEL.pendingApproval,
              value: pendingApprovalSummary?.pending_approval_items ?? 0,
              tone: 'info',
              icon: Hourglass,
              href: `/teacher/tasks?filter=approval&student=${studentId}`,
            },
            {
              label: COUNTER_LABEL.overdue,
              value: overdueSummary?.overdue_items ?? 0,
              tone: 'destructive',
              icon: CircleAlert,
              hint: OVERDUE_HINT,
              href: `/teacher/tasks?filter=overdue&student=${studentId}`,
            },
          ]}
        />
      )}

      {/* R5.5: üç sistemin nabzı. Mevcut R4 operasyon sayaçları
          (yukarıda) AYRI KATMANDIR ve bu bloktan etkilenmez (OG-09). */}
      <R5SummaryCards
        studentId={studentId}
        flow={flowSummary}
        resources={resourceSummary}
        pool={poolSummary}
      />

      {/* ÖĞRETMEN HAFIZASI — YALNIZ SİNYAL, İÇERİK YOK (R7/02 §4).

          Burada eskiden notun METNİ duruyordu (`line-clamp-2` ile iki
          satır). Belge bunu açıkça kaldırıyor: *"Genel Bakışta not
          içeriği görünmez. Yalnız '3 not · 1 önemli not · son güncelleme
          4 gün önce' gibi sinyal gösterilir. Notları aç bilinçli aksiyon
          ister. Böylece Meet/Zoom ekran paylaşımı güvenli kalır."*

          Öğretmen bir öğrenciyle ekran paylaşırken Genel Bakış'ı açmak
          zorunda; o anda kendi özel notunun iki satırının ekranda
          olması, notu yazarken yaptığı varsayımı bozuyordu.

          Not yoksa BURASI HİÇ GÖRÜNMEZ — sistem uyarı veya görev
          üretmez (R6-07 kabul #49 ile aynı ilke). */}
      {academicNotes.length > 0 && (
        <Link
          href={`/teacher/students/${studentId}?sekme=not`}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 transition-colors hover:bg-accent"
        >
          <div className="flex items-center gap-2">
            <StickyNote className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <p className="text-sm">
              <span className="font-medium">Öğretmen Hafızası</span>
              <span className="text-muted-foreground">
                {' · '}
                {academicNotes.length} not
                {pinnedNoteCount > 0 && ` · ${pinnedNoteCount} önemli not`}
                {lastAcademicNote &&
                  ` · son güncelleme ${formatRelativeTime(lastAcademicNote.created_at)}`}
              </span>
            </p>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">Notları aç →</span>
        </Link>
      )}

      {/* Son Akademik İz + Bu Hafta Odak.
          İkisi de mevcut veriden türer: iz notlar ve ödevlerden, odak ise
          onay bekleyen / süresi geçen / havuz / plan sinyallerinden. Hiçbir
          sinyal yoksa ilgili blok HİÇ GÖSTERİLMEZ — sistem görev uydurmaz
          (R6-07 kabul #49 ile aynı ilke). */}
      {(academicTrail.length > 0 || weeklyFocus.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {academicTrail.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <History className="size-3.5" />
                </span>
                <div>
                  <h2 className="text-sm font-medium">Son Akademik İz</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Son çalışmalar ve akademik notlar
                  </p>
                </div>
              </div>

              <ol className="space-y-3">
                {academicTrail.map(entry => (
                  <li key={entry.id} className="flex gap-3">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary/60" />
                    <div className="min-w-0">
                      <p className="text-sm">{entry.text}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {new Date(entry.date).toLocaleDateString('tr-TR', {
                          day: 'numeric',
                          month: 'long',
                        })}
                        {entry.detail ? ` · ${entry.detail}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {weeklyFocus.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex items-start gap-2.5">
                <span
                  aria-hidden
                  className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
                >
                  <Crosshair className="size-3.5" />
                </span>
                <div>
                  <h2 className="text-sm font-medium">Bu Hafta Odak</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Mevcut sinyallerden çıkan başlıklar
                  </p>
                </div>
              </div>

              <ul className="space-y-2">
                {weeklyFocus.map(item => (
                  <li key={item.id}>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted"
                      >
                        <span className="min-w-0 truncate">{item.text}</span>
                        <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      </Link>
                    ) : (
                      <span className="block px-2 py-1.5 text-sm">{item.text}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

        </>
      )}

      {/* PANELLER ARTIK ÜST ŞERİTTE (068).
          Burada bir TabsList vardı ve seçim client state'te tutuluyordu:
          hangi sekmede olduğun paylaşılamıyor, yer imlenemiyor, geri
          tuşuyla gezilemiyordu. Sekmeler çalışma masasının şeridine
          taşındı (student-tabs.tsx), seçim ?sekme= ile URL'de. */}
      {tab?.slug === 'kitaplar' && (
          <Section
            title="Atanmış kitaplar"
            action={
              activeTerm && availableBooks.length > 0 ? (
                <AssignBookDialog studentId={studentId} books={availableBooks} />
              ) : undefined
            }
          >
            {!bookProgress?.length ? (
              <div className="rounded-lg border bg-card">
                <EmptyState
                  icon={BookOpen}
                  title="Henüz kitap atanmamış"
                  description={
                    activeTerm && availableBooks.length > 0
                      ? 'Kitap eklemek için "Kitap Ata" butonunu kullanın.'
                      : !activeTerm
                      ? 'Önce aktif bir dönem oluşturun.'
                      : 'Bu dönemdeki tüm kitaplar atanmış.'
                  }
                />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {bookProgress.map((p) => (
                  <BookCard
                    key={p.student_book_assignment_id}
                    book={{
                      id: p.book_id,
                      title: p.book_title,
                      subject: p.subject,
                      exam_type: p.exam_type,
                      tracking_mode: p.tracking_mode,
                    }}
                    progress={{
                      completed: p.completed_tests,
                      total: p.total_tests,
                      percentage: Number(p.completion_percentage),
                      targetDate: p.target_end_date,
                    }}
                    href={`/teacher/students/${studentId}/books/${p.book_id}`}
                  />
                ))}
              </div>
            )}
          </Section>
      )}

      {tab?.slug === 'odevler' && (
          <div className="space-y-8">
            <PendingApprovalList
              studentId={studentId}
              items={(pendingApprovalItems ?? []).map((item) => ({
                id: item.id,
                book_id: item.book_id ?? null,
                homework_batch_id: item.homework_batch_id,
                books: item.books as unknown as { title: string } | null,
                book_sections: item.book_sections as unknown as { title: string } | null,
                book_tests: item.book_tests as unknown as { title: string } | null,
              }))}
            />

            <Section
              title="Ödevler"
              action={
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href={`/teacher/students/${studentId}/homework/new`} />}
                >
                  <Plus />
                  Ödev Ver
                </Button>
              }
            >
              {!homeworkBatches?.length ? (
                <div className="rounded-lg border bg-card">
                  <EmptyState
                    icon={ClipboardList}
                    title="Henüz ödev yok"
                    description="Bu öğrenciye ödev vererek takip etmeye başlayın."
                    action={{
                      label: 'Ödev Ver',
                      href: `/teacher/students/${studentId}/homework/new`,
                    }}
                  />
                </div>
              ) : (
                <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                  {homeworkBatches.map((batch) => {
                    // Supabase iç içe select'i tek kaydı da dizi tipinde
                    // çözebiliyor; okurken tekile indiriyoruz.
                    const items =
                      (batch.homework_items as unknown as {
                        id: string
                        status: string
                        book_id: string | null
                        section_id: string | null
                        books: Nested<{ title: string; tracking_mode: string }>
                        book_sections: Nested<{ title: string }>
                        book_tests: Nested<{ order_index: number }>
                      }[]) ?? []
                    const total = items.length
                    const completed = items.filter((i) => i.status === 'completed').length
                    // R6-06: detay assignment_items'tan türetilir; ödev
                    // kaydında ayrı bir kopya metin tutulmaz.
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
                    // R6-02: teslim gününün tamamı kullanılabilir. Gecikme
                    // kararı lib/homework-status.ts'ten gelir.
                    const batchOverdue =
                      isOverdue(batch.due_date) && items.some((i) => i.status === 'pending')
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
                        />
                      </li>
                    )
                  })}
                </ul>
              )}
            </Section>
          </div>
      )}

      {/* Durum bildirimi paneli BURADAN KALKTI — Haftalık Akış >
          Durum Bildirimleri sekmesinde yaşıyor (R7/05 §8). Yukarıdaki
          redirect eski `?sekme=durum` bağlantılarını oraya taşıyor. */}

      {tab?.slug === 'veliler' && (
        <>
          <Section
            title="Veliler"
            action={
              <div className="flex items-center gap-2">
                {!hasAccount && (
                  <InviteDialog
                    studentId={studentId}
                    studentName={student.full_name}
                    inviteType="student"
                    hasPendingInvite={hasPendingInvite('student')}
                  />
                )}
                <InviteDialog
                  studentId={studentId}
                  studentName={student.full_name}
                  inviteType="parent"
                  hasPendingInvite={hasPendingInvite('parent')}
                />
              </div>
            }
          >
            {!parentLinks?.length ? (
              <div className="rounded-lg border bg-card">
                <EmptyState
                  icon={Users}
                  title="Bağlı veli yok"
                  description="Veli davet ederek takip sürecine dahil edin."
                />
              </div>
            ) : (
              <ul className="divide-y overflow-hidden rounded-lg border bg-card">
                {parentLinks.map((link) => {
                  const prof = link.profiles as unknown as {
                    full_name: string
                    email: string
                  } | null
                  return (
                    <li key={link.id} className="flex items-center justify-between gap-4 p-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                          <span className="text-xs font-medium text-muted-foreground">
                            {(prof?.full_name ?? 'V').charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {prof?.full_name ?? 'Davet bekleniyor'}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {prof?.email ?? ''}
                          </p>
                        </div>
                      </div>
                      <Badge variant={link.status === 'active' ? 'success' : 'neutral'}>
                        {link.status === 'active'
                          ? 'Aktif'
                          : link.status === 'invited'
                          ? 'Davet edildi'
                          : link.status}
                      </Badge>
                    </li>
                  )
                })}
              </ul>
            )}
          </Section>

          {invites.length > 0 && (
            <Section
              title="Davetler"
              description="Gönderilen davetlerin durumu. Açık bir daveti iptal ederseniz link hemen çalışmaz olur."
            >
              <InviteList studentId={studentId} invites={invites} />
            </Section>
          )}
        </>
      )}

      {tab?.slug === 'not' && (
          <Section
            title="Akademik Not / Öğrenci Hafızası"
            description="Derse başlarken hatırlamak istedikleriniz. Yalnız eğitmenlere görünür; öğrenci ve veli panelinde yer almaz."
          >
            <AcademicNotesPanel studentId={studentId} notes={academicNotes} />
          </Section>
      )}
    </div>
  )
}
