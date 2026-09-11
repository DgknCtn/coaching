import { describe, expect, it } from 'vitest'
import {
  calculateFlowPace,
  captureOnTime,
  checkInDue,
  dailyDelivery,
  deliverySilence,
  distributionState,
  flowMembership,
  paceBand,
  resolveFlowDue,
  shouldAskToMoveDue,
} from '@/lib/weekly-flow'
import type { ServiceLike } from '@/lib/service-structure'

// Belgenin örnek haftası: ana temas her Pazar 10:00 bireysel koçluk,
// aktif döngü 13-20 Eylül 2026. Sayılar (135 / 110 / 25) doğrudan
// R7 / Site Testi 05 §6 ve §7'den alınmıştır — uydurma değil, kabul
// kriterinin kendisi.

const PAZAR = 7

function anchor(overrides: Partial<ServiceLike> = {}): ServiceLike {
  return {
    id: 'svc-1',
    kind: 'kocluk',
    participation: 'birebir',
    weekday: PAZAR,
    startTime: '10:00',
    startDate: '2026-09-01',
    status: 'active',
    submissionOffsetMinutes: 0,
    ...overrides,
  } as ServiceLike
}

describe('resolveFlowDue · resmi kapanış tek tarihtir', () => {
  it('ana temastan varsayılan kapanış üretir', () => {
    const due = resolveFlowDue({
      customDueAt: null,
      anchorService: anchor(),
      from: new Date('2026-09-14T09:00:00+03:00'),
    })
    expect(due?.source).toBe('anchor')
    // 14 Eylül Pazartesi'den sonraki Pazar 10:00 = 20 Eylül.
    expect(due?.dueAt.toISOString()).toBe(new Date('2026-09-20T10:00:00+03:00').toISOString())
  })

  it('özel son teslim ana teması ezer ve kaynağı custom olur', () => {
    const custom = new Date('2026-09-18T20:00:00+03:00')
    const due = resolveFlowDue({
      customDueAt: custom,
      anchorService: anchor(),
      from: new Date('2026-09-14T09:00:00+03:00'),
    })
    expect(due?.source).toBe('custom')
    expect(due?.dueAt).toEqual(custom)
  })

  it('özel tarih seçiliyken ana temas ATILMAZ — ikisi birlikte gösterilebilsin', () => {
    const due = resolveFlowDue({
      customDueAt: new Date('2026-09-18T20:00:00+03:00'),
      anchorService: anchor(),
      from: new Date('2026-09-14T09:00:00+03:00'),
    })
    expect(due?.anchorAt).not.toBeNull()
  })

  it('ne ana temas ne özel tarih varsa kapanış UYDURULMAZ', () => {
    const due = resolveFlowDue({
      customDueAt: null,
      anchorService: null,
      from: new Date('2026-09-14T09:00:00+03:00'),
    })
    expect(due).toBeNull()
  })
})

describe('shouldAskToMoveDue · kabul #11', () => {
  it('ana temastan gelen kapanışta öğretmene sorulur', () => {
    expect(shouldAskToMoveDue({ dueSource: 'anchor', status: 'active' })).toBe(true)
  })

  it('özel tarih seçilmişse otomatik değiştirme YOK, soru da yok', () => {
    expect(shouldAskToMoveDue({ dueSource: 'custom', status: 'active' })).toBe(false)
  })

  it('kapanmış akışın son teslimi taşınmaz', () => {
    expect(shouldAskToMoveDue({ dueSource: 'anchor', status: 'closed' })).toBe(false)
  })
})

