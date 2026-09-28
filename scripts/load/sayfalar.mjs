// LOAD-01 · SAYFA SENARYOSU (varsayılan, 28 Eylül 2026)
//
// ============================================================
// NEDEN YENİ BİR SENARYO
//
// 28 Eylül koşusu (114+115 sonrası) %67 5xx verdi. Tek tek ölçüm
// gösterdi ki uygulamanın panel sorguları veritabanında 15-60 ms; ama eski
// senaryo (senaryolar.mjs `tur`) iki yönden gerçek kullanımdan sapıyordu:
//
//   1. Uygulamanın YAPMADIĞI sorgular: panel adımı overview'ı filtresiz
//      `select=*` ile okuyordu (uygulama çalışma alanıyla ve 2 sütunla).
//   2. KAPALI DÖNGÜ + 0,5-2 sn düşünme: sorgular hızlandıkça aynı 40
//      sanal kullanıcı saniyede ~29'dan ~94 isteğe çıktı. Ölçülen şey
//      "40 öğretmen" değil "sistem ne kadar hızlı boğulur" oldu.
//
// Bu dosya birimi TUR değil SAYFA GÖRÜNTÜLEME yapıyor: her sayfa,
// uygulamanın o sayfada gönderdiği sorguların AYNISINI, aynı sıra ve
// paralellikle gönderir (kaynak dosya her sayfanın yanında). Sayfalar
// arasında gerçekçi düşünme süresi var (varsayılan 5-20 sn,
// LOAD_DUSUNME_SN="5-20").
//
// Uygulama değişirse burası da değişmeli — ayrışırsa ölçüm yanlış yola
// gider. Sayfa karışımı `SAYFA_AGIRLIKLARI`'nda.
//
// YAZMA: `ensure_student_check_ins` uygulamanın panel sayfasında HER
// açılışta çağırdığı idempotent materyalizasyon; gerçek yolun parçası
// olduğu için LOAD_WRITES=0'da da çağrılır (eksik bildirim satırı yoksa
// hiçbir şey yazmaz). Akademik not ekleme LOAD_WRITES ile yönetilir
// (senaryolar.mjs'teki işaretle aynı).
// ============================================================

import { istek, YAZMA_ISARETI } from './senaryolar.mjs'

/** Sayfa karışımı — öğretmen oturumunda görülen sıklık (tahmin, ayarlanabilir). */
export const SAYFA_AGIRLIKLARI = [
  ['panel', 35],
  ['ogrenci_detay', 30],
  ['ogrenciler', 20],
  ['gorevler', 15],
]

const YAZMA_TAVANI = 50
let yazilan = 0

/** PostgREST adresi: select'teki boşluklar atılır, parametreler kodlanır. */
function rest(ayar, tablo, parametreler) {
  const qs = new URLSearchParams()
  for (const [k, v] of parametreler) qs.append(k, k === 'select' ? v.replace(/\s+/g, '') : v)
  return `${ayar.url}/rest/v1/${tablo}?${qs.toString()}`
}

/** Europe/Istanbul günü (uygulamanın todayDateString'i gibi); `gun` gün öncesi. */
function yerelGun(gun = 0) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(
    new Date(Date.now() - gun * 86_400_000)
  )
}

/**
 * getTeacherContext (lib/workspace.ts) + teacher layout (app/(dashboard)/teacher/layout.tsx).
 * Her sayfa görüntülemede: oturum doğrulama → profil+üyelikler → üç paralel
 * bağlam sorgusu; layout'un öğrenci listesi sayfa sorgularıyla paralel.
 */
