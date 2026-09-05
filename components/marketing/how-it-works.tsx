import { SectionHeading } from './section-heading'

const steps = [
  {
    title: 'Öğrencilerinizi ekleyin',
    description: 'Öğrenci ve velilerinize davet linki gönderin.',
  },
  {
    title: 'Ödevleri planlayın',
    description:
      'Kitap, test, sayfa veya video bazında haftalık görevler oluşturun.',
  },
  {
    title: 'Takip etmeye başlayın',
    description: 'Kim yaptı, kim gecikti, kim geride kaldı? Tek ekrandan görün.',
  },
]

export function HowItWorks() {
  return (
    <section
      id="nasil-calisir"
      className="scroll-mt-16 border-y bg-muted/30 px-6 py-20 md:py-28"
    >
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Nasıl çalışır"
          title="3 adımda başlayın"
          description="Kurulum dakikalar sürüyor; ilk ödevinizi aynı gün verebilirsiniz."
        />

        <ol className="mt-14 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="rounded-lg border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold tabular-nums text-primary">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.description}
              </p>
            </li>
          ))}
        </ol>

        {/* Hero'daki "Kurulum 10 dakika" ile AYNI sayı. İki farklı yerde
            iki farklı süre söylemek, ikisini de inandırıcılıktan çıkarır. */}
        <p className="mt-8 text-center text-sm font-medium">
          10 dakikada kurun. Aynı gün kullanmaya başlayın.
        </p>
      </div>
    </section>
  )
}
