import { z } from 'zod'
import {
  LEVEL_EXAMS,
  CURRICULUM_PROGRAMS,
  SUBJECTS,
  TRACKING_MODES,
  VIDEO_MODES,
  EDITION_YEAR_MIN,
  EDITION_YEAR_MAX,
} from '@/lib/book-taxonomy'

// Ders/seviye/takip/video listeleri artık lib/book-taxonomy.ts'te (R4 §3).
// Buradan yeniden dışa aktarılıyorlar ki mevcut importlar kırılmasın.
export { LEVEL_EXAMS, CURRICULUM_PROGRAMS, SUBJECTS, TRACKING_MODES, VIDEO_MODES }

// Server Action'larda kullanılan paylaşılan doğrulama şemaları.
// Client tarafındaki react-hook-form doğrulaması kolayca atlanabilir;
// bu şemalar sunucuda son savunma hattıdır (DB constraint'lerinden önce
// anlamlı, Türkçe hata mesajları üretmek için).

// Seçenek listelerinin TEK kaynağı. Daha önce her form kendi kopyasını
// tutuyordu ve listeler birbirinden ayrışmıştı (öğrenci formunda 6, kitap
// formunda 4 sınav türü vardı). Formlar artık buradan import ediyor.
//
// R6-11: "Sınav Türü" -> "Hazırlık Programı".
//
// Öğrencinin NEYE HAZIRLANDIĞI ile ŞU AN NEREDE OLDUĞU (GRADE_LEVELS)
// bağımsızdır ve birbirini kısıtlamaz: 9. Sınıf + YKS, 10. Sınıf + IB ya da
// Mezun + ALES geçerli kombinasyonlardır.
//
// DB tarafındaki CHECK 033_student_prep_program.sql ile bu listeyi kabul
// edecek şekilde genişletildi; eski değerler (KPSS, DGS, Other) korunuyor
// ki geçmişte kaydedilmiş satırlar okunmaya devam etsin.
export const EXAM_TYPES = [
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
] as const
export const LESSON_TYPES = ['yuz_yuze_ozel', 'online_birebir', 'online_grup', 'bireysel_kocluk'] as const

/** Form etiketi: "Hazırlık Programı". */
export const EXAM_TYPE_OPTIONS: { value: string; label: string }[] = EXAM_TYPES.map(v => ({
  value: v,
  label: v,
}))

/** R6-11: "Ders Türü" -> "Çalışma Modeli". DEĞERLER DEĞİŞMEZ; yalnız
 *  kullanıcıya görünen alan adı değişir, bu yüzden migration gerekmez. */
export const LESSON_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'yuz_yuze_ozel', label: 'Yüzyüze Özel Ders' },
  { value: 'online_birebir', label: 'Online Birebir' },
  { value: 'online_grup', label: 'Online Grup' },
  { value: 'bireysel_kocluk', label: 'Bireysel Koçluk' },
]

export const GRADE_LEVELS = ['9. Sınıf', '10. Sınıf', '11. Sınıf', '12. Sınıf', 'Mezun', 'Diğer'] as const

export const studentSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad Soyad en az 2 karakter olmalı.').max(120),
  email: z.string().trim().email('Geçerli bir e-posta girin.').optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  gradeLevel: z.string().trim().max(30).optional().or(z.literal('')),
  examType: z.enum(EXAM_TYPES, { message: 'Geçersiz hazırlık programı.' }).optional().or(z.literal('')),
  lessonType: z.enum(LESSON_TYPES, { message: 'Geçersiz çalışma modeli.' }).optional().or(z.literal('')),
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
  // R4 §3: bölümün niteliğini insan dilinde anlatan kısa not. Kur/etkinlik
  // gibi alt türler için ayrı veri modeli açmak yerine buraya yazılır.
  note: z.string().trim().max(500, 'Bölüm notu en fazla 500 karakter olabilir.').optional().or(z.literal('')),
  video_url: z.string().trim().url('Geçerli bir bağlantı girin.').max(500).optional().or(z.literal('')),
  // Sayfa takipli kitapta bölüm "sf. 1-56" gibi fiziksel kapsamla tanımlanır.
  page_start: z.number().int().min(1).max(100000).optional().nullable(),
  page_end: z.number().int().min(1).max(100000).optional().nullable(),
})
  .refine(
    (v) => v.page_start == null || v.page_end == null || v.page_end >= v.page_start,
    { message: 'Bitiş sayfası başlangıçtan küçük olamaz.', path: ['page_end'] }
  )

