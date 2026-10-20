import { z } from 'zod'
import { BLOG_CATEGORIES } from '@/lib/blog-categories'

// YÖNETİM İŞLEMİ ŞEMALARI (128). Sınırlar veritabanındakilerle AYNI —
// asıl denetim RPC'de; bu katman yanlış girdiyi ağa çıkmadan yakalar ve
// kullanıcıya alan düzeyinde Türkçe mesaj verir.

const reason = z
  .string()
  .trim()
  .min(10, 'Gerekçe en az 10 karakter olmalı.')
  .max(500, 'Gerekçe en fazla 500 karakter olabilir.')

const uuid = z.uuid('Geçersiz kayıt.')

export const extendTrialSchema = z.object({
  workspaceId: uuid,
  days: z.coerce.number().int().min(1, 'En az 1 gün.').max(30, 'En fazla 30 gün.'),
  reason,
})

export const setStatusSchema = z.object({
  workspaceId: uuid,
  status: z.enum(['active', 'suspended']),
  reason,
})

export const grantLicenseSchema = z.object({
  workspaceId: uuid,
  studentCount: z.coerce.number().int().min(1, 'En az 1 öğrenci.').max(1000, 'En fazla 1000 öğrenci.'),
  months: z.coerce.number().int().min(1, 'En az 1 ay.').max(24, 'En fazla 24 ay.'),
  reason,
})

export const studentLimitSchema = z.object({
  workspaceId: uuid,
  limit: z.coerce.number().int().min(1, 'En az 1.').max(10000, 'En fazla 10000.'),
  reason,
})

export const resolveOrderSchema = z.object({
  orderId: uuid,
  outcome: z.enum(['paid', 'failed']),
  reason,
})

// 136: seçerek temizleme. Onay metni (ad / e-posta) RPC'de birebir denetlenir.
export const cleanupKindSchema = z.enum(['workspace', 'partner', 'user'])

export const deleteCleanupSchema = z.object({
  kind: cleanupKindSchema,
  id: uuid,
  confirm: z.string().trim().min(1, 'Onay metnini yazın.').max(320),
  reason,
})

// ============================================================
// 149 — BLOG YAZILARI
//
// SINIRLAR 149_blog.sql'deki CHECK KISITLARIYLA BİREBİR AYNI ve bu
// eşitlik tests/blog-action-schemas.test.ts ile korunuyor. Ayrışırlarsa
// kullanıcı alan düzeyinde Türkçe bir mesaj yerine "İşlem
// tamamlanamadı" görür (dbErrorToTr, Postgres'in CHECK ihlali
// mesajını generic mesaja indiriyor) — yani hatanın hangi alanda
// olduğu ekranda HİÇ görünmez.
//
// GEREKÇE (`reason`) YALNIZ DURUM VE SİLME ŞEMALARINDA: taslak
// kaydetmek yönetim kaydına girmiyor (149'un karar bloğu). Her
// kaydetmede 10 karakter gerekçe istemek, bir yazıyı yazarken on kez
// gerekçe yazdırmak demekti.
// ============================================================

/** Boş metin NULL'a iner: form boş string gönderiyor, veritabanı NULL bekliyor. */
const optionalText = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label} en fazla ${max} karakter olabilir.`)
    .refine((v) => v === '' || v.length >= min, `${label} en az ${min} karakter olmalı.`)
    .optional()
    .or(z.literal(''))

export const blogPostSchema = z.object({
  // Yeni yazıda yok; düzenlemede var.
  id: uuid.optional(),

  slug: z
    .string()
    .trim()
    .min(3, 'Adres en az 3 karakter olmalı.')
    .max(120, 'Adres en fazla 120 karakter olabilir.')
    .regex(
      /^[a-z0-9]+(-[a-z0-9]+)*$/,
      'Adres yalnız küçük harf, rakam ve tire içerebilir; tireyle başlayıp bitemez.'
    ),

  title: z
    .string()
    .trim()
    .min(3, 'Başlık en az 3 karakter olmalı.')
    .max(200, 'Başlık en fazla 200 karakter olabilir.'),

  excerpt: z
    .string()
    .trim()
    .min(20, 'Özet en az 20 karakter olmalı.')
    .max(400, 'Özet en fazla 400 karakter olabilir.'),

  content: z
    .string()
    .trim()
    .min(50, 'İçerik en az 50 karakter olmalı.')
    .max(60000, 'İçerik en fazla 60000 karakter olabilir.'),

  category: z.enum(BLOG_CATEGORIES, { message: 'Geçerli bir kategori seçin.' }),

  seoTitle: optionalText(3, 70, 'Arama başlığı'),
  seoDescription: optionalText(20, 160, 'Arama açıklaması'),
})

export const blogStatusSchema = z.object({
  id: uuid,
  status: z.enum(['draft', 'published'], { message: 'Geçersiz yayın durumu.' }),
  reason,
})

export const blogDeleteSchema = z.object({
  id: uuid,
  // Yıkıcı işlem: yazının başlığı AYNEN yazılmalı (136'nın kalıbı).
  // Yanlış satırda açılmış bir diyaloğu refleksle onaylamayı önler.
  confirm: z.string().trim().min(1, 'Onay metnini yazın.').max(200),
  reason,
})

/** İlk hatanın metni — diyalog tek satır gösteriyor. */
export function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Girdi geçersiz.'
}

/** Yönetim kaydındaki eylem anahtarlarının okunur adı. */
export const ADMIN_ACTION_LABEL: Record<string, string> = {
  'workspace.extend_trial': 'Deneme uzatıldı',
  'workspace.suspend': 'Askıya alındı',
  'workspace.reactivate': 'Yeniden açıldı',
  'workspace.student_limit': 'Öğrenci limiti değişti',
  'license.grant': 'Lisans verildi',
  'order.mark_paid': 'Sipariş ödendi sayıldı',
  'order.mark_failed': 'Sipariş başarısız sayıldı',
  // 129:
  'partner.update': 'Partner güncellendi',
  'partner.commissions_paid': 'Partner hakedişi ödendi',
  'library.approve': 'Kütüphane önerisi onaylandı',
  'library.reject': 'Kütüphane önerisi reddedildi',
  // 136:
  'workspace.delete': 'Çalışma alanı kalıcı silindi',
  'partner.delete': 'Partner silindi',
  'user.delete': 'Kullanıcı silindi',
  // 149:
  'blog.publish': 'Blog yazısı yayınlandı',
  'blog.unpublish': 'Blog yazısı geri çekildi',
  'blog.delete': 'Blog yazısı silindi',
}

export function adminActionLabel(action: string): string {
  return ADMIN_ACTION_LABEL[action] ?? action
}
