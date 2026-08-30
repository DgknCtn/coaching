// Koruma Havuzu (R5.4).
//
// Kural: "Hangi konu havuzda görünür ve hangi sırada?" sorusunu yanıtlayan
// TEK yer burasıdır. Ekran yalnız sonucu çizer.
//
// KORUMA HAVUZU BİR TEKRAR PROGRAMI DEĞİL, UNUTMA RADARIDIR.
//   - 7/21/45 gün gibi ZORUNLU TEKRAR EŞİĞİ YOKTUR (§6.6).
//   - Sistem otomatik test seçmez, ödev atamaz.
//   - Minimum 3 test / 20 dakika gibi YAPAY EŞİK YOKTUR: bir test bile
//     temas sayılır (§6.4). Miktar yorum malzemesidir.
//
// Aşağıdaki `priority` yalnız GÖRSEL bir vurgudur; hiçbir otomasyona
// bağlanmaz ve "şu gün oldu, tekrar et" demez.

import { todayDateString } from '@/lib/homework-status'

/** Sunucudan gelen ham satır: son temas + açık çalışma + akış üyeliği. */
export interface PoolRowInput {
  topicId: string
  topicName: string
  scopeId: string
  scopeName: string
  /** YYYY-MM-DD; temas yoksa null. */
  lastContactDate: string | null
  lastContactSource: 'homework' | 'lesson' | 'self_study' | null
  /** Son temas gününde yapılan çalışma adedi — yorum için. */
  lastContactAmount: number
  /** Konu üzerinde kapanmamış ödev kalemi sayısı. */
  openWorkCount: number
  /** Eğitmenin "Aktif Tut" override'ı (§6.5, istisnai). */
  keepActive: boolean
  /** Bu konuda çalışılmış kaynakların adları — "Kaynaklara Git" için. */
  bookTitles: string[]
}

export interface PoolRow extends PoolRowInput {
  lastContactDate: string
  daysSinceContact: number
  priority: PoolPriority
}

/**
 * Görsel vurgu bandı. EŞİK DEĞİLDİR: hiçbir davranışı tetiklemez, yalnız
 * uzun aralıkların gözden kaçmamasını sağlar. Eğitmen isterse 8 günlük
 * konuyu tekrar eder, 65 günlüğü etmez — karar sistemin değil.
 */
export type PoolPriority = 'normal' | 'watch' | 'priority'

export const POOL_PRIORITY_LABEL: Record<PoolPriority, string> = {
  normal: 'Normal',
  watch: 'Takipte',
  priority: 'Öncelikli',
}

export function poolPriority(daysSinceContact: number): PoolPriority {
  if (daysSinceContact >= 30) return 'priority'
  if (daysSinceContact >= 14) return 'watch'
  return 'normal'
}

/** İki date-only gün arasındaki tam gün farkı. */
export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime()
  const b = new Date(`${to}T00:00:00Z`).getTime()
  return Math.max(0, Math.round((b - a) / 86_400_000))
}

/**
 * Havuz listesini kurar.
 *
 * ELENME KURALLARI — üçü de şartnameden:
 *
 * 1. TEMASI OLMAYAN konu havuza GİRMEZ (KH-01, KH-02, KH-03).
 *    Müfredat zamanının gelmesi, ödev verilmesi veya onay bekleyen bir
 *    gönderim temas DEĞİLDİR; bunlar zaten view'a hiç girmiyor, burada
 *    da lastContactDate null olarak eleniyor.
 *
 * 2. AÇIK ÇALIŞMASI OLAN konu havuzda GÖRÜNMEZ (§6.5, KH-14).
 *    O konu "Aktif Çalışma"dır; radar zaten üstünde. Açık çalışma
 *    kapanınca ve geçmişte temas varsa geri gelir (KH-13).
 *
 * 3. "AKTİF TUT" override'lı konu da görünmez (§6.5, istisnai).
 *
 * SIRALAMA: en eski temas en üstte (§6.6). Yeni doğrulanmış çalışma
 * geldiğinde konu kendiliğinden aşağı iner (KH-11) — çünkü sıralama
 * tarihten türetiliyor, elle yönetilen bir öncelik alanı yok.
 *
 * Girdi listesi ZATEN öğrencinin aktif müfredat akışındaki konularla
 * sınırlıdır (KH-17): akıştan çıkarılan konu havuzda görünmez ama geçmiş
 * temas kaydı veritabanında durur.
 */
export function buildProtectionPool(rows: PoolRowInput[], today?: string): PoolRow[] {
  const day = today ?? todayDateString()

  return rows
    .filter(row => row.lastContactDate !== null)
    .filter(row => row.openWorkCount === 0 && !row.keepActive)
    .map(row => {
      const lastContactDate = row.lastContactDate as string
      const daysSinceContact = daysBetween(lastContactDate, day)
      return {
        ...row,
        lastContactDate,
        daysSinceContact,
        priority: poolPriority(daysSinceContact),
      }
    })
    .sort((a, b) => {
      // En uzun süredir temas görmeyen üstte.
      if (b.daysSinceContact !== a.daysSinceContact) {
        return b.daysSinceContact - a.daysSinceContact
      }
      return a.topicName.localeCompare(b.topicName, 'tr')
    })
}

/** Havuz dışında kalan ama izlenen konular: aktif çalışma hâlindekiler. */
export function activeWorkTopics(rows: PoolRowInput[]): PoolRowInput[] {
  return rows.filter(row => row.openWorkCount > 0 || row.keepActive)
}

export interface PoolSummary {
  trackedTopics: number
  inPool: number
  overThirtyDays: number
  longestDays: number | null
  longestTopicName: string | null
  averageDays: number | null
}

/** Ekranın üst şeridindeki sayılar. */
export function summarizePool(rows: PoolRowInput[], pool: PoolRow[]): PoolSummary {
  const total = pool.reduce((sum, r) => sum + r.daysSinceContact, 0)

  return {
    trackedTopics: rows.length,
    inPool: pool.length,
    overThirtyDays: pool.filter(r => r.daysSinceContact >= 30).length,
    longestDays: pool[0]?.daysSinceContact ?? null,
    longestTopicName: pool[0]?.topicName ?? null,
    averageDays: pool.length === 0 ? null : Math.round(total / pool.length),
  }
}

const SOURCE_LABEL: Record<NonNullable<PoolRowInput['lastContactSource']>, string> = {
  homework: 'Test çalışması',
  lesson: 'Ders',
  self_study: 'Kendi çalışması',
}

export function contactSourceLabel(source: PoolRowInput['lastContactSource']): string {
  return source ? SOURCE_LABEL[source] : '—'
}

/**
 * "Son temas 18 gün önce • 2 test" ifadesindeki ikinci kısım.
 *
 * Miktar YORUM MALZEMESİDİR, temas geçerliliği eşiği DEĞİLDİR (§6.4).
 * Bir test bile temastır.
 */
export function contactAmountLabel(row: Pick<PoolRow, 'lastContactAmount' | 'lastContactSource'>): string | null {
  if (row.lastContactAmount <= 0) return null
  if (row.lastContactSource === 'homework') return `${row.lastContactAmount} çalışma`
  return null
}
