'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { bookSchema, uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

export interface SectionInput {
  title: string
  test_count: number
  /** R4 §3: bölümün niteliğini anlatan kısa insan notu. */
  note?: string
  video_url?: string
  /** Sayfa takipli kitapta bölüm fiziksel kapsamıyla tanımlanır (R4 §2A);
   *  RPC aralıktaki her sayfa için bir birim satırı açar. */
  page_start?: number | null
  page_end?: number | null
}

export interface NewBookInput {
  title: string
  subject: string
  publisher?: string
  levelExam?: string
  curriculumProgram?: string
  editionYear?: number | null
  description?: string
  trackingMode?: string
  videoMode?: string
  videoUrl?: string
  /** Opsiyonel: kitap havuzu R4'te dönemden bağımsız (021). */
  termId?: string
  sections: SectionInput[]
}

export async function createBookAction(input: NewBookInput) {
  const parsed = bookSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_book_with_sections_and_tests', {
    p_workspace_id: workspaceId,
    p_academic_term_id: parsed.data.termId || null,
    p_title: parsed.data.title,
    p_subject: parsed.data.subject,
    p_publisher: parsed.data.publisher || null,
    p_level_exam: parsed.data.levelExam || null,
    p_edition_year: parsed.data.editionYear ?? null,
    p_description: parsed.data.description || null,
    p_sections: parsed.data.sections,
    p_tracking_mode: parsed.data.trackingMode,
    p_video_mode: parsed.data.videoMode,
    p_video_url: parsed.data.videoUrl || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  // R6-14: öğretim programı ayrı bir çağrıyla yazılır. create RPC'si
  // bölüm/test üretimini de yapan uzun bir fonksiyon; ona alan eklemek
  // için gövdesini çoğaltmak yerine tek işli yardımcı kullanılır.
  const newBookId = (data as { book_id?: string } | null)?.book_id
  if (newBookId && parsed.data.curriculumProgram) {
    await supabase.rpc('set_book_curriculum_program', {
      p_book_id: newBookId,
      p_curriculum_program: parsed.data.curriculumProgram,
    })
  }

  revalidatePath('/teacher/books')
  return { success: true, data }
}

export async function archiveBookAction(bookId: string) {
  const parsed = uuidSchema.safeParse(bookId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('books')
    .update({ status: 'archived' })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/teacher/books')
  redirect('/teacher/books')
}
