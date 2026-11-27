import type { SupabaseClient } from '@supabase/supabase-js'
import type { MistakeReason } from './reasons'
import type { ExamTag } from './net'

// HATA DEFTERİ — okuma (migration 161). Tablolar yoksa (migration
// uygulanmadan) `null` döner: çağıran ekran bölümü hiç çizmez, mevcut
// sayfa bozulmaz (etiket/şablon deseni).

export const PHOTO_BUCKET = 'mistake-photos'
const SIGNED_URL_SECONDS = 600

export interface MistakeRow {
  id: string
  exam_tag: ExamTag
  scope_id: string | null
  subject_text: string | null
  topic_id: string | null
  topic_text: string | null
  book_id: string | null
  book_test_id: string | null
  source_text: string | null
  page_ref: string | null
  reason: MistakeReason
  student_answer: string | null
  correct_answer: string | null
  solution_note: string | null
  teacher_note: string | null
  question_photo_path: string | null
  solution_photo_path: string | null
  status: 'review' | 'learned' | 'archived'
  box: number
  next_review_on: string | null
  review_count: number
  created_by_role: 'student' | 'teacher'
  created_at: string
}

/** Ekrana hazır hata: ders/konu/kaynak adları çözülmüş, fotoğraf adresleri imzalı. */
export interface MistakeView extends MistakeRow {
  subject: string
  topic: string | null
  source: string | null
  questionPhotoUrl: string | null
  solutionPhotoUrl: string | null
}

export interface QuestionLogRow {
  id: string
  log_date: string
  exam_tag: ExamTag
  scope_id: string | null
  subject_text: string | null
  topic_text: string | null
  source_text: string | null
  correct: number
  wrong: number
  blank: number
  penalty_divisor: number
  created_at: string
}

export interface QuestionLogView extends QuestionLogRow {
  subject: string
}

export interface StudyTargets {
  dailyQuestions: number
  dailyReviews: number
}

export const DEFAULT_TARGETS: StudyTargets = { dailyQuestions: 100, dailyReviews: 20 }

export interface MistakeData {
  mistakes: MistakeView[]
  reviews: { reviewedAt: string; result: 'knew' | 'missed' }[]
  logs: QuestionLogView[]
  targets: StudyTargets
}

const MISTAKE_COLUMNS =
  'id, exam_tag, scope_id, subject_text, topic_id, topic_text, book_id, book_test_id, source_text, page_ref, reason, student_answer, correct_answer, solution_note, teacher_note, question_photo_path, solution_photo_path, status, box, next_review_on, review_count, created_by_role, created_at'

/** Yol listesinden imzalı adres haritası (okunamayan yol atlanır). */
export async function signPhotos(supabase: SupabaseClient, paths: (string | null)[]): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))]
  const out = new Map<string, string>()
  if (list.length === 0) return out
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(list, SIGNED_URL_SECONDS)
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) out.set(row.path, row.signedUrl)
  return out
}

