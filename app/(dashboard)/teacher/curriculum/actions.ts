'use server'

// Müfredat şablonları (R5.2 §4.2).
//
// Şablon SCOPE BAŞINADIR ve MUTLAK TARİH TAŞIMAZ; yalnız sıra ve süre
// tutar. Somut tarihler öğrenciye atama anında hesaplanır — böylece aynı
// şablon farklı tarihlerde iki öğrenciye atanabilir (MA-01).
//
// Konular ayrı bir ekrandan yönetilmez: şablon satırına ad yazılır, o
// scope'ta aynı ad varsa mevcut topic yeniden kullanılır. Dedup'ı
// upsert_topic ve unique indeks garanti eder.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

const templateItemSchema = z.object({
  name: z.string().trim().min(1, 'Konu adı boş olamaz.').max(160),
  duration_weeks: z.number().int().min(1, 'Süre en az 1 hafta.').max(104),
  note: z.string().trim().max(1000).nullable().optional(),
})

export type TemplateItemInput = z.infer<typeof templateItemSchema>

export async function createTemplateAction(scopeId: string, name: string) {
  const parsed = z
    .object({
      scopeId: uuidSchema,
      name: z.string().trim().min(2, 'Şablon adı en az 2 karakter olmalı.').max(160),
    })
    .safeParse({ scopeId, name })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId, profile } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('curriculum_templates')
    .insert({
      workspace_id: workspaceId,
      scope_id: parsed.data.scopeId,
      name: parsed.data.name,
      created_by_profile_id: profile.id,
    })
    .select('id')
    .single()

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/curriculum')
  return { success: true, templateId: data.id as string }
}

/** Gönderilen liste şablonun TAMAMIDIR (replace semantiği). */
export async function setTemplateItemsAction(templateId: string, items: TemplateItemInput[]) {
  const parsed = z
    .object({
      templateId: uuidSchema,
      items: z.array(templateItemSchema).max(200),
    })
    .safeParse({ templateId, items })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_curriculum_template_items', {
    p_template_id: parsed.data.templateId,
    p_items: parsed.data.items,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/curriculum')
  return { success: true }
}

export async function deleteTemplateAction(templateId: string) {
  const parsed = uuidSchema.safeParse(templateId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  // Şablonu silmek öğrencilerin akışını BOZMAZ: student_curriculum_items
  // bağımsız kayıtlardır ve source_template_item_id ON DELETE SET NULL'dur.
  const { error } = await supabase
    .from('curriculum_templates')
    .delete()
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/curriculum')
  return { success: true }
}
