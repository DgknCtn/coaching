'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'
import {
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
