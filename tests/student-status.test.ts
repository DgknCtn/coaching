import { describe, expect, it } from 'vitest'

import {
  computeStudentStatus,
  expectedProgressPercent,
  noticeSignal,
  STATUS_LABEL,
  STATUS_THRESHOLDS,
  type StatusInput,
} from '@/lib/student-status'

// ============================================================
// DURUM MOTORU — R7 / SİTE TESTİ 01 §7
//
// NEDEN BU TEST VAR
//
// Bu fonksiyon öğrenciyi ETİKETLİYOR ve etiket öğretmenin gününü
// sıralıyor: "Müdahale Gerekli" yazan satır önce açılır. Yanlış bir
// eşik, gerçekten geride olan öğrenciyi "Yolunda" gösterip görünmez
// yapar — ekranın sessiz kalması, hata vermesinden daha tehlikelidir.
//
// Belgenin kendi uyarısı eşiklerin ilk sürüm değerleri olduğunu söylüyor;
// bu yüzden testler SINIR DEĞERLERİ kilitliyor, sayıları değil. Eşik
// değişirse test de değişmeli — ama kazara kaymaları yakalanır.
// ============================================================

/** Her boyutu nötr olan bir öğrenci; testler tek tek bozar. */
function base(overrides: Partial<StatusInput> = {}): StatusInput {
  return {
    submittedPercent: 80,
    expectedPercent: 80,
    msToNextContact: 5 * 24 * 3_600_000, // 5 gün
    overdueWorkCount: 0,
    checkInOverdueHours: 0,
    submissionCutoffPassed: false,
    ...overrides,
  }
}

const T = STATUS_THRESHOLDS

describe('Yolunda — dört koşulun hepsi temiz', () => {
  it('beklenen ilerlemenin üstündeki öğrenci yolundadır', () => {
    expect(computeStudentStatus(base({ submittedPercent: 95 })).status).toBe('yolunda')
  })

  it('beklenene eşit ilerleme yolundadır', () => {
    expect(computeStudentStatus(base()).status).toBe('yolunda')
  })

  it('yolunda olan öğrencide sinyal listesi boştur', () => {
    expect(computeStudentStatus(base()).signals).toEqual([])
  })
})

describe('Takip Et — 10-20 puan arası, kritik risk yok', () => {
  it('tam 10 puan geride kalan takip edilir', () => {
    const r = computeStudentStatus(
      base({ submittedPercent: 100 - T.watchGapPoints, expectedPercent: 100 })
    )
    expect(r.status).toBe('takip_et')
  })

  it('9 puan geride henüz yolundadır', () => {
    expect(
      computeStudentStatus(base({ submittedPercent: 91, expectedPercent: 100 })).status
    ).toBe('yolunda')
  })

  it('bildirim gecikmişse ilerleme iyi olsa bile yolunda DEĞİLDİR', () => {
    // §7: "Yolunda ... bildirim gecikmemiş." Şart, ilerlemeden bağımsız.
    const r = computeStudentStatus(base({ checkInOverdueHours: 5 }))
    expect(r.status).toBe('takip_et')
    expect(r.signals).toContain('Durum bildirimi gecikti')
  })
})

describe('Geride — üç ayrı yoldan', () => {
  it('20+ puan geride', () => {
    expect(
      computeStudentStatus(
        base({ submittedPercent: 100 - T.behindGapPoints, expectedPercent: 100 })
      ).status
    ).toBe('geride')
  })

  it('gecikmiş çalışma tek başına yeter', () => {
    // İlerleme beklenenle aynı olsa bile.
    const r = computeStudentStatus(base({ overdueWorkCount: 3 }))
    expect(r.status).toBe('geride')
    expect(r.signals).toContain('3 geciken çalışma')
  })

  it('temasa ≤48 saat kalmış ve ilerleme %70 altındaysa', () => {
    const r = computeStudentStatus(
      base({
        submittedPercent: 60,
        // Beklenen de 60: tempo açısından sorun YOK, sorun temasın
        // yaklaşmış olması. Belge bunu ayrı bir yol olarak sayıyor.
        expectedPercent: 60,
        msToNextContact: T.contactSoonHours * 3_600_000,
      })
    )
    expect(r.status).toBe('geride')
  })

  it('temas yakın ama ilerleme %70 üstündeyse geride DEĞİL', () => {
    expect(
      computeStudentStatus(
        base({
          submittedPercent: T.contactSoonMinPercent,
          expectedPercent: T.contactSoonMinPercent,
          msToNextContact: 24 * 3_600_000,
        })
      ).status
    ).toBe('yolunda')
  })

  it('temas planlanmamışsa yakınlık kuralı hiç çalışmaz', () => {
    // null "çok yakın" demek değildir; temassız öğrenci listenin
    // sonunda kalır (§6) ve bu kuralla cezalandırılmaz.
    expect(
      computeStudentStatus(
        base({ submittedPercent: 10, expectedPercent: 10, msToNextContact: null })
      ).status
    ).toBe('yolunda')
  })
})

