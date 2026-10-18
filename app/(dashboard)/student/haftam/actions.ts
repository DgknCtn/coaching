'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getStudentContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { localDateString } from '@/lib/homework-status'

// ÖĞRENCİNİN GÜNLÜK DAĞITIMI — R7-06.03.
//
// Bu dosyanın yazdığı tek şey `homework_items.planned_for_date`. O sütun
// ÖĞRENCİNİN KENDİ PLANIDIR, resmi bir son teslim DEĞİLDİR (belge:
// *"Öğrenci haftalık yükü günlere dağıtabilmeli. Kendi planı resmi
// deadline değildir."*).
//
// Bu ayrım kodda da korunuyor: buradaki hiçbir yol
// `homework_batches.due_date` ya da `weekly_flows.due_at`'a dokunmaz —
// 077 kabul #3, "ikinci bağımsız deadline oluşturmamalı". Plan tarihi
// hiçbir gecikme hesabına da girmez; `isOverdue` yalnız due_date'e bakar.

/** `YYYY-MM-DD` mi? Plan tarihi gün düzeyinde tutulur, saat taşımaz. */
function normalizePlanDate(value: string | null | undefined): string | null | undefined {
  if (value === null || value === '') return null // planı kaldır
  if (typeof value !== 'string') return undefined
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined
}

/**
 * Bir çalışmayı bir güne koyar; `date` null ise plandan çıkarır.
 *
 * SINIR KONTROLÜ SUNUCUDA: tarih akışın penceresi içinde olmalı.
 * İstemciye güvenilseydi öğrenci haftanın dışına iş atıp kendi
 * ekranında haftayı boş gösterebilirdi. Pencerenin kendisi RPC'de
 * değil burada kontrol ediliyor, çünkü akışın başlangıcı ve kapanışı
 * zaten bu isteğin bağlamında okunuyor — RPC'de ikinci bir sorgu
 * olurdu.
 */
export async function setPlanDateAction(homeworkItemId: string, date: string | null) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const planDate = normalizePlanDate(date)
  if (planDate === undefined) return { error: 'Geçersiz tarih.' }

  const { student, workspaceId } = await getStudentContext()
  const supabase = await createClient()

  if (planDate !== null) {
    // Aktif akışın penceresi. Akış yoksa planlanacak bir hafta da yok.
    const { data: flow } = await supabase
      .from('weekly_flows')
      .select('starts_at, due_at')
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle()

    if (!flow) return { error: 'Şu an açık bir çalışma haftan yok.' }

    const firstDay = localDateString(new Date(flow.starts_at as string))
    const lastDay = localDateString(new Date(flow.due_at as string))

    // YYYY-MM-DD karşılaştırması doğrudan tarih karşılaştırmasıdır.
    if (planDate < firstDay || planDate > lastDay) {
      return { error: 'Bu gün çalışma haftanın dışında.' }
    }
  }

  // Yetki ve "bu çalışma hâlâ aktif yükte mi" kontrolü RPC'de (097):
  // tek sütuna yazma hakkı, `homework_items` üzerinde öğrenciye genel
  // UPDATE açmadan ancak böyle verilebilir.
  const { error } = await supabase.rpc('set_homework_item_plan_date', {
    p_homework_item_id: parsed.data,
    p_date: planDate,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/student/haftam')
  revalidatePath('/student')
  return { success: true }
}

// ============================================================
// HAFTAM V2 — KART İŞLEMLERİ (R8)
//
// Ekrandaki "kart" bir kayıt DEĞİL, aynı kitap/bölüm altındaki tekil
// çalışmaların görsel gruplamasıdır (§7). Bu yüzden aşağıdaki üç eylem
// de bir kimlik listesi alır: kartın o anda kapsadığı kalemler.
//
// Kart bölmek yeni çalışma üretmez, eskisini silmez, çift sayım
// oluşturmaz — yalnız ilgili kalemlerin planlanan günü değişir.
// ============================================================

/** Kimlik listesinin ortak doğrulaması. */
function parseItemIds(ids: unknown): string[] | null {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) return null
  const out: string[] = []
  for (const id of ids) {
    const parsed = uuidSchema.safeParse(id)
    if (!parsed.success) return null
    out.push(parsed.data)
  }
  return out
}

/**
 * Bir kartın (ya da kartın seçili parçasının) gününü değiştirir.
 *
 * `date` null ise plandan çıkarılır — kalemler "Planlanmamışlar"a döner.
 * Pencere kontrolü, tekil yoldaki (`setPlanDateAction`) ile aynı sebeple
 * sunucuda.
 */
