// Haftalık plan sepeti (R3 v2 §B, R6-18 kabul #95, R7 tek harita).
//
// Kural: "Sepetteki id'lerden yayınlanacak kalemler nasıl türetilir?"
// sorusunu yanıtlayan TEK yer burasıdır. Mantık homework-builder.tsx içinde
// inline duruyordu ve test edilemiyordu; R6-18 sepet kalıcılığını ZORUNLU
// regresyon kabulü saydığı için (kabul #95) buraya, saf bir modüle taşındı.
//
// NEDEN ELEME GEREKLİ: sepet Supabase'de taslak olarak saklanır
// (019_weekly_plan_drafts) ve sayfa yenilendiğinde geri yüklenir. Taslak
// yazıldıktan sonra bir kitap havuzdan kaldırılmış, bir bölüm silinmiş ya da
// öğrenciden kitap ataması kaldırılmış olabilir. O id'ler artık haritada
// yoktur; yayına giderlerse RPC anlamsız bir kalem alır.
//
// SESSİZ VERİ KAYBI YOK: eleme sayısı çağırana döner, arayüz gerekirse
// kullanıcıya söyleyebilir.

/** Harita üzerindeki bir birimin sepet için gereken bağlamı. */
export interface BasketUnit {
  student_book_assignment_id: string
  book_test_id: string
  bookId: string
  bookTitle: string
  sectionId: string
  sectionTitle: string
  /** Test kitabında test numarası, sayfa kitabında fiziksel sayfa numarası. */
  orderIndex: number
  trackingMode: string
}

export interface ResolvedBasket {
  /** Haritada karşılığı bulunan, yayınlanabilir kalemler. */
  units: BasketUnit[]
  /** Karşılığı bulunamayan id'ler — silinmiş kitap/bölüm/atama. */
  missingIds: string[]
}

/**
 * Sepetteki id'leri harita bağlamıyla eşleştirir.
 *
 * Sıra taslaktaki sıradır: sepette ne görünüyorsa yayınlanan da odur.
 * Aynı id iki kez gelirse tek kalem üretilir — taslak tekrarlı yazılmış
 * olsa bile ödevde duplicate kalem oluşmamalıdır (R6 §11).
 */
export function resolveBasketItems(
  basketIds: Iterable<string>,
  testIndex: Map<string, BasketUnit>
): ResolvedBasket {
  const units: BasketUnit[] = []
  const missingIds: string[] = []
  const seen = new Set<string>()

  for (const id of basketIds) {
    if (seen.has(id)) continue
    seen.add(id)

    const unit = testIndex.get(id)
    if (unit) units.push(unit)
    else missingIds.push(id)
  }

  return { units, missingIds }
}

/** Yayın RPC'sinin beklediği minimal kalem listesi. */
export function toHomeworkItems(
  units: BasketUnit[]
): { student_book_assignment_id: string; book_test_id: string }[] {
  return units.map(u => ({
    student_book_assignment_id: u.student_book_assignment_id,
    book_test_id: u.book_test_id,
  }))
}
