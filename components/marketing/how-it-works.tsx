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
    <section id="nasil-calisir" className="border-y bg-muted/40 px-6 py-20">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            3 adımda başla
          </h2>
          <p className="mt-3 text-muted-foreground">
            Dakikalar içinde kurulumu tamamla, öğrencilerini takip etmeye başla.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {steps.map((step, i) => (
            <li key={step.title} className="rounded-lg border bg-card p-6">
              <span className="text-sm tabular-nums text-muted-foreground">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="mt-3 text-sm font-semibold">{step.title}</h3>
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
