'use server'

// Müfredat Akışı yazma yolları (R5.2).
//
// Zincirleme kaydırma mantığı burada DEĞİL, lib/curriculum-flow.ts'te.
// Ekran akışı orada hesaplar, sonucu bütün olarak buraya gönderir; burası
// yalnız doğrular ve RPC'ye devreder. Böylece kural tek yerde durur ve
// test edilebilir kalır.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz tarih.')

const flowItemSchema = z.object({
  id: uuidSchema.nullable(),
  name: z.string().trim().min(1, 'Konu adı boş olamaz.').max(160),
  start_date: isoDate,
  end_date: isoDate,
  passed: z.boolean(),
  note: z.string().trim().max(1000).nullable(),
})

const saveSchema = z.object({
  studentId: uuidSchema,
  scopeId: uuidSchema,
  // Bir dersin akışı makul bir üst sınırla korunur; 200 konu zaten
  // "ana konu düzeyinde kal" ilkesinin çok ötesi.
  items: z.array(flowItemSchema).max(200),
})

export type FlowItemInput = z.infer<typeof flowItemSchema>

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/curriculum`)
  revalidatePath(`/teacher/students/${studentId}`)
}

/** "Akışı Kaydet" — listenin tamamı gönderilir (replace semantiği). */
export async function saveCurriculumFlowAction(
  studentId: string,
  scopeId: string,
  items: FlowItemInput[]
) {
  const parsed = saveSchema.safeParse({ studentId, scopeId, items })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('save_student_curriculum_flow', {
    p_student_id: parsed.data.studentId,
    p_scope_id: parsed.data.scopeId,
    p_items: parsed.data.items,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true }
}

/**
 * Şablondan akış kurar (snapshot).
 *
 * `replace` yalnız GEÇİLMEMİŞ satırları tazeler; Geçildi işaretli konular
 * korunur — geçmiş silinmez (§4.4).
 */
export async function assignCurriculumTemplateAction(
  studentId: string,
  templateId: string,
  startDate: string,
  replace = false
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      templateId: uuidSchema,
      startDate: isoDate,
    })
    .safeParse({ studentId, templateId, startDate })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('assign_curriculum_template', {
    p_student_id: parsed.data.studentId,
    p_template_id: parsed.data.templateId,
    p_start_date: parsed.data.startDate,
    p_replace: replace,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true }
}

/**
 * Geçildi işareti. Planlanan bitiş tarihinin geçmesi bunu ASLA yapmaz;
 * yalnız eğitmen işaretler (§4.4, MA-08).
 */
export async function setCurriculumItemPassedAction(
  studentId: string,
  itemId: string,
  passed: boolean
) {
  const parsed = uuidSchema.safeParse(itemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_curriculum_item_passed', {
    p_item_id: parsed.data,
    p_passed: passed,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true }
}

/** Yeni ders/kapsam. Ada göre idempotent; aynı ad ikinci kez açılmaz. */
export async function createScopeAction(name: string, subject?: string, levelExam?: string) {
  const parsed = z
    .object({
      name: z.string().trim().min(2, 'Kapsam adı en az 2 karakter olmalı.').max(120),
      subject: z.string().trim().max(80).optional().or(z.literal('')),
      levelExam: z.string().trim().max(80).optional().or(z.literal('')),
    })
    .safeParse({ name, subject, levelExam })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('upsert_academic_scope', {
    p_workspace_id: workspaceId,
    p_name: parsed.data.name,
    p_subject: parsed.data.subject || null,
    p_level_exam: parsed.data.levelExam || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/curriculum')
  return { success: true, scopeId: (data as { scope_id?: string } | null)?.scope_id }
}
