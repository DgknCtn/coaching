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
