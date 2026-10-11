import { describe, it, expect } from 'vitest'
import { publishedTestimonials, TESTIMONIALS, type Testimonial } from '@/lib/testimonials'

// KULLANICI SÖZLERİ YALNIZ İZİNLE YAYINLANIR (landing, 11 Ekim 2026).

const base: Testimonial = { quote: 'Çok işime yarıyor.', displayName: 'A.K.', role: 'veli', consent: true }

describe('kullanıcı sözleri · yayın süzgeci', () => {
  it('izni olmayanı göstermez', () => {
    expect(publishedTestimonials([base, { ...base, quote: 'İzinsiz', consent: false }])).toEqual([base])
  })

  it('boş sözü göstermez', () => {
    expect(publishedTestimonials([{ ...base, quote: '   ' }])).toEqual([])
  })

  it('yayındaki her kayıt izinli', () => {
    for (const t of TESTIMONIALS) expect(t.consent, t.quote).toBe(true)
  })
})
