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
import { deriveMainContact, type ServiceLike } from '@/lib/service-structure'
import { shouldAskToMoveDue } from '@/lib/weekly-flow'

function revalidate(studentId: string) {
  revalidatePath(`/teacher/students/${studentId}/gorusmeler`)
  revalidatePath(`/teacher/students/${studentId}`)
  // Ana temas değişikliği haftanın kapanışını etkileyebiliyor; akış
  // ekranı eski tarihi göstermemeli.
  revalidatePath(`/teacher/students/${studentId}/haftalik-akis`)
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

  return {
    success: true,
    // R7/05 §4 ve kabul #11: ana temas tek seferlik değiştiyse aktif
    // akışın son teslimi TAŞINMAZ, SORULUR.
    moveDue: await proposeFlowDueMove({
      supabase,
      workspaceId,
      studentId,
      sessionId,
      newAt: when,
    }),
  }
}

/**
 * Ertelenen oturum ana temas mı, öyleyse akışın son teslimi ne olurdu?
 *
 * DÖNEN ŞEY BİR KARAR DEĞİL, BİR SORUDUR. Belge net: *"Tek seferlik
 * görüşme değişikliğinde sistem: 'Aktif Haftalık Akış'ın son teslimi de
 * taşınsın mı?' diye sorar."* Otomatik taşımak, öğretmenin koymadığı bir
 * kapanışı resmi hâle getirirdi.
 *
 * ÜÇ DURUMDA HİÇ SORULMAZ:
 *  - ertelenen oturum ana temasa ait değilse (haftanın ritmini kurmuyor),
 *  - aktif akış yoksa,
 *  - akışın son teslimi ÖZEL seçilmişse — §4: *"Özel son teslim zaten
 *    seçilmişse otomatik değiştirme yapılmaz; öğretmene mevcut özel
 *    tarih hatırlatılır."* Bu durumda soru yerine hatırlatma döner.
 */
async function proposeFlowDueMove(input: {
  supabase: Awaited<ReturnType<typeof getTeacherContext>>['supabase']
  workspaceId: string
  studentId: string
  sessionId: string
  newAt: Date
}): Promise<
  | { kind: 'ask'; flowId: string; currentDueAt: string; proposedDueAt: string }
  | { kind: 'locked'; currentDueAt: string }
  | null
> {
  const { supabase, workspaceId, studentId, sessionId, newAt } = input

  const { data: session } = await supabase
    .from('service_sessions')
    .select('service_id')
    .eq('id', sessionId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!session?.service_id) return null

  const { data: serviceRows } = await supabase
    .from('student_services')
    .select(
      'id, kind, participation, medium, weekday, start_time, start_date, status, submission_offset_minutes'
    )
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  const services: ServiceLike[] = (serviceRows ?? []).map(s => ({
    id: s.id,
    kind: s.kind,
    participation: s.participation,
    medium: s.medium,
    weekday: s.weekday,
    startTime: String(s.start_time).slice(0, 5),
    startDate: s.start_date,
    status: s.status,
    submissionOffsetMinutes: s.submission_offset_minutes ?? 0,
  })) as ServiceLike[]

  // Ana temas kararı TEK yerde: deriveMainContact (Koçluk > Birebir >
  // Grup). Burada ikinci bir öncelik listesi yazılsaydı iki ekran farklı
  // hizmeti ana temas sayabilirdi.
  const anchor = deriveMainContact(services)
  if (!anchor || anchor.id !== session.service_id) return null

  const { data: flow } = await supabase
    .from('weekly_flows')
    .select('id, due_at, due_source, status')
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()

  if (!flow) return null

  if (
    !shouldAskToMoveDue({
      dueSource: flow.due_source as 'anchor' | 'custom',
      status: flow.status as 'active' | 'closed',
    })
  ) {
    return { kind: 'locked', currentDueAt: flow.due_at as string }
  }

  // Yeni kapanış, oturumun yeni saatinden teslim payı düşülerek bulunur
  // — online grup dersinde "ders - 6 saat" kuralı bu paydır (074:
  // submission_offset_minutes).
  const proposed = new Date(
    newAt.getTime() - (anchor.submissionOffsetMinutes ?? 0) * 60_000
  )

  return {
    kind: 'ask',
    flowId: flow.id,
    currentDueAt: flow.due_at as string,
    proposedDueAt: proposed.toISOString(),
  }
}

/**
 * Aktif akışın son teslimini ana temasın yeni saatine taşır.
 *
 * Yalnız öğretmen "evet" dedikten sonra çağrılır. Kaynak `anchor`
 * kalır: tarih hâlâ ana temastan türüyor, öğretmenin elle koyduğu özel
 * bir tarih değil.
 */
