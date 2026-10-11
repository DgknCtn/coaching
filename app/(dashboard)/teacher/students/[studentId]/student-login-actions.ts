'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr } from '@/lib/auth-errors'
import { firstIssue, uuidSchema } from '@/lib/validation'
import { generateToken, hashToken } from '@/lib/invite'
import { createServiceClient } from '@/lib/supabase/service'
import {
  generatePin,
  generateUsername,
  studentLoginConfigured,
  studentLoginEmail,
  studentLoginPassword,
} from '@/lib/student-login'

// E-POSTASIZ GİRİŞ — öğretmen tarafı (10a · 119 · 138).
//
// Öğrenci de veli de kullanıcı adı + PIN alabiliyor; kod hesaba
// (profiles.id) bağlı (138).
//
// İLK OLUŞTURMA üç adım, hepsi mevcut kurallardan geçer (service key yok):
//   1. Hesap, ÇEREZSİZ ayrı bir istemciyle açılır — öğretmenin oturumu
//      etkilenmez. Proje e-posta doğrulamasını istemediği için
//      (mailer_autoconfirm) oturum hemen gelir.
//   2. Öğretmen o sistem adresine bir davet keser; yeni oturum daveti
//      accept_invitation ile kabul eder. Profil, üyelik ve (öğrencide)
//      students.profile_id ya da (velide) parent_student_links 024'teki
//      TEK kuraldan yazılır.
//   3. Kullanıcı adı + PIN hash'i kaydedilir.
// PIN yalnız bu yanıtta döner; bir daha gösterilmez (hash tutuluyor).
//
// YENİLEME: yalnız 3. adım — yeni PIN, aynı kullanıcı adı.

type Result =
  | { error: string }
  | { success: true; username: string; pin: string; created: boolean }

export interface MemberLoginRow {
  profile_id: string
  role: 'student' | 'parent'
  full_name: string
  has_code: boolean
  username: string | null
  active: boolean | null
  locked: boolean | null
}

const NOT_CONFIGURED =
  'Kullanıcı adı + PIN girişi yapılandırılmamış (STUDENT_LOGIN_SECRET / STUDENT_LOGIN_EMAIL_DOMAIN).'

type TeacherCtx = Awaited<ReturnType<typeof getTeacherContext>>

async function memberLogins(
  supabase: TeacherCtx['supabase'],
  studentId: string
): Promise<{ rows: MemberLoginRow[] } | { error: string }> {
  const { data, error } = await supabase.rpc('student_member_logins', { p_student_id: studentId })
  if (error) return { error: dbErrorToTr(error.message) }
  return { rows: (data ?? []) as MemberLoginRow[] }
}

