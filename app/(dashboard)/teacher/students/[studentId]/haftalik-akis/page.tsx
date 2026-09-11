import { notFound } from 'next/navigation'
import { getTeacherContext } from '@/lib/workspace'
import { deriveMainContact, type ServiceLike } from '@/lib/service-structure'
import {
  calculateFlowPace,
  checkInDue,
  dailyDelivery,
  deliverySilence,
  distributionState,
  resolveFlowDue,
} from '@/lib/weekly-flow'
import {
  FlowClient,
  type FlowView,
  type PastFlowRow,
  type FlowBookRow,
  type FlowBatchRow,
} from './flow-client'

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

  // DURUM BİLDİRİMLERİ (R7/05 §8, kabul #10).
  //
  // Ekran Haftalık Akış'ın altına taşındı: bildirim artık haftanın
  // ritmine bağlı üretiliyor (079) ve takvimden bağımsız bir üst menü
  // sekmesi olarak durması, bağlı olduğu şeyden koparıyordu.
  //
  // Bekleyen bildirim satırını üreten RPC tembel çalışıyor (016) —
  // sayfa yüklenirken çağrılır. Hatası yutuluyor: bildirim üretilememesi
  // haftalık akış ekranını göstermemek için sebep değil.
  await supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId })

  const [{ data: checkInSchedule }, { data: checkIns }] = await Promise.all([
    supabase
      .from('student_check_in_schedules')
      .select('interval_days, is_active')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
    supabase
      .from('student_check_ins')
      .select('id, status, mood, message, due_at, submitted_at, weekly_flow_id')
      .eq('student_id', studentId)
      .eq('workspace_id', workspaceId)
      .order('due_at', { ascending: false })
      .limit(20),
  ])

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
  let batches: FlowBatchRow[] = []

  if (activeFlow) {
    const dueAt = new Date(activeFlow.due_at)

    // Haftanın yükü: yalnız BU akışa bağlı partiler. Gelecek tarihli
    // ödev (Senaryo B) weekly_flow_id NULL olduğu için buraya hiç
    // girmez — kabul #7 sorgunun kendisiyle garanti.
    const { data: items } = await supabase
      .from('homework_items')
      .select(
        `id, status, created_at, submitted_at,
         homework_batches!inner(id, weekly_flow_id, created_at, title),
         books(id, title)`
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
      const batch = one(
        r.homework_batches as unknown as {
          id: string
          created_at: string
          title: string | null
        }
      )
      const book = one(r.books as unknown as { id: string; title: string })

      // TESLİM = ÖĞRENCİNİN GÖNDERİMİ, öğretmenin onayı DEĞİL (kabul #8).
      //
      // BURASI ÖNCEDEN `test_completions`'a bakıyordu ve YANLIŞTI: o
      // satır 014'te yalnız `approve_homework_item` içinde açılıyor,
      // yani öğretmen onayladığında. Cumartesi her şeyi gönderen bir
      // öğrenci, öğretmen Pazartesi onaylayınca ekranda "hiç teslim
      // etmemiş" görünüyor ve tempo bandı kritiğe düşüyordu.
      //
      // `submitted_at` onayda KORUNUYOR, iadede NULL'lanıyor — yani
      // belgenin iki kuralını da tek sütun karşılıyor: onay ilerlemeyi
      // geriye düşürmez, iade edilen iş yeniden gönderilene kadar
      // sayılmaz.
      const deliveredAt = r.submitted_at ? new Date(r.submitted_at as string) : null

      return {
        batchId: batch?.id ?? null,
        batchTitle: batch?.title ?? null,
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

    // PARTİ BAZINDA ÖZET — kaynak bazındakinden ayrı bir soruyu
    // yanıtlar: "ne verdim ve ne kadarı geldi?" Kaynak kırılımı ise
    // "hangi kitaptan ne kadar?" sorusunu yanıtlıyor. Aynı satırları
    // iki kez göstermek değil; iki farklı eksen.
    const byBatch = new Map<string, FlowBatchRow>()
    for (const r of rows) {
      if (!r.batchId) continue
      const row = byBatch.get(r.batchId) ?? {
        id: r.batchId,
        title: r.batchTitle ?? 'Ödev',
        publishedAt: r.publishedAt?.toISOString() ?? null,
        total: 0,
        delivered: 0,
        lateAdded:
          r.publishedAt !== null &&
          r.publishedAt.getTime() > new Date(activeFlow.starts_at).getTime() + 60_000,
      }
      row.total += 1
      if (r.deliveredAt !== null) row.delivered += 1
      byBatch.set(r.batchId, row)
    }
    batches = [...byBatch.values()].sort((a, b) =>
      (a.publishedAt ?? '').localeCompare(b.publishedAt ?? '')
    )

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
      // Günlük dağılımın YALNIZ teslim ekseni çizilir; "planlanan"
      // ekseninin verisi yok (bkz. lib/weekly-flow.ts · dailyDelivery).
      daily: dailyDelivery({
        deliveries: rows.map(r => r.deliveredAt),
        startsAt: new Date(activeFlow.starts_at),
        dueAt,
      }),
      pace: pace
        ? {
            startingPerDay: pace.startingPerDay,
            requiredPerDay: pace.requiredPerDay,
            band: pace.band,
            remainingMs: pace.remainingMs,
          }
        : null,
      // Kapsam BU HAFTA ile sınırlı; Genel Bakış'ın "Bu Hafta" bloğu
      // ise öğrencinin tüm gönderimlerine bakıyor. Metin bunu söylüyor
      // ki iki ekran çelişiyor görünmesin.
      lastActivity: deliverySilence({
        lastDeliveryAt,
        now,
        emptyPhrase: 'Bu haftaya henüz teslim gelmedi',
      }),
      // Bekleyen bildirimin GEREKÇESİ: ritim mi, sessizlik mi (§2).
      // Karar lib/weekly-flow.ts'te; 079 aynı eşiklerle satırı üretiyor
      // ve parite testi ikisini bağlıyor.
      checkInReason: checkInDue({
        flowStart: new Date(activeFlow.starts_at),
        dueAt,
        lastCheckInAt:
          (checkIns ?? [])
            .filter(c => c.status === 'submitted' && c.submitted_at)
            .map(c => new Date(c.submitted_at as string))
            .sort((a, b) => b.getTime() - a.getTime())[0] ?? null,
        lastDeliveryAt,
        now,
      }).reason,
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
      batches={batches}
      past={past}
      checkIns={(checkIns ?? []).map(c => ({
        id: c.id,
        status: c.status as 'pending' | 'submitted' | 'skipped',
        mood: c.mood,
        message: c.message,
        dueAt: c.due_at,
        submittedAt: c.submitted_at,
      }))}
      checkInSchedule={{
        intervalDays: checkInSchedule?.interval_days ?? 3,
        isActive: checkInSchedule?.is_active ?? false,
      }}
      anchorServiceId={anchorService?.id ?? null}
      suggestedDueAt={suggested?.dueAt.toISOString() ?? null}
    />
  )
}
