import { describe, expect, it } from 'vitest'
import {
  addWeeks,
  buildFlowFromTemplate,
  deriveFlowStatus,
  deriveFlowStatuses,
  durationWeeks,
  endDateFor,
  insertItem,
  mergeWithNext,
  moveItem,
  removeItem,
  resizeItem,
  setPassed,
  splitItem,
  summarizeFlow,
  type FlowItem,
} from '@/lib/curriculum-flow'

// R5.2 kabul testleri MA-01 … MA-11.

function item(over: Partial<FlowItem> & { id: string; name: string }): FlowItem {
  return {
    topicId: null,
    startDate: '2026-09-01',
    endDate: '2026-09-14',
    passed: false,
    note: null,
    ...over,
  }
}

/** Şartnamedeki örnek akış: 2 + 2 + 3 hafta, 1 Eylül'den başlayarak. */
function ornekAkis(): FlowItem[] {
  return buildFlowFromTemplate(
    [
      { name: 'Temel Kavramlar', durationWeeks: 2 },
      { name: 'Sayılar', durationWeeks: 2 },
      { name: 'Fonksiyonlar', durationWeeks: 3 },
      { name: 'Polinomlar', durationWeeks: 2 },
    ],
    '2026-09-01'
  ).map((f, i) => ({ ...f, id: `i${i}` }))
}

describe('tarih aritmetiği', () => {
  it('1 haftalık blok başlangıç + 6 gündür', () => {
    expect(endDateFor('2026-09-01', 1)).toBe('2026-09-07')
    expect(endDateFor('2026-09-01', 3)).toBe('2026-09-21')
  })

  it('süre gidiş-dönüş tutarlıdır', () => {
    expect(durationWeeks({ startDate: '2026-09-01', endDate: '2026-09-21' })).toBe(3)
    expect(durationWeeks({ startDate: '2026-09-01', endDate: '2026-09-07' })).toBe(1)
  })

  it('ay ve yıl sınırını doğru geçer', () => {
    expect(addWeeks('2026-12-28', 1)).toBe('2027-01-04')
  })
})

describe('MA-04 · konu bloğu tektir', () => {
  it('4 haftalık konu 4 satır değil tek kayıttır', () => {
    const flow = buildFlowFromTemplate([{ name: 'Fonksiyonlar', durationWeeks: 4 }], '2026-09-01')
    expect(flow).toHaveLength(1)
    expect(durationWeeks(flow[0])).toBe(4)
    expect(flow[0].startDate).toBe('2026-09-01')
    expect(flow[0].endDate).toBe('2026-09-28')
  })
})

describe('MA-01 / MA-02 / MA-03 · şablon ve snapshot bağımsızlığı', () => {
  const sablon = [
    { name: 'Temel Kavramlar', durationWeeks: 2 },
    { name: 'Fonksiyonlar', durationWeeks: 3 },
  ]

  it('MA-01: aynı şablon iki öğrenciye farklı tarihlerle atanır', () => {
    const a = buildFlowFromTemplate(sablon, '2026-09-01')
    const b = buildFlowFromTemplate(sablon, '2026-10-01')

    expect(a[0].startDate).toBe('2026-09-01')
    expect(b[0].startDate).toBe('2026-10-01')
    // Aynı sıra ve süre, farklı takvim.
    expect(a.map(i => i.name)).toEqual(b.map(i => i.name))
    expect(a.map(durationWeeks)).toEqual(b.map(durationWeeks))
  })

  it('MA-02: bir öğrencinin akışı değişince diğeri etkilenmez', () => {
    const a = buildFlowFromTemplate(sablon, '2026-09-01').map((f, i) => ({ ...f, id: `a${i}` }))
    const b = buildFlowFromTemplate(sablon, '2026-09-01').map((f, i) => ({ ...f, id: `b${i}` }))

    const aSonra = moveItem(a, 'a1', 3)

    expect(aSonra[1].startDate).not.toBe(a[1].startDate)
    expect(b[1].startDate).toBe('2026-09-15') // dokunulmadı
  })

  it('MA-03: şablon sonradan değişince mevcut snapshot ezilmez', () => {
    const snapshot = buildFlowFromTemplate(sablon, '2026-09-01')

    // Şablon değişti: yeni konu eklendi, süre uzadı.
    const yeniSablon = [
      { name: 'Temel Kavramlar', durationWeeks: 4 },
      { name: 'Kümeler', durationWeeks: 2 },
      { name: 'Fonksiyonlar', durationWeeks: 3 },
    ]
    const yeniSnapshot = buildFlowFromTemplate(yeniSablon, '2026-09-01')

    // Eski snapshot kendi başına yaşamaya devam eder.
    expect(snapshot).toHaveLength(2)
    expect(durationWeeks(snapshot[0])).toBe(2)
    expect(yeniSnapshot).toHaveLength(3)
  })
})

