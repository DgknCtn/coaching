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
    .select('id, full_name')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student) notFound()

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

  // AKTİF HAFTALIK AKIŞ (R7/05 kabul #4).
  //
  // Ekranın varsayılan son teslimi buradan gelir: "Öğretmene aynı tarihi
  // tekrar seçtirmek gerekmez." Akış yoksa alan boş kalır ve öğretmen
  // eskisi gibi elle girer — aktif akışı olmayan öğrenciye ödev
  // verilememesi saçma olurdu.
  const activeFlowRes = await supabase
    .from('weekly_flows')
    .select('id, due_at, due_source')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()
  // Akış okunamazsa "akış yok" sanılıp ödev akışsız yayınlanırdı (B06).
  const activeFlowRow = orThrow(singleResult(activeFlowRes, 'homework_new.active_flow'))

  const activeFlow = activeFlowRow
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

  // AKIŞ YOKSA ANA TEMAS (M1.0-01 §2.1): Koçluk > Birebir > Grup önceliği
  // deriveMainContact'ta zaten var. Sonraki oturumu varsayılan son teslim
  // olur; hiçbir hizmet yoksa öğretmen tarih + saati elle seçer.
  let fallbackDue: { dueAt: string; source: string } | null = null
  if (!activeFlow) {
    const servicesRes = await supabase
      .from('student_services')
      .select(
        'id, kind, participation, medium, weekday, start_time, start_date, status, submission_offset_minutes'
      )
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
    const serviceRows = orThrow(listResult(servicesRes, 'homework_new.services'))
    const services = serviceRows.map(s => ({
      id: s.id,
      kind: s.kind,
      participation: s.participation,
      medium: s.medium,
      weekday: s.weekday,
      startTime: String(s.start_time).slice(0, 5),
      startDate: s.start_date,
      status: s.status,
      submissionOffsetMinutes: s.submission_offset_minutes ?? 0,
    })) as ServiceLike[]
    const anchor = deriveMainContact(services)
    const at = anchor ? defaultSubmissionDeadline(anchor, new Date()) : null
    if (anchor && at) {
      fallbackDue = {
        dueAt: at.toISOString(),
        source: CONTACT_KIND_LABEL[contactKindOf(anchor)],
      }
    }
  }

  // Varsayılan son teslim: taslak > aktif akış > ana temas > boş.
  const defaultDueAt = activeFlow?.dueAt ?? fallbackDue?.dueAt ?? null
  const draftDueAt = (draft?.due_at as string | null | undefined) ?? null
  const initialDueDate =
    (draftDueAt ? localDateString(new Date(draftDueAt)) : draft?.due_date) ??
    (defaultDueAt ? localDateString(new Date(defaultDueAt)) : '')
  const initialDueTime = draftDueAt
    ? localClock(new Date(draftDueAt))
    : defaultDueAt
      ? localClock(new Date(defaultDueAt))
      : '18:00'

  let draftTestIds: string[] = []
  if (draft?.id) {
    const draftItemsRes = await supabase
      .from('weekly_plan_draft_items')
      .select('book_test_id')
      .eq('draft_id', draft.id)
    const draftItems = orThrow(listResult(draftItemsRes, 'homework_new.draft_items'))
    draftTestIds = draftItems.map(i => i.book_test_id)
  }

  if (books.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-4 flex items-center gap-2">
          <Link href={`/teacher/students/${studentId}`}>
            <Button variant="ghost" size="icon-sm"><ArrowLeft className="size-4" /></Button>
          </Link>
          <h1 className="text-xl font-semibold">Ödev Planlama</h1>
        </div>
        <div className="py-12 text-center text-muted-foreground">
          <p>Bu öğrenciye atanmış kitap yok.</p>
          <Link href={`/teacher/students/${studentId}`} className="mt-3 inline-block">
            <Button variant="outline" size="sm">Kitap Ata</Button>
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
        initialTitle={draft?.title ?? ''}
        initialNote={draft?.note ?? ''}
        keepActiveTopicIds={[...keepActiveTopicIds]}
      />
    </div>
  )
}
