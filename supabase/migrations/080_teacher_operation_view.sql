-- ============================================================
-- 080_teacher_operation_view
--
-- R7 / Site Testi 01 · "Dashboard rapor değil, operasyon ekranıdır."
--
-- ============================================================
-- SORUN: DASHBOARD'UN SORDUĞU SORU DEĞİŞTİ
-- ============================================================
-- Mevcut `teacher_student_overview_view` (016, en son 017) öğrencinin
-- KİTAP İLERLEMESİNİ özetliyor: toplam test, tamamlanan test, kitap
-- sayısı, bu haftanın atanan/tamamlanan sayısı. Belge bunların hepsini
-- ekrandan çıkarıyor:
--
--   "Kitap ilerleme detayları, test/sayfa dağılımları ve uzun raporlar
--    bu ekranda sürekli görünmemelidir."
--
-- Yerine dört soru geliyor (§2): kim ne kadar teslim etti, kim benim
-- kontrolümü bekliyor, kim gecikti, sıradaki temasım kiminle ne zaman.
-- Bu view onları döndürüyor.
--
-- ============================================================
-- ESKİ VIEW SİLİNMİYOR
-- ============================================================
-- `/teacher/tasks` ve öğrenci listesi hâlâ onu okuyor. Yeni ekranın
-- ihtiyacı diye çalışan iki ekranı bozmanın karşılığı yok; iki view yan
-- yana duruyor ve her biri kendi sorusunu yanıtlıyor.
--
-- (017'deki `risk_status` sütunu ise artık ölü: hiçbir tüketicisi yok ve
-- yerini TypeScript'teki durum motoru aldı. Kaldırılması ayrı bir iş —
-- CREATE OR REPLACE VIEW sütun silemez, view'ı DROP etmek gerekir ve o
-- da bağlı ekranları aynı anda taşımayı gerektirir.)
--
-- ============================================================
-- computed_status BURADA HESAPLANMIYOR
-- ============================================================
-- Belge eşikler için açıkça *"kodda sabit gömülmek yerine ayarlanabilir
-- konfigürasyon olarak tutulması önerilir"* diyor. SQL'e gömülen bir
-- eşik ayarlanabilir değildir: değiştirmek migration gerektirir. Karar
-- `lib/student-status.ts`'te; bu view yalnız KARARIN GİRDİLERİNİ
-- döndürür.
--
-- ============================================================
-- TEKRAR SAYIM YASAK
-- ============================================================
-- §9'un son uyarısı: *"Aynı test veya sayfa birden fazla sorgudan
-- dönerse Dashboard sayılarında tekrar sayılmamalı. Hesap benzersiz
-- çalışma kimliği üzerinden yapılmalı."* Bu yüzden her sayım
-- COUNT(DISTINCT hi.id).
--
-- ============================================================
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu)
-- ============================================================
-- View'lar CREATE OR REPLACE; sütun sırası değişirse Postgres 42P16
-- verir, bu yüzden yeni view'lar DROP ... IF EXISTS ile açılıyor.

-- ============================================================
-- 1) Aktif haftanın yükü ve teslimi
-- ============================================================
--
-- KAPSAM AKTİF AKIŞTIR, TAKVİM HAFTASI DEĞİL (R7/05). Haftanın sınırı
-- `weekly_flows`; gelecek tarihli ödev (Senaryo B) `weekly_flow_id`
-- NULL olduğu için buraya hiç girmez.
--
-- TESLİM = ÖĞRENCİNİN GÖNDERİMİ (§5 ve R7/05 kabul #8):
--   "Teslim edilen = öğrencinin onaya gönderdiği + daha önce öğretmen
--    tarafından onaylanmış çalışmalar."
-- Öğretmenin henüz bakmamış olması öğrenciyi geride göstermez. İade
-- edilen çalışma `status`'ü 'pending'e döndüğü için kendiliğinden
-- düşer — "yeniden gönderildiğinde hesaba girer."

DROP VIEW IF EXISTS public.student_active_flow_load_view CASCADE;

CREATE VIEW public.student_active_flow_load_view
WITH (security_invoker = true) AS
SELECT
  f.workspace_id,
  f.student_id,
  f.id                                            AS weekly_flow_id,
  f.starts_at                                     AS flow_started_at,
  f.due_at                                        AS flow_due_at,
  COUNT(DISTINCT hi.id)                           AS weekly_total,
  COUNT(DISTINCT hi.id) FILTER (
    WHERE hi.status IN ('pending_approval', 'completed')
  )                                               AS weekly_submitted,
  MIN(hb.created_at)                              AS first_published_at
FROM public.weekly_flows f
LEFT JOIN public.homework_batches hb
       ON hb.weekly_flow_id = f.id AND hb.status = 'active'
LEFT JOIN public.homework_items hi
       ON hi.homework_batch_id = hb.id AND hi.status <> 'cancelled'
WHERE f.status = 'active'
GROUP BY f.workspace_id, f.student_id, f.id, f.starts_at, f.due_at;

-- ============================================================
-- 2) Sıradaki temas ve teslim kesim saati
-- ============================================================
--
-- §6: *"Sonraki Temas alanı öğretmenin öğrenciyi ne zaman göreceğini
-- doğrudan gösterir."* Dahil edilen temaslar: birebir ders, online ders,
-- grup dersi, koçluk görüşmesi — yani BÜTÜN hizmet türleri.
--
-- KESİM SAATİ TEMASIN KENDİSİ DEĞİL: *"Dashboard hesabı her zaman ders
-- başlangıcını teslim sonu kabul etmemeli. Online grup dersinde mevcut
-- karar: ödev, ders başlangıcından 6 saat önce teslim edilmiş olmalı."*
-- Bu pay 074'te zaten modellenmiş (`submission_offset_minutes`), yeni
-- bir kural yazılmıyor.
--
-- YALNIZ HENÜZ SONUÇLANMAMIŞ OTURUMLAR: 'yapildi'/'iptal'/'yapilmadi'
-- geçmiştir. 'ertelendi' ise yeni saatiyle (actual_at) hâlâ gelecektir.

