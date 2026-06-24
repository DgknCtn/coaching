import Link from 'next/link'
import { Play, ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export function DemoCta() {
  return (
    <section className="py-14 sm:py-24 px-4">
      <div className="max-w-5xl mx-auto">
        <div
          className="relative rounded-3xl overflow-hidden px-8 py-16 sm:px-16 text-center"
          style={{
            background:
              'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265), oklch(0.38 0.18 250))',
          }}
        >
          {/* Dot grid overlay */}
          <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />

          {/* Glow */}
          <div
            className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-48 blur-3xl opacity-40 pointer-events-none"
            style={{ background: 'oklch(0.75 0.18 282)' }}
          />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold mb-6 bg-white/15 text-white">
              <Play className="size-3.5 fill-current" />
              Canlı Demo
            </div>

            <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black text-white mb-3 sm:mb-4 tracking-tight">
              Uygulamayı Deneyin
            </h2>
            <p className="text-white/65 text-base sm:text-lg max-w-xl mx-auto mb-7 sm:mb-10">
              Kayıt olmadan, koç, öğrenci ve veli görünümlerini keşfedin. Gerçek arayüz, örnek verilerle.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/demo"
                className={buttonVariants({ size: 'lg' })}
                style={{
                  height: '3rem',
                  padding: '0 2rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  background: 'white',
                  color: 'oklch(0.10 0.028 265)',
                  border: 'none',
                  boxShadow: '0 10px 40px oklch(0 0 0 / 0.2)',
                }}
              >
                <Play className="size-4 mr-2 fill-current" />
                Demo&apos;yu Aç
              </Link>
              <Link
                href="/register"
                className={buttonVariants({ variant: 'outline' })}
                style={{
                  height: '3rem',
                  padding: '0 2rem',
                  fontSize: '1rem',
                  fontWeight: 600,
                  borderColor: 'oklch(1 0 0 / 0.3)',
                  color: 'white',
                  background: 'transparent',
                }}
              >
                Ücretsiz Başla
                <ArrowRight className="size-4 ml-2" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
