'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getTeacherContext } from '@/lib/workspace'
import { dbErrorToTr, authErrorToTr } from '@/lib/auth-errors'
import { accountProfileSchema, passwordChangeSchema, firstIssue } from '@/lib/validation'

// AYARLAR — hesap eylemleri (072).
//
// Yetki kontrolü RPC gövdelerinde: `update_my_profile` hedef satırı
// auth.uid()'den buluyor (başkasının adı yazılamaz), `rename_workspace`
// `owner` istiyor. Kontrolü burada tekrarlamak ikinci bir doğruluk
// kaynağı yaratır ve biri güncellenirken diğeri unutulur.

export async function updateAccountAction(
  fullName: string,
  workspaceName: string
): Promise<{ error?: string; success?: boolean }> {
  const parsed = accountProfileSchema.safeParse({ fullName, workspaceName })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const { workspaceId, role } = await getTeacherContext()
  const supabase = await createClient()

  const { error: profileError } = await supabase.rpc('update_my_profile', {
    p_full_name: parsed.data.fullName,
  })
  if (profileError) return { error: dbErrorToTr(profileError.message) }

  // ÇALIŞMA ALANI ADI YALNIZ SAHİBİN İŞİ. Öğretmen rolündeki kullanıcı
  // için bu çağrı zaten reddedilirdi; burada hiç denenmez ki kendi adını
  // başarıyla değiştirmiş biri, yapamayacağı bir işten dolayı hata
  // mesajı görmesin.
  if (role === 'owner') {
    const { error: workspaceError } = await supabase.rpc('rename_workspace', {
      p_workspace_id: workspaceId,
      p_name: parsed.data.workspaceName,
    })
    if (workspaceError) return { error: dbErrorToTr(workspaceError.message) }
  }

  // Ad sol menüde ve üst şeritte duruyor; kök düzen dahil hepsi
  // yeniden çizilmeli.
  revalidatePath('/', 'layout')
  return { success: true }
}

/**
 * Şifre değiştirme — MEVCUT ŞİFRE DOĞRULANARAK.
 *
 * `supabase.auth.updateUser` mevcut şifreyi sormaz; oturum açıksa
 * değiştirir. Bu, sıfırlama akışında doğru (kimlik e-posta bağlantısıyla
 * kanıtlanmış) ama ayarlar ekranında değil: açık bırakılmış bir
 * bilgisayarın başına geçen biri hesabı tek tıkla ele geçirirdi.
 *
 * Doğrulama `signInWithPassword` ile yapılıyor — mevcut şifreyi
 * karşılaştıracak başka bir uç yok. Aynı kullanıcının oturumu olduğu
 * için bu çağrı oturumu düşürmez, tazeler.
 */
export async function changePasswordAction(
  currentPassword: string,
  password: string,
  passwordConfirm: string
): Promise<{ error?: string; success?: boolean }> {
  const parsed = passwordChangeSchema.safeParse({
    currentPassword,
    password,
    passwordConfirm,
  })
  if (!parsed.success) return { error: firstIssue(parsed.error) }

  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { error: 'Oturum bulunamadı.' }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  })
  if (signInError) return { error: 'Mevcut şifreniz hatalı.' }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
  if (error) return { error: authErrorToTr(error.message) }

  return { success: true }
}
