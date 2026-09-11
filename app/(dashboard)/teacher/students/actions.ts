'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import {
  studentSchema,
  assignBookSchema,
  uuidSchema,
  firstIssue,
  SERVICE_DRAFT_OPTIONS,
} from '@/lib/validation'
import { dbErrorToTr } from '@/lib/auth-errors'
import { logAudit } from '@/lib/audit'
import { trackFeature } from '@/lib/telemetry'

export async function createStudentAction(
  fullName: string,
  email: string | undefined,
  phone: string | undefined,
  gradeLevel: string | undefined,
  examType: string | undefined,
  lessonType: string | undefined,
  notes: string | undefined,
  /**
   * Kayıt anında seçilen hizmetler (R7-04 §5).
   *
   * Tek seçimli "Çalışma Modeli"nin yerini aldı: bir öğrencinin aynı
   * anda hem grup dersi hem bireysel koçluğu olabilir. Seçilenler PASİF
   * açılır — gün/saat henüz bilinmiyor ve pasif satır oturum üretmez.
   */
  serviceDrafts: string[] = []
) {
  const parsed = studentSchema.safeParse({ fullName, email, phone, gradeLevel, examType, lessonType, notes })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // İstemciden gelen anahtarlar sabit listeye karşı SÜZÜLÜR, doğrudan
  // yazılmaz: bilinmeyen bir anahtar CHECK'e takılıp öğrenci kaydını da
  // yarıda bırakırdı.
  const drafts = SERVICE_DRAFT_OPTIONS.filter((o) => serviceDrafts.includes(o.value))

  const { workspaceId, profile } = await getTeacherContext()
  const supabase = await createClient()

  // parsed.data YAZILIR, HAM ARGÜMAN DEĞİL: şema trim uyguluyor ama
  // yazma yolu onu atlıyordu — baştaki/sondaki boşluklar veritabanına
  // olduğu gibi giriyor ve "  Ahmet" ile "Ahmet" iki ayrı isme dönüşüyordu.
  const v = parsed.data

  const { data, error } = await supabase.from('students').insert({
    workspace_id: workspaceId,
    primary_teacher_profile_id: profile.id,
    full_name: v.fullName,
    email: v.email,
    phone: v.phone,
    grade_level: v.gradeLevel || null,
    exam_type: v.examType || null,
    lesson_type: v.lessonType || null,
    notes: v.notes || null,
    status: 'active',
  }).select('id').single()

  if (error) return { error: dbErrorToTr(error.message) }

  // HİZMET TASLAKLARI ÖĞRENCİDEN SONRA YAZILIR ve hatası öğrenciyi
  // geri almaz: öğrenci kaydı zaten oluştu, taslak satırlar ekrandan
  // tekrar eklenebilir. Tersi — hizmet yazılamadı diye kaydı iptal
  // etmek — kullanıcının doldurduğu formu boşa çıkarırdı.
  if (drafts.length > 0) {
    const today = new Date().toISOString().slice(0, 10)
    await supabase.from('student_services').insert(
      drafts.map((d) => ({
        workspace_id: workspaceId,
        student_id: data.id,
        kind: d.kind,
        participation: 'birebir' as const,
        medium: d.medium,
        group_id: null,
        // Yer tutucu düzen: pasif satır oturum üretmediği için bu
        // değerler hiçbir yerde görünmez; öğretmen Ders & Görüşmeler'de
        // gerçek gün/saati girip aktifleştirir.
        weekday: 1,
        start_time: '09:00',
        planned_duration_minutes: 60,
        start_date: today,
        status: 'passive' as const,
        created_by_profile_id: profile.id,
      }))
    )
  }

  // R6-07: Notlar sekmesi artık academic_notes'u gösteriyor. students.notes
  // geriye dönük uyum için yazılmaya devam ediyor ama TEK BAŞINA yeterli
  // değil — buraya yazılan not hiçbir ekranda görünmezdi. Bu yüzden ilk not
  // aynı zamanda bir akademik not olarak açılır.
  if (v.notes) {
    await supabase.rpc('add_academic_note', {
      p_student_id: data.id,
      p_note_text: v.notes,
      p_pinned: false,
    })
  }

  await trackFeature(supabase, workspaceId, 'student.create')

  revalidatePath('/teacher/students')
  redirect(`/teacher/students/${data.id}`)
}

export async function updateStudentAction(
  studentId: string,
  fullName: string,
  email: string | undefined,
  phone: string | undefined,
  gradeLevel: string | undefined,
  examType: string | undefined,
  lessonType: string | undefined,
  notes: string | undefined
) {
  const parsed = studentSchema.safeParse({ fullName, email, phone, gradeLevel, examType, lessonType, notes })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  // R6-07: notes artık düzenleme formunda YOKTUR (notlar academic_notes'ta
  // yönetiliyor). Bu yüzden `notes` tanımsız geldiğinde eski değeri EZMEYİZ —
  // aksi halde düzenleme, geriye dönük uyum için tutulan kolonu sessizce
  // temizlerdi.
  const v = parsed.data

  const { error } = await supabase
    .from('students')
    .update({
      full_name: v.fullName,
      email: v.email,
      phone: v.phone,
      grade_level: v.gradeLevel || null,
      exam_type: v.examType || null,
      lesson_type: v.lessonType || null,
      ...(notes === undefined ? {} : { notes: v.notes || null }),
    })
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function assignBookAction(
  studentId: string,
  bookId: string,
  startDate: string | undefined,
  targetEndDate: string | undefined
) {
  const parsed = assignBookSchema.safeParse({ studentId, bookId, startDate, targetEndDate })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId, activeTerm } = await getTeacherContext()
  const supabase = await createClient()

  if (!activeTerm) return { error: 'Aktif dönem bulunamadı' }

  const { error } = await supabase.rpc('assign_book_to_student', {
    p_workspace_id: workspaceId,
    p_student_id: studentId,
    p_book_id: bookId,
    p_academic_term_id: activeTerm.id,
    p_start_date: startDate || null,
    p_target_end_date: targetEndDate || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function removeBookAssignmentAction(assignmentId: string, studentId: string) {
  const parsed = uuidSchema.safeParse(assignmentId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('student_book_assignments')
    .update({ status: 'archived' })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true }
}

export async function archiveStudentAction(studentId: string) {
  const parsed = uuidSchema.safeParse(studentId)
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId } = await getTeacherContext()
  const supabase = await createClient()

  const { error } = await supabase
    .from('students')
    .update({ status: 'archived' })
    .eq('id', parsed.data)
    .eq('workspace_id', workspaceId)

  if (error) return { error: dbErrorToTr(error.message) }

  // Arşivleme öğrenciyi tüm listelerden çıkarır ve (Faz 4'te) faturaya da
  // yansıyacak; kim yaptığı kayda geçmeli.
  await logAudit(supabase, {
    workspaceId,
    action: 'student.archive',
    entityType: 'student',
    entityId: parsed.data,
  })

  revalidatePath('/teacher/students')
  redirect('/teacher/students')
}
