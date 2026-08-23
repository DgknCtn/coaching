import { SectionHeading } from './section-heading'

const steps = [
  {
    title: 'Hesabını oluştur',
    description:
      'Ücretsiz kaydol, çalışma alanını oluştur. Eğitim dönemini ve kitap havuzunu tanımla.',
  },
  {
    title: 'Öğrencilerini ekle',
    description:
      'Öğrencilerine ve velilerine davet linki gönder. Kitapları ata, ödevleri oluştur.',
  },
  {
    title: 'Takip et ve yönet',
    description:
      'Risk analiziyle kimlerin geride kaldığını gör. Gerçek zamanlı ilerlemeyi takip et.',
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
          title="3 adımda başla"
          description="Dakikalar içinde kurulumu tamamla, öğrencilerini takip etmeye başla."
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
      </div>
    </section>
  )
}
