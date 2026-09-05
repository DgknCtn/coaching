import { describe, it, expect } from 'vitest'
import { nextExam, countdown, formatCountdown } from '@/lib/exam-dates'

describe('nextExam', () => {
  it('bu yılın sınavı geçmişse ertesi yıla geçer', () => {
    // Geri sayımın eksiye düşüp "-3 gün" göstermesi, bakımsız bir ekran
    // demektir; sınav günü geçtiği an sıradaki oturuma dönmeli.
    const afterYks2026 = new Date('2026-09-05T12:00:00+03:00')
    const yks = nextExam('yks', afterYks2026)

    expect(yks.date.getFullYear()).toBe(2027)
    expect(yks.date.getTime()).toBeGreaterThan(afterYks2026.getTime())
  })

  it('sınav günü henüz gelmemişse bu yılı verir', () => {
    const beforeLgs = new Date('2027-01-10T09:00:00+03:00')
    expect(nextExam('lgs', beforeLgs).date.getFullYear()).toBe(2027)
  })

  it('açıklanmış tarihi tahmin olarak işaretlemez', () => {
    expect(nextExam('lgs', new Date('2027-01-10T09:00:00+03:00')).estimated).toBe(false)
  })

  it('takvim bittiğinde tahmin üretir ve tahmin olduğunu söyler', () => {
    // Kesin olmayan bir tarihi kesinmiş gibi göstermek, geri sayımı hiç
    // göstermemekten daha zararlı.
    const far = new Date('2030-01-01T00:00:00+03:00')
    const yks = nextExam('yks', far)

    expect(yks.estimated).toBe(true)
    expect(yks.date.getTime()).toBeGreaterThan(far.getTime())
    expect(yks.date.getMonth()).toBe(5) // haziran
  })

  it('LGS her zaman YKS\'den önce gelir', () => {
    const now = new Date('2026-09-05T12:00:00+03:00')
    expect(nextExam('lgs', now).date.getTime()).toBeLessThan(
      nextExam('yks', now).date.getTime()
    )
  })
})

describe('countdown', () => {
  it('gün, saat ve dakikayı aşağı yuvarlar', () => {
    // Yukarı yuvarlamak, sınava kalan süreyi olduğundan uzun göstermek
    // olurdu.
    const now = new Date('2026-01-01T00:00:00Z')
    const target = new Date('2026-01-04T05:30:45Z')

    expect(countdown(target, now)).toEqual({
      days: 3,
      hours: 5,
      minutes: 30,
      passed: false,
    })
  })

  it('geçmiş tarihte eksiye düşmez', () => {
    const now = new Date('2026-06-21T00:00:00Z')
    const c = countdown(new Date('2026-06-20T00:00:00Z'), now)

    expect(c.passed).toBe(true)
    expect(c.days).toBe(0)
  })
})

describe('formatCountdown', () => {
  it('uzun sürede dakika göstermez', () => {
    // 280 gün varken her dakika değişen bir rakam, ekranı meşgul eden
    // ama hiçbir karara girmeyen bir gürültüdür.
    expect(formatCountdown({ days: 280, hours: 16, minutes: 42, passed: false })).toBe(
      '280g 16s'
    )
  })

  it('istendiğinde dakikayı da yazar', () => {
    expect(
      formatCountdown({ days: 6, hours: 23, minutes: 57, passed: false }, true)
    ).toBe('6g 23s 57d')
  })

  it('son gün dakikayı kendiliğinden gösterir', () => {
    // Gün kalmadığında "3s" tek başına, kullanıcıyı sayfayı yenileyip
    // durmaya bırakır.
    expect(formatCountdown({ days: 0, hours: 3, minutes: 12, passed: false })).toBe(
      '3s 12d'
    )
  })

  it('süre dolduğunda sayı basmaz', () => {
    expect(formatCountdown({ days: 0, hours: 0, minutes: 0, passed: true })).toBe('doldu')
  })
})
