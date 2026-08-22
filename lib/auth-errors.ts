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

// Veritabanı/RPC hatalarını kullanıcıya göstermeden önce süzer.
//
// Sorun: Server Action'lar `return { error: error.message }` diyerek ham
// Postgres hatasını ekrana taşıyordu. Bu hem anlaşılmaz ("duplicate key
// value violates unique constraint ..."), hem de tablo/kısıt/fonksiyon
// adlarını ve `Invalid student_book_assignment_id: <uuid>` gibi bir
// kaydın VARLIĞINI doğrulayan bilgileri sızdırıyordu.
//
// Kural: RPC'lerimizin bilinçli olarak Türkçe yazdığı iş kuralı mesajları
// (ör. "Kitap bulunamadı", "Bir bölüm en fazla 1000 sayfa olabilir")
// kullanıcının bugün gördüğü uyarılardır ve AYNEN geçer. Türkçe olmayan
// her şey — yani Postgres'in kendi mesajları ve fonksiyonların İngilizce
// iç hataları — tek bir genel mesaja iner.
const TURKISH_CHARS = /[çğıİöşüÇĞÖŞÜ]/

const GENERIC_DB_ERROR = 'İşlem tamamlanamadı. Lütfen tekrar deneyin.'

export function dbErrorToTr(message: string | null | undefined): string {
  if (!message) return GENERIC_DB_ERROR

  const m = message.toLowerCase()

  // Yetki hatası her katmanda aynı İngilizce metinle geliyor; kullanıcıya
  // ne olduğunu söylemek genel mesajdan daha yardımcı.
  if (m.includes('permission denied')) return 'Bu işlem için yetkiniz yok.'

  // Kasıtlı Türkçe iş kuralı mesajları olduğu gibi gösterilir.
  if (TURKISH_CHARS.test(message)) return message

  return GENERIC_DB_ERROR
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
