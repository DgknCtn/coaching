import { Waypoints } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { PageHeader } from '@/components/shared/page-header'
import { getStudentContext } from '@/lib/workspace'
import {
  calculateFlowPace,
  dailyDelivery,
  distributionState,
  dueLabel,
  isLateAdded,
} from '@/lib/weekly-flow'
import { compareHomeworkItems } from '@/lib/homework-status'
import { HaftamClient, type HaftamView, type HaftamWork } from './haftam-client'

export const dynamic = 'force-dynamic'

// HAFTAM — öğrencinin haftalık çalışma alanı (R7-06.03).
//
// ============================================================
// NEDEN BU EKRAN VAR
//
// Öğrenci menüsündeki "Akışım" haftalık akış DEĞİLDİ; akademik/konu
// takvimiydi. Öğretmen tarafında Haftalık Akış ekranı aylardır
// çalışıyordu ama öğrencinin karşılığı boştu: aktif haftayı, resmi son
// teslimi, günlük dağılımı ve kendi planını yönetebileceği bir yer yoktu.
//
// ============================================================
// HESAPLARIN HİÇBİRİ BURADA YAZILMIYOR
//
// Tempo, dağıtım cümlesi, günlük dağılım ve son teslim metni
// lib/weekly-flow.ts'ten geliyor — öğretmen ekranının kullandığı aynı
// fonksiyonlar. İkinci bir hesap yazılsaydı öğrenci kendi ekranında bir
// tempo, öğretmen kendi ekranında başka bir tempo görürdü ve hangisinin
// doğru olduğunu bilmenin yolu olmazdı.
//
// ============================================================
// ÖĞRENCİNİN PLANI RESMİ DEADLINE DEĞİL
//
// Ekran iki zamanı AYRI gösterir: akışın tek resmi kapanışı
// (`weekly_flows.due_at`) ve öğrencinin kendi günlük dağıtımı
// (`homework_items.planned_for_date`). İkincisi bir söz değil bir
// niyettir; hiçbir gecikme hesabına girmez.

