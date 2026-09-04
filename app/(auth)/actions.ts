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
import { readReferralCode, clearReferralCode } from '@/lib/referral'

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

  // Ad ve çalışma alanı adı KULLANICI ÜST VERİSİNE yazılır.
  //
  // Neden: e-posta doğrulaması açıldığında signUp oturum DÖNDÜRMEZ, yani
  // create_teacher_workspace'in auth.uid() kontrolü (024) başarısız olur ve
  // workspace kurulamaz. Bu iki bilgi üst veriye konursa, kullanıcı
  // e-postasını doğrulayıp ilk kez giriş yaptığında workspace o anda
  // kurulabilir (app/page.tsx). Doğrulama kapalıyken davranış aynen
  // korunur: oturum hemen geldiği için workspace burada kurulur.
  const { data: authData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        workspace_name: parsed.data.workspaceName || null,
      },
    },
  })
  if (signUpError) return { error: authErrorToTr(signUpError.message) }
  if (!authData.user) return { error: 'Kullanıcı oluşturulamadı.' }

  // Oturum yoksa e-posta doğrulaması bekleniyor demektir.
  if (!authData.session) {
    return { needsVerification: true, email: parsed.data.email }
  }

  const { error: rpcError } = await supabase.rpc('create_teacher_workspace', {
    p_auth_user_id: authData.user.id,
    p_full_name: parsed.data.fullName,
    p_email: parsed.data.email,
    p_workspace_name: parsed.data.workspaceName || null,
    // Partner atfı çerezden gelir (059). Geçersiz kod sunucuda sessizce
    // yok sayılır; kullanıcı yanlış bir bağlantıdan geldi diye kaydı
    // reddetmek bize müşteri kaybettirir.
    p_partner_code: await readReferralCode(),
  })
  if (rpcError) return { error: authErrorToTr(rpcError.message) }

  // Atıf kullanıldı; çerez silinir. Silinmezse aynı tarayıcıdan açılan
  // ikinci hesap da aynı partnere yazılırdı.
  await clearReferralCode()

  // Kayıttan sonra lisans adımına gidiliyor. ZORUNLU DEĞİL: sayfada
  // "önce ücretsiz deneyeceğim" bağlantısı var (058).
  redirect('/kurulum/odeme')
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

/**
 * Google ile giriş / kayıt.
 *
 * ============================================================
 * NEDEN AYRI BİR CALLBACK GEREKMİYOR
 *
 * `/auth/callback` zaten sağlayıcıdan bağımsız: gelen `code` değerini
 * `exchangeCodeForSession` ile oturuma çeviriyor. Bu, e-posta
 * bağlantılarında da OAuth'ta da aynı PKCE akışı. Yeni bir rota
 * eklemek, aynı işi ikinci kez yazmak olurdu.
 *
 * ÇALIŞMA ALANI BURADA KURULMAZ: OAuth'ta kayıt formu yok, dolayısıyla
 * ad ve çalışma alanı adı elimizde değil. Kurulum, kullanıcı oturumla
 * `/` adresine döndüğünde yapılıyor (app/page.tsx) — orada Google'ın
 * verdiği ad üst veriden okunuyor.
 *
 * PARTNER ATFI KAYBOLMUYOR: kod çerezde duruyor ve çerez Google'a gidip
 * dönerken hayatta kalıyor. Sorgu parametresiyle taşınsaydı kaybolurdu.
 * ============================================================
 */
export async function signInWithGoogleAction(next?: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!appUrl) {
    return { error: 'Uygulama adresi yapılandırılmamış; Google ile giriş yapılamıyor.' }
  }

  const supabase = await createClient()

  // Açık yönlendirme koruması: yalnız kendi sitemiz içindeki yollar.
  const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/'

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl.replace(/\/$/, '')}/auth/callback?next=${encodeURIComponent(safeNext)}`,
    },
  })

  if (error) return { error: authErrorToTr(error.message) }
  if (!data.url) return { error: 'Google girişi başlatılamadı.' }

  redirect(data.url)
}
