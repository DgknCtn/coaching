'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { PAYMENT_METHODS } from '@/lib/finance'

// FİNANS SUNUCU EYLEMLERİ.
//
// ============================================================
// YETKİ İKİ KEZ KONTROL EDİLİR VE BU FAZLALIK DEĞİL
//
// Buradaki `assertOwner`, kullanıcıya DÜZGÜN BİR HATA göstermek için.
// Asıl savunma veritabanında: her RPC girişinde has_workspace_role
// (066) kontrol ediyor ve tablolarda RLS 'owner' rolüne kilitli. Bu
// dosyadaki kontrol kaldırılsa bile hiçbir veri sızmaz — yalnız hata
// mesajı çirkinleşir.
//
// TUTARLAR SUNUCUDA KURUŞ TAM SAYISI OLARAK ALINIR. İstemci "1.500,50"
// gibi bir metni kendisi çevirip gönderiyor (lib/finance.ts); burada
// yeniden doğrulanıyor, çünkü istemcinin gönderdiği hiçbir sayıya
// güvenilmez.
//
// DERS ÜCRETİ HİÇ GÖNDERİLMEZ: ders kaydı eklerken fiyat parametresi
// yok, RPC onu tablodan okuyor. Fiyatı istemciden almak, öğrenciye
// istenen tutarı borç yazabilen bir uç açardı.
// ============================================================

/**
 * Eylemlerin ortak dönüş tipi.
 *
 * AÇIKÇA YAZILIYOR çünkü çıkarsanan tip `{error} | {success}` birleşimi
 * olurdu ve çağıran taraf `res.error` okuyamazdı — her kullanımda tip
 * daraltması yazmak gerekirdi. Tek bir arayüz, üç eylemin de aynı
 * şekilde ele alınmasını sağlıyor.
 */
export interface FinanceActionResult {
  error?: string
  success?: boolean
}

/** Kuruş: negatif olamaz, tam sayı olmalı, saçma büyüklükte olamaz. */
const kurusSchema = z
  .number({ message: 'Geçerli bir tutar girin.' })
  .int('Tutar tam sayı olmalı.')
  .min(0, 'Tutar negatif olamaz.')
  .max(100_000_000, 'Tutar çok yüksek.')

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir tarih girin.')

const feeSchema = z.object({
  studentId: uuidSchema,
  perLessonKurus: kurusSchema,
  note: z.string().trim().max(500, 'Not en fazla 500 karakter olabilir.').optional().or(z.literal('')),
})

