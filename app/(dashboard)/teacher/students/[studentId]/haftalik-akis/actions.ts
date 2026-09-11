'use server'

// HAFTALIK AKIŞ yazma yolları (R7 / Site Testi 05).
//
// Bu dosya yalnız doğrulama + yetki + revalidate katmanıdır. İş
// kuralları iki yerde yaşıyor ve ikisi de bilinçli:
//
//  - 077'deki RPC'ler: "tek aktif akış", "kapanmış hafta yeniden
//    yazılmaz", "zamanında teslim fotoğrafı" gibi VERİYİ KORUYAN
//    kurallar. Arayüz atlansa bile geçerli olmaları gerekiyor.
//  - lib/weekly-flow.ts: "resmi kapanış hangisidir", "tempo hangi
//    bantta" gibi KARAR kuralları. Test edilebilir ve tek kaynak.
//
// Buraya üçüncü bir kural yazmak, o iki yerden biriyle bir gün
// ayrışacak bir kopya üretmek olurdu.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/haftalik-akis`)
  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher')
}

const openSchema = z.object({
  studentId: uuidSchema,
  startsAt: z.string().min(1, 'Akışın başlangıcı gerekli.'),
  dueAt: z.string().min(1, 'Son teslim gerekli.'),
  dueSource: z.enum(['anchor', 'custom']),
  anchorServiceId: uuidSchema.optional().or(z.literal('')),
})

/**
 * Yeni döngüyü açar; açık olan varsa RPC aynı işlemde kapatır.
 *
 * Kapatma burada ayrıca çağrılmıyor — iki çağrı arasında hata çıkarsa
 * öğrenci aktif akışı olmayan bir boşlukta kalırdı (077).
 */
export async function openWeeklyFlowAction(input: {
  studentId: string
  startsAt: string
  dueAt: string
  dueSource: 'anchor' | 'custom'
  anchorServiceId?: string
}) {
  const parsed = openSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('open_weekly_flow', {
    p_student_id: parsed.data.studentId,
    p_starts_at: parsed.data.startsAt,
    p_due_at: parsed.data.dueAt,
    p_due_source: parsed.data.dueSource,
    p_anchor_service_id: parsed.data.anchorServiceId || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'flow.open',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { dueAt: parsed.data.dueAt, dueSource: parsed.data.dueSource },
  })

  revalidate(parsed.data.studentId)
  return { success: true, flowId: data as string | null }
}

const closeSchema = z.object({
  studentId: uuidSchema,
  flowId: uuidSchema,
})

/**
 * Haftayı kapatır ve zamanında teslim fotoğrafını çeker.
 *
 * SİLME DEĞİL: kapanan hafta arşivlenir (kabul #12). Ekranda "Geçmiş
 * Akışlar" sekmesinde durmaya devam eder.
 */
export async function closeWeeklyFlowAction(input: {
  studentId: string
  flowId: string
}) {
  const parsed = closeSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('close_weekly_flow', {
    p_flow_id: parsed.data.flowId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'flow.close',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { flowId: parsed.data.flowId },
  })

  revalidate(parsed.data.studentId)
  return { success: true }
}

const dueSchema = z.object({
  studentId: uuidSchema,
  flowId: uuidSchema,
  dueAt: z.string().min(1, 'Son teslim gerekli.'),
  source: z.enum(['anchor', 'custom']),
})

/**
 * Haftanın resmi kapanışını değiştirir.
 *
 * KAYNAK DA YAZILIR: yalnız tarihi değiştirip kaynağı 'anchor' bırakmak,
 * bir sonraki otomatik hesabın öğretmenin kararını sessizce ezmesi
 * demekti (§4: "Özel son teslim zaten seçilmişse otomatik değiştirme
 * yapılmaz").
 */
export async function setWeeklyFlowDueAction(input: {
  studentId: string
  flowId: string
  dueAt: string
  source: 'anchor' | 'custom'
}) {
  const parsed = dueSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase.rpc('set_weekly_flow_due', {
    p_flow_id: parsed.data.flowId,
    p_due_at: parsed.data.dueAt,
    p_source: parsed.data.source,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'flow.due_change',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { flowId: parsed.data.flowId, dueAt: parsed.data.dueAt, source: parsed.data.source },
  })

  revalidate(parsed.data.studentId)
  return { success: true }
}
