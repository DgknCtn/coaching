// Kitap yapısının saf mantığı (R7-03).
//
// İKİ İŞ: test aralığı hesabı ve alt bölüm ağacının YAPRAĞA indirgenmesi.
//
// Neden ayrı modül: ikisi de lib/book-map.ts'in içinde Supabase satır
// şekillerine karışmış hâlde yaşayabilirdi, ama o zaman test edilemezlerdi.
// Şartnamenin kendi kabul kriteri sayı veriyor (3D TYT: Bölüm 1 = 104 test,
// kitap = 177) — bu ancak saf bir fonksiyon üzerinden doğrulanabilir.

/**
 * Aralıktan test adedi.
 *
 * Şartname: "Test sayısı otomatik = Son - İlk + 1". Kullanıcı adet GİRMEZ.
 * Tek testlik aralık geçerlidir (17-17 -> 1).
 */
export function testCountFromRange(
  start: number | null | undefined,
  end: number | null | undefined
): number {
  if (start == null || end == null) return 0
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0
  if (start < 1 || end < start) return 0
  return end - start + 1
}

/** "Test 44-48" / "Test 17". Aralık yoksa null — çağıran satırı boş geçer. */
export function formatTestRange(
  start: number | null | undefined,
  end: number | null | undefined
): string | null {
  if (testCountFromRange(start, end) === 0) return null
  return start === end ? `Test ${start}` : `Test ${start}-${end}`
}

/**
 * Ağaçtaki bir bölüm satırının indirgeme için gereken minimum bilgisi.
 * Jenerik: book-map kendi zengin tipini geçirir, testler sade nesne.
 */
export interface SectionNode {
  id: string
  orderIndex: number
  /** Dolu ise bu satır bir Alt Bölümdür ve testlerin sahibidir. */
  parentSectionId: string | null
  /** Bu satırın kendi takip birimleri. Kapsayıcı bölümde boştur. */
  testCount: number
}

/**
 * Ağacı YAPRAK LİSTESİNE indirger.
 *
 * NEDEN BU FONKSİYON VAR: alt bölüm katmanı eklendiğinde "bölümler düzdür"
 * varsayımı taşıyan onlarca tüketici (plan-scope, homework-detail,
 * share-text, bulk-actions, weekly-plan) kırılacaktı. Ağacı TEK yerde —
 * burada — düzleştirip aşağıya hep yaprak listesi vererek o tüketicilerin
 * hiçbirine dokunmamak mümkün oluyor. Gruplama anahtarı olarak kullandıkları
 * `sectionId` böylece her zaman doğru ad alanını gösterir.
 *
 * SIRA: önce ebeveynin sırası, sonra çocuğun kendi sırası. Böylece
 * "01. Bölüm > Temel Kavramlar, Tek-Çift, ..." doğal okuma sırasında çıkar.
 *
 * KAPSAYICI SATIRLAR DÜŞER: testleri olmadığı için yaprak değildirler.
 * Adları çağıran tarafından başlık olarak ayrıca taşınır (parentTitle).
 *
 * ALT BÖLÜMÜ OLMAYAN KİTAP: hiçbir satırın ebeveyni yoktur, hepsi kendi
 * sırasında yaprak olarak döner — liste birebir bugünkü hâlidir.
 */
export function orderLeafSections<T extends SectionNode>(sections: T[]): T[] {
  const orderById = new Map<string, number>(sections.map(s => [s.id, s.orderIndex]))

  return sections
    .filter(s => s.testCount > 0)
    .map(s => {
      // Ebeveyni bulunamayan bir alt bölüm (ör. ebeveyn arşivlenmiş) kendi
      // sırasıyla üst düzeyde kalır — satırı kaybetmektense sırasını
      // kaybetmek yeğdir.
      const parentOrder =
        s.parentSectionId != null ? orderById.get(s.parentSectionId) : undefined

      return {
        section: s,
        primary: parentOrder ?? s.orderIndex,
        // Üst düzey bölüm, aynı sıradaki alt bölümlerden ÖNCE gelir.
        secondary: parentOrder != null ? s.orderIndex : -1,
      }
    })
    .sort((a, b) => a.primary - b.primary || a.secondary - b.secondary)
    .map(entry => entry.section)
}
