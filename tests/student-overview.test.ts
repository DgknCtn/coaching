import { describe, expect, it } from 'vitest'
import {
  buildAcademicTrail,
  flowDeltaLabel,
  summarizeAcademicFlow,
  summarizeAcademicFlowByScope,
  summarizeProtectionPool,
  summarizeResourcePlan,
  type FlowSummaryItem,
  type PoolSummaryItem,
  type ResourceSummaryItem,
} from '@/lib/student-overview'

// R5.5 kabul testleri OG-01 … OG-08.
// (OG-09 ve OG-10 ekran düzeyinde: mevcut R4 kartları ve link hedefleri.)

const BUGUN = '2026-10-15'

function flowItem(over: Partial<FlowSummaryItem> & { topicId: string }): FlowSummaryItem {
  return {
    topicName: over.topicId,
    scopeId: 'tyt-mat',
    scopeName: 'TYT Matematik',
    startDate: '2026-10-01',
    endDate: '2026-10-21',
    passed: false,
    ...over,
  }
}

describe('summarizeAcademicFlow', () => {
  it('OG-01: zamanı gelmiş konuyu gösterir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Sayılar', startDate: '2026-09-01', endDate: '2026-09-28', passed: true }),
        flowItem({ topicId: 'Fonksiyonlar', startDate: '2026-09-29', endDate: '2026-10-19' }),
      ],
      BUGUN
    )
    expect(ozet.current?.topicName).toBe('Fonksiyonlar')
  })

  it('OG-02: sıradaki yaklaşan konuyu gösterir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Fonksiyonlar', startDate: '2026-09-29', endDate: '2026-10-19' }),
        flowItem({ topicId: 'Polinomlar', startDate: '2026-10-20', endDate: '2026-11-02' }),
        flowItem({ topicId: 'Trigonometri', startDate: '2026-11-03', endDate: '2026-11-23' }),
      ],
      BUGUN
    )
    expect(ozet.current?.topicName).toBe('Fonksiyonlar')
    expect(ozet.upcoming?.topicName).toBe('Polinomlar') // en yakın, Trigonometri değil
  })

  it('Geçildi konular özeti doldurmaz', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Sayılar', startDate: '2026-09-01', endDate: '2026-09-28', passed: true }),
        flowItem({ topicId: 'Kümeler', startDate: '2026-09-10', endDate: '2026-09-30', passed: true }),
      ],
      BUGUN
    )
    // Hepsi geçilmiş: gösterilecek aktif ya da yaklaşan konu yok.
    expect(ozet.current).toBeNull()
    expect(ozet.upcoming).toBeNull()
  })

  it('geçilmiş konu, zamanı gelmiş gibi görünmez', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({ topicId: 'Sayılar', startDate: '2026-09-01', endDate: '2026-09-28', passed: true }),
        flowItem({ topicId: 'Polinomlar', startDate: '2026-11-01', endDate: '2026-11-14' }),
      ],
      BUGUN
    )
    expect(ozet.current).toBeNull()
    expect(ozet.upcoming?.topicName).toBe('Polinomlar')
  })

  it('OG-08: çok scope varsa tek ders üzerinden sade özet verir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({
          topicId: 'Vektörler',
          scopeId: 'ayt-fizik',
          scopeName: 'AYT Fizik',
          startDate: '2026-12-01',
          endDate: '2026-12-21',
        }),
        flowItem({ topicId: 'Fonksiyonlar', startDate: '2026-09-29', endDate: '2026-10-19' }),
      ],
      BUGUN
    )

    // Zamanı gelmiş konusu olan ders öncelikli.
    expect(ozet.scopeName).toBe('TYT Matematik')
    expect(ozet.current?.topicName).toBe('Fonksiyonlar')
    // Diğer dersin varlığı bilgi olarak duruyor ama kart uzamıyor.
    expect(ozet.otherScopeCount).toBe(1)
    // Başka dersin konusu bu kartta görünmez.
    expect(ozet.upcoming?.topicName).not.toBe('Vektörler')
  })

  it('zamanı gelmiş ders yoksa en yakın başlayacak ders seçilir', () => {
    const ozet = summarizeAcademicFlow(
      [
        flowItem({
          topicId: 'Vektörler',
          scopeId: 'ayt-fizik',
          scopeName: 'AYT Fizik',
          startDate: '2026-11-01',
          endDate: '2026-11-21',
        }),
        flowItem({ topicId: 'Limit', startDate: '2026-12-01', endDate: '2026-12-21' }),
      ],
      BUGUN
    )
    expect(ozet.scopeName).toBe('AYT Fizik')
    expect(ozet.upcoming?.topicName).toBe('Vektörler')
  })

  it('OG-07: akış yoksa kırılmaz, nötr boş sonuç döner', () => {
    const ozet = summarizeAcademicFlow([], BUGUN)
    expect(ozet.current).toBeNull()
    expect(ozet.upcoming).toBeNull()
    expect(ozet.scopeName).toBeNull()
    expect(ozet.otherScopeCount).toBe(0)
  })
})

