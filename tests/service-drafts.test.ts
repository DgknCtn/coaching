import { describe, expect, it } from 'vitest'
import { SERVICE_DRAFT_OPTIONS, SERVICE_DRAFT_VALUES } from '@/lib/validation'

// ============================================================
// YENİ ÖĞRENCİDE HİZMET TASLAKLARI — R7-04 Rev.3 §5
//
// NEDEN BU TEST VAR
//
// Tek seçimli "Çalışma Modeli" kalktı; yerine kayıt anında birden fazla
// hizmet seçilebiliyor ve seçilenler `student_services` satırı olarak
// açılıyor. Bu liste doğrudan veritabanına yazılan değerleri taşıyor:
// 074'teki CHECK kısıtlarıyla uyuşmayan tek bir satır, öğrenci
// kaydedildikten SONRA patlar ve öğretmen yeni öğrenciyi hizmetsiz
// bulur.
//
// İki kısıt özellikle önemli:
//
//   1. `kind` ve `medium` yalnız CHECK'teki değerleri alabilir.
//   2. Katılım burada her zaman 'birebir'. Grup hizmeti bir gruba
//      bağlı olmak ZORUNDA (student_services_group_matches_participation)
//      ve kayıt anında seçilecek bir grup yok.
// ============================================================

describe('SERVICE_DRAFT_OPTIONS', () => {
  it('kind değerleri 074 CHECK ile uyumlu', () => {
    for (const o of SERVICE_DRAFT_OPTIONS) {
      expect(['ders', 'kocluk']).toContain(o.kind)
    }
  })

  it('medium değerleri 074 CHECK ile uyumlu', () => {
    for (const o of SERVICE_DRAFT_OPTIONS) {
      expect(['online', 'yuz_yuze']).toContain(o.medium)
    }
  })

  it('grup seçeneği YOK — grup zorunlu group_id ister', () => {
    for (const o of SERVICE_DRAFT_OPTIONS) {
      expect(o.value).not.toMatch(/grup/)
      expect(o.label.toLocaleLowerCase('tr')).not.toContain('grup')
    }
  })

  it('anahtarlar benzersiz', () => {
    expect(new Set(SERVICE_DRAFT_VALUES).size).toBe(SERVICE_DRAFT_VALUES.length)
  })

  it('her tür/ortam kombinasyonu bir kez var', () => {
    // Dört kombinasyondan biri eksik kalırsa öğretmen onu kayıt anında
    // seçemez ve hizmeti sonradan eklemek zorunda kalır.
    const combos = SERVICE_DRAFT_OPTIONS.map((o) => `${o.kind}:${o.medium}`)
    expect(new Set(combos).size).toBe(4)
  })

  it('her seçeneğin okunur bir etiketi var', () => {
    for (const o of SERVICE_DRAFT_OPTIONS) {
      expect(o.label.trim().length).toBeGreaterThan(3)
    }
  })
})
