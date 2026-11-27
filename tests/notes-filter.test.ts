import { describe, expect, it } from 'vitest'
import { filterNotes } from '@/lib/notes-search'

// Faz 2b · Notlarda arama — Türkçe harf duyarsız, tüm sözcükler.
const e = (t: string) => ({ note: { note_text: t } })

describe('filterNotes', () => {
  const list = [e('Parçalı fonksiyonda zorlanıyor'), e('Salı akşamları çalışamıyor'), e('Sınav kaygısı yüksek')]
  it('boş sorgu hepsini döner', () => expect(filterNotes(list, '  ')).toHaveLength(3))
  it('Türkçe harf ve büyük/küçük harf duyarsız', () => {
    expect(filterNotes(list, 'PARCALI')).toHaveLength(1)
    expect(filterNotes(list, 'sinav kaygisi')).toHaveLength(1)
  })
  it('tüm sözcükler geçmeli', () => expect(filterNotes(list, 'salı fonksiyon')).toHaveLength(0))
})
