import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Panelin operasyon satırları — plan saklayan RPC üzerinden (117).
 *
 * `teacher_student_operation_view` doğrudan sorgulandığında PostgREST her
 * istekte ~18 ms planlama ödüyordu. `teacher_operation_rows` aynı sorguyu
 * plpgsql içinde çalıştırıyor; plan bağlantı boyunca saklanıyor. Fonksiyon
 * SECURITY INVOKER — RLS aynen geçerli.
 *
 * GERİ DÜŞÜŞ: fonksiyon henüz yoksa (migration yayından önce uygulanmadı
 * ya da view CASCADE ile yeniden kurulup fonksiyon düştü) view'a dönülür.
 * Aksi hâlde panel "öğrenci listesi alınamadı" derdi. Yalnız "fonksiyon
 * yok" hatasında düşülür; başka her hata çağırana aynen döner (B01).
 */
export async function fetchOperationRows(supabase: SupabaseClient, workspaceId: string) {
  const viaRpc = await supabase
    .rpc('teacher_operation_rows', { p_workspace_id: workspaceId })
    .order('student_full_name')
    .limit(500)

  const missing = viaRpc.error?.code === 'PGRST202' || viaRpc.error?.code === '42883'
  if (!missing) return viaRpc

  return supabase
    .from('teacher_student_operation_view')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')
    .limit(500)
}
