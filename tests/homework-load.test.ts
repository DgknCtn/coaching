import { describe, it, expect } from 'vitest'
import {
  summarizeLoad,
  formatLoadLines,
  formatDueDateTime,
  formatDaysLeft,
  dueAtFromLocal,
  localClock,
} from '@/lib/homework-load'
import { buildShareText } from '@/lib/share-text'

// M1.0-01 §2–3: sepet kartı ve WhatsApp aynı yük özetini kullanır.

const units = (page: number, test: number) => [
  ...Array.from({ length: page }, () => ({ trackingMode: 'page' })),
  ...Array.from({ length: test }, () => ({ trackingMode: 'test' })),
]

// 4 Ekim 2026 Pazar 10:00 İstanbul (UTC+3)
const NOW = new Date('2026-10-04T07:00:00Z')

describe('summarizeLoad (M1.0-01 §2)', () => {
  it('doküman örneği: 85 çalışma, 6 gün → ~15', () => {
    const s = summarizeLoad(units(60, 25), '2026-10-10', NOW)
    expect(s.total).toBe(85)
    expect(s.breakdown).toEqual([
      { mode: 'page', count: 60 },
      { mode: 'test', count: 25 },
    ])
    expect(s.daysLeft).toBe(6)
    expect(s.dailyAverage).toBe(15)
    expect(formatLoadLines(s)).toEqual([
      'Toplam: 85 çalışma',
      '60 sayfa · 25 test',
      'Günlük ort.: ~15 çalışma',
    ])
  })

  it('gün farkı İstanbul takvim günüyle: gece 23:30 UTC henüz ertesi gün değil', () => {
    // 2026-10-04 23:30 İstanbul = 20:30 UTC → hâlâ 4 Ekim.
    const late = new Date('2026-10-04T20:30:00Z')
    expect(summarizeLoad(units(1, 0), '2026-10-10', late).daysLeft).toBe(6)
    // 2026-10-05 00:30 İstanbul = 21:30 UTC (4 Ekim) → artık 5 Ekim.
    const afterMidnight = new Date('2026-10-04T21:30:00Z')
    expect(summarizeLoad(units(1, 0), '2026-10-10', afterMidnight).daysLeft).toBe(5)
  })

  it('bugün teslimde bölen 1 olur, ortalama toplamın kendisidir', () => {
    const s = summarizeLoad(units(10, 2), '2026-10-04', NOW)
    expect(s.daysLeft).toBe(0)
    expect(s.dailyAverage).toBe(12)
  })

  it('teslim yoksa günlük ortalama satırı oluşmaz', () => {
    const s = summarizeLoad(units(3, 0), null, NOW)
    expect(s.dailyAverage).toBeNull()
    expect(formatLoadLines(s)).toEqual(['Toplam: 3 çalışma', '3 sayfa'])
  })

  it('boş sepette satır üretmez', () => {
    expect(formatLoadLines(summarizeLoad([], '2026-10-10', NOW))).toEqual([])
  })

  it('bilinmeyen takip türü test sayılır; diğer türler kendi adıyla', () => {
    const s = summarizeLoad(
      [{ trackingMode: null }, { trackingMode: 'trial' }, { trackingMode: 'trial' }],
      '2026-10-10',
      NOW
    )
    expect(formatLoadLines(s)[1]).toBe('1 test · 2 deneme')
  })
})

describe('son teslim gün + saat', () => {
  it('"10 Ekim 2026 Cumartesi · 18:00"', () => {
    const at = dueAtFromLocal('2026-10-10', '18:00')!
    expect(at.toISOString()).toBe('2026-10-10T15:00:00.000Z')
    expect(formatDueDateTime('2026-10-10', at)).toBe('10 Ekim 2026 Cumartesi · 18:00')
    expect(localClock(at)).toBe('18:00')
  })

  it('saat yoksa yalnız gün', () => {
    expect(formatDueDateTime('2026-10-10')).toBe('10 Ekim 2026 Cumartesi')
    expect(dueAtFromLocal('2026-10-10', '')).toBeNull()
  })

  it('kalan gün etiketi', () => {
    expect(formatDaysLeft(6)).toBe('6 gün kaldı')
    expect(formatDaysLeft(1)).toBe('Yarın')
    expect(formatDaysLeft(0)).toBe('Bugün')
    expect(formatDaysLeft(null)).toBeNull()
  })
})

describe('WhatsApp hedef metni (M1.0-01 §3)', () => {
  const load = summarizeLoad(units(60, 25), '2026-10-10', NOW)
  const base = {
    studentName: 'Dünya',
    dueDate: '2026-10-10',
    dueAt: dueAtFromLocal('2026-10-10', '18:00'),
    today: '2026-10-04',
    load,
    books: [
      {
        bookTitle: 'Parkur 10. Sınıf Matematik',
        trackingMode: 'page',
        unitCount: 29,
        sections: [
          { title: 'T1 | B1 · Ge. Şek. Dik Üçgende Trigonometri', units: [16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26] },
        ],
      },
    ],
  }

  it('teslim gün+saat, toplam, kırılım ve günlük ortalama sepetle aynı', () => {
    const text = buildShareText(base)
    expect(text.split('\n').slice(0, 10)).toEqual([
      'Merhaba Dünya,',
      '',
      'Bu haftaki çalışmaların:',
      '',
      'Teslim: 10 Ekim 2026 Cumartesi · 18:00 (6 gün sonra)',
      ...formatLoadLines(load),
      '',
      'Parkur 10. Sınıf Matematik · 29 sayfa',
    ])
  })

  it('panel hatırlatma cümlesi yok; not boşsa Not bloğu yok', () => {
    const text = buildShareText({ ...base, note: '   ' })
    expect(text).not.toContain('panelden')
    expect(text).not.toContain('Not:')
    expect(text.endsWith('→ sf. 16-26')).toBe(true)
  })

  it('not varsa yalnız o zaman Not bloğu eklenir', () => {
    expect(buildShareText({ ...base, note: 'Videoyu izle.' })).toContain('\n\nNot: Videoyu izle.')
  })
})
