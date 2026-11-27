import type { ParsedChapter, ParsedPageSection } from './book-import'

// YENİ KİTAP FORMU · "İçindekilerden aktar" (Kitap Girişi ve Konu Eşleme 3a).
//
// Kitap henüz kaydedilmediği için içindekiler SUNUCUYA GİTMEZ; form
// satırlarına dönüştürülür. Test kitabında alt bölümler (asıl test
// sahipleri) bölüm kimliğine bağlıdır ve kimlik kayıttan sonra doğar;
// bu yüzden alt bölümler satırla birlikte taşınır ve createBookAction
// kitabı kurduktan hemen sonra aynı kayıtta ekler. Öğretmen iki aşamalı
// girişten kurtulur.

export interface FormSectionRow {
  title: string
  test_count?: number
  page_start?: number
  page_end?: number
  note?: string
  part?: string
}

export interface SubsectionDraft {
  title: string
  test_start: number
  test_end: number
}

const isEmptyRow = (r: FormSectionRow) => !r.title?.trim()

/** Bölümün alt bölümlerindeki toplam test (formda bilgi olarak gösterilir). */
export function chapterTestCount(c: ParsedChapter): number {
  return c.subsections.reduce((n, s) => n + (s.testEnd - s.testStart + 1), 0)
}

/**
 * İçindekiler → form satırları. Form yalnız boş tek satır taşıyorsa
 * onun yerine geçer; doluysa yeni satırlar SONA eklenir (düzenleme
 * ekranındaki "mevcut bölümler silinmez" kuralıyla aynı).
 */
export function outlineToRows(
  fill: { kind: 'page'; sections: ParsedPageSection[] } | { kind: 'test'; chapters: ParsedChapter[] },
  existing: FormSectionRow[]
): { rows: FormSectionRow[]; replace: boolean } {
  const rows: FormSectionRow[] =
    fill.kind === 'page'
      ? fill.sections.map(s => ({ title: s.title, page_start: s.pageStart, page_end: s.pageEnd, test_count: 1, note: '', part: '' }))
      : fill.chapters.map(c => ({ title: c.title, test_count: Math.max(1, chapterTestCount(c)), note: '', part: '' }))
  const replace = existing.length === 0 || existing.every(isEmptyRow)
  return { rows, replace }
}

/**
 * Gönderim anında: hangi satırın içindekilerden gelen alt bölümleri var?
 * Satırlar sırayla, ADLA eşlenir — öğretmen aktarımdan sonra satır
 * silip eklediyse ya da adı değiştirdiyse o satır içindekilerden
 * kopar ve girilen test sayısıyla normal bölüm olarak kaydedilir.
 */
export function attachSubsections(rows: { title: string }[], chapters: ParsedChapter[]): (SubsectionDraft[] | null)[] {
  const pending = chapters.filter(c => c.subsections.length > 0)
  let cursor = 0
  return rows.map(r => {
    const title = r.title.trim()
    for (let i = cursor; i < pending.length; i++) {
      if (pending[i].title.trim() === title) {
        cursor = i + 1
        return pending[i].subsections.map(s => ({ title: s.title, test_start: s.testStart, test_end: s.testEnd }))
      }
    }
    return null
  })
}
