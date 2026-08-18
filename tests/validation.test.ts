import { describe, it, expect } from 'vitest'
import {
  passwordResetSchema,
  bookUpdateSchema,
  EXAM_TYPE_OPTIONS,
  LESSON_TYPE_OPTIONS,
  studentSchema,
  termSchema,
  bookSchema,
  assignBookSchema,
  homeworkBatchSchema,
  loginSchema,
  registerSchema,
  acceptInviteSchema,
  uuidSchema,
  firstIssue,
} from '@/lib/validation'

const UUID = '11111111-1111-4111-8111-111111111111'

describe('studentSchema', () => {
  it('accepts a valid student with optional fields empty', () => {
    const r = studentSchema.safeParse({ fullName: 'Ali Veli', email: '', phone: '', gradeLevel: '', examType: '', notes: '' })
    expect(r.success).toBe(true)
  })

  it('rejects too-short name', () => {
    const r = studentSchema.safeParse({ fullName: 'A' })
    expect(r.success).toBe(false)
    if (!r.success) expect(firstIssue(r.error)).toContain('en az 2 karakter')
  })

  it('rejects invalid email', () => {
    const r = studentSchema.safeParse({ fullName: 'Ali Veli', email: 'not-an-email' })
    expect(r.success).toBe(false)
  })

  it('rejects invalid exam type', () => {
    const r = studentSchema.safeParse({ fullName: 'Ali Veli', examType: 'ZZZ' })
    expect(r.success).toBe(false)
  })

  it('accepts each valid lesson type', () => {
    for (const lessonType of ['yuz_yuze_ozel', 'online_birebir', 'online_grup', 'bireysel_kocluk']) {
      expect(studentSchema.safeParse({ fullName: 'Ali Veli', lessonType }).success).toBe(true)
    }
  })

  it('accepts empty lesson type', () => {
    expect(studentSchema.safeParse({ fullName: 'Ali Veli', lessonType: '' }).success).toBe(true)
  })

  it('rejects invalid lesson type', () => {
    expect(studentSchema.safeParse({ fullName: 'Ali Veli', lessonType: 'ZZZ' }).success).toBe(false)
  })
})

describe('termSchema', () => {
  it('accepts valid term', () => {
    expect(termSchema.safeParse({ name: '2025 Güz', startDate: '2025-09-01', endDate: '' }).success).toBe(true)
  })
  it('rejects bad date format', () => {
    expect(termSchema.safeParse({ name: '2025 Güz', startDate: '01/09/2025' }).success).toBe(false)
  })
})

describe('bookSchema', () => {
  const base = { title: 'Matematik', subject: 'Matematik', termId: UUID, sections: [{ title: 'Bölüm 1', test_count: 10 }] }
  it('accepts valid book', () => {
    expect(bookSchema.safeParse(base).success).toBe(true)
  })
  it('requires at least one section', () => {
    expect(bookSchema.safeParse({ ...base, sections: [] }).success).toBe(false)
  })
  it('rejects negative test_count', () => {
    expect(bookSchema.safeParse({ ...base, sections: [{ title: 'x', test_count: -1 }] }).success).toBe(false)
  })
  it('rejects non-uuid termId', () => {
    expect(bookSchema.safeParse({ ...base, termId: 'abc' }).success).toBe(false)
  })
  it('defaults tracking mode to test', () => {
    const r = bookSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.trackingMode).toBe('test')
  })
  it('accepts page tracking mode', () => {
    expect(bookSchema.safeParse({ ...base, trackingMode: 'page' }).success).toBe(true)
  })
  it('rejects invalid tracking mode', () => {
    expect(bookSchema.safeParse({ ...base, trackingMode: 'chapters' }).success).toBe(false)
  })
})

