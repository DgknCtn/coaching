import { describe, expect, it } from 'vitest'
import { buildNextWeekPreview } from '@/lib/next-week-preview'

// ============================================================
// GELECEK HAFTA ÖZETİ (M1.0-04, EKLE)
//
// NEDEN BU TEST VAR
//
// Canlı test belgesinin örneği: "Salı 18:00 Matematik 60 dk ·
// Cuma 21:30 Takip 30 dk" — öğrencinin gelecek haftaki planlı
// temaslarının tek satırlık, sıralı, iptal-hariç özeti. Bu test o
// biçimi ve sıralama/filtre kurallarını kilitliyor.
// ============================================================

const info = { 'svc-matematik': { label: 'Matematik' }, 'svc-takip': { label: 'Takip' } }

describe('buildNextWeekPreview', () => {
  it('hiç oturum yoksa null döner', () => {
    expect(buildNextWeekPreview([], info)).toBeNull()
  })

  it('tüm oturumlar iptalse null döner', () => {
    const sessions = [
      { currentPlannedAt: '2026-10-27T15:00:00.000Z', serviceId: 'svc-matematik', status: 'iptal', durationMinutes: 60 },
    ]
    expect(buildNextWeekPreview(sessions, info)).toBeNull()
  })

  it('tek oturum için "Gün Saat Etiket Süre" biçimi', () => {
    // 2026-10-27 Salı, 18:00 Istanbul (UTC+3) -> 15:00 UTC.
    const sessions = [
      { currentPlannedAt: '2026-10-27T15:00:00.000Z', serviceId: 'svc-matematik', status: 'planlandi', durationMinutes: 60 },
    ]
    expect(buildNextWeekPreview(sessions, info)).toBe('Salı 18:00 Matematik 60 dk')
  })

  it('belgenin kendi örneği: iki oturum, erkenden geçe sıralı, orta nokta ile ayrılmış', () => {
    const sessions = [
      // Cuma 21:30 Istanbul -> 18:30 UTC
      { currentPlannedAt: '2026-10-30T18:30:00.000Z', serviceId: 'svc-takip', status: 'planlandi', durationMinutes: 30 },
      // Salı 18:00 Istanbul -> 15:00 UTC (dizide SONRADAN verildi, sıralama bunu düzeltmeli)
      { currentPlannedAt: '2026-10-27T15:00:00.000Z', serviceId: 'svc-matematik', status: 'planlandi', durationMinutes: 60 },
    ]
    expect(buildNextWeekPreview(sessions, info)).toBe(
      'Salı 18:00 Matematik 60 dk · Cuma 21:30 Takip 30 dk'
    )
  })

  it('iptal edilen oturum listeden düşer, diğerleri kalır', () => {
    const sessions = [
      { currentPlannedAt: '2026-10-27T15:00:00.000Z', serviceId: 'svc-matematik', status: 'iptal', durationMinutes: 60 },
      { currentPlannedAt: '2026-10-30T18:30:00.000Z', serviceId: 'svc-takip', status: 'planlandi', durationMinutes: 30 },
    ]
    expect(buildNextWeekPreview(sessions, info)).toBe('Cuma 21:30 Takip 30 dk')
  })

  it('süre tanımsızsa " dk" eklenmez', () => {
    const sessions = [
      { currentPlannedAt: '2026-10-27T15:00:00.000Z', serviceId: 'svc-matematik', status: 'planlandi', durationMinutes: null },
    ]
    expect(buildNextWeekPreview(sessions, info)).toBe('Salı 18:00 Matematik')
  })

  it('bilinmeyen hizmet id için "Ders" yedek etiketi kullanılır, çökmez', () => {
    const sessions = [
      { currentPlannedAt: '2026-10-27T15:00:00.000Z', serviceId: 'olmayan-id', status: 'planlandi', durationMinutes: 45 },
    ]
    expect(buildNextWeekPreview(sessions, info)).toBe('Salı 18:00 Ders 45 dk')
  })
})
