// Öğrenci Genel Bakış özetleri (R5.5).
//
// Amaç: R5'in TAMAMINI ana ekrana yığmak değil; üç sistemin nabzını
// göstermek ve detay ekranlarına geçiş sağlamak.
//
// İKİ SINIR — şartnamenin §7.2'si:
//   1. Ana ekran YORUMLAYICI RİSK/SAĞLIK/DÜZEN PUANI ÜRETMEZ. Burada
//      hiçbir fonksiyon "bu öğrenci riskli" gibi bir yargı hesaplamaz;
//      yalnız var olanı özetler.
//   2. R5 verisi olmayan öğrencide ekran KIRILMAZ. Her özet boş girdiyle
//      çağrılabilir ve nötr bir sonuç döner.

import { deriveFlowStatus, type FlowItem, type FlowStatus } from '@/lib/curriculum-flow'
import { todayDateString } from '@/lib/homework-status'

// ============================================================
// Akademik Akış özeti
// ============================================================

export interface FlowSummaryItem {
  topicId: string
  topicName: string
  scopeId: string
  scopeName: string
  startDate: string
  endDate: string
  passed: boolean
}

export interface AcademicFlowSummary {
  /** Şu an zamanı gelmiş konu (birden fazlaysa en erken başlayan). */
  current: FlowSummaryItem | null
  /** Sıradaki yaklaşan konu. */
  upcoming: FlowSummaryItem | null
  /** Özetin hangi ders üzerinden gösterildiği. */
  scopeId: string | null
  scopeName: string | null
  /** Birden fazla ders akışı varsa arayüz bunu belirtir. */
  otherScopeCount: number
}

function statusOf(item: FlowSummaryItem, today: string): FlowStatus {
  const asFlowItem: FlowItem = {
    id: null,
    topicId: item.topicId,
    name: item.topicName,
    startDate: item.startDate,
    endDate: item.endDate,
    passed: item.passed,
    note: null,
  }
  return deriveFlowStatus(asFlowItem, today)
}

/**
 * Akademik Akış kartı: şu anki konu + yaklaşan konu.
 *
 * GEÇİLDİ KONULAR ÖZETİ DOLDURMAZ (§7.1): merkezî akışta geride kalmış
 * bir konu "şu an çalışılan" değildir. Onların yeri Koruma Havuzu'dur.
 *
 * ÇOK SCOPE: ana ekran bütün programı göstermeye ÇALIŞMAZ (§7.1, OG-08).
 * Tek bir ders seçilir — zamanı gelmiş konusu olan ders önceliklidir,
 * yoksa en yakın başlayacak ders. Diğerlerinin sayısı ayrıca belirtilir
 * ki eğitmen eksik bilgiye baktığını bilsin.
 */
export function summarizeAcademicFlow(
  items: FlowSummaryItem[],
  today?: string
): AcademicFlowSummary {
  const day = today ?? todayDateString()
  const empty: AcademicFlowSummary = {
    current: null,
    upcoming: null,
    scopeId: null,
    scopeName: null,
    otherScopeCount: 0,
  }

  if (items.length === 0) return empty

  const active = items.filter(i => statusOf(i, day) === 'current')
  const upcoming = items.filter(i => statusOf(i, day) === 'upcoming')

  // Odaklanılacak ders: zamanı gelmiş konusu olan; yoksa en yakın başlayan.
  const byStart = (a: FlowSummaryItem, b: FlowSummaryItem) =>
    a.startDate.localeCompare(b.startDate)

  const anchor =
    [...active].sort(byStart)[0] ?? [...upcoming].sort(byStart)[0] ?? null

  if (!anchor) return empty

  const scopeId = anchor.scopeId
  const scopeItems = items.filter(i => i.scopeId === scopeId)
  const scopeActive = scopeItems.filter(i => statusOf(i, day) === 'current').sort(byStart)
  const scopeUpcoming = scopeItems.filter(i => statusOf(i, day) === 'upcoming').sort(byStart)

  const allScopes = new Set(items.map(i => i.scopeId))

  return {
    current: scopeActive[0] ?? null,
    upcoming: scopeUpcoming[0] ?? null,
    scopeId,
    scopeName: anchor.scopeName,
    otherScopeCount: Math.max(0, allScopes.size - 1),
  }
}

// ============================================================
// Kaynak Planı özeti
// ============================================================

export interface ResourceSummaryItem {
  bookId: string
  title: string
  /** pending | active | completed (R5.1 Kitap Durumu). */
  group: 'active' | 'pending' | 'completed'
  /** Hedef kapsamındaki tamamlanma yüzdesi — ANA gösterge. */
  planPercentage: number
  /** Kitabın fiziksel kapsamı — ikinci seviye bilgi. */
  bookPercentage: number
}

export interface ResourcePlanSummary {
  activeCount: number
  pendingCount: number
  completedCount: number
  /** Aktif kaynakların ortalama Plan %'si. Aktif kaynak yoksa null. */
  averagePlanPercentage: number | null
  /** Kartta gösterilecek birkaç aktif kaynak. */
  topActive: ResourceSummaryItem[]
}

/**
 * Kaynak Planı kartı.
 *
 * ÖNCELİKLİ YÜZDE PLAN TAMAMLANMASIDIR (§7.1, OG-04). Kitap % detay
 * ekranında ikinci seviyede kalır; ana kartta karar verici sayı Plan
 * %'dir. 276/276 hedef tamamlanmışsa kart %100 der — kitabın yalnız
 * %66'sı bitmiş olsa bile, çünkü PLAN bitmiştir.
 */
export function summarizeResourcePlan(
  items: ResourceSummaryItem[],
  limit = 3
): ResourcePlanSummary {
  const active = items.filter(i => i.group === 'active')

  const averagePlanPercentage =
    active.length === 0
      ? null
      : Math.round(active.reduce((sum, i) => sum + i.planPercentage, 0) / active.length)

  return {
    activeCount: active.length,
    pendingCount: items.filter(i => i.group === 'pending').length,
    completedCount: items.filter(i => i.group === 'completed').length,
    averagePlanPercentage,
    // En düşük ilerlemeli aktif kaynaklar önce: dikkat gereken yer orası.
    topActive: [...active]
      .sort((a, b) => a.planPercentage - b.planPercentage)
      .slice(0, limit),
  }
}

// ============================================================
// Koruma Havuzu özeti
// ============================================================

export interface PoolSummaryItem {
  topicId: string
  topicName: string
  daysSinceContact: number
}

/**
 * Koruma Havuzu kartı: yalnız EN ESKİ 2-3 konu (§7.1, OG-06).
 *
 * Havuzda 8 konu olsa da ana ekran hepsini listelemez; kart bir nabız
 * göstergesidir, liste değil. Tamamı detay ekranında.
 */
export function summarizeProtectionPool(
  items: PoolSummaryItem[],
  limit = 3
): { top: PoolSummaryItem[]; total: number } {
  return {
    top: items.slice(0, limit),
    total: items.length,
  }
}
