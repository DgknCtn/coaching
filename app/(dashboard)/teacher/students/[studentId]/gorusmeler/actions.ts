'use server'

// DERS & GÖRÜŞMELER yazma yolları (R7-04 Rev.3).
//
// İLETİŞİM DEĞİL, KAYIT: ders saati değişikliği veya iptal WhatsApp gibi
// mevcut kanallarda konuşulur. MatMüh mesajlaşma uygulaması değildir;
// buradaki her eylem KESİNLEŞMİŞ sonucu resmî kayda çevirir. Bu yüzden
// "talep gönder / onay bekle" gibi bir akış bilinçli olarak yoktur.
//
// İş kuralları (planlanan tarih korunur, telafi asıl aya yazılır, saat
// geçince otomatik "Yapılmadı" denmez) 075'teki RPC'lerde yaşıyor. Bu
// dosya yalnız doğrulama + yetki + revalidate katmanı.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/gorusmeler`)
  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher')
}

const serviceSchema = z.object({
  studentId: uuidSchema,
  kind: z.enum(['ders', 'kocluk'], { message: 'Hizmet türü seçin.' }),
  participation: z.enum(['birebir', 'grup'], { message: 'Katılım biçimi seçin.' }),
  medium: z.enum(['online', 'yuz_yuze'], { message: 'Ortam seçin.' }),
  groupId: uuidSchema.optional().or(z.literal('')),
  weekday: z.coerce.number().int().min(1).max(7),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Geçerli bir saat girin (örn. 20:00).'),
  plannedDurationMinutes: z.coerce
    .number()
    .int()
    .min(5, 'Süre en az 5 dakika olmalı.')
    .max(600, 'Süre en fazla 600 dakika olabilir.'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir başlangıç tarihi seçin.'),
  submissionOffsetMinutes: z.coerce.number().int().min(0).max(10080).default(0),
  financeLink: z.enum(['aylik_paket', 'ders_basi', 'haric']).default('haric'),
})

export type ServiceInput = z.input<typeof serviceSchema>

/**
 * Yeni hizmet ekler.
 *
 * ÇOKLU HİZMET: aynı öğrencide birden fazla satır aynı anda aktif
 * olabilir — "Çarşamba 20:00 online grup matematik" ile "Cumartesi 10:00
 * bireysel koçluk" birlikte yaşar. Eski tek seçimli Çalışma Modeli
 * alanının çözemediği asıl sorun buydu.
 */
export async function createServiceAction(input: ServiceInput) {
  const parsed = serviceSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data

  // Grup/birebir tutarlılığı veritabanında da CHECK ile korunuyor;
  // burada erken yakalamak kullanıcıya anlaşılır bir mesaj verir.
  if (v.participation === 'grup' && !v.groupId) {
    return { error: 'Grup hizmeti için bir grup seçin.' }
  }

  const { supabase, workspaceId, profile } = await getTeacherContext()

  // Öğrenci gerçekten bu çalışma alanında mı? İstemciden gelen
  // workspaceId'ye asla güvenilmez; oturumdaki kullanılır.
  const { data: student } = await supabase
    .from('students')
    .select('id')
    .eq('id', v.studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!student) return { error: 'Öğrenci bulunamadı.' }

  const { error } = await supabase.from('student_services').insert({
    workspace_id: workspaceId,
    student_id: v.studentId,
    kind: v.kind,
    participation: v.participation,
    medium: v.medium,
    group_id: v.participation === 'grup' ? v.groupId : null,
    weekday: v.weekday,
    start_time: v.startTime,
    planned_duration_minutes: v.plannedDurationMinutes,
    start_date: v.startDate,
    submission_offset_minutes: v.submissionOffsetMinutes,
    finance_link: v.financeLink,
    created_by_profile_id: profile.id,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'service.create',
    entityType: 'student',
    entityId: v.studentId,
    detail: { kind: v.kind, participation: v.participation, medium: v.medium },
  })
  revalidate(v.studentId)
  return { success: true }
}

/**
 * Hizmeti pasife alır veya yeniden aktifleştirir.
 *
 * SİLME YOK (§5.1): silinseydi geçmiş oturumlar sahipsiz kalır ve sezon
 * özeti geriye dönük değişirdi. Pasife alma yalnız GELECEĞİ durdurur.
 */
export async function setServiceStatusAction(
  studentId: string,
  serviceId: string,
  status: 'active' | 'passive'
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      serviceId: uuidSchema,
      status: z.enum(['active', 'passive']),
    })
    .safeParse({ studentId, serviceId, status })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('set_service_status', {
    p_service_id: serviceId,
    p_status: status,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'service.status',
    entityType: 'student',
    entityId: studentId,
    detail: { serviceId, status },
  })
  revalidate(studentId)
  return { success: true }
}

