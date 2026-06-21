'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'

export interface SectionInput {
  title: string
  test_count: number
}

export async function createBookAction(
  title: string,
  subject: string,
  publisher: string | undefined,
  examType: string | undefined,
  description: string | undefined,
  termId: string,
  sections: SectionInput[]
) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_book_with_sections_and_tests', {
    p_workspace_id: workspaceId,
    p_academic_term_id: termId,
    p_title: title,
    p_subject: subject,
    p_publisher: publisher || null,
    p_exam_type: examType || null,
    p_description: description || null,
    p_sections: sections,
  })

  if (error) return { error: error.message }
  revalidatePath('/teacher/books')
  return { success: true, data }
}

export async function archiveBookAction(bookId: string) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('books')
    .update({ status: 'archived' })
    .eq('id', bookId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: error.message }
  revalidatePath('/teacher/books')
  redirect('/teacher/books')
}
