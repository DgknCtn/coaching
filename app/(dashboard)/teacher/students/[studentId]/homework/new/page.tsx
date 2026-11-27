import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { loadKeepActiveTopicIds } from '@/lib/topic-overrides'
import { localDateString } from '@/lib/homework-status'
import {
  defaultSubmissionDeadline,
  deriveMainContact,
  CONTACT_KIND_LABEL,
  contactKindOf,
  type ServiceLike,
} from '@/lib/service-structure'
import { localClock } from '@/lib/homework-load'
import { Button } from '@/components/ui/button'
import { HomeworkBuilder } from './homework-builder'
import { listResult, singleResult, type QueryResult } from '@/lib/data-result'
import { loadStudentTasks } from '@/lib/academic-tasks-load'
import { loadCoursesData } from '../../dersler/load'
import { loadOpenWork } from '@/lib/open-homework'
import { loadHomeworkPlans } from '@/lib/homework-plan-load'
import { dueFromNextSession, pickDefaultDue } from '@/lib/homework-defaults'
import { loadAssignableBooks } from '@/lib/assignable-books'
import { loadWorkspaceScopes } from '@/lib/student-scopes'
import type { PendingBook, PoolBook } from './book-picker'

// Sorgu hatası boş sonuca çevrilmez; teacher/error.tsx hata sınırına gider.
function orThrow<T>(r: QueryResult<T>): T {
  if (!r.ok) throw new Error(r.error)
  return r.data
}

export const dynamic = 'force-dynamic'

