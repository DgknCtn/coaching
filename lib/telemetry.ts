import type { SupabaseClient } from '@supabase/supabase-js'

// KULLANIM TELEMETRİSİ (054).
//
// "Hangi özellik ne kadar kullanılıyor?" sorusu bugüne kadar yanıtsızdı;
// yol haritası ve fiyatlandırma sezgiyle çiziliyordu.
//
// NE TOPLANIR: yalnız hangi özelliğin kaç kez kullanıldığı, çalışma alanı
// ve gün bazında. KİM kullandığı YAZILMAZ — kullanıcı bazlı davranış
// takibi bu ürünün işi değil ve gizlilik metni de üçüncü taraf takip
// yapılmadığını taahhüt ediyor.
//
// ASLA PATLAMAZ: ölçüm, ölçtüğü şeyi bozmamalı.

/**
 * İzlenen özellikler. Sabit liste — serbest metin olsaydı yazım hataları
 * sessizce yeni "özellikler" üretir ve sayılar bölünürdü.
 */
export type TrackedFeature =
  | 'homework.publish'
  | 'homework.approve'
  | 'protection_pool.view'
  | 'curriculum_flow.save'
  | 'book.create'
  | 'book.subsection_add'
  | 'book.outline_import'
  | 'share_text.copy'
  | 'student.create'
  | 'invite.create'
  | 'report.view'
  | 'billing.checkout_start'

export async function trackFeature(
  supabase: SupabaseClient,
  workspaceId: string,
  feature: TrackedFeature
): Promise<void> {
  try {
    await supabase.rpc('track_feature_usage', {
      p_workspace_id: workspaceId,
      p_feature: feature,
    })
  } catch {
    // Bilinçli olarak sessiz: telemetri hatası kullanıcı akışını
    // etkilememeli ve log gürültüsü de üretmemeli. Sayaç kaybı,
    // ürün kararını değiştirecek büyüklükte bir kayıp değil.
  }
}