describe('MA-05 · konu taşınınca devamı zincirleme kayar', () => {
  it('Fonksiyonlar 3 hafta ileri taşınır, devamı da 3 hafta kayar', () => {
    const once = ornekAkis()
    // i2 = Fonksiyonlar (2+2 hafta sonra başlıyor)
    expect(once[2].name).toBe('Fonksiyonlar')
    expect(once[2].startDate).toBe('2026-09-29')
    expect(once[3].startDate).toBe('2026-10-20')

    const sonra = moveItem(once, 'i2', 3)

    expect(sonra[2].startDate).toBe('2026-10-20') // 3 hafta ileri
    expect(sonra[3].startDate).toBe('2026-11-10') // devamı da 3 hafta
    // Öncesi dokunulmadı.
    expect(sonra[0].startDate).toBe(once[0].startDate)
    expect(sonra[1].startDate).toBe(once[1].startDate)
  })

  it('geriye taşıma da zincirlemedir', () => {
    const once = ornekAkis()
    const sonra = moveItem(once, 'i2', -1)
    expect(sonra[2].startDate).toBe('2026-09-22')
    expect(sonra[3].startDate).toBe('2026-10-13')
  })

  it('taşınan bloğun kendi süresi değişmez', () => {
    const once = ornekAkis()
    const sonra = moveItem(once, 'i2', 3)
    expect(durationWeeks(sonra[2])).toBe(durationWeeks(once[2]))
  })
})

describe('MA-06 · süre değişince devamı uygun miktarda kayar', () => {
  it('Fonksiyonlar 3 -> 5 hafta, devamı 2 hafta ileri gider', () => {
    const once = ornekAkis()
    expect(durationWeeks(once[2])).toBe(3)
    expect(once[3].startDate).toBe('2026-10-20')

    const sonra = resizeItem(once, 'i2', 5)

    expect(durationWeeks(sonra[2])).toBe(5)
    expect(sonra[2].startDate).toBe(once[2].startDate) // başlangıç sabit
    expect(sonra[3].startDate).toBe('2026-11-03') // 2 hafta ileri
  })

  it('süre kısalınca devamı geri gelir', () => {
    const once = ornekAkis()
    const sonra = resizeItem(once, 'i2', 1)
    expect(durationWeeks(sonra[2])).toBe(1)
    expect(sonra[3].startDate).toBe('2026-10-06') // 2 hafta geri
  })

  it('aynı süre gönderilirse hiçbir şey değişmez', () => {
    const once = ornekAkis()
    expect(resizeItem(once, 'i2', 3)).toBe(once)
  })
})

describe('MA-07 · overlap hata değildir', () => {
  it('iki konu aynı haftaya denk gelebilir ve sistem buna izin verir', () => {
    const flow = ornekAkis()
    // Fonksiyonlar'ı Sayılar'ın üstüne çekelim.
    const cakisan = moveItem(flow, 'i2', -2)

    expect(cakisan[1].endDate).toBe('2026-09-28')
    expect(cakisan[2].startDate).toBe('2026-09-15') // Sayılar hâlâ sürerken başlıyor
    // Fonksiyon bir hata veya boş liste döndürmez; akış olduğu gibi durur.
    expect(cakisan).toHaveLength(4)
  })
})

