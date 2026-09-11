import type { Metadata } from 'next'
import { AppSidebar } from '@/components/shared/app-sidebar'
import { TopBar } from '@/components/shared/top-bar'
import { licenseBadgeProps } from '@/lib/plans'
import { BRAND } from '@/lib/brand'
import { getSidebarCollapsed } from '@/lib/sidebar-prefs'
import { getTeacherContext } from '@/lib/workspace'

/**
 * PANELLER ARAMA MOTORUNA KAPALI.
 *
 * Bu sayfalar oturum arkasında ve URL'leri öğrenci id'si taşıyor;
 * dizine girmeleri ne mümkün ne de istenir. robots.txt taramayı
 * engelliyor, bu etiket ise dış bir bağlantıdan keşfedilen adresin
 * dizine EKLENMESİNİ engelliyor — ikisi farklı şeydir ve ikisi de
 * gerekli.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
}


export default async function TeacherLayout({ children }: { children: React.ReactNode }) {
  const { supabase, workspaceId, profile, activeTerm, workspaces, usage } =
    await getTeacherContext()

  // Sidebar'daki aktif öğrenci seçicisi için hafif liste. /teacher/students
  // ile aynı view; seçici yalnız öğrenci bağlamındaki rotalarda gösterilir.
  const { data: studentRows } = await supabase
    .from('teacher_student_overview_view')
    .select('student_id, student_full_name, grade_level, exam_type')
    .eq('workspace_id', workspaceId)
    .order('student_full_name')
    .limit(500)

  const collapsed = await getSidebarCollapsed()

  // ÜST BARDAKİ SÜRE ROZETİ İÇİN.
  //
  // Hesap lib/plans.ts'te (licenseBadgeProps): aynı rozet öğrenci
  // çalışma masasında da başlık hizasında çiziliyor ve iki layout'ta
  // kopyalansaydı biri güncellenip diğeri unutulduğunda aynı kullanıcı
  // iki ekranda iki farklı plan durumu görürdü.
  const { licenseKind, licenseEndsAt, licenseFallbackLabel } = licenseBadgeProps(usage ?? null)

  const students = (studentRows ?? []).map((s) => ({
    id: s.student_id as string,
    fullName: (s.student_full_name as string | null) ?? '—',
    gradeLevel: (s.grade_level as string | null) ?? null,
    examType: (s.exam_type as string | null) ?? null,
  }))

  return (
    <div className="flex min-h-screen">
      <AppSidebar
        // Üstte MARKA duruyor, çalışma alanı adı değil. Varsayılan
        // workspace adı "{ad} Workspace" olduğundan (058) aynı isim
        // sidebar'ın üstünde ve altında iki kez görünüyordu. Çalışma
        // alanı adı zaten hemen altındaki seçicide yazıyor.
        title={BRAND.name}
        role="teacher"
        roleLabel="Öğretmen"
        userName={profile.full_name}
        panel={activeTerm ? { label: 'Aktif dönem', items: [activeTerm.name] } : undefined}
        students={students}
        workspaces={workspaces}
        activeWorkspaceId={workspaceId}
        defaultCollapsed={collapsed}
        // /admin hiçbir yerden bağlantılı değildi; adresi elle yazmak
        // gerekiyordu. Bayrak profil satırında zaten okunuyor, ek sorgu yok.
        isPlatformAdmin={profile.is_platform_admin === true}
      />
      <main className="flex min-w-0 flex-1 flex-col overflow-auto pt-14 md:pt-0">
        <TopBar
          licenseEndsAt={licenseEndsAt}
          licenseKind={licenseKind}
          licenseFallbackLabel={licenseFallbackLabel}
          licenseHref="/teacher/ayarlar"
        />
        <div className="flex-1">{children}</div>
      </main>
    </div>
  )
}