const levelExam = z
  .enum(LEVEL_EXAMS, { message: 'Geçersiz seviye / sınav türü.' })
  .optional()
  .or(z.literal(''))

const editionYear = z
  .number({ message: 'Baskı yılı sayı olmalı.' })
  .int('Baskı yılı tam sayı olmalı.')
  .min(EDITION_YEAR_MIN, 'Baskı yılı çok eski.')
  .max(EDITION_YEAR_MAX, 'Baskı yılı çok ileri.')
  .optional()
  .nullable()

/** R6-14: öğretim programı. Verilmezse 'Belirtilmedi'. */
const curriculumProgram = z
  .enum(CURRICULUM_PROGRAMS, { message: 'Geçersiz öğretim programı.' })
  .default('Belirtilmedi')

const videoMode = z.enum(VIDEO_MODES, { message: 'Geçersiz video desteği seçimi.' }).default('none')
const videoUrl = z.string().trim().url('Geçerli bir video bağlantısı girin.').max(500).optional().or(z.literal(''))

// R4 §3. Değişenler: examType yerine levelExam (exam_type artık DB'de
// derive_exam_type ile türetiliyor), baskı yılı ve video desteği eklendi,
// termId opsiyonelleşti — kitap havuzu artık dönemden bağımsız (021).
export const bookSchema = z.object({
  title: z.string().trim().min(2, 'Kitap adı en az 2 karakter olmalı.').max(200),
  subject: z.string().trim().min(1, 'Ders alanı zorunlu.').max(80),
  publisher: z.string().trim().max(120).optional().or(z.literal('')),
  levelExam,
  curriculumProgram,
  editionYear,
  trackingMode: z.enum(TRACKING_MODES, { message: 'Geçersiz takip türü.' }).default('test'),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  videoMode,
  videoUrl,
  termId: uuid.optional().or(z.literal('')),
  sections: z.array(sectionSchema).min(1, 'En az bir bölüm ekleyin.').max(100),
})

// Kitap düzenleme (018). Oluşturma şemasından farkı: bölüm listesi ve
// takip türü yok — onlar ayrı RPC'lerle, tek tek yönetiliyor.
export const bookUpdateSchema = z.object({
  bookId: uuid,
  title: z.string().trim().min(2, 'Kitap adı en az 2 karakter olmalı.').max(200),
  subject: z.string().trim().min(1, 'Ders alanı zorunlu.').max(80),
  publisher: z.string().trim().max(120).optional().or(z.literal('')),
  levelExam,
  curriculumProgram,
  editionYear,
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  videoMode,
  videoUrl,
})

// "Bu kitabın yeni baskısını oluştur" (R4 §1B, §8): 2026 içeriği eklenirken
// 2025 kaydı ezilmesin diye kitap kopyalanır.
export const bookEditionSchema = z.object({
  bookId: uuid,
  editionYear: z
    .number({ message: 'Baskı yılı sayı olmalı.' })
    .int('Baskı yılı tam sayı olmalı.')
    .min(EDITION_YEAR_MIN, 'Baskı yılı çok eski.')
    .max(EDITION_YEAR_MAX, 'Baskı yılı çok ileri.'),
  title: z.string().trim().max(200).optional().or(z.literal('')),
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
  /** Ödev notu (R6-05) — isteğe bağlı, ödev başına tek alan. */
  note: z.string().trim().max(2000, 'Ödev notu en fazla 2000 karakter olabilir.').optional().or(z.literal('')),
  items: z.array(homeworkItemSchema).min(1, 'En az bir çalışma seçin.').max(500),
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
