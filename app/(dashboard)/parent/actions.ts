'use server'

// VELİ YAZMA YOLLARI.
//
// Veli paneli kural olarak GÖRÜNTÜLEMEDİR: buradan ödev verilemez,
// hedef değiştirilemez. Tek istisna, R7-04 §8'in "Veli 'Ödeme yaptım'
// bildirimi gönderebilir" maddesi — ve o da bir KAYIT değil, öğretmenin
// bakacağı bir TALEP. Para defterinin sahibi öğretmendir (066); velinin
// bildirimi `finance_payments`'a satır yazsaydı defter dışarıdan
// değiştirilebilir olurdu.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getParentContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

const noticeSchema = z.object({
  studentId: uuidSchema,
  monthStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz ay.'),
  note: z.string().trim().max(500, 'Not en fazla 500 karakter olabilir.').optional(),
})

export async function createPaymentNoticeAction(
  studentId: string,
  monthStart: string,
  note?: string
) {
  const parsed = noticeSchema.safeParse({ studentId, monthStart, note })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { supabase, linkedStudents } = await getParentContext()

  // Bağlı öğrenci kontrolü RPC'de de var (`is_parent_of_student`).
  // Burada tekrarlanması, kullanıcıya veritabanı hatası yerine anlaşılır
  // bir cümle döndürmek için.
  if (!linkedStudents.some((l) => l.students.id === parsed.data.studentId)) {
    return { error: 'Bu öğrenci size bağlı değil.' }
  }

  const { error } = await supabase.rpc('create_payment_notice', {
    p_student_id: parsed.data.studentId,
    p_month_start: parsed.data.monthStart,
    p_note: parsed.data.note || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/parent')
  return { success: true }
}