export async function setPlanDatesAction(homeworkItemIds: string[], date: string | null) {
  const ids = parseItemIds(homeworkItemIds)
  if (!ids) return { error: 'Geçersiz çalışma listesi.' }

  const planDate = date === null || date === '' ? null : normalizeDayDate(date)
  if (date !== null && date !== '' && planDate === null) return { error: 'Geçersiz tarih.' }

  const supabase = await createClient()

  if (planDate !== null) {
    const ctx = await assertDateInActiveFlow(planDate)
    if ('error' in ctx) return { error: ctx.error }
  }

  const { error } = await supabase.rpc('set_homework_items_plan_date', {
    p_homework_item_ids: ids,
    p_date: planDate,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true }
}

/**
 * Tek tik: kartın kapsadığı tüm kalemleri teslim eder (§8).
 *
 * ÖĞRENCİYE OPERASYON DİLİ GÖSTERİLMEZ. Arka planda mevcut onay akışı
 * işliyor ama öğrenci açısından cümle tek: "tikledim = işimi bitirdim."
 */
export async function submitWorkItemsAction(homeworkItemIds: string[], studiedOn?: string) {
  const ids = parseItemIds(homeworkItemIds)
  if (!ids) return { error: 'Geçersiz çalışma listesi.' }

  await getStudentContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('submit_homework_items_by_ids', {
    p_homework_item_ids: ids,
    p_studied_on: normalizeDayDate(studiedOn),
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true, count: (data as { submitted_count?: number })?.submitted_count ?? 0 }
}

/**
 * Yanlış tiki geri alır (§10).
 *
 * KURAL KORUNUYOR: öğretmenin onayladığı çalışma geri alınamaz (097).
 * RPC yalnız `pending_approval` satırlara dokunur, o yüzden onaylanmış
 * bir kartta bu çağrı hiçbir şeyi değiştirmez.
 */
export async function revertWorkItemsAction(homeworkItemIds: string[]) {
  const ids = parseItemIds(homeworkItemIds)
  if (!ids) return { error: 'Geçersiz çalışma listesi.' }

  await getStudentContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('revert_homework_items_by_ids', {
    p_homework_item_ids: ids,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true, count: (data as { reverted_count?: number })?.reverted_count ?? 0 }
}

// ============================================================
// HAFTAM V2 — ÖĞRENCİNİN YAZDIKLARI (R8)
//
// Üç yazı türü: günün akademik notu (§13), çalışmaya özel akademik not
// (§12) ve kişisel ajanda (§14). Üçü de 101'de açılan tablolara yazılır.
//
// NEDEN BURADA RPC YOK
//
// `setPlanDateAction` bir RPC'den geçiyor çünkü `homework_items` ÖĞRETMENE
// ait bir tablo ve öğrenciye yalnız TEK SÜTUNU açmanın başka yolu yok.
// Aşağıdaki tablolarda satırın tamamı öğrencinindir; RLS satır düzeyinde
// zaten doğru cevabı veriyor. Gereksiz bir SECURITY DEFINER katmanı,
// korumayı artırmadan denetlenecek yüzeyi büyütürdü.
//
// ÇALIŞMA ALANI İSTEMCİDEN ALINMAZ: her zaman `getStudentContext()`'ten
// gelir ve 101'deki politika bunu ayrıca şemada da doğrular.
//
// KRİTİK İLKE (§13): öğrenci not yazmadığı için hiçbir yerde "eksik"
// sayılmaz. Bu yüzden burada "not zorunlu" diyen tek bir yol yok; boş
// metin notu YAZMAZ, SİLER.
// ============================================================

/** Gün düzeyindeki tarihlerin tek doğrulama yeri. */
function normalizeDayDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null
}

/** Serbest metin için ortak sınır; not alanları roman değil bağlamdır. */
const MAX_NOTE_LENGTH = 2000

function normalizeText(value: unknown, max = MAX_NOTE_LENGTH): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) return null
  return trimmed
}

/**
 * Tarihin aktif akışın penceresinde olduğunu doğrular.
 *
 * `setPlanDateAction`'daki kontrolün aynısı ve aynı sebeple SUNUCUDA:
 * istemciye güvenilseydi öğrenci haftanın dışına yazıp kendi ekranında
 * haftayı boş gösterebilirdi.
 */
async function assertDateInActiveFlow(date: string) {
  const { student, workspaceId } = await getStudentContext()
  const supabase = await createClient()

  const { data: flow } = await supabase
    .from('weekly_flows')
    .select('starts_at, due_at')
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()

  if (!flow) return { error: 'Şu an açık bir çalışma haftan yok.' as const }

  const firstDay = localDateString(new Date(flow.starts_at as string))
  const lastDay = localDateString(new Date(flow.due_at as string))

  if (date < firstDay || date > lastDay) {
    return { error: 'Bu gün çalışma haftanın dışında.' as const }
  }

  return { student, workspaceId, supabase }
}