export async function moveActiveFlowDueAction(
  studentId: string,
  flowId: string,
  dueAtIso: string
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      flowId: uuidSchema,
      dueAtIso: z.string().min(1, 'Yeni son teslim gerekli.'),
    })
    .safeParse({ studentId, flowId, dueAtIso })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const when = new Date(parsed.data.dueAtIso)
  if (Number.isNaN(when.getTime())) return { error: 'Geçerli bir tarih ve saat girin.' }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('set_weekly_flow_due', {
    p_flow_id: parsed.data.flowId,
    p_due_at: when.toISOString(),
    p_source: 'anchor',
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'flow.due_change',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { flowId: parsed.data.flowId, dueAt: when.toISOString(), source: 'anchor' },
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

/**
 * Telafi kararı: "edilecek" mi "edilmeyecek" mi? (§7-C)
 *
 * İKİSİ AYNI DURUMA DÜŞÜYORDU. `yapilmadi` tek başına ayın kapanıp
 * kapanmadığını söylemiyor:
 *
 *   Telafi edilecek     → ay TAMAMLANMAMIŞ sayılır
 *   Telafi edilmeyecek  → ay örn. 3/4 olarak KAPANIR
 *
 * Karar veriden türetilemez — telafi kaydı henüz açılmamışken
 * "bekliyor mu, vazgeçildi mi" sorusunun cevabı yalnız öğretmende.
 */
export async function setMakeupDecisionAction(
  studentId: string,
  sessionId: string,
  decision: 'pending' | 'waived'
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      sessionId: uuidSchema,
      decision: z.enum(['pending', 'waived']),
    })
    .safeParse({ studentId, sessionId, decision })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('set_makeup_decision', {
    p_session_id: parsed.data.sessionId,
    p_decision: parsed.data.decision,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'session.makeup',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { sessionId: parsed.data.sessionId, decision: parsed.data.decision },
  })

  revalidate(studentId)
  return { success: true }
}

/**
 * Grup oluşturur.
 *
 * Grup şimdiye kadar yalnız SEÇİLEBİLİYORDU; oluşturmanın arayüzde
 * hiçbir yolu yoktu. Grup hizmeti tanımlamak isteyen öğretmen boş bir
 * açılır listeye bakıyordu.
 */
export async function createStudentGroupAction(studentId: string, name: string, subject?: string) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      name: z.string().trim().min(1, 'Grup adı gerekli.').max(120),
      subject: z.string().trim().max(80).optional().or(z.literal('')),
    })
    .safeParse({ studentId, name, subject })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { data, error } = await supabase.rpc('create_student_group', {
    p_workspace_id: workspaceId,
    p_name: parsed.data.name,
    p_subject: parsed.data.subject || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId)
  return { success: true, groupId: data as string }
}

/**
 * Grup oturumunu TEK İŞLEMLE sonuçlandırır (§9).
 *
 * Fan-out RPC'nin içinde: yalnız aktif hizmeti olan öğrencilere yansır
 * ve "Katılmadı" istisnası ezilmez. Karar burada tekrarlanmıyor —
 * arayüzde ikinci bir kural yazılsaydı iki taraf ayrışırdı.
 */
export async function setGroupSessionOutcomeAction(
  studentId: string,
  groupSessionId: string,
  status: 'yapildi' | 'yapilmadi' | 'iptal' | 'planlandi'
) {
  const parsed = z
    .object({
      studentId: uuidSchema,
      groupSessionId: uuidSchema,
      status: z.enum(['yapildi', 'yapilmadi', 'iptal', 'planlandi']),
    })
    .safeParse({ studentId, groupSessionId, status })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { data, error } = await supabase.rpc('set_group_session_outcome', {
    p_group_session_id: parsed.data.groupSessionId,
    p_status: parsed.data.status,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'session.outcome',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { groupSessionId: parsed.data.groupSessionId, status: parsed.data.status },
  })

  revalidate(studentId)
  // Kaç öğrenciye yansıdığı DÖNÜYOR: sessiz bir fan-out, hiç
  // yansımadığını da sessiz bırakırdı.
  return { success: true, affected: Number(data ?? 0) }
}

/**
 * Öğrenci bazında "Katılmadı" istisnası (§9).
 *
 * Grup dersi YAPILDI ama bu öğrenci gelmedi — oturumu "Yapılmadı"
 * işaretlemek yanlış olurdu: ders gerçekleşti, eksik olan tek
 * öğrencinin katılımı. Aylık sayaç bu istisnayı zaten hesaba katıyor.
 */
export async function setSessionAttendanceAction(
  studentId: string,
  sessionId: string,
  attended: boolean
) {
  const parsed = z
    .object({ studentId: uuidSchema, sessionId: uuidSchema, attended: z.boolean() })
    .safeParse({ studentId, sessionId, attended })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, workspaceId } = await getTeacherContext()
  const { error } = await supabase.rpc('set_session_attendance', {
    p_session_id: parsed.data.sessionId,
    p_attended: parsed.data.attended,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  await logAudit(supabase, {
    workspaceId,
    action: 'session.outcome',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { sessionId: parsed.data.sessionId, attended: parsed.data.attended },
  })

  revalidate(studentId)
  return { success: true }
}
