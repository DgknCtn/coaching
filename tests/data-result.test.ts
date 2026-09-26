import { describe, expect, it, vi } from 'vitest'

// `reportError` console.error'a yazıyor; testte gürültü yapmasın ama
// ÇAĞRILDIĞI da doğrulanabilsin.
vi.mock('@/lib/observability', () => ({ reportError: vi.fn() }))

import { allOk, listResult, singleResult } from '@/lib/data-result'
import { reportError } from '@/lib/observability'

// VERİ SONUCU SÖZLEŞMESİ (PRD · B01)
//
// NEDEN BU TEST VAR: Supabase hata FIRLATMAZ, `{ data: null, error }`
// döner. Kod tabanı `data ?? []` okuyordu ve hata sessizce boş diziye
// dönüşüyordu. Bu modülün tek işi o iki durumu ayrı tutmak; testin tek
// işi de ayrı tutulduğunu kanıtlamak.

const hata = { message: 'permission denied for table homework_batches', code: '42501' }

describe('listResult', () => {
  it('hata, boş diziye DÖNÜŞMEZ', () => {
    // KUSURUN TAM TEKRARI: eski kod `{ data: null, error }` görünce
    // `[]` kullanıyordu. Burada `ok: false` dönmeli ve dizi hiç elde
    // edilememeli.
    const sonuc = listResult({ data: null, error: hata }, 'test.liste')
    expect(sonuc.ok).toBe(false)
    expect('data' in sonuc).toBe(false)
  })

  it('başarılı boş sonuç, hata DEĞİLDİR', () => {
    // Ayrımın öbür yarısı: "veri yok" meşru bir sonuç.
    expect(listResult({ data: [], error: null }, 'test.liste')).toEqual({ ok: true, data: [] })
  })

  it('başarılı sonuç veriyi taşır', () => {
    expect(listResult({ data: [{ id: 1 }], error: null }, 'test.liste')).toEqual({
      ok: true,
      data: [{ id: 1 }],
    })
  })

  it('hatayı raporlar — kullanıcıya gösterilip işletmeye görünmeyen hata düzeltilmez', () => {
    vi.mocked(reportError).mockClear()
    listResult({ data: null, error: hata }, 'veli.odev_durumu')
    expect(reportError).toHaveBeenCalledOnce()
    expect(vi.mocked(reportError).mock.calls[0][1]).toMatchObject({
      source: 'veli.odev_durumu',
      code: '42501',
    })
  })

  it('başarıda rapor YAZMAZ', () => {
    vi.mocked(reportError).mockClear()
    listResult({ data: [], error: null }, 'test.liste')
    expect(reportError).not.toHaveBeenCalled()
  })
})

describe('singleResult', () => {
  it('"kayıt yok" (null) başarılı bir sonuçtur', () => {
    // `maybeSingle` kayıt bulamayınca `data: null, error: null` döner.
    // Bunu hata saymak, meşru boşluğu arıza gibi göstermek olurdu.
    expect(singleResult({ data: null, error: null }, 'test.tekil')).toEqual({ ok: true, data: null })
  })

  it('hata, null veriyle KARIŞMAZ', () => {
    const sonuc = singleResult({ data: null, error: hata }, 'test.tekil')
    expect(sonuc.ok).toBe(false)
  })
})

describe('allOk', () => {
  it('bir sorgu bile düştüyse türetilen yargı verilmez', () => {
    expect(
      allOk(
        { ok: true, data: [] },
        { ok: false, error: 'x' },
        { ok: true, data: null }
      )
    ).toBe(false)
  })

  it('hepsi başarılıysa verilir', () => {
    expect(allOk({ ok: true, data: [] }, { ok: true, data: null })).toBe(true)
  })
})
