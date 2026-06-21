'use server'

import { createClient } from '@/lib/supabase/server'
import { hashToken } from '@/lib/invite'
import { redirect } from 'next/navigation'

export async function acceptInviteAction(token: string, fullName: string, email: string, password: string) {
  const tokenHash = await hashToken(token)
  const supabase = await createClient()

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password })

  if (signUpError && signUpError.message !== 'User already registered') {
    return { error: signUpError.message }
  }

  let authUserId = signUpData?.user?.id

  // Session yoksa (e-posta onayı gerekiyor ya da kullanıcı zaten kayıtlı) → giriş yap
  if (!signUpData?.session || !authUserId) {
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) {
      if (signInError.message.toLowerCase().includes('email not confirmed')) {
        return { error: 'E-posta adresinizi onaylayın, ardından tekrar deneyin.' }
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

  if (rpcError) return { error: rpcError.message }

  redirect('/')
}
