import { describe, expect, it } from 'vitest'
import { financeLinkMismatchServiceIds } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/load'
import type { ServiceRow } from '@/app/(dashboard)/teacher/students/[studentId]/gorusmeler/types'
import type { FinanceModelVersion } from '@/lib/pricing-history'

// ============================================================
// FİN-01 (M1.0-04): FİNANS MODELİ ↔ HİZMET FİNANS İLİŞKİSİ ÇELİŞKİSİ
//
// NEDEN BU TEST VAR
//
// İki BAĞIMSIZ "finans ilişkisi" kavramı var: öğrenci seviyesinde
// finans modeli (student_finance_models.model/collection_timing) ve
// hizmet seviyesinde finance_link (student_services.finance_link,
// varsayılan 'haric'). Bunlar senkron tutulması tamamen kullanıcıya
// bağlı. Öğretmen "Ders Başı + Ders sonrası" modelini kurup yeni bir
// hizmet eklediğinde (ya da eskisini güncellemeyi unuttuğunda), o
// hizmet sessizce 'haric' kalır ve hızlı tahsilat (quickCollectSessionIds,
// load.ts) o hizmette hiç çalışmaz — kullanıcıya hiçbir açıklama
// gitmeden. Bu test, çelişkinin doğru tespit edildiğini VE yalnız
// gerçekten çelişen durumlarda tetiklendiğini (false positive yok)
// doğruluyor.
// ============================================================

function service(over: Partial<ServiceRow> = {}): ServiceRow {
  return {
    id: 'svc-1',
    kind: 'ders',
    participation: 'birebir',
    medium: 'online',
    groupId: null,
    groupName: null,
    cadence: 'haftada_1',
    weekday: 3,
    startTime: '18:00',
    weekday2: null,
    startTime2: null,
    plannedDurationMinutes: 60,
    startDate: '2026-09-01',
    submissionOffsetMinutes: 0,
    financeLink: 'haric',
    defaultUnitCount: 1,
    isMainContact: false,
    status: 'active',
    ...over,
  }
}

function model(over: Partial<FinanceModelVersion> = {}): FinanceModelVersion {
  return {
    model: 'ders_basi',
    collectionTiming: 'ders_sonrasi',
    validFrom: '2026-01-01',
    ...over,
  }
}

describe('financeLinkMismatchServiceIds · çelişkiyi yakalar', () => {
  it('model Ders Başı + Ders sonrası, hizmet Takip dışı -> çelişki', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ id: 'a', financeLink: 'haric' })],
      models: [model()],
      today: '2026-10-21',
    })
    expect(ids).toEqual(['a'])
  })

  it('birden fazla hizmetten yalnız Takip dışı olanlar döner', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [
        service({ id: 'a', financeLink: 'haric' }),
        service({ id: 'b', financeLink: 'ders_basi' }),
        service({ id: 'c', financeLink: 'haric' }),
      ],
      models: [model()],
      today: '2026-10-21',
    })
    expect(ids.sort()).toEqual(['a', 'c'])
  })
})

describe('financeLinkMismatchServiceIds · yanlış pozitif üretmez', () => {
  it('model Aylık Sabit ise çelişki yok (farklı model)', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ financeLink: 'haric' })],
      models: [model({ model: 'aylik_sabit', collectionTiming: 'ay_basi' })],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })

  it('model Ders Başı ama tahsilat Ay sonu ise çelişki yok (timing farklı)', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ financeLink: 'haric' })],
      models: [model({ model: 'ders_basi', collectionTiming: 'ay_sonu' })],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })

  it('hizmetin finance_link değeri zaten ders_basi ise çelişki yok', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ financeLink: 'ders_basi' })],
      models: [model()],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })

  it('hizmetin finance_link değeri aylik_paket ise çelişki yok (Takip dışı değil)', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ financeLink: 'aylik_paket' })],
      models: [model()],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })

  it('finans modeli hiç tanımlı değilse çelişki yok', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ financeLink: 'haric' })],
      models: [],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })

  it('pasif hizmet hariç tutulur — kullanıcı zaten kullanmıyor, uyarı gereksiz', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ status: 'passive', financeLink: 'haric' })],
      models: [model()],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })

  it('arşivlenmiş hizmet hariç tutulur', () => {
    const ids = financeLinkMismatchServiceIds({
      services: [service({ status: 'archived', financeLink: 'haric' })],
      models: [model()],
      today: '2026-10-21',
    })
    expect(ids).toEqual([])
  })
})

describe('financeLinkMismatchServiceIds · tarihe duyarlı model seçimi', () => {
  it('birden fazla model versiyonu varsa `today` tarihinde geçerli olan kullanılır', () => {
    const models: FinanceModelVersion[] = [
      model({ model: 'aylik_sabit', collectionTiming: 'ay_basi', validFrom: '2026-01-01' }),
      model({ model: 'ders_basi', collectionTiming: 'ders_sonrasi', validFrom: '2026-09-01' }),
    ]
    // Eski model dönemindeki bir tarihte sorgulanırsa çelişki YOK.
    expect(
      financeLinkMismatchServiceIds({
        services: [service({ financeLink: 'haric' })],
        models,
        today: '2026-05-01',
      })
    ).toEqual([])
    // Yeni model yürürlükteyken çelişki VAR.
    expect(
      financeLinkMismatchServiceIds({
        services: [service({ financeLink: 'haric' })],
        models,
        today: '2026-10-21',
      })
    ).toEqual(['svc-1'])
  })
})
