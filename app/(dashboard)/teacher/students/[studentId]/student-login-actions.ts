'use server'

import { revalidatePath } from 'next/cache'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr } from '@/lib/auth-errors'
import { firstIssue, uuidSchema } from '@/lib/validation'
import { generateToken, hashToken } from '@/lib/invite'
import {
  generatePin,
  generateUsername,
  studentLoginConfigured,
  studentLoginEmail,
  studentLoginPassword,
} from '@/lib/student-login'

// E-POSTASIZ ÖĞRENCİ GİRİŞİ — öğretmen tarafı (10a · 119).
//
// İLK OLUŞTURMA üç adım, hepsi mevcut kurallardan geçer (service key yok):
//   1. Öğrencinin auth hesabı, ÇEREZSİZ ayrı bir istemciyle açılır —
//      öğretmenin oturumu etkilenmez. Proje e-posta doğrulamasını
//      istemediği için (mailer_autoconfirm) oturum hemen gelir.
//   2. Öğretmen o sistem adresine bir öğrenci daveti keser; öğrencinin
//      yeni oturumu daveti accept_invitation ile kabul eder. Profil,
//      students.profile_id ve üyelik 024'teki TEK kuraldan yazılır.
//   3. Kullanıcı adı + PIN hash'i kaydedilir.
// PIN yalnız bu yanıtta döner; bir daha gösterilmez (hash tutuluyor).
//
// YENİLEME: yalnız 3. adım — yeni PIN, aynı kullanıcı adı.

type Result =
  | { error: string }
  | { success: true; username: string; pin: string; created: boolean }

export async function issueStudentLoginAction(studentId: string): Promise<Result> {
  const sid = uuidSchema.safeParse(studentId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!studentLoginConfigured()) {
    return {
      error:
        'Kullanıcı adı + PIN girişi yapılandırılmamış (STUDENT_LOGIN_SECRET / STUDENT_LOGIN_EMAIL_DOMAIN).',
    }
  }

  const { supabase, workspaceId, profile } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, profile_id')
    .eq('id', sid.data)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!student) return { error: 'Öğrenci bulunamadı.' }

  const { data: info, error: infoError } = await supabase.rpc('student_login_code_info', {
    p_student_id: sid.data,
  })
  if (infoError) return { error: dbErrorToTr(infoError.message) }
  const existing = ((info ?? []) as { username: string }[])[0]

  const pin = generatePin()

  // ---------- YENİLEME ----------
  if (existing) {
    const { error } = await supabase.rpc('set_student_login_code', {
      p_student_id: sid.data,
      p_username: existing.username,
      p_pin: pin,
    })
    if (error) return { error: dbErrorToTr(error.message) }
    revalidatePath(`/teacher/students/${sid.data}`)
    return { success: true, username: existing.username, pin, created: false }
  }

  // E-postayla hesabı olan öğrenciye ikinci bir hesap açılmaz.
  if (student.profile_id) {
    return { error: 'Bu öğrencinin zaten bir hesabı var; e-posta ya da Google ile giriş yapıyor.' }
  }

  // ---------- İLK OLUŞTURMA ----------
  const plain = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // 1) Hesap. Kullanıcı adı çakışırsa (çok düşük olasılık) yenisi denenir.
  let username = ''
  let authUserId: string | null = null
  for (let attempt = 0; attempt < 3 && !authUserId; attempt++) {
    username = generateUsername(student.full_name as string)
    const { data, error } = await plain.auth.signUp({
      email: studentLoginEmail(username),
      password: studentLoginPassword(username),
      options: { data: { full_name: student.full_name, signup_intent: 'student_code' } },
    })
    if (error?.message === 'User already registered') continue
    if (error) return { error: `Öğrenci hesabı açılamadı: ${error.message}` }
    if (!data.session) {
      return {
        error:
          'Öğrenci hesabı açıldı ama oturum gelmedi: projede e-posta doğrulaması açık. Bu giriş türü doğrulama kapalıyken çalışır.',
      }
    }
    authUserId = data.user?.id ?? null
  }
  if (!authUserId) return { error: 'Kullanıcı adı üretilemedi, tekrar deneyin.' }

  // 2) Davet + kabul. Öğrenci başına tek bekleyen öğrenci daveti (116).
  const token = generateToken()
  const email = studentLoginEmail(username)
  await supabase
    .from('invitations')
    .update({ status: 'revoked' })
    .eq('workspace_id', workspaceId)
    .eq('student_id', sid.data)
    .eq('role', 'student')
    .eq('status', 'pending')
  const { error: invError } = await supabase.from('invitations').insert({
    workspace_id: workspaceId,
    invited_email: email,
    role: 'student',
    student_id: sid.data,
    token_hash: await hashToken(token),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    status: 'pending',
    created_by_profile_id: profile.id,
  })
  if (invError) return { error: dbErrorToTr(invError.message) }

  const { error: acceptError } = await plain.rpc('accept_invitation', {
    p_token_hash: await hashToken(token),
    p_auth_user_id: authUserId,
    p_full_name: student.full_name,
    p_email: email,
  })
  if (acceptError) return { error: `Hesap öğrenciye bağlanamadı: ${acceptError.message}` }

  // 3) Kullanıcı adı + PIN.
  const { error: codeError } = await supabase.rpc('set_student_login_code', {
    p_student_id: sid.data,
    p_username: username,
    p_pin: pin,
  })
  if (codeError) return { error: dbErrorToTr(codeError.message) }

  revalidatePath(`/teacher/students/${sid.data}`)
  return { success: true, username, pin, created: true }
}

export async function disableStudentLoginAction(studentId: string) {
  const sid = uuidSchema.safeParse(studentId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  const { supabase } = await getTeacherContext()
  const { error } = await supabase.rpc('disable_student_login_code', { p_student_id: sid.data })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${sid.data}`)
  return { success: true }
}
