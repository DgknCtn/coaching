import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/lib/brand'
import { AdminTabs } from './admin-tabs'

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
      {/* Marka satırı ve sekmeler AYRI SATIRDA: üçü tek satırda dururken
          dar ekranda sarılıyor ve "Panele dön" bağlantısı sekmelerin
          arasına düşüyordu. Sekmeler artık aktif olanı işaretliyor
          (AdminTabs). */}
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 pt-4">
          <Link href="/admin" className="text-sm font-semibold">
            {BRAND.name} <span className="text-muted-foreground">Yönetim</span>
          </Link>
          <Link
            href="/teacher"
            className="ml-auto shrink-0 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Panele dön
          </Link>
        </div>
        <div className="mx-auto max-w-6xl px-6">
          <AdminTabs />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