describe('MA-08 / MA-09 · müfredat durumu', () => {
  const bugun = '2026-10-01'

  it('MA-08: planlanan bitiş tarihi geçse de otomatik Geçildi olmaz', () => {
    const gecmis = item({
      id: 'x',
      name: 'Sayılar',
      startDate: '2026-09-01',
      endDate: '2026-09-14', // çoktan bitti
      passed: false,
    })
    expect(deriveFlowStatus(gecmis, bugun)).toBe('current') // Geçildi DEĞİL
  })

  it('başlangıç gelmediyse Yaklaşıyor', () => {
    const ileride = item({ id: 'x', name: 'Trigonometri', startDate: '2026-11-01', endDate: '2026-11-21' })
    expect(deriveFlowStatus(ileride, bugun)).toBe('later')
  })

  it('başlangıç günü gelince Zamanı Geldi', () => {
    const bugunBaslayan = item({ id: 'x', name: 'Parabol', startDate: bugun, endDate: '2026-10-21' })
    expect(deriveFlowStatus(bugunBaslayan, bugun)).toBe('current')
  })

  it('MA-09: eğitmen Geçildi yapar; tarihler değişmez', () => {
    const flow = ornekAkis()
    const sonra = setPassed(flow, 'i0', true)

    expect(deriveFlowStatus(sonra[0], bugun)).toBe('passed')
    expect(sonra[0].startDate).toBe(flow[0].startDate)
    expect(sonra[0].endDate).toBe(flow[0].endDate)
    // Diğer bloklar etkilenmez.
    expect(sonra[1]).toEqual(flow[1])
  })

  it('Geçildi işareti kaldırılabilir', () => {
    const flow = setPassed(ornekAkis(), 'i0', true)
    expect(deriveFlowStatus(setPassed(flow, 'i0', false)[0], bugun)).toBe('current')
  })
})

describe('MA-10 · konu çıkarma', () => {
  it('konu akıştan çıkar', () => {
    const flow = ornekAkis()
    const sonra = removeItem(flow, 'i2')

    expect(sonra).toHaveLength(3)
    expect(sonra.map(i => i.name)).not.toContain('Fonksiyonlar')
  })

  it('kalan blokların tarihleri kendiliğinden öne çekilmez', () => {
    // Bilinçli karar: öğrenciye söylenmiş tarihler sürpriz biçimde
    // değişmesin. Boşluk kalır, eğitmen isterse taşıyarak kapatır.
    const flow = ornekAkis()
    const sonra = removeItem(flow, 'i2')
    expect(sonra[2].startDate).toBe(flow[3].startDate)
  })
})

describe('konu ekleme', () => {
  it('araya eklenen konu devamını kendi süresi kadar iter', () => {
    const flow = ornekAkis()
    const sonra = insertItem(flow, 2, 'Kümeler', 2)

    expect(sonra).toHaveLength(5)
    expect(sonra[2].name).toBe('Kümeler')
    expect(sonra[2].startDate).toBe('2026-09-29') // Sayılar'ın ertesi günü
    expect(sonra[3].name).toBe('Fonksiyonlar')
    expect(sonra[3].startDate).toBe('2026-10-13') // 2 hafta itildi
  })

  it('sona eklenen konu kimseyi itmez', () => {
    const flow = ornekAkis()
    const sonra = insertItem(flow, flow.length, 'Trigonometri', 3)
    expect(sonra[4].name).toBe('Trigonometri')
    expect(sonra.slice(0, 4)).toEqual(flow)
  })

  it('boş akışa ilk konu eklenebilir', () => {
    const sonra = insertItem([], 0, 'Temel Kavramlar', 2)
    expect(sonra).toHaveLength(1)
    expect(durationWeeks(sonra[0])).toBe(2)
  })
})

