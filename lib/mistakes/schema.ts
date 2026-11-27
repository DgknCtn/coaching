import { z } from 'zod'
import { uuidSchema } from '@/lib/validation'
import { ANSWERS, MISTAKE_REASONS } from './reasons'
import { EXAM_TAGS, penaltyDivisor } from './net'

// HATA DEFTERİ — giriş doğrulaması (öğrenci ve öğretmen eylemleri ORTAK).
// Sınırlar migration 161'in CHECK'leriyle aynı.

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `En fazla ${max} karakter.`)
    .optional()
    .nullable()
    .transform(v => (v ? v : null))

const optUuid = uuidSchema.optional().nullable().transform(v => v ?? null)

export const mistakeInputSchema = z
  .object({
    examTag: z.enum(EXAM_TAGS as [string, ...string[]]),
    scopeId: optUuid,
    subjectText: optText(80),
    topicId: optUuid,
    topicText: optText(120),
    bookId: optUuid,
    bookTestId: optUuid,
    sourceText: optText(160),
    pageRef: optText(40),
    reason: z.enum(MISTAKE_REASONS),
    studentAnswer: z.enum(ANSWERS).optional().nullable().transform(v => v ?? null),
    correctAnswer: z.enum(['A', 'B', 'C', 'D', 'E']).optional().nullable().transform(v => v ?? null),
    solutionNote: optText(1000),
    questionPhotoPath: optText(300),
    solutionPhotoPath: optText(300),
  })
  .refine(v => v.scopeId || v.subjectText, { message: 'Ders seçin.', path: ['scopeId'] })

export type MistakeInput = z.input<typeof mistakeInputSchema>

export const questionLogSchema = z
  .object({
    logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    examTag: z.enum(EXAM_TAGS as [string, ...string[]]),
    scopeId: optUuid,
    subjectText: optText(80),
    topicText: optText(120),
    sourceText: optText(160),
    correct: z.number().int().min(0).max(1000),
    wrong: z.number().int().min(0).max(1000),
    blank: z.number().int().min(0).max(1000),
  })
  .refine(v => v.correct + v.wrong + v.blank > 0, { message: 'En az bir soru girin.' })
  .refine(v => v.scopeId || v.subjectText, { message: 'Ders seçin.' })

export type QuestionLogInput = z.input<typeof questionLogSchema>

export const targetsSchema = z.object({
  dailyQuestions: z.number().int().min(0).max(2000),
  dailyReviews: z.number().int().min(0).max(500),
})

/**
 * Fotoğraf yolu yalnız bu öğrencinin klasöründe olabilir. Depolama
 * kuralı da aynısını uygular; burada başka öğrencinin dosyasını kayda
 * bağlamak (okunamasa bile) baştan engellenir.
 */
export function photoPathAllowed(path: string | null, workspaceId: string, studentId: string): boolean {
  if (!path) return true
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(webp|jpg)$/i.test(path) && path.startsWith(`${workspaceId}/${studentId}/`)
}

/** Doğrulanmış girdiyi tablo satırına çevirir. */
export function mistakeRow(v: z.output<typeof mistakeInputSchema>) {
  return {
    exam_tag: v.examTag,
    scope_id: v.scopeId,
    subject_text: v.scopeId ? null : v.subjectText,
    topic_id: v.topicId,
    topic_text: v.topicId ? null : v.topicText,
    book_id: v.bookId,
    book_test_id: v.bookId ? v.bookTestId : null,
    source_text: v.bookId ? null : v.sourceText,
    page_ref: v.pageRef,
    reason: v.reason,
    student_answer: v.studentAnswer,
    correct_answer: v.correctAnswer,
    solution_note: v.solutionNote,
    question_photo_path: v.questionPhotoPath,
    solution_photo_path: v.solutionPhotoPath,
  }
}

export function questionLogRow(v: z.output<typeof questionLogSchema>) {
  return {
    log_date: v.logDate,
    exam_tag: v.examTag,
    scope_id: v.scopeId,
    subject_text: v.scopeId ? null : v.subjectText,
    topic_text: v.topicText,
    source_text: v.sourceText,
    correct: v.correct,
    wrong: v.wrong,
    blank: v.blank,
    penalty_divisor: penaltyDivisor(v.examTag as (typeof EXAM_TAGS)[number]),
  }
}
