'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { authErrorToTr } from '@/lib/auth-errors'
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  passwordResetSchema,
  firstIssue,
} from '@/lib/validation'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'

export async function loginAction(email: string, password: string) {
  const parsed = loginSchema.safeParse({ email, password })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // Kaba kuvvet savunması (050). Doğrulamadan SONRA, kimlik denemesinden
  // ÖNCE: biçimsel olarak geçersiz girdiler sayacı boşa harcamasın.
  const limit = await checkRateLimit('login', parsed.data.email)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfterSeconds) }

  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: authErrorToTr(error.message) }

  redirect('/')
}

export async function registerAction(
  fullName: string,
  email: string,
  password: string,
  workspaceName?: string
) {
  const parsed = registerSchema.safeParse({ fullName, email, password, workspaceName })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // Otomatik hesap üretimine karşı. Her kayıt bir workspace açtığı için
  // sınırsız kayıt, sınırsız kiracı demek.
  const limit = await checkRateLimit('register', parsed.data.email)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfterSeconds) }

  const supabase = await createClient()

  const { data: authData, error: signUpError } = await supabase.auth.signUp({ email, password })
  if (signUpError) return { error: authErrorToTr(signUpError.message) }
  if (!authData.user) return { error: 'Kullanıcı oluşturulamadı.' }

  const { error: rpcError } = await supabase.rpc('create_teacher_workspace', {
    p_auth_user_id: authData.user.id,
    p_full_name: fullName,
    p_email: email,
    p_workspace_name: workspaceName || null,
  })
  if (rpcError) return { error: authErrorToTr(rpcError.message) }

  redirect('/')
}

/**
 * Şifre sıfırlama bağlantısı gönderir.
 *
 * Kullanıcı numaralandırmasını (email enumeration) engellemek için sonuç
 * HER DURUMDA aynı: adres kayıtlı olmasa da, Supabase hata dönse de aynı
 * nötr mesaj verilir. Tek istisna hız sınırı — orada kullanıcıya beklemesi
 * gerektiğini söylemek gerçekten yardımcı.
 */
export async function requestPasswordResetAction(email: string) {
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // E-posta bombardımanına karşı. Sınır mesajı kullanıcı numaralandırması
  // yaratmaz: adres kayıtlı olsun olmasın aynı şekilde tetiklenir.
  const limit = await checkRateLimit('passwordReset', parsed.data.email)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfterSeconds) }

  const supabase = await createClient()

  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback?next=/update-password`
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, { redirectTo })

  if (error && /rate limit|too many/i.test(error.message)) {
    return { error: authErrorToTr(error.message) }
  }

  return { success: true }
}

export async function updatePasswordAction(password: string, passwordConfirm: string) {
  const parsed = passwordResetSchema.safeParse({ password, passwordConfirm })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()

  // Oturum yoksa (bağlantının süresi dolmuş, callback atlanmış) güncelleme
  // yapılamaz; kullanıcıyı yeni bağlantı istemeye yönlendir.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Sıfırlama bağlantısı geçersiz veya süresi dolmuş. Yeni bir bağlantı isteyin.' }
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: authErrorToTr(error.message) }

  redirect('/')
}

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
