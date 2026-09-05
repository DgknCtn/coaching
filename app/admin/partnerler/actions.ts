'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { dbErrorToTr } from '@/lib/auth-errors'

// Yetki kontrolü RPC'nin İÇİNDE (060): admin_mark_commissions_paid
// girişinde is_platform_admin() bakıyor. Burada tekrarlamak iki ayrı
// doğruluk kaynağı yaratırdı.

export async function markCommissionsPaidAction(
  partnerId: string
): Promise<{ error?: string; marked?: number }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_mark_commissions_paid', {
    p_partner_id: partnerId,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/partnerler')
  return { marked: (data as unknown as { marked: number })?.marked ?? 0 }
}

/**
 * Yeni partner oluşturur.
 *
 * KOD BOŞ GEÇİLEBİLİR: veritabanı okunabilir bir kod üretir
 * (generate_partner_code — alfabede 0/O ve 1/I/L yok).
 *
 * Doğrulama RPC'nin İÇİNDE: kod biçimi, oran aralığı ve çakışma orada
 * kontrol ediliyor. Burada tekrarlamak iki ayrı doğruluk kaynağı
 * yaratırdı ve biri güncellenirken diğeri unutulurdu.
 */
export async function createPartnerAction(input: {
  name: string
  email: string
  code: string
  /** Yüzde olarak (10 = %10); RPC orana çevrilmiş hâlini bekliyor. */
  commissionPercent: number
  notes: string
}): Promise<{ error?: string; code?: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('admin_create_partner', {
    p_name: input.name,
    p_email: input.email || null,
    p_code: input.code || null,
    p_commission_rate: input.commissionPercent / 100,
    p_notes: input.notes || null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/partnerler')
  return { code: (data as unknown as { code: string })?.code }
}

/**
 * Komisyon oranını ve/veya durumu günceller.
 *
 * KOD DEĞİŞTİRİLEMİYOR (bkz. 067): paylaşılmış bağlantıların içinde
 * yaşıyor. Verilmeyen alan "değiştirme" demek.
 *
 * GEÇMİŞE ETKİ ETMEZ: hakediş satırları o anki oranı kendi içinde
 * saklıyor, oranı düşürmek hak edilmiş komisyonu geri almaz.
 */
export async function updatePartnerAction(input: {
  partnerId: string
  commissionPercent?: number
  status?: 'active' | 'suspended'
}): Promise<{ error?: string }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc('admin_update_partner', {
    p_partner_id: input.partnerId,
    p_commission_rate:
      input.commissionPercent === undefined ? null : input.commissionPercent / 100,
    p_status: input.status ?? null,
    p_name: null,
    p_email: null,
  })

  if (error) return { error: dbErrorToTr(error.message) }

  revalidatePath('/admin/partnerler')
  return {}
}
