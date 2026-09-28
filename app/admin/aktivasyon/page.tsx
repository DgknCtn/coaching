import { redirect } from 'next/navigation'

// AKTİVASYON (B17 · 120) — Kullanım sekmesine taşındı (Yönetim 5/8).
// Eski adres kayıtlı bağlantılar kırılmasın diye yönlenir; pencere korunur.

export default async function ActivationRedirect({
  searchParams,
}: {
  searchParams: Promise<{ gun?: string }>
}) {
  const { gun } = await searchParams
  redirect(gun ? `/admin/kullanim?gun=${encodeURIComponent(gun)}` : '/admin/kullanim')
}
