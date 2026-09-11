'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { homeworkBatchSchema, firstIssue } from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'
import { trackFeature } from '@/lib/telemetry'

interface HomeworkItem {
  student_book_assignment_id: string
  book_test_id: string
}

export async function createHomeworkBatchAction(
  workspaceId: string,
  termId: string,
  studentId: string,
  dueDate: string,
  title: string | undefined,
  items: HomeworkItem[],
  note?: string
) {
  const parsed = homeworkBatchSchema.safeParse({
    workspaceId,
    termId,
    studentId,
    dueDate,
    title,
    note,
    items,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // workspaceId istemciden de geliyor (imza korunuyor) ama RPC'ye
  // OTURUMUN workspace'i gönderilir. Önceden istemcinin değeri doğrudan
  // iletiliyordu; tek savunma katmanı RPC'nin içindeki rol kontrolüydü.
  const { workspaceId: sessionWorkspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('create_homework_batch', {
    p_workspace_id: sessionWorkspaceId,
    p_academic_term_id: termId,
    p_student_id: studentId,
    p_due_date: dueDate,
    p_title: title || null,
    // R6-05: Ödev Notu. homework_batches.description 001'den beri vardı ve
    // kullanılmıyordu; yeni kolon açmak yerine o alan kullanılır.
    p_description: parsed.data.note || null,
    p_items: items,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  // R7/05 kabul #4: "Ödev Planlama varsayılan olarak aktif Haftalık
  // Akış'a yayın yapmalı."
  //
  // Bağlama yayından SONRA ve AYRI yapılıyor, çünkü aidiyet yayının ön
  // koşulu değil: aktif akışı olmayan öğrenciye ödev verilememesi
  // saçma olurdu. Bağlanamazsa (akış yok ya da son teslim akışın
  // kapanışını aşıyor — Senaryo B) parti akışsız kalır; kaybolmaz,
  // yalnız bu haftanın toplamına karışmaz (kabul #7).
  //
  // Karar RPC'nin içinde: aidiyet kuralı tek yerde kalsın diye. Burada
  // tarih karşılaştırılsaydı arayüzle sunucu bir gün ayrışırdı.
  const batchId = (data as { homework_batch_id?: string } | null)?.homework_batch_id

  // Bağlanıp bağlanmadığı KULLANICIYA SÖYLENİR.
  //
  // Önceden sonuç yalnız console'a yazılıyordu: son teslimi akışın
  // kapanışını aşan bir ödev sessizce akışsız kalıyor, öğretmen ise
  // "yayınlandı" görüp haftanın toplamına eklendiğini sanıyordu. Yayın
  // BAŞARILIDIR — bu yüzden hata değil, uyarı olarak dönüyor.
  let flowWarning: string | undefined
  if (batchId) {
    const { data: attachedFlowId, error: attachError } = await supabase.rpc(
      'attach_batch_to_flow',
      { p_batch_id: batchId }
    )
    if (attachError) {
      console.error('[weekly-flow] ödev aktif akışa bağlanamadı:', attachError.message)
      flowWarning = 'Ödev yayınlandı ancak haftalık akışa bağlanamadı.'
    } else if (attachedFlowId === null) {
      // RPC null döndürdü: ya aktif akış yok ya da son teslim kapanışı
      // aşıyor (Senaryo B). İkisi de kural gereği, ama ikisi de
      // öğretmenin ekranda gördüğü toplamı etkiliyor.
      flowWarning =
        'Ödev yayınlandı. Son teslimi aktif haftanın kapanışını aştığı için bu haftanın toplamına eklenmedi; açık akış yoksa da bir haftaya bağlanmaz.'
    }
  }

  // Ödev yayınlama ürünün merkezi eylemi: hem denetim kaydına hem
  // kullanım sayacına girer.
  await logAudit(supabase, {
    workspaceId: sessionWorkspaceId,
    action: 'homework.publish',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: { itemCount: parsed.data.items.length, dueDate: parsed.data.dueDate },
  })
  await trackFeature(supabase, sessionWorkspaceId, 'homework.publish')


  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath(`/teacher/students/${studentId}/haftalik-akis`)
  revalidatePath('/teacher')
  return { success: true, flowWarning }
}
