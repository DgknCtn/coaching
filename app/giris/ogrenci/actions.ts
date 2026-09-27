'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimitMessage } from '@/lib/rate-limit'
import {
  studentLoginConfigured,
  studentLoginEmail,
  studentLoginPassword,
  USERNAME_PATTERN,
} from '@/lib/student-login'

const schema = z.object({
  username: z.string().trim().toLowerCase().regex(USERNAME_PATTERN, 'Kullanıcı adını kontrol et.'),
  pin: z.string().trim().regex(/^[0-9]{6}$/, 'PIN 6 haneli olmalı.'),
})

// Kullanıcı adı yok, PIN yanlış, kilitli, giriş kapalı — hepsi AYNI mesaj:
// hangisi olduğunu söylemek kullanıcı adlarını numaralandırmaya açardı.
const GENERIC = 'Kullanıcı adı ya da PIN hatalı. Birkaç yanlış denemeden sonra giriş 15 dakika kilitlenir.'

export async function studentCodeLoginAction(username: string, pin: string) {
  if (!studentLoginConfigured()) return { error: 'Bu giriş yöntemi şu an kullanılamıyor.' }
  const parsed = schema.safeParse({ username, pin })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? GENERIC }

  // Uygulama düzeyinde hız sınırı; asıl kilit veritabanında (119).
  const limit = await checkRateLimit('login', `kod:${parsed.data.username}`)
  if (!limit.allowed) return { error: rateLimitMessage(limit.retryAfterSeconds) }

  const supabase = await createClient()
  const { data: ok, error } = await supabase.rpc('verify_student_pin', {
    p_username: parsed.data.username,
    p_pin: parsed.data.pin,
  })
  if (error || ok !== true) return { error: GENERIC }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: studentLoginEmail(parsed.data.username),
    password: studentLoginPassword(parsed.data.username),
  })
  if (signInError) return { error: GENERIC }

  redirect('/')
}