describe('summarizeResourcePlan', () => {
  function res(over: Partial<ResourceSummaryItem> & { bookId: string }): ResourceSummaryItem {
    return {
      title: over.bookId,
      group: 'active',
      planPercentage: 0,
      bookPercentage: 0,
      ...over,
    }
  }

  it('OG-03: aktif kaynakların ilerlemesini özetler', () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: 'A', planPercentage: 80 }),
      res({ bookId: 'B', planPercentage: 40 }),
    ])
    expect(ozet.activeCount).toBe(2)
    expect(ozet.averagePlanPercentage).toBe(60)
  })

  it("OG-04: kart Plan %100'u esas alır, Kitap %66'yı değil", () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: '345 Matematik', planPercentage: 100, bookPercentage: 66 }),
    ])
    expect(ozet.averagePlanPercentage).toBe(100)
    expect(ozet.topActive[0].planPercentage).toBe(100)
    // Kitap % veri olarak duruyor ama ana gösterge değil.
    expect(ozet.topActive[0].bookPercentage).toBe(66)
  })

  it('OG-05: bekleyen ve tamamlanan kaynaklar ayrı sayılır', () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: 'A', group: 'active', planPercentage: 50 }),
      res({ bookId: 'B', group: 'pending' }),
      res({ bookId: 'C', group: 'pending' }),
      res({ bookId: 'D', group: 'completed', planPercentage: 100 }),
    ])
    expect(ozet.activeCount).toBe(1)
    expect(ozet.pendingCount).toBe(2)
    expect(ozet.completedCount).toBe(1)
    // Ortalama yalnız aktif kaynaklardan hesaplanır.
    expect(ozet.averagePlanPercentage).toBe(50)
  })

  it('en düşük ilerlemeli aktif kaynaklar önce gelir', () => {
    const ozet = summarizeResourcePlan([
      res({ bookId: 'A', planPercentage: 90 }),
      res({ bookId: 'B', planPercentage: 20 }),
      res({ bookId: 'C', planPercentage: 55 }),
    ])
    expect(ozet.topActive.map(r => r.bookId)).toEqual(['B', 'C', 'A'])
  })

  it('kart en fazla birkaç kaynak gösterir', () => {
    const items = Array.from({ length: 8 }, (_, i) =>
      res({ bookId: `K${i}`, planPercentage: i * 10 })
    )
    expect(summarizeResourcePlan(items).topActive).toHaveLength(3)
  })

  it('OG-07: kaynak yoksa kırılmaz', () => {
    const ozet = summarizeResourcePlan([])
    expect(ozet.activeCount).toBe(0)
    expect(ozet.averagePlanPercentage).toBeNull()
    expect(ozet.topActive).toEqual([])
  })
})

