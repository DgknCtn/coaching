import { UserPlus, Users, TrendingUp } from 'lucide-react'

const steps = [
  {
    number: '01',
    Icon: UserPlus,
    title: 'Hesabını Oluştur',
    description:
      'Ücretsiz kaydol, çalışma alanını oluştur. Eğitim dönemini ve kitap havuzunu tanımla.',
  },
  {
    number: '02',
    Icon: Users,
    title: 'Öğrencilerini Ekle',
    description:
      'Öğrencilerine ve velilerine davet linki gönder. Kitapları ata, ödevleri oluştur.',
  },
  {
    number: '03',
    Icon: TrendingUp,
    title: 'Takip Et ve Yönet',
    description:
      'Risk analiziyle kimlerin geride kaldığını gör. Gerçek zamanlı ilerlemeyi takip et.',
  },
]

export function HowItWorks() {
  return (
    <section
      id="nasil-calisir"
      className="py-14 sm:py-24 px-4"
      style={{ background: 'oklch(0.97 0.004 260)' }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Section header */}
        <div className="text-center mb-10 sm:mb-16">
          <div
            className="inline-block text-xs font-bold uppercase tracking-widest px-3 py-1 rounded-full mb-4 border"
            style={{
              color: 'oklch(0.57 0.26 282)',
              borderColor: 'oklch(0.57 0.26 282 / 0.3)',
              background: 'oklch(0.57 0.26 282 / 0.08)',
            }}
          >
            Nasıl Çalışır
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3 sm:mb-4">
            3 Adımda Başla
          </h2>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Dakikalar içinde kurulum tamamla, öğrencilerini takip etmeye başla.
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid md:grid-cols-3 gap-8 md:gap-6">
          {/* Connecting line (desktop) */}
          <div
            className="hidden md:block absolute top-10 left-[calc(16.67%+2rem)] right-[calc(16.67%+2rem)] h-px"
            style={{
              background:
                'linear-gradient(90deg, oklch(0.57 0.26 282 / 0.3), oklch(0.57 0.26 282 / 0.6), oklch(0.57 0.26 282 / 0.3))',
            }}
          />

          {steps.map((step, i) => (
            <div key={step.number} className="relative flex flex-col items-center text-center">
              {/* Number circle */}
              <div
                className="relative w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-lg"
                style={{
                  background:
                    i === 0
                      ? 'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))'
                      : 'oklch(1 0 0)',
                  border: `2px solid ${i === 0 ? 'transparent' : 'oklch(0.9 0.01 260)'}`,
                }}
              >
                <step.Icon
                  className="size-8"
                  style={{ color: i === 0 ? 'white' : 'oklch(0.57 0.26 282)' }}
                />
                <div
                  className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm"
                  style={{
                    background:
                      'linear-gradient(135deg, oklch(0.57 0.26 282), oklch(0.50 0.22 265))',
                  }}
                >
                  {i + 1}
                </div>
              </div>

              <h3 className="text-xl font-black mb-3">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed max-w-xs">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
