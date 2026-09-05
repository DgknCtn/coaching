import type { SupabaseClient } from '@supabase/supabase-js'

// DENETİM KAYDI (051).
//
// NEDEN VAR: "bu ödevi kim sildi?", "bu daveti kim iptal etti?" sorularının
// cevabı yoktu. `created_by_profile_id` yalnız altı tabloda vardı,
// `updated_by` hiçbirinde yoktu, soft-delete de yoktu — silinen kayıt
// hiçbir iz bırakmadan gidiyordu.
//
// NE KAYDEDİLİR: geri alınamaz ya da bir başkasının verisini etkileyen
// eylemler. Okuma kaydedilmez, taslak kaydı kaydedilmez — her tıklamayı
// yazmak, tabloyu okunamaz ve pahalı yapardı. Denetim kaydı bir günlük
// değil, sorumluluk zinciridir.
//
// ASLA PATLAMAZ: RPC'nin kendisi hatayı yutuyor (051) ve burada da hata
// yakalanıyor. Denetim satırı yazılamadı diye ödev onayı geri alınmamalı;
// kullanıcı için çok daha kötü bir arıza olur.

/** Kaydedilen eylemler. Serbest metin değil, sabit liste. */
export type AuditAction =
  | 'homework.publish'
  | 'homework.approve'
  | 'homework.reject'
  | 'homework.revert'
  | 'student.archive'
  | 'book.archive'
  | 'book.section_delete'
  | 'book.subsection_delete'
  | 'invite.create'
  | 'invite.revoke'
  | 'target.set'
  | 'target.clear'
  | 'curriculum.flow_save'
  | 'workspace.switch'
  | 'book.outline_import'
  | 'book.import'
  // Faturalama (056). Para hareketi denetim kaydının asıl sebebidir:
  // "bu abonelik ne zaman, hangi planla açıldı" sorusunun cevabı burada.
  | 'billing.checkout_started'
  | 'billing.order_created'
  | 'billing.order_paid'
  | 'billing.subscription_cancelled'

/**
 * Eylemlerin Türkçe karşılıkları — yönetim panelindeki aktivite akışı
 * için.
 *
 * SQL TARAFINDA DA YAZILAN EYLEMLER VAR (billing.*, data.*); bunlar
 * AuditAction birleşiminde görünmüyor ama audit_events'te bulunuyor.
 * Bu yüzden anahtar tipi AuditAction değil string — akış, bilmediği bir
 * eylemi ham hâliyle basmak yerine `auditActionLabel` üzerinden geçirir.
 */
export const AUDIT_ACTION_LABEL: Record<string, string> = {
  'homework.publish': 'Ödev verdi',
  'homework.approve': 'Ödev onayladı',
  'homework.reject': 'Ödev reddetti',
  'homework.revert': 'Ödev onayını geri aldı',
  'student.archive': 'Öğrenci arşivledi',
  'book.archive': 'Kitap arşivledi',
  'book.section_delete': 'Kitap bölümü sildi',
  'book.subsection_delete': 'Kitap alt bölümü sildi',
  'book.outline_import': 'Kitap içindekiler aktardı',
  'book.import': 'Yedekten kitap aktardı',
  'invite.create': 'Davet oluşturdu',
  'invite.revoke': 'Daveti iptal etti',
  'target.set': 'Hedef belirledi',
  'target.clear': 'Hedefi kaldırdı',
  'curriculum.flow_save': 'Müfredat akışını kaydetti',
  'workspace.switch': 'Çalışma alanı değiştirdi',
  'billing.checkout_started': 'Ödeme başlattı',
  'billing.order_created': 'Sipariş oluşturdu',
  'billing.order_paid': 'Ödeme tamamlandı',
  'billing.payment_failed': 'Ödeme başarısız oldu',
  'billing.trial_started': 'Deneme başladı',
  'billing.subscription_cancelled': 'Planı iptal etti',
  'data.deletion_request': 'Veri silme talebi açtı',
  'data.deletion_cancel': 'Veri silme talebini geri aldı',
}

/** Bilinmeyen eylemde ham anahtarı döner — akış boş satır göstermez. */
export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? action
}

export interface AuditInput {
  workspaceId: string
  action: AuditAction
  entityType?: string
  entityId?: string | null
  /**
   * Serbest bağlam. KİŞİSEL VERİ KOYULMAZ — bu tablo uzun ömürlü ve
   * silme taleplerinde temizlenmesi gereken bir yer olmamalı. Sayılar,
   * tarihler ve id'ler yeterli.
   */
  detail?: Record<string, unknown>
}

export async function logAudit(
  supabase: SupabaseClient,
  { workspaceId, action, entityType, entityId, detail }: AuditInput
): Promise<void> {
  try {
    await supabase.rpc('log_audit_event', {
      p_workspace_id: workspaceId,
      p_action: action,
      p_entity_type: entityType ?? null,
      p_entity_id: entityId ?? null,
      p_detail: detail ?? {},
    })
  } catch (error) {
    // Sessizce yutulmaz, ama akışı da durdurmaz.
    console.error(
      '[audit] olay kaydedilemedi:',
      JSON.stringify({ action, message: (error as Error)?.message })
    )
  }
}
