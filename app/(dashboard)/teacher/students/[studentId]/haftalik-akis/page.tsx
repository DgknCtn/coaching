import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { deriveMainContact, type ServiceLike } from '@/lib/service-structure'
import {
  calculateFlowPace,
  deliverySilence,
  distributionState,
  resolveFlowDue,
} from '@/lib/weekly-flow'
import { FlowClient, type FlowView, type PastFlowRow, type FlowBookRow } from './flow-client'

export const dynamic = 'force-dynamic'

// HAFTALIK AKIŞ — öğretmenin günlük operasyon ekranı (R7 / Site Testi 05 §7).
//
// EKRANIN ÖLÇÜSÜ: belge "öğretmen 3-5 saniyede" şunları görebilmeli
// diyor — bu hafta ne kadar yük var, ne kadarı teslim edildi, öğrenci
// yetişiyor mu, son hareket ne zaman, yeni eklenen var mı, bir sonraki
// temas ne zaman. Bu yüzden ana görünüm altı bileşenden ibaret; kitap
// haritası, uzun vadeli bitiş planı ve finans buraya ALINMADI (§8 "Bu
// ekranda OLMAYACAK").
//
// HESAPLAR BURADA YAPILMAZ: tempo, sessizlik ve dağıtım cümleleri
// lib/weekly-flow.ts'ten geliyor. Sayfa yalnız veriyi toplar. Aksi
// hâlde aynı eşikler ekranda ve testte ayrı ayrı yazılırdı.
export default async function WeeklyFlowPage({
  params,
}: {
  params: Promise<{ studentId: string }>
}) {
  const { studentId } = await params
  const { supabase, workspaceId } = await getTeacherContext()

  const { data: student } = await supabase
    .from('students')
    .select('id, full_name')
    .eq('id', studentId)
    .eq('workspace_id', workspaceId)
    .single()

  if (!student) notFound()

  const now = new Date()

  // Ana temas: haftanın ritmini kuran hizmet (R7-04). Buradan yalnız
  // VARSAYILAN kapanış üretilir — resmi kapanış akışın due_at'idir.
  const { data: serviceRows } = await supabase
    .from('student_services')
    .select(
      'id, kind, participation, medium, weekday, start_time, start_date, status, submission_offset_minutes'
    )
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)

  const services: ServiceLike[] = (serviceRows ?? []).map(s => ({
    id: s.id,
    kind: s.kind,
    participation: s.participation,
    medium: s.medium,
    weekday: s.weekday,
    startTime: String(s.start_time).slice(0, 5),
    startDate: s.start_date,
    status: s.status,
    submissionOffsetMinutes: s.submission_offset_minutes ?? 0,
  })) as ServiceLike[]

  const anchorService = deriveMainContact(services)

  const { data: flows } = await supabase
    .from('weekly_flows')
    .select(
      'id, starts_at, due_at, due_source, status, closed_at, on_time_delivered, on_time_total, anchor_service_id'
    )
    .eq('student_id', studentId)
    .eq('workspace_id', workspaceId)
    .order('due_at', { ascending: false })

  const activeFlow = (flows ?? []).find(f => f.status === 'active') ?? null

  // Öğretmen henüz hafta açmadıysa, açarsa kapanışın ne olacağını
  // GÖSTEREBİLMEK için ana temastan öneri üretilir. Yazılmaz — öneri
  // ile kayıt karışırsa öğretmenin koymadığı bir söz doğar.
  const suggested = resolveFlowDue({ customDueAt: null, anchorService, from: now })

  let view: FlowView | null = null
  let books: FlowBookRow[] = []

  if (activeFlow) {
    const dueAt = new Date(activeFlow.due_at)

    // Haftanın yükü: yalnız BU akışa bağlı partiler. Gelecek tarihli
    // ödev (Senaryo B) weekly_flow_id NULL olduğu için buraya hiç
    // girmez — kabul #7 sorgunun kendisiyle garanti.
    const { data: items } = await supabase
      .from('homework_items')
      .select(
        `id, status, created_at,
         homework_batches!inner(id, weekly_flow_id, created_at, title),
         books(id, title),
         test_completions(id, completed_at, status)`
      )
      .eq('workspace_id', workspaceId)
      .eq('homework_batches.weekly_flow_id', activeFlow.id)
      .neq('status', 'cancelled')

    // Supabase gömülü ilişkileri dizi olarak tipler; tek satırlık
    // ilişkiler burada BİR KEZ normalize ediliyor. Aşağıdaki hesapların
    // her birinde ayrı ayrı cast yapmak, aynı varsayımı beş yere
    // dağıtmak olurdu.
    const one = <T,>(v: T | T[] | null | undefined): T | null =>
      Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

    const rows = (items ?? []).map(r => {
      const batch = one(r.homework_batches as unknown as { id: string; created_at: string })
      const book = one(r.books as unknown as { id: string; title: string })
      const completions = ((r.test_completions ?? []) as unknown as {
        completed_at: string
        status: string
      }[]).filter(c => c.status === 'active')

      // TESLİM = öğrencinin gönderimi, öğretmenin onayı DEĞİL (kabul
      // #8): "Öğretmen onayı öğrencinin ilerlemesini geriye düşürmez."
      // İade edilen (reverted) kayıt teslim sayılmaz ama satırı
      // silinmediği için ilk gönderim anı geçmişte korunur.
      const deliveredAt =
        completions.length === 0
          ? null
          : new Date(Math.min(...completions.map(c => new Date(c.completed_at).getTime())))

      return {
        batchId: batch?.id ?? null,
        publishedAt: batch ? new Date(batch.created_at) : null,
        bookId: book?.id ?? null,
        bookTitle: book?.title ?? null,
        deliveredAt,
      }
    })

    const total = rows.length
    const delivered = rows.filter(r => r.deliveredAt !== null).length

    const lastDeliveryAt =
      rows
        .map(r => r.deliveredAt)
        .filter((d): d is Date => d !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0] ?? null

    // Tempo yayın anından başlar (§4), akışın açılışından değil.
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

    // "Yeni eklenenler": akış açıldıktan sonra yayınlanan partiler.
    // Öğrencinin kurduğu günlük plan bunları içermiyor — sistem de
    // kendiliğinden dağıtmıyor (kabul #6), bu yüzden ayrı sayılır.
    // Bir dakikalık pay, akışı açıp hemen ödev veren öğretmenin ilk
    // yayınının "sonradan eklendi" görünmesini engelliyor.
    const flowOpenedAt = new Date(activeFlow.starts_at)
    const lateAddedUnits = rows.filter(
      r => r.publishedAt !== null &&
        r.publishedAt.getTime() > flowOpenedAt.getTime() + 60_000
    ).length

    // Dağıtım durumu: öğrencinin günlük dağıtımı henüz veri modelinde
    // YOK (077 kapsam notu — belgenin kendi "sonraki adım"ı). Bu yüzden
    // "planlanan", akış açılışında var olan yük olarak alınıyor; yeni
    // eklenenler dağıtılmayı bekleyen kısımdır. Öğrenci ekranı
    // geldiğinde plannedUnits gerçek dağıtımdan okunacak, cümle
    // değişmeyecek.
    const distribution = distributionState({
      totalUnits: total,
      plannedUnits: total - lateAddedUnits,
    })

    const byBook = new Map<string, FlowBookRow>()
    for (const r of rows) {
      const key = r.bookId ?? 'yok'
      const row = byBook.get(key) ?? {
        id: key,
        title: r.bookTitle ?? 'Kaynaksız',
        total: 0,
        delivered: 0,
      }
      row.total += 1
      if (r.deliveredAt !== null) row.delivered += 1
      byBook.set(key, row)
    }
    books = [...byBook.values()].sort((a, b) => b.total - a.total)

    view = {
      id: activeFlow.id,
      startsAt: activeFlow.starts_at,
      dueAt: activeFlow.due_at,
      dueSource: activeFlow.due_source as 'anchor' | 'custom',
      anchorAt: suggested?.anchorAt?.toISOString() ?? null,
      total,
      delivered,
      remaining: Math.max(0, total - delivered),
      lateAddedUnits,
      distributionPhrase: distribution.phrase,
      pace: pace
        ? {
            startingPerDay: pace.startingPerDay,
            requiredPerDay: pace.requiredPerDay,
            band: pace.band,
            remainingMs: pace.remainingMs,
          }
        : null,
      lastActivity: deliverySilence({ lastDeliveryAt, now }),
    }
  }

  const past: PastFlowRow[] = (flows ?? [])
    .filter(f => f.status === 'closed')
    .map(f => ({
      id: f.id,
      startsAt: f.starts_at,
      dueAt: f.due_at,
      closedAt: f.closed_at,
      onTimeDelivered: f.on_time_delivered,
      onTimeTotal: f.on_time_total,
    }))

  return (
    <FlowClient
      studentId={studentId}
      studentName={student.full_name}
      flow={view}
      books={books}
      past={past}
      anchorServiceId={anchorService?.id ?? null}
      suggestedDueAt={suggested?.dueAt.toISOString() ?? null}
    />
  )
}