describe('summarizeProtectionPool', () => {
  function pool(n: number): PoolSummaryItem[] {
    return Array.from({ length: n }, (_, i) => ({
      topicId: `t${i}`,
      topicName: `Konu ${i}`,
      daysSinceContact: 100 - i,
    }))
  }

  it("OG-06: havuzda 8 konu varsa kart yalnız en eski 3'ünü gösterir", () => {
    const ozet = summarizeProtectionPool(pool(8))
    expect(ozet.top).toHaveLength(3)
    expect(ozet.total).toBe(8)
    expect(ozet.top[0].daysSinceContact).toBe(100)
  })

  it("3'ten az konu varsa hepsi gösterilir", () => {
    const ozet = summarizeProtectionPool(pool(2))
    expect(ozet.top).toHaveLength(2)
    expect(ozet.total).toBe(2)
  })

  it('OG-07: havuz boşsa kırılmaz', () => {
    const ozet = summarizeProtectionPool([])
    expect(ozet.top).toEqual([])
    expect(ozet.total).toBe(0)
  })
})

// ============================================================
// summarizeAcademicFlowByScope — R7 / Site Testi 02 §2
//
// NEDEN BU TEST VAR
//
// Eski özet TEK ders döndürüyordu; R7/02 yedisini birden istiyor
// ("7 dersin tamamı gösterilir"). Dönüşümün iki sessiz kırılma biçimi:
//
//   1. ZAMAN İLE GERÇEK DURUM KARIŞIR. "İşlenen konu" öğretmenin
//      tamamlamadığı ilk konudur — planlanan bitişin geçmesi bir konuyu
//      tamamlamaz (MA-08). Tarihe bakan bir uygulama, süresi geçmiş
//      konuyu "bitti" sayardı.
//
//   2. GERİDE/ÖNDE TERS ÇEVRİLİR. İşaret yönü tek bir eksi işaretiyle
//      bozulur ve ekran geride olan öğrenciyi "önde" gösterir.
// ============================================================

