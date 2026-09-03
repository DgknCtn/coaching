'use server'

import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/invite'
import { authErrorToTr, inviteErrorToTr } from '@/lib/auth-errors'
import { acceptInviteSchema, firstIssue } from '@/lib/validation'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import { redirect } from 'next/navigation'

export async function acceptInviteAction(token: string, fullName: string, email: string, password: string) {
  const parsed = acceptInviteSchema.safeParse({ fullName, email, password })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  // Token 256 bit entropiye sahip, yani tahmin edilemez; sınır asıl olarak
  // bu uç üzerinden yapılan hesap oluşturma denemelerini kısıtlar.
  const limit = await checkRateLimit('inviteAccept', parsed.data.email)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfterSeconds) }

  const tokenHash = await hashToken(token)
  const supabase = await createClient()

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })

  if (signUpError && signUpError.message !== 'User already registered') {
    return { error: authErrorToTr(signUpError.message) }
  }

  let authUserId = signUpData?.user?.id

  // Bu e-postayla zaten bir hesap var mı? signUp'ın yuttuğumuz hatası tek
  // bilgi kaynağı — aşağıdaki mesajı doğru seçmek için tutuluyor.
  const accountExists = signUpError?.message === 'User already registered'

  // Session yoksa (e-posta onayı gerekiyor ya da kullanıcı zaten kayıtlı) → giriş yap
  if (!signUpData?.session || !authUserId) {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      if (signInError.message.toLowerCase().includes('email not confirmed')) {
        return { error: 'E-posta adresinizi onaylayın, ardından tekrar deneyin.' }
      }
      // ÖNCEKİ DAVRANIŞ: her iki durumda da "E-posta veya şifre hatalı."
      // deniyordu. Hesabı olan davetli bunu görünce davetin mi bozuk
      // olduğunu yoksa şifresini mi yanlış yazdığını anlayamıyordu ve
      // şifre sıfırlamaya giden bir yol da yoktu.
      if (accountExists) {
        return {
          error:
            'Bu e-postayla zaten bir hesabınız var. Mevcut şifrenizle devam edin ya da şifrenizi sıfırlayın.',
          passwordResetHref: '/forgot-password',
        }
      }
      return { error: 'E-posta veya şifre hatalı.' }
    }
    authUserId = signInData.user?.id
  }

  if (!authUserId) return { error: 'Kimlik doğrulama başarısız.' }

  const { error: rpcError } = await supabase.rpc('accept_invitation', {
    p_token_hash: tokenHash,
    p_auth_user_id: authUserId,
    p_full_name: fullName,
    p_email: email,
  })

  if (rpcError) return { error: inviteErrorToTr(rpcError.message) }

  redirect('/')
}
