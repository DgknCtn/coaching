'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr } from '@/lib/auth-errors'
import { firstIssue, uuidSchema } from '@/lib/validation'
import { statusFromOperationRow, type OperationStatusRow } from '@/lib/operation-status'

// MÜDAHALE KAYDI (B16 · 118).
//
// Açılıştaki durum ve gerekçeler İSTEMCİDEN ALINMAZ: sunucu, panelin
// kullandığı satırdan aynı fonksiyonla hesaplar. Kayıt "neden başladık"ın
// anlık görüntüsüdür; istemcinin yazdığı bir metin olsaydı panelle
// çelişebilirdi.

const noteSchema = z.string().trim().max(2000, 'Not en fazla 2000 karakter olabilir.').optional()

function paths(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher')
}

export async function openInterventionAction(studentId: string, note?: string, sessionId?: string) {
  const sid = uuidSchema.safeParse(studentId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  const n = noteSchema.safeParse(note || undefined)
  if (!n.success) return { error: firstIssue(n.error) }
  const sess = sessionId ? uuidSchema.safeParse(sessionId) : null
  if (sess && !sess.success) return { error: firstIssue(sess.error) }

  const { supabase, workspaceId, profile } = await getTeacherContext()

  const { data: row, error: rowError } = await supabase
    .from('teacher_student_operation_view')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('student_id', sid.data)
    .maybeSingle()
  if (rowError) return { error: dbErrorToTr(rowError.message) }
  if (!row) return { error: 'Öğrenci bulunamadı.' }

  const computed = statusFromOperationRow(row as OperationStatusRow, new Date())

  const { error } = await supabase.from('interventions').insert({
    workspace_id: workspaceId,
    student_id: sid.data,
    opened_status: computed.status,
    opened_signals: computed.signals,
    note: n.data || null,
    session_id: sess?.success ? sess.data : null,
    opened_by_profile_id: profile.id,
  })
  if (error) {
    // Tekillik: öğrenci başına tek açık müdahale (118).
    if (error.code === '23505') return { error: 'Bu öğrenci için zaten açık bir müdahale var.' }
    return { error: dbErrorToTr(error.message) }
  }
  paths(sid.data)
  return { success: true }
}

export async function updateInterventionAction(
  interventionId: string,
  studentId: string,
  note: string,
  sessionId: string | null
) {
  const id = uuidSchema.safeParse(interventionId)
  const sid = uuidSchema.safeParse(studentId)
  if (!id.success) return { error: firstIssue(id.error) }
  if (!sid.success) return { error: firstIssue(sid.error) }
  const n = noteSchema.safeParse(note || undefined)
  if (!n.success) return { error: firstIssue(n.error) }
  const sess = sessionId ? uuidSchema.safeParse(sessionId) : null
  if (sess && !sess.success) return { error: firstIssue(sess.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase
    .from('interventions')
    .update({ note: n.data || null, session_id: sess?.success ? sess.data : null })
    .eq('id', id.data)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
  if (error) return { error: dbErrorToTr(error.message) }
  paths(sid.data)
  return { success: true }
}

const outcomeSchema = z.enum(['duzeldi', 'degismedi', 'diger'])

export async function closeInterventionAction(
  interventionId: string,
  studentId: string,
  outcome: string,
  closeNote?: string
) {
  const id = uuidSchema.safeParse(interventionId)
  const sid = uuidSchema.safeParse(studentId)
  if (!id.success) return { error: firstIssue(id.error) }
  if (!sid.success) return { error: firstIssue(sid.error) }
  const o = outcomeSchema.safeParse(outcome)
  if (!o.success) return { error: 'Bir sonuç seçin.' }
  const n = noteSchema.safeParse(closeNote || undefined)
  if (!n.success) return { error: firstIssue(n.error) }

  const { supabase, workspaceId, profile } = await getTeacherContext()
  const { error } = await supabase
    .from('interventions')
    .update({
      status: 'closed',
      outcome: o.data,
      close_note: n.data || null,
      closed_at: new Date().toISOString(),
      closed_by_profile_id: profile.id,
    })
    .eq('id', id.data)
    .eq('workspace_id', workspaceId)
    .eq('status', 'open')
  if (error) return { error: dbErrorToTr(error.message) }
  paths(sid.data)
  return { success: true }
}