function revalidateHaftam() {
  revalidatePath('/student/haftam')
  revalidatePath('/student')
}

/**
 * Günün akademik notunu yazar; boş metin notu siler.
 *
 * GÜN BAŞINA TEK NOT (101): aynı güne ikinci kez yazmak öncekini
 * günceller. Gün notu bir günlük defteri değil, o günün bağlamı.
 */
export async function setDayNoteAction(date: string, text: string) {
  const day = normalizeDayDate(date)
  if (!day) return { error: 'Geçersiz tarih.' }

  const ctx = await assertDateInActiveFlow(day)
  if ('error' in ctx) return { error: ctx.error }
  const { student, workspaceId, supabase } = ctx

  const note = normalizeText(text)

  // BOŞ METİN = SİLME. Öğrenciye ayrı bir "notu sil" düğmesi öğretmek
  // yerine, alanı boşaltmak zaten o anlama geliyor.
  if (note === null) {
    const { error } = await supabase
      .from('student_day_notes')
      .delete()
      .eq('student_id', student.id)
      .eq('note_date', day)

    if (error) return { error: dbErrorToTr(error.message) }
    revalidateHaftam()
    return { success: true }
  }

  const { error } = await supabase
    .from('student_day_notes')
    .upsert(
      {
        workspace_id: workspaceId,
        student_id: student.id,
        note_date: day,
        note_text: note,
      },
      { onConflict: 'student_id,note_date' }
    )

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true }
}

/**
 * Çalışmaya özel akademik not (§12); boş metin notu siler.
 *
 * "Öğretmene gönder" diye bir adım YOK: notun resmî çalışma alanına
 * yazılmış olması zaten paylaşılmış olması demek.
 */
export async function setItemNoteAction(homeworkItemId: string, text: string) {
  const parsed = uuidSchema.safeParse(homeworkItemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { student, workspaceId } = await getStudentContext()
  const supabase = await createClient()

  const note = normalizeText(text)

  if (note === null) {
    const { error } = await supabase
      .from('homework_item_notes')
      .delete()
      .eq('homework_item_id', parsed.data)
      .eq('student_id', student.id)

    if (error) return { error: dbErrorToTr(error.message) }
    revalidateHaftam()
    return { success: true }
  }

  // Çalışmanın gerçekten bu öğrenciye ait olduğunu şema değil bu kontrol
  // söyler: `homework_item_notes` yalnız notun sahibini doğruluyor, notun
  // BAĞLANDIĞI çalışmayı değil. Aksi hâlde öğrenci başkasının çalışma
  // satırına not iliştirebilirdi.
  const { data: item } = await supabase
    .from('homework_items')
    .select('id, homework_batches!inner(student_id)')
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!item) return { error: 'Çalışma bulunamadı.' }

  const { error } = await supabase
    .from('homework_item_notes')
    .upsert(
      {
        workspace_id: workspaceId,
        student_id: student.id,
        homework_item_id: parsed.data,
        note_text: note,
      },
      { onConflict: 'homework_item_id' }
    )

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true }
}

/**
 * Kişisel ajandaya madde ekler (§14).
 *
 * BU VERİ ÖĞRETMENE VE VELİYE GÖRÜNMEZ ve hiçbir akademik istatistiğe
 * girmez. Koruma 101'deki RLS'te: o tablo için öğretmen/veli politikası
 * yazılmadı.
 */
