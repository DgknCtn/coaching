import { describe, expect, it } from 'vitest'

import { buildShareText, formatDueDate } from '@/lib/share-text'
import { countApplicable, filterApplicable, isActionApplicable } from '@/lib/bulk-actions'
import { isSelectableState } from '@/lib/book-map'
import { unitLabel, formatUnitCount, perWeekLabel } from '@/lib/unit-labels'
import {
  RESOURCE_TYPES,
  STRUCTURE_KINDS,
  TRACKING_MODES,
  VIDEO_MODES,
  VIDEO_MODE_OPTIONS,
  hasVideoUsage,
  videoUrlIsProminent,
} from '@/lib/book-taxonomy'
import type { HomeworkTestState } from '@/lib/homework-status'

// ============================================================
// R7 — KABUL VE REGRESYON PAKETİ
//
// İki dokümanın kabul listeleri:
//   * R7 Revizyon Dokümanı §3 (R6-03.1-6 ve R7-01…04)
//   * R7-02 Uygulama Talimatı §12 (12 maddelik kabul listesi)
//
// R7'nin en büyük riski YENİ ÖZELLİK DEĞİL, mevcut çalışan davranışın
// sessizce kayması: takip türü beşe çıktı, video seçenekleri değişti, harita
// tek yüzeyde birleşti. Bu dosya hem yeni kuralları hem de "değişmemesi
// gereken"i kabul numaralarıyla kilitler.
// ============================================================

describe('R7-02 §6.5 · takip türü genişlemesi', () => {
  it('eski iki tür korunur, üç yeni tür eklenir', () => {
    expect(TRACKING_MODES).toEqual(['test', 'page', 'section', 'step', 'trial'])
  })

  it('test ve sayfa birimlerinin anlamı DEĞİŞMEDİ (R6-01 regresyonu)', () => {
    expect(unitLabel('test')).toBe('test')
    expect(unitLabel('page')).toBe('sayfa')
    expect(formatUnitCount(614, 'page')).toBe('614 sayfa')
    expect(perWeekLabel('page')).toBe('sayfa/hafta')
  })

  it('yeni türler kendi birim adını üretir', () => {
    expect(unitLabel('section')).toBe('bölüm')
    expect(unitLabel('step')).toBe('adım')
    expect(unitLabel('trial')).toBe('deneme')
    expect(formatUnitCount(4, 'trial')).toBe('4 deneme')
  })
})

describe('R7-02 §6.2-6.3 · Kaynak Türü ve Yapısı', () => {
  it('kabul #6/#7 sözlüğü: Soru Bankası ve Video Destekli Defter mevcut', () => {
    expect(RESOURCE_TYPES).toContain('Soru Bankası')
    expect(RESOURCE_TYPES).toContain('Video Destekli Defter')
    expect(RESOURCE_TYPES).toContain('Kamp Kitabı')
  })

  it('varsayılan "Belirtilmedi" listede ilk sıradadır (eski kayıtların değeri)', () => {
    expect(RESOURCE_TYPES[0]).toBe('Belirtilmedi')
  })

  it('kaynak yapısı yalnız iki değer taşır', () => {
    expect(STRUCTURE_KINDS).toEqual(['single', 'multi'])
  })
})

describe('R7-02 §7.1 · Video Kullanımı', () => {
  it('kabul #6: Soru Çözüm Videoları ve #7: Video Ders Akışı seçilebilir', () => {
    expect(VIDEO_MODES).toContain('solution_videos')
    expect(VIDEO_MODES).toContain('video_course')
    expect(VIDEO_MODES).toContain('mixed')
  })

  it('§11: eski book/section değerleri DÖNÜŞTÜRÜLMEZ, geçerli kalır', () => {
    expect(VIDEO_MODES).toContain('book')
    expect(VIDEO_MODES).toContain('section')
    const legacy = VIDEO_MODE_OPTIONS.filter(v => v.legacy).map(v => v.value)
    expect(legacy).toEqual(['book', 'section'])
  })

  it('none dışındaki her değer "video var" sayılır (eski kayıtlar dahil)', () => {
    expect(hasVideoUsage('none')).toBe(false)
    expect(hasVideoUsage(null)).toBe(false)
    expect(hasVideoUsage('solution_videos')).toBe(true)
    expect(hasVideoUsage('book')).toBe(true)
  })

  it('bağlantı yalnız ders akışı ve karma kullanımda öne çıkar', () => {
    expect(videoUrlIsProminent('video_course')).toBe(true)
    expect(videoUrlIsProminent('mixed')).toBe(true)
    expect(videoUrlIsProminent('solution_videos')).toBe(false)
    expect(videoUrlIsProminent('none')).toBe(false)
  })
})

