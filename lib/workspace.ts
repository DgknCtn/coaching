import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import type { WorkspaceUsage } from '@/lib/plans'
import {
  ACTIVE_WORKSPACE_COOKIE,
  resolveActiveWorkspace,
  type WorkspaceMembership,
} from '@/lib/active-workspace'

/** Çerezdeki tercih. Doğrulanmamış ham değer — tek başına kullanılmaz. */
async function readActiveWorkspaceCookie(): Promise<string | null> {
  const store = await cookies()
  return store.get(ACTIVE_WORKSPACE_COOKIE)?.value ?? null
}

// Bu üç fonksiyon React.cache() ile sarılıdır: layout ve sayfa AYNI istek
// içinde aynı context'i çağırdığında sorgular yalnız bir kez çalışır.
// Önceden öğretmen sayfası başına ~10 gidiş-dönüş ödeniyordu (layout 5 +
// sayfa 5); dedupe ile bu tek sefere iner.
//
// İkinci kazanç: profil alındıktan sonra birbirinden bağımsız olan üyelik,
// workspace ve aktif dönem sorguları Promise.all ile tek dalgada çalışır.
// Dönen nesne ve redirect koşulları AYNEN korunur — çağıran hiçbir ekran
// farkı görmez.

/**
 * Erişim engellenmişse açıklama sayfasına, değilse giriş ekranına.
 *
 * RLS askıya alınmış bir çalışma alanını üyelerine bile göstermiyor
 * (051/052), bu yüzden nedeni ancak RLS'i atlayan RPC söyleyebiliyor.
 * RPC hata verirse /login'e düşülür — açıklama gösterememek, kullanıcıyı
 * beyaz ekranda bırakmaktan iyidir.
 */