export default async function HaftamPage() {
  const { supabase, student, workspaceId } = await getStudentContext()

  const { data: flow } = await supabase
    .from('weekly_flows')
    .select('id, starts_at, due_at, due_source')
    .eq('student_id', student.id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'active')
    .maybeSingle()

  if (!flow) {
    return (
      <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
        <PageHeader
          title="Haftam"
          subtitle="Bu haftanın yükü, son teslimi ve kendi günlük planın."
        />
        {/* HAFTA MANUEL AÇILIR ve bu bilinçli bir tasarım (bu turda
            doğrulandı): görüşmenin takvimde olması yeni çalışma
            haftasının başladığı anlamına gelmiyor. Bu yüzden boş durum
            bir hata değil, normal bir hâl — metin de öyle. */}
        <div className="rounded-lg border bg-card">
          <EmptyState
            icon={Waypoints}
            title="Şu an açık bir çalışma haftan yok"
            description="Öğretmenin yeni bir çalışma haftası açtığında bu haftanın yükü ve son teslimi burada görünecek."
          />
        </div>
      </div>
    )
  }

  const startsAt = new Date(flow.starts_at as string)
  const dueAt = new Date(flow.due_at as string)
  const now = new Date()

  // Haftanın yükü: yalnız BU akışa bağlı, aktif partilerin kalemleri.
  // `hb.status='active'` süzgeci, aktif yükten çıkarılmış ödevin
  // (R7-06.01) haftanın yükünde görünmesini engelliyor —
  // student_active_flow_load_view da aynı süzgeci kullanıyor.
  const { data: items } = await supabase
    .from('homework_items')
    .select(
      `id, status, submitted_at, rejected_at, planned_for_date,
       homework_batches!inner(id, title, due_date, created_at, weekly_flow_id, status),
       books(id, title, tracking_mode),
       book_sections(id, title, order_index),
       book_tests(title, order_index, page_start)`
    )
    .eq('workspace_id', workspaceId)
    .eq('homework_batches.weekly_flow_id', flow.id)
    .eq('homework_batches.status', 'active')
    .neq('status', 'cancelled')

  // Supabase gömülü ilişkileri dizi olarak tipleyebiliyor; tek satırlık
  // ilişkiler BİR KEZ normalize ediliyor (öğretmen ekranının deseni).
  const one = <T,>(v: T | T[] | null | undefined): T | null =>
    Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

  const rows = (items ?? []).map(r => {
    const batch = one(
      r.homework_batches as unknown as { id: string; title: string | null; created_at: string }
    )
    const book = one(r.books as unknown as { id: string; title: string })
    const section = one(
      r.book_sections as unknown as { id: string; title: string; order_index: number | null }
    )
    const test = one(
      r.book_tests as unknown as {
        title: string
        order_index: number | null
        page_start: number | null
      }
    )

    return {
      id: r.id as string,
      status: r.status as string,
      // TESLİM = ÖĞRENCİNİN GÖNDERİMİ, öğretmenin onayı DEĞİL (kabul #8
      // ve 081). `submitted_at` onayda korunur, iadede NULL'lanır: onay
      // ilerlemeyi geriye düşürmez, iade edilen iş yeniden gönderilene
      // kadar sayılmaz.
      submittedAt: (r.submitted_at as string | null) ?? null,
      rejectedAt: (r.rejected_at as string | null) ?? null,
      plannedForDate: (r.planned_for_date as string | null) ?? null,
      publishedAt: batch ? new Date(batch.created_at) : null,
      bookTitle: book?.title ?? 'Kaynaksız',
      sectionTitle: section?.title ?? '',
      testTitle: test?.title ?? '',
      sectionOrderIndex: section?.order_index ?? null,
      unitOrderIndex: test?.order_index ?? test?.page_start ?? null,
    }
  })

  const total = rows.length
  const delivered = rows.filter(r => r.submittedAt !== null).length

  // Tempo yayın anından başlar (§4), akışın açılışından değil: ödev
  // Pazartesi görünür olduysa öğrenci Pazar sabahından beri gecikmiş
  // sayılmaz.
  const firstPublishedAt =
    rows
      .map(r => r.publishedAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null

  const pace = calculateFlowPace({
    totalUnits: total,
    deliveredUnits: delivered,
    firstPublishedAt,
    dueAt,
    now,
  })

  // Günlük dağılım: pencere üretimi lib'de, çünkü aynı gün dizisi
  // öğretmen ekranında da kullanılıyor.
  const daily = dailyDelivery({
    deliveries: rows.map(r => (r.submittedAt ? new Date(r.submittedAt) : null)),
    startsAt,
    dueAt,
  })

  // Öğrencinin kendi planı gün gün. `dailyDelivery` teslimleri sayıyor;
  // plan ayrı bir eksen ve aynı gün dizisine bindiriliyor.
  const plannedByDay = new Map<string, number>()
  for (const r of rows) {
    if (!r.plannedForDate) continue
    plannedByDay.set(r.plannedForDate, (plannedByDay.get(r.plannedForDate) ?? 0) + 1)
  }

  const works: HaftamWork[] = rows
    .slice()
    // SIRA DETERMİNİSTİK (R7-06.07) — öğrencinin Ödevlerim ekranıyla
    // aynı sıra. Aynı kapsamın iki ekranda iki sırada görünmesi,
    // "hangisi doğru" sorusunu doğururdu.
    .sort(compareHomeworkItems)
    .map(r => ({
      id: r.id,
      bookTitle: r.bookTitle,
      sectionTitle: r.sectionTitle,
      testTitle: r.testTitle,
      plannedForDate: r.plannedForDate,
      submitted: r.submittedAt !== null,
      approved: r.status === 'completed',
      returned: r.rejectedAt !== null && r.status === 'pending',
      // Hafta ortasında eklenen iş: öğrencinin mevcut dağılımı bunu
      // içermiyor ve sistem kendiliğinden dağıtmıyor (kabul #6).
      lateAdded: isLateAdded({ publishedAt: r.publishedAt, firstPublishedAt }),
    }))

  const view: HaftamView = {
    startsAt: startsAt.toISOString(),
    dueAt: dueAt.toISOString(),
    dueSource: (flow.due_source as 'anchor' | 'custom') ?? 'anchor',
    // SON TESLİMİN METNİ TEK YERDEN (R7-06.06): aynı `due_at` için
    // farklı kartların çelişkili metin üretmesine izin verilmiyor.
    dueText: dueLabel({ dueAt, now }),
    total,
    delivered,
    remaining: Math.max(0, total - delivered),
    distribution: distributionState({
      totalUnits: total,
      plannedUnits: rows.filter(r => r.plannedForDate !== null).length,
    }),
    pace: pace
      ? {
          startingPerDay: pace.startingPerDay,
          requiredPerDay: pace.requiredPerDay,
          band: pace.band,
        }
      : null,
    days: daily.days.map(d => ({
      date: d.date,
      weekday: d.weekday,
      delivered: d.delivered,
      planned: plannedByDay.get(d.date) ?? 0,
    })),
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6 md:p-8">
      <PageHeader
        title="Haftam"
        subtitle="Bu haftanın yükü, resmi son teslimi ve kendi günlük planın."
      />
      <HaftamClient view={view} works={works} />
    </div>
  )
}
