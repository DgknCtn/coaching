import { describe, expect, it } from 'vitest'
import {
  contactKindOf,
  deriveMainContact,
  defaultSubmissionDeadline,
  nextContact,
  nextOccurrence,
  occurrencesInMonth,
  type ServiceLike,
  type Weekday,
} from '@/lib/service-structure'

// HİZMET YAPISI (R7-04 Rev.3).
//
// İki karar burada sabitleniyor:
//   1) Ana temas ÖĞRETMENE SEÇTİRİLMEZ — Koçluk > Birebir > Grup.
//   2) Oturum sayısı ayın GERÇEK takviminden gelir; "aylık paket = 4"
//      diye bir varsayım yoktur.
//
// Saatler yerel duvar saatidir (Europe/Istanbul, UTC+3). Beklentiler
// bilinçli olarak UTC ISO dizesiyle yazıldı: dönüşüm bozulursa test
// sessizce geçmesin.

function svc(over: Partial<ServiceLike> = {}): ServiceLike {
  return {
    id: 'x',
    kind: 'ders',
    participation: 'birebir',
    medium: 'online',
    weekday: 3,
    startTime: '20:00',
    plannedDurationMinutes: 120,
    startDate: '2026-09-01',
    status: 'active',
    ...over,
  }
}

const grupMatematik = svc({
  id: 'grup',
  kind: 'ders',
  participation: 'grup',
  weekday: 3, // Çarşamba
  startTime: '20:00',
})

const bireyselKocluk = svc({
  id: 'kocluk',
  kind: 'kocluk',
  participation: 'birebir',
  weekday: 6, // Cumartesi
  startTime: '10:00',
})

const birebirDers = svc({
  id: 'birebir',
  kind: 'ders',
  participation: 'birebir',
  weekday: 2, // Salı
  startTime: '18:30',
})

describe('contactKindOf', () => {
  it('koçluk, katılım ne olursa olsun koçluktur', () => {
    expect(contactKindOf(svc({ kind: 'kocluk', participation: 'birebir' }))).toBe('kocluk')
    expect(contactKindOf(svc({ kind: 'kocluk', participation: 'grup' }))).toBe('kocluk')
  })

  it('ders katılıma göre ikiye ayrılır', () => {
    expect(contactKindOf(birebirDers)).toBe('birebir_ders')
    expect(contactKindOf(grupMatematik)).toBe('grup_dersi')
  })
})

describe('deriveMainContact', () => {
  it('koçluk varsa her zaman koçluk kazanır', () => {
    // Dokümandaki Sude örneği: grup Çarşamba 20:00 + koçluk Cumartesi
    // 10:00 -> ana temas koçluktur. Grup dersi haftada daha ÖNCE olmasına
    // rağmen öncelik kuralı zamana bakmaz.
    expect(deriveMainContact([grupMatematik, bireyselKocluk])?.id).toBe('kocluk')
    expect(deriveMainContact([bireyselKocluk, grupMatematik])?.id).toBe('kocluk')
  })

  it('koçluk yoksa birebir ders gruba tercih edilir', () => {
    expect(deriveMainContact([grupMatematik, birebirDers])?.id).toBe('birebir')
  })

  it('yalnız grup dersi varsa ana temas odur', () => {
    expect(deriveMainContact([grupMatematik])?.id).toBe('grup')
  })

  it('pasif hizmet ana temas olamaz', () => {
    // Pasife alınan hizmet geçmişi taşır, geleceği kurmaz.
    const pasifKocluk = { ...bireyselKocluk, status: 'passive' as const }
    expect(deriveMainContact([grupMatematik, pasifKocluk])?.id).toBe('grup')
  })

  it('hiç aktif hizmet yoksa null döner', () => {
    expect(deriveMainContact([])).toBeNull()
    expect(deriveMainContact([{ ...grupMatematik, status: 'passive' }])).toBeNull()
  })

  it('aynı öncelikte haftanın en erken slotu kazanır', () => {
    const persembe = svc({ id: 'per', kind: 'kocluk', weekday: 4, startTime: '09:00' })
    const sali = svc({ id: 'sal', kind: 'kocluk', weekday: 2, startTime: '23:00' })
    expect(deriveMainContact([persembe, sali])?.id).toBe('sal')
  })

  it('aynı günde erken saat kazanır', () => {
    const gec = svc({ id: 'gec', kind: 'kocluk', weekday: 2, startTime: '20:00' })
    const erken = svc({ id: 'erken', kind: 'kocluk', weekday: 2, startTime: '08:00' })
    expect(deriveMainContact([gec, erken])?.id).toBe('erken')
  })

  it('giriş sırası sonucu değiştirmez', () => {
    // Ekleme sırasına bağlı bir seçim, veri hiç değişmeden ana temasın
    // değişmesine yol açardı.
    const set = [grupMatematik, birebirDers, bireyselKocluk]
    const ilk = deriveMainContact(set)?.id
    const ters = deriveMainContact([...set].reverse())?.id
    expect(ilk).toBe(ters)
  })
})

