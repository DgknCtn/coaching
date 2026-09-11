import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { APP_TIME_ZONE } from '@/lib/homework-status'

// ============================================================
// TELAFİNİN AYI — SAYAÇ İLE LİSTE AYNI KURALI KULLANIR
//
// NEDEN BU TEST VAR
//
// R7-04 §7-C: *"Telafi hangi ayda yapılırsa yapılsın asıl ayın hizmet
// borcuna aittir."* Kural İKİ view'da birden yaşıyor:
//
//   student_service_month_view   (075) — aylık SAYAÇLAR
//   student_service_session_view (082) — aylık LİSTE
//
// Ayrışırlarsa aynı ekranda sayaç "4/5" derken liste dört değil beş
// satır gösterir; ya da Eylül'ün telafisi Ekim listesinde görünürken
// Eylül sayacı tamamlanır. İkisi de sessiz.
//
// Hata bir kez gerçekten oldu: ekran bu view'ların HİÇBİRİNİ
// sorgulamıyor, ham `service_sessions`'ı `planned_at` aralığıyla çekip
// sayıları JavaScript'te yeniden hesaplıyordu. Kural veritabanında
// doğru, ekranda yanlıştı.
//
// Canlı veritabanı olmadan SQL çalıştırılamıyor; iki migration'daki ay
// ifadesi metin olarak karşılaştırılıyor (repodaki diğer *-parity
// testleriyle aynı yöntem).
// ============================================================

const DIR = join(process.cwd(), 'supabase/migrations')
const MONTH_VIEW_SQL = readFileSync(join(DIR, '075_service_sessions_rpc.sql'), 'utf8')
const SESSION_VIEW_SQL = readFileSync(join(DIR, '082_session_month_attribution.sql'), 'utf8')

/** `date_trunc('month', ...)` ifadesini boşluklardan arındırıp verir. */
function monthExpression(sql: string, label: string): string {
  const m = sql.match(
    /date_trunc\(\s*'month',\s*COALESCE\([^)]*\)\s*AT TIME ZONE\s*'[^']+'\s*\)::DATE/
  )
  if (!m) {
    throw new Error(`${label}: ay ifadesi bulunamadı. Kural taşındıysa test de güncellenmeli.`)
  }
  return m[0].replace(/\s+/g, ' ')
}

describe('ay atfı · iki view tek kural', () => {
  const counter = monthExpression(MONTH_VIEW_SQL, '075')
  const list = monthExpression(SESSION_VIEW_SQL, '082')

  it('ifadeler gerçekten okunabildi (test boşa geçmesin)', () => {
    expect(counter.length).toBeGreaterThan(40)
    expect(list.length).toBeGreaterThan(40)
  })

  it('sayaç ve liste AYNI ay ifadesini kullanıyor', () => {
    expect(list).toBe(counter)
  })

  it('telafi ASIL oturumun ayına yazılıyor', () => {
    // COALESCE'in ilk argümanı asıl oturum olmalı; sıra ters çevrilirse
    // telafi kendi ayına düşer ve kural bozulur.
    expect(counter).toMatch(/COALESCE\(\s*asil\.planned_at\s*,\s*ss\.planned_at\s*\)/)
    expect(list).toMatch(/COALESCE\(\s*asil\.planned_at\s*,\s*ss\.planned_at\s*\)/)
  })

  it('ay YEREL takvimden alınıyor', () => {
    // UTC alınsaydı ayın ilk gecesindeki oturumlar bir önceki aya
    // düşerdi.
    for (const expr of [counter, list]) {
      const zone = expr.match(/AT TIME ZONE '([^']+)'/)?.[1]
      expect(zone).toBe(APP_TIME_ZONE)
    }
  })
})

describe('telafi kararı (§7-C)', () => {
  it('sütun iki değer ve NULL kabul ediyor', () => {
    // NULL = "karar verilmedi" gerçek bir durum; 'pending' ile
    // karıştırmak öğretmenin vermediği bir sözü kaydetmek olurdu.
    expect(SESSION_VIEW_SQL).toMatch(
      /makeup_decision IS NULL OR makeup_decision IN \('pending', 'waived'\)/
    )
  })

  it('karar yalnız "Yapılmadı" için veriliyor', () => {
    // Yapılmış ya da önceden iptal edilmiş bir oturuma telafi kararı
    // yazmak, olmayan bir borcu kaydetmek olurdu.
    expect(SESSION_VIEW_SQL).toMatch(/v_row\.status <> 'yapilmadi'/)
  })

  it('RPC yetki kontrolü yapıyor', () => {
    expect(SESSION_VIEW_SQL).toMatch(/has_workspace_role\(v_row\.workspace_id/)
  })
})
