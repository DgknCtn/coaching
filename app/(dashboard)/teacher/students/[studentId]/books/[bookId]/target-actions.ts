'use server'

// Hedef kapsamı (R4 §5).
//
// Plan matematiği değişmiyor; değişen tek şey planın kapsamı. Tek aktif
// hedef kuralı ve tarih doğrulaması 022'deki set_student_book_target
// RPC'sinde, yani tek yerde duruyor.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

const targetSchema = z
  .object({
    assignmentId: uuidSchema,
    startDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir başlangıç tarihi seçin.').optional().or(z.literal('')),
    targetDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir hedef tarihi seçin.').optional().or(z.literal('')),
    scopeType: z.enum(['whole_book', 'sections', 'units'], { message: 'Geçersiz hedef kapsamı.' }),
    // R6-04: resource = Kaynak Hedefi (ana tempo bundan gelir),
    // interim = Ara Hedef (ana hedefi asla değiştirmez).
    kind: z.enum(['resource', 'interim']).default('resource'),
    sectionIds: z.array(uuidSchema).max(200).default([]),
    unitIds: z.array(uuidSchema).max(2000).default([]),
  })
  .refine((v) => v.scopeType !== 'sections' || v.sectionIds.length > 0, {
    message: 'En az bir bölüm seçin.',
    path: ['sectionIds'],
  })
  .refine((v) => v.scopeType !== 'units' || v.unitIds.length > 0, {
    message: 'En az bir test veya sayfa seçin.',
    path: ['unitIds'],
  })

export interface TargetInput {
  assignmentId: string
  startDate?: string
  targetDate?: string
  scopeType: 'whole_book' | 'sections' | 'units'
  sectionIds?: string[]
  unitIds?: string[]
  kind?: 'resource' | 'interim'
}

export async function setStudentBookTargetAction(studentId: string, bookId: string, input: TargetInput) {
  const parsed = targetSchema.safeParse({
    ...input,
    sectionIds: input.sectionIds ?? [],
    unitIds: input.unitIds ?? [],
    kind: input.kind ?? 'resource',
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { scopeType, sectionIds, unitIds } = parsed.data
  const scopeData =
    scopeType === 'sections'
      ? { section_ids: sectionIds }
      : scopeType === 'units'
        ? { unit_ids: unitIds }
        : {}

  const { error } = await supabase.rpc('set_student_book_target', {
    p_assignment_id: parsed.data.assignmentId,
    p_start_date: parsed.data.startDate || null,
    p_target_date: parsed.data.targetDate || null,
    p_scope_type: scopeType,
    p_scope_data: scopeData,
    p_kind: parsed.data.kind,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/students/${studentId}/books/${bookId}`)
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

// R4 §6: video gösterim tercihi öğrenci-kitap ilişkisine aittir. 9-10-11
// gibi ara sınıflarda haftalık hatırlatma daha sık kullanılabilir; 12 ve
// mezunda kaynak olarak gösterim yeterli olabilir.
export async function setVideoDisplayAction(
  studentId: string,
  bookId: string,
  assignmentId: string,
  videoDisplay: 'resource' | 'weekly_reminder'
) {
  const parsed = uuidSchema.safeParse(assignmentId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  if (videoDisplay !== 'resource' && videoDisplay !== 'weekly_reminder') {
    return { error: 'Geçersiz video tercihi.' }
  }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_book_assignments')
    .update({ video_display: videoDisplay })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}/books/${bookId}`)
  return { success: true }
}

/**
 * Hedefi kaldırır (R6-04). Ara Hedef geçici bir araçtır; kapatılabilmelidir.
 * Geçmiş hedefler silinmez, yalnız pasife alınır (022'nin kuralı).
 */
export async function clearStudentBookTargetAction(
  studentId: string,
  bookId: string,
  assignmentId: string,
  kind: 'resource' | 'interim' = 'interim'
) {
  const parsed = uuidSchema.safeParse(assignmentId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  if (kind !== 'resource' && kind !== 'interim') return { error: 'Geçersiz hedef türü.' }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('clear_student_book_target', {
    p_assignment_id: assignmentId,
    p_kind: kind,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath(`/teacher/students/${studentId}/books/${bookId}`)
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}
