// SAYFA ARALIĞI DÜZELTME PLANI — Revize Mini 03 (09.11.2026).
//
// Çok parçalı kitapta bölümün Başlangıç/Bitiş sayfası kayıt varken de
// düzeltilebilsin; ama geçmiş ödev/tamamlama kayıtları çoğalmasın ve
// bölümün kimliği bozulmasın. Sayfa birimleri (book_tests) artık silinip
// yeniden OLUŞTURULMAZ — kayıtlar birim kimliğine bağlı:
//
//   resize  Sayfa numaraları aynı kalır. Yeni sayfalar eklenir, aralık
//           dışına çıkan KULLANILMAMIŞ sayfalar silinir. Kullanılmış sayfa
//           aralık dışına çıkamaz.
//   shift   Baskı farkı: sayfa sayısı aynı, numaralar kayar. Birimler
//           yerinde yeniden numaralanır; kayıtlar yeni numaralara taşınır.
//
// Bu dosya ekranın ÖNİZLEME/uyarı tarafı; asıl kural migration 155'teki
// set_section_page_range'de. İkisi aynı kuralı söyler (testte eşlenir).

export type PageRangeMode = 'resize' | 'shift'

export type PageRangePlan =
  | { ok: true; mode: PageRangeMode; add: number[]; remove: number[]; offset: number }
  | { ok: false; error: string }

function range(start: number | null, end: number | null): number[] {
  if (start == null || end == null || end < start) return []
  return Array.from({ length: end - start + 1 }, (_, i) => start + i)
}

export function planPageRangeChange(input: {
  oldStart: number | null
  oldEnd: number | null
  newStart: number
  newEnd: number
  /** Ödev ya da tamamlama kaydı olan sayfa numaraları. */
  usedPages: Iterable<number>
  mode: PageRangeMode
}): PageRangePlan {
  const { newStart, newEnd, mode } = input
  if (!Number.isInteger(newStart) || !Number.isInteger(newEnd) || newStart < 1 || newEnd < newStart) {
    return { ok: false, error: 'Geçerli bir sayfa aralığı girin.' }
  }
  if (newEnd - newStart + 1 > 1000) {
    return { ok: false, error: 'Bir bölüm en fazla 1000 sayfa olabilir.' }
  }

  const oldPages = range(input.oldStart, input.oldEnd)

  if (mode === 'shift') {
    if (oldPages.length !== newEnd - newStart + 1) {
      return {
        ok: false,
        error: 'Kaydırmada sayfa sayısı aynı kalmalı. Sayfa sayısı değişiyorsa "Aralığı değiştir" seçin.',
      }
    }
    return { ok: true, mode, add: [], remove: [], offset: newStart - (input.oldStart ?? newStart) }
  }

  const next = new Set(range(newStart, newEnd))
  const old = new Set(oldPages)
  const used = new Set(input.usedPages)
  const remove = oldPages.filter(p => !next.has(p))
  const blocked = remove.filter(p => used.has(p))
  if (blocked.length > 0) {
    return {
      ok: false,
      error:
        `sf. ${blocked.join(', ')} ödev/tamamlama kaydında kullanılmış; aralık dışında bırakılamaz. ` +
        'Baskı farkıysa "Sayfa numaralarını kaydır" seçeneğini kullanın.',
    }
  }
  return { ok: true, mode, add: [...next].filter(p => !old.has(p)), remove, offset: 0 }
}
