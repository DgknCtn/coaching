'use server'

// Koruma Havuzu yazma yolları (R5.4).
//
// Havuzun ANA verisi olan onaylı test/sayfa temasları BURADAN YAZILMAZ —
// onlar test_completions'tan türetilir. Bu dosya yalnız sistemde başka
// karşılığı olmayan iki olayı kaydeder: gerçekleşmiş ders ve eğitmenin
// doğruladığı öğrenci kendi çalışması.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { todayDateString } from '@/lib/homework-status'

const contactSchema = z.object({
  studentId: uuidSchema,
  topicId: uuidSchema,
  kind: z.enum(['lesson', 'self_study'], { message: 'Geçersiz temas türü.' }),
  activityDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir tarih seçin.')
    .optional()
    .or(z.literal('')),
  amountNote: z.string().trim().max(120).optional().or(z.literal('')),
  note: z.string().trim().max(1000).optional().or(z.literal('')),
})

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/protection`)
  revalidatePath(`/teacher/students/${studentId}`)
}

/**
 * Ders veya serbest çalışma temasını kaydeder.
 *
 * activityDate GERÇEKLEŞME günüdür — kaydın girildiği gün değil. Geçmişe
 * yazılabilir (asıl amaç bu), geleceğe yazılamaz. PLANLANMIŞ ama
 * yapılmamış ders buraya YAZILMAZ (KH-09); bu tablo yalnız gerçekleşmiş
 * olayları taşır.
 */
export async function addTopicContactAction(
  studentId: string,
  topicId: string,
  kind: 'lesson' | 'self_study',
  activityDate?: string,
  amountNote?: string,
  note?: string
) {
  const parsed = contactSchema.safeParse({
    studentId,
    topicId,
    kind,
    activityDate,
    amountNote,
    note,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  if (parsed.data.activityDate && parsed.data.activityDate > todayDateString()) {
    return { error: 'Çalışma tarihi gelecekte olamaz.' }
  }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('add_topic_contact', {
    p_student_id: parsed.data.studentId,
    p_topic_id: parsed.data.topicId,
    p_kind: parsed.data.kind,
    p_activity_date: parsed.data.activityDate || null,
    p_amount_note: parsed.data.amountNote || null,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true }
}

/**
 * "Aktif Tut" override (§6.5).
 *
 * İstisnaidir: normal akışta konu, açık çalışması olduğu sürece zaten
 * havuzda görünmez. Bu bayrak açık çalışma olmadan da konuyu aktif
 * saymak içindir.
 */
export async function setTopicKeepActiveAction(
  studentId: string,
  topicId: string,
  keepActive: boolean
) {
  const parsed = z
    .object({ studentId: uuidSchema, topicId: uuidSchema })
    .safeParse({ studentId, topicId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_topic_keep_active', {
    p_student_id: parsed.data.studentId,
    p_topic_id: parsed.data.topicId,
    p_keep: keepActive,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true }
}
