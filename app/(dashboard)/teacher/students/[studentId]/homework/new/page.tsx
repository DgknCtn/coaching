import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { loadBookMap } from '@/lib/book-map'
import { loadKeepActiveTopicIds } from '@/lib/topic-overrides'
import { localDateString } from '@/lib/homework-status'
import { Button } from '@/components/ui/button'
import { HomeworkBuilder } from './homework-builder'

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
  const [books, keepActiveTopicIds, { data: draft }] = await Promise.all([
    loadBookMap(supabase, { workspaceId, studentId }),
    // Bölüm satırı menüsündeki "Aktif Tut" toggle'ının yönü (041 §6.5).
    loadKeepActiveTopicIds(supabase, { workspaceId, studentId }),
    // Kaydedilmiş taslak (019): kitap değişiminde ve sayfa yenilemesinde
    // seçimlerin korunmasını sağlar.
    supabase
      .from('weekly_plan_drafts')
      .select('id, due_date, title, note')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .eq('teacher_profile_id', profile.id)
      .maybeSingle(),
  ])

  // AKTİF HAFTALIK AKIŞ (R7/05 kabul #4).
  //
  // Ekranın varsayılan son teslimi buradan gelir: "Öğretmene aynı tarihi
  // tekrar seçtirmek gerekmez." Akış yoksa alan boş kalır ve öğretmen
  // eskisi gibi elle girer — aktif akışı olmayan öğrenciye ödev
  // verilememesi saçma olurdu.
  const { data: activeFlowRow } = await supabase
    .from('weekly_flows')
    .select('id, due_at, due_source')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()

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

  let draftTestIds: string[] = []
  if (draft?.id) {
    const { data: draftItems } = await supabase
      .from('weekly_plan_draft_items')
      .select('book_test_id')
      .eq('draft_id', draft.id)
    draftTestIds = (draftItems ?? []).map(i => i.book_test_id)
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
        initialDueDate={draft?.due_date ?? activeFlow?.dueDate ?? ''}
        initialTitle={draft?.title ?? ''}
        initialNote={draft?.note ?? ''}
        keepActiveTopicIds={[...keepActiveTopicIds]}
      />
    </div>
  )
}