async function baglam(ayar, o, t, sayfa) {
  const h = { headers: o.basliklar }
  await istek(t, `${sayfa} · auth_user`, `${ayar.url}/auth/v1/user`, h)
  await istek(
    t,
    `${sayfa} · ctx_profil`,
    rest(ayar, 'profiles', [
      ['select', 'id, full_name, email, default_workspace_id, is_platform_admin, workspace_members(role, workspace_id, status)'],
      ['auth_user_id', `eq.${o.kullaniciId}`],
    ]),
    h
  )
  await Promise.all([
    istek(
      t,
      `${sayfa} · ctx_workspaces`,
      rest(ayar, 'workspaces', [['select', 'id, name, is_library'], ['id', `in.(${o.workspaceId})`], ['order', 'name']]),
      h
    ),
    istek(
      t,
      `${sayfa} · ctx_donem`,
      rest(ayar, 'academic_terms', [
        ['select', 'id, name, status'],
        ['workspace_id', `eq.${o.workspaceId}`],
        ['status', 'eq.active'],
        ['order', 'created_at.desc'],
        ['limit', '1'],
      ]),
      h
    ),
    istek(t, `${sayfa} · ctx_kullanim`, `${ayar.url}/rest/v1/rpc/get_workspace_usage`, {
      method: 'POST',
      headers: o.basliklar,
      body: JSON.stringify({ p_workspace_id: o.workspaceId }),
    }),
  ])
}

function layoutOgrenciler(ayar, o, t, sayfa) {
  return istek(
    t,
    `${sayfa} · layout_ogrenciler`,
    rest(ayar, 'students', [
      ['select', 'student_id:id, student_full_name:full_name, grade_level, exam_type'],
      ['workspace_id', `eq.${o.workspaceId}`],
      ['order', 'full_name'],
      ['limit', '500'],
    ]),
    { headers: o.basliklar }
  )
}

function sayim(ayar, o, t, ad, tablo, parametreler) {
  return istek(t, ad, rest(ayar, tablo, [['select', 'id'], ...parametreler]), {
    method: 'HEAD',
    headers: { ...o.basliklar, Prefer: 'count=exact' },
  })
}

// ------------------------------------------------------------
// PANEL — app/(dashboard)/teacher/page.tsx
// ------------------------------------------------------------
async function panel(ayar, o, t) {
  const S = 'panel'
  const h = { headers: o.basliklar }
  const ws = `eq.${o.workspaceId}`
  await baglam(ayar, o, t, S)
  await Promise.all([
    layoutOgrenciler(ayar, o, t, S),
    (async () => {
      await Promise.all([
        sayim(ayar, o, t, `${S} · kitap_sayim`, 'books', [['workspace_id', ws], ['status', 'eq.active']]),
        sayim(ayar, o, t, `${S} · odev_sayim`, 'homework_batches', [['workspace_id', ws]]),
        istek(t, `${S} · ensure_check_ins`, `${ayar.url}/rest/v1/rpc/ensure_student_check_ins`, {
          method: 'POST',
          headers: o.basliklar,
          body: JSON.stringify({ p_workspace_id: o.workspaceId }),
        }),
      ])
      await Promise.all([
        istek(t, `${S} · operation_view`, rest(ayar, 'teacher_student_operation_view', [['select', '*'], ['workspace_id', ws]]), h),
        istek(
          t,
          `${S} · yaklasan_temaslar`,
          rest(ayar, 'service_sessions', [
            ['select', 'id, planned_at, actual_at, status, student_services(kind)'],
            ['workspace_id', ws],
            ['status', 'in.(planlandi,ertelendi)'],
            ['planned_at', `gte.${new Date(Date.now() - 2 * 86_400_000).toISOString()}`],
            ['planned_at', `lte.${new Date(Date.now() + 2 * 86_400_000).toISOString()}`],
          ]),
          h
        ),
        istek(
          t,
          `${S} · gun_notlari`,
          rest(ayar, 'student_day_notes', [
            ['select', 'id, student_id, note_date, note_text, updated_at, seen_at'],
            ['workspace_id', ws],
            ['note_date', `gte.${yerelGun(14)}`],
            ['order', 'updated_at.desc'],
            ['limit', '30'],
          ]),
          h
        ),
      ])
    })(),
  ])
}

