import Link from 'next/link'
import {
  deriveBatchState,
  batchStateLabel,
  counterLabel,
  splitByFlowOwnership,
  type HomeworkBatchState,
} from '@/lib/homework-status'
import { unitLabel } from '@/lib/unit-labels'
import { BookOpen, ClipboardList } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { MetricRow } from '@/components/shared/metric-row'
import { getStudentContext } from '@/lib/workspace'
import { HomeworkList } from './homework-list'
import { PastDebtBlock } from './past-debt-block'
import { CheckInCard } from './check-in-card'
import { PageHeader } from '@/components/shared/page-header'
import { Section } from '@/components/shared/section'
import { AlertBanner } from '@/components/shared/alert-banner'
import { ProgressBar } from '@/components/shared/progress-bar'

export const dynamic = 'force-dynamic'

export default async function StudentPage() {
  const { supabase, student, workspaceId } = await getStudentContext()

  // Ödevler, kitap ilerlemesi ve bildirim materyalizasyonu birbirinden
  // bağımsız — tek dalgada çalışırlar.
  const [
    { data: batches },
    { data: bookProgress },
    ,
    { data: weekly },
    { data: activeFlow },
  ] = await Promise.all([
    supabase
      .from('homework_batches')
      .select(`
        id, title, description, due_date, status, weekly_flow_id,
        homework_items(
          id, status, completed_at, teacher_note, rejected_at, submitted_at, book_id,
          books(title, subject, tracking_mode),
          book_sections(id, title, order_index),
          book_tests(title, order_index, page_start)
        )
      `)
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('due_date', { ascending: true }),
    supabase
      .from('student_book_progress_view')
      .select('*')
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId),
    // Sonucu okunmuyor ama aşağıdaki sorgudan ÖNCE bitmeli (yazdığı satırı
    // o okuyor) — bu yüzden bu dalganın içinde, sonrakinden önce.
    supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId }),
    // Haftalık özet: veli panelinin kullandığı görünümün aynısı.
    supabase
      .from('student_weekly_homework_summary_view')
      .select('*')
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    // AKTİF HAFTALIK AKIŞ (R7-06.02). Öğrenci kendi akışını okuyabilir
    // (077 · weekly_flows_read_self); yazma yok, haftayı öğretmen kurar.
    // Bu satır ekranın "hangi iş bu haftanın işi" sorusunu yanıtlar.
    supabase
      .from('weekly_flows')
      .select('id, due_at')
      .eq('student_id', student.id)
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .maybeSingle(),
  ])

  // Açık durum bildirimi (varsa) — süresi gelen tek kayıt.
  const { data: openCheckIn } = await supabase
    .from('student_check_ins')
    .select('id, due_at')
    .eq('student_id', student.id)
    .eq('status', 'pending')
    .lte('due_at', new Date().toISOString())
    .order('due_at', { ascending: true })
    .limit(1)
    .maybeSingle()


  // DURUM TARİH FİLTRESİNDEN DEĞİL, TEK KAYNAKTAN (068 · rapor bulgusu 4).
  //
  // Önceden iki liste vardı: "tarihi geçmiş VE içinde pending kalem
  // olanlar" ve "tarihi geçmemiş olanlar". Vadesi geçmiş ama bütün
  // kalemleri onaya gönderilmiş — ya da öğretmenin İADE ETTİĞİ — bir
  // grup ikisine de girmiyordu ve ekrandan tamamen kayboluyordu. Başka
  // ödev yoksa öğrenciye "Tüm ödevler tamamlandı" bile deniyordu.
  //
  // Artık her grup deriveBatchState ile tam olarak BİR kovaya düşüyor.
  const allBatches = batches ?? []

  // ============================================================
  // GÜNCEL HAFTA EN ÜSTTE (R7-06.02)
  // ============================================================
  //
  // ÖNCEDEN: ekran ödevleri YALNIZ duruma göre diziyordu ve "geciken"
  // her zaman en üstteydi. Doğa testinde sonuç şu oldu: öğrenci ekrana
  // girince önce 5 eski gecikmiş ödev gördü, aktif haftanın Mini Test
  // Ödevi aşağıda "Yapılacak" bölümüne gömüldü. Gerçek bir öğrencide
  // geçmiş borç arttıkça güncel haftanın işi tamamen görünmez hale
  // gelir.
  //
  // PEDAGOJİK İLKE (belge): *"Güncel hafta öğrencinin ana çalışma
  // alanıdır; geçmiş borç öğrenciyi yıl boyu 'borçlu' tutmamalı."*
  //
  // Geçmiş borç SİLİNMİYOR, yalnız ikinci plana alınıyor: kapalı bir
  // blokta, tek satırlık özet altında. Ayrım kararı
  // lib/homework-status.ts'te çünkü veli paneli ve rapor da aynı
  // soruyu soracak.
  const split = splitByFlowOwnership(allBatches, activeFlow?.id ?? null)

  // Sıra ACİLİYETE göre: önce geciken, sonra öğretmenin geri gönderdiği,
  // sonra yapılacaklar. Onay bekleyen ve tamamlanan altta — öğrencinin
  // yapacağı bir şey yok ama GÖRÜNÜR olmaları şart, "gönderdim mi?"
  // sorusunun cevabı orada.
  const ORDER: HomeworkBatchState[] = [
    'overdue',
    'returned',
    'assigned',
    'pending_approval',
    'completed',
  ]

  /** Bir ödev kümesini duruma göre kovalar ve ORDER sırasına dizer. */
  function sectionsOf(list: typeof allBatches) {
    const buckets = new Map<HomeworkBatchState, typeof allBatches>()
    for (const batch of list) {
      const state = deriveBatchState({
        dueDate: batch.due_date,
        items: (batch.homework_items ?? []) as { status: string; rejected_at: string | null }[],
      })
      const bucket = buckets.get(state)
      if (bucket) bucket.push(batch)
      else buckets.set(state, [batch])
    }
    return {
      buckets,
      sections: ORDER.map(state => ({ state, items: buckets.get(state) ?? [] })).filter(
        section => section.items.length > 0
      ),
    }
  }

  const current = sectionsOf(split.currentWeek)
  const past = sectionsOf(split.pastDebt)

  const openOf = (buckets: Map<HomeworkBatchState, typeof allBatches>) =>
    (buckets.get('overdue')?.length ?? 0) +
    (buckets.get('returned')?.length ?? 0) +
    (buckets.get('assigned')?.length ?? 0)

  // "Bu hafta geciken" ile "geçmiş borç" AYRI SAYILIR (R7-06.11).
  const overdueThisWeek = current.buckets.get('overdue')?.length ?? 0
  const pastOverdueCount = past.buckets.get('overdue')?.length ?? 0
  const pastOpenCount = openOf(past.buckets)
  const openCount = openOf(current.buckets) + pastOpenCount

  return (
    <div className="mx-auto max-w-2xl space-y-8 p-6 md:p-8">
      <PageHeader
        title="Ödevlerim"
        subtitle={
          // KAPSAM YAZILI (R7-06.11): önceden yalnız "5 gecikmiş"
          // yazıyordu ve aynı ekranda "Geciken 0" sayacıyla çelişik
          // görünüyordu. Hangi 5, hangi 0 olduğu artık söylenmiş.
          overdueThisWeek + pastOverdueCount > 0
            ? [
                overdueThisWeek > 0 ? `Bu hafta ${overdueThisWeek} gecikmiş` : null,
                pastOverdueCount > 0 ? `geçmişten ${pastOverdueCount} gecikmiş` : null,
                `${openCount} açık ödev`,
              ]
                .filter(Boolean)
                .join(' · ')
            : openCount > 0
              ? `${openCount} açık ödev`
              : undefined
        }
      />

      {openCheckIn && <CheckInCard checkInId={openCheckIn.id} />}

      {/* Haftalık özet. Bu görünüm bugüne kadar YALNIZ veli panelindeydi;
          öğrenci kendi haftasının toplamını göremiyordu. */}
      {weekly && (
        <MetricRow
          className="grid-cols-2 md:grid-cols-5"
          metrics={[
            { label: 'Bu hafta verilen', value: Number(weekly.assigned_tests ?? 0) },
            { label: counterLabel('completed', 'student'), value: Number(weekly.completed_tests ?? 0) },
            {
              label: counterLabel('pendingApproval', 'student'),
              value: Number(weekly.pending_approval_tests ?? 0),
            },
            // ETİKET KAPSAMINI SÖYLÜYOR (R7-06.11). Bu görünüm TAKVİM
            // HAFTASINI sayıyor; "Geciken 0" derken geçmişten 5 gecikmiş
            // ödev varsa kullanıcı çelişki görüyordu. İkisi de doğruydu,
            // biri neyin sıfırı olduğunu söylemiyordu.
            {
              label: counterLabel('overdueThisWeek', 'student'),
              value: Number(weekly.overdue_tests ?? 0),
            },
            { label: counterLabel('pastDebt', 'student'), value: pastOpenCount },
          ]}
        />
      )}

      {overdueThisWeek > 0 && (
        <AlertBanner
          tone="warning"
          title={`Bu hafta ${overdueThisWeek} gecikmiş ödev`}
          description="Bunları en kısa sürede tamamlamayı unutma."
        />
      )}

      {/* ============================================================
          GÜNCEL HAFTA — EKRANIN İLK ÇALIŞMA ALANI (R7-06.02)
          ============================================================ */}
      {current.sections.length > 0 && (
        <Section title="Bu haftaki işim">
          <div className="space-y-6">
            {current.sections.map(section => (
              <div key={section.state} className="space-y-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {batchStateLabel(section.state, 'student')}
                </p>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <HomeworkList batches={section.items as any} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Aktif hafta yoksa güncel iş de yoktur: Haftalık Akış manuel
          açılıyor (bilinçli tasarım) ve açılmamışken ödevleri "bu hafta"
          saymak olmayan bir haftayı varmış gibi göstermek olurdu. Bu
          durumda bütün açık ödevler aşağıdaki blokta yaşar. */}
      {past.sections.length > 0 && (
        <PastDebtBlock
          openCount={pastOpenCount}
          overdueCount={pastOverdueCount}
          hasCurrentWeek={current.sections.length > 0}
          sections={past.sections}
        />
      )}

      {/* HİÇ ÖDEV OLMAMASI TAMAMLANMA DEĞİLDİR (rapor bulgusu 4).
          Önceden iki durum aynı başarı şeridini gösteriyordu: henüz
          hiç ödev almamış öğrenciye de "Harika iş çıkardın" deniyordu. */}
      {allBatches.length === 0 ? (
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={ClipboardList}
            title="Henüz ödevin yok"
            description="Öğretmenin sana ödev verdiğinde burada görünecek."
          />
        </div>
      ) : openCount === 0 ? (
        <AlertBanner
          tone="success"
          title="Bekleyen ödevin yok"
          description="Yapılacak bir şey kalmadı — güzel gidiyor."
        />
      ) : null}

      {/* ÖNCEDEN: hiç kitap atanmamışsa bu blok tamamen gizleniyor ve ekran
          sessizce boş kalıyordu. Boş durum artık açıkça söyleniyor. */}
      {(bookProgress?.length ?? 0) === 0 ? (
        <Section title="Kitap ilerlemem">
          <div className="rounded-lg border bg-card">
            <EmptyState
              icon={BookOpen}
              title="Henüz kitabın yok"
              description="Öğretmenin sana bir kitap atadığında ilerlemen burada görünecek."
            />
          </div>
        </Section>
      ) : (
        <Section title="Kitap ilerlemem">
          <div className="space-y-3">
            {bookProgress!.map(p => (
              <Link
                key={p.student_book_assignment_id}
                href={`/student/books/${p.book_id}`}
                className="block rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20"
              >
                <div className="mb-3 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{p.book_title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{p.subject}</p>
                  </div>
                  <span className="shrink-0 text-2xl font-semibold tabular-nums tracking-tight">
                    {p.completion_percentage}%
                  </span>
                </div>
                <ProgressBar
                  value={Number(p.completion_percentage)}
                  label={`${p.book_title} ilerlemesi`}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {p.completed_tests} / {p.total_tests} {unitLabel(p.tracking_mode)} tamamlandı ·{' '}
                  {p.remaining_tests} kaldı
                </p>
                <p className="mt-1 text-xs text-primary">Kitap haritasını gör →</p>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
