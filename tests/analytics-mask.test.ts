import { describe, it, expect } from 'vitest'
import { maskAnalyticsUrl } from '@/components/shared/web-analytics'

// ANALİTİĞE KİMLİK GİTMEZ (canlıya alma, Faz 1.6).
// Panel adresleri öğrenci kimliği, davet adresleri jeton taşıyor; ölçüm
// yalnız ekran türünü görmeli.

describe('analitik · adres maskeleme', () => {
  it('öğrenci kimliğini ve sorgu dizesini atar', () => {
    expect(
      maskAnalyticsUrl(
        'https://app.example.com/teacher/students/3f2b1c9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f?sekme=veliler'
      )
    ).toBe('https://app.example.com/teacher/students/:id')
  })

  it('iç içe kimlikleri ayrı ayrı maskeler', () => {
    expect(
      maskAnalyticsUrl(
        'https://x.test/teacher/students/3f2b1c9e-1a2b-4c3d-8e9f-0a1b2c3d4e5f/books/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE'
      )
    ).toBe('https://x.test/teacher/students/:id/books/:id')
  })

  it('davet jetonunu maskeler', () => {
    expect(maskAnalyticsUrl('https://x.test/invite/' + 'a'.repeat(64) + '/kabul')).toBe(
      'https://x.test/invite/:token/kabul'
    )
  })

  it('kimliksiz adrese dokunmaz, parçayı (#) atar', () => {
    expect(maskAnalyticsUrl('https://x.test/login#x')).toBe('https://x.test/login')
  })
})
