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

/**
 * Sayfa ve test aralığını tek etikette birleştirir (R7-03 Revize).
 *
 * ============================================================
 * NEDEN VAR
 *
 * Sayfa ile takip edilen kaynaklarda test aralığı OPSİYONEL ve YALNIZ
 * BİLGİ AMAÇLIDIR. Barış İntegral Fasikülü gerçek vakası: ilerleme
 * sayfa üzerinden yürür ama "bu bölümde Test 1-6 var" bilgisi
 * öğretmene ve öğrenciye referans olarak değerli.
 *
 * Şartnamenin ekran örneğinin birebir karşılığı:
 *   "Belirsiz İntegral · sf. 1-22 · Test 1-6"
 *
 * BU FONKSİYON İLERLEME HESABINA GİRMEZ. Yüzdeler yalnız `book_tests`
 * satırlarından ve `test_completions`'tan gelir; buradaki aralık hiçbir
 * takip birimi üretmez. Şartnamenin kırmızı çizgisi: "Aynı kaynakta iki
 * ayrı ilerleme sayacı oluşmaz."
 *
 * BOŞ ARALIKTA SESSİZCE KISALIR: ÖSYM Bakış, Son Bakış ve Kişisel
 * Testler gibi kayıtlarda test aralığı yoktur ve etiket yalnız sayfayı
 * gösterir. Şartname bunu açıkça kabul kriteri yapıyor.
 * ============================================================
 */
export function formatPageAndTestRange(
  pageStart: number | null | undefined,
  pageEnd: number | null | undefined,
  testStart: number | null | undefined,
  testEnd: number | null | undefined
): string {
  const parts: string[] = []

  if (pageStart != null && pageEnd != null && pageEnd >= pageStart) {
    parts.push(pageStart === pageEnd ? `sf. ${pageStart}` : `sf. ${pageStart}-${pageEnd}`)
  }

  // formatTestRange YENİDEN KULLANILIYOR: "Test 44-48" biçimi tek yerde
  // tanımlı kalsın. İkinci bir biçimlendirici, bir gün biri güncellenip
  // diğeri unutulduğunda aynı aralığın iki ekranda farklı görünmesi
  // demekti.
  const testLabel = formatTestRange(testStart, testEnd)
  if (testLabel) parts.push(testLabel)

  return parts.join(' · ')
}

// ============================================================
// BÖLÜMÜ ALT BÖLÜMLERE AYIRMA — ön koşul (076)
// ============================================================
// Bu fonksiyonun varlık sebebi bir hata: arayüz, veritabanının kabul
// etmediği bir şeyi tavsiye ediyordu. "Bölümün kendi testleri var" diyen
// uyarı çözüm olarak "önce test sayısını sıfırlayın" öneriyordu, ama
// test sayısı UI'da, zod'da ve SQL'de birden 1'in altına inemiyordu.
// Talimat imkânsızdı ve alt bölüm özelliği eski kitaplarda ölüydü.
//
// Karar tek yerde toplandı ki arayüz ile RPC aynı şeyi söylesin. Kural
// iki yerde ayrı yazıldığında, ikisinin ayrışması an meselesidir.

export type ConvertBlockReason =
  /** Sayfa ile takipte alt bölüm hiç açılmaz (061). */
  | 'page_book'
  /** Zaten alt bölümlere ayrılmış; normal ekleme yolu kullanılmalı. */
  | 'already_split'
  /** Dönüştürecek bir şey yok: bölümün kendi testi zaten yok. */
  | 'nothing_to_convert'
  /** Testlerden biri ödevde veya tamamlama kaydında kullanılmış. */
  | 'tests_in_use'

export const CONVERT_BLOCK_MESSAGE: Record<ConvertBlockReason, string> = {
  page_book: 'Sayfa ile takip edilen kaynakta alt bölüm açılamaz.',
  already_split: 'Bu bölüm zaten alt bölümlere ayrılmış.',
  nothing_to_convert: 'Bu bölümün kendi testi yok; alt bölümü doğrudan ekleyebilirsiniz.',
  tests_in_use:
    'Bu bölümün testleri bir ödevde veya tamamlama kaydında kullanılmış; bölüm alt bölümlere ayrılamaz.',
}

export interface ConvertCheckInput {
  /** Bölümün KENDİ testlerinin sayısı (alt bölümlerinki değil). */
  sectionTestCount: number
  /** Bu testlerden kaçı ödevde/tamamlamada kullanılmış. */
  usedTestCount: number
  isPageBook: boolean
  hasSubsections: boolean
}

/**
 * Bölüm alt bölümlere ayrılabilir mi?
 *
 * SIRA ÖNEMLİ: en kalıcı engel önce söylenir. Sayfa kitabında "testler
 * kullanılmış" demek, öğretmeni çözülemeyecek bir işe yönlendirirdi —
 * o kaynakta sorun testlerin kullanımı değil, kaynağın türü.
 */
export function canConvertToSubsections(
  input: ConvertCheckInput
): { ok: true } | { ok: false; reason: ConvertBlockReason; message: string } {
  const block = (reason: ConvertBlockReason) =>
    ({ ok: false as const, reason, message: CONVERT_BLOCK_MESSAGE[reason] })

  if (input.isPageBook) return block('page_book')
  if (input.hasSubsections) return block('already_split')
  if (input.sectionTestCount <= 0) return block('nothing_to_convert')
  if (input.usedTestCount > 0) return block('tests_in_use')

  return { ok: true }
}
