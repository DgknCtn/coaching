import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { APP_TIME_ZONE } from '@/lib/homework-status'

// ============================================================
// AİDİYET KURALI — SQL ↔ TYPESCRIPT PARİTESİ
//
// NEDEN BU TEST VAR
//
// "Bu ödev bu haftaya mı ait?" sorusu İKİ yerde cevaplanıyor ve bu
// bilinçli:
//
//   SQL (077 · attach_batch_to_flow) SUNUCU OTORİTESİ. Partiyi akışa
//     gerçekten bağlayan karar orada verilir.
//   TypeScript (lib/weekly-flow.ts · flowMembership) ARAYÜZÜN CANLI
//     CEVABI. Öğretmen Ödev Planlama'da tarihi değiştirdikçe sonucu
//     anında görmeli; her tuş vuruşunda sunucuya gidilmez.
//
// İki taraf AYRIŞIRSA ekranda "bu haftaya eklenecek" yazan ödev
// sunucuda bağlanmadan kalır — ya da tersi. Haftanın toplam yükü ve
// tempo hesabı o anda yalan söylemeye başlar.
//
// AYRIŞMA BİR KEZ GERÇEKTEN OLDU: flowMembership zaman damgalarını
// (getTime) karşılaştırıyordu, SQL ise GÜNLERİ. Kapanışı Pazar 10:00
// olan bir haftada aynı güne verilen ödev SQL'de bağlanıyor, arayüzde
// "gelecek hafta" görünüyordu.
//
// Canlı veritabanı olmadan SQL çalıştırılamıyor; onun yerine migration
// metnindeki karşılaştırma biçimi okunuyor (repodaki diğer
// *-sql-parity testleriyle aynı yöntem).
// ============================================================

// OKUNAN DOSYA, AİDİYET KURALINI EN SON TANIMLAYAN MIGRATION'dır.
// Kural başka bir migration'a taşınırsa bu yol da güncellenmelidir;
// yoksa test artık çalışmayan bir tanımı doğrular.
const SQL_PATH = join(process.cwd(), 'supabase/migrations/077_weekly_flows.sql')
const SQL = readFileSync(SQL_PATH, 'utf8')

/** `attach_batch_to_flow` gövdesini kabaca ayıklar. */
function attachBody(): string {
  const start = SQL.indexOf('CREATE OR REPLACE FUNCTION public.attach_batch_to_flow')
  expect(start, 'attach_batch_to_flow bulunamadı').toBeGreaterThan(-1)
  const end = SQL.indexOf('$fn$;', start)
  expect(end, 'fonksiyon gövdesi kapanmıyor').toBeGreaterThan(start)
  return SQL.slice(start, end)
}

describe('attach_batch_to_flow · aidiyet karşılaştırması', () => {
  const body = attachBody()

  it('gövde gerçekten okunabildi (test boşa geçmesin)', () => {
    expect(body.length).toBeGreaterThan(200)
    expect(body).toContain('weekly_flow_id')
  })

  it('karşılaştırma GÜN düzeyinde yapılıyor', () => {
    // ::DATE olmadan saatli bir karşılaştırma olurdu ve TypeScript
    // tarafındaki flowMembership ile ayrışırdı.
    expect(
      body,
      'due_at ::DATE ile güne indirgenmeli — flowMembership de gün karşılaştırıyor'
    ).toMatch(/due_at\s+AT TIME ZONE\s+'[^']+'\)::DATE/)
  })

  it('gün, uygulamanın YEREL takviminden alınıyor', () => {
    // UTC alınsaydı gece yarısına yakın kapanışlar bir gün kayar ve
    // aynı ödev iki tarafta iki farklı haftaya düşerdi.
    const zone = body.match(/AT TIME ZONE\s+'([^']+)'/)?.[1]
    expect(zone, 'saat dilimi bulunamadı').toBeDefined()
    expect(zone).toBe(APP_TIME_ZONE)
  })

  it('kapanış gününü AŞAN ödev bağlanmıyor, eşit olan bağlanıyor', () => {
    // Operatör ">" olmalı: ">=" olsaydı kapanış gününe verilen ödev
    // düşerdi (öğretmenin aynı gün verdiği iş ekrandan kaybolurdu).
    expect(body).toMatch(/due_date\s*>\s*\(/)
    expect(body).not.toMatch(/due_date\s*>=\s*\(/)
  })

  it('aktif akış yoksa parti akışsız kalıyor, hata verilmiyor', () => {
    // Aktif akışı olmayan öğrenciye ödev verilememesi saçma olurdu;
    // kural RETURN NULL ile sessiz kalmalı (kabul #7 ile uyumlu).
    expect(body).toContain('RETURN NULL')
  })

  it("yalnız 'active' akış hedefleniyor", () => {
    // Kapanmış akışa yeni ödev bağlanmaz (§5 son madde).
    expect(body).toMatch(/status\s*=\s*'active'/)
  })
})
