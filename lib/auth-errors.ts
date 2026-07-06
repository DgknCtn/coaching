// Supabase/GoTrue İngilizce hata mesajlarını kullanıcıya uygun Türkçe
// mesajlara çevirir; eşleşme yoksa genel bir mesaj döner (ham DB/auth
// mesajlarını sızdırmamak için).
export function authErrorToTr(message: string): string {
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

// accept_invitation RPC'sinin fırlattığı iş kuralı hatalarını Türkçeleştirir;
// eşleşme yoksa genel bir mesaj döner (ham DB mesajını sızdırmadan).
export function inviteErrorToTr(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('already used') || m.includes('invalid'))
    return 'Bu davet geçersiz veya zaten kullanılmış.'
  if (m.includes('expired')) return 'Bu davetin süresi dolmuş.'
  if (m.includes('different email'))
    return 'Bu davet farklı bir e-posta adresi için oluşturulmuş.'
  return 'Davet kabul edilemedi. Lütfen tekrar deneyin.'
}
