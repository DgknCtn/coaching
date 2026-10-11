import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AdminHeader } from './admin-header'

/**
 * PANELLER ARAMA MOTORUNA KAPALI.
 *
 * Bu sayfalar oturum arkasında ve URL'leri öğrenci id'si taşıyor;
 * dizine girmeleri ne mümkün ne de istenir. robots.txt taramayı
 * engelliyor, bu etiket ise dış bir bağlantıdan keşfedilen adresin
 * dizine EKLENMESİNİ engelliyor — ikisi farklı şeydir ve ikisi de
 * gerekli.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}


export const dynamic = 'force-dynamic'

// ADMİN ALANI.
//
// ============================================================
// YETKİ KONTROLÜ BURADA, MIDDLEWARE'DE DEĞİL
//
// Middleware Edge'de koşuyor ve her istekte bir veritabanı sorgusu daha
// eklemek, uygulamanın TAMAMINI yavaşlatırdı. Admin sayfaları zaten
// nadir açılıyor; kontrolü buraya koymak doğru takas.
//
// ASIL SAVUNMA DA BURADA DEĞİL: her admin RPC'si kendi içinde
// `is_platform_admin()` kontrol ediyor (060). Bu layout yalnız yetkisiz
// kullanıcıyı boş bir ekranla baş başa bırakmamak için var — buraya
// ulaşsa bile hiçbir veri göremez.
// ============================================================

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: isAdmin } = await supabase.rpc('is_platform_admin')
  if (!isAdmin) redirect('/')

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Bölüm + sayfa iki satırda, yapışkan başlıkta (admin-header.tsx). */}
      <AdminHeader email={user.email ?? null} />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  )
}
