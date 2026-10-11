// GERÇEK KULLANICI SÖZLERİ — landing (testimonials-section.tsx).
//
// KURAL: buraya yalnız GERÇEK bir kişinin, paylaşılmasına İZİN VERDİĞİ
// sözü girer. Uydurma ya da "örnek" yorum yazılmaz; yazılırsa tüketici
// mevzuatı açısından aldatıcı reklam olur ve güveni kalıcı olarak bozar.
//
// Ad gösterilmez: baş harf ya da "Bir veli" gibi bir rumuz yeter.
// Öğrenci reşit değilse sözü veli izniyle paylaşılır.
//
// Liste boşsa bölüm sayfada hiç çizilmez.

export type TestimonialRole = 'öğrenci' | 'veli' | 'koç' | 'öğretmen'

export interface Testimonial {
  /** Kişinin kendi cümlesi, düzeltilmeden (yalnız yazım hatası). */
  quote: string
  /** Gösterilecek ad: baş harf ya da rumuz ("A.K.", "Bir veli"). */
  displayName: string
  role: TestimonialRole
  /** Bağlam: "12. sınıf, YKS" gibi; isteğe bağlı. */
  detail?: string
  /** Paylaşma izni alındı mı? false ise gösterilmez. */
  consent: boolean
}

export const TESTIMONIALS: Testimonial[] = []

export function publishedTestimonials(list: Testimonial[] = TESTIMONIALS): Testimonial[] {
  return list.filter((t) => t.consent && t.quote.trim().length > 0)
}
