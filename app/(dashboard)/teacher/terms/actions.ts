'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'

export async function createTermAction(name: string, startDate?: string, endDate?: string) {
  const { workspaceId, profile } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.from('academic_terms').insert({
    workspace_id: workspaceId,
    name,
    start_date: startDate || null,
    end_date: endDate || null,
    status: 'draft',
    created_by_profile_id: profile.id,
  })

  if (error) return { error: error.message }
  revalidatePath('/teacher/terms')
  return { success: true }
}

export async function setTermActiveAction(termId: string) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  // Deactivate other terms
  await supabase
    .from('academic_terms')
    .update({ status: 'completed' })
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')

  const { error } = await supabase
    .from('academic_terms')
    .update({ status: 'active' })
    .eq('id', termId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: error.message }
  revalidatePath('/teacher')
  revalidatePath('/teacher/terms')
  return { success: true }
}

export async function archiveTermAction(termId: string) {
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('academic_terms')
    .update({ status: 'archived' })
    .eq('id', termId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: error.message }
  revalidatePath('/teacher/terms')
  return { success: true }
}