describe('Müdahale Gerekli — her biri TEK BAŞINA', () => {
  it('teslim kesimi geçmiş ve eksik var', () => {
    const r = computeStudentStatus(
      base({ submissionCutoffPassed: true, submittedPercent: 90 })
    )
    expect(r.status).toBe('mudahale')
    expect(r.signals).toContain('Teslim kesimi geçti, eksik var')
  })

  it('kesim geçmiş ama iş bitmişse müdahale YOK', () => {
    expect(
      computeStudentStatus(
        base({ submissionCutoffPassed: true, submittedPercent: 100, expectedPercent: 100 })
      ).status
    ).toBe('yolunda')
  })

  it('bildirim 48+ saat gecikmiş', () => {
    expect(
      computeStudentStatus(base({ checkInOverdueHours: T.checkInCriticalHours })).status
    ).toBe('mudahale')
  })

  it('47 saatlik gecikme henüz kritik değil', () => {
    expect(
      computeStudentStatus(base({ checkInOverdueHours: T.checkInCriticalHours - 1 })).status
    ).toBe('takip_et')
  })

  it('temasa <24 saat ve belirgin geride', () => {
    const r = computeStudentStatus(
      base({
        submittedPercent: 100 - T.behindGapPoints,
        expectedPercent: 100,
        msToNextContact: 12 * 3_600_000,
      })
    )
    expect(r.status).toBe('mudahale')
  })
})

describe('Müdahale Gerekli — birden fazla risk sinyali birlikte', () => {
  it('iki "geride" sinyali üst üste binerse müdahaleye çıkar', () => {
    // Tek başına her biri "Geride" olurdu: 20+ puan geride VE gecikmiş
    // çalışma. Belge: "ya da birden fazla kritik sinyal birlikte."
    const r = computeStudentStatus(
      base({
        submittedPercent: 100 - T.behindGapPoints,
        expectedPercent: 100,
        overdueWorkCount: 2,
      })
    )
    expect(r.status).toBe('mudahale')
    expect(r.signals.length).toBeGreaterThanOrEqual(T.combinedSignalCount)
  })

  it('tek sinyal müdahaleye çıkmaz', () => {
    expect(
      computeStudentStatus(
        base({ submittedPercent: 100 - T.behindGapPoints, expectedPercent: 100 })
      ).status
    ).toBe('geride')
  })
})

describe('yük yayınlanmamış öğrenci suçlanmaz', () => {
  it('beklenen yüzde ölçülemiyorsa tempo boyutu hiç bakılmaz', () => {
    // calculateFlowPace'in null dönmesiyle aynı gerekçe: sıfır yükü
    // sıfır süreye bölüp "geride" demek, henüz iş verilmemiş öğrenciyi
    // borçlu doğurmak olurdu.
    expect(
      computeStudentStatus(base({ submittedPercent: 0, expectedPercent: null })).status
    ).toBe('yolunda')
  })

  it('yük yokken bile gecikmiş çalışma görünür', () => {
    // Tempo ölçülemiyor olması, geçmişten kalan gecikmeyi gizlemez.
    expect(
      computeStudentStatus(
        base({ submittedPercent: 0, expectedPercent: null, overdueWorkCount: 4 })
      ).status
    ).toBe('geride')
  })
})