describe('summarizeAcademicFlowByScope · 7 ders (§2)', () => {
  // Konunun PENCERESİ ölçütün kendisi: varsayılan üç haftalık bir
  // aralık, belgedeki "planlanan başlangıç-bitiş haftası" ile aynı.
  function item(
    scope: string,
    topic: string,
    start: string,
    passed = false,
    end?: string
  ): FlowSummaryItem {
    return {
      topicId: topic,
      topicName: topic,
      scopeId: scope,
      scopeName: scope === 'mat' ? 'Matematik' : 'Fizik',
      startDate: start,
      endDate: end ?? start,
      passed,
    }
  }

  it('her ders için ayrı satır döndürür', () => {
    const r = summarizeAcademicFlowByScope(
      [item('mat', 'Polinomlar', '2026-10-01'), item('fiz', 'Newton', '2026-10-01')],
      BUGUN
    )
    expect(r).toHaveLength(2)
    expect(r.map(s => s.scopeId).sort()).toEqual(['fiz', 'mat'])
  })

  it('önceki / işlenen / sıradaki üçlüsünü doğru seçer', () => {
    const r = summarizeAcademicFlowByScope(
      [
        item('mat', 'Sayılar', '2026-09-01', true),
        item('mat', 'Polinomlar', '2026-09-15', true),
        item('mat', 'Fonksiyonlar', '2026-10-01'),
        item('mat', 'Denklemler', '2026-10-20'),
      ],
      BUGUN
    )
    expect(r[0].previous?.topicName).toBe('Polinomlar')
    expect(r[0].current?.topicName).toBe('Fonksiyonlar')
    expect(r[0].next?.topicName).toBe('Denklemler')
  })

  it('SÜRESİ GEÇMİŞ konu tamamlanmış SAYILMAZ', () => {
    // ASIL REGRESYON (MA-08): tamamlandı kararı öğretmene aittir.
    // Tarihe bakan bir uygulama bu konuyu geçip sıradakine atlardı.
    const r = summarizeAcademicFlowByScope(
      [item('mat', 'Eski Konu', '2026-08-01'), item('mat', 'Yeni Konu', '2026-10-10')],
      BUGUN
    )
    expect(r[0].current?.topicName).toBe('Eski Konu')
  })

  it('bugün pencerenin İÇİNDEYSE planla uyumlu', () => {
    const r = summarizeAcademicFlowByScope(
      [
        item('mat', 'Sayılar', '2026-09-01', true, '2026-09-28'),
        item('mat', 'Fonksiyonlar', '2026-10-08', false, '2026-10-28'),
      ],
      BUGUN
    )
    expect(r[0].weeksDelta).toBe(0)
    expect(flowDeltaLabel(r[0].weeksDelta)).toBe('Planla uyumlu')
  })

  it('birkaç günlük kayma haftalık gecikmeye çevrilmez', () => {
    // Planlanan bitişi iki gün aşmış bir konuya "1 hafta geride" demek,
    // küçük kaymaları gürültüye çevirirdi.
    const r = summarizeAcademicFlowByScope(
      [item('mat', 'Fonksiyonlar', '2026-09-20', false, '2026-10-13')],
      BUGUN
    )
    expect(r[0].weeksDelta).toBe(0)
  })

  it('planlanan bitiş geçmişse fark NEGATİF', () => {
    // Bugün 15 Ekim; konunun planlanan bitişi 1 Ekim ama öğretmen hâlâ
    // tamamlamamış → iki hafta geride.
    const r = summarizeAcademicFlowByScope(
      [item('mat', 'Eski', '2026-09-10', false, '2026-10-01')],
      BUGUN
    )
    expect(r[0].weeksDelta).toBe(-2)
    expect(flowDeltaLabel(r[0].weeksDelta)).toBe('2 hafta geride')
  })

  it('planlanan başlangıçtan erken işleniyorsa fark POZİTİF', () => {
    // Bugün 15 Ekim; konunun planlanan başlangıcı 29 Ekim ama öğrenci
    // şimdiden orada → iki hafta önde.
    const r = summarizeAcademicFlowByScope(
      [
        item('mat', 'Biten', '2026-09-01', true, '2026-09-28'),
        item('mat', 'Erken Baslanan', '2026-10-29', false, '2026-11-18'),
      ],
      BUGUN
    )
    expect(r[0].weeksDelta).toBe(2)
    expect(flowDeltaLabel(r[0].weeksDelta)).toBe('2 hafta önde')
  })

  it('işlenen konu yoksa ölçüm YAPILMAZ', () => {
    // Ölçülecek bir pencere yok; "geride" demek olmayan bir gecikmeyi
    // uydurmak olurdu.
    expect(flowDeltaLabel(null)).toBeNull()
  })

  it('hepsi tamamlanmışsa işlenen konu yoktur', () => {
    const r = summarizeAcademicFlowByScope(
      [item('mat', 'Bir', '2026-09-01', true), item('mat', 'Iki', '2026-09-15', true)],
      BUGUN
    )
    expect(r[0].current).toBeNull()
    expect(r[0].next).toBeNull()
    expect(r[0].previous?.topicName).toBe('Iki')
    expect(r[0].weeksDelta).toBeNull()
  })

  it('boş girdide ekran kırılmaz', () => {
    expect(summarizeAcademicFlowByScope([], BUGUN)).toEqual([])
  })

  it('dersler ada göre SABİT sırada gelir', () => {
    // Genel Bakış bir triyaj değil fotoğraf: riske göre sıralamak her
    // açılışta dersleri yer değiştirtip göz hafızasını bozardı.
    const r = summarizeAcademicFlowByScope(
      [item('fiz', 'Newton', '2026-10-01'), item('mat', 'Polinom', '2026-10-01')],
      BUGUN
    )
    expect(r.map(s => s.scopeName)).toEqual(['Fizik', 'Matematik'])
  })
})

