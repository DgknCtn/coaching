'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

// Supabase/GoTrue İngilizce hata mesajlarını kullanıcıya uygun Türkçe
// mesajlara çevirir; eşleşme yoksa genel bir mesaj döner (ham DB/auth
// mesajlarını sızdırmamak için).
function authErrorToTr(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.'
  if (m.includes('email not confirmed')) return 'E-posta adresiniz henüz doğrulanmamış.'
  if (m.includes('user already registered') || m.includes('already been registered'))
    return 'Bu e-posta ile zaten bir hesap mevcut.'
  if (m.includes('password should be')) return 'Şifre en az 6 karakter olmalı.'
  if (m.includes('rate limit') || m.includes('too many'))
    return 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.'
  if (m.includes('captcha')) return 'Doğrulama başarısız. Lütfen tekrar deneyin.'
  return 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'
}

export async function loginAction(email: string, password: string) {
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

export async function logoutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