describe('expectedProgressPercent — kesim zamanı üzerinden', () => {
  const START = new Date('2026-09-13T10:00:00+03:00')
  const CUTOFF = new Date('2026-09-20T10:00:00+03:00')

  it('sürenin yarısında %50 beklenir', () => {
    const r = expectedProgressPercent({
      startedAt: START,
      submissionCutoffAt: CUTOFF,
      now: new Date('2026-09-16T22:00:00+03:00'),
    })
    expect(r).toBeCloseTo(50, 0)
  })

  it('başlamadan önce beklenti sıfırdır', () => {
    expect(
      expectedProgressPercent({
        startedAt: START,
        submissionCutoffAt: CUTOFF,
        now: new Date('2026-09-12T10:00:00+03:00'),
      })
    ).toBe(0)
  })

  it('kesim geçtiyse beklenti %100 olur, aşmaz', () => {
    expect(
      expectedProgressPercent({
        startedAt: START,
        submissionCutoffAt: CUTOFF,
        now: new Date('2026-09-25T10:00:00+03:00'),
      })
    ).toBe(100)
  })

  it('başlangıç ya da kesim yoksa ölçüm YAPILMAZ', () => {
    expect(
      expectedProgressPercent({ startedAt: null, submissionCutoffAt: CUTOFF, now: START })
    ).toBeNull()
    expect(
      expectedProgressPercent({ startedAt: START, submissionCutoffAt: null, now: START })
    ).toBeNull()
  })

  it('sıfır uzunluktaki pencerede ölçüm YAPILMAZ', () => {
    // Sıfıra bölme yerine "bilinmiyor" demek doğru: uydurulmuş bir
    // beklenti, öğretmenin koymadığı bir standarttır.
    expect(
      expectedProgressPercent({
        startedAt: START,
        submissionCutoffAt: START,
        now: START,
      })
    ).toBeNull()
  })

  it('kesim zamanı temasın kendisi değil, payı düşülmüş hâlidir', () => {
    // §6: ders 20:00 ise kesim 14:00 (submission_offset_minutes = 360)
    // ve "durum motoru 20:00 değil 14:00 üzerinden çalışır."
    const lessonStart = new Date('2026-09-20T20:00:00+03:00')
    const cutoff = new Date(lessonStart.getTime() - 360 * 60_000)
    expect(cutoff.toISOString()).toBe(new Date('2026-09-20T14:00:00+03:00').toISOString())

    // Aynı anda bakıldığında kesim üzerinden beklenti DAHA YÜKSEK olur:
    // öğrencinin elinde daha az zaman vardır.
    const now = new Date('2026-09-19T20:00:00+03:00')
    const byCutoff = expectedProgressPercent({
      startedAt: START,
      submissionCutoffAt: cutoff,
      now,
    })!
    const byLesson = expectedProgressPercent({
      startedAt: START,
      submissionCutoffAt: lessonStart,
      now,
    })!
    expect(byCutoff).toBeGreaterThan(byLesson)
  })
})

describe('etiketler', () => {
  it('dört durumun da Türkçe karşılığı var', () => {
    expect(STATUS_LABEL.yolunda).toBe('Yolunda')
    expect(STATUS_LABEL.takip_et).toBe('Takip Et')
    expect(STATUS_LABEL.geride).toBe('Geride')
    expect(STATUS_LABEL.mudahale).toBe('Müdahale Gerekli')
  })
})

describe('noticeSignal — Bildirim / Not sütunu (§5)', () => {
  it('gecikmiş bildirim her şeyin önünde gelir', () => {
    // Öncelik: gecikmiş bildirim → önemli not → zamanında bildirim.
    const r = noticeSignal({
      checkInOverdueHours: 48,
      hasImportantNote: true,
      hasCheckedIn: true,
    })
    expect(r.kind).toBe('check_in_late')
    expect(r.label).toBe('2 gün gecikti')
  })

  it('bir günden kısa gecikme saat olarak yazılır', () => {
    // "0 gün gecikti" anlamsız olurdu.
    expect(
      noticeSignal({ checkInOverdueHours: 5, hasImportantNote: false, hasCheckedIn: false })
        .label
    ).toBe('5 saat gecikti')
  })

  it('gecikme yoksa önemli not gösterilir', () => {
    const r = noticeSignal({
      checkInOverdueHours: 0,
      hasImportantNote: true,
      hasCheckedIn: true,
    })
    expect(r.kind).toBe('note')
    expect(r.label).toBe('Not var')
  })

  it('yalnız zamanında bildirim varsa o gösterilir', () => {
    expect(
      noticeSignal({ checkInOverdueHours: 0, hasImportantNote: false, hasCheckedIn: true })
        .kind
    ).toBe('check_in_done')
  })

  it('hiçbiri yoksa tire', () => {
    expect(
      noticeSignal({ checkInOverdueHours: 0, hasImportantNote: false, hasCheckedIn: false })
        .label
    ).toBe('—')
  })

  it('notun METNİ hiçbir çıktıda yer almaz', () => {
    // §8: "Zoom/Meet ekran paylaşımında öğretmenin özel notu açığa
    // çıkmamalıdır." Fonksiyon metni parametre olarak bile almıyor;
    // bu test imzanın kazara genişlemesini de yakalar.
    const r = noticeSignal({
      checkInOverdueHours: 0,
      hasImportantNote: true,
      hasCheckedIn: false,
    })
    expect(Object.values(r).join(' ')).not.toMatch(/[a-zçğıöşü]{20,}/i)
    expect(r.label).toBe('Not var')
  })
})
