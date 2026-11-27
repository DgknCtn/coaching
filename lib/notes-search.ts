// Notlarda arama (PRD 10.2 · Faz 2b) — saf, test edilebilir.
/** Notlarda arama — saf; tüm sözcükler geçmeli, Türkçe harf duyarsız. */
export function filterNotes<T extends { note: { note_text: string } }>(entries: T[], query: string): T[] {
  const fold = (x: string) =>
    x.toLocaleLowerCase('tr').replace(/ı/g, 'i').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const terms = fold(query).split(/\s+/).filter(Boolean)
  if (terms.length === 0) return entries
  return entries.filter(e => {
    const text = fold(e.note.note_text)
    return terms.every(t => text.includes(t))
  })
}
