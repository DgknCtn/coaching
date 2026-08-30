import { describe, expect, it } from 'vitest'
import {
  buildCurriculumIndex,
  hasActiveSignal,
  sectionCurriculumStatus,
  signalLabel,
  type CurriculumByTopic,
} from '@/lib/curriculum-signal'

// R5.3 kabul testleri MK-01 … MK-08.
// (MK-09 plan kapsamıyla ilgili ve tests/plan-scope.test.ts'te.)

const BUGUN = '2026-10-15'

function index(
  rows: { topic_id: string | null; start_date: string; passed_at?: string | null }[]
): CurriculumByTopic {
  return buildCurriculumIndex(rows.map(r => ({ ...r, passed_at: r.passed_at ?? null })))
}

describe('sectionCurriculumStatus', () => {
  it('MK-01 / MK-02 / MK-03: başlangıç geldiyse Zamanı Geldi', () => {
    // Aynı sinyal üç senaryoda da aynıdır: kitap Aktif/Bekliyor olsun,
    // bölüm plana dahil/dışı olsun — sinyal YALNIZ müfredat zamanına bakar.
    const byTopic = index([{ topic_id: 'fonksiyonlar', start_date: '2026-10-01' }])

    const status = sectionCurriculumStatus('fonksiyonlar', byTopic, BUGUN)
    expect(status).toBe('current')
    expect(hasActiveSignal(status)).toBe(true)
  })

  it('MK-04: başlangıç gelmediyse sinyal yok', () => {
    const byTopic = index([{ topic_id: 'trigonometri', start_date: '2026-12-01' }])

    const status = sectionCurriculumStatus('trigonometri', byTopic, BUGUN)
    expect(status).toBe('upcoming')
    expect(hasActiveSignal(status)).toBe(false)
  })

  it('MK-05: Geçildi olunca aktif sinyal kalkar', () => {
    const byTopic = index([
      { topic_id: 'sayilar', start_date: '2026-09-01', passed_at: '2026-09-28T10:00:00Z' },
    ])

    const status = sectionCurriculumStatus('sayilar', byTopic, BUGUN)
    expect(status).toBe('passed')
    expect(hasActiveSignal(status)).toBe(false)
  })

  it('MK-06: topic eşlemesi yoksa sinyal oluşmaz', () => {
    const byTopic = index([{ topic_id: 'fonksiyonlar', start_date: '2026-10-01' }])

    // Bölümün topic_id'si yok -> R4 normal çalışır, R5 sinyali yok.
    expect(sectionCurriculumStatus(null, byTopic, BUGUN)).toBeNull()
    expect(sectionCurriculumStatus(undefined, byTopic, BUGUN)).toBeNull()
    expect(hasActiveSignal(null)).toBe(false)
  })

  it('MK-07: aynı isim farklı scope -> yalnız doğru topic_id eşleşir', () => {
    // "Fonksiyonlar" hem TYT hem AYT Matematik'te var; bunlar AYRI
    // topic'lerdir. Öğrencinin akışında yalnız TYT'ninki zamanı gelmiş.
    const byTopic = index([
      { topic_id: 'tyt-fonksiyonlar', start_date: '2026-10-01' },
      { topic_id: 'ayt-fonksiyonlar', start_date: '2027-02-01' },
    ])

    expect(sectionCurriculumStatus('tyt-fonksiyonlar', byTopic, BUGUN)).toBe('current')
    expect(sectionCurriculumStatus('ayt-fonksiyonlar', byTopic, BUGUN)).toBe('upcoming')
  })

  it('MK-08: kişisel tarih değişince sinyal ona göre güncellenir', () => {
    const once = index([{ topic_id: 'parabol', start_date: '2026-11-01' }])
    expect(sectionCurriculumStatus('parabol', once, BUGUN)).toBe('upcoming')

    // Eğitmen konuyu öne çekti.
    const sonra = index([{ topic_id: 'parabol', start_date: '2026-10-05' }])
    expect(sectionCurriculumStatus('parabol', sonra, BUGUN)).toBe('current')
  })

  it('öğrencinin akışında olmayan konu sinyal almaz', () => {
    const byTopic = index([{ topic_id: 'fonksiyonlar', start_date: '2026-10-01' }])
    expect(sectionCurriculumStatus('limit', byTopic, BUGUN)).toBeNull()
  })

  it('akış hiç atanmamışsa sinyal yok ve çökme olmaz', () => {
    expect(sectionCurriculumStatus('fonksiyonlar', index([]), BUGUN)).toBeNull()
  })

  it('başlangıç günü bugünse sinyal aktiftir', () => {
    const byTopic = index([{ topic_id: 'x', start_date: BUGUN }])
    expect(sectionCurriculumStatus('x', byTopic, BUGUN)).toBe('current')
  })
})

describe('buildCurriculumIndex', () => {
  it('topic_id olmayan satırları atlar', () => {
    const byTopic = index([
      { topic_id: null, start_date: '2026-10-01' },
      { topic_id: 'x', start_date: '2026-10-01' },
    ])
    expect(byTopic.size).toBe(1)
    expect(byTopic.has('x')).toBe(true)
  })

  it('aynı konu birden fazla blokta ise en erken başlangıç kazanır', () => {
    const byTopic = index([
      { topic_id: 'x', start_date: '2026-11-01' },
      { topic_id: 'x', start_date: '2026-09-01' },
    ])
    expect(byTopic.get('x')?.startDate).toBe('2026-09-01')
  })

  it('passed_at dolu olan blok geçildi sayılır', () => {
    const byTopic = index([
      { topic_id: 'x', start_date: '2026-09-01', passed_at: '2026-09-20T08:00:00Z' },
    ])
    expect(byTopic.get('x')?.passed).toBe(true)
  })
})

describe('signalLabel', () => {
  it('yalnız aktif sinyalde metin üretir', () => {
    expect(signalLabel('current')).toBe('Müfredat zamanı geldi')
    expect(signalLabel('upcoming')).toBeNull()
    expect(signalLabel('passed')).toBeNull()
    expect(signalLabel(null)).toBeNull()
  })
})
