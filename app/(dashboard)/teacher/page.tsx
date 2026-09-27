import { fetchOperationRows } from '@/lib/operation-rows'
import Link from 'next/link'
import { ArrowUpRight, Bell, CalendarDays, Clock, FileText, Plus } from 'lucide-react'
import { getTeacherContext } from '@/lib/workspace'
import { noticeSignal, STATUS_THRESHOLDS } from '@/lib/student-status'
import { statusFromOperationRow } from '@/lib/operation-status'
import { APP_TIME_ZONE, localDateString, todayDateString } from '@/lib/homework-status'
import { formatSessionClock, formatSessionWeekdayLong } from '@/lib/service-structure'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/shared/page-header'
import { OnboardingChecklist } from '@/components/shared/onboarding-checklist'
import { TrialBanner } from '@/components/shared/trial-banner'
import { QuotaNotice } from '@/components/shared/quota-notice'
import { MetricTiles } from '@/components/shared/metric-tiles'
import { Section } from '@/components/shared/section'
import { SectionUnavailable } from '@/components/shared/section-unavailable'
import { countResult, listResult, singleResult } from '@/lib/data-result'
import type { MetricTile } from '@/components/shared/metric-tiles'
import { StudentsTable, type DashboardRow } from './students-table'
import { StudentUpdates, type StudentUpdate } from './student-updates'
import { FollowUpList, type FollowUpStudent } from './follow-up-list'

export const dynamic = 'force-dynamic'

/** 080 · teacher_student_operation_view — Dashboard'un tek kaynağı. */
type StudentRow = {
  student_id: string
  student_full_name: string | null
  exam_type: string | null
  grade_level: string | null
  flow_started_at: string | null
  weekly_total: number | null
  weekly_submitted: number | null
  weekly_submitted_percent: number | null
  approval_pending_count: number | null
  overdue_work_count: number | null
  last_check_in_at: string | null
  status_update_due_at: string | null
  has_important_note: boolean | null
  next_contact_at: string | null
  next_contact_kind: 'ders' | 'kocluk' | null
  next_contact_participation: 'birebir' | 'grup' | null
  submission_cutoff_at: string | null
  // 097 · akış kapsamlı
  weekly_planned_units: number | null
  // 103 · HAREKET SİNYALLERİ (R8 §15-§16)
  last_real_work_at: string | null
  last_planning_at: string | null
  last_academic_note_at: string | null
  days_since_real_work: number | null
}

const shortDateFormatter = new Intl.DateTimeFormat('tr-TR', {
  timeZone: APP_TIME_ZONE,
  day: 'numeric',
  month: 'short',
})

/**
 * "Salı 20:14" / "18 Eyl 20:14" — güncelleme akışının zaman etiketi.
 *
 * Biçim BURADA üretiliyor, istemcide değil: saat dilimi APP_TIME_ZONE
 * üzerinden çözülmeli (sunucu UTC çalışıyor) ve öğretmenin makinesinin
 * dilimi notun yazıldığı saati kaydırmamalı.
 */
function formatNoteMoment(at: Date, now: Date): string {
  const clock = formatSessionClock(at)
  const withinWeek = now.getTime() - at.getTime() < 7 * 86_400_000
  return withinWeek
    ? `${formatSessionWeekdayLong(at)} ${clock}`
    : `${shortDateFormatter.format(at)} ${clock}`
}

/**
 * "Cuma 18:00" / "Bugün 20:00" / "24 Eyl 09:00" (§6).
 *
 * Bir hafta içindeki temaslar GÜN ADIYLA yazılıyor: "Cuma 18:00"
 * öğretmenin takviminde doğrudan bir yere oturur, "19.09 18:00" ise
 * zihinsel çeviri ister. Bir haftayı aşanlarda gün adı ayırt edici
 * olmaktan çıktığı için tarihe dönülüyor.
 */