// ------------------------------------------------------------
// ÖĞRENCİLER — app/(dashboard)/teacher/students/page.tsx
// ------------------------------------------------------------
async function ogrenciler(ayar, o, t) {
  const S = 'ogrenciler'
  const h = { headers: o.basliklar }
  const ws = `eq.${o.workspaceId}`
  await baglam(ayar, o, t, S)
  await Promise.all([
    layoutOgrenciler(ayar, o, t, S),
    istek(
      t,
      `${S} · operation_view`,
      rest(ayar, 'teacher_student_operation_view', [['select', '*'], ['workspace_id', ws], ['order', 'student_full_name'], ['limit', '500']]),
      h
    ),
    istek(
      t,
      `${S} · overview_ilerleme`,
      rest(ayar, 'teacher_student_overview_view', [['select', 'student_id, completion_percentage'], ['workspace_id', ws], ['limit', '500']]),
      h
    ),
  ])
}

// ------------------------------------------------------------
// GÖREVLER — app/(dashboard)/teacher/tasks/page.tsx (varsayılan: onay bekleyenler)
// ------------------------------------------------------------
async function gorevler(ayar, o, t) {
  const S = 'gorevler'
  const h = { headers: o.basliklar }
  const ws = `eq.${o.workspaceId}`
  await baglam(ayar, o, t, S)
  await Promise.all([
    layoutOgrenciler(ayar, o, t, S),
    istek(
      t,
      `${S} · onay_kuyrugu`,
      rest(ayar, 'homework_items', [
        [
          'select',
          'id, submitted_at, homework_batch_id, book_id, homework_batches!inner(due_date, title, student_id, status, students(full_name)), books(title, tracking_mode), book_sections(title), book_tests(title)',
        ],
        ['workspace_id', ws],
        ['status', 'eq.pending_approval'],
        ['homework_batches.status', 'eq.active'],
        ['order', 'submitted_at.asc'],
      ]),
      h
    ),
  ])
}

// ------------------------------------------------------------
// ÖĞRENCİ DETAYI — app/(dashboard)/teacher/students/[studentId]/page.tsx
// Varsayılan sekme (Genel Bakış). Sayfa yalnız açık sekmenin verisini
// çekiyor (lib/student-detail-needs.ts): 1 + 12 paralel sorgu + kitap
// haritası (lib/book-map.ts), ardından müdahale bölümünün iki sorgusu.
// Kapsam yükleyicileri (ogrenciKapsamlari) yalnız Kitaplar sekmesinde.
// ------------------------------------------------------------
async function kitapHaritasi(ayar, o, t, S, ogrenciId) {
  const h = { headers: o.basliklar }
  const ws = `eq.${o.workspaceId}`
  const atamalar = await istek(
    t,
    `${S} · kitap_haritasi_atamalar`,
    rest(ayar, 'student_book_assignments', [
      [
        'select',
        `id, book_id, start_date, target_end_date, video_display, status, role, scope_id,
         books(id, title, subject, exam_type, level_exam, curriculum_program, publisher, tracking_mode, video_mode, video_url,
           book_parts(id, title, order_index),
           book_sections(id, title, order_index, status, note, video_url, page_start, page_end, group_label, theme_label, topic_id, part_id, parent_section_id, test_start, test_end,
             book_tests(id, title, order_index, status, page_start, page_end)))`,
      ],
      ['student_id', `eq.${ogrenciId}`],
      ['workspace_id', ws],
      ['status', 'in.(active,pending,paused,completed)'],
    ]),
    h
  )
  const ids = Array.isArray(atamalar.govde) ? atamalar.govde.map(a => a.id) : []
  if (ids.length === 0) return
  const idList = `in.(${ids.join(',')})`
  await Promise.all([
    istek(
      t,
      `${S} · kitap_haritasi_acik_odev`,
      rest(ayar, 'homework_items', [
        ['select', 'id, book_test_id, status, rejected_at, homework_batches!inner(due_date, status)'],
        ['student_book_assignment_id', idList],
        ['status', 'in.(pending,pending_approval)'],
        ['homework_batches.status', 'eq.active'],
      ]),
      h
    ),
    istek(
      t,
      `${S} · kitap_haritasi_tamamlanan`,
      rest(ayar, 'test_completions', [['select', 'book_test_id'], ['student_book_assignment_id', idList], ['status', 'eq.active']]),
      h
    ),
    istek(
      t,
      `${S} · kitap_haritasi_hedefler`,
      rest(ayar, 'student_book_targets', [
        ['select', 'id, student_book_assignment_id, start_date, target_date, scope_type, scope_data, kind'],
        ['student_book_assignment_id', idList],
        ['active', 'eq.true'],
      ]),
      h
    ),
    istek(
      t,
      `${S} · kitap_haritasi_mufredat`,
      rest(ayar, 'student_curriculum_items', [['select', 'topic_id, start_date, passed_at'], ['student_id', `eq.${ogrenciId}`], ['workspace_id', ws]]),
      h
    ),
  ])
}

