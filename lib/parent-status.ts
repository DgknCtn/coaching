// VELİ EKRANININ ÜST ÖZETİ — KARAR MANTIĞI (PRD · B01, B08)
//
// ============================================================
// NEDEN SAYFADAN AYRILDI
//
// Bu karar eskiden `app/(dashboard)/parent/page.tsx` içinde iki satırdı:
//
//   const hasActivity = bookProgress.length > 0 || totalBatchCount > 0
//   const onTrack = hasActivity && overdueCount === 0
//
// Ve sayfanın gövdesinde gömülü olduğu için test EDİLEMİYORDU. Ölçülen
// kusur tam da bu iki satırdaydı: ödev sorgusu düştüğünde
// `overdueCount` 0'a, kitap verisi geldiyse `hasActivity` true'ya düşüyor
// ve veliye "Her şey yolunda" gösteriliyordu.
//
// Ürünün en güven verici cümlesini üreten karar, en çok korunması
// gereken karardır. Saf fonksiyon olarak burada; testi
// `tests/parent-status.test.ts`.
//
// ============================================================
// "BİLİNMİYOR" AYRI BİR SONUÇ
//
// Girdilerde `null` "bilinmiyor" demek, `0` "yok" demek. Bu ayrım
// bilerek tipte taşınıyor: iki durumu aynı değerle ifade etmek,
// kusurun kaynağıydı.
// ============================================================

export interface BatchSummary {
  /** Teslim tarihi geçmiş grup sayısı. */
  overdue: number
  /** Henüz kapanmamış grup sayısı. */
  open: number
  /** Toplam aktif grup sayısı. */
  total: number
}

export type ParentBanner =
  /** Ödev durumu alınamadı: ne uyarı ne olumlu özet gösterilebilir. */
  | { kind: 'unknown' }
  | { kind: 'overdue'; count: number }
  /** Gecikme olmadığı BİLİNİYOR ve gösterilecek bir etkinlik var. */
  | { kind: 'noOverdue'; open: number }
  /** Hiçbir şey söylenmez: etkinlik yok ya da bilinmiyor. */
  | { kind: 'none' }

/**
 * Veli ekranının üst bandında ne yazacağına karar verir.
 *
 * @param batchSummary Ödev gruplarının özeti; sorgu düştüyse `null`.
 * @param bookCount Aktif kitap sayısı; sorgu düştüyse `null`.
 */
export function parentStatusBanner(
  batchSummary: BatchSummary | null,
  bookCount: number | null
): ParentBanner {
  // Gecikme sayısı bilinmiyorsa, her iki yön de yalan olur: "gecikme var"
  // diyemeyiz (bilmiyoruz), "gecikme yok" diyemeyiz (bilmiyoruz).
  if (batchSummary === null) return { kind: 'unknown' }

  if (batchSummary.overdue > 0) return { kind: 'overdue', count: batchSummary.overdue }

  // ETKİNLİK YALNIZ BİLİNEN VERİDEN.
  //
  // Ödev grubu varsa etkinlik kesin vardır. Yoksa karar kitaba kalır;
  // kitap sayısı da bilinmiyorsa olumlu özet GÖSTERİLMEZ. "Gecikmiş
  // çalışma görünmüyor" demek için ortada görünen bir çalışma olmalı.
  const hasActivity = batchSummary.total > 0 || (bookCount !== null && bookCount > 0)
  if (!hasActivity) return { kind: 'none' }

  return { kind: 'noOverdue', open: batchSummary.open }
}
