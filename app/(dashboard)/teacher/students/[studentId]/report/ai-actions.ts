'use server'

import { getTeacherContext } from '@/lib/workspace'
import { firstIssue, uuidSchema } from '@/lib/validation'
import { aiSummariesEnabled, generateText } from '@/lib/ai/gateway'
import {
  buildSummaryPrompt,
  buildWeekFacts,
  personalize,
  type SummaryKind,
  type WeekBookRow,
  type WeekCheckInRow,
  type WeekItemRow,
} from '@/lib/ai/student-week'

// AI HAFTALIK ÖZET / VELİ MESAJI TASLAĞI (canlıya alma, Faz 6).
//
// Sonuç KAYDEDİLMEZ ve kimseye GÖNDERİLMEZ: koç okur, düzenler, isterse
// kopyalayıp kendisi iletir. Modele giden veride ad ve serbest metin yok
// (lib/ai/student-week.ts). Kota: alan başına ayda 100 (146).

type Result = { text: string; remaining: number } | { error: string }

const DAY = 86_400_000

export async function generateStudentSummaryAction(
  studentId: string,
  kind: SummaryKind
): Promise<Result> {
  if (!aiSummariesEnabled()) return { error: 'Yapay zekâ özetleri şu an kapalı.' }
  const sid = uuidSchema.safeParse(studentId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (kind !== 'coach' && kind !== 'parent') return { error: 'Geçersiz özet türü.' }

  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, exam_type, grade_level')
    .eq('id', sid.data)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!student) return { error: 'Öğrenci bulunamadı.' }

  const now = new Date()
  const from = new Date(now.getTime() - 14 * DAY).toISOString().slice(0, 10)
  const to = new Date(now.getTime() + 7 * DAY).toISOString().slice(0, 10)

  const [batchesRes, checkInsRes, booksRes] = await Promise.all([
    supabase
      .from('homework_batches')
      .select('due_date, homework_items(status, submitted_at, approved_at)')
      .eq('student_id', sid.data)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .gte('due_date', from)
      .lte('due_date', to)
      .limit(200),
    supabase
      .from('student_check_ins')
      .select('due_at, submitted_at, mood')
      .eq('student_id', sid.data)
      .eq('workspace_id', workspaceId)
      .gte('due_at', new Date(now.getTime() - 7 * DAY).toISOString())
      .limit(50),
    supabase
      .from('student_book_progress_view')
      .select('book_title, subject, completion_percentage')
      .eq('student_id', sid.data)
      .eq('workspace_id', workspaceId),
  ])
  // Veri eksikse özet YANLIŞ olur (eksik veri "ödev yok" gibi okunur);
  // özet hiç üretilmez.
  if (batchesRes.error || checkInsRes.error || booksRes.error) {
    return { error: 'Öğrencinin verisi okunamadı; özet oluşturulmadı.' }
  }

  const items: WeekItemRow[] = (
    (batchesRes.data ?? []) as { due_date: string; homework_items: Omit<WeekItemRow, 'due_date'>[] }[]
  ).flatMap((b) => (b.homework_items ?? []).map((i) => ({ ...i, due_date: b.due_date })))
  const books: WeekBookRow[] = (
    (booksRes.data ?? []) as { book_title: string; subject: string | null; completion_percentage: number | null }[]
  ).map((b) => ({ title: b.book_title, subject: b.subject, completion_percentage: b.completion_percentage }))

  const facts = buildWeekFacts({
    now,
    exam: (student.exam_type as string | null) ?? null,
    grade: (student.grade_level as string | null) ?? null,
    items,
    checkIns: (checkInsRes.data ?? []) as WeekCheckInRow[],
    books,
  })

  // Kota çağrıdan ÖNCE düşer: başarısız çağrı da sayılır, ama kota
  // aşımında hiç dış istek yapılmaz.
  const { data: remaining, error: quotaError } = await supabase.rpc('consume_ai_quota', {
    p_workspace_id: workspaceId,
    p_kind: kind === 'coach' ? 'coach_summary' : 'parent_draft',
  })
  if (quotaError) return { error: 'Kota kontrol edilemedi; özet oluşturulmadı.' }
  if (remaining === -1) return { error: 'Bu ayki yapay zekâ özeti hakkınız doldu (ayda 100).' }

  const result = await generateText(buildSummaryPrompt(kind, facts))
  if ('error' in result) return result

  return { text: personalize(result.text, student.full_name as string), remaining: Number(remaining) }
}
