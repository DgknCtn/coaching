import { permanentRedirect } from 'next/navigation'

// Eski adres (10a): öğrencilere bu bağlantı WhatsApp'la gönderilmiş
// olabilir. Öğrenci ve veli girişi artık /giris'te.
export default function LegacyStudentLoginPage() {
  permanentRedirect('/giris')
}