async function blockedRedirectTarget(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string> {
  try {
    const { data } = await supabase.rpc('get_workspace_access_state')
    const rows = (data ?? []) as { blocked_reason: string | null }[]
    if (rows.length > 0 && rows.every(r => r.blocked_reason)) return '/erisim'
  } catch {
    // yut: aşağıdaki varsayılana düşülür
  }
  return '/login'
}

// ============================================================
// PANEL SEÇENEKLERİ (B18) — alan + rol
//
// Bir kişi bir kurumda öğretmen, başka birinde veli, üçüncüsünde öğrenci
// olabilir. Seçici artık yalnız öğretmen alanlarını değil, kullanıcının
// TÜM panellerini gösteriyor; seçim o alana geçip o paneli açıyor.
//
// Önceden öğrenci ve veli bağlamı yalnız `default_workspace_id`'yi
// okuyordu: ikinci kuruma davet edilen öğrenci o kurumu hiç göremiyor,
// başka alanda öğretmen olup veli davetini kabul eden kişi veli
// panelinde bağlı çocuğunu bulamıyordu.
// ============================================================

export type PanelKind = 'teacher' | 'student' | 'parent'

export const PANEL_ROLES: Record<PanelKind, string[]> = {
  teacher: ['owner', 'teacher'],
  student: ['student'],
  parent: ['parent'],
}

export interface PanelOption {
  workspaceId: string
  name: string
  panel: PanelKind
}

type RawMember = { role: string; workspace_id: string; status: string }

function activeMembers(raw: unknown): RawMember[] {
  return ((raw ?? []) as RawMember[]).filter(m => m.status === 'active')
}

/** Kullanıcının tüm panelleri; alan adları tek sorguda. */
async function loadPanelOptions(
  supabase: Awaited<ReturnType<typeof createClient>>,
  members: RawMember[],
  activeWorkspaceId: string | null
): Promise<PanelOption[]> {
  const seen = new Set<string>()
  const pairs: { workspaceId: string; panel: PanelKind }[] = []
  for (const m of members) {
    const panel = (Object.keys(PANEL_ROLES) as PanelKind[]).find(k => PANEL_ROLES[k].includes(m.role))
    if (!panel) continue
    const key = `${m.workspace_id}:${panel}`
    if (seen.has(key)) continue
    seen.add(key)
    pairs.push({ workspaceId: m.workspace_id, panel })
  }
  if (pairs.length < 2) return []

  const { data } = await supabase
    .from('workspaces')
    .select('id, name, is_library')
    .in('id', [...new Set(pairs.map(p => p.workspaceId))])
  const byId = new Map(
    ((data ?? []) as { id: string; name: string; is_library: boolean | null }[]).map(w => [w.id, w])
  )
  // Kütüphane seçicide görünmez (069) — yalnız şu an oradaysa.
  return pairs
    .filter(p => byId.has(p.workspaceId))
    .filter(p => !byId.get(p.workspaceId)!.is_library || p.workspaceId === activeWorkspaceId)
    .map(p => ({ ...p, name: byId.get(p.workspaceId)!.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr') || a.panel.localeCompare(b.panel))
}

export const getTeacherContext = cache(async function getTeacherContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profil ve TÜM öğretmen üyelikleri tek sorguda. Önceden yalnız
  // default_workspace_id'nin üyeliği çekiliyordu; artık kullanıcı
  // workspace değiştirebildiği için hepsi gerekiyor (Faz 3).
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id, full_name, email, default_workspace_id, is_platform_admin, workspace_members(role, workspace_id, status)'
    )
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // Askıya alınmış kiracının üyelikleri RLS tarafından zaten süzülür (051):
  // workspace_members okuması has_workspace_role'den geçiyor.
  const memberships: WorkspaceMembership[] = (
    (profile.workspace_members ?? []) as unknown as {
      role: string
      workspace_id: string
      status: string
    }[]
  )
    .filter(m => m.status === 'active' && ['owner', 'teacher'].includes(m.role))
    .map(m => ({ workspaceId: m.workspace_id, role: m.role }))

  // ÇÖZÜMLEME GEREKÇESİYLE BİRLİKTE (P0 / 07 Eylül 2026).
  //
  // Öğretmen hiçbir şey silmeden eski veri setini görebiliyordu. Bunun
  // tek sessiz yolu, çerezdeki tercihin doğrulanamayıp varsayılana
  // düşülmesi: bağlam bambaşka bir çalışma alanına kayar, ekran hatasız
  // çizilir ve geriye hiçbir iz kalmaz. Karar doğru, görünürlük yoktu.
  const resolution = resolveActiveWorkspace(
    memberships,
    await readActiveWorkspaceCookie(),
    profile.default_workspace_id
  )
  const workspaceId = resolution.workspaceId

  if (resolution.rejectedPreference) {
    console.error(
      '[workspace] çerezdeki aktif alan tercihi doğrulanamadı, düşüldü:',
      JSON.stringify({
        profileId: profile.id,
        rejectedPreference: resolution.rejectedPreference,
        fellBackTo: workspaceId,
        source: resolution.source,
        membershipCount: memberships.length,
      })
    )
  }

  // Üyelik çözülemedi. İki farklı durum olabilir ve ayırt edilmeli:
  // gerçekten öğretmen değil (→ /login) ya da çalışma alanı askıya
  // alınmış/denemesi dolmuş (→ /erisim). İkincisinde kullanıcı sebepsiz
  // giriş ekranına düşerse ne olduğunu anlayamaz ve doğru şifreyle
  // tekrar tekrar dener.
  if (!workspaceId) redirect(await blockedRedirectTarget(supabase))

  // ============================================================
  // TEK `workspaces` SORGUSU — İKİSİ BİRLEŞTİRİLDİ (R8 · APP-01)
  //
  // Burada iki ayrı sorgu vardı: biri aktif alanı (`id = workspaceId`),
  // diğeri seçici listesini (`id IN (üyelikler)`) çekiyordu. İkincisi
  // BİRİNCİSİNİ ZATEN KAPSIYOR — aktif alan, tanımı gereği üyeliklerden
  // biri (`resolveActiveWorkspace` onu o listeden seçiyor).
  //
  // ÖLÇÜLDÜ — KAZANÇ PERFORMANS DEĞİL, SADELİK.
  //
  // Bu değişiklik bir performans iyileştirmesi olarak yapıldı ve ölçüm
  // bunu DESTEKLEMEDİ. Tek /teacher yüklemesi, öncesi → sonrası:
  //
  //   workspaces          196 → 194
  //   profiles            179 → 177
  //   workspace_licenses  172 → 171
  //   workspace_members   149 → 148
  //
  // Toplam ~6 tarama; %1'in altında. Sorgular zaten `Promise.all` içinde
  // paralel olduğu için gecikme kazancı da yok.
  //
  // Değişiklik yine de tutuldu, ama gerekçesi başka: SİLİNEN SORGU
  // MÜKERRERDİ — aynı tabloyu aynı istekte iki kez sormanın sebebi yoktu.
  //
  // ASIL DARBOĞAZI DA BU ÖLÇÜM GÖSTERDİ: sayfanın taramasının ~%86'sı
  // yetki/kiracı çözümlemesi (`students` yalnız 7 tarama alıyor).
  // Kaldıraç sayfa başına SORGU SAYISI — bir sorguyu silmek değil,
  // yedisini üçe indirmek. O ayrı bir ölçüm turu istiyor.
  //
  // Davranış korunuyor: aktif alan listeden seçiliyor ve bulunamazsa
  // aşağıdaki `if (!workspace)` dalı aynı şekilde çalışıyor.
  // ============================================================
  const [{ data: allWorkspaces }, { data: activeTerm }, { data: usageRows, error: usageError }] =
    await Promise.all([
      // Seçici için: yalnız BİR workspace varsa arayüzde hiç gösterilmez.
      supabase
        .from('workspaces')
        .select('id, name, is_library')
        .in('id', [...new Set(memberships.map(m => m.workspaceId))])
        .order('name'),
      supabase
        .from('academic_terms')
        .select('id, name, status')
        .eq('workspace_id', workspaceId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Kota ve deneme durumu (052). Kolon yerine RPC: student_limit'i
      // okumak için workspaces'a ek bir politika açmak gerekmesin.
      supabase.rpc('get_workspace_usage', { p_workspace_id: workspaceId }),
    ])

  // Aktif alan, seçici listesinin içinden. RLS onu süzdüyse (askı,
  // deneme dolumu) burada da bulunamaz ve aşağıdaki dal devreye girer —
  // ayrı sorgudaki `.single()` ile aynı sonuç.
  const workspace =
    ((allWorkspaces ?? []) as { id: string; name: string }[]).find(w => w.id === workspaceId) ??
    null

  // Workspace okunamıyorsa askı ya da deneme dolumu ihtimali var.
  if (!workspace) redirect(await blockedRedirectTarget(supabase))

  // KOTA/LİSANS SORGUSU SESSİZ DÜŞMESİN.
  //
  // Bu RPC hata verdiğinde `usage` null oluyor ve üst bardaki süre rozeti
  // hiç çizilmiyordu — kullanıcı için "sayaç yok", geliştirici için hiçbir
  // iz yok. Rozetin neden görünmediği ancak burada söylenirse anlaşılır.
  if (usageError) {
    console.error(
      '[workspace] get_workspace_usage okunamadı:',
      JSON.stringify({ workspaceId, message: usageError.message })
    )
  }

  // KÜTÜPHANE ALANI SEÇİCİDE GÖRÜNMEZ (069).
  //
  // Kütüphane bir kiracı değil, platform altyapısı. Koçun alan listesinde
  // durması, hiç girmemesi gereken bir yeri ona bir seçenek gibi gösterir.
  // Yönetici oraya /admin/kutuphane'deki açık düğmeyle geçer.
  //
  // İSTİSNA — ŞU AN ORADAYSA GÖRÜNÜR: aksi hâlde kütüphaneye geçen
  // yönetici tek alanlı görünür, seçici hiç çizilmez ve geri dönemez.
  const workspaceOptions = ((allWorkspaces ?? []) as {
    id: string
    name: string
    is_library: boolean | null
  }[]).filter(w => !w.is_library || w.id === workspaceId)

  return {
    supabase,
    profile: profile as unknown as {
      id: string
      full_name: string
      email: string | null
      default_workspace_id: string
      /** Platform yöneticisi (060). Yalnız veritabanından atanır. */
      is_platform_admin?: boolean
    },
    workspace,
    workspaceId,
    role: memberships.find(m => m.workspaceId === workspaceId)?.role ?? 'teacher',
    activeTerm: activeTerm as { id: string; name: string; status: string } | null,
    /** Kullanıcının öğretmen olduğu tüm çalışma alanları. */
    workspaces: workspaceOptions.map(w => ({ id: w.id, name: w.name })),
    /** Tüm paneller (B18): öğretmen + başka alanlardaki öğrenci/veli. */
    panels: await loadPanelOptions(supabase, activeMembers(profile.workspace_members), workspaceId),
    /** Lisans, kota ve deneme durumu (058). RPC satır dizisi döndürür. */
    usage: (() => {
      const row = ((usageRows ?? []) as {
        plan: string
        student_limit: number | null
        active_students: number
        trial_ends_at: string | null
        license_starts_at: string | null
        license_ends_at: string | null
        license_status: string | null
      }[])[0]
      if (!row) return null
      return {
        plan: row.plan,
        studentLimit: row.student_limit,
        activeStudents: row.active_students,
        trialEndsAt: row.trial_ends_at,
        licenseStartsAt: row.license_starts_at,
        licenseEndsAt: row.license_ends_at,
        licenseStatus: row.license_status,
      } satisfies WorkspaceUsage
    })(),
  }
})

export const getStudentContext = cache(async function getStudentContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id, workspace_members(role, workspace_id, status)')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // AKTİF ALAN ÖĞRENCİ ÜYELİKLERİ ARASINDAN (B18) — öğretmen bağlamıyla
  // aynı kural: çerez → varsayılan → ilk üyelik.
  const members = activeMembers(profile.workspace_members)
  const workspaceId = resolveActiveWorkspace(
    members.filter(m => m.role === 'student').map(m => ({ workspaceId: m.workspace_id, role: m.role })),
    await readActiveWorkspaceCookie(),
    profile.default_workspace_id
  ).workspaceId
  if (!workspaceId) redirect(await blockedRedirectTarget(supabase))

  const [{ data: studentRecord }, panels, { data: activeTerm }] = await Promise.all([
    supabase
      .from('students')
      .select('id, full_name, workspace_id, exam_type')
      .eq('profile_id', profile.id)
      .eq('workspace_id', workspaceId)
      .single(),
    loadPanelOptions(supabase, members, workspaceId),
    supabase
      .from('academic_terms')
      .select('id, name')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  // Öğrenci kaydı görünmüyorsa: ya gerçekten öğrenci değil ya da
  // öğretmeninin çalışma alanı kapandı (deneme dolumu öğrenciyi de
  // kilitliyor). İkisi ayırt edilmeli — öğrencinin ödemeyle ilgisi yok,
  // en azından ne olduğunu görmeli.
  if (!studentRecord) redirect(await blockedRedirectTarget(supabase))

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    student: studentRecord,
    workspaceId,
    activeTerm: activeTerm as { id: string; name: string } | null,
    /** Tüm paneller (B18) — seçici için; tek panelde boş. */
    panels,
  }
})

export const getParentContext = cache(async function getParentContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, default_workspace_id, workspace_members(role, workspace_id, status)')
    .eq('auth_user_id', user.id)
    .single()

  if (!profile) redirect('/login')

  // AKTİF ALAN VELİ ÜYELİKLERİ ARASINDAN (B18). Önceden yalnız varsayılan
  // alan okunuyordu: başka alanda öğretmen olan kişi veli davetini kabul
  // edince veli paneli onun ÖĞRETMEN alanında çocuk arıyor, boş kalıyordu.
  const members = activeMembers(profile.workspace_members)
  const workspaceId = resolveActiveWorkspace(
    members.filter(m => m.role === 'parent').map(m => ({ workspaceId: m.workspace_id, role: m.role })),
    await readActiveWorkspaceCookie(),
    profile.default_workspace_id
  ).workspaceId
  if (!workspaceId) redirect(await blockedRedirectTarget(supabase))

  const [{ data: linkedStudents }, panels] = await Promise.all([
    supabase
      .from('parent_student_links')
      .select('id, student_id, students(id, full_name, exam_type, grade_level)')
      .eq('parent_profile_id', profile.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active'),
    loadPanelOptions(supabase, members, workspaceId),
  ])

  // Bağlı öğrencisi olmayan veliyi /login'e YÖNLENDİRME: middleware girişli
  // kullanıcıyı /'a, / da rolü veli görüp /parent'a geri gönderdiği için bu
  // sonsuz döngüye ve beyaz ekrana yol açıyordu. Bunun yerine boş liste
  // döndürülür; /parent sayfası "Bağlı öğrenci yok" boş durumunu gösterir.

  return {
    supabase,
    profile: profile as { id: string; full_name: string; email: string | null; default_workspace_id: string },
    workspaceId,
    /** Tüm paneller (B18) — seçici için; tek panelde boş. */
    panels,
    linkedStudents: (linkedStudents ?? []) as unknown as Array<{
      id: string
      student_id: string
      students: { id: string; full_name: string; exam_type: string | null; grade_level: string | null }
    }>,
  }
})

/**
 * Kütüphane çalışma alanının id'si (069).
 *
 * Kütüphane, `is_library` bayraklı TEK bir çalışma alanıdır ve kitapları
 * sıradan `books` satırlarıdır. Bu fonksiyon yalnız o alanın id'sini
 * çözer; okuma iznini RLS verir (koç, herhangi bir alanda owner/teacher
 * ise yayındaki kütüphane kitaplarını görebilir).
 *
 * Alan henüz açılmamışsa null döner — arayüz "kütüphane hazırlanıyor"
 * boş durumunu gösterir, çökmez.
 */
export const getLibraryWorkspaceId = cache(async function getLibraryWorkspaceId() {
  const supabase = await createClient()
  // RPC, tablo sorgusu DEĞİL: koç kütüphane alanının üyesi olmadığı için
  // workspaces satırını RLS ile okuyamaz.
  const { data } = await supabase.rpc('library_workspace_id')
  return (data as string | null) ?? null
})
