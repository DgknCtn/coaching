import { SectionHeading } from './section-heading'

const steps = [
  {
    title: 'Kaydolun, öğrencilerinizi ve kitaplarınızı ekleyin',
    description:
      'Kitabın içindekiler listesini yapıştırın; bölümler ve testler kendiliğinden çıkar.',
  },
  {
    title: 'Öğrenciye ve veliye giriş verin',
    description:
      "Her birine kullanıcı adı ve 6 haneli PIN oluşturun, hazır mesajla WhatsApp'tan iletin. E-posta gerekmez.",
  },
  {
    title: 'Ödevi verin, teslimi onaylayın',
    description:
      "Kitap Haritası'ndan test, sayfa veya video seçin. Öğrenci telefonundan teslim eder; onayladığınız iş ilerlemeye sayılır ve veli aynı veriyi görür.",
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
          description="İlk ödevinizi kaydolduğunuz gün verebilirsiniz."
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

        {/* SÜRE DEĞİL ADIM SAYISI (068 · rapor bulgusu 10d).
            "10 dakika" üç ayrı yerde elle yazılıydı, hiçbir ölçüme
            dayanmıyordu ve bu dosyadaki eski yorum senkron riskini zaten
            itiraf ediyordu. Adım sayısı ise hemen yukarıdaki listeden
            türüyor: yanlış olması imkânsız. */}
        <p className="mt-8 text-center text-sm font-medium">
          {steps.length} adımda kurun. Aynı gün kullanmaya başlayın.
        </p>
      </div>
    </section>
  )
}
