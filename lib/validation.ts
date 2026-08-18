import { z } from 'zod'

// Server Action'larda kullanılan paylaşılan doğrulama şemaları.
// Client tarafındaki react-hook-form doğrulaması kolayca atlanabilir;
// bu şemalar sunucuda son savunma hattıdır (DB constraint'lerinden önce
// anlamlı, Türkçe hata mesajları üretmek için).

// Seçenek listelerinin TEK kaynağı. Daha önce her form kendi kopyasını
// tutuyordu ve listeler birbirinden ayrışmıştı (öğrenci formunda 6, kitap
// formunda 4 sınav türü vardı). Formlar artık buradan import ediyor.
//
// NOT: DB'deki CHECK kısıtı hâlâ TYT/AYT/LGS/KPSS/DGS/Other kabul ediyor
// (001 ve 009). Daraltma bilinçli olarak yalnızca form katmanında: geçmişte
// başka bir türle kaydedilmiş satırlar okunmaya devam etsin.
export const EXAM_TYPES = ['TYT', 'AYT'] as const
export const LESSON_TYPES = ['yuz_yuze_ozel', 'online_birebir', 'online_grup', 'bireysel_kocluk'] as const

export const EXAM_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'TYT', label: 'TYT' },
  { value: 'AYT', label: 'AYT' },
]

export const LESSON_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'yuz_yuze_ozel', label: 'Yüzyüze Özel Ders' },
  { value: 'online_birebir', label: 'Online Birebir' },
  { value: 'online_grup', label: 'Online Grup' },
  { value: 'bireysel_kocluk', label: 'Bireysel Koçluk' },
]

export const GRADE_LEVELS = ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf', 'Mezun', 'Diğer'] as const

export const SUBJECTS = [
  'Matematik', 'Türkçe', 'Fizik', 'Kimya', 'Biyoloji',
  'Geometri', 'Tarih', 'Coğrafya', 'Edebiyat', 'İngilizce', 'Diğer',
] as const

export const studentSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad Soyad en az 2 karakter olmalı.').max(120),
  email: z.string().trim().email('Geçerli bir e-posta girin.').optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  gradeLevel: z.string().trim().max(30).optional().or(z.literal('')),
  examType: z.enum(EXAM_TYPES, { message: 'Geçersiz sınav türü.' }).optional().or(z.literal('')),
  lessonType: z.enum(LESSON_TYPES, { message: 'Geçersiz ders türü.' }).optional().or(z.literal('')),
  notes: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const uuidSchema = z.string().uuid('Geçersiz kayıt kimliği.')
const uuid = uuidSchema
const optionalDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçersiz tarih.')
  .optional()
  .or(z.literal(''))

export const termSchema = z.object({
  name: z.string().trim().min(2, 'Dönem adı en az 2 karakter olmalı.').max(120),
  startDate: optionalDate,
  endDate: optionalDate,
})

const sectionSchema = z.object({
  title: z.string().trim().min(1, 'Bölüm adı boş olamaz.').max(200),
  test_count: z
    .number({ message: 'Test sayısı sayı olmalı.' })
    .int('Test sayısı tam sayı olmalı.')
    .min(0, 'Test sayısı negatif olamaz.')
    .max(1000, 'Test sayısı çok yüksek.'),
})

export const TRACKING_MODES = ['test', 'page'] as const

export const bookSchema = z.object({
  title: z.string().trim().min(2, 'Kitap adı en az 2 karakter olmalı.').max(200),
  subject: z.string().trim().min(1, 'Ders alanı zorunlu.').max(80),
  publisher: z.string().trim().max(120).optional().or(z.literal('')),
  examType: z.enum(EXAM_TYPES, { message: 'Geçersiz sınav türü.' }).optional().or(z.literal('')),
  trackingMode: z.enum(TRACKING_MODES, { message: 'Geçersiz takip türü.' }).default('test'),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  termId: uuid,
  sections: z.array(sectionSchema).min(1, 'En az bir bölüm ekleyin.').max(100),
})

