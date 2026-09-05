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
): Promise<{ error?: string; entries?: FinanceEntry[] }> {
  const parsedId = uuidSchema.safeParse(studentId)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }

  const ctx = await assertOwner()
  if (!ctx) return DENIED

  const supabase = await createClient()

  const [{ data: lessons, error: lessonError }, { data: payments, error: paymentError }] =
    await Promise.all([
      supabase
        .from('finance_lessons')
        .select('id, lesson_date, quantity, unit_price_kurus, note')
        .eq('student_id', parsedId.data)
        .order('lesson_date', { ascending: false })
        .limit(100),
      supabase
        .from('finance_payments')
        .select('id, paid_on, amount_kurus, method, note')
        .eq('student_id', parsedId.data)
        .order('paid_on', { ascending: false })
        .limit(100),
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

  return { entries }
}

/**
 * Yanlış girilen kaydı siler.
 *
 * Düzeltilemeyen bir defter, kullanılmayan bir defterdir: ilk hatalı
 * kayıttan sonra öğretmen ekrana güvenmeyi bırakır ve kendi Excel'ine
 * döner.
 */
export async function deleteFinanceEntryAction(
  kind: 'lesson' | 'payment',
  id: string
): Promise<FinanceActionResult> {
  const parsedId = uuidSchema.safeParse(id)
  if (!parsedId.success) return { error: firstIssue(parsedId.error) }
  if (kind !== 'lesson' && kind !== 'payment') return { error: 'Geçersiz kayıt türü.' }

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
