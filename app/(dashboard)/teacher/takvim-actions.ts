'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'
import { decryptToken } from '@/lib/calendar/crypto'
import { calendarConfigured, listCalendars, refreshAccessToken, revokeToken } from '@/lib/google/calendar'
import { syncConnection, type SyncSummary } from '@/lib/calendar/sync'

// GOOGLE CALENDAR — öğretmen işlemleri (migration 157).
//
// Hepsi öğretmenin KENDİ oturumuyla çalışır; servis istemcisi kullanılmaz
// (lib/supabase/service.ts kuralı). Yetki RPC'lerde de doğrulanır
// (_calendar_caller_ok: bağlantının sahibi).

function revalidateCalendar() {
  revalidatePath('/teacher/ayarlar')
  revalidatePath('/teacher', 'layout')
}

async function ownConnection() {
  const { workspaceId, profile } = await getTeacherContext()
  const profileId = profile.id
  const supabase = await createClient()
  const { data } = await supabase
    .from('calendar_connections')
    .select('id, calendar_ids, status')
    .eq('workspace_id', workspaceId)
    .eq('profile_id', profileId)
    .maybeSingle()
  return { supabase, workspaceId, connection: data as { id: string; calendar_ids: string[]; status: string } | null }
}

export async function syncCalendarNowAction(): Promise<{ error?: string; summary?: SyncSummary }> {
  if (!calendarConfigured()) return { error: 'Google Calendar henüz yapılandırılmadı.' }
  const { supabase, connection } = await ownConnection()
  if (!connection) return { error: 'Bağlı bir Google Takvimi yok.' }
  const summary = await syncConnection(supabase, connection.id)
  revalidateCalendar()
  if (summary.needsReauth) return { error: 'Google bağlantısının süresi doldu; Ayarlar\'dan yeniden bağlanın.', summary }
  if (summary.error) return { error: summary.error, summary }
  return { summary }
}

export async function listGoogleCalendarsAction(): Promise<{
  error?: string
  calendars?: { id: string; summary: string; primary: boolean }[]
}> {
  if (!calendarConfigured()) return { error: 'Google Calendar henüz yapılandırılmadı.' }
  const { supabase, connection } = await ownConnection()
  if (!connection) return { error: 'Bağlı bir Google Takvimi yok.' }
  try {
    const { data: secret } = await supabase.rpc('get_calendar_secret', { p_connection_id: connection.id })
    if (!secret) return { error: 'Bağlantı anahtarı okunamadı.' }
    const token = await refreshAccessToken(decryptToken(secret as string))
    const list = await listCalendars(token)
    return { calendars: list.map(c => ({ id: c.primary ? 'primary' : c.id, summary: c.summary, primary: !!c.primary })) }
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Takvimler okunamadı.' }
  }
}

export async function setCalendarIdsAction(calendarIds: string[]): Promise<{ error?: string }> {
  const parsed = z.array(z.string().trim().min(1).max(300)).min(1, 'En az bir takvim seçin.').max(10).safeParse(calendarIds)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const { supabase, connection } = await ownConnection()
  if (!connection) return { error: 'Bağlı bir Google Takvimi yok.' }
  const { error } = await supabase.rpc('set_calendar_connection_state', {
    p_connection_id: connection.id,
    p_calendar_ids: parsed.data,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateCalendar()
  return {}
}

/** Bağlantıyı kopar: Google'da iptal + anahtar ve bağlar silinir; İz oturumları kalır. */
export async function disconnectCalendarAction(): Promise<{ error?: string }> {
  const { supabase, workspaceId, connection } = await ownConnection()
  if (!connection) return {}
  try {
    const { data: secret } = await supabase.rpc('get_calendar_secret', { p_connection_id: connection.id })
    if (secret && calendarConfigured()) await revokeToken(decryptToken(secret as string))
  } catch {
    // Google'da iptal düşse de İz'deki anahtar aşağıda silinir.
  }
  const { error } = await supabase.rpc('delete_calendar_connection', { p_connection_id: connection.id })
  if (error) return { error: dbErrorToTr(error.message) }
  await logAudit(supabase, { workspaceId, action: 'calendar.disconnect', entityType: 'workspace', entityId: workspaceId })
  revalidateCalendar()
  return {}
}

const matchSchema = z.object({
  linkId: uuidSchema,
  studentId: uuidSchema.nullable(),
  serviceId: uuidSchema.nullable(),
  ignored: z.boolean(),
  wholeSeries: z.boolean(),
})

/** Eşleşmeyen etkinliği bir kez eşle (ya da yok say). Başlıktan tahmin yok. */
export async function setCalendarMatchAction(input: z.input<typeof matchSchema>): Promise<{ error?: string }> {
  const parsed = matchSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data
  if (!v.ignored && (!v.studentId || !v.serviceId)) return { error: 'Öğrenci ve hizmet seçin.' }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_calendar_match', {
    p_link_id: v.linkId,
    p_student_id: v.studentId,
    p_service_id: v.serviceId,
    p_ignored: v.ignored,
    p_whole_series: v.wholeSeries,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  await logAudit(supabase, {
    workspaceId,
    action: 'calendar.match',
    entityType: 'student',
    entityId: v.studentId ?? undefined,
    detail: { linkId: v.linkId, ignored: v.ignored, wholeSeries: v.wholeSeries },
  })
  revalidateCalendar()
  return {}
}

/** Hizmetin Calendar bağını kaldır: program İz'e döner. */
export async function unlinkServiceCalendarAction(studentId: string, serviceId: string): Promise<{ error?: string }> {
  if (!uuidSchema.safeParse(serviceId).success || !uuidSchema.safeParse(studentId).success) {
    return { error: 'Geçersiz kayıt.' }
  }
  await getTeacherContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('unlink_service_calendar', { p_service_id: serviceId })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}/gorusmeler`)
  return {}
}