// ============================================================
// summarizeResourcePlan — R7 / Site Testi 02 §3
//
// NEDEN BU TEST VAR
//
// Kart artık tek tek kitap listelemiyor; "kaynak sistemi sağlıklı mı?"
// sorusunu sayılarla cevaplıyor. Üç sessiz kırılma biçimi var:
//
//   1. TAMAMLANANLAR SAĞLIK HESABINA KARIŞIR. Biten kitaplar toplama
//      girerse otuz kaynaklı öğrencide "çoğu uyumlu" cümlesi, biten
//      kitaplar sayesinde doğru görünür.
//   2. HEDEFSİZ KAYNAK "UYUMLU" SAYILIR. Hedef tarihi olmayan kaynağın
//      temposu ölçülemez; uyumlu saymak kurulmamış bir planı kurulmuş
//      göstermek olur.
//   3. ANA KAYNAK AYRIMI KAYBOLUR. Belge ana kaynakları uyarılarda
//      öncelikli sayıyor — "3 kaynak geride" tek başına bir şey
//      söylemez, hangi üçü olduğu söyler.
// ============================================================

describe('summarizeResourcePlan · kaynak sistemi sağlığı (§3)', () => {
  function res(over: Partial<ResourceSummaryItem> & { bookId: string }): ResourceSummaryItem {
    return {
      title: over.bookId,
      group: 'active',
      planPercentage: 50,
      bookPercentage: 50,
      ...over,
    }
  }

  it('aktif / ana / tamamlanan sayıları ayrı ayrı', () => {
    const r = summarizeResourcePlan([
      res({ bookId: 'a', isMain: true, paceKey: 'on_track' }),
      res({ bookId: 'b', paceKey: 'on_track' }),
      res({ bookId: 'c', group: 'completed' }),
      res({ bookId: 'd', group: 'pending' }),
    ])
    expect(r.activeCount).toBe(2)
    expect(r.mainCount).toBe(1)
    expect(r.completedCount).toBe(1)
    expect(r.pendingCount).toBe(1)
  })

  it('tamamlanan kaynak tempo hesabına GİRMEZ', () => {
    // Biten kitap ne geride kalabilir ne birikme üretir.
    const r = summarizeResourcePlan([
      res({ bookId: 'biten', group: 'completed', paceKey: 'behind', isMain: true }),
      res({ bookId: 'aktif', paceKey: 'behind', isMain: true }),
    ])
    expect(r.pace.behind).toBe(1)
    expect(r.mainCount).toBe(1)
    expect(r.mainBehindCount).toBe(1)
  })

  it('önde giden kaynak "uyumlu" tarafında sayılır', () => {
    const r = summarizeResourcePlan([res({ bookId: 'a', paceKey: 'ahead' })])
    expect(r.pace.onTrack).toBe(1)
    expect(r.pace.behind).toBe(0)
  })

  it('hedefi olmayan kaynak UYUMLU sayılmaz', () => {
    // 'no_target' ve 'not_started' ikisi de "henüz başlamadı"ya düşer;
    // uyumlu saymak kurulmamış bir planı kurulmuş göstermek olurdu.
    const r = summarizeResourcePlan([
      res({ bookId: 'a', paceKey: 'no_target' }),
      res({ bookId: 'b', paceKey: 'not_started' }),
      res({ bookId: 'c' }), // paceKey hiç verilmemiş
    ])
    expect(r.pace.notStarted).toBe(3)
    expect(r.pace.onTrack).toBe(0)
  })

  it('ana kaynak riski ana kaynaklar ÜZERİNDEN sayılır', () => {
    const r = summarizeResourcePlan([
      res({ bookId: 'ana1', isMain: true, paceKey: 'behind' }),
      res({ bookId: 'ana2', isMain: true, paceKey: 'on_track' }),
      res({ bookId: 'yan', paceKey: 'behind' }),
    ])
    expect(r.mainBehindCount).toBe(1)
    expect(r.mainCount).toBe(2)
    // Yan kaynağın geriliği genel tempoda görünür ama ana kaynak
    // riskine karışmaz.
    expect(r.pace.behind).toBe(2)
  })

  it('müfredat birikmesi yalnız ana kaynaklarda sayılır', () => {
    const r = summarizeResourcePlan([
      res({ bookId: 'ana', isMain: true, hasCurriculumBacklog: true }),
      res({ bookId: 'yan', hasCurriculumBacklog: true }),
    ])
    expect(r.mainBacklogCount).toBe(1)
  })

  it('boş girdide ekran kırılmaz', () => {
    const r = summarizeResourcePlan([])
    expect(r.activeCount).toBe(0)
    expect(r.mainCount).toBe(0)
    expect(r.pace).toEqual({ onTrack: 0, behind: 0, notStarted: 0 })
    expect(r.mainBehindCount).toBe(0)
    expect(r.mainBacklogCount).toBe(0)
  })
})

