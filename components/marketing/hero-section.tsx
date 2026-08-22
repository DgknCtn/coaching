import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const previewStats = [
  { label: 'Öğrenci', value: '24' },
  { label: 'Bu hafta', value: '86%' },
  { label: 'Geciken', value: '3' },
  { label: 'Riskli', value: '2' },
]

const previewRows = [
  { name: 'Elif Yılmaz', detail: 'TYT · 12. sınıf', week: '12/12', status: 'İyi' },
  { name: 'Mert Demir', detail: 'AYT · 12. sınıf', week: '7/10', status: 'Dikkat' },
  { name: 'Zeynep Kaya', detail: 'TYT · 11. sınıf', week: '9/9', status: 'İyi' },
  { name: 'Can Öztürk', detail: 'AYT · 12. sınıf', week: '3/11', status: 'Kritik' },
]

const statusTone: Record<string, string> = {
  'İyi': 'border-success-border bg-success-subtle text-success-foreground',
  'Dikkat': 'border-warning-border bg-warning-subtle text-warning-foreground',
  'Kritik': 'border-destructive-border bg-destructive-subtle text-destructive-foreground',
}

export function HeroSection() {
  return (
    <section className="border-b bg-background pt-32 pb-20">
      <div className="mx-auto max-w-5xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            20 öğrenci, 20 ayrı Excel dosyası olmasın
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
            Hangi öğrenci hangi kitabın neresinde, bu hafta ne verildi, kim geride
            kaldı — hepsi tek ekranda. Veliler kendi panelinden izler, siz her hafta
            aynı soruları cevaplamazsınız.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: 'lg' })}>
              Ücretsiz Başla
              <ArrowRight />
            </Link>
            <Link href="/demo" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Demoyu Gör
            </Link>
          </div>

          <p className="mt-4 text-sm text-muted-foreground">
            10 öğrenciye kadar ücretsiz · Kredi kartı istemiyoruz
          </p>
        </div>

        {/* Ürün önizlemesi — gerçek arayüzün sadeleştirilmiş bir temsili. */}
        <div className="mt-16 overflow-hidden rounded-lg border bg-card">
          <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
            {previewStats.map((s) => (
              <div key={s.label} className="bg-card p-4">
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
                  {s.value}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <p className="text-sm font-semibold">Öğrenci durumu</p>
              <p className="text-xs text-muted-foreground">24 öğrenci</p>
            </div>
            <ul className="divide-y">
              {previewRows.map((r) => (
                <li key={r.name} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{r.detail}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-4">
                    <span className="text-sm tabular-nums text-muted-foreground">{r.week}</span>
                    <span
                      className={cn(
                        'rounded-sm border px-2 py-0.5 text-xs font-medium',
                        statusTone[r.status]
                      )}
                    >
                      {r.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