export async function loadMistakeData(
  supabase: SupabaseClient,
  { workspaceId, studentId, days = 60, withPhotos = true }: { workspaceId: string; studentId: string; days?: number; withPhotos?: boolean }
): Promise<MistakeData | null> {
  const since = new Date(Date.now() - days * 86_400_000)
  const [mistakesRes, reviewsRes, logsRes, targetsRes] = await Promise.all([
    supabase
      .from('mistakes')
      .select(MISTAKE_COLUMNS)
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1000),
    supabase
      .from('mistake_reviews')
      .select('reviewed_at, result')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('reviewed_at', since.toISOString())
      .limit(5000),
    supabase
      .from('question_logs')
      .select('id, log_date, exam_tag, scope_id, subject_text, topic_text, source_text, correct, wrong, blank, penalty_divisor, created_at')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .gte('log_date', since.toISOString().slice(0, 10))
      .order('log_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3000),
    supabase.from('study_targets').select('daily_questions, daily_reviews').eq('student_id', studentId).maybeSingle(),
  ])
  if (mistakesRes.error || reviewsRes.error || logsRes.error) return null

  const mistakes = (mistakesRes.data ?? []) as MistakeRow[]
  const logs = (logsRes.data ?? []) as QuestionLogRow[]

  const scopeIds = [...new Set([...mistakes.map(m => m.scope_id), ...logs.map(l => l.scope_id)].filter((x): x is string => !!x))]
  const topicIds = [...new Set(mistakes.map(m => m.topic_id).filter((x): x is string => !!x))]
  const bookIds = [...new Set(mistakes.map(m => m.book_id).filter((x): x is string => !!x))]
  const [scopes, topics, books, photos] = await Promise.all([
    scopeIds.length ? supabase.from('academic_scopes').select('id, name').in('id', scopeIds) : Promise.resolve({ data: [] }),
    topicIds.length ? supabase.from('topics').select('id, name').in('id', topicIds) : Promise.resolve({ data: [] }),
    bookIds.length ? supabase.from('books').select('id, title').in('id', bookIds) : Promise.resolve({ data: [] }),
    withPhotos
      ? signPhotos(supabase, mistakes.flatMap(m => [m.question_photo_path, m.solution_photo_path]))
      : Promise.resolve(new Map<string, string>()),
  ])
  const scopeName = new Map(((scopes.data ?? []) as { id: string; name: string }[]).map(s => [s.id, s.name]))
  const topicName = new Map(((topics.data ?? []) as { id: string; name: string }[]).map(t => [t.id, t.name]))
  const bookName = new Map(((books.data ?? []) as { id: string; title: string }[]).map(b => [b.id, b.title]))

  const subjectOf = (scopeId: string | null, text: string | null) =>
    (scopeId && scopeName.get(scopeId)) || text?.trim() || 'Diğer'

  const t = (targetsRes.data ?? null) as { daily_questions: number; daily_reviews: number } | null
  return {
    mistakes: mistakes.map(m => ({
      ...m,
      subject: subjectOf(m.scope_id, m.subject_text),
      topic: (m.topic_id && topicName.get(m.topic_id)) || m.topic_text?.trim() || null,
      source: (m.book_id && bookName.get(m.book_id)) || m.source_text?.trim() || null,
      questionPhotoUrl: m.question_photo_path ? photos.get(m.question_photo_path) ?? null : null,
      solutionPhotoUrl: m.solution_photo_path ? photos.get(m.solution_photo_path) ?? null : null,
    })),
    reviews: ((reviewsRes.data ?? []) as { reviewed_at: string; result: 'knew' | 'missed' }[]).map(r => ({
      reviewedAt: r.reviewed_at,
      result: r.result,
    })),
    logs: logs.map(l => ({ ...l, subject: subjectOf(l.scope_id, l.subject_text) })),
    targets: t ? { dailyQuestions: t.daily_questions, dailyReviews: t.daily_reviews } : DEFAULT_TARGETS,
  }
}

/** Formun seçenekleri: öğrencinin aktif dersleri, konuları ve kitapları. */
export interface MistakeFormOptions {
  subjects: { id: string; name: string; topics: { id: string; name: string }[] }[]
  books: { id: string; title: string; tests: { id: string; title: string }[] }[]
}

export async function loadMistakeFormOptions(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<MistakeFormOptions> {
  const [{ data: courses }, { data: assignments }] = await Promise.all([
    supabase.from('student_courses').select('scope_id').eq('student_id', studentId).eq('active', true),
    supabase
      .from('student_book_assignments')
      .select('book_id')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .in('status', ['active', 'pending']),
  ])
  const scopeIds = [...new Set(((courses ?? []) as { scope_id: string }[]).map(c => c.scope_id))]
  const bookIds = [...new Set(((assignments ?? []) as { book_id: string }[]).map(a => a.book_id))]
  const [{ data: scopes }, { data: topics }, { data: books }, { data: tests }] = await Promise.all([
    scopeIds.length
      ? supabase.from('academic_scopes').select('id, name, sort_order').in('id', scopeIds).order('sort_order')
      : Promise.resolve({ data: [] }),
    scopeIds.length
      ? supabase.from('topics').select('id, name, scope_id, sort_order').in('scope_id', scopeIds).eq('active', true).order('sort_order').limit(2000)
      : Promise.resolve({ data: [] }),
    bookIds.length ? supabase.from('books').select('id, title').in('id', bookIds).order('title') : Promise.resolve({ data: [] }),
    bookIds.length
      ? supabase.from('book_tests').select('id, title, book_id, order_index').in('book_id', bookIds).order('order_index').limit(3000)
      : Promise.resolve({ data: [] }),
  ])
  const topicRows = (topics ?? []) as { id: string; name: string; scope_id: string }[]
  const testRows = (tests ?? []) as { id: string; title: string; book_id: string }[]
  return {
    subjects: ((scopes ?? []) as { id: string; name: string }[]).map(s => ({
      id: s.id,
      name: s.name,
      topics: topicRows.filter(t => t.scope_id === s.id).map(t => ({ id: t.id, name: t.name })),
    })),
    books: ((books ?? []) as { id: string; title: string }[]).map(b => ({
      id: b.id,
      title: b.title,
      tests: testRows.filter(t => t.book_id === b.id).map(t => ({ id: t.id, title: t.title })),
    })),
  }
}