describe('MA-11 · scope izolasyonu', () => {
  it('fonksiyonlar yalnız verilen listeye dokunur', () => {
    // TYT Matematik ve AYT Fizik AYRI listelerdir; kaydırma fonksiyonları
    // yalnız kendilerine verilen diziyi döndürür, başka scope'a erişemez.
    const tytMat = ornekAkis()
    const aytFizik = buildFlowFromTemplate(
      [{ name: 'Vektörler', durationWeeks: 2 }],
      '2026-09-01'
    ).map((f, i) => ({ ...f, id: `f${i}` }))

    const sonra = moveItem(tytMat, 'i2', 4)

    expect(sonra).not.toBe(aytFizik)
    expect(aytFizik[0].startDate).toBe('2026-09-01')
    // Bilinmeyen id gönderilirse liste olduğu gibi döner.
    expect(moveItem(aytFizik, 'i2', 4)).toBe(aytFizik)
  })
})

describe('summarizeFlow', () => {
  it('haftaları duruma göre toplar', () => {
    const flow = setPassed(ornekAkis(), 'i0', true)
    const ozet = summarizeFlow(flow, deriveFlowStatuses(flow, '2026-10-01'))

    expect(ozet.totalWeeks).toBe(9) // 2 + 2 + 3 + 2
    expect(ozet.weeksByStatus.passed).toBe(2)
    expect(ozet.firstStart).toBe('2026-09-01')
    expect(ozet.lastEnd).toBe('2026-11-02')
  })

  it('boş akışta sıfır döner', () => {
    const ozet = summarizeFlow([], deriveFlowStatuses([], '2026-10-01'))
    expect(ozet.totalWeeks).toBe(0)
    expect(ozet.firstStart).toBeNull()
  })

  // Özet ve tablo AYNI durum haritasından beslendiği için "İşleniyor"
  // haftaları "Zamanı Geldi"ye sayılmaz.
  it('liste yükseltmelerini toplamlara yansıtır', () => {
    const flow = ornekAkis().map((f, i) => ({ ...f, topicId: `t${i}` }))
    // t2 = Fonksiyonlar; 2026-10-01'de zamanı gelmiş ama açık çalışması var.
    const statuses = deriveFlowStatuses(flow, '2026-10-01', new Set(['t2']))
    const ozet = summarizeFlow(flow, statuses)

    expect(ozet.weeksByStatus.in_progress).toBeGreaterThan(0)
    expect(ozet.totalWeeks).toBe(9)
  })
})

describe('deriveFlowStatuses · liste yükseltmeleri', () => {
  const flow = () => ornekAkis().map((f, i) => ({ ...f, topicId: `t${i}` }))

  it('açık çalışması olan konu tarihten bağımsız İşleniyor olur', () => {
    // t3 = Polinomlar, 2026-10-20'de başlıyor; bugün 1 Ekim, yani henüz
    // başlamamış. Açık çalışma tarihi yener (öğrenci planın önünde).
    const statuses = deriveFlowStatuses(flow(), '2026-10-01', new Set(['t3']))
    expect(statuses.get('i3')).toBe('in_progress')
  })

  it('tamamlanmış konu açık çalışması olsa da Tamamlandı kalır', () => {
    const items = setPassed(flow(), 'i0', true)
    const statuses = deriveFlowStatuses(items, '2026-10-01', new Set(['t0']))
    expect(statuses.get('i0')).toBe('passed')
  })

  it('başlamamış konulardan yalnız sıradaki ilki Yaklaşan olur', () => {
    const statuses = deriveFlowStatuses(flow(), '2026-10-01')
    const soon = [...statuses.values()].filter(s => s === 'soon')
    expect(soon).toHaveLength(1)
    // i0, i1, i2 başlamış (Zamanı Geldi); i3 sıradaki ilk.
    expect(statuses.get('i3')).toBe('soon')
  })

  it('sıradaki ilkin ardındakiler Sonrasında kalır', () => {
    const items = [
      ...flow(),
      ...buildFlowFromTemplate([{ name: 'Trigonometri', durationWeeks: 2 }], '2026-11-03').map(
        f => ({ ...f, id: 'i4', topicId: 't4' })
      ),
    ]
    const statuses = deriveFlowStatuses(items, '2026-10-01')
    expect(statuses.get('i3')).toBe('soon')
    expect(statuses.get('i4')).toBe('later')
  })

  it('kaydedilmemiş blok liste indeksiyle anahtarlanır', () => {
    const items = insertItem(flow(), 4, 'Yeni Konu', 1)
    const statuses = deriveFlowStatuses(items, '2026-10-01')
    expect(statuses.has('yeni-4')).toBe(true)
  })

  it('boş akışta boş harita döner', () => {
    expect(deriveFlowStatuses([], '2026-10-01').size).toBe(0)
  })
})