export async function addPersonalItemAction(date: string, title: string) {
  const day = normalizeDayDate(date)
  if (!day) return { error: 'Geçersiz tarih.' }

  const ctx = await assertDateInActiveFlow(day)
  if ('error' in ctx) return { error: ctx.error }
  const { student, workspaceId, supabase } = ctx

  const text = normalizeText(title, 200)
  if (text === null) return { error: 'Madde metni boş olamaz.' }

  // Sıra: günün sonuna eklenir. Öğrencinin yazdığı sıra, onun için
  // anlamlı olan tek sıradır; sistem kendiliğinden yeniden sıralamaz.
  const { data: last } = await supabase
    .from('student_personal_items')
    .select('order_index')
    .eq('student_id', student.id)
    .eq('item_date', day)
    .order('order_index', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase.from('student_personal_items').insert({
    workspace_id: workspaceId,
    student_id: student.id,
    item_date: day,
    title: text,
    order_index: ((last?.order_index as number | undefined) ?? 0) + 1,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true }
}

/** Kişisel maddeyi işaretler / işareti kaldırır (§14). */
export async function togglePersonalItemAction(itemId: string, done: boolean) {
  const parsed = uuidSchema.safeParse(itemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { student } = await getStudentContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_personal_items')
    .update({ done })
    .eq('id', parsed.data)
    .eq('student_id', student.id)

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true }
}

/** Kişisel maddeyi siler (§14). */
export async function deletePersonalItemAction(itemId: string) {
  const parsed = uuidSchema.safeParse(itemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { student } = await getStudentContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_personal_items')
    .delete()
    .eq('id', parsed.data)
    .eq('student_id', student.id)

  if (error) return { error: dbErrorToTr(error.message) }

  revalidateHaftam()
  return { success: true }
}

// ============================================================
// AKADEMİK GÖREVLER — öğrenci tarafı (M1.0-03 §7-§8, 148)
//
// Tamamlandı tiki öğrencinin BEYANIDIR; öğretmen onayı yoktur. Güne
// yerleştirmek yalnız `planned_for_date`'i değiştirir, teslimi değil.
// Yetki kuralları (öğretmen görevi silinemez, takibe alınan kendi görevi
// silinemez) RPC'de.
// ============================================================

/** Görevi bir güne koyar; null → havuza geri döner. */
export async function setTaskPlanDateAction(taskId: string, date: string | null) {
  const parsed = uuidSchema.safeParse(taskId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const planDate = date === null || date === '' ? null : normalizeDayDate(date)
  if (date !== null && date !== '' && planDate === null) return { error: 'Geçersiz tarih.' }

  if (planDate !== null) {
    const ctx = await assertDateInActiveFlow(planDate)
    if ('error' in ctx) return { error: ctx.error }
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_academic_task_plan_date', { p_task_id: parsed.data, p_date: planDate })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}

export async function setTaskDoneAction(taskId: string, done: boolean) {
  const parsed = uuidSchema.safeParse(taskId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_academic_task_done', { p_task_id: parsed.data, p_done: done === true })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}

export async function toggleChecklistItemAction(itemId: string, done: boolean) {
  const parsed = uuidSchema.safeParse(itemId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const supabase = await createClient()
  const { error } = await supabase.rpc('toggle_checklist_item', { p_item_id: parsed.data, p_done: done === true })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}

/** Süre hedefi: haftalık toplam dakika (85/120). */
export async function setTaskMinutesAction(taskId: string, minutes: number) {
  const parsed = uuidSchema.safeParse(taskId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 6000) return { error: 'Geçerli bir dakika girin.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_academic_task_minutes', { p_task_id: parsed.data, p_minutes: minutes })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}

/**
 * Öğrencinin kendi çalışması: "[+ Çalışma ekle…]" (§8). Tarihsiz ve açık
 * doğar; tek uygun ders varsa istemci otomatik eşler, yoksa ders sorar.
 */
export async function addOwnTaskAction(input: {
  scopeId: string
  kind: 'gorev' | 'checklist' | 'sure'
  title: string
  targetMinutes?: number | null
  checklist?: string[]
}) {
  const scope = uuidSchema.safeParse(input.scopeId)
  if (!scope.success) return { error: 'Ders seçin.' }
  const title = (input.title ?? '').trim()
  if (!title || title.length > 300) return { error: 'Çalışma metni 1-300 karakter olmalı.' }
  if (!['gorev', 'checklist', 'sure'].includes(input.kind)) return { error: 'Geçersiz tür.' }
  if (input.kind === 'sure' && !(input.targetMinutes && input.targetMinutes > 0)) {
    return { error: 'Süre için dakika girin.' }
  }

  const { student } = await getStudentContext()
  const supabase = await createClient()
  const { error } = await supabase.rpc('create_academic_task', {
    p_student_id: student.id,
    p_scope_id: scope.data,
    p_kind: input.kind,
    p_title: title,
    p_target_minutes: input.kind === 'sure' ? input.targetMinutes : null,
    p_checklist: input.kind === 'checklist' ? (input.checklist ?? []).slice(0, 30) : null,
    p_undated: true,
    p_due_at: null,
    p_publish: false,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}

export async function updateOwnTaskAction(taskId: string, title: string) {
  const parsed = uuidSchema.safeParse(taskId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const text = (title ?? '').trim()
  if (!text || text.length > 300) return { error: 'Çalışma metni 1-300 karakter olmalı.' }
  const supabase = await createClient()
  const { error } = await supabase.rpc('update_academic_task', {
    p_task_id: parsed.data,
    p_title: text,
    p_target_minutes: null,
    p_undated: null,
    p_due_at: null,
    p_clear_due: false,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}

export async function deleteOwnTaskAction(taskId: string) {
  const parsed = uuidSchema.safeParse(taskId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_academic_task', { p_task_id: parsed.data })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidateHaftam()
  return { success: true }
}
