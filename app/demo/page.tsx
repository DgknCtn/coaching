import Link from 'next/link'
import { ArrowRight, FlaskConical } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { Navbar } from '@/components/marketing/navbar'
import { Footer } from '@/components/marketing/footer'
import { DemoTabs } from '@/components/marketing/demo/demo-tabs'

export const metadata = {
  title: 'Demo – KoçTakip',
  description: 'KoçTakip uygulamasını kayıt olmadan keşfedin.',
}

export default function DemoPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Demo banner — stays below navbar, adapts height on mobile */}
      <div
        className="fixed top-16 inset-x-0 z-40 flex items-center justify-center gap-2 px-3 py-2 text-xs sm:text-sm font-semibold"
        style={{
          background:
            'linear-gradient(90deg, oklch(0.70 0.18 65 / 0.97), oklch(0.73 0.18 55 / 0.97))',
          color: 'oklch(0.22 0.08 55)',
        }}
      >
        <FlaskConical className="size-3.5 sm:size-4 shrink-0" />
        {/* Shorter text on mobile */}
        <span className="sm:hidden font-semibold">Demo Modu — Veriler örnek amaçlıdır.</span>
        <span className="hidden sm:inline">Demo Modu — Veriler gerçek değil, sadece örnek amaçlıdır.</span>
        <Link
          href="/register"
          className={buttonVariants({ size: 'sm' })}
          style={{
            height: '1.5rem',
            padding: '0 0.6rem',
            fontSize: '0.7rem',
            fontWeight: 700,
            background: 'oklch(0.22 0.08 55)',
            color: 'white',
            flexShrink: 0,
          }}
        >
          <span className="hidden sm:inline">Gerçek Hesap Aç</span>
          <span className="sm:hidden">Hesap Aç</span>
          <ArrowRight className="size-3 ml-1" />
        </Link>
      </div>

      {/* Main content — pt accounts for navbar (64px) + banner (~36px) */}
      <main className="flex-1 pt-[104px] pb-12 sm:pb-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          {/* Page header */}
          <div className="mb-6 sm:mb-8">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight mb-1.5 sm:mb-2">
              Canlı Demo
            </h1>
            <p className="text-muted-foreground text-sm sm:text-lg">
              Koç, öğrenci ve veli görünümlerini keşfedin.
              <span className="hidden sm:inline"> Tüm özellikler gerçek arayüzle sunulmaktadır.</span>
            </p>
          </div>

          <DemoTabs />

          {/* Bottom CTA */}
          <div
            className="mt-10 sm:mt-12 rounded-2xl sm:rounded-3xl p-6 sm:p-10 text-center relative overflow-hidden"
            style={{
              background:
                'linear-gradient(135deg, oklch(0.065 0.028 255), oklch(0.10 0.04 260))',
            }}
          >
            <div
              className="absolute top-0 left-1/2 -translate-x-1/2 w-64 h-32 blur-3xl opacity-30 pointer-events-none"
              style={{ background: 'oklch(0.57 0.26 282)' }}
            />
            <div className="relative">
              <h2 className="text-xl sm:text-3xl font-black text-white mb-2 sm:mb-3">
                Hazır mısınız?
              </h2>
              <p className="mb-5 sm:mb-6 text-sm sm:text-base max-w-md mx-auto" style={{ color: 'oklch(0.7 0.02 260)' }}>
                Ücretsiz hesabınızı oluşturun, dakikalar içinde öğrencilerinizi takip etmeye başlayın.
              </p>
              <Link
                href="/register"
                className={buttonVariants({ size: 'lg' })}
                style={{
                  height: '3rem',
                  padding: '0 2rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  background:
                    'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
                  border: 'none',
                }}
              >
                Ücretsiz Başla
                <ArrowRight className="size-4 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  )
}