describe('assignBookSchema', () => {
  it('accepts valid assignment', () => {
    expect(assignBookSchema.safeParse({ studentId: UUID, bookId: UUID, startDate: '', targetEndDate: '' }).success).toBe(true)
  })
  it('rejects bad ids', () => {
    expect(assignBookSchema.safeParse({ studentId: 'x', bookId: UUID }).success).toBe(false)
  })
})

describe('homeworkBatchSchema', () => {
  const base = { workspaceId: UUID, termId: UUID, studentId: UUID, dueDate: '2025-10-01', title: '', items: [{ student_book_assignment_id: UUID, book_test_id: UUID }] }
  it('accepts valid batch', () => {
    expect(homeworkBatchSchema.safeParse(base).success).toBe(true)
  })
  it('requires at least one item', () => {
    expect(homeworkBatchSchema.safeParse({ ...base, items: [] }).success).toBe(false)
  })
  it('rejects bad due date', () => {
    expect(homeworkBatchSchema.safeParse({ ...base, dueDate: 'soon' }).success).toBe(false)
  })
})

describe('auth schemas', () => {
  it('loginSchema rejects short password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.com', password: '123' }).success).toBe(false)
  })
  it('registerSchema requires name', () => {
    expect(registerSchema.safeParse({ email: 'a@b.com', password: '123456', fullName: 'A' }).success).toBe(false)
  })
  it('acceptInviteSchema accepts valid data', () => {
    expect(acceptInviteSchema.safeParse({ fullName: 'Ali Veli', email: 'a@b.com', password: '123456' }).success).toBe(true)
  })
})

describe('uuidSchema', () => {
  it('accepts a uuid', () => expect(uuidSchema.safeParse(UUID).success).toBe(true))
  it('rejects non-uuid', () => expect(uuidSchema.safeParse('nope').success).toBe(false))
})

describe('sınav türü daraltması', () => {
  it('studentSchema yalnızca TYT/AYT kabul eder', () => {
    const base = { fullName: 'Ali Veli' }
    expect(studentSchema.safeParse({ ...base, examType: 'TYT' }).success).toBe(true)
    expect(studentSchema.safeParse({ ...base, examType: 'AYT' }).success).toBe(true)
    expect(studentSchema.safeParse({ ...base, examType: 'LGS' }).success).toBe(false)
    expect(studentSchema.safeParse({ ...base, examType: 'Other' }).success).toBe(false)
  })

  it('bookUpdateSchema aynı listeyi kullanır', () => {
    const base = { bookId: UUID, title: 'Kimya Soru Bankası', subject: 'Kimya' }
    expect(bookUpdateSchema.safeParse({ ...base, examType: 'AYT' }).success).toBe(true)
    expect(bookUpdateSchema.safeParse({ ...base, examType: 'KPSS' }).success).toBe(false)
  })

  it('seçenek listeleri şemayla aynı değerleri sunar', () => {
    expect(EXAM_TYPE_OPTIONS.map((o) => o.value)).toEqual(['TYT', 'AYT'])
    expect(LESSON_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      'yuz_yuze_ozel',
      'online_birebir',
      'online_grup',
      'bireysel_kocluk',
    ])
    expect(LESSON_TYPE_OPTIONS.map((o) => o.label)).toEqual([
      'Yüzyüze Özel Ders',
      'Online Birebir',
      'Online Grup',
      'Bireysel Koçluk',
    ])
  })
})

describe('passwordResetSchema', () => {
  it('eşleşen şifreleri kabul eder', () => {
    expect(passwordResetSchema.safeParse({ password: '123456', passwordConfirm: '123456' }).success).toBe(true)
  })
  it('eşleşmeyen şifreleri reddeder', () => {
    const result = passwordResetSchema.safeParse({ password: '123456', passwordConfirm: '654321' })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues[0].message).toBe('Şifreler eşleşmiyor.')
  })
  it('kısa şifreyi reddeder', () => {
    expect(passwordResetSchema.safeParse({ password: '123', passwordConfirm: '123' }).success).toBe(false)
  })
})
