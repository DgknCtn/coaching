'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import {
  cleanupKindSchema,
  deleteCleanupSchema,
  extendTrialSchema,
  firstIssue,
  grantLicenseSchema,
  resolveOrderSchema,
  setStatusSchema,
  studentLimitSchema,
} from '@/lib/admin/action-schemas'

// YÖNETİM İŞLEMLERİ (128).
//
// Yetki, sınırlar ve yönetim kaydı RPC'nin İÇİNDE, tek transaction'da:
// kayıt yazılamazsa işlem de olmaz. Buradaki Zod yalnız erken ve alan
// düzeyinde mesaj içindir; doğruluğun kaynağı veritabanı.

type Result = { error?: string }

function revalidateWorkspace(workspaceId: string) {
  revalidatePath(`/admin/calisma-alanlari/${workspaceId}`)
  revalidatePath('/admin/musteriler')
  revalidatePath('/admin/kayit')
  revalidatePath('/admin')
}

export async function extendTrialAction(input: unknown): Promise<Result> {
  const parsed = extendTrialSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { workspaceId, days, reason } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_extend_trial', {
    p_workspace_id: workspaceId,
    p_days: days,
    p_reason: reason,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateWorkspace(workspaceId)
  return {}
}

export async function setWorkspaceStatusAction(input: unknown): Promise<Result> {
  const parsed = setStatusSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { workspaceId, status, reason } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_workspace_status', {
    p_workspace_id: workspaceId,
    p_status: status,
    p_reason: reason,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateWorkspace(workspaceId)
  return {}
}

export async function grantLicenseAction(input: unknown): Promise<Result> {
  const parsed = grantLicenseSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { workspaceId, studentCount, months, reason } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_grant_license', {
    p_workspace_id: workspaceId,
    p_student_count: studentCount,
    p_months: months,
    p_reason: reason,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateWorkspace(workspaceId)
  revalidatePath('/admin/gelir')
  return {}
}

export async function setStudentLimitAction(input: unknown): Promise<Result> {
  const parsed = studentLimitSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { workspaceId, limit, reason } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_set_student_limit', {
    p_workspace_id: workspaceId,
    p_limit: limit,
    p_reason: reason,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateWorkspace(workspaceId)
  return {}
}

export async function resolveOrderAction(input: unknown): Promise<Result> {
  const parsed = resolveOrderSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { orderId, outcome, reason } = parsed.data
  const supabase = await createClient()
  const { error } = await supabase.rpc('admin_resolve_order', {
    p_order_id: orderId,
    p_outcome: outcome,
    p_reason: reason,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath('/admin/gelir')
  revalidatePath('/admin/kayit')
  revalidatePath('/admin')
  return {}
}

// ============================================================
// SEÇEREK TEMİZLEME (136)
//
// Önizleme diyalog açılınca istenir: neyin silineceği sayılarla ve varsa
// ENGEL nedeniyle gösterilir. Silme RPC'si engelleri ve onay metnini
// yeniden denetler; buradaki önizleme yalnız bilgilendirir.
// ============================================================

export type CleanupKind = z.infer<typeof cleanupKindSchema>

export type CleanupPreview = Record<string, unknown> & {
  name?: string | null
  email?: string | null
  blocked?: boolean
  block_reason?: string | null
}

export async function cleanupPreviewAction(
  kind: CleanupKind,
  id: string
): Promise<{ error?: string; preview?: CleanupPreview }> {
  const parsedKind = cleanupKindSchema.safeParse(kind)
  const parsedId = z.uuid().safeParse(id)
  if (!parsedKind.success || !parsedId.success) return { error: 'Geçersiz kayıt.' }
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('admin_cleanup_preview', {
    p_kind: parsedKind.data,
    p_id: parsedId.data,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  return { preview: (data ?? {}) as CleanupPreview }
}

const DELETE_RPC: Record<CleanupKind, { fn: string; idArg: string; confirmArg: string }> = {
  workspace: { fn: 'admin_delete_workspace', idArg: 'p_workspace_id', confirmArg: 'p_confirm_name' },
  partner: { fn: 'admin_delete_partner', idArg: 'p_partner_id', confirmArg: 'p_confirm_name' },
  user: { fn: 'admin_delete_user', idArg: 'p_profile_id', confirmArg: 'p_confirm_email' },
}

export async function deleteCleanupAction(input: unknown): Promise<Result> {
  const parsed = deleteCleanupSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { kind, id, confirm, reason } = parsed.data
  const rpc = DELETE_RPC[kind]
  const supabase = await createClient()
  const { error } = await supabase.rpc(rpc.fn, {
    [rpc.idArg]: id,
    [rpc.confirmArg]: confirm,
    p_reason: reason,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin', 'layout')
  return {}
}
