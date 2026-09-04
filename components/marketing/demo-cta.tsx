import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export function DemoCta() {
  return (
    <section className="px-6 pb-24 md:pb-28">
      <div className="mx-auto max-w-6xl">
        <div className="relative overflow-hidden rounded-xl border bg-card px-6 py-16 text-center">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_100%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.07]"
          />
          <h2 className="relative text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
            Uygulamayı deneyin
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-pretty leading-relaxed text-muted-foreground">
            Kayıt olmadan koç, öğrenci ve veli görünümlerini keşfedin. Gerçek arayüz, örnek
            verilerle.
          </p>

          <div className="relative mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/demo" className={buttonVariants({ size: 'lg' })}>
              Demoyu aç
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Ücretsiz Dene
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
