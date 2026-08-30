// Müfredat Sinyali (R5.3).
//
// Kural: "Bu kitap bölümünün zamanı geldi mi?" sorusunu yanıtlayan TEK yer
// burasıdır. Kitap Haritası yalnız sonucu çizer.
//
// SİNYALİN NE OLMADIĞI, ne olduğundan daha önemli (§5.5):
//   - Otomatik ödev OLUŞTURMAZ.
//   - Kitabı otomatik Aktif YAPMAZ.
//   - Hedef kapsamı DEĞİŞTİRMEZ.
//   - Topic contact OLUŞTURMAZ (Koruma Havuzu'nu etkilemez).
//
// Sinyal salt görsel bir zaman bilgisidir. Müfredat zamanı gelmemiş bir
// konudan ödev vermek serbesttir; "önden çalışma" diye ayrı bir duruma
// gerek yoktur.

import { deriveFlowStatus, type FlowStatus } from '@/lib/curriculum-flow'

/** Öğrencinin akışındaki bir konunun sinyal için gereken asgari hâli. */
export interface CurriculumPosition {
  startDate: string
  passed: boolean
}

/** topic_id -> öğrencinin o konudaki akış konumu. */
export type CurriculumByTopic = Map<string, CurriculumPosition>

/**
 * Bir kitap bölümünün müfredat durumu.
 *
 * `null` üç ayrı sebeple dönebilir ve üçü de NORMAL durumdur:
 *   - bölümün topic eşlemesi yok (MK-06)
 *   - öğrencinin akışında o konu yok
 *   - öğrenciye henüz akış atanmamış
 *
 * Hiçbiri hata değildir; kitap R4 davranışıyla çalışmaya devam eder.
 */
export function sectionCurriculumStatus(
  topicId: string | null | undefined,
  byTopic: CurriculumByTopic,
  today?: string
): FlowStatus | null {
  if (!topicId) return null
  const position = byTopic.get(topicId)
  if (!position) return null

  return deriveFlowStatus(
    {
      id: null,
      topicId,
      name: '',
      startDate: position.startDate,
      endDate: position.startDate,
      passed: position.passed,
      note: null,
    },
    today
  )
}

/**
 * Bölüm başlığında AKTİF sinyal (● + kalın) gösterilecek mi?
 *
 * YALNIZ "Zamanı Geldi" durumunda gösterilir (§5.3 matrisi):
 *   Yaklaşıyor -> sinyal YOK   (MK-04)
 *   Zamanı Geldi -> sinyal VAR (MK-01, MK-02, MK-03)
 *   Geçildi -> aktif sinyal KALKAR (MK-05)
 *
 * "Geçildi"de sinyalin kalkması bilinçlidir: merkezî akışta konu geride
 * kaldı demektir, öğrenildi/unutulmaz demek değildir. O konuya geri dönmek
 * gerekip gerekmediği Koruma Havuzu'nun (R5.4) işidir, bu sinyalin değil.
 */
export function hasActiveSignal(status: FlowStatus | null): boolean {
  return status === 'current'
}

/**
 * Sinyalin ekran okuyucu ve tooltip metni.
 *
 * Renk ve simge tek başına anlam taşımaz; projenin mevcut kuralı gereği
 * her görsel işaretin metinsel karşılığı da bulunmalıdır.
 */
export function signalLabel(status: FlowStatus | null): string | null {
  return status === 'current' ? 'Müfredat zamanı geldi' : null
}

/** Sunucudan gelen akış satırlarını topic bazlı haritaya çevirir. */
export function buildCurriculumIndex(
  rows: { topic_id: string | null; start_date: string; passed_at: string | null }[]
): CurriculumByTopic {
  const map: CurriculumByTopic = new Map()
  for (const row of rows) {
    if (!row.topic_id) continue
    // Aynı topic akışta birden fazla kez görünürse (ileride "Böl"
    // eklenirse) EN ERKEN başlangıç kazanır: konunun zamanı, ilk
    // bloğunun başladığı andır.
    const existing = map.get(row.topic_id)
    if (existing && existing.startDate <= row.start_date) continue
    map.set(row.topic_id, {
      startDate: row.start_date,
      passed: row.passed_at !== null,
    })
  }
  return map
}