export default async function NewHomeworkPage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>
  /** R7: kitap detayındaki "Bu kitapta çalış" bağlantısı haritayı doğrudan
   *  o kaynakta açar. */
  searchParams: Promise<{ book?: string }>
}) {
  const { studentId } = await params
  const { book: initialBookId } = await searchParams
  const { supabase, workspaceId, activeTerm, profile } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  // Arşivdeki öğrenciye işlem yapılmaz (M1.0-01 §1.1).
  if (!student || student.status === 'archived') notFound()

  if (!activeTerm) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Link href={`/teacher/students/${studentId}`}>
            <Button variant="ghost" size="icon-sm"><ArrowLeft className="size-4" /></Button>
          </Link>
          <h1 className="text-xl font-semibold">Ödev Planlama</h1>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">Aktif dönem bulunamadı. Önce bir dönem aktif edin.</p>
        </div>
      </div>
    )
  }

  // Harita ve durumlar tek ortak yükleyiciden gelir — öğrenci-kitap sayfası da
  // aynı kaynağı kullanır, ikinci bir "harita durumu" veri seti yok.
  //
  // Taslak sorgusu haritadan bağımsız; ikisi tek dalgada çalışır. (Taslak
  // KALEMLERİ taslağın id'sine bağlı olduğu için o aşağıda sıralı kalır.)
  const [books, keepActiveTopicIds, draftRes] = await Promise.all([
    loadBookMap(supabase, { workspaceId, studentId }),
    // Bölüm satırı menüsündeki "Aktif Tut" toggle'ının yönü (041 §6.5).
    loadKeepActiveTopicIds(supabase, { workspaceId, studentId }),
    // Kaydedilmiş taslak (019): kitap değişiminde ve sayfa yenilemesinde
    // seçimlerin korunmasını sağlar.
    supabase
      .from('weekly_plan_drafts')
      .select('id, due_date, due_at, title, note')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .eq('teacher_profile_id', profile.id)
      .maybeSingle(),
  ])

  // TASLAK OKUNAMADIYSA EKRAN AÇILMAZ (B01 + B05). Boş açılsaydı
  // öğretmenin ilk tıklamasındaki otomatik kayıt, kayıtlı taslağın
  // ÜZERİNE boş seçimi yazardı: bir okuma hatası kalıcı veri kaybına
  // dönüşürdü. Hata sınırı "tekrar dene" sunar.
  const draft = orThrow(singleResult(draftRes, 'homework_new.draft'))

  // AKTİF HAFTALIK AKIŞ (R7/05 kabul #4). Akış okunamazsa "akış yok"
  // sanılıp ödev akışsız yayınlanırdı (B06).
  const activeFlowRes = await supabase
    .from('weekly_flows')
    .select('id, due_at, due_source')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  const activeFlowRow = orThrow(singleResult(activeFlowRes, 'homework_new.active_flow'))

  // SON TESLİM ADAYLARI — "Ödev Verme Akışını Kısaltma" (26.11.2026) §4.
  // Sıradaki planlı ders (Ders & Görüşmeler; taşınmış ve Calendar'dan
  // gelen dersler current_planned_at ile doğru gelir) ve ana temasın
  // haftalık programı. Akış olsa da hesaplanır: akış BAYATSA (son teslimi
  // geçmiş, hafta kapatılmamış) varsayılan buradan gelir.
  const now = new Date()
  const [servicesRes, nextSessionsRes] = await Promise.all([
    supabase
      .from('student_services')
      .select(
        'id, kind, participation, medium, cadence, weekday, start_time, weekday_2, start_time_2, start_date, status, submission_offset_minutes, is_main_contact'
      )
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId),
    supabase
      .from('service_sessions')
      .select('service_id, current_planned_at')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'planlandi')
      .gt('current_planned_at', now.toISOString())
      .order('current_planned_at')
      .limit(20),
  ])
  const serviceRows = orThrow(listResult(servicesRes, 'homework_new.services'))
  const services = serviceRows.map(s => ({
    id: s.id,
    kind: s.kind,
    participation: s.participation,
    medium: s.medium,
    cadence: s.cadence ?? undefined,
    weekday: s.weekday,
    startTime: String(s.start_time).slice(0, 5),
    weekday2: s.weekday_2 ?? null,
    startTime2: s.start_time_2 ? String(s.start_time_2).slice(0, 5) : null,
    startDate: s.start_date,
    status: s.status,
    submissionOffsetMinutes: s.submission_offset_minutes ?? 0,
    isMainContact: Boolean(s.is_main_contact),
  })) as ServiceLike[]
  const anchor = deriveMainContact(services)
  const anchorAt = anchor ? defaultSubmissionDeadline(anchor, now) : null
  const activeServiceIds = new Set(services.filter(s => s.status === 'active').map(s => s.id))
  const nextSession = dueFromNextSession(
    ((nextSessionsRes.data ?? []) as { service_id: string; current_planned_at: string }[])
      .filter(r => activeServiceIds.has(r.service_id))
      .map(r => ({ serviceId: r.service_id, at: r.current_planned_at })),
    new Map(services.map(s => [s.id, s.submissionOffsetMinutes ?? 0])),
    anchor?.id ?? null,
    now
  )

  const picked = pickDefaultDue({
    draftDue: (draft?.due_at as string | null | undefined) ?? (draft?.due_date as string | null | undefined) ?? null,
    activeFlowDueAt: (activeFlowRow?.due_at as string | undefined) ?? null,
    nextSession,
    anchor: anchor && anchorAt ? { dueAt: anchorAt.toISOString(), serviceId: anchor.id } : null,
    now,
    today: localDateString(now),
  })

  // Bayat akış builder'a "aktif hafta" olarak VERİLMEZ: varsayılanı ve
  // "aynı hafta" kararını bozuyordu. Yayında "Geçen hafta kapanmamış"
  // sorusu için ayrıca taşınır (yeni hafta açılınca eskisi kapanır, 078).
  const activeFlow =
    activeFlowRow && !picked.stale
      ? {
          id: activeFlowRow.id,
          dueAt: activeFlowRow.due_at as string,
          // Kapanışın günü: ödevin `due_date`'i bir DATE olduğu için
          // varsayılan da gün olarak veriliyor. Dönüşüm YEREL takvimle —
          // sunucudaki aidiyet kuralı da yerel günü kullanıyor (077:367).
          dueDate: localDateString(new Date(activeFlowRow.due_at)),
          dueSource: activeFlowRow.due_source as 'anchor' | 'custom',
        }
      : null
  const staleFlow = activeFlowRow && picked.stale ? { id: activeFlowRow.id, dueAt: activeFlowRow.due_at as string } : null

  // Yeni hafta açılırken önerilecek son teslim (hizmetten türeyen).
  const serviceDue = nextSession ?? (anchor && anchorAt && anchorAt > now ? { dueAt: anchorAt.toISOString(), serviceId: anchor.id } : null)
  const serviceDueService = serviceDue ? services.find(s => s.id === serviceDue.serviceId) ?? null : null
  const fallbackDue = serviceDue && serviceDueService
    ? {
        dueAt: serviceDue.dueAt,
        source: nextSession ? 'ders' : CONTACT_KIND_LABEL[contactKindOf(serviceDueService)],
        anchorServiceId: serviceDue.serviceId,
      }
    : null

  // Varsayılan son teslim: ileri tarihli taslak > canlı akış > sıradaki
  // ders > ana temas > boş. Geçmiş tarih ASLA varsayılan değildir.
  const initialDueDate =
    picked.source === 'draft' && !picked.dueAt
      ? (draft?.due_date as string)
      : picked.dueAt
        ? localDateString(new Date(picked.dueAt))
        : ''
  const initialDueTime = picked.dueAt ? localClock(new Date(picked.dueAt)) : '18:00'

  let draftTestIds: string[] = []
  if (draft?.id) {
    const draftItemsRes = await supabase
      .from('weekly_plan_draft_items')
      .select('book_test_id')
      .eq('draft_id', draft.id)
    const draftItems = orThrow(listResult(draftItemsRes, 'homework_new.draft_items'))
    draftTestIds = draftItems.map(i => i.book_test_id)
  }

  // M1.0-03 ORTAK SEPET: kitap seçimleri ve akademik görevler aynı
  // haftalık planda. Görev taslakları öğretmene özel (148).
  const [draftTasks, coursesData, openTaskRows, openWork, plans, pendingRes, scopeRows] = await Promise.all([
    loadStudentTasks(supabase, { studentId, statuses: ['draft'], createdByProfileId: profile.id }),
    loadCoursesData(supabase, { workspaceId, studentId }),
    // İz V2 R04: hafta geçişinde yeni haftaya aktarılabilecek açık işler —
    // kitap kalemleri ve aktif hafta DIŞINDAKİ açık öğretmen görevleri.
    loadStudentTasks(supabase, { studentId, statuses: ['open'] }),
    loadOpenWork(supabase, { workspaceId, studentId }),
    // Mini 05/06: sepetin hedefi (açık planlar) ve yeni planın numarası.
    loadHomeworkPlans(supabase, { workspaceId, studentId }),
    // Ödev akışı (26.11.2026) §2: beklemedeki kitaplar burada aktif edilir.
    supabase
      .from('student_book_assignments')
      .select('id, book_id, books(title)')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .eq('academic_term_id', activeTerm.id)
      .eq('status', 'pending'),
    loadWorkspaceScopes(supabase, { workspaceId }),
  ])
  const pendingBooks: PendingBook[] = ((pendingRes.data ?? []) as unknown as {
    id: string
    book_id: string
    books: { title: string } | { title: string }[] | null
  }[]).map(r => ({
    assignmentId: r.id,
    bookId: r.book_id,
    title: (Array.isArray(r.books) ? r.books[0]?.title : r.books?.title) ?? 'Kitap',
  }))
  // Havuz: bu dönemde öğrenciye hiç atanmamış aktif kitaplar.
  const poolBooks: PoolBook[] = (
    await loadAssignableBooks(supabase, {
      workspaceId,
      termId: activeTerm.id,
      assignedBookIds: [...books.map(b => b.bookId), ...pendingBooks.map(b => b.bookId)],
      studentId,
    })
  ).map(b => ({
    id: b.id,
    title: b.title,
    subject: b.subject ?? null,
    levelExam: b.level_exam ?? null,
    publisher: b.publisher ?? null,
  }))
  const openTasks = openTaskRows.filter(
    t => t.createdByRole === 'teacher' && t.weeklyFlowId !== (activeFlowRow?.id ?? null)
  )
  const courses = coursesData.courses.filter(c => c.active).map(c => ({ id: c.scopeId, name: c.name }))

  // Kitabı olmayan öğrenciye de görev planı yayınlanabilir. 26.11.2026 §2:
  // beklemede ya da havuzda kitap varsa ekran AÇILIR — kitap buradan
  // atanır/aktif edilir. Boş durum yalnız hiçbir yol yokken kalır ve
  // Kaynaklar sekmesine DOĞRU bağlantı verir (eskiden Genel Bakış'a
  // gidiyordu: çıkmaz sokak).
  if (
    books.length === 0 &&
    courses.length === 0 &&
    draftTasks.length === 0 &&
    pendingBooks.length === 0 &&
    poolBooks.length === 0
  ) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Link href={`/teacher/students/${studentId}`}>
            <Button variant="ghost" size="icon-sm"><ArrowLeft className="size-4" /></Button>
          </Link>
          <h1 className="text-xl font-semibold">Ödev Planlama</h1>
        </div>
        <div className="py-12 text-center text-muted-foreground">
          <p>Bu öğrenciye atanmış kitap yok ve bu dönemde atanabilir kitap da yok.</p>
          <Link href={`/teacher/students/${studentId}?sekme=kitaplar`} className="mt-3 inline-block">
            <Button variant="outline" size="sm">Kaynaklar&apos;a git</Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Başlık HomeworkBuilder içinde: aktif kitaba göre değiştiği için
          server component'te sabitlenemez. */}
      <HomeworkBuilder
        studentId={studentId}
        termId={activeTerm.id}
        workspaceId={workspaceId}
        studentName={student.full_name}
        books={books}
        initialBookId={initialBookId}
        initialSelectedTestIds={draftTestIds}
        activeFlow={activeFlow}
        // Taslak, akışın varsayılanını EZER: öğretmen o taslakta tarihi
        // bilinçle değiştirmiş olabilir ve kaydedilmiş bir tercihi
        // sessizce geri almak, yaptığı işi silmek olurdu.
        initialDueDate={initialDueDate}
        initialDueTime={initialDueTime}
        fallbackDue={fallbackDue}
        staleFlow={staleFlow}
        pendingBooks={pendingBooks}
        poolBooks={poolBooks}
        scopes={scopeRows.map(sc => ({ id: sc.id, name: sc.name, subject: sc.subject, levelExam: sc.levelExam }))}
        initialTitle={draft?.title ?? ''}
        initialNote={draft?.note ?? ''}
        keepActiveTopicIds={[...keepActiveTopicIds]}
        draftTasks={draftTasks}
        courses={courses}
        openWorkItems={openWork.items}
        openTasks={openTasks}
        plans={plans}
        openWorkFlows={openWork.flows}
      />
    </div>
  )
}
