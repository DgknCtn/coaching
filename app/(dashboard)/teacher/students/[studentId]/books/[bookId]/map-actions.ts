'use server'

// Kaynak Haritası toplu akademik işlemleri (R6-03).
//
// Üç işlem de 028'deki RPC'lere delege eder. Yetki kontrolü, idempotenlik ve
// "hangi statü hangi işleme uygun" kuralı orada, tek yerde durur; burası
// yalnız girdiyi doğrular ve sonucu Türkçeleştirir.
//
// Not: "Onayla" ile "Tamamlandı Olarak İşle" aynı işlem DEĞİLDİR. İlki
// öğrenci gönderimini onaylar, ikincisi eğitmenin doğrudan akademik kayıt
// yetkisidir; ikisi test_completions.source alanında ayrışır.

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { uuidSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'

// Sayfa takipli kitapta bir bölüm yüzlerce sayfa taşıyabilir; sınır cömert
// ama sınırsız değil (target-actions.ts'teki unitIds sınırıyla aynı).
const bulkSchema = z.object({
  assignmentId: uuidSchema,
  unitIds: z.array(uuidSchema).min(1, 'En az bir çalışma seçin.').max(2000),
})

type BulkInput = { assignmentId: string; unitIds: string[] }

/** İşlem sonrası harita, sayaçlar ve tempo anında güncellenmeli (§11). */
function revalidate(studentId: string, bookId: string) {
  revalidatePath(`/teacher/students/${studentId}/books/${bookId}`)
  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath('/teacher/tasks')
  revalidatePath('/teacher')
}

async function callBulkRpc(
  fn: 'complete_units_manually' | 'approve_units_bulk' | 'revert_units_completion',
  studentId: string,
  bookId: string,
  input: BulkInput
) {
  const parsed = bulkSchema.safeParse(input)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc(fn, {
    p_student_book_assignment_id: parsed.data.assignmentId,
    p_book_test_ids: parsed.data.unitIds,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidate(studentId, bookId)
  return { success: true, result: (data ?? {}) as Record<string, number> }
}

/**
 * "Tamamlandı Olarak İşle" — eğitmenin kendi yetkisiyle seçilen çalışmaları
 * tamamlanmış kabul etmesi. Öğrenci sisteme eklenmeden önce bitirdiği,
 * göndermeyi unuttuğu veya süresi geçtikten sonra tamamladığı işler için.
 */
export async function completeUnitsManuallyAction(
  studentId: string,
  bookId: string,
  input: BulkInput
) {
  return callBulkRpc('complete_units_manually', studentId, bookId, input)
}

/**
 * "Onayla" — yalnız Onay Bekliyor durumundaki öğrenci gönderimlerinin
 * normal öğretmen onayı. Uygun olmayan öğeler sessizce atlanır.
 */
export async function approveUnitsAction(studentId: string, bookId: string, input: BulkInput) {
  return callBulkRpc('approve_units_bulk', studentId, bookId, input)
}

/**
 * "Tamamlanmayı Geri Al" — yanlış veya artık geçerli olmayan completion
 * kaydını kontrollü biçimde geri alır. Hard delete yapılmaz; kayıt
 * 'reverted' işaretlenir ve geçmiş izi korunur.
 */
export async function revertUnitsAction(studentId: string, bookId: string, input: BulkInput) {
  return callBulkRpc('revert_units_completion', studentId, bookId, input)
}
