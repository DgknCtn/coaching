import { describe, it, expect } from 'vitest'
import { buildWeekFacts, buildSummaryPrompt, personalize, NAME_TOKEN } from '@/lib/ai/student-week'

// AI HAFTALIK ÖZET — modele giden veri isimsiz, sayılar doğru (Faz 6).

const now = new Date('2026-10-14T09:00:00Z')

const facts = buildWeekFacts({
  now,
  exam: 'YKS',
  grade: '12. Sınıf',
  items: [
    { status: 'completed', submitted_at: '2026-10-12T10:00:00Z', approved_at: '2026-10-13T10:00:00Z', due_date: '2026-10-13' },
    { status: 'pending_approval', submitted_at: '2026-10-13T18:00:00Z', approved_at: null, due_date: '2026-10-15' },
    { status: 'pending', submitted_at: null, approved_at: null, due_date: '2026-10-10' },
    { status: 'pending', submitted_at: null, approved_at: null, due_date: '2026-10-14' },
    { status: 'cancelled', submitted_at: null, approved_at: null, due_date: '2026-10-09' },
    // 7 günden eski onay sayılmaz.
    { status: 'completed', submitted_at: '2026-09-30T10:00:00Z', approved_at: '2026-10-01T10:00:00Z', due_date: '2026-10-01' },
  ],
  checkIns: [
    { due_at: '2026-10-12T18:00:00Z', submitted_at: '2026-10-12T17:00:00Z', mood: 'zorlaniyorum' },
    { due_at: '2026-10-13T18:00:00Z', submitted_at: null, mood: null },
  ],
  books: [{ title: 'TYT Matematik', subject: 'Matematik', completion_percentage: 41.6 }],
})

describe('AI haftalık özet · gerçekler', () => {
  it('sayıları doğru çıkarır', () => {
    expect(facts.approvedLast7).toBe(1)
    expect(facts.submittedLast7).toBe(2)
    expect(facts.awaitingApproval).toBe(1)
    // Bugün teslimi olan gecikmiş sayılmaz (R6-02).
    expect(facts.overduePending).toBe(1)
    expect(facts.dueThisWeek).toBe(2)
    expect(facts.checkInsSubmitted).toBe(1)
    expect(facts.checkInsLate).toBe(1)
    expect(facts.lastMood).toBe('zorlanıyorum')
    expect(facts.books[0].percent).toBe(42)
  })
})

describe('AI haftalık özet · istem kişisel veri taşımaz', () => {
  it.each(['coach', 'parent'] as const)('%s istemi ad içermez, yer tutucuyu ister', (kind) => {
    const { system, prompt } = buildSummaryPrompt(kind, facts)
    expect(system).toContain(NAME_TOKEN)
    expect(`${system}\n${prompt}`).not.toMatch(/Ayşe|Yılmaz/)
  })

  it('ad yalnız cevaba yerleştirilir', () => {
    expect(personalize(`${NAME_TOKEN} bu hafta iyiydi. ${NAME_TOKEN} devam.`, 'Ayşe Yılmaz')).toBe(
      'Ayşe bu hafta iyiydi. Ayşe devam.'
    )
  })
})
