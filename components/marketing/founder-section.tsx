import { Quote } from 'lucide-react'
import { BRAND } from '@/lib/brand'

// KURUCU HİKÂYESİ — isimsiz (karar: 11 Ekim 2026).
//
// Ürünü bir yazılım şirketi değil, öğrencilerini takip ederken aynı
// sorunları yaşayan bir öğretmen yaptı ve her gün kendisi kullanıyor.
// Bu, sayfadaki en güçlü güven kanıtı. Metinde SAYI YOK: gerçek değerler
// (yıl, öğrenci sayısı) verilirse eklenir, tahmin yazılmaz.

export function FounderSection() {
  return (
    <section className="border-t px-6 py-20 md:py-24">
      <figure className="mx-auto max-w-3xl">
        <Quote aria-hidden className="size-8 text-primary/40" />
        <blockquote className="mt-4 space-y-4 text-lg leading-relaxed text-pretty sm:text-xl">
          <p>
            {BRAND.name}&apos;i bir yazılım şirketi olarak değil, bir matematik öğretmeni olarak yaptım.
            Öğrencilerimin ödevlerini WhatsApp mesajlarında, kitap takibini defterde,
            velilerin sorularını telefonda kovalamaktan yorulmuştum.
          </p>
          <p className="text-muted-foreground">
            Aradığım şey basitti: kimin ne yaptığını tek ekranda görmek, öğrencinin
            telefonundan teslim etmesi, velinin sormadan bilmesi. Bulamayınca kendim
            yaptım ve her gün kendi öğrencilerimle kullanıyorum.
          </p>
        </blockquote>
        <figcaption className="mt-6 text-sm text-muted-foreground">
          — {BRAND.name}&apos;in Kurucu Ortağı, Matematiğin Mühendisi
        </figcaption>
      </figure>
    </section>
  )
}
