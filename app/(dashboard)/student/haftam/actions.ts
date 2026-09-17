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
