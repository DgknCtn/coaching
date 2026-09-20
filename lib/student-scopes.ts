import type { SupabaseClient } from '@supabase/supabase-js'

// "Bu öğrenci hangi akademik alanları takip ediyor?" — TEK yanıt yeri
// (R7 Kaynak Mimarisi §4.1, §7).
//
// VERİ SAHİPLİĞİ (§7): Akademik Kapsam ders/kapsam listesinin sahibidir.
// Kitaplar ve Kaynak Planı bu listeyi OKUR, ÜRETMEZ. Bugüne kadar ders
// listesi atanmış kitaplardan türüyordu; bu yüzden kaynağı olmayan bir
// alan hiç görünmüyor, "AYT Fizik · 0 kaynak · Kaynak atanmadı" satırı
// hiç çizilemiyordu.
//
// YKS HARD-CODE EDİLMEZ (§4.1): burada hiçbir sınav adı geçmez.
// academic_scopes (038) bir isim listesidir; aynı model IB, AP, SAT ve
// IELTS'te de çalışır — "Reading / Writing / Listening / Speaking" da
// geçerli bir scope kümesidir.
//
// LİSTE İKİ KAYNAĞIN BİRLEŞİMİDİR:
//
//   1. Öğrencinin müfredat akışındaki alanlar (student_curriculum_items).
//      Asıl kaynak budur: öğretmen "bu öğrenciyle şu dersleri takip
//      ediyorum" beyanını akışı kurarken vermiştir.
//   2. Öğrenciye atanmış kaynakların alanları.
//
// İKİNCİSİ ZORUNLU BİR EMNİYET KEMERİDİR: yalnız akışa bakılsaydı,
// akışı henüz kurulmamış bir alana atanmış kaynak HİÇBİR ekranda
// görünmezdi. Bu, düzelttiğimiz §4.4 tutarsızlığının (bekleyen kaynak
// envanterden kayboluyor) yeni bir kopyası olurdu.

export interface StudentScope {
  id: string
  name: string
  subject: string | null
  levelExam: string | null
  sortOrder: number
}

/**
 * Öğrencinin akademik alanları, görüntüleme sırasında.
 *
 * Sıra academic_scopes.sort_order, eşitlikte ada göre Türkçe
 * sıralamadır: aynı liste her ekranda aynı sırada çizilsin.
 */
export async function loadStudentScopes(
  supabase: SupabaseClient,
  { workspaceId, studentId }: { workspaceId: string; studentId: string }
): Promise<StudentScope[]> {
  const [{ data: flowRows }, { data: assignmentRows }] = await Promise.all([
    supabase
      .from('student_curriculum_items')
      .select('scope_id')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId),
    supabase
      .from('student_book_assignments')
      .select('scope_id')
      .eq('workspace_id', workspaceId)
      .eq('student_id', studentId)
      .not('scope_id', 'is', null),
  ])

  const scopeIds = new Set<string>()
  for (const row of (flowRows ?? []) as { scope_id: string | null }[]) {
    if (row.scope_id) scopeIds.add(row.scope_id)
  }
  for (const row of (assignmentRows ?? []) as { scope_id: string | null }[]) {
    if (row.scope_id) scopeIds.add(row.scope_id)
  }

  if (scopeIds.size === 0) return []

  const { data } = await supabase
    .from('academic_scopes')
    .select('id, name, subject, level_exam, sort_order')
    .eq('workspace_id', workspaceId)
    .in('id', [...scopeIds])

  const rows = (data ?? []) as {
    id: string
    name: string
    subject: string | null
    level_exam: string | null
    sort_order: number | null
  }[]

  return rows
    .map(r => ({
      id: r.id,
      name: r.name,
      subject: r.subject,
      levelExam: r.level_exam,
      sortOrder: r.sort_order ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr'))
}

/**
 * Çalışma alanındaki TÜM aktif alanlar — Kitap Ata penceresinin
 * Ders/Kapsam listesi.
 *
 * Neden öğrencinin listesi değil: öğretmen yeni bir alanda ilk kaynağı
 * atarken o alan henüz öğrencinin listesinde olmayabilir. Seçimi
 * öğrencinin mevcut alanlarıyla sınırlamak, ilk kaynağı atamayı
 * imkânsız kılardı (assign-book-dialog'daki "filtre yalnız listeyi
 * daraltır, atamayı kısıtlamaz" kuralıyla aynı ilke).
 */
export async function loadWorkspaceScopes(
  supabase: SupabaseClient,
  { workspaceId }: { workspaceId: string }
): Promise<StudentScope[]> {
  const { data } = await supabase
    .from('academic_scopes')
    .select('id, name, subject, level_exam, sort_order')
    .eq('workspace_id', workspaceId)
    .eq('active', true)
    .order('sort_order')

  return ((data ?? []) as {
    id: string
    name: string
    subject: string | null
    level_exam: string | null
    sort_order: number | null
  }[]).map(r => ({
    id: r.id,
    name: r.name,
    subject: r.subject,
    levelExam: r.level_exam,
    sortOrder: r.sort_order ?? 0,
  }))
}

// ============================================================
// Ders/kapsam gruplaması
//
// Kitaplar ve Kaynak Planı AYNI blokları AYNI sırada çizmek zorunda:
// öğretmen iki ekran arasında geçerken alanların yeri değişmemeli.
// Gruplama bu yüzden ekranda değil burada yapılır.
// ============================================================

/** Alanı olmayan kaynakların toplandığı sanal grup. */
export const UNASSIGNED_SCOPE_KEY = 'unassigned'

export const UNASSIGNED_SCOPE_LABEL = 'Alan atanmamış'

export interface ScopeGroup<T> {
  /** Gerçek scope id'si veya UNASSIGNED_SCOPE_KEY. */
  key: string
  label: string
  /** Sanal "Alan atanmamış" grubunda null. */
  scope: StudentScope | null
  items: T[]
}

/**
 * Kaynakları alanlarına göre gruplar.
 *
 * ÜÇ KURAL:
 *   1. KAYNAĞI OLMAYAN ALAN DA DÖNER (§4.1). "AYT Fizik · 0 kaynak ·
 *      Kaynak atanmadı" satırı ancak böyle çizilebilir; liste kitaplardan
 *      türetilseydi o alan hiç görünmezdi.
 *   2. Alanı boş kaynaklar sona, sanal bir gruba düşer — kaybolmazlar.
 *   3. Sıra her zaman scope sırasıdır; "Alan atanmamış" en sondadır.
 */
export function groupByScope<T extends { scopeId: string | null }>(
  items: T[],
  scopes: StudentScope[]
): ScopeGroup<T>[] {
  const byScope = new Map<string, T[]>()
  for (const item of items) {
    const key = item.scopeId ?? UNASSIGNED_SCOPE_KEY
    byScope.set(key, [...(byScope.get(key) ?? []), item])
  }

  const groups: ScopeGroup<T>[] = scopes.map(scope => ({
    key: scope.id,
    label: scope.name,
    scope,
    items: byScope.get(scope.id) ?? [],
  }))

  const orphans = byScope.get(UNASSIGNED_SCOPE_KEY) ?? []
  if (orphans.length > 0) {
    groups.push({
      key: UNASSIGNED_SCOPE_KEY,
      label: UNASSIGNED_SCOPE_LABEL,
      scope: null,
      items: orphans,
    })
  }

  return groups
}