async function ogrenciKapsamlari(ayar, o, t, S, ogrenciId) {
  const h = { headers: o.basliklar }
  const ws = `eq.${o.workspaceId}`
  const [m, a] = await Promise.all([
    istek(t, `${S} · kapsam_mufredat`, rest(ayar, 'student_curriculum_items', [['select', 'scope_id'], ['workspace_id', ws], ['student_id', `eq.${ogrenciId}`]]), h),
    istek(t, `${S} · kapsam_atama`, rest(ayar, 'student_book_assignments', [['select', 'scope_id'], ['workspace_id', ws], ['student_id', `eq.${ogrenciId}`]]), h),
  ])
  const ids = new Set(
    [...(Array.isArray(m.govde) ? m.govde : []), ...(Array.isArray(a.govde) ? a.govde : [])]
      .map(r => r.scope_id)
      .filter(Boolean)
  )
  if (ids.size === 0) return
  await istek(
    t,
    `${S} · kapsam_adlari`,
    rest(ayar, 'academic_scopes', [['select', 'id, name, subject, level_exam, sort_order'], ['workspace_id', ws], ['id', `in.(${[...ids].join(',')})`]]),
    h
  )
}

async function ogrenciDetay(ayar, o, t) {
  const S = 'ogrenci_detay'
  const h = { headers: o.basliklar }
  const ws = `eq.${o.workspaceId}`
  const aday = o.ogrenciler.filter(s => s.workspace_id === o.workspaceId)
  const ogrenci = aday[Math.floor(Math.random() * aday.length)]
  const sid = `eq.${ogrenci.id}`
  const q = (ad, tablo, p) => istek(t, `${S} · ${ad}`, rest(ayar, tablo, p), h)

  await baglam(ayar, o, t, S)
  await Promise.all([
    layoutOgrenciler(ayar, o, t, S),
    (async () => {
      await q('ogrenci', 'students', [
        ['select', 'id, full_name, email, phone, grade_level, exam_type, notes, status, profile_id'],
        ['id', sid],
        ['workspace_id', ws],
      ])
      await Promise.all([
        q('odevler', 'homework_batches', [
          [
            'select',
            'id, title, description, due_date, status, weekly_flow_id, homework_items(id, status, book_id, section_id, books(title, tracking_mode), book_sections(title, order_index), book_tests(order_index))',
          ],
          ['student_id', sid],
          ['workspace_id', ws],
          ['status', 'in.(active,archived)'],
          ['order', 'due_date.desc'],
          ['limit', '20'],
        ]),
        q('haftalik_ozet', 'student_weekly_homework_summary_view', [['select', '*'], ['student_id', sid], ['workspace_id', ws]]),
        q('onay_sayisi', 'student_pending_approval_view', [['select', 'pending_approval_items'], ['student_id', sid], ['workspace_id', ws]]),
        q('geciken_sayisi', 'student_overdue_homework_view', [['select', 'overdue_items'], ['student_id', sid], ['workspace_id', ws]]),
        // Tüm satır: müdahale bölümü de bunu kullanıyor (B13 aşama 0).
        q('bu_hafta', 'teacher_student_operation_view', [['select', '*'], ['student_id', sid], ['workspace_id', ws]]),
        q('son_teslim', 'homework_items', [
          ['select', 'submitted_at, homework_batches!inner(student_id, workspace_id)'],
          ['homework_batches.student_id', sid],
          ['homework_batches.workspace_id', ws],
          ['submitted_at', 'not.is.null'],
          ['order', 'submitted_at.desc'],
          ['limit', '1'],
        ]),
        q('akademik_notlar', 'academic_notes', [
          ['select', 'id, note_text, pinned, created_at, profiles(full_name)'],
          ['student_id', sid],
          ['workspace_id', ws],
          ['order', 'created_at.desc'],
          ['limit', '100'],
        ]),
        q('gun_notlari', 'student_day_notes', [
          ['select', 'id, note_date, note_text'],
          ['student_id', sid],
          ['workspace_id', ws],
          ['order', 'note_date.desc'],
          ['limit', '100'],
        ]),
        q('mufredat', 'student_curriculum_items', [
          ['select', 'topic_id, scope_id, start_date, end_date, passed_at, topics(name), academic_scopes(name)'],
          ['student_id', sid],
          ['workspace_id', ws],
        ]),
        q('konu_temas', 'student_topic_contact_view', [
          ['select', 'topic_id, last_contact_date, last_contact_source, last_contact_amount'],
          ['student_id', sid],
          ['workspace_id', ws],
        ]),
        q('konu_acik_is', 'student_topic_open_work_view', [['select', 'topic_id, open_items'], ['student_id', sid], ['workspace_id', ws]]),
        q('konu_istisna', 'student_topic_overrides', [['select', 'topic_id, keep_active'], ['student_id', sid], ['workspace_id', ws]]),
        kitapHaritasi(ayar, o, t, S, ogrenci.id),
      ])
      // Müdahale bölümü (intervention-section.tsx): sayfa verisinden SONRA
      // çizilen ayrı sunucu bileşeni — iki sorgusu ikinci dalga (operasyon
      // satırını sayfadan alıyor).
      const simdi = Date.now()
      await Promise.all([
        q('mudahale_liste', 'interventions', [
          ['select', 'id, status, opened_status, opened_signals, note, session_id, opened_at, outcome, close_note, closed_at'],
          ['workspace_id', ws],
          ['student_id', sid],
          ['order', 'opened_at.desc'],
          ['limit', '20'],
        ]),
        q('mudahale_gorusmeler', 'service_sessions', [
          ['select', 'id, planned_at, actual_at, status'],
          ['workspace_id', ws],
          ['student_id', sid],
          ['status', 'neq.iptal'],
          ['planned_at', `gte.${new Date(simdi - 30 * 86_400_000).toISOString()}`],
          ['planned_at', `lte.${new Date(simdi + 14 * 86_400_000).toISOString()}`],
          ['order', 'planned_at.desc'],
          ['limit', '30'],
        ]),
      ])
    })(),
  ])

  // Akademik not EKLEME — senaryolar.mjs ile aynı işaret; detay açılışlarının ~%10'unda.
  if (ayar.yazmaAcik && yazilan < YAZMA_TAVANI && Math.random() < 0.1) {
    yazilan++
    await istek(t, `${S} · yazma_akademik_not`, `${ayar.url}/rest/v1/rpc/add_academic_note`, {
      method: 'POST',
      headers: o.basliklar,
      body: JSON.stringify({ p_student_id: ogrenci.id, p_note_text: `${YAZMA_ISARETI} ${yerelGun()}`, p_pinned: false }),
    })
  }
}

const SAYFALAR = { panel, ogrenciler, gorevler, ogrenci_detay: ogrenciDetay }

function sayfaSec() {
  const toplam = SAYFA_AGIRLIKLARI.reduce((s, [, w]) => s + w, 0)
  let r = Math.random() * toplam
  for (const [ad, w] of SAYFA_AGIRLIKLARI) {
    if ((r -= w) < 0) return ad
  }
  return SAYFA_AGIRLIKLARI[0][0]
}

/** Tek sayfa görüntüleme: karışımdan seçilir. `ad` verilirse o sayfa. */
export async function sayfaGoruntule(ayar, oturum, toplayici, ad = sayfaSec()) {
  await SAYFALAR[ad](ayar, oturum, toplayici)
}

export const SAYFA_ADLARI = Object.keys(SAYFALAR)

/** "5-20" → [5000, 20000] ms. Geçersizse varsayılan. */
export function dusunmeAraligi(deger) {
  const m = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/.exec(String(deger ?? '').trim())
  if (!m) return [5000, 20000]
  const a = Number(m[1]) * 1000
  const b = Number(m[2]) * 1000
  return a <= b ? [a, b] : [b, a]
}