// ============================================================
// buildAcademicTrail — NOT METNİ SIZMAZ (R7/02 §4)
//
// NEDEN BU TEST VAR
//
// Genel Bakış'tan not içeriğini kaldırma kararı ARKA KAPIDAN
// geçersiz kılınmıştı: kart "1 not · son güncelleme 13 gün önce"
// derken hemen altındaki Son Akademik İz notun METNİNİ yazıyordu.
// Ekran paylaşımı gerekçesi (Meet/Zoom) tam olarak bunu yasaklıyor.
//
// Belge bloğu zaten olay kaydı diye tanımlıyor: "Akademik İz yorum
// değil, sistemde gerçekleşen olay kaydıdır" — örnekleri "8 çalışma
// teslim edildi", "Haftalık plan yayınlandı". Hiçbiri alıntı değil.
// ============================================================

describe('buildAcademicTrail · not metni ekrana çıkmaz', () => {
  const GIZLI = 'Velisi arandı, sınav kaygısı konuşuldu'

  it('not girdisi METİN ALANI TAŞIMIYOR (imza koruması)', () => {
    // En güçlü garanti: fonksiyon metni parametre olarak bile almıyor.
    // Bu test derleme düzeyinde de tutar — `note_text` eklenirse tip
    // hatası verir.
    const trail = buildAcademicTrail({
      notes: [
        { id: 'n1', pinned: false, created_at: '2026-09-10T10:00:00Z', author_name: 'Burak' },
      ],
      homework: [],
    })
    expect(trail).toHaveLength(1)
    expect(JSON.stringify(trail)).not.toContain(GIZLI)
  })

  it('olay cümlesi yazıyor, alıntı değil', () => {
    const trail = buildAcademicTrail({
      notes: [
        { id: 'n1', pinned: false, created_at: '2026-09-10T10:00:00Z' },
        { id: 'n2', pinned: true, created_at: '2026-09-11T10:00:00Z' },
      ],
      homework: [],
    })
    const texts = trail.map(t => t.text)
    expect(texts).toContain('Akademik not eklendi')
    expect(texts).toContain('Önemli akademik not eklendi')
  })

  it('ödev kayıtları olay olarak kalmaya devam ediyor', () => {
    const trail = buildAcademicTrail({
      notes: [],
      homework: [
        {
          id: 'h1',
          title: '12. Hafta',
          due_date: '2026-09-20',
          itemCount: 14,
          completedCount: 8,
        },
      ],
    })
    expect(trail[0].text).toBe('12. Hafta')
    expect(trail[0].detail).toBe('8/14 tamamlandı')
  })

  it('en yeniden eskiye sıralar', () => {
    const trail = buildAcademicTrail({
      notes: [
        { id: 'eski', pinned: false, created_at: '2026-09-01T10:00:00Z' },
        { id: 'yeni', pinned: false, created_at: '2026-09-20T10:00:00Z' },
      ],
      homework: [],
    })
    expect(trail[0].id).toBe('note-yeni')
  })
})