DROP VIEW IF EXISTS public.student_next_contact_view CASCADE;

CREATE VIEW public.student_next_contact_view
WITH (security_invoker = true) AS
SELECT DISTINCT ON (ss.workspace_id, ss.student_id)
  ss.workspace_id,
  ss.student_id,
  COALESCE(ss.actual_at, ss.planned_at)           AS next_contact_at,
  sv.kind                                         AS next_contact_kind,
  sv.participation                                AS next_contact_participation,
  COALESCE(ss.actual_at, ss.planned_at)
    - (COALESCE(sv.submission_offset_minutes, 0) * INTERVAL '1 minute')
                                                  AS submission_cutoff_at
FROM public.service_sessions ss
JOIN public.student_services sv ON sv.id = ss.service_id
WHERE ss.status IN ('planlandi', 'ertelendi')
  AND COALESCE(ss.actual_at, ss.planned_at) >= NOW()
ORDER BY
  ss.workspace_id,
  ss.student_id,
  COALESCE(ss.actual_at, ss.planned_at) ASC;

-- ============================================================
-- 3) Operasyon görünümü — Dashboard'un tek kaynağı
-- ============================================================
--
-- NOT İÇERİĞİ BURADA YOK, YALNIZ SİNYAL VAR (§8):
--   "Özel akademik notun içeriği Dashboard'da yer almaz; yalnız 'Not
--    var' sinyali görünür. ... Böylece koçluk görüşmelerinde ekran
--    paylaşımı daha güvenli olur."
-- Bu yüzden `has_important_note` bir BOOLEAN. Metni buraya koyup
-- arayüzde gizlemek yetmezdi: veri tarayıcıya inerdi.

DROP VIEW IF EXISTS public.teacher_student_operation_view CASCADE;

CREATE VIEW public.teacher_student_operation_view
WITH (security_invoker = true) AS
SELECT
  s.workspace_id,
  s.id                                            AS student_id,
  s.full_name                                     AS student_full_name,
  s.exam_type,
  s.grade_level,

  -- Haftalık yük ve teslim
  l.weekly_flow_id,
  l.flow_started_at,
  l.flow_due_at,
  l.first_published_at,
  COALESCE(l.weekly_total, 0)                     AS weekly_total,
  COALESCE(l.weekly_submitted, 0)                 AS weekly_submitted,
  CASE
    WHEN COALESCE(l.weekly_total, 0) = 0 THEN 0
    ELSE ROUND(l.weekly_submitted::NUMERIC / l.weekly_total::NUMERIC * 100)
  END                                             AS weekly_submitted_percent,

  -- Öğretmenin kontrolünü bekleyen
  COALESCE(a.pending_approval_items, 0)           AS approval_pending_count,

  -- Teslim tarihi geçmiş, tamamlanmamış benzersiz çalışma
  COALESCE(o.overdue_items, 0)                    AS overdue_work_count,

  -- Durum bildirimi
  c.last_check_in_at,
  c.pending_check_in_since                        AS status_update_due_at,

  -- Yalnız SİNYAL — içerik değil.
  (n.important_count > 0)                         AS has_important_note,
  COALESCE(n.note_count, 0)                       AS note_count,

  -- Sıradaki temas
  x.next_contact_at,
  x.next_contact_kind,
  x.next_contact_participation,
  x.submission_cutoff_at

FROM public.students s
LEFT JOIN public.student_active_flow_load_view l
       ON l.student_id = s.id AND l.workspace_id = s.workspace_id
LEFT JOIN public.student_pending_approval_view a
       ON a.student_id = s.id AND a.workspace_id = s.workspace_id
LEFT JOIN public.student_overdue_homework_view o
       ON o.student_id = s.id AND o.workspace_id = s.workspace_id
LEFT JOIN public.student_check_in_status_view c
       ON c.student_id = s.id AND c.workspace_id = s.workspace_id
LEFT JOIN public.student_next_contact_view x
       ON x.student_id = s.id AND x.workspace_id = s.workspace_id
LEFT JOIN (
  SELECT
    workspace_id,
    student_id,
    COUNT(*)                                AS note_count,
    COUNT(*) FILTER (WHERE pinned)          AS important_count
  FROM public.academic_notes
  GROUP BY workspace_id, student_id
) n ON n.student_id = s.id AND n.workspace_id = s.workspace_id
WHERE s.status = 'active';

-- ============================================================
-- 4) Yetkiler
-- ============================================================
-- security_invoker: view çağıranın haklarıyla çalışır, bu yüzden
-- altındaki tabloların RLS'i aynen geçerli (049'un kararı).

REVOKE ALL ON public.student_active_flow_load_view FROM anon;
REVOKE ALL ON public.student_next_contact_view FROM anon;
REVOKE ALL ON public.teacher_student_operation_view FROM anon;

GRANT SELECT ON public.student_active_flow_load_view TO authenticated;
GRANT SELECT ON public.student_next_contact_view TO authenticated;
GRANT SELECT ON public.teacher_student_operation_view TO authenticated;
