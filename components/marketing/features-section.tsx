import { GraduationCap, BookOpen, Users, Check } from 'lucide-react'

const roles = [
  {
    id: 'koc',
    role: 'Koç',
    tagline: 'Sınıfınızı bir bakışta görün',
    Icon: GraduationCap,
    gradient: 'linear-gradient(135deg, oklch(0.52 0.25 282), oklch(0.44 0.22 265))',
    glowColor: 'oklch(0.57 0.26 282 / 0.3)',
    accentColor: 'oklch(0.78 0.18 282)',
    description:
      'Tüm öğrencilerinizi tek ekrandan yönetin. Risk analiziyle kimlerin takibe ihtiyacı olduğunu erkenden görün.',
    features: [
      'Öğrenci başına kitap ataması',
      'Haftalık risk analizi (Kritik / Dikkat / İyi)',
      'Ödev oluşturma ve ilerleme takibi',
      'Veli & öğrenci davet sistemi',
      'Eğitim dönemi yönetimi',
    ],
  },
  {
    id: 'ogrenci',
    role: 'Öğrenci',
    tagline: 'Odaklan, ilerle, başar',
    Icon: BookOpen,
    gradient: 'linear-gradient(135deg, oklch(0.50 0.18 155), oklch(0.43 0.16 168))',
    glowColor: 'oklch(0.60 0.18 155 / 0.3)',
    accentColor: 'oklch(0.75 0.15 155)',
    description:
      'Ödevlerini ve kitap ilerlemeni takip et. Gecikmeleri önceden gör, hedeflerine odaklan.',
    features: [
      'Güncel ödev listesi (geciken / yaklaşan)',
      'Test tamamlama işaretleme',
      'Kitap bölümü ilerleme çubuğu',
      'Haftalık performans özeti',
      'Çoklu kitap desteği',
    ],
  },
  {
    id: 'veli',
    role: 'Veli',
    tagline: 'Çocuğunuzla her an bağlı kalın',
    Icon: Users,
    gradient: 'linear-gradient(135deg, oklch(0.54 0.22 20), oklch(0.47 0.20 8))',
    glowColor: 'oklch(0.60 0.22 20 / 0.3)',
    accentColor: 'oklch(0.80 0.16 20)',
    description:
      'Çocuğunuzun gelişimini anlık takip edin. Koçla uyum içinde kalın, kritik anlarda haberdar olun.',
    features: [
      'Haftalık performans kartları',
      'Geciken ödev bildirimleri',
      'Kitap ilerleme takibi',
      'Birden fazla öğrenci desteği',
      'Davet linki ile kolay kayıt',
    ],
  },
]

export function FeaturesSection() {
  return (
    <section id="ozellikler" className="py-14 sm:py-24 px-4">
      <div className="max-w-6xl mx-auto">
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
            Herkes için
          </div>
          <h2 className="text-2xl sm:text-4xl lg:text-5xl font-black tracking-tight mb-3 sm:mb-4">
            Üç Rol, Tek Platform
          </h2>
          <p className="text-muted-foreground text-base sm:text-lg max-w-xl mx-auto">
            Koç, öğrenci ve veliler için tasarlanmış birbirine bağlı bir deneyim.
          </p>
        </div>

        {/* Role cards */}
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {roles.map((r) => (
            <div
              key={r.id}
              className="relative rounded-3xl overflow-hidden flex flex-col"
              style={{ background: 'oklch(0.065 0.028 255)' }}
            >
              {/* Glow blob */}
              <div
                className="absolute top-0 right-0 w-48 h-48 blur-3xl pointer-events-none"
                style={{ background: r.glowColor }}
              />

              <div className="relative p-7 flex-1 flex flex-col">
                {/* Icon */}
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shrink-0"
                  style={{ background: r.gradient }}
                >
                  <r.Icon className="size-6 text-white" />
                </div>

                {/* Role badge */}
                <div
                  className="text-xs font-bold uppercase tracking-widest mb-2"
                  style={{ color: r.accentColor }}
                >
                  {r.role}
                </div>

                {/* Tagline */}
                <h3 className="text-xl font-black text-white mb-3 leading-snug">
                  {r.tagline}
                </h3>

                {/* Description */}
                <p className="text-sm leading-relaxed mb-6" style={{ color: 'oklch(0.7 0.02 260)' }}>
                  {r.description}
                </p>

                {/* Feature list */}
                <ul className="space-y-2.5 mt-auto">
                  {r.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm" style={{ color: 'oklch(0.82 0.01 260)' }}>
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                        style={{ background: r.gradient }}
                      >
                        <Check className="size-3 text-white" strokeWidth={3} />
                      </div>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Bottom accent bar */}
              <div className="h-1 w-full" style={{ background: r.gradient }} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