const lessonSchema = z.object({
  studentId: uuidSchema,
  lessonDate: isoDate,
  quantity: z
    .number({ message: 'Ders sayısı sayı olmalı.' })
    .int()
    .min(1, 'En az bir ders girin.')
    .max(20, 'Tek kayıtta en fazla 20 ders girilebilir.'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

const paymentSchema = z.object({
  studentId: uuidSchema,
  paidOn: isoDate,
  // Sıfır liralık tahsilat diye bir şey yok; kayıt olarak da anlamsız.
  amountKurus: kurusSchema.min(1, 'Tutar sıfırdan büyük olmalı.'),
  method: z.enum(PAYMENT_METHODS, { message: 'Geçersiz ödeme yöntemi.' }),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

/**
 * Çalışma alanı sahibi mi?
 *
 * Finans, aynı çalışma alanındaki diğer öğretmenlere kapalı (066):
 * bir ailenin ödeme yapıp yapmadığını bilmek, ders veren herkesin işi
 * değil.
 */
async function assertOwner() {
  const ctx = await getTeacherContext()
  if (ctx.role !== 'owner') return null
  return ctx
}

const DENIED = { error: 'Finans kayıtlarını yalnız çalışma alanı sahibi yönetebilir.' }

export async function setStudentFeeAction(input: {
  studentId: string
  perLessonKurus: number
  note?: string
}): Promise<FinanceActionResult> {
  const parsed = feeSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_student_fee', {
    p_student_id: parsed.data.studentId,
    p_per_lesson_kurus: parsed.data.perLessonKurus,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

export async function addLessonAction(input: {
  studentId: string
  lessonDate: string
  quantity: number
  note?: string
}): Promise<FinanceActionResult> {
  const parsed = lessonSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_finance_lesson', {
    p_student_id: parsed.data.studentId,
    p_lesson_date: parsed.data.lessonDate,
    p_quantity: parsed.data.quantity,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

export async function addPaymentAction(input: {
  studentId: string
  paidOn: string
  amountKurus: number
  method: string
  note?: string
}): Promise<FinanceActionResult> {
  const parsed = paymentSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_finance_payment', {
    p_student_id: parsed.data.studentId,
    p_paid_on: parsed.data.paidOn,
    p_amount_kurus: parsed.data.amountKurus,
    p_method: parsed.data.method,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

/** Bir hareket satırı — ders ya da tahsilat. */
export interface FinanceEntry {
  id: string
  kind: 'lesson' | 'payment'
  /** Ders tarihi ya da ödeme tarihi (ISO). */
  date: string
  /** Ders satırında tahakkuk, tahsilat satırında ödenen tutar (kuruş). */
  amountKurus: number
  /** Yalnız ders satırında dolu. */
  quantity?: number
  /** Yalnız tahsilat satırında dolu. */
  method?: string
  note: string | null
  /** Görüşmeler'den otomatik gelen ders satırı (085). Silinse de oturum
   *  yeniden kaydedilirse geri yazılabilir; arayüz uyarır. */
  auto?: boolean
}

/** Velinin "ödeme yaptım" bildirimi (086) — para kaydı değil. */
export interface PaymentNotice {
  id: string
  monthStart: string
  status: 'pending' | 'confirmed' | 'rejected'
  note: string | null
  createdAt: string
}

/**
 * Bir öğrencinin hareket dökümü — ders ve tahsilat birlikte, tarihe göre.
 *
 * İKİSİ TEK LİSTEDE: "neden bu kadar borçlu" sorusunun cevabı, iki ayrı
 * listeyi kafada birleştirmeyi gerektirmemeli. Bakiye zaten ikisinin
 * farkı; dökümü de aynı eksende okunmalı.
 */
export async function listStudentEntriesAction(
  studentId: string
): Promise<{ error?: string; entries?: FinanceEntry[]; notices?: PaymentNotice[] }> {
  const parsedId = uuidSchema.safeParse(studentId)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()

  const [
    { data: lessons, error: lessonError },
    { data: payments, error: paymentError },
    { data: notices },
  ] =
    await Promise.all([
      supabase
        .from('finance_lessons')
        .select('id, lesson_date, quantity, unit_price_kurus, note, service_session_id')
        .eq('student_id', parsedId.data)
        .order('lesson_date', { ascending: false })
        .limit(100),
      supabase
        .from('finance_payments')
        .select('id, paid_on, amount_kurus, method, note')
        .eq('student_id', parsedId.data)
        .order('paid_on', { ascending: false })
        .limit(100),
      supabase
        .from('parent_payment_notices')
        .select('id, month_start, status, note, created_at')
        .eq('student_id', parsedId.data)
        .order('month_start', { ascending: false })
        .limit(50),
    ])

  if (lessonError || paymentError) {
    return { error: dbErrorToTr((lessonError ?? paymentError)!.message) }
  }

  const entries: FinanceEntry[] = [
    ...(lessons ?? []).map((l) => ({
      id: l.id as string,
      kind: 'lesson' as const,
      date: l.lesson_date as string,
      amountKurus: Number(l.quantity ?? 1) * Number(l.unit_price_kurus ?? 0),
      quantity: Number(l.quantity ?? 1),
      note: (l.note as string | null) ?? null,
      auto: Boolean(l.service_session_id),
    })),
    ...(payments ?? []).map((p) => ({
      id: p.id as string,
      kind: 'payment' as const,
      date: p.paid_on as string,
      amountKurus: Number(p.amount_kurus ?? 0),
      method: (p.method as string | null) ?? 'nakit',
      note: (p.note as string | null) ?? null,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date))

  return {
    entries,
    notices: (notices ?? []).map((n) => ({
      id: n.id as string,
      monthStart: n.month_start as string,
      status: n.status as PaymentNotice['status'],
      note: (n.note as string | null) ?? null,
      createdAt: n.created_at as string,
    })),
  }
}

// ============================================================
// FİNANS TEMİZLİĞİ (137)
// ============================================================

/** Ders ücreti tanımını kaldırır; geçmiş tahakkuklar kalır. */
export async function deleteStudentFeeAction(studentId: string): Promise<FinanceActionResult> {
  const parsedId = uuidSchema.safeParse(studentId)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_student_fee', { p_student_id: parsedId.data })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

/** Velinin ödeme bildirimini siler (deftere yazılmış tahsilat ayrı kalır). */
export async function deletePaymentNoticeAction(noticeId: string): Promise<FinanceActionResult> {
  const parsedId = uuidSchema.safeParse(noticeId)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_payment_notice', { p_notice_id: parsedId.data })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

/**
 * Bir öğrencinin TÜM finans kayıtlarını siler (öğrenci kalır).
 * Ad birebir eşleşmesi RPC'de de denetlenir.
 */
export async function purgeStudentFinanceAction(
  studentId: string,
  confirmName: string
): Promise<FinanceActionResult> {
  const parsedId = uuidSchema.safeParse(studentId)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  if (typeof confirmName !== 'string' || confirmName.length > 200) {
    return { error: 'Onay için öğrencinin adını yazın.' }
  }
  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('purge_student_finance', {
    p_student_id: parsedId.data,
    p_confirm_name: confirmName,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

/**
 * Yanlış girilen kaydı siler.
 *
 * Düzeltilemeyen bir defter, kullanılmayan bir defterdir: ilk hatalı
 * kayıttan sonra öğretmen ekrana güvenmeyi bırakır ve kendi Excel'ine
 * döner.
 */
export async function deleteFinanceEntryAction(
  kind: 'lesson' | 'payment' | 'expense',
  id: string
): Promise<FinanceActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  if (kind !== 'lesson' && kind !== 'payment' && kind !== 'expense') {
    return { error: 'Geçersiz kayıt türü.' }
  }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_finance_entry', {
    p_kind: kind,
    p_id: parsedId.data,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/teacher/finans')
  return { success: true }
}

// ============================================================
// FİNANS V1 (M1.0-02, migration 139-141)
// ============================================================
//
// Ücretlendirme modeli ve fiyatlar TARİHSELDİR: hiçbir eylem eski bir
// fiyatın üzerine yazmaz, yeni sürüm ekler. Tahakkuk birim × o tarihte
// geçerli fiyattır ve veritabanında üretilir; buradan tutar
// gönderilmez (devir/elle tahakkuk hariç — o, öğretmenin beyanıdır).

function revalidateFinance(studentId?: string) {
  revalidatePath('/teacher/finans')
  if (studentId) {
    revalidatePath(`/teacher/finans/${studentId}`)
    revalidatePath(`/teacher/students/${studentId}/gorusmeler`)
  }
}

const financeModelSchema = z
  .object({
    studentId: uuidSchema,
    model: z.enum(['aylik_sabit', 'ders_basi'], { message: 'Ücretlendirme modeli seçin.' }),
    collectionTiming: z.enum(['ay_basi', 'ay_sonu', 'ders_sonrasi']),
    validFrom: isoDate,
    mainAmountKurus: kurusSchema,
    extraAmountKurus: kurusSchema.nullable().optional(),
  })
  .refine(
    (v) =>
      v.model === 'aylik_sabit'
        ? v.collectionTiming === 'ay_basi' || v.collectionTiming === 'ay_sonu'
        : v.collectionTiming === 'ders_sonrasi' || v.collectionTiming === 'ay_sonu',
    { message: 'Bu model için geçersiz tahsilat zamanı.' }
  )

/**
 * Hizmet Modeli: Aylık Sabit (aylık tutar + ek ders fiyatı) ya da Ders
 * Başı (birim fiyatı), geçerlilik tarihinden itibaren. Model sonradan
 * tanımlandıysa o güne dek fiyatsız kalmış gerçekleşmiş oturumlara
 * tahakkuk açılır (var olan satırlar değişmez).
 */
export async function setFinanceModelAction(
  input: z.input<typeof financeModelSchema>
): Promise<FinanceActionResult> {
  const parsed = financeModelSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('set_finance_model', {
    p_student_id: v.studentId,
    p_model: v.model,
    p_collection_timing: v.collectionTiming,
    p_valid_from: v.validFrom,
    p_main_amount_kurus: v.mainAmountKurus,
    p_extra_amount_kurus: v.model === 'aylik_sabit' ? (v.extraAmountKurus ?? null) : null,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  // Eksik tahakkukları tamamla; hata ekranı durdurmaz, model kaydedildi.
  const { error: backfillError } = await supabase.rpc('backfill_missing_accruals', {
    p_student_id: v.studentId,
  })
  if (backfillError) {
    console.error('[finans] eksik tahakkuk tamamlanamadı:', backfillError.message)
  }

  revalidateFinance(v.studentId)
  return { success: true }
}

const priceVersionSchema = z.object({
  studentId: uuidSchema,
  priceType: z.enum(['aylik', 'ek_ders', 'ders_basi']),
  amountKurus: kurusSchema,
  validFrom: isoDate,
})

/** Tek fiyat türü için yeni sürüm (ör. yalnız ek ders fiyatı değişti). */
export async function addPriceVersionAction(
  input: z.input<typeof priceVersionSchema>
): Promise<FinanceActionResult> {
  const parsed = priceVersionSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_price_version', {
    p_student_id: v.studentId,
    p_price_type: v.priceType,
    p_amount_kurus: v.amountKurus,
    p_valid_from: v.validFrom,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  await supabase.rpc('backfill_missing_accruals', { p_student_id: v.studentId })
  revalidateFinance(v.studentId)
  return { success: true }
}

/** Hatalı girilmiş fiyat sürümünü kaldırır; geçmiş tahakkuk satırları kendi tutarını korur. */
export async function deletePriceVersionAction(
  studentId: string,
  versionId: string
): Promise<FinanceActionResult> {
  const parsed = z
    .object({ studentId: uuidSchema, versionId: uuidSchema })
    .safeParse({ studentId, versionId })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('delete_price_version', { p_version_id: versionId })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidateFinance(studentId)
  return { success: true }
}

const manualAccrualSchema = z.object({
  studentId: uuidSchema,
  kind: z.enum(['devir', 'manuel']),
  amountKurus: kurusSchema.min(1, 'Tutar sıfırdan büyük olmalı.'),
  date: isoDate,
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

/**
 * Devreden bakiye ya da diğer elle tahakkuk — ör. "8 Mart tarihinden
 * kalan = 3.800 lira" (görseldeki not).
 */
export async function addManualAccrualAction(
  input: z.input<typeof manualAccrualSchema>
): Promise<FinanceActionResult> {
  const parsed = manualAccrualSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_manual_accrual', {
    p_student_id: v.studentId,
    p_kind: v.kind,
    p_amount_kurus: v.amountKurus,
    p_date: v.date,
    p_note: v.note || null,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidateFinance(v.studentId)
  return { success: true }
}

const paymentV2Schema = z.object({
  studentId: uuidSchema,
  paidOn: isoDate,
  amountKurus: kurusSchema.min(1, 'Tutar sıfırdan büyük olmalı.'),
  method: z.enum(PAYMENT_METHODS, { message: 'Geçersiz ödeme yöntemi.' }),
  account: z.string().trim().max(80).optional().or(z.literal('')),
  /** 'YYYY-MM' — boşsa bakiyeye (en eski açık alacaktan) uygulanır. */
  appliesToMonth: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional()
    .or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

/** Tahsilat ekleme (M1.0-02 §7). */
export async function addPaymentV2Action(
  input: z.input<typeof paymentV2Schema>
): Promise<FinanceActionResult> {
  const parsed = paymentV2Schema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_finance_payment_v2', {
    p_student_id: v.studentId,
    p_paid_on: v.paidOn,
    p_amount_kurus: v.amountKurus,
    p_method: v.method,
    p_account: v.account || null,
    p_applies_to_month: v.appliesToMonth ? `${v.appliesToMonth}-01` : null,
    p_note: v.note || null,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidateFinance(v.studentId)
  return { success: true }
}

const expenseSchema = z.object({
  category: z.enum(['sabit', 'ogrenci', 'oturum', 'kesinti']),
  amountKurus: kurusSchema.min(1, 'Tutar sıfırdan büyük olmalı.'),
  spentOn: isoDate,
  studentId: uuidSchema.optional().nullable().or(z.literal('')),
  sessionId: uuidSchema.optional().nullable().or(z.literal('')),
  paymentId: uuidSchema.optional().nullable().or(z.literal('')),
  note: z.string().trim().max(500).optional().or(z.literal('')),
})

/** Gider / kesinti (M1.0-02 §8). Çalışma alanı kimliği oturumdan gelir. */
export async function addExpenseAction(
  input: z.input<typeof expenseSchema>
): Promise<FinanceActionResult> {
  const parsed = expenseSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }
  const v = parsed.data

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  if ((v.category === 'ogrenci' || v.category === 'oturum') && !v.studentId) {
    return { error: 'Öğrenciye bağlı gider için öğrenci seçin.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc('add_expense', {
    p_workspace_id: ctx.workspaceId,
    p_category: v.category,
    p_amount_kurus: v.amountKurus,
    p_spent_on: v.spentOn,
    p_student_id: v.studentId || null,
    p_session_id: v.sessionId || null,
    p_payment_id: v.paymentId || null,
    p_note: v.note || null,
  })
  if (error) return { error: dbErrorToTr(error.message) }

  revalidateFinance(v.studentId || undefined)
  return { success: true }
}
