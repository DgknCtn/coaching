import { Suspense } from 'react'
import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { licenseBadgeProps } from '@/lib/plans'
import { StudentTabs } from './student-tabs'
import { StudentHeaderBadges } from './student-header-badges'

/**
 * ÖĞRENCİ ÇALIŞMA MASASI (067).
 *
 * ============================================================
 * NEDEN VAR
 *
 * Müfredat Akışı, Kaynak Planı, Haftalık Plan, Koruma Havuzu ve Rapor —
 * beş ekran da AYNI öğrencinin üzerinde çalışıyor ama beş ayrı sayfa
 * gibi davranıyordu: her birine sol menüden girilip her seferinde
 * öğrenci seçiliyordu. Oysa bir Zoom görüşmesinde öğretmen bu beşi arka
 * arkaya dolaşıyor.
 *
 * Bu layout, beşini tek bir ekranın sekmeleri hâline getirir. Rotalar
 * DEĞİŞMEDİ: her sekme hâlâ gerçek bir adres (paylaşılabilir, yer
 * imlenebilir, geri tuşuyla gezilebilir) ve verisini kendi server
 * component'inde çekiyor. Değişen tek şey, öğrenci başlığının ve sekme
 * şeridinin gezinme sırasında YERİNDE KALMASI.
 *
 * NEDEN CLIENT STATE'Lİ BİR SEKME BİLEŞENİ DEĞİL: sekmeler sunucuda veri
 * çekimini belirliyor. İçeriği client state'te tutmak, beş ekranın
 * verisini de peşinen yüklemek ya da adres çubuğunu ekrandan koparmak
 * demekti.
 * ============================================================
 *
 * EK SORGU YOK: getTeacherContext React.cache ile sarılı, üstteki
 * teacher layout'u ve alttaki sayfa zaten aynı istekte çağırıyor.
 */
export default async function StudentWorkbenchLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId, usage } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name, grade_level, exam_type, status')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  // Başka bir çalışma alanının öğrencisi RLS tarafından zaten süzülür;
  // burada 404 vermek, boş bir başlıkla açılan sekmelerden iyi.
  if (!student) notFound()

  const meta = [student.grade_level, student.exam_type].filter(Boolean).join(' · ')

  return (
    <div className="flex min-h-full flex-col">
      {/* Başlık ve sekmeler SAYFA GÖVDESİNİN DIŞINDA: alttaki sayfa
          değişirken bu şerit yeniden çizilmez, "sayfa yeniden yükleniyor"
          hissi ortadan kalkar. */}
      {/* PRINT: Rapor ekranı yazdırılıyor. Öğrenci adı KAĞITTA KALMALI —
          artık sayfa başlığında tekrarlanmadığı için tek kaynağı bu şerit.
          Sekmeler ise kağıtta anlamsız; yalnız onlar gizleniyor. */}
      <div className="border-b bg-card/50 print:border-0 print:bg-transparent print:px-0">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 pb-3 pt-6 md:px-8">
          <h1 className="text-lg font-semibold tracking-tight">{student.full_name}</h1>
          {meta && <p className="text-sm text-muted-foreground">{meta}</p>}
          {student.status === 'archived' && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Arşivlendi
            </span>
          )}
          {/* R7/02: global üst şerit bu rotalarda çizilmiyor; rozetler
              öğrenci adının hizasına geçti. */}
          <StudentHeaderBadges
            licenseHref="/teacher/ayarlar"
            {...licenseBadgeProps(usage ?? null)}
          />
        </div>
        <div className="print:hidden">
          {/* Suspense: StudentTabs useSearchParams okuyor (aktif sekme
              Genel Bakış rotasında ?sekme= ile belirleniyor) ve Next bunu
              bir sınır olmadan prerender etmeyi reddediyor. Yedek olarak
              şeridin yüksekliği kadar boşluk: sekmeler bir an sonra
              geldiğinde sayfa zıplamasın. */}
          <Suspense fallback={<div className="h-[41px] border-b" />}>
            <StudentTabs studentId={studentId} />
          </Suspense>
        </div>
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
