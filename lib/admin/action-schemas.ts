import { z } from 'zod'

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
}

export function adminActionLabel(action: string): string {
  return ADMIN_ACTION_LABEL[action] ?? action
}
