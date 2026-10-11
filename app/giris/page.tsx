import { permanentRedirect } from 'next/navigation'

// Eski öğrenci/veli kapısı. Giriş artık tek ekranda (/login); bu adres
// WhatsApp'la ya da QR ile paylaşılmış olabilir, o yüzden yönlendirir.
export default function LegacyMemberLoginPage() {
  permanentRedirect('/login')
}
