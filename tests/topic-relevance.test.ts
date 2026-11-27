import { describe, expect, it } from 'vitest'
import { buildBulkRows, contentWords, sameStem, scopeTier, suggestTopics } from '@/lib/topic-relevance'

const scope = (name: string, subject: string | null = null, levelExam: string | null = null) => ({ id: name, name, subject, levelExam })

describe('kapsam kademesi (2a)', () => {
  const ayt = { subject: 'Matematik', levelExam: 'AYT' }
  it('alanları boş kapsamlarda bilgi addan okunur', () => {
    expect(scopeTier(scope('AYT Matematik'), ayt)).toBe('primary')
    expect(scopeTier(scope('TYT Matematik'), ayt)).toBe('related')
    expect(scopeTier(scope('10. Sınıf Matematik'), ayt)).toBe('related')
    expect(scopeTier(scope('AYT Geometri'), ayt)).toBe('related')
    expect(scopeTier(scope('AYT Din Kültürü'), ayt)).toBe('other')
    expect(scopeTier(scope('AYT Coğrafya'), ayt)).toBe('other')
  })
  it('alanlar doluysa alanlar da sayılır; sınıf düzeyi seviye olarak eşleşir', () => {
    expect(scopeTier(scope('Sayılar', 'Matematik', '10. Sınıf'), { subject: 'Matematik', levelExam: '10. Sınıf' })).toBe('primary')
    expect(scopeTier(scope('9. Sınıf Matematik'), { subject: 'Matematik', levelExam: '10. Sınıf' })).toBe('related')
  })
  it('geometri kitabında geometri kapsamı birincil, matematik ilgili', () => {
    const g = { subject: 'Geometri', levelExam: 'TYT' }
    expect(scopeTier(scope('TYT Geometri'), g)).toBe('primary')
    expect(scopeTier(scope('TYT Matematik'), g)).toBe('related')
  })
  it('seviyesiz kitapta dersin kendisi birincil; dersi bilinmeyen kitapta hepsi diğer', () => {
    expect(scopeTier(scope('TYT Fizik'), { subject: 'Fizik', levelExam: null })).toBe('primary')
    expect(scopeTier(scope('TYT Fizik'), { subject: null, levelExam: null })).toBe('other')
  })
})

describe('konu önerisi (2b)', () => {
  const topics = [
    { id: 'a', name: 'Üçgende Açılar', tier: 'primary' as const },
    { id: 'b', name: 'Dik Üçgende Trigonometrik Oranlar ve Özdeşlikler', tier: 'primary' as const },
    { id: 'c', name: 'Trigonometrik Fonksiyonlar', tier: 'primary' as const },
    { id: 'd', name: 'Türev', tier: 'primary' as const },
    { id: 'e', name: 'Osmanlı Devleti', tier: 'other' as const },
  ]
  it('belgedeki örnek ilk sırada', () => {
    const s = suggestTopics('Dik Üçgende Trigonometri', topics)
    expect(s[0].topic.id).toBe('b')
    expect(s.map(x => x.topic.id)).not.toContain('a') // yalnız 1/3 sözcük
  })
  it('ekler köke indirgenir; sayı ve yapı sözcükleri yok sayılır', () => {
    expect(sameStem('trigonometri', 'trigonometrik')).toBe(true)
    expect(sameStem('dik', 'dikdortgen')).toBe(false)
    expect(contentWords('05. Bölüm - Türev Testi 3')).toEqual(['turev'])
    expect(suggestTopics('05. Bölüm - Türevin Uygulamaları', topics)[0]?.topic.id).toBe('d')
  })
  it('ilgisiz adda öneri yok; diğer kademe yalnız tam karşılamada', () => {
    expect(suggestTopics('Karma Test 4', topics)).toEqual([])
    expect(suggestTopics('Olasılık', topics)).toEqual([])
    expect(suggestTopics('Osmanlı Kültür ve Medeniyeti', topics)).toEqual([])
    expect(suggestTopics('Osmanlı Devleti', topics)[0]?.topic.id).toBe('e')
  })
  it('en fazla 3 öneri', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: String(i), name: `Fonksiyonlar ${i}`, tier: 'primary' as const }))
    expect(suggestTopics('Fonksiyonlar', many)).toHaveLength(3)
  })
})

describe('toplu eşleme satırları (2c)', () => {
  const topics = [
    { id: 'turev', name: 'Türev', tier: 'primary' as const },
    { id: 'integral', name: 'İntegral', tier: 'primary' as const },
    { id: 'limit', name: 'Limit ve Süreklilik', tier: 'primary' as const },
  ]
  const sections = [
    { id: 's2', title: 'İntegral', orderIndex: 2, parentId: null, topicIds: ['integral'] },
    { id: 's1', title: '1. Bölüm', orderIndex: 1, parentId: null, topicIds: [] },
    { id: 's1b', title: 'Türev Alma Kuralları', orderIndex: 2, parentId: 's1', topicIds: [] },
    { id: 's1a', title: 'Limit', orderIndex: 1, parentId: 's1', topicIds: [] },
    { id: 's3', title: 'Karma Testler', orderIndex: 3, parentId: null, topicIds: [] },
  ]
  const rows = buildBulkRows(sections, topics)
  it('yalnız yaprak bölümler, kitap sırasıyla; alt bölüm üst adını taşır', () => {
    expect(rows.map(r => r.id)).toEqual(['s1a', 's1b', 's2', 's3'])
    expect(rows[0].parentTitle).toBe('1. Bölüm')
  })
  it('ön seçim yalnız eşlenmemiş bölümde ve öneri varsa', () => {
    expect(rows.find(r => r.id === 's1a')!.preselect).toBe('limit')
    expect(rows.find(r => r.id === 's1b')!.preselect).toBe('turev')
    expect(rows.find(r => r.id === 's2')!.preselect).toBeNull() // zaten eşli
    expect(rows.find(r => r.id === 's3')!.preselect).toBeNull() // öneri yok
  })
})
