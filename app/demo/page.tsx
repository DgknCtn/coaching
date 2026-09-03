import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'
import { DemoTabs } from '@/components/marketing/demo/demo-tabs'
import { BRAND } from '@/lib/brand'

export const metadata = {
  title: 'Demo',
  description: `${BRAND.name} uygulamasını kayıt olmadan keşfedin.`,
}

export default function DemoPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />

      {/* Demo şeridi — navbar'ın (h-16) hemen altında sabit. */}
      <div className="fixed inset-x-0 top-16 z-40 flex items-center justify-center gap-3 border-b border-info-border bg-info-subtle px-4 py-2 text-sm">
        {/*
          Şerit yüksekliği aşağıdaki pt-[137px] ile bağlı; metin dar ekranda
          ikinci satıra taşarsa içerik navbar'ın altında kalıyordu. Bu yüzden
          mobilde kısa hâli gösteriliyor.
        */}
        <span className="text-info-foreground">
          <span className="sm:hidden">Demo modu</span>
          <span className="hidden sm:inline">Demo modu — veriler örnek amaçlıdır.</span>
        </span>
        <Link href="/register" className={buttonVariants({ size: 'xs', variant: 'outline' })}>
          Hesap Aç
        </Link>
      </div>

      {/* pt: navbar (64px) + şerit (~41px) + nefes payı */}
      <main className="flex-1 pt-[137px] pb-16">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-8">
            <h1 className="text-xl font-semibold tracking-tight">Canlı demo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Koç, öğrenci ve veli görünümlerini keşfedin.
            </p>
          </div>

          <DemoTabs />

          <div className="mt-12 rounded-lg border bg-card px-6 py-12 text-center">
            <h2 className="text-xl font-semibold tracking-tight">Hazır mısınız?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Ücretsiz hesabınızı oluşturun, dakikalar içinde öğrencilerinizi takip etmeye
              başlayın.
            </p>
            <div className="mt-6">
              <Link href="/register" className={buttonVariants({ size: 'lg' })}>
                Ücretsiz Başla
                <ArrowRight />
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
