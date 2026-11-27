'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

// ÖDEV ŞABLONLARI (PRD 10.3 · Faz 2d, migration 160). Şablon yalnız TASLAK
// görev üretir; yayın öğretmenin "Planı yayımla" işlemiyle olur.

const itemSchema = z.object({
  scopeId: uuidSchema,
  kind: z.enum(['gorev', 'checklist', 'sure']),
  title: z.string().trim().min(1).max(300),
  targetMinutes: z.number().int().min(1).max(6000).nullable(),
  checklist: z.array(z.string().trim().min(1).max(200)).max(30),
})
type TemplateItem = z.infer<typeof itemSchema>

const saveSchema = z.object({
  name: z.string().trim().min(1, 'Şablon adı boş olamaz.').max(80),
  items: z.array(itemSchema).min(1, 'Şablona eklenecek görev yok.').max(50),
})

/** DB satırı (snake_case) ↔ uygulama kalemi. */
function toRow(i: TemplateItem) {
  return { scope_id: i.scopeId, kind: i.kind, title: i.title, target_minutes: i.targetMinutes, checklist: i.checklist }
}

export async function saveTemplateAction(input: z.input<typeof saveSchema>): Promise<{ error?: string; id?: string }> {
  const parsed = saveSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { workspaceId, profile } = await getTeacherContext()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('homework_templates')
    .insert({
      workspace_id: workspaceId,
      name: parsed.data.name,
      items: parsed.data.items.map(toRow),
      created_by_profile_id: profile.id,
    })
    .select('id')
    .single()
  if (error) return { error: dbErrorToTr(error.message) }
  return { id: data.id as string }
}

export async function applyTemplateAction(
  studentId: string,
  templateId: string
): Promise<{ error?: string; created?: number }> {
  if (!uuidSchema.safeParse(studentId).success || !uuidSchema.safeParse(templateId).success) {
    return { error: 'Geçersiz şablon.' }
  }
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()
  const { data: tpl } = await supabase
    .from('homework_templates')
    .select('items')
    .eq('id', templateId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!tpl) return { error: 'Şablon bulunamadı.' }

  const rows = z
    .array(
      z.object({
        scope_id: uuidSchema,
        kind: z.enum(['gorev', 'checklist', 'sure']),
        title: z.string(),
        target_minutes: z.number().nullable().optional(),
        checklist: z.array(z.string()).optional(),
      })
    )
    .safeParse(tpl.items)
  if (!rows.success) return { error: 'Şablon içeriği okunamadı.' }

  const { createTasksBulkAction } = await import('../../dersler/actions')
  const result = await createTasksBulkAction(
    studentId,
    rows.data.map(r => ({
      scopeId: r.scope_id,
      kind: r.kind,
      title: r.title,
      targetMinutes: r.target_minutes ?? null,
      checklist: r.checklist ?? [],
    }))
  )
  revalidatePath(`/teacher/students/${studentId}/homework/new`)
  if (result.error) return { error: result.error, created: result.created }
  return { created: result.created }
}

export async function deleteTemplateAction(templateId: string): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(templateId).success) return { error: 'Geçersiz şablon.' }
  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()
  const { error } = await supabase.from('homework_templates').delete().eq('id', templateId).eq('workspace_id', workspaceId)
  if (error) return { error: dbErrorToTr(error.message) }
  return {}
}
