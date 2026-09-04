import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  BASE_PER_STUDENT_MONTH_KURUS,
  DURATION_DISCOUNTS,
  VOLUME_DISCOUNTS,
  MAX_MONTHS,
} from '@/lib/billing/pricing'

// FİYAT: SQL ↔ TYPESCRIPT PARİTESİ
//
// ============================================================
// NEDEN BU TEST VAR
//
// Fiyat iki yerde hesaplanıyor ve bu bilinçli:
//   - SQL (058) SUNUCU OTORİTESİ. İstemci tutar gönderemesin diye
//     ödenecek rakamı veritabanı belirler.
//   - TypeScript (lib/billing/pricing.ts) ARAYÜZÜN CANLI HESABI.
//     Kullanıcı öğrenci sayısını değiştirdikçe tutarı anında görmeli;
//     her tuş vuruşunda sunucuya gitmek olmaz.
//
// İki taraf AYRIŞIRSA müşteri ekranda gördüğünden başka bir tutar öder.
// Bu, para söz konusu olduğunda kabul edilebilir bir hata değil.
//
// Canlı veritabanı olmadan SQL çalıştırılamıyor; onun yerine migration
// dosyasındaki sayılar okunup TypeScript sabitleriyle karşılaştırılıyor.
// Biri değişip diğeri unutulursa CI kırılır.
//
// Migration'daki PARITY-BEGIN/END blokları BU TEST İÇİN var; taşınır ya
// da silinirlerse test bunu da söyler.
// ============================================================

const SQL_PATH = join(process.cwd(), 'supabase/migrations/058_license_model.sql')

function parityBlock(sql: string, name: string): string {
  const match = sql.match(
    new RegExp(`PARITY-BEGIN ${name}\\n([\\s\\S]*?)-- PARITY-END ${name}`)
  )
  if (!match) {
    throw new Error(
      `Migration'da "PARITY-BEGIN ${name}" bloğu bulunamadı. ` +
        'Blok silinmiş ya da taşınmışsa fiyat paritesi artık korunmuyor demektir.'
    )
  }
  return match[1]
}

describe('fiyat tabloları SQL ile aynı', () => {
  const sql = readFileSync(SQL_PATH, 'utf8')

  it('taban birim fiyat aynı', () => {
    const block = parityBlock(sql, 'base')
    const value = Number(block.replace(/[^0-9]/g, ''))
    expect(value).toBe(BASE_PER_STUDENT_MONTH_KURUS)
  })

  it('süre indirimi tablosu aynı', () => {
    const block = parityBlock(sql, 'duration')
    const pairs = [...block.matchAll(/(\d+):(\d+)/g)]

    expect(pairs.length).toBe(MAX_MONTHS)

    for (const [, months, percent] of pairs) {
      expect(DURATION_DISCOUNTS[Number(months)]).toBe(Number(percent))
    }
  })

  it('adet indirimi kademeleri aynı', () => {
    const block = parityBlock(sql, 'volume')
    const pairs = [...block.matchAll(/(\d+):(\d+)/g)]

    expect(pairs.length).toBe(VOLUME_DISCOUNTS.length)

    pairs.forEach(([, minStudents, percent], i) => {
      expect(VOLUME_DISCOUNTS[i].minStudents).toBe(Number(minStudents))
      expect(VOLUME_DISCOUNTS[i].percent).toBe(Number(percent))
    })
  })

  it('SQL fonksiyonu TypeScript ile aynı sırada yuvarlıyor', () => {
    // Yuvarlamanın YERİ sonucu değiştirir: önce birim fiyatı yuvarlayıp
    // sonra çarpmak ile toplamı bir kez yuvarlamak farklı kuruş üretir.
    // SQL'de ROUND'un dışta, tüm çarpımdan sonra olduğunu doğruluyoruz.
    const fn = sql.match(
      /CREATE OR REPLACE FUNCTION public\.license_price_kurus[\s\S]*?\$fn\$;/
    )
    expect(fn, 'license_price_kurus bulunamadı').not.toBeNull()

    const body = fn![0]
    // Tek bir ROUND olmalı ve çarpımların tamamını sarmalı.
    expect((body.match(/ROUND\(/g) ?? []).length).toBe(1)
    expect(body).toMatch(/ROUND\(\s*\n?\s*\(50000::NUMERIC \* p_students \* p_months\)/)
  })
})
