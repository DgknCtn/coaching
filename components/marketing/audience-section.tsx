import { GraduationCap, Brain, Users } from 'lucide-react'
import { SectionHeading } from './section-heading'

// KİMLER İÇİN — nitelendirme bölümü.
//
// ============================================================
// NEDEN HERO'DAN HEMEN SONRA
//
// Sayfa "ne yapar" sorusunu iyi cevaplıyordu ama "bu benim için mi"
// sorusunu hiç cevaplamıyordu. Okuyucu kendini listede göremezse geri
// kalan her şeyi başkasına anlatılan bir ürün olarak okur.
//
// SON SATIR BİLİNÇLİ OLARAK ELEYİCİ: "20+ öğrenciniz varsa" demek, üç
// öğrencisi olan birine bu ürünün gerekmediğini de söylüyor. Herkesi
// içeri çağıran bir cümle kimseyi ikna etmiyor.
// ============================================================

const AUDIENCES = [
  {
    Icon: GraduationCap,
    title: 'Özel Ders Öğretmenleri',
    body: 'Birden fazla öğrencinin ödev ve kitap ilerlemesini tek yerden yönetin.',
  },
  {
    Icon: Brain,
    title: 'Eğitim Koçları',
    body: 'Öğrencilerinizin haftalık çalışma düzenini ve gecikmelerini takip edin.',
  },
  {
    Icon: Users,
    title: 'Küçük Koçluk Ekipleri',
    body: 'Öğrenci takibini ortak bir sistem üzerinden yönetin.',
  },
]

export function AudienceSection() {
  return (
    <section className="border-y bg-muted/30 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-6xl">
        <SectionHeading eyebrow="Kimler için" title="İZ kimler için?" />

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {AUDIENCES.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-lg border bg-card p-6">
              <Icon className="size-5 text-primary" />
              <h3 className="mt-4 text-sm font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm font-medium">
          20+ öğrenciniz varsa İZ sizin için tasarlandı.
        </p>
      </div>
    </section>
  )
}