describe('flowMembership · §5 senaryoları', () => {
  const flow = { dueAt: new Date('2026-09-20T10:00:00+03:00'), status: 'active' as const }

  it('A: aktif haftaya ekleme — akışın içinde kalan ödev aktif akışa girer', () => {
    expect(
      flowMembership({ batchDueAt: new Date('2026-09-18T23:59:00+03:00'), flow })
    ).toBe('active_flow')
  })

  it('A: tam kapanış anındaki ödev hâlâ bu haftaya aittir', () => {
    expect(flowMembership({ batchDueAt: flow.dueAt, flow })).toBe('active_flow')
  })

  it('B: gelecek tarihli ödev bu haftanın toplamına KARIŞMAZ (kabul #7)', () => {
    expect(
      flowMembership({ batchDueAt: new Date('2026-09-27T10:00:00+03:00'), flow })
    ).toBe('upcoming')
  })

  it('kapanmış akışa yeni ödev bağlanmaz', () => {
    expect(
      flowMembership({
        batchDueAt: new Date('2026-09-19T10:00:00+03:00'),
        flow: { ...flow, status: 'closed' },
      })
    ).toBe('no_flow')
  })
})

describe('paceBand · §6 eşikleri', () => {
  it('belgedeki dört bandı sınırlarında ayırır', () => {
    expect(paceBand(0.85)).toBe('good')
    expect(paceBand(0.84)).toBe('slightly_behind')
    expect(paceBand(0.7)).toBe('slightly_behind')
    expect(paceBand(0.69)).toBe('clearly_behind')
    expect(paceBand(0.45)).toBe('clearly_behind')
    expect(paceBand(0.44)).toBe('critical')
  })
})

describe('calculateFlowPace · tempo yayın anından başlar', () => {
  it('tempo akışın açılışından DEĞİL, ilk yayından hesaplanır', () => {
    // Akış 13 Eylül Pazar açıldı ama plan 14 Eylül Pazartesi 13:00'te
    // yayınlandı. Belge: "öğrenci Pazar sabahından beri gecikmiş sayılmaz."
    const publishedPace = calculateFlowPace({
      totalUnits: 135,
      deliveredUnits: 0,
      firstPublishedAt: new Date('2026-09-14T13:00:00+03:00'),
      dueAt: new Date('2026-09-20T10:00:00+03:00'),
      now: new Date('2026-09-14T13:00:00+03:00'),
    })
    const flowStartPace = calculateFlowPace({
      totalUnits: 135,
      deliveredUnits: 0,
      firstPublishedAt: new Date('2026-09-13T10:00:00+03:00'),
      dueAt: new Date('2026-09-20T10:00:00+03:00'),
      now: new Date('2026-09-14T13:00:00+03:00'),
    })
    // Daha kısa süreye aynı yük → günlük beklenti daha yüksek olmalı.
    expect(publishedPace!.startingPerDay).toBeGreaterThan(flowStartPace!.startingPerDay)
  })

  it('hiç yük yayınlanmadıysa tempo YOKTUR — öğrenci suçlanmaz', () => {
    expect(
      calculateFlowPace({
        totalUnits: 0,
        deliveredUnits: 0,
        firstPublishedAt: null,
        dueAt: new Date('2026-09-20T10:00:00+03:00'),
        now: new Date('2026-09-15T10:00:00+03:00'),
      })
    ).toBeNull()
  })

  it('yük var ama yayın anı bilinmiyorsa tempo üretilmez', () => {
    expect(
      calculateFlowPace({
        totalUnits: 135,
        deliveredUnits: 0,
        firstPublishedAt: null,
        dueAt: new Date('2026-09-20T10:00:00+03:00'),
        now: new Date('2026-09-15T10:00:00+03:00'),
      })
    ).toBeNull()
  })

  it('planında giden öğrenci "iyi gidiyor" bandındadır', () => {
    // Yükün yarısı, sürenin yarısında teslim edilmiş.
    const pace = calculateFlowPace({
      totalUnits: 100,
      deliveredUnits: 50,
      firstPublishedAt: new Date('2026-09-13T10:00:00+03:00'),
      dueAt: new Date('2026-09-23T10:00:00+03:00'),
      now: new Date('2026-09-18T10:00:00+03:00'),
    })
    expect(pace!.band).toBe('good')
  })

  it('hiç teslim etmeyen öğrencide gereken tempo yükselir ve band düşer', () => {
    const pace = calculateFlowPace({
      totalUnits: 100,
      deliveredUnits: 0,
      firstPublishedAt: new Date('2026-09-13T10:00:00+03:00'),
      dueAt: new Date('2026-09-23T10:00:00+03:00'),
      now: new Date('2026-09-21T10:00:00+03:00'),
    })
    expect(pace!.requiredPerDay).toBeGreaterThan(pace!.startingPerDay)
    expect(pace!.band).toBe('critical')
  })

  it('yükü bitiren öğrencide oran 1 ve gereken tempo sıfırdır', () => {
    const pace = calculateFlowPace({
      totalUnits: 135,
      deliveredUnits: 135,
      firstPublishedAt: new Date('2026-09-14T13:00:00+03:00'),
      dueAt: new Date('2026-09-20T10:00:00+03:00'),
      now: new Date('2026-09-19T10:00:00+03:00'),
    })
    expect(pace!.requiredPerDay).toBe(0)
    expect(pace!.ratio).toBe(1)
    expect(pace!.band).toBe('good')
  })

  it('süre dolduğunda sonsuza bölünmez', () => {
    const pace = calculateFlowPace({
      totalUnits: 135,
      deliveredUnits: 110,
      firstPublishedAt: new Date('2026-09-14T13:00:00+03:00'),
      dueAt: new Date('2026-09-20T10:00:00+03:00'),
      now: new Date('2026-09-21T10:00:00+03:00'),
    })
    expect(Number.isFinite(pace!.requiredPerDay)).toBe(true)
    expect(pace!.remainingMs).toBe(0)
  })
})

