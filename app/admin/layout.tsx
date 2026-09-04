import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { BRAND } from '@/lib/brand'

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

const TABS = [
  { href: '/admin', label: 'Özet' },
  { href: '/admin/talepler', label: 'Destek Talepleri' },
  { href: '/admin/partnerler', label: 'Partnerler' },
]

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
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-6 py-4">
          <Link href="/admin" className="text-sm font-semibold">
            {BRAND.name} <span className="text-muted-foreground">Yönetim</span>
          </Link>
          <nav className="flex gap-4 text-sm" aria-label="Yönetim menüsü">
            {TABS.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                {t.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/teacher"
            className="ml-auto text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Panele dön
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  )
}