// Kitap düzenleme (018). Oluşturma şemasından farkı: bölüm listesi ve
// takip türü yok — onlar ayrı RPC'lerle, tek tek yönetiliyor.
export const bookUpdateSchema = z.object({
  bookId: uuid,
  title: z.string().trim().min(2, 'Kitap adı en az 2 karakter olmalı.').max(200),
  subject: z.string().trim().min(1, 'Ders alanı zorunlu.').max(80),
  publisher: z.string().trim().max(120).optional().or(z.literal('')),
  examType: z.enum(EXAM_TYPES, { message: 'Geçersiz sınav türü.' }).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
})

export const sectionTitleSchema = z.object({
  sectionId: uuid,
  title: z.string().trim().min(1, 'Bölüm adı boş olamaz.').max(200),
})

export const sectionTestCountSchema = z.object({
  sectionId: uuid,
  testCount: z
    .number({ message: 'Test sayısı sayı olmalı.' })
    .int('Test sayısı tam sayı olmalı.')
    .min(1, 'Bölümde en az 1 test olmalı.')
    .max(200, 'Test sayısı çok yüksek.'),
})

export const newSectionSchema = z.object({
  bookId: uuid,
  title: z.string().trim().min(1, 'Bölüm adı boş olamaz.').max(200),
  testCount: z
    .number({ message: 'Test sayısı sayı olmalı.' })
    .int('Test sayısı tam sayı olmalı.')
    .min(1, 'Bölümde en az 1 test olmalı.')
    .max(200, 'Test sayısı çok yüksek.'),
})

export const assignBookSchema = z.object({
  studentId: uuid,
  bookId: uuid,
  startDate: optionalDate,
  targetEndDate: optionalDate,
})

const homeworkItemSchema = z.object({
  student_book_assignment_id: uuid,
  book_test_id: uuid,
})

export const homeworkBatchSchema = z.object({
  workspaceId: uuid,
  termId: uuid,
  studentId: uuid,
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir teslim tarihi seçin.'),
  title: z.string().trim().max(200).optional().or(z.literal('')),
  items: z.array(homeworkItemSchema).min(1, 'En az bir test seçin.').max(500),
})

export const CHECK_IN_MOODS = ['iyi', 'idare_eder', 'zorlaniyorum'] as const

export const checkInSchema = z.object({
  checkInId: uuid,
  mood: z.enum(CHECK_IN_MOODS, { message: 'Geçersiz durum seçimi.' }),
  message: z.string().trim().max(500, 'Mesaj en fazla 500 karakter olabilir.').optional().or(z.literal('')),
})

export const checkInScheduleSchema = z.object({
  studentId: uuid,
  intervalDays: z
    .number({ message: 'Periyot sayı olmalı.' })
    .int('Periyot tam sayı olmalı.')
    .min(1, 'Periyot en az 1 gün olmalı.')
    .max(30, 'Periyot en fazla 30 gün olabilir.'),
  isActive: z.boolean(),
})

export const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.').max(72),
})

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta girin.'),
})

// Yeni şifre belirleme. Kurallar loginSchema ile aynı; ek olarak iki alan
// birbiriyle eşleşmeli.
export const passwordResetSchema = z
  .object({
    password: z.string().min(6, 'Şifre en az 6 karakter olmalı.').max(72),
    passwordConfirm: z.string().min(6, 'Şifre en az 6 karakter olmalı.').max(72),
  })
  .refine((v) => v.password === v.passwordConfirm, {
    message: 'Şifreler eşleşmiyor.',
    path: ['passwordConfirm'],
  })

export const registerSchema = loginSchema.extend({
  fullName: z.string().trim().min(2, 'Ad Soyad en az 2 karakter olmalı.').max(120),
  workspaceName: z.string().trim().max(120).optional().or(z.literal('')),
})

// Davet kabul: ad, e-posta, şifre.
export const acceptInviteSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad Soyad en az 2 karakter olmalı.').max(120),
  email: z.string().trim().email('Geçerli bir e-posta girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.').max(72),
})

// Zod hatalarını tek bir kullanıcı-dostu string'e çevirir.
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Girdiğiniz bilgiler geçersiz.'
}