describe('deliverySilence · sinyal, yargı değil', () => {
  it('3 gün ve üzeri sessizlik işaretlenir', () => {
    const s = deliverySilence({
      lastDeliveryAt: new Date('2026-09-15T10:00:00+03:00'),
      now: new Date('2026-09-18T12:00:00+03:00'),
    })
    expect(s.silent).toBe(true)
    expect(s.phrase).toBe('3 gündür yeni teslim yok')
  })

  it('2 gün sessizlik sinyal DEĞİLDİR', () => {
    const s = deliverySilence({
      lastDeliveryAt: new Date('2026-09-16T10:00:00+03:00'),
      now: new Date('2026-09-18T12:00:00+03:00'),
    })
    expect(s.silent).toBe(false)
  })

  it('hiç teslim yoksa sessizlik sinyali üretilmez', () => {
    const s = deliverySilence({
      lastDeliveryAt: null,
      now: new Date('2026-09-18T12:00:00+03:00'),
    })
    expect(s.silent).toBe(false)
    expect(s.phrase).toBe('Henüz teslim yok')
  })

  it('metin "çalışmıyor" gibi bir yargı içermez', () => {
    const s = deliverySilence({
      lastDeliveryAt: new Date('2026-09-10T10:00:00+03:00'),
      now: new Date('2026-09-18T12:00:00+03:00'),
    })
    expect(s.phrase).not.toMatch(/çalışmıyor|tembel|yetersiz/i)
  })
})