async function createCodeAccount(
  ctx: TeacherCtx,
  { role, studentId, fullName }: { role: 'student' | 'parent'; studentId: string; fullName: string }
): Promise<Result> {
  const { supabase, workspaceId, profile } = ctx
  const pin = generatePin()

  const plain = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  )

  // 1) Hesap. Kullanıcı adı çakışırsa (çok düşük olasılık) yenisi denenir.
  let username = ''
  let authUserId: string | null = null
  for (let attempt = 0; attempt < 3 && !authUserId; attempt++) {
    username = generateUsername(fullName)
    const { data, error } = await plain.auth.signUp({
      email: studentLoginEmail(username),
      password: studentLoginPassword(username),
      options: {
        data: {
          full_name: fullName,
          signup_intent: role === 'student' ? 'student_code' : 'parent_code',
        },
      },
    })
    if (error?.message === 'User already registered') continue
    if (error) return { error: `Hesap açılamadı: ${error.message}` }
    if (!data.session) {
      return {
        error:
          'Hesap açıldı ama oturum gelmedi: projede e-posta doğrulaması açık. Bu giriş türü doğrulama kapalıyken çalışır.',
      }
    }
    authUserId = data.user?.id ?? null
  }
  if (!authUserId) return { error: 'Kullanıcı adı üretilemedi, tekrar deneyin.' }

  // 2) Davet + kabul. Öğrenci başına tek bekleyen öğrenci daveti (116);
  //    veli davetleri yalnız aynı e-postadakini iptal eder — sistem adresi
  //    yeni olduğu için iptal edilecek bir şey yok.
  const token = generateToken()
  const email = studentLoginEmail(username)
  if (role === 'student') {
    await supabase
      .from('invitations')
      .update({ status: 'revoked' })
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .eq('role', 'student')
      .eq('status', 'pending')
  }
  const { error: invError } = await supabase.from('invitations').insert({
    workspace_id: workspaceId,
    invited_email: email,
    role,
    student_id: studentId,
    token_hash: await hashToken(token),
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    status: 'pending',
    created_by_profile_id: profile.id,
  })
  if (invError) return { error: dbErrorToTr(invError.message) }

  const { data: accepted, error: acceptError } = await plain.rpc('accept_invitation', {
    p_token_hash: await hashToken(token),
    p_auth_user_id: authUserId,
    p_full_name: fullName,
    p_email: email,
  })
  if (acceptError) return { error: `Hesap bağlanamadı: ${acceptError.message}` }
  const profileId = (accepted as { profile_id?: string } | null)?.profile_id
  if (!profileId) return { error: 'Hesap bağlanamadı: profil bulunamadı.' }

  // 3) Kullanıcı adı + PIN.
  const { error: codeError } = await supabase.rpc('set_member_login_code', {
    p_profile_id: profileId,
    p_role: role,
    p_username: username,
    p_pin: pin,
  })
  if (codeError) return { error: dbErrorToTr(codeError.message) }

  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true, username, pin, created: true }
}

const CONSENT_REQUIRED =
  'Önce velinin onayını aldığınızı işaretleyin: öğrenci reşit değilse verileri veli onayıyla işlenir.'

/**
 * VELİ ONAYI TEYİDİ (144). Bir öğrenci için İLK giriş bilgisi verilirken
 * (öğrenciye ya da veliye) koç, velinin onayını aldığını teyit eder; teyit
 * öğrenci satırına bir kez yazılır. PIN yenileme bu kapıdan geçmez.
 */
async function ensureGuardianConsent(
  ctx: TeacherCtx,
  studentId: string,
  consent: boolean
): Promise<{ error: string } | null> {
  const { data, error } = await ctx.supabase
    .from('students')
    .select('guardian_consent_at')
    .eq('id', studentId)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()
  if (error) return { error: dbErrorToTr(error.message) }
  if (!data) return { error: 'Öğrenci bulunamadı.' }
  if ((data as { guardian_consent_at: string | null }).guardian_consent_at) return null
  if (!consent) return { error: CONSENT_REQUIRED }

  const { error: updateError } = await ctx.supabase
    .from('students')
    .update({
      guardian_consent_at: new Date().toISOString(),
      guardian_consent_by_profile_id: ctx.profile.id,
    })
    .eq('id', studentId)
    .eq('workspace_id', ctx.workspaceId)
  if (updateError) return { error: dbErrorToTr(updateError.message) }
  return null
}

/** Öğrenci: ilk oluşturma ya da PIN yenileme. */
export async function issueStudentLoginAction(studentId: string, consent = false): Promise<Result> {
  const sid = uuidSchema.safeParse(studentId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!studentLoginConfigured()) return { error: NOT_CONFIGURED }

  const ctx = await getTeacherContext()
  const { supabase, workspaceId } = ctx

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, profile_id')
    .eq('id', sid.data)
    .eq('workspace_id', workspaceId)
    .maybeSingle()
  if (!student) return { error: 'Öğrenci bulunamadı.' }

  const logins = await memberLogins(supabase, sid.data)
  if ('error' in logins) return logins
  const existing = logins.rows.find((r) => r.role === 'student' && r.has_code)

  if (existing) return renew(ctx, sid.data, existing)

  const consentError = await ensureGuardianConsent(ctx, sid.data, consent)
  if (consentError) return consentError

  // E-posta/Google ile hesabı olan öğrenciye ikinci bir hesap açılmaz;
  // AYNI hesabın giriş yolu kullanıcı adı + PIN'e çevrilir.
  if (student.profile_id) {
    const row = logins.rows.find((r) => r.role === 'student' && r.profile_id === student.profile_id)
    if (!row) return { error: 'Öğrencinin hesabı bulunamadı.' }
    return convertToCode(ctx, sid.data, row)
  }

  return createCodeAccount(ctx, {
    role: 'student',
    studentId: sid.data,
    fullName: student.full_name as string,
  })
}

