import { describe, expect, it } from 'vitest'
import {
  activeWorkTopics,
  buildProtectionPool,
  contactAmountLabel,
  contactSourceLabel,
  daysBetween,
  poolPriority,
  summarizePool,
  type PoolRowInput,
} from '@/lib/protection-pool'

// R5.4 kabul testleri KH-01 … KH-17.
//
// Veritabanı düzeyinde garanti edilenler (view tanımıyla) ayrıca
// işaretlendi; onlar migration 041'in sorgusuyla sağlanır.

const BUGUN = '2026-12-20'

function row(over: Partial<PoolRowInput> & { topicId: string }): PoolRowInput {
  return {
    topicName: over.topicId,
    scopeId: 'tyt-mat',
    scopeName: 'TYT Matematik',
    lastContactDate: null,
    lastContactSource: null,
    lastContactAmount: 0,
    openWorkCount: 0,
    keepActive: false,
    bookTitles: [],
    ...over,
  }
}

/** n gün önce. */
function gunOnce(n: number): string {
  const d = new Date(`${BUGUN}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

describe('KH-01 / KH-02 / KH-03 · temas oluşturmayan olaylar', () => {
  it('KH-01: müfredat zamanı geldi ama çalışma yok -> havuzda görünmez', () => {
    // Akışta olan ama hiç teması olmayan konu.
    const pool = buildProtectionPool([row({ topicId: 'Fonksiyonlar' })], BUGUN)
    expect(pool).toHaveLength(0)
  })

  it('KH-02: ödev verildi ama yapılmadı -> son temas oluşmaz', () => {
    // Açık ödev var, temas yok: hem temassız hem aktif çalışma.
    const pool = buildProtectionPool(
      [row({ topicId: 'Parabol', openWorkCount: 3 })],
      BUGUN
    )
    expect(pool).toHaveLength(0)
  })

  it('KH-03: onay bekleyen gönderim kesin temas sayılmaz', () => {
    // Onay bekleyen kalem homework_items'ta 'pending_approval'dır ve
    // student_topic_contact_view'a HİÇ girmez (yalnız test_completions
    // status='active' okunur). Girdide temas yoktur.
    const pool = buildProtectionPool(
      [row({ topicId: 'Limit', openWorkCount: 1 })],
      BUGUN
    )
    expect(pool).toHaveLength(0)
  })
})

describe('KH-05 · bir test bile temastır', () => {
  it('tek onaylı çalışma geçerli temas oluşturur', () => {
    const pool = buildProtectionPool(
      [
        row({
          topicId: 'Sayılar',
          lastContactDate: gunOnce(9),
          lastContactSource: 'homework',
          lastContactAmount: 1,
        }),
      ],
      BUGUN
    )

    expect(pool).toHaveLength(1)
    expect(pool[0].daysSinceContact).toBe(9)
  })

  it('yapay eşik yok: 1 çalışma da 20 çalışma da temastır', () => {
    const az = buildProtectionPool(
      [row({ topicId: 'A', lastContactDate: gunOnce(5), lastContactAmount: 1 })],
      BUGUN
    )
    const cok = buildProtectionPool(
      [row({ topicId: 'B', lastContactDate: gunOnce(5), lastContactAmount: 20 })],
      BUGUN
    )
    expect(az).toHaveLength(1)
    expect(cok).toHaveLength(1)
  })
})

describe('KH-10 · sıralama', () => {
  it('65 / 42 / 27 / 8 günlük konular bu sırayla listelenir', () => {
    const pool = buildProtectionPool(
      [
        row({ topicId: 'Parabol', lastContactDate: gunOnce(8), lastContactSource: 'homework' }),
        row({ topicId: 'Fonksiyonlar', lastContactDate: gunOnce(65), lastContactSource: 'homework' }),
        row({ topicId: 'Sayı Kümeleri', lastContactDate: gunOnce(27), lastContactSource: 'homework' }),
        row({ topicId: 'Problemler', lastContactDate: gunOnce(42), lastContactSource: 'homework' }),
      ],
      BUGUN
    )

    expect(pool.map(r => r.topicName)).toEqual([
      'Fonksiyonlar',
      'Problemler',
      'Sayı Kümeleri',
      'Parabol',
    ])
    expect(pool.map(r => r.daysSinceContact)).toEqual([65, 42, 27, 8])
  })

  it('eşit günlerde ad sırası kullanılır (deterministik liste)', () => {
    const pool = buildProtectionPool(
      [
        row({ topicId: 'Zeta', lastContactDate: gunOnce(10) }),
        row({ topicId: 'Alfa', lastContactDate: gunOnce(10) }),
      ],
      BUGUN
    )
    expect(pool.map(r => r.topicName)).toEqual(['Alfa', 'Zeta'])
  })
})

describe('KH-11 · yeni çalışma gelince konu aşağı iner', () => {
  it('en eski konuya yeni temas girilince sıralama değişir', () => {
    const once = buildProtectionPool(
      [
        row({ topicId: 'Fonksiyonlar', lastContactDate: gunOnce(65) }),
        row({ topicId: 'Problemler', lastContactDate: gunOnce(42) }),
      ],
      BUGUN
    )
    expect(once[0].topicName).toBe('Fonksiyonlar')

    // Fonksiyonlar'a bugün onaylı çalışma geldi.
    const sonra = buildProtectionPool(
      [
        row({ topicId: 'Fonksiyonlar', lastContactDate: gunOnce(0) }),
        row({ topicId: 'Problemler', lastContactDate: gunOnce(42) }),
      ],
      BUGUN
    )
    expect(sonra[0].topicName).toBe('Problemler')
    expect(sonra[1].daysSinceContact).toBe(0)
  })
})

describe('KH-13 / KH-14 · aktif çalışma ile ilişki', () => {
  it('KH-14: yeni açık ödev verilen konu havuzdan çıkar', () => {
    const gecmisi = row({
      topicId: 'Fonksiyonlar',
      lastContactDate: gunOnce(40),
      lastContactSource: 'homework',
    })

    expect(buildProtectionPool([gecmisi], BUGUN)).toHaveLength(1)
    expect(buildProtectionPool([{ ...gecmisi, openWorkCount: 2 }], BUGUN)).toHaveLength(0)
  })

  it('KH-13: açık çalışma kapanınca geçmiş temaslı konu havuzda görünür', () => {
    const acik = row({
      topicId: 'Fonksiyonlar',
      lastContactDate: gunOnce(40),
      openWorkCount: 2,
    })
    expect(buildProtectionPool([acik], BUGUN)).toHaveLength(0)

    const kapandi = { ...acik, openWorkCount: 0 }
    const pool = buildProtectionPool([kapandi], BUGUN)
    expect(pool).toHaveLength(1)
    expect(pool[0].daysSinceContact).toBe(40)
  })

  it('"Aktif Tut" override konuyu havuz dışında tutar', () => {
    const pool = buildProtectionPool(
      [row({ topicId: 'Parabol', lastContactDate: gunOnce(50), keepActive: true })],
      BUGUN
    )
    expect(pool).toHaveLength(0)
  })

  it('aktif çalışmadaki konular ayrıca listelenebilir', () => {
    const rows = [
      row({ topicId: 'A', lastContactDate: gunOnce(40), openWorkCount: 1 }),
      row({ topicId: 'B', lastContactDate: gunOnce(20) }),
      row({ topicId: 'C', keepActive: true }),
    ]
    expect(activeWorkTopics(rows).map(r => r.topicId)).toEqual(['A', 'C'])
  })
})

describe('KH-12 / KH-17 · geçmiş korunur', () => {
  it('KH-17: akıştan çıkarılan konu havuzda görünmez, kaydı silinmez', () => {
    // Girdi listesi öğrencinin AKTİF akışıyla sınırlıdır; akıştan çıkan
    // konu sunucu sorgusunda hiç gelmez. Havuz onu üretemez.
    const akistakiler = [row({ topicId: 'Parabol', lastContactDate: gunOnce(12) })]
    const pool = buildProtectionPool(akistakiler, BUGUN)

    expect(pool.map(r => r.topicName)).toEqual(['Parabol'])
    expect(pool.map(r => r.topicName)).not.toContain('Fonksiyonlar')
  })

  it('KH-12: plan dışı bırakılan konunun teması hesapta kalır', () => {
    // Plan kapsamı hedefe aittir; temas ise gerçekleşmiş çalışmaya.
    // İkisi bağımsızdır, bu yüzden havuz kapsamı hiç okumaz.
    const pool = buildProtectionPool(
      [row({ topicId: 'Fonksiyonlar', lastContactDate: gunOnce(30) })],
      BUGUN
    )
    expect(pool[0].daysSinceContact).toBe(30)
  })
})

describe('poolPriority', () => {
  it('bantlar yalnız görsel vurgudur, eşik değildir', () => {
    expect(poolPriority(0)).toBe('normal')
    expect(poolPriority(13)).toBe('normal')
    expect(poolPriority(14)).toBe('watch')
    expect(poolPriority(29)).toBe('watch')
    expect(poolPriority(30)).toBe('priority')
    expect(poolPriority(65)).toBe('priority')
  })
})

describe('daysBetween', () => {
  it('gün farkını tam sayı olarak verir', () => {
    expect(daysBetween('2026-12-01', '2026-12-20')).toBe(19)
    expect(daysBetween('2026-12-20', '2026-12-20')).toBe(0)
  })

  it('ay ve yıl sınırını geçer', () => {
    expect(daysBetween('2026-12-28', '2027-01-04')).toBe(7)
  })

  it('gelecekteki tarih negatif değil sıfır döner', () => {
    expect(daysBetween('2027-01-01', '2026-12-20')).toBe(0)
  })
})

describe('summarizePool', () => {
  it('üst şerit sayılarını üretir', () => {
    const rows = [
      row({ topicId: 'Fonksiyonlar', lastContactDate: gunOnce(65) }),
      row({ topicId: 'Problemler', lastContactDate: gunOnce(42) }),
      row({ topicId: 'Parabol', lastContactDate: gunOnce(8) }),
      row({ topicId: 'Limit', openWorkCount: 2, lastContactDate: gunOnce(3) }),
      row({ topicId: 'Türev' }),
    ]
    const pool = buildProtectionPool(rows, BUGUN)
    const ozet = summarizePool(rows, pool)

    expect(ozet.trackedTopics).toBe(5)
    expect(ozet.inPool).toBe(3)
    expect(ozet.overThirtyDays).toBe(2)
    expect(ozet.longestDays).toBe(65)
    expect(ozet.longestTopicName).toBe('Fonksiyonlar')
    expect(ozet.averageDays).toBe(38) // (65+42+8)/3 = 38,3
  })

  it('boş havuzda ortalama null döner, sıfıra bölme yok', () => {
    const ozet = summarizePool([], [])
    expect(ozet.inPool).toBe(0)
    expect(ozet.averageDays).toBeNull()
    expect(ozet.longestDays).toBeNull()
  })
})

describe('etiketler', () => {
  it('temas kaynağını Türkçeleştirir', () => {
    expect(contactSourceLabel('homework')).toBe('Test çalışması')
    expect(contactSourceLabel('lesson')).toBe('Ders')
    expect(contactSourceLabel('self_study')).toBe('Kendi çalışması')
    expect(contactSourceLabel(null)).toBe('—')
  })

  it('miktar yalnız test çalışmasında gösterilir', () => {
    expect(contactAmountLabel({ lastContactAmount: 2, lastContactSource: 'homework' })).toBe(
      '2 çalışma'
    )
    expect(contactAmountLabel({ lastContactAmount: 1, lastContactSource: 'lesson' })).toBeNull()
    expect(contactAmountLabel({ lastContactAmount: 0, lastContactSource: 'homework' })).toBeNull()
  })
})
