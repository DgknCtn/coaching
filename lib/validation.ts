import { z } from 'zod'

// Server Action'larda kullanılan paylaşılan doğrulama şemaları.
// Client tarafındaki react-hook-form doğrulaması kolayca atlanabilir;
// bu şemalar sunucuda son savunma hattıdır (DB constraint'lerinden önce
// anlamlı, Türkçe hata mesajları üretmek için).

const EXAM_TYPES = ['TYT', 'AYT', 'LGS', 'KPSS', 'DGS', 'Other'] as const

export const studentSchema = z.object({
  fullName: z.string().trim().min(2, 'Ad Soyad en az 2 karakter olmalı.').max(120),
  email: z.string().trim().email('Geçerli bir e-posta girin.').optional().or(z.literal('')),
  phone: z.string().trim().max(30).optional().or(z.literal('')),
  gradeLevel: z.string().trim().max(30).optional().or(z.literal('')),
  examType: z.enum(EXAM_TYPES, { message: 'Geçersiz sınav türü.' }).optional().or(z.literal('')),
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

export const bookSchema = z.object({
  title: z.string().trim().min(2, 'Kitap adı en az 2 karakter olmalı.').max(200),
  subject: z.string().trim().min(1, 'Ders alanı zorunlu.').max(80),
  publisher: z.string().trim().max(120).optional().or(z.literal('')),
  examType: z.enum(EXAM_TYPES, { message: 'Geçersiz sınav türü.' }).optional().or(z.literal('')),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  termId: uuid,
  sections: z.array(sectionSchema).min(1, 'En az bir bölüm ekleyin.').max(100),
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

export const loginSchema = z.object({
  email: z.string().trim().email('Geçerli bir e-posta girin.'),
  password: z.string().min(6, 'Şifre en az 6 karakter olmalı.').max(72),
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
