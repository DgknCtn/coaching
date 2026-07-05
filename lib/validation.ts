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

// Zod hatalarını tek bir kullanıcı-dostu string'e çevirir.
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Girdiğiniz bilgiler geçersiz.'
}
