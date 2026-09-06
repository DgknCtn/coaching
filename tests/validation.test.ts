import { describe, it, expect } from 'vitest'
import {
  passwordResetSchema,
  bookUpdateSchema,
  EXAM_TYPE_OPTIONS,
  LESSON_TYPE_OPTIONS,
  studentSchema,
  termSchema,
  bookSchema,
  bookTrackingModeSchema,
  sectionPageRangeSchema,
  sectionPartSchema,
  sectionTopicsSchema,
  assignBookSchema,
  homeworkBatchSchema,
  loginSchema,
  registerSchema,
  acceptInviteSchema,
  uuidSchema,
  firstIssue,
} from '@/lib/validation'

const UUID = '11111111-1111-4111-8111-111111111111'
const UUID2 = '22222222-2222-4222-8222-222222222222'

describe('studentSchema', () => {
  // E-posta ve telefon ARTIK ZORUNLU: öğrenciyi panele davet etmek
  // e-posta, veliye ulaşmak telefon ister. İletişim bilgisi olmayan
  // kayıt, koçun kayıt anında kazandığı saniyeleri sonradan aramakla
  // fazlasıyla geri ödettiriyordu.
  const valid = {
    fullName: 'Ali Veli',
    email: 'ali@ornek.com',
    phone: '05001234567',
  }

  it('accepts a valid student with optional fields empty', () => {
    const r = studentSchema.safeParse({ ...valid, gradeLevel: '', examType: '', notes: '' })
    expect(r.success).toBe(true)
  })

  it('rejects too-short name', () => {
    const r = studentSchema.safeParse({ ...valid, fullName: 'A' })
    expect(r.success).toBe(false)
    if (!r.success) expect(firstIssue(r.error)).toContain('en az 2 karakter')
  })

  it('rejects missing email', () => {
    const r = studentSchema.safeParse({ ...valid, email: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(firstIssue(r.error)).toContain('E-posta zorunlu')
  })

  it('rejects invalid email', () => {
    expect(studentSchema.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false)
  })

  it('rejects missing phone', () => {
    const r = studentSchema.safeParse({ ...valid, phone: '' })
    expect(r.success).toBe(false)
    if (!r.success) expect(firstIssue(r.error)).toContain('Telefon numarası zorunlu')
  })

  it('accepts phone in any human format', () => {
    // Biçim DAYATILMAZ: zorunlu olan bilginin var olması, belli bir
    // kalıba uyması değil.
    for (const phone of ['05001234567', '+90 500 123 45 67', '(0500) 123 45 67']) {
      expect(studentSchema.safeParse({ ...valid, phone }).success).toBe(true)
    }
  })

  it('rejects invalid exam type', () => {
    expect(studentSchema.safeParse({ ...valid, examType: 'ZZZ' }).success).toBe(false)
  })

  it('accepts each valid lesson type', () => {
    for (const lessonType of ['yuz_yuze_ozel', 'online_birebir', 'online_grup', 'bireysel_kocluk']) {
      expect(studentSchema.safeParse({ ...valid, lessonType }).success).toBe(true)
    }
  })

  it('accepts empty lesson type', () => {
    expect(studentSchema.safeParse({ ...valid, lessonType: '' }).success).toBe(true)
  })

  it('rejects invalid lesson type', () => {
    expect(studentSchema.safeParse({ ...valid, lessonType: 'ZZZ' }).success).toBe(false)
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

  // R7-02 §6.5: takip türü beşe çıktı; 'test' ve 'page' anlamları değişmedi.
  it('R7: bölüm / adım / deneme takip türlerini kabul eder', () => {
    for (const mode of ['section', 'step', 'trial']) {
      expect(bookSchema.safeParse({ ...base, trackingMode: mode }).success).toBe(true)
    }
  })

  // R7-02 §6.2-6.3: sınıflama alanları zorunlu değildir; verilmezse
  // 'Belirtilmedi' / 'single' olur ve eski akış hiç değişmez.
  it('R7: kaynak türü ve yapısı verilmezse varsayılana düşer', () => {
    const r = bookSchema.safeParse(base)
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.resourceType).toBe('Belirtilmedi')
      expect(r.data.structureKind).toBe('single')
    }
  })

  it('R7: geçersiz kaynak türünü reddeder', () => {
    expect(bookSchema.safeParse({ ...base, resourceType: 'Kitapçık' }).success).toBe(false)
    expect(bookSchema.safeParse({ ...base, resourceType: 'Kamp Kitabı' }).success).toBe(true)
  })

  it('R7: çok parçalı kaynakta bölüm parça adı taşıyabilir', () => {
    const multi = {
      ...base,
      structureKind: 'multi',
      sections: [{ title: 'Üslü Sayılar', test_count: 10, part: 'F1 Sayılar' }],
    }
    expect(bookSchema.safeParse(multi).success).toBe(true)
  })
})

// R7-02 §6.5 ve §8 ile gelen şemalar.
describe('R7 kitap yapısı şemaları', () => {
  it('sectionPageRangeSchema geçerli aralığı kabul eder', () => {
    expect(
      sectionPageRangeSchema.safeParse({ sectionId: UUID, pageStart: 84, pageEnd: 96 }).success
    ).toBe(true)
  })

  it('sectionPageRangeSchema ters aralığı reddeder', () => {
    expect(
      sectionPageRangeSchema.safeParse({ sectionId: UUID, pageStart: 96, pageEnd: 84 }).success
    ).toBe(false)
  })

  it('sectionPageRangeSchema 1000 sayfayı aşan bölümü reddeder', () => {
    expect(
      sectionPageRangeSchema.safeParse({ sectionId: UUID, pageStart: 1, pageEnd: 1001 }).success
    ).toBe(false)
  })

  it('bookTrackingModeSchema yalnız bilinen türleri kabul eder', () => {
    expect(bookTrackingModeSchema.safeParse({ bookId: UUID, trackingMode: 'step' }).success).toBe(true)
    expect(bookTrackingModeSchema.safeParse({ bookId: UUID, trackingMode: 'kur' }).success).toBe(false)
  })

  it('sectionTopicsSchema boş listeyi kabul eder (eşleme kaldırma)', () => {
    expect(sectionTopicsSchema.safeParse({ sectionId: UUID, topicIds: [] }).success).toBe(true)
  })

  it('sectionTopicsSchema çoklu konuyu kabul eder', () => {
    expect(
      sectionTopicsSchema.safeParse({ sectionId: UUID, topicIds: [UUID, UUID2] }).success
    ).toBe(true)
  })

  it('sectionTopicsSchema uuid olmayan konuyu reddeder', () => {
    expect(sectionTopicsSchema.safeParse({ sectionId: UUID, topicIds: ['abc'] }).success).toBe(false)
  })

  it('sectionPartSchema parçasız bırakmayı (null) kabul eder', () => {
    expect(sectionPartSchema.safeParse({ sectionId: UUID, partId: null }).success).toBe(true)
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

describe('hazırlık programı ve seviye', () => {
  // R6-11: eski TYT/AYT daraltması KALDIRILDI. Öğrencinin neye hazırlandığı
  // ile hangi sınıfta olduğu bağımsızdır; şema ikisi arasında çapraz
  // doğrulama YAPMAZ.
  // İletişim alanları 072'den beri zorunlu; bu testlerin konusu hazırlık
  // programı olduğu için base onları da taşıyor.
  const base = { fullName: 'Ali Veli', email: 'ali@ornek.com', phone: '05001234567' }

  it('studentSchema genişletilmiş hazırlık programlarını kabul eder', () => {
    for (const value of ['Yok', 'LGS', 'YKS', 'TYT', 'AYT', 'IB', 'SAT', 'AP', 'DGS', 'ALES', 'KPSS', 'Diğer']) {
      expect(studentSchema.safeParse({ ...base, examType: value }).success).toBe(true)
    }
  })

  it('tanımsız bir hazırlık programını yine de reddeder', () => {
    expect(studentSchema.safeParse({ ...base, examType: 'GRE' }).success).toBe(false)
  })

  it('kabul #63/#64: sınıf ve hazırlık programı birbirini kısıtlamaz', () => {
    expect(
      studentSchema.safeParse({ ...base, gradeLevel: '10. Sınıf', examType: 'IB' }).success
    ).toBe(true)
    expect(
      studentSchema.safeParse({ ...base, gradeLevel: '9. Sınıf', examType: 'YKS' }).success
    ).toBe(true)
    // kabul #65
    expect(
      studentSchema.safeParse({ ...base, gradeLevel: 'Mezun', examType: 'ALES' }).success
    ).toBe(true)
  })

  // R4 (021): kitapta sınav türü yerini seviye/sınav türüne bıraktı;
  // exam_type artık DB'de level_exam'dan türetiliyor.
  it('bookUpdateSchema seviye/sınav listesini kullanır', () => {
    const base = { bookId: UUID, title: 'Kimya Soru Bankası', subject: 'Kimya' }
    expect(bookUpdateSchema.safeParse({ ...base, levelExam: 'AYT' }).success).toBe(true)
    expect(bookUpdateSchema.safeParse({ ...base, levelExam: '10. Sınıf' }).success).toBe(true)
    expect(bookUpdateSchema.safeParse({ ...base, levelExam: 'KPSS' }).success).toBe(false)
  })

  it('bookSchema baskı yılını ve video desteğini doğrular', () => {
    const base = {
      title: 'Metin 10. Sınıf Matematik',
      subject: 'Matematik',
      sections: [{ title: 'Üçgenler', test_count: 10 }],
    }
    expect(bookSchema.safeParse({ ...base, editionYear: 2026 }).success).toBe(true)
    expect(bookSchema.safeParse({ ...base, editionYear: 1899 }).success).toBe(false)
    expect(bookSchema.safeParse({ ...base, videoMode: 'section' }).success).toBe(true)
    expect(bookSchema.safeParse({ ...base, videoMode: 'playlist' }).success).toBe(false)
    // Kitap havuzu dönemden bağımsız: termId zorunlu değil.
    expect(bookSchema.safeParse(base).success).toBe(true)
  })

  it('seçenek listeleri şemayla aynı değerleri sunar', () => {
    expect(EXAM_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      'Yok',
      'LGS',
      'YKS',
      'TYT',
      'AYT',
      'IB',
      'SAT',
      'AP',
      'DGS',
      'ALES',
      'KPSS',
      'Diğer',
    ])
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
