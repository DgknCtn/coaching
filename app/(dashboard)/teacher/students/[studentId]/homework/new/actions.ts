'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { homeworkBatchSchema, firstIssue, uuidSchema } from '@/lib/validation'
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
  note?: string,
  dueAt?: string
) {
  const parsed = homeworkBatchSchema.safeParse({
    workspaceId,
    termId,
    studentId,
    dueDate,
    dueAt,
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
    // M1.0-01: teslim gün + saat. due_date RPC'de bunun yerel gününden türer.
    p_due_at: parsed.data.dueAt ?? null,
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
  //
  // KISMİ BAŞARI (B06): bağlama DÜŞERSE ödev yine yayınlanmıştır. Öğretmen
  // "Yayınla"ya tekrar basarsa İKİNCİ bir ödev oluşurdu; bu yüzden
  // `batchId` dönüyor ve arayüz yalnız bağlamayı yeniden deniyor
  // (retryAttachBatchToFlowAction). attach_batch_to_flow tekrar çağrıya
  // dayanıklı: aynı partiyi aynı akışa yeniden yazar.
  const attach = batchId ? await attachAndExplain(supabase, batchId) : undefined

  const flowWarning = attach?.warning
  const attachFailed = attach?.failed ?? false

  // Ödev yayınlama ürünün merkezi eylemi: hem denetim kaydına hem
  // kullanım sayacına girer.
  await logAudit(supabase, {
    workspaceId: sessionWorkspaceId,
    action: 'homework.publish',
    entityType: 'student',
    entityId: parsed.data.studentId,
    detail: {
      itemCount: parsed.data.items.length,
      dueDate: parsed.data.dueDate,
      dueAt: parsed.data.dueAt ?? null,
    },
  })
  await trackFeature(supabase, sessionWorkspaceId, 'homework.publish')


  revalidatePath(`/teacher/students/${studentId}`)
  revalidatePath(`/teacher/students/${studentId}/haftalik-akis`)
  revalidatePath('/teacher')
  return { success: true, flowWarning, attachFailed, batchId }
}

type Supabase = Awaited<ReturnType<typeof createClient>>

/**
 * Bağlar ve SONUCU AÇIKLAR. İki "bağlanmadı" nedeni ayrı söyleniyor:
 * eskiden tek cümle ikisini birden sayıyordu ve öğretmen hangisinin
 * geçerli olduğunu bilemiyordu.
 */
async function attachAndExplain(
  supabase: Supabase,
  batchId: string
): Promise<{ failed: boolean; warning?: string }> {
  const { data: attachedFlowId, error } = await supabase.rpc('attach_batch_to_flow', {
    p_batch_id: batchId,
  })
  if (error) {
    console.error('[weekly-flow] ödev aktif akışa bağlanamadı:', error.message)
    return {
      failed: true,
      warning:
        'Ödev yayınlandı ama haftalık akışa bağlanamadı. Yeniden yayınlamayın — yalnız bağlamayı tekrar deneyin.',
    }
  }
  if (attachedFlowId !== null) return { failed: false }

  // RPC null döndü: ya aktif akış yok ya da son teslim kapanışı aşıyor
  // (Senaryo B). Hangisi olduğu partinin öğrencisinin akışından okunuyor.
  const { data: batch } = await supabase
    .from('homework_batches')
    .select('student_id')
    .eq('id', batchId)
    .maybeSingle()
  const { data: flow, error: flowError } = batch
    ? await supabase
        .from('weekly_flows')
        .select('id')
        .eq('student_id', batch.student_id)
        .eq('status', 'active')
        .maybeSingle()
    : { data: null, error: null }

  if (!flowError && batch && !flow) {
    return {
      failed: false,
      warning: 'Ödev yayınlandı. Öğrencinin açık bir çalışma haftası olmadığı için bir haftaya bağlanmadı.',
    }
  }
  if (!flowError && flow) {
    return {
      failed: false,
      warning:
        'Ödev yayınlandı. Son teslimi aktif haftanın kapanışından sonra olduğu için bu haftanın toplamına eklenmedi; Yaklaşan Ödevler’de bekliyor.',
    }
  }
  return {
    failed: false,
    warning: 'Ödev yayınlandı ama bu haftanın toplamına eklenmedi.',
  }
}

/**
 * Yalnız bağlamayı yeniden dener; YENİ ÖDEV OLUŞTURMAZ (B06).
 */
export async function retryAttachBatchToFlowAction(studentId: string, batchId: string) {
  const parsedBatch = uuidSchema.safeParse(batchId)
  const parsedStudent = uuidSchema.safeParse(studentId)
  if (!parsedBatch.success) return { error: firstIssue(parsedBatch.error) }
  if (!parsedStudent.success) return { error: firstIssue(parsedStudent.error) }

  // Oturum kontrolü; yetki RPC'nin içinde de doğrulanıyor.
  await getTeacherContext()
  const supabase = await createClient()
  const result = await attachAndExplain(supabase, parsedBatch.data)
  if (result.failed) return { error: 'Bağlama yine başarısız oldu. Biraz sonra tekrar deneyin.' }

  revalidatePath(`/teacher/students/${parsedStudent.data}`)
  revalidatePath(`/teacher/students/${parsedStudent.data}/haftalik-akis`)
  revalidatePath('/teacher')
  return { success: true, flowWarning: result.warning }
}
