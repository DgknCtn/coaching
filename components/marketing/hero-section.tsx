import Link from 'next/link'
import { ArrowRight, Sparkles } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { TRIAL_DAYS } from '@/lib/plans'

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
    <section className="relative overflow-hidden border-b bg-background pt-28 pb-20 sm:pt-32 sm:pb-24">
      {/*
        Zemin ışığı. Renk `--primary` token'ından türetiliyor (ham hex yok),
        böylece koyu temada da marka rengiyle uyumlu kalıyor.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(60%_60%_at_50%_0%,var(--primary)_0%,transparent_70%)] opacity-[0.08]"
      />

      <div className="relative mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3.5 text-primary" />
            {TRIAL_DAYS} gün ücretsiz deneme
          </p>

          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
            20 öğrenci, 20 ayrı Excel dosyası olmasın
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
            Hangi öğrenci hangi kitabın neresinde, bu hafta ne verildi, kim geride
            kaldı — hepsi tek ekranda. Veliler kendi panelinden izler, siz her hafta
            aynı soruları cevaplamazsınız.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/register" className={buttonVariants({ size: 'lg' })}>
              Ücretsiz Dene
              <ArrowRight />
            </Link>
            <Link href="/demo" className={buttonVariants({ variant: 'outline', size: 'lg' })}>
              Demoyu Gör
            </Link>
          </div>

          {/* "Kredi kartı istemiyoruz" DOĞRU ve korunuyor: deneme için
              ödeme bilgisi gerçekten istenmiyor. Kaldırılan kısım
              "10 öğrenciye kadar ücretsiz" idi — 056'dan sonra ücretsiz
              kademe yok, 14 günlük deneme var. Vitrinde olmayan bir
              kademe vaat etmek, kayıt olan kullanıcıyı 15. günde
              beklemediği bir duvara çarptırır. */}
          <p className="mt-4 text-sm text-muted-foreground">
            {TRIAL_DAYS} gün ücretsiz deneme · Kredi kartı istemiyoruz
          </p>
        </div>

        {/* Ürün önizlemesi — gerçek arayüzün sadeleştirilmiş bir temsili. */}
        <div className="mx-auto mt-16 max-w-4xl overflow-hidden rounded-xl border bg-card shadow-xl shadow-primary/5">
          {/* Sahte pencere çubuğu — kartın bir "ekran" olduğunu okutuyor. */}
          <div className="flex items-center gap-1.5 border-b bg-muted/40 px-4 py-2.5">
            <span className="size-2.5 rounded-full bg-destructive/40" />
            <span className="size-2.5 rounded-full bg-warning/40" />
            <span className="size-2.5 rounded-full bg-success/40" />
            <span className="ml-3 text-xs text-muted-foreground">Koç paneli</span>
          </div>

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
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/40"
                >
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