const parentNameSchema = z
  .string()
  .trim()
  .min(2, 'Velinin adını yazın.')
  .max(100, 'Ad en fazla 100 karakter olabilir.')

/** Veli: yeni bir veli hesabı + kullanıcı adı + PIN (138). */
export async function issueParentLoginAction(
  studentId: string,
  parentName: string,
  consent = false
): Promise<Result> {
  const sid = uuidSchema.safeParse(studentId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  const name = parentNameSchema.safeParse(parentName)
  if (!name.success) return { error: firstIssue(name.error) }
  if (!studentLoginConfigured()) return { error: NOT_CONFIGURED }

  const ctx = await getTeacherContext()
  const { data: student } = await ctx.supabase
    .from('students')
    .select('id')
    .eq('id', sid.data)
    .eq('workspace_id', ctx.workspaceId)
    .maybeSingle()
  if (!student) return { error: 'Öğrenci bulunamadı.' }

  const consentError = await ensureGuardianConsent(ctx, sid.data, consent)
  if (consentError) return consentError

  return createCodeAccount(ctx, { role: 'parent', studentId: sid.data, fullName: name.data })
}

async function renew(ctx: TeacherCtx, studentId: string, row: MemberLoginRow): Promise<Result> {
  const pin = generatePin()
  const { error } = await ctx.supabase.rpc('set_member_login_code', {
    p_profile_id: row.profile_id,
    p_role: row.role,
    p_username: row.username,
    p_pin: pin,
  })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${studentId}`)
  return { success: true, username: row.username as string, pin, created: false }
}

/**
 * Bu öğrenciye bağlı bir hesabın (öğrencinin kendisi ya da velisi) kod
 * satırı. Hesap kimliği istemciden gelir; yalnız BU öğrencinin listesinde
 * varsa kabul edilir.
 */
async function findCodeRow(
  ctx: TeacherCtx,
  studentId: string,
  profileId: string
): Promise<{ row: MemberLoginRow } | { error: string }> {
  const logins = await memberLogins(ctx.supabase, studentId)
  if ('error' in logins) return logins
  const row = logins.rows.find((r) => r.profile_id === profileId && r.has_code)
  if (!row) return { error: 'Bu hesabın kullanıcı adı + PIN girişi yok.' }
  return { row }
}

/**
 * E-POSTA/GOOGLE HESABINI KULLANICI ADI + PIN'E ÇEVİR.
 *
 * Google ile giriş kaldırıldı; o yolla katılmış öğrenci ve velinin şifresi
 * yok. Yeni hesap açmak verisini (mesajlar, bildirimler, bağlar) geride
 * bırakırdı. Onun yerine AYNI auth hesabının adresi sistem adresine,
 * şifresi sunucu sırrından türetilen şifreye çevrilir — tıpkı ilk
 * oluşturmadaki gibi. Bu, servis anahtarı gerektiren tek öğretmen
 * eylemi (bkz. lib/supabase/service.ts, istisna 2).
 *
 * SIRA: önce auth hesabı, sonra kod satırı. Kod adımı düşerse hesabın
 * kodu yoktur (has_code=false) ve öğretmen aynı düğmeyle yeniden dener;
 * her deneme adresi yeni kullanıcı adına göre baştan yazar. Ters sıra,
 * auth adımı düştüğünde kullanıcı adı sabitlenmiş ama adresi tutmayan
 * bir kod satırı bırakırdı.
 */
async function convertToCode(ctx: TeacherCtx, studentId: string, row: MemberLoginRow): Promise<Result> {
  const service = createServiceClient()
  const { data: prof } = await service
    .from('profiles')
    .select('auth_user_id')
    .eq('id', row.profile_id)
    .maybeSingle()
  const authUserId = (prof as { auth_user_id: string | null } | null)?.auth_user_id
  if (!authUserId) return { error: 'Hesap bulunamadı.' }

  const pin = generatePin()
  for (let attempt = 0; attempt < 3; attempt++) {
    const username = generateUsername(row.full_name)
    const email = studentLoginEmail(username)

    const { error: authError } = await service.auth.admin.updateUserById(authUserId, {
      email,
      password: studentLoginPassword(username),
      email_confirm: true,
    })
    if (authError?.code === 'email_exists') continue
    if (authError) return { error: `Hesap çevrilemedi: ${authError.message}` }

    // Kullanıcı adı tekilliği burada da yakalanır (uniq_member_login_username).
    const { error: codeError } = await ctx.supabase.rpc('set_member_login_code', {
      p_profile_id: row.profile_id,
      p_role: row.role,
      p_username: username,
      p_pin: pin,
    })
    if (codeError?.code === '23505') continue
    if (codeError) return { error: dbErrorToTr(codeError.message) }

    // Profil adresi de güncellenir: girişte profil e-postadan çözülüyor.
    await service.from('profiles').update({ email }).eq('id', row.profile_id)

    revalidatePath(`/teacher/students/${studentId}`)
    return { success: true, username, pin, created: true }
  }
  return { error: 'Kullanıcı adı üretilemedi, tekrar deneyin.' }
}

/** E-posta/Google ile katılmış veli (ya da öğrenci) için kullanıcı adı + PIN. */
export async function convertMemberLoginAction(
  studentId: string,
  profileId: string,
  consent = false
): Promise<Result> {
  const sid = uuidSchema.safeParse(studentId)
  const pid = uuidSchema.safeParse(profileId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!pid.success) return { error: firstIssue(pid.error) }
  if (!studentLoginConfigured()) return { error: NOT_CONFIGURED }

  const ctx = await getTeacherContext()
  // Yetki: hesap BU öğrencinin listesinde olmalı (RPC öğretmen rolünü
  // veritabanında doğrular).
  const logins = await memberLogins(ctx.supabase, sid.data)
  if ('error' in logins) return logins
  const row = logins.rows.find((r) => r.profile_id === pid.data)
  if (!row) return { error: 'Hesap bu öğrenciye bağlı değil.' }
  if (row.has_code) return renew(ctx, sid.data, row)
  const consentError = await ensureGuardianConsent(ctx, sid.data, consent)
  if (consentError) return consentError
  return convertToCode(ctx, sid.data, row)
}

/** Veli (ya da öğrenci) için yeni PIN. */
export async function renewMemberLoginAction(studentId: string, profileId: string): Promise<Result> {
  const sid = uuidSchema.safeParse(studentId)
  const pid = uuidSchema.safeParse(profileId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!pid.success) return { error: firstIssue(pid.error) }
  if (!studentLoginConfigured()) return { error: NOT_CONFIGURED }

  const ctx = await getTeacherContext()
  const found = await findCodeRow(ctx, sid.data, pid.data)
  if ('error' in found) return found
  return renew(ctx, sid.data, found.row)
}

export async function disableMemberLoginAction(studentId: string, profileId: string) {
  const sid = uuidSchema.safeParse(studentId)
  const pid = uuidSchema.safeParse(profileId)
  if (!sid.success) return { error: firstIssue(sid.error) }
  if (!pid.success) return { error: firstIssue(pid.error) }

  const ctx = await getTeacherContext()
  const found = await findCodeRow(ctx, sid.data, pid.data)
  if ('error' in found) return found

  const { error } = await ctx.supabase.rpc('disable_member_login_code', { p_profile_id: pid.data })
  if (error) return { error: dbErrorToTr(error.message) }
  revalidatePath(`/teacher/students/${sid.data}`)
  return { success: true }
}