describe('occurrencesInMonth', () => {
  it('5 Çarşambalı ayda 5 oturum üretir', () => {
    // "Aylık paket = 4 görüşme" varsayımı yapılmaz (§8).
    // Eylül 2026: Çarşambalar 2, 9, 16, 23, 30.
    const hits = occurrencesInMonth(grupMatematik, 2026, 9)
    expect(hits).toHaveLength(5)
    expect(hits[0].toISOString()).toBe('2026-09-02T17:00:00.000Z') // 20:00 TR
    expect(hits[4].toISOString()).toBe('2026-09-30T17:00:00.000Z')
  })

  it('4 Cumartesili ayda 4 oturum üretir', () => {
    // Ekim 2026: Cumartesiler 3, 10, 17, 24, 31 -> 5. Kasım 2026: 7, 14,
    // 21, 28 -> 4. Aynı hizmet, farklı ay, farklı sayı.
    expect(occurrencesInMonth(bireyselKocluk, 2026, 11)).toHaveLength(4)
    expect(occurrencesInMonth(bireyselKocluk, 2026, 10)).toHaveLength(5)
  })

  it('başlangıç tarihinden önce oturum üretmez', () => {
    const gecBaslayan = { ...grupMatematik, startDate: '2026-09-17' }
    const hits = occurrencesInMonth(gecBaslayan, 2026, 9)
    // 2, 9, 16 elenir; 23 ve 30 kalır.
    expect(hits).toHaveLength(2)
    expect(hits[0].toISOString()).toBe('2026-09-23T17:00:00.000Z')
  })

  it('başlangıç gününün kendisi dahildir', () => {
    const tamGununde = { ...grupMatematik, startDate: '2026-09-16' }
    expect(occurrencesInMonth(tamGununde, 2026, 9)).toHaveLength(3)
  })

  it('başlangıçtan önceki ayda hiç üretmez', () => {
    expect(occurrencesInMonth(grupMatematik, 2026, 8)).toHaveLength(0)
  })

  it('pasif hizmet oturum üretmez', () => {
    expect(occurrencesInMonth({ ...grupMatematik, status: 'passive' }, 2026, 9)).toHaveLength(0)
  })

  it('haftanın yedi günü için de doğru gün seçilir', () => {
    // ISODOW eşleşmesi kayarsa (0-6 ile 1-7 karışması) bu test yakalar.
    for (let weekday = 1; weekday <= 7; weekday++) {
      const hits = occurrencesInMonth(
        svc({ weekday: weekday as Weekday, startTime: '12:00', startDate: '2026-09-01' }),
        2026,
        9
      )
      for (const hit of hits) {
        const trGun = new Intl.DateTimeFormat('en-GB', {
          timeZone: 'Europe/Istanbul',
          weekday: 'long',
        }).format(hit)
        const beklenen = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][
          weekday - 1
        ]
        expect(trGun).toBe(beklenen)
      }
    }
  })
})

