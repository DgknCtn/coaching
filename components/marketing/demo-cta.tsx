import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'

export function DemoCta() {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="rounded-lg border bg-card px-6 py-14 text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Uygulamayı deneyin
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Kayıt olmadan koç, öğrenci ve veli görünümlerini keşfedin. Gerçek arayüz, örnek
            verilerle.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/demo" className={buttonVariants({ size: 'lg' })}>
              Demoyu aç
            </Link>
            <Link
              href="/register"
              className={buttonVariants({ variant: 'outline', size: 'lg' })}
            >
              Ücretsiz Başla
              <ArrowRight />
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}
