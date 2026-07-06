import { describe, it, expect } from 'vitest'
import {
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