describe('nextOccurrence', () => {
  it('aynı hafta içindeki sıradaki oturumu bulur', () => {
    const pazartesi = new Date('2026-09-14T09:00:00.000Z')
    expect(nextOccurrence(grupMatematik, pazartesi)?.toISOString()).toBe(
      '2026-09-16T17:00:00.000Z'
    )
  })

  it('ders saatinin TAM ANI hâlâ sıradaki temastır', () => {
    // Ders başlarken "sıradaki temas" bir sonraki haftaya atlamamalı;
    // öğretmen o an ekrana bakıyorsa bugünkü dersi görmeli.
    const dersAni = new Date('2026-09-16T17:00:00.000Z')
    expect(nextOccurrence(grupMatematik, dersAni)?.toISOString()).toBe(
      '2026-09-16T17:00:00.000Z'
    )
  })

  it('bir dakika sonrası bir sonraki haftaya geçer', () => {
    const dersBitti = new Date('2026-09-16T17:01:00.000Z')
    expect(nextOccurrence(grupMatematik, dersBitti)?.toISOString()).toBe(
      '2026-09-23T17:00:00.000Z'
    )
  })

  it('ay sınırını aşar', () => {
    // Eylül'ün son Çarşambasından sonra Ekim'e geçmeli.
    const ayinSonu = new Date('2026-09-30T18:00:00.000Z')
    expect(nextOccurrence(grupMatematik, ayinSonu)?.toISOString()).toBe(
      '2026-10-07T17:00:00.000Z'
    )
  })

  it('yıl sınırını aşar', () => {
    const yilinSonu = new Date('2026-12-31T23:00:00.000Z')
    const hit = nextOccurrence(grupMatematik, yilinSonu)
    expect(hit?.toISOString()).toBe('2027-01-06T17:00:00.000Z')
  })

  it('pasif hizmet için null döner', () => {
    expect(nextOccurrence({ ...grupMatematik, status: 'passive' }, new Date())).toBeNull()
  })
})

describe('defaultSubmissionDeadline', () => {
  it('kaydırma yoksa Son Teslim ana temas saatidir', () => {
    // Ürün kararı: tek resmi kapanış = ana temas saati.
    const pazartesi = new Date('2026-09-14T09:00:00.000Z')
    expect(defaultSubmissionDeadline(bireyselKocluk, pazartesi)?.toISOString()).toBe(
      '2026-09-19T07:00:00.000Z' // Cumartesi 10:00 TR
    )
  })

  it('kaydırma varsa o kadar geri çeker', () => {
    // R7-01'in "grup dersinde ders - 6 saat" önerisi: zorunlu kural
    // değil, hizmet başına opsiyonel ayar.
    const altiSaatOnce = { ...grupMatematik, submissionOffsetMinutes: 360 }
    const pazartesi = new Date('2026-09-14T09:00:00.000Z')
    expect(defaultSubmissionDeadline(altiSaatOnce, pazartesi)?.toISOString()).toBe(
      '2026-09-16T11:00:00.000Z' // 20:00 - 6sa = 14:00 TR
    )
  })

  it('oturum yoksa null döner', () => {
    expect(
      defaultSubmissionDeadline({ ...grupMatematik, status: 'passive' }, new Date())
    ).toBeNull()
  })
})

describe('nextContact', () => {
  it('ana temastan BAĞIMSIZ olarak en yakın temasi verir', () => {
    // Sude: ana temas Cumartesi koçluk, ama Pazartesi bakıldığında
    // sıradaki temas Çarşamba grup dersidir. Dashboard "bugün kimi
    // göreceğim" sorusunu bununla cevaplar.
    const services = [grupMatematik, bireyselKocluk]
    const pazartesi = new Date('2026-09-14T09:00:00.000Z')

    expect(deriveMainContact(services)?.id).toBe('kocluk')

    const next = nextContact(services, pazartesi)
    expect(next?.service.id).toBe('grup')
    expect(next?.at.toISOString()).toBe('2026-09-16T17:00:00.000Z')
  })

  it('grup dersi geçtikten sonra koçluğa döner', () => {
    const services = [grupMatematik, bireyselKocluk]
    const persembe = new Date('2026-09-17T09:00:00.000Z')
    expect(nextContact(services, persembe)?.service.id).toBe('kocluk')
  })

  it('hiç hizmet yoksa null döner', () => {
    expect(nextContact([], new Date())).toBeNull()
  })
})
