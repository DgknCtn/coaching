import {
  ClipboardList,
  AlertTriangle,
  Eye,
  Library,
  BarChart3,
  Link2,
} from 'lucide-react'
import { SectionHeading } from './section-heading'

const features = [
  {
    Icon: ClipboardList,
    title: 'Ödev Takibi',
    description:
      'Test bazında ödev oluştur, tamamlanma durumunu anlık gör. Geciken ödevler otomatik işaretlenir.',
  },
  {
    Icon: AlertTriangle,
    title: 'Risk Analizi',
    description:
      'Tamamlama oranına göre her öğrenciye otomatik risk skoru. Kritik olanları kaçırma.',
  },
  {
    Icon: Eye,
    title: 'Veli Paneli',
    description:
      'Veli kendi panelinden çocuğunun ilerlemesini ve geciken ödevlerini görür. Salt okunur: hiçbir şeyi değiştiremez, öğretmenin akademik notlarını göremez.',
  },
  {
    Icon: Library,
    title: 'Kitap Havuzu',
    description:
      'Bölüm, alt bölüm ve test yapısıyla kitap ekle, öğrencilere ata. İçindekiler listesini yapıştırarak koca bir kitabı tek seferde aktar.',
  },
  {
    Icon: BarChart3,
    title: 'İlerleme Grafikleri',
    description:
      'Her öğrencinin kitap bazında ilerleme yüzdesi. Haftalık ve dönemlik karşılaştırma.',
  },
  {
    Icon: Link2,
    title: 'Davet Sistemi',
    description:
      'Tek link ile öğrenci ve veli kaydı. Token tabanlı güvenli davet, çoklu kullanıcı desteği.',
  },
]

export function FeatureGrid() {
  return (
    <section className="px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading
          eyebrow="Özellikler"
          title="İhtiyacınız olan her şey"
          description="Koçluk sürecinizi verimli hale getirecek araçlar, tek bir platformda."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-lg border bg-card p-6 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10">
                <f.Icon className="size-4 text-primary" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {f.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