function formatContactMoment(at: Date, now: Date): string {
  // SAAT DE GÜN ADI DA APP_TIME_ZONE ÜZERİNDEN. `toLocaleTimeString` ve
  // `getDay()` çalıştığı makinenin dilimini kullanır: sunucu UTC'de
  // olduğu için 20:00'deki bir görüşme dashboard'da 17:00 görünüyordu —
  // Görüşmeler ekranıyla üç saat fark.
  const time = formatSessionClock(at)
  if (localDateString(at) === localDateString(now)) return `Bugün ${time}`

  const days = Math.floor((at.getTime() - now.getTime()) / 86_400_000)
  if (days < 7) return `${formatSessionWeekdayLong(at)} ${time}`

  return `${shortDateFormatter.format(at)} ${time}`
}

/** "5 saat kaldı" / "2 gün kaldı" — §6'nın operasyonel bağlamı. */
function formatTimeLeft(ms: number): string {
  if (ms <= 0) return 'zamanı geldi'
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 24) return `${Math.max(1, hours)} saat kaldı`
  return `${Math.floor(hours / 24)} gün kaldı`
}

export default async function TeacherDashboard() {
  const { supabase, workspaceId, activeTerm, profile, usage } = await getTeacherContext()

  // İLK DALGA — birbirinden bağımsız olan her şey aynı anda.
  //
  // Önceden lisans sorgusu, check-in RPC'si ve aşağıdaki üçlü ARDIŞIK
  // çalışıyordu: dashboard açılışı dört ayrı gidiş-dönüş bekliyordu.
  // Yalnız öğrenci listesi RPC'ye bağımlı (aşağıya bakınız); geri kalanın
  // sırayla beklemesi için hiçbir sebep yoktu.
  const [bookCountRes, homeworkCountRes, checkInRes] =
    await Promise.all([
      // Kurulum adımları için: havuzda kaynak var mı? HEAD sayımı, satır
      // gövdesi taşınmaz.
      supabase
        .from('books')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId)
        .eq('status', 'active'),
      // Kurulum adımları için: hiç ödev verilmiş mi? Aynı HEAD sayımı
      // kalıbı; tek sorulan "sıfır mı, değil mi".
      supabase
        .from('homework_batches')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspaceId),
      // Durum bildirimleri tembel materyalize edilir (cron yok): planı olup
      // açık bildirimi olmayan öğrenciler için sıradaki kaydı açar.
      // Idempotent.
      //
      // BU DALGANIN İÇİNDE ama sonucu okunmuyor: yazdığı satırları
      // AŞAĞIDAKİ öğrenci listesi okuyor, o yüzden ondan önce bitmeli.
      // (student/page.tsx'te aynı kalıp kullanılıyor.)
      supabase.rpc('ensure_student_check_ins', { p_workspace_id: workspaceId }),
    ])

  // Kurulum kartının iki girdisi. Sayım düşerse 0 DEĞİL "bilinmiyor":
  // aksi hâlde kart, kitap eklemiş bir öğretmene "kitap ekleyin" derdi.
  const bookCount = countResult(bookCountRes, 'teacher.book_count')
  const homeworkCount = countResult(homeworkCountRes, 'teacher.homework_count')

  // RPC'nin sonucu okunmuyor ama arızası GÖRÜNMELİ: bildirim satırları
  // açılmazsa "Durum Bildirimi Bekleyen" sayısı sessizce bayat kalır.
  // Kullanıcıya ayrıca bir şey söylenmiyor (sayı yine gerçek satırlardan
  // geliyor, yanlış değil yalnız eski olabilir); raporlanıyor.
  singleResult(checkInRes, 'teacher.ensure_check_ins')
  // LİSANS DURUMU BAĞLAMDAN GELİYOR, AYRI SORGUDAN DEĞİL.
  //
  // Burada `workspace_licenses` tablosuna ayrı bir sorgu vardı; oysa
  // `getTeacherContext` zaten `get_workspace_usage` RPC'sini çağırıyor
  // ve dönüşünde `license_status` var (058). Aynı bilgi aynı istekte
  // iki kez soruluyordu.
  //
  // KAZANÇ ÖLÇÜLDÜ VE BULUNAMADI — BU YÜZDEN GEREKÇE PERFORMANS DEĞİL.
  //
  // Sorgu silindikten sonra aynı sayfa ölçüldü ve tarama sayıları
  // DÜŞMEDİ, hatta oynadı (profiles 177->193, workspaces 194->204).
  // Yani sayfa yüklemeleri arasındaki doğal dalgalanma, tek bir sorgunun
  // etkisinden büyük. Bu yöntem bu mertebedeki farkları ayırt edemiyor.
  //
  // Değişiklik yine de doğru: aynı bilgi aynı istekte iki kez
  // soruluyordu. Ama bir performans iyileştirmesi olarak sunulamaz.
  const hasLicense = usage?.licenseStatus === 'active'

  const [studentsRes, upcomingRes, dayNotesRes] = await Promise.all([
    // 117: plan saklayan RPC (view'a geri düşer — lib/operation-rows.ts).
    fetchOperationRows(supabase, workspaceId),
    // BUGÜNKÜ TEMASLAR (§3 kart 4). Öğrenci başına "sıradaki" temastan
    // türetilemez: bir öğrencinin aynı gün iki görüşmesi olabilir ve
    // yalnız biri "sıradaki"dir. Pencere geniş tutulup gün YEREL
    // takvimle aşağıda eleniyor — sabit bir +03:00 varsaymamak için.
    supabase
      .from('service_sessions')
      .select('id, planned_at, actual_at, status, student_services(kind)')
      .eq('workspace_id', workspaceId)
      .in('status', ['planlandi', 'ertelendi'])
      .gte('planned_at', new Date(Date.now() - 2 * 86_400_000).toISOString())
      .lte('planned_at', new Date(Date.now() + 2 * 86_400_000).toISOString()),
    // ÖĞRENCİ GÜNCELLEMELERİ (R8 §17A) — öğrencilerin yazdığı gün
    // notları. Pencere son 14 gün: akış bir arşiv değil, öğretmenin
    // şu anki bağlamı.
    supabase
      .from('student_day_notes')
      .select('id, student_id, note_date, note_text, updated_at, seen_at')
      .eq('workspace_id', workspaceId)
      .gte('note_date', localDateString(new Date(Date.now() - 14 * 86_400_000)))
      .order('updated_at', { ascending: false })
      .limit(30),
  ])

  // PRD · B01 — hata ve boşluk ayrı. Bu sayfada ÖĞRENCİ LİSTESİ her şeyin
  // kaynağı: kartlar, tablo, takip listesi, güncellemelerdeki isimler ve
  // kurulum kartı. Eskiden sorgu düştüğünde `students ?? []` boş diziye
  // dönüyor ve ekranın tamamı "hiç öğrenciniz yok" diyordu: kartlar 0,
  // tablo boş, kurulum kartı "ilk öğrencinizi ekleyin".
  const students = listResult(studentsRes, 'teacher.operation_view')
  const upcoming = listResult(upcomingRes, 'teacher.upcoming_sessions')
  const dayNotes = listResult(dayNotesRes, 'teacher.day_notes')

  const now = new Date()
  const today = todayDateString(now)

  // Bugünkü temaslar: sorgu düştüyse `null` — "Bugün yok" DEĞİL.
  const todaySessions = upcoming.ok
    ? upcoming.data.filter((s) => {
        const at = (s.actual_at ?? s.planned_at) as string | null
        return at !== null && localDateString(new Date(at)) === today
      })
    : null
  const todayLessons = (todaySessions ?? []).filter(
    (s) =>
      (Array.isArray(s.student_services) ? s.student_services[0] : s.student_services)
        ?.kind === 'ders'
  ).length
  const todayCoaching = (todaySessions?.length ?? 0) - todayLessons

  // Aşağıdaki hesaplar boş diziyle de çalışsın diye `[]`; ama ekrana
  // hiçbiri `students.ok` kontrol edilmeden çizilmiyor.
  const raw = (students.ok ? students.data : []) as StudentRow[]

  // Durum motoru satır satır burada çalışır (lib/student-status.ts).
  // View yalnız GİRDİLERİ döndürüyor; eşikler SQL'e gömülmedi ki
  // ayarlanabilir kalsınlar (§7 notu).
  const rows = raw.map((s) => {
    const status = statusFromOperationRow(s, now)
    return { ...s, computed: status }
  })

  // SIRALAMA: next_contact_at ASC (§6). Alfabetik sıralama KALDIRILDI —
  // "Bugünkü görüşmeler en üstte; ardından yarın ve sonraki günler
  // gelir. Temassız öğrenciler listenin sonunda kalır."
  rows.sort((a, b) => {
    const ta = a.next_contact_at ? new Date(a.next_contact_at).getTime() : Infinity
    const tb = b.next_contact_at ? new Date(b.next_contact_at).getTime() : Infinity
    if (ta !== tb) return ta - tb
    // Temassızlar arasında en azından sabit bir sıra kalsın.
    return (a.student_full_name ?? '').localeCompare(b.student_full_name ?? '', 'tr')
  })

  // Üst kartlar — §4'ün "yayılımı göster" kuralı: tek sayı yerine
  // çalışma + kaç öğrenciyi etkilediği birlikte.
  const submittedWork = rows.reduce((n, s) => n + Number(s.approval_pending_count ?? 0), 0)
  const submittedStudents = rows.filter((s) => Number(s.approval_pending_count ?? 0) > 0).length
  const overdueWork = rows.reduce((n, s) => n + Number(s.overdue_work_count ?? 0), 0)
  const overdueStudents = rows.filter((s) => Number(s.overdue_work_count ?? 0) > 0).length
  const checkInWaiting = rows.filter((s) => s.status_update_due_at !== null).length

  const firstName = profile.full_name.split(' ')[0]

  // SATIRLAR SUNUCUDA HAZIRLANIR (§5'in kolon sırasıyla: Öğrenci |
  // Teslim | Onay | Bildirim / Not | Sonraki Temas | Durum).
  //
  // Tablo artık istemci bileşeni (arama ve filtre için) ama eşikler,
  // saat farkları ve bildirim sinyali BURADA hesaplanıyor. İstemciye
  // ham zaman damgası geçilseydi, saati kaymış bir kullanıcıda "Bugün"
  // etiketi başka bir güne düşerdi.
  const tableRows: DashboardRow[] = rows.map((s) => {
    const notice = noticeSignal({
      checkInOverdueHours: s.status_update_due_at
        ? Math.max(
            0,
            (now.getTime() - new Date(s.status_update_due_at).getTime()) / 3_600_000
          )
        : 0,
      hasImportantNote: s.has_important_note === true,
      hasCheckedIn: s.last_check_in_at !== null,
    })

    const contactAt = s.next_contact_at ? new Date(s.next_contact_at) : null

    return {
      id: s.student_id,
      name: s.student_full_name ?? 'İsimsiz öğrenci',
      meta: [s.grade_level, s.exam_type].filter(Boolean).join(' · ') || null,

      weeklyTotal: Number(s.weekly_total ?? 0),
      weeklySubmitted: Number(s.weekly_submitted ?? 0),
      weeklyPercent: Number(s.weekly_submitted_percent ?? 0),

      approvalPending: Number(s.approval_pending_count ?? 0),

      noticeLabel: notice.label,
      noticeKind: notice.kind,

      contactLabel: contactAt ? formatContactMoment(contactAt, now) : null,
      contactLeft: contactAt ? formatTimeLeft(contactAt.getTime() - now.getTime()) : null,
      contactKindLabel: contactAt
        ? s.next_contact_kind === 'kocluk'
          ? 'Koçluk'
          : 'Ders'
        : null,
      contactIsToday: contactAt !== null && localDateString(contactAt) === today,

      status: s.computed.status,
      // B02 · NEDEN: durum motorunun ürettiği hazır Türkçe gerekçeler.
      // Tabloda yalnız rozet görünüyordu; öğretmen "neden dikkat?"
      // sorusu için öğrenciyi tek tek açıyordu. İkinci bir hesap YOK.
      signals: s.computed.signals,
    }
  })

  // ============================================================
  // ÖĞRENCİ GÜNCELLEMELERİ (§17A)
  //
  // Görülmemişler önce; aynı grup içinde en yeni üstte. Öğretmenin
  // okumadığı bir not listenin dibinde kalmamalı.
  // ============================================================
  const nameById = new Map(rows.map((s) => [s.student_id, s.student_full_name]))

  const updates: StudentUpdate[] = (dayNotes.ok ? dayNotes.data : [])
    // Silinmiş/pasif öğrencinin notu akışta görünmez: tıklanınca açılacak
    // bir öğrenci yok.
    .filter((n) => nameById.has(n.student_id as string))
    .sort((a, b) => {
      const sa = a.seen_at === null ? 0 : 1
      const sb = b.seen_at === null ? 0 : 1
      if (sa !== sb) return sa - sb
      return String(b.updated_at).localeCompare(String(a.updated_at))
    })
    .map((n) => ({
      id: n.id as string,
      studentId: n.student_id as string,
      studentName: nameById.get(n.student_id as string) ?? 'İsimsiz öğrenci',
      when: formatNoteMoment(new Date(n.updated_at as string), now),
      text: n.note_text as string,
      seen: n.seen_at !== null,
    }))

  // ============================================================
  // TAKİP GEREKENLER (§17B)
  //
  // Ölçüt tempo DEĞİL, hareket: uzun süredir gerçek akademik hareket
  // göstermeyen öğrenciler. §18'in ayrımı gereği yüzdesi iyi görünen
  // ama ortada olmayan öğrenci de buraya düşer.
  // ============================================================
  const followUps: FollowUpStudent[] = rows
    .filter((s) => {
      const days = s.days_since_real_work
      return days !== null && days >= STATUS_THRESHOLDS.silentWorkDays
    })
    .sort((a, b) => (b.days_since_real_work ?? 0) - (a.days_since_real_work ?? 0))
    .map((s) => ({
      id: s.student_id,
      name: s.student_full_name ?? 'İsimsiz öğrenci',
      silenceLabel: `${s.days_since_real_work} gündür çalışma hareketi yok`,
      // Öğretmenin temas etmeden önce bilmesi gereken üç şey (§17B).
      facts: [
        s.last_real_work_at
          ? `Son teslim: ${shortDateFormatter.format(new Date(s.last_real_work_at))}`
          : 'Son teslim: yok',
        Number(s.weekly_planned_units ?? 0) > 0 ? 'Haftalık plan: var' : 'Haftalık plan: yapılmadı',
        s.last_academic_note_at
          ? `Son akademik not: ${shortDateFormatter.format(new Date(s.last_academic_note_at))}`
          : 'Son akademik not: yok',
      ],
    }))

  return (
    <div className="max-w-6xl space-y-8 p-6 md:p-8">
      <PageHeader
        title={`Merhaba, ${firstName}`}
        subtitle={activeTerm ? `${activeTerm.name} dönemi aktif` : 'Henüz aktif dönem yok'}
        action={
          <Button size="sm" render={<Link href="/teacher/students/new" />}>
            <Plus />
            Öğrenci Ekle
          </Button>
        }
      />

      {/* Deneme şeridi kurulum adımlarının ÜSTÜNDE: süre dolduğunda
          çalışma alanı kapanıyor (057), yani bu diğer her şeyden daha
          zaman duyarlı. Abonelik kurulduysa hiç görünmez. */}
      <TrialBanner
        trialEndsAt={usage?.trialEndsAt ?? null}
        hasLicense={hasLicense}
      />

      {/* Kurulum adımları tek bir kartta toplandı: önceden yalnız "dönem
          yok" uyarısı vardı ve kullanıcı sonraki iki adımı (kitap, öğrenci)
          kendi başına keşfetmek zorundaydı. Üçü de tamamlanınca kart
          tamamen kaybolur.

          GİRDİLERDEN BİRİ BİLİNMİYORSA KART HİÇ ÇİZİLMEZ (PRD · B01).
          Eksik veriyle çizilen kart, kitap ve öğrenci eklemiş bir
          öğretmene "ilk öğrencinizi ekleyin" diyordu. Yardımcı bir kartın
          bir gün görünmemesi, yanlış yönlendirmesinden iyidir. */}
      {bookCount.ok && homeworkCount.ok && students.ok && (
        <OnboardingChecklist
          state={{
            hasTerm: !!activeTerm,
            hasBook: bookCount.data > 0,
            hasStudent: rows.length > 0,
            hasHomework: homeworkCount.data > 0,
          }}
          firstStudentId={rows[0]?.student_id ?? null}
        />
      )}

      {usage && <QuotaNotice usage={usage} />}

      {/* §4'ün dört kartı. "Bu hafta tamamlanan" KALDIRILDI: belge
          "öğrenci bazında anlamlı olmadığı için toplam kart gereksiz"
          diyor. Kalan üçü tek sayı yerine YAYILIMI gösteriyor —
          "27 çalışma · 4 öğrenci" bir sayıdan fazlasını söyler.

          VERİ GELMEDİYSE "—", ASLA 0 (PRD · B01, §26: "Hata verilen
          sorgu hiçbir yerde gerçek sıfır gibi sunulmaz"). "Süresi Geçen:
          0" öğretmene "gecikme yok" der; bilmiyorsak bunu söyleyemeyiz. */}
      <MetricTiles
        className="xl:grid-cols-4"
        metrics={[
          ...(students.ok
            ? ([
                {
                  label: 'Öğrenciden Teslim Edilen',
                  value: submittedWork,
                  icon: FileText,
                  hint: `${submittedStudents} öğrenci · kontrol bekliyor`,
                  href: '/teacher/tasks?filter=approval',
                },
                {
                  label: 'Süresi Geçen',
                  value: overdueWork,
                  // OVERDUE_HINT ("Beklenenler içinde") burada KULLANILMIYOR:
                  // o ipucu, yanında "Bekleyen" sayacı dururken gecikenlerin
                  // onun alt kümesi olduğunu anlatmak için vardı. Bu şeritte
                  // öyle bir komşu yok; ipucu bağlamsız kalıp kafa karıştırırdı.
                  hint: `${overdueStudents} öğrenci · teslim tarihi geçen`,
                  href: '/teacher/tasks?filter=overdue',
                  icon: Clock,
                  tone: overdueWork > 0 ? 'destructive' : 'default',
                },
                {
                  label: 'Durum Bildirimi Bekleyen',
                  value: checkInWaiting,
                  hint: 'öğrenci · beklenen bildirimi geciken',
                  href: '/teacher/tasks?filter=checkin',
                  icon: Bell,
                  tone: checkInWaiting > 0 ? 'warning' : 'default',
                },
              ] satisfies MetricTile[])
            : ([
                // Bağlantılar KORUNUYOR: görev ekranı kendi sorgusunu
                // yapıyor, oradan gerçek sayıya ulaşılabilir.
                { label: 'Öğrenciden Teslim Edilen', value: '—', icon: FileText, hint: 'şu an alınamadı', href: '/teacher/tasks?filter=approval' },
                { label: 'Süresi Geçen', value: '—', icon: Clock, hint: 'şu an alınamadı', href: '/teacher/tasks?filter=overdue' },
                { label: 'Durum Bildirimi Bekleyen', value: '—', icon: Bell, hint: 'şu an alınamadı', href: '/teacher/tasks?filter=checkin' },
              ] satisfies MetricTile[])),
          {
            // HEDEFİ YOK ve bu bilinçli: belge bu kartı "sıradaki
            // ders/koçluk listesi"ne bağlamak istiyor ama öyle bir ekran
            // yok. Kırık bir bağlantı koymaktansa bağlantısız bırakmak
            // doğru — aşağıdaki tablo zaten sıradaki temasa göre sıralı
            // ve bugünküler en üstte.
            label: 'Yaklaşan Temaslar',
            // Sorgu düştüyse "Bugün yok" DENMEZ: öğretmen o gün
            // görüşmesini unutabilir.
            value:
              todaySessions === null
                ? '—'
                : todaySessions.length === 0
                  ? 'Bugün yok'
                  : `Bugün ${todaySessions.length}`,
            icon: CalendarDays,
            hint:
              todaySessions === null
                ? 'şu an alınamadı'
                : todaySessions.length > 0
                  ? `${todayLessons} ders · ${todayCoaching} koçluk`
                  : undefined,
          },
        ]}
      />

      <Section
        title="Öğrenci Takibi"
        description={
          students.ok && rows.length
            ? `Toplam ${rows.length} öğrenci · sonraki temas tarihine göre sıralanır.`
            : undefined
        }
        variant="card"
        action={
          <Button variant="ghost" size="sm" render={<Link href="/teacher/students" />}>
            Tümünü gör
            <ArrowUpRight />
          </Button>
        }
      >
        {students.ok ? (
          <StudentsTable rows={tableRows} />
        ) : (
          <div className="p-4">
            <SectionUnavailable
              title="Öğrenci listesi şu an alınamadı"
              description="Durumlar ve sayılar gösterilemiyor. Bu, öğrenci olmadığı anlamına gelmez."
              retryHref="/teacher"
            />
          </div>
        )}
      </Section>

      {/* ============================================================
          HAFTAM'IN ÖĞRETMENE ÜRETTİĞİ İKİ AKIŞ (R8 §17)

          İkisi de EK OPERASYON YARATMADAN doluyor: öğrenci Haftam'da
          kendi işini yaparken bu veriler kendiliğinden oluşuyor.
          Öğretmen için ayrı bir rapor doldurma adımı YOK (§20).
          ============================================================ */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Öğrenci Güncellemeleri"
          description={
            dayNotes.ok && students.ok && updates.some((u) => !u.seen)
              ? `Öğrencilerin kendi yazdığı gün notları · ${updates.filter((u) => !u.seen).length} yeni`
              : 'Öğrencilerin kendi yazdığı gün notları.'
          }
          variant="card"
        >
          {/* Güncellemeler öğrenci ADIYLA gösteriliyor ve isimler öğrenci
              listesinden geliyor; o da düştüyse notlar isimsiz kalırdı
              (ve filtre hepsini elerdi — "yeni güncelleme yok" gibi). */}
          {dayNotes.ok && students.ok ? (
            <StudentUpdates updates={updates} />
          ) : (
            <div className="p-4">
              <SectionUnavailable retryHref="/teacher" />
            </div>
          )}
        </Section>

        <Section
          title="Takip Gerekenler"
          description={
            students.ok && followUps.length > 0
              ? `${followUps.length} öğrenci · uzun süredir gerçek akademik hareket yok`
              : 'Uzun süredir gerçek akademik hareket göstermeyen öğrenciler.'
          }
          variant="card"
        >
          {/* Boş takip listesi "herkes çalışıyor" demek. Öğrenci listesi
              gelmediyse bunu söyleyemeyiz. */}
          {students.ok ? (
            <FollowUpList students={followUps} />
          ) : (
            <div className="p-4">
              <SectionUnavailable retryHref="/teacher" />
            </div>
          )}
        </Section>
      </div>
    </div>
  )
}