describe('splitItem · konu bölme', () => {
  it('toplam süreyi ve zaman aralığını korur', () => {
    const once = ornekAkis()
    // i2 = Fonksiyonlar, 3 hafta: 29 Eyl – 19 Eki.
    const sonra = splitItem(once, 'i2', 2)

    expect(sonra).toHaveLength(5)
    expect(durationWeeks(sonra[2])).toBe(2)
    expect(durationWeeks(sonra[3])).toBe(1)
    expect(sonra[2].startDate).toBe(once[2].startDate)
    expect(sonra[3].endDate).toBe(once[2].endDate)
  })

  it('devam bloklarını kaydırmaz', () => {
    const once = ornekAkis()
    const sonra = splitItem(once, 'i2', 2)
    // Polinomlar aynı gün başlamalı: bölme zincirleme etki yaratmaz.
    expect(sonra[4].startDate).toBe(once[3].startDate)
  })

  it('ikinci parça yeni kayıttır ve adı aynı kalır', () => {
    const sonra = splitItem(ornekAkis(), 'i2', 2)
    expect(sonra[3].id).toBeNull()
    expect(sonra[3].name).toBe('Fonksiyonlar')
  })

  it('Tamamlandı işareti yalnız ilk parçada kalır', () => {
    const once = setPassed(ornekAkis(), 'i2', true)
    const sonra = splitItem(once, 'i2', 2)
    expect(sonra[2].passed).toBe(true)
    expect(sonra[3].passed).toBe(false)
  })

  it('1 haftalık blok bölünemez', () => {
    const once = buildFlowFromTemplate([{ name: 'Tek', durationWeeks: 1 }], '2026-09-01').map(
      f => ({ ...f, id: 'i0' })
    )
    expect(splitItem(once, 'i0', 1)).toEqual(once)
  })

  it('sınır dışı hafta değeri akışı değiştirmez', () => {
    const once = ornekAkis()
    expect(splitItem(once, 'i2', 0)).toEqual(once)
    expect(splitItem(once, 'i2', 3)).toEqual(once)
    expect(splitItem(once, 'yok', 1)).toEqual(once)
  })
})

describe('mergeWithNext · konu birleştirme', () => {
  it('aralığı ilkin başlangıcından ikincinin bitişine uzatır', () => {
    const once = ornekAkis()
    const sonra = mergeWithNext(once, 'i1')

    expect(sonra).toHaveLength(3)
    expect(sonra[1].name).toBe('Sayılar')
    expect(sonra[1].startDate).toBe(once[1].startDate)
    expect(sonra[1].endDate).toBe(once[2].endDate)
    expect(durationWeeks(sonra[1])).toBe(5) // 2 + 3
  })

  it('devam bloklarını kaydırmaz', () => {
    const once = ornekAkis()
    const sonra = mergeWithNext(once, 'i1')
    expect(sonra[2].startDate).toBe(once[3].startDate)
  })

  it('Tamamlandı yalnız ikisi de tamamlanmışsa korunur', () => {
    const yarim = setPassed(ornekAkis(), 'i1', true)
    expect(mergeWithNext(yarim, 'i1')[1].passed).toBe(false)

    const ikisi = setPassed(setPassed(ornekAkis(), 'i1', true), 'i2', true)
    expect(mergeWithNext(ikisi, 'i1')[1].passed).toBe(true)
  })

  it('son satırda ve bilinmeyen id ile akışı değiştirmez', () => {
    const once = ornekAkis()
    expect(mergeWithNext(once, 'i3')).toEqual(once)
    expect(mergeWithNext(once, 'yok')).toEqual(once)
  })
})