describe('captureOnTime · kabul #8 ve #9', () => {
  const dueAt = new Date('2026-09-20T10:00:00+03:00')

  it('zamanında teslim fotoğrafı gönderim anına bakar', () => {
    const items = [
      ...Array.from({ length: 110 }, () => ({
        firstSubmittedAt: new Date('2026-09-19T10:00:00+03:00'),
      })),
      ...Array.from({ length: 25 }, () => ({ firstSubmittedAt: null })),
    ]
    expect(captureOnTime({ items, dueAt })).toEqual({ onTime: 110, total: 135 })
  })

  it('öğretmen onayı beklenmez — gönderim yeter', () => {
    // İki kalem de gönderilmiş; biri onaylanmamış olsa bile fotoğrafta ikisi de var.
    const items = [
      { firstSubmittedAt: new Date('2026-09-19T10:00:00+03:00') },
      { firstSubmittedAt: new Date('2026-09-19T23:00:00+03:00') },
    ]
    expect(captureOnTime({ items, dueAt }).onTime).toBe(2)
  })

  it('son teslimden sonraki gönderim zamanında sayılmaz', () => {
    const items = [{ firstSubmittedAt: new Date('2026-09-21T10:00:00+03:00') }]
    expect(captureOnTime({ items, dueAt }).onTime).toBe(0)
  })

  it('tam kapanış anındaki gönderim zamanındadır', () => {
    expect(captureOnTime({ items: [{ firstSubmittedAt: dueAt }], dueAt }).onTime).toBe(1)
  })
})

describe('distributionState · §5 Senaryo A', () => {
  it('sonradan eklenen çalışma "dağıtılmayı bekliyor" olarak ayrı görünür', () => {
    const d = distributionState({ totalUnits: 143, plannedUnits: 135 })
    expect(d.unplanned).toBe(8)
    expect(d.phrase).toBe('135/143 dağıtıldı — 8 yeni çalışma dağıtılmayı bekliyor')
  })

  it('hepsi dağıtılmışsa bekleyen uyarısı çıkmaz', () => {
    expect(distributionState({ totalUnits: 135, plannedUnits: 135 }).phrase).toBe(
      '135/135 dağıtıldı'
    )
  })

  it('sistem kalanı kendi dağıtmaz — planlanan sayısı olduğu gibi kalır', () => {
    const d = distributionState({ totalUnits: 143, plannedUnits: 135 })
    expect(d.planned).toBe(135)
  })
})

describe('checkInDue · kabul #10, sabit 3 gün tek mantık değil', () => {
  const flowStart = new Date('2026-09-13T10:00:00+03:00')
  const dueAt = new Date('2026-09-20T10:00:00+03:00')

  it('akışın ortası geçtiyse ve o zamandan beri sorulmadıysa bildirim beklenir', () => {
    const r = checkInDue({
      flowStart,
      dueAt,
      lastCheckInAt: null,
      lastDeliveryAt: new Date('2026-09-17T10:00:00+03:00'),
      now: new Date('2026-09-17T12:00:00+03:00'),
    })
    expect(r).toEqual({ due: true, reason: 'midpoint' })
  })

  it('orta noktadan sonra zaten sorulduysa tekrar istenmez', () => {
    const r = checkInDue({
      flowStart,
      dueAt,
      lastCheckInAt: new Date('2026-09-17T09:00:00+03:00'),
      lastDeliveryAt: new Date('2026-09-17T10:00:00+03:00'),
      now: new Date('2026-09-17T12:00:00+03:00'),
    })
    expect(r.due).toBe(false)
  })

  it('akışın ilk yarısında teslim sessizliği tek başına bildirimi tetikler', () => {
    const r = checkInDue({
      flowStart: new Date('2026-09-13T10:00:00+03:00'),
      dueAt: new Date('2026-10-13T10:00:00+03:00'),
      lastCheckInAt: new Date('2026-09-13T11:00:00+03:00'),
      lastDeliveryAt: new Date('2026-09-14T10:00:00+03:00'),
      now: new Date('2026-09-18T10:00:00+03:00'),
    })
    expect(r).toEqual({ due: true, reason: 'silence' })
  })

  it('hareket de ritim de tetiklemiyorsa bildirim istenmez', () => {
    const r = checkInDue({
      flowStart,
      dueAt,
      lastCheckInAt: null,
      lastDeliveryAt: new Date('2026-09-14T10:00:00+03:00'),
      now: new Date('2026-09-15T10:00:00+03:00'),
    })
    expect(r).toEqual({ due: false, reason: null })
  })
})