describe('R6-03.1-2 · tek haritada seçim ve uygun işlemler', () => {
  const states: HomeworkTestState[] = [
    'not_assigned',
    'not_assigned',
    'assigned',
    'pending_approval',
    'pending_approval',
    'completed',
    'overdue',
  ]

  it('kabul R6-03.1: altı durum da seçilebilir; seçim durum değiştirmez', () => {
    // isSelectableState yalnız SEÇİLEBİLİRLİĞİ söyler; hiçbir yan etkisi yok.
    for (const state of states) {
      expect(isSelectableState(state, 'manage')).toBe(true)
    }
    expect(isSelectableState('no_test', 'manage')).toBe(false)
  })

  it('kabul R6-03.2: yalnız uygun eylemler sayılır', () => {
    expect(countApplicable(states)).toEqual({
      selected: 7,
      // Ödeve Ekle yalnız henüz verilmemişlere
      assign: 2,
      // Tamamlandı Olarak İşle tamamlanmışlar dışında hepsine
      complete: 6,
      // Onayla yalnız öğrencinin gönderdiklerine
      approve: 2,
      // Geri Al yalnız tamamlanmışlara
      revert: 1,
    })
  })

  it('Ödeve Ekle ile Tamamlandı Olarak İşle AYNI işlem değildir', () => {
    expect(isActionApplicable('assign', 'pending_approval')).toBe(false)
    expect(isActionApplicable('complete', 'pending_approval')).toBe(true)
  })

  it('sunucuya/sepete yalnız uygun birimler gider', () => {
    const units = [
      { id: 'a', state: 'not_assigned' as HomeworkTestState },
      { id: 'b', state: 'completed' as HomeworkTestState },
      { id: 'c', state: 'pending_approval' as HomeworkTestState },
    ]
    expect(filterApplicable('assign', units)).toEqual(['a'])
    expect(filterApplicable('approve', units)).toEqual(['c'])
    expect(filterApplicable('revert', units)).toEqual(['b'])
  })

  it('plan modunun eski davranışı korunur (R3/R4 regresyonu)', () => {
    expect(isSelectableState('not_assigned')).toBe(true)
    expect(isSelectableState('completed')).toBe(false)
  })
})

describe('R7-01 · WhatsApp teslim tarihi', () => {
  it('kabul R7-01: doğal tarih + kalan gün', () => {
    expect(formatDueDate('2026-08-31', '2026-08-24')).toBe(
      '31 Ağustos 2026 Pazartesi (7 gün sonra)'
    )
  })

  it('gün farkı UTC kaymasına düşmez (R6-02 semantiği)', () => {
    // Yerel gün mantığı: teslim günü boyunca "Bugün" der, ertesi gün değil.
    expect(formatDueDate('2026-08-31', '2026-08-31')).toContain('(Bugün)')
    expect(formatDueDate('2026-08-31', '2026-08-30')).toContain('(Yarın)')
  })
})

describe('R7-02/R7-04 · WhatsApp metni', () => {
  const text = buildShareText({
    studentName: 'Ömer',
    dueDate: '2026-08-31',
    today: '2026-08-24',
    note: 'Tekrarlarımızı unutmayalım.',
    books: [
      {
        bookTitle: '345 Matematik',
        trackingMode: 'test',
        unitCount: 1,
        sections: [{ title: '5. Bölüm - Trigonometri 1', units: [4] }],
      },
      {
        bookTitle: 'TED Math 9 - Book 2',
        trackingMode: 'page',
        unitCount: 10,
        sections: [
          { title: '4.1 Geometric Transformations', units: Array.from({ length: 10 }, (_, i) => i + 1) },
        ],
      },
    ],
  })

  it('kabul R7-02: her kitap için doğru miktar yazar', () => {
    expect(text).toContain('345 Matematik (1 test)')
    expect(text).toContain('TED Math 9 - Book 2 (10 sayfa)')
  })

  it('kabul R7-04: hiyerarşi öğrenci → tarih → kitap → çalışma → not sırasında', () => {
    const lines = text.split('\n')
    const idx = (needle: string) => lines.findIndex(l => l.startsWith(needle))
    expect(idx('Merhaba')).toBeLessThan(idx('Teslim tarihi:'))
    expect(idx('Teslim tarihi:')).toBeLessThan(idx('345 Matematik'))
    expect(idx('345 Matematik')).toBeLessThan(idx('• 5. Bölüm'))
    expect(idx('• 5. Bölüm')).toBeLessThan(idx('Not:'))
    expect(idx('Not:')).toBeLessThan(idx('Çalışmalarını tamamladığında'))
  })

  it('R6-05 regresyonu: not boşken çıktıya hiçbir şey eklenmez', () => {
    const withoutNote = buildShareText({
      studentName: 'Ömer',
      dueDate: '2026-08-31',
      today: '2026-08-24',
      books: [
        {
          bookTitle: '345 Matematik',
          trackingMode: 'test',
          unitCount: 1,
          sections: [{ title: 'Trigonometri', units: [4] }],
        },
      ],
    })
    expect(withoutNote).not.toContain('Not:')
  })

  it('R4 regresyonu: sıkıştırma kuralları korunur', () => {
    const compressed = buildShareText({
      studentName: 'Ayşe',
      dueDate: '2026-09-01',
      today: '2026-08-25',
      books: [
        {
          bookTitle: 'Bilgi Sarmal TYT Kimya',
          trackingMode: 'test',
          unitCount: 5,
          sections: [{ title: 'Mol', units: [1, 2, 3, 4, 5] }],
        },
      ],
    })
    expect(compressed).toContain('• Mol → 1-5. Test')
  })
})