/**
 * Ayın planlanan oturumlarını üretir.
 *
 * TEMBEL ÜRETİM: cron yok; ekran açıldığında çağrılır. RPC idempotent
 * olduğu için tekrar çağrılması zararsızdır (016'daki
 * ensure_student_check_ins ile aynı yaklaşım).
 */
export async function generateSessionsAction(
  studentId: string,
  year: number,
  month: number
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      year: z.coerce.number().int().min(2000).max(2100),
      month: z.coerce.number().int().min(1).max(12),
    })
    .safeParse({ studentId, year, month })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // Bu eylem denetim kaydı üretmez: oturum üretimi kullanıcının bir
  // kararı değil, ekranın kendi kendine yaptığı tembel materyalizasyon.
  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('generate_service_sessions', {
    p_student_id: parsed.data.studentId,
    p_year: parsed.data.year,
    p_month: parsed.data.month,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true }
}

/**
 * Görüşme sonrası kesinleşmiş durum.
 *
 * "Yapıldı" derken ayrıca saat sorulmaz: zamanında yapılan ders için
 * planlanan an gerçekleşme anı sayılır (RPC'de COALESCE). Öğretmeni
 * bildiği bir saati tekrar girmeye zorlamak, kaydın hiç işaretlenmemesine
 * yol açan türden bir sürtünmedir.
 */
export async function setSessionOutcomeAction(
  studentId: string,
  sessionId: string,
  status: 'yapildi' | 'yapilmadi' | 'iptal' | 'planlandi',
  note?: string
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      sessionId: uuidSchema,
      status: z.enum(['yapildi', 'yapilmadi', 'iptal', 'planlandi']),
      note: z.string().trim().max(500).optional().or(z.literal('')),
    })
    .safeParse({ studentId, sessionId, status, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('set_session_outcome', {
    p_session_id: sessionId,
    p_status: status,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'session.outcome',
    entityType: 'student',
    entityId: studentId,
    detail: { sessionId, status },
  })
  revalidate(studentId)
  return { success: true }
}

/**
 * Tek seferlik tarih/saat değişikliği.
 *
 * İLK PLANLANAN TARİH SİLİNMEZ (§7.A): RPC yalnız `actual_at` yazar.
 * Böylece öğrenci ve veli "19 Eyl 10:00 -> 20 Eyl 11:00" görebilir.
 *
 * AKTİF HAFTALIK AKIŞ OTOMATİK TAŞINMAZ: bu oturum ana temas olsa bile
 * akışın Son Teslimi burada değişmez. O soru öğretmene ayrıca sorulur
 * (Faz 2). Sessiz taşıma, öğrencinin haftasını haber vermeden
 * uzatmak olurdu.
 */
export async function rescheduleSessionAction(
  studentId: string,
  sessionId: string,
  newAtIso: string,
  note?: string
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      sessionId: uuidSchema,
      newAtIso: z.string().min(1, 'Yeni tarih ve saat gerekli.'),
      note: z.string().trim().max(500).optional().or(z.literal('')),
    })
    .safeParse({ studentId, sessionId, newAtIso, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const when = new Date(parsed.data.newAtIso)
  if (Number.isNaN(when.getTime())) return { error: 'Geçerli bir tarih ve saat girin.' }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('reschedule_session', {
    p_session_id: sessionId,
    p_new_at: when.toISOString(),
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'session.reschedule',
    entityType: 'student',
    entityId: studentId,
    detail: { sessionId, newAt: when.toISOString() },
  })
  revalidate(studentId)
  return { success: true }
}

/**
 * Telafi oturumu oluşturur.
 *
 * Telafi ASIL oturuma bağlanır (§7.C). Hangi ayda yapılırsa yapılsın
 * asıl ayın hizmet borcuna sayılır; yeni ay paketine ekstra hizmet
 * yazılmaz. Bağ 075'teki view tarafından okunuyor.
 */
export async function createMakeupSessionAction(
  studentId: string,
  sessionId: string,
  plannedAtIso: string
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      sessionId: uuidSchema,
      plannedAtIso: z.string().min(1, 'Telafi tarihi gerekli.'),
    })
    .safeParse({ studentId, sessionId, plannedAtIso })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const when = new Date(parsed.data.plannedAtIso)
  if (Number.isNaN(when.getTime())) return { error: 'Geçerli bir tarih ve saat girin.' }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('create_makeup_session', {
    p_session_id: sessionId,
    p_planned_at: when.toISOString(),
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'session.makeup',
    entityType: 'student',
    entityId: studentId,
    detail: { originSessionId: sessionId, plannedAt: when.toISOString() },
  })
  revalidate(studentId)
  return { success: true }
}
