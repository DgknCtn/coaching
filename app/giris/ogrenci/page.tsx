import { permanentRedirect } from 'next/navigation'

// Eski adres (10a): öğrencilere bu bağlantı WhatsApp'la gönderilmiş
// olabilir. Giriş artık tek ekranda (/login).
export default function LegacyStudentLoginPage() {
  permanentRedirect('/login')
}
