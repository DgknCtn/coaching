// PostgREST TEK İSTEKTE EN FAZLA 1000 SATIR döndürür (Supabase varsayılanı).
// Sınır aşıldığında hata yok — liste sessizce kesilir.
//
// H03 (İz V2): kitap eşleştirmede konu listesi bu sınırda kesiliyordu; AYT
// Fizik konuları Doppler'de bitiyor, "Atom Modelleri..." aramada hiç
// çıkmıyordu. Tam listeye ihtiyaç duyan sorgular bu yardımcıyla sayfa sayfa
// okunur. Sorgu deterministik sıralı olmalı (order), yoksa sayfalar
// arasında satır kayabilir.

const PAGE_SIZE = 1000

export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) return { data: out, error }
    const rows = data ?? []
    out.push(...rows)
    if (rows.length < PAGE_SIZE) return { data: out, error: null }
  }
}