describe('dailyDelivery · §7 no.6 günlük dağılım', () => {
  // Belgenin örnek haftası: 13 Eylül Pazar 10:00 -> 20 Eylül Pazar 10:00.
  const START = new Date('2026-09-13T10:00:00+03:00')
  const DUE = new Date('2026-09-20T10:00:00+03:00')

  it('başlangıçtan kapanışa her günü üretir', () => {
    const r = dailyDelivery({ deliveries: [], startsAt: START, dueAt: DUE })
    expect(r.days.map(d => d.date)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ])
  })

  it('ISO hafta günü verir (Pazartesi 1, Pazar 7)', () => {
    const r = dailyDelivery({ deliveries: [], startsAt: START, dueAt: DUE })
    // 13 Eylül 2026 Pazar, 14 Eylül Pazartesi.
    expect(r.days[0].weekday).toBe(7)
    expect(r.days[1].weekday).toBe(1)
    expect(r.days[7].weekday).toBe(7)
  })

  it('teslimleri kendi gününe sayar', () => {
    const r = dailyDelivery({
      deliveries: [
        new Date('2026-09-14T09:00:00+03:00'),
        new Date('2026-09-14T21:30:00+03:00'),
        new Date('2026-09-16T12:00:00+03:00'),
      ],
      startsAt: START,
      dueAt: DUE,
    })
    const byDate = new Map(r.days.map(d => [d.date, d.delivered]))
    expect(byDate.get('2026-09-14')).toBe(2)
    expect(byDate.get('2026-09-16')).toBe(1)
    expect(byDate.get('2026-09-15')).toBe(0)
    expect(r.outsideWindow).toBe(0)
  })

  it('gün sınırını YEREL takvimle çizer, UTC ile değil', () => {
    // ASIL REGRESYON: 15 Eylül 01:00 (TSİ) UTC'de 14 Eylül 22:00'dır.
    // toISOString().slice(0,10) kullanılsaydı bu teslim bir gün geriye
    // kayardı ve gece çalışan öğrencinin işi yanlış güne yazılırdı.
    const r = dailyDelivery({
      deliveries: [new Date('2026-09-15T01:00:00+03:00')],
      startsAt: START,
      dueAt: DUE,
    })
    const byDate = new Map(r.days.map(d => [d.date, d.delivered]))
    expect(byDate.get('2026-09-15')).toBe(1)
    expect(byDate.get('2026-09-14')).toBe(0)
  })

  it('pencere dışındaki geç teslimi son güne YAZMAZ', () => {
    // Kapanışı geçmiş ama hâlâ açık bir akışta gelen teslim. Son güne
    // eklemek, o gün yapılmamış bir işi o güne yazmak olurdu.
    const r = dailyDelivery({
      deliveries: [
        new Date('2026-09-22T12:00:00+03:00'),
        new Date('2026-09-18T12:00:00+03:00'),
      ],
      startsAt: START,
      dueAt: DUE,
    })
    expect(r.outsideWindow).toBe(1)
    expect(r.days.reduce((s, d) => s + d.delivered, 0)).toBe(1)
  })

  it('teslim edilmemiş çalışma hiçbir güne düşmez', () => {
    const r = dailyDelivery({
      deliveries: [null, null, new Date('2026-09-15T12:00:00+03:00')],
      startsAt: START,
      dueAt: DUE,
    })
    expect(r.days.reduce((s, d) => s + d.delivered, 0)).toBe(1)
    expect(r.outsideWindow).toBe(0)
  })

  it('aynı gün içinde açılıp kapanan akışta tek sütun', () => {
    const r = dailyDelivery({
      deliveries: [],
      startsAt: new Date('2026-09-13T09:00:00+03:00'),
      dueAt: new Date('2026-09-13T22:00:00+03:00'),
    })
    expect(r.days).toHaveLength(1)
  })
})
