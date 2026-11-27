import type { SupabaseClient } from '@supabase/supabase-js'

// ÖĞRENCİ ETİKETLERİ — ortak tipler ve okuma (migration 159).

export const TAG_COLORS = ['neutral', 'info', 'success', 'warning', 'destructive'] as const
export type TagColor = (typeof TAG_COLORS)[number]

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  neutral: 'Gri',
  info: 'Mavi',
  success: 'Yeşil',
  warning: 'Sarı',
  destructive: 'Kırmızı',
}

export interface StudentTag {
  id: string
  name: string
  color: TagColor
}

/**
 * Çalışma alanının etiketleri ve öğrenci → etiket bağları.
 * Tablo yoksa (migration 159 uygulanmadan) ya da okunamazsa `null`:
 * çağıran ekran etiket bölümünü hiç çizmez, sayfa bozulmaz.
 */
export async function loadStudentTags(
  supabase: SupabaseClient,
  workspaceId: string,
  studentIds?: string[]
): Promise<{ tags: StudentTag[]; byStudent: Map<string, string[]> } | null> {
  const linksQuery = supabase.from('student_tag_links').select('student_id, tag_id').eq('workspace_id', workspaceId)
  const [tagsRes, linksRes] = await Promise.all([
    supabase.from('student_tags').select('id, name, color').eq('workspace_id', workspaceId).order('name'),
    studentIds && studentIds.length <= 200 ? linksQuery.in('student_id', studentIds) : linksQuery,
  ])
  if (tagsRes.error || linksRes.error) return null
  const byStudent = new Map<string, string[]>()
  for (const l of (linksRes.data ?? []) as { student_id: string; tag_id: string }[]) {
    const list = byStudent.get(l.student_id) ?? []
    list.push(l.tag_id)
    byStudent.set(l.student_id, list)
  }
  return { tags: (tagsRes.data ?? []) as StudentTag[], byStudent }
}
