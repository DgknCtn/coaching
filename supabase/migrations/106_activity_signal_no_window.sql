-- ============================================================
-- 106 — HAREKET SİNYALİNDEN 30 GÜNLÜK PENCERE KALKIYOR (R8 §16)
--
-- SORUN (yerel doğrulamada görüldü): öğrencinin Genel Bakış kartı
-- "32 gündür yeni teslim yok" derken Dashboard'daki Takip Gerekenler
-- listesi "Şu an takip gerektiren öğrenci yok" diyordu.
--
-- Sebep 103'teki pencereydi: `submitted_at > NOW() - INTERVAL '30 days'`.
-- Son teslimi 32 gün önce olan öğrencinin `last_real_work_at` değeri
-- NULL dönüyor, NULL da "bu öğrenci hakkında veri yok" olarak
-- yorumlanıyordu (yeni öğrenciyi ilk gün müdahale listesine düşürmemek
-- için konmuş bilinçli bir kural).
--
-- Sonuç tam tersine dönüyordu: öğrenci ne kadar uzun süredir sessizse
-- listede görünme ihtimali o kadar AZALIYORDU. Eşiği en açık aşan
-- öğrenci, eşiğin dışına düşüyordu. §16'nın Tarık örneği tam olarak bu
-- kişi ve sinyalin varlık sebebi o.
--
-- ============================================================
-- PENCERE ZATEN GEREKSİZDİ
--
-- Gerekçesi "view'ın sınırsız büyümesini engellemek"ti ama bu alt
-- sorguların hepsi `MAX(...)` — pencereli de penceresiz de TEK satır
-- döndürüyorlar. Kazandırdığı bir şey yoktu, maliyeti bir kör nokta
-- oldu.
--
-- ============================================================
-- EŞİK SQL'E GÖMÜLMEZ (R7 §7 notu)
--
-- Asıl kusur 30 sayısının BURADA olmasıydı. 097/080'den beri geçerli
-- kural şu: "eşikler SQL'e gömülmedi ki ayarlanabilir kalsınlar" —
-- durum motorunun bütün sınırları `lib/student-status.ts` içinde
-- duruyor. Bu view bir eşik uygulamamalı, yalnız HAM ZAMANLARI
-- döndürmeli; "yeterince yakın mı" kararı çağıran tarafın.
--
-- Bu dosyadan sonra "son 30 gün içinde hayat belirtisi var mı" kararı
-- Dashboard'da, diğer eşiklerin yanında veriliyor.
--
-- NULL'IN ANLAMI DARALIYOR ve bu istenen şey: artık yalnız "hiç teslim
-- yok" demek (gerçekten yeni öğrenci), "son 30 günde teslim yok" değil.
--
-- GÖVDE 103'ÜN AYNISI; değişen tek şey üç alt sorgudaki zaman süzgeci.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

DROP VIEW IF EXISTS public.student_activity_signal_view CASCADE;

CREATE VIEW public.student_activity_signal_view
WITH (security_invoker = true) AS
SELECT
  s.workspace_id,
  s.id AS student_id,

  -- GERÇEK ÇALIŞMA: öğrencinin teslimi. Onay değil (081) — öğretmenin
  -- geç onaylaması öğrenciyi hareketsiz göstermemeli.
  (
    SELECT MAX(hi.submitted_at)
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hb.student_id = s.id
      AND hi.workspace_id = s.workspace_id
  ) AS last_real_work_at,

  -- PLANLAMA: niyet. Tek başına "çalışıyor" demek DEĞİL.
  (
    SELECT MAX(hi.updated_at)
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hb.student_id = s.id
      AND hi.workspace_id = s.workspace_id
      AND hi.planned_for_date IS NOT NULL
  ) AS last_planning_at,

  -- AKADEMİK NOT: öğrencinin kendi yazdıkları (101). Gün notu ve
  -- çalışma notu birlikte; ikisi de "karanlıkta değil" demek.
  GREATEST(
    (
      SELECT MAX(dn.updated_at) FROM public.student_day_notes dn
      WHERE dn.student_id = s.id
    ),
    (
      SELECT MAX(inn.updated_at) FROM public.homework_item_notes inn
      WHERE inn.student_id = s.id
    )
  ) AS last_academic_note_at

FROM public.students s
WHERE s.status = 'active';

REVOKE ALL ON public.student_activity_signal_view FROM anon;
GRANT SELECT ON public.student_activity_signal_view TO authenticated;


-- ============================================================
-- teacher_student_operation_view — 103'teki tanım DEĞİŞMEDEN geri
-- yazılıyor (yukarıdaki DROP ... CASCADE onu da düşürdü).
-- ============================================================

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

  -- Öğretmenin kontrolünü bekleyen — GLOBAL (Görevler ekranı bunu okur)
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
  x.submission_cutoff_at,

  -- 097 · AKIŞ KAPSAMLI ALANLAR — "Bu Hafta" kartı bunları okur.
  COALESCE(l.weekly_pending_approval, 0)          AS weekly_pending_approval,
  COALESCE(l.weekly_planned_units, 0)             AS weekly_planned_units,

  -- 103 · HAREKET SİNYALLERİ (R8 §15-§16)
  --
  -- Üçü AYRI tutuluyor çünkü belge onları ayırmayı şart koşuyor:
  -- planlama hareketi çalışma hareketi DEĞİLDİR.
  m.last_real_work_at,
  m.last_planning_at,
  m.last_academic_note_at,
  CASE
    WHEN m.last_real_work_at IS NULL THEN NULL
    ELSE FLOOR(EXTRACT(EPOCH FROM (NOW() - m.last_real_work_at)) / 86400)::INT
  END                                             AS days_since_real_work

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
LEFT JOIN public.student_activity_signal_view m
       ON m.student_id = s.id AND m.workspace_id = s.workspace_id
WHERE s.status = 'active';


-- ============================================================
-- 8) Yetkiler
-- ============================================================
-- DROP ... CASCADE yetkileri de düşürdü; 080'deki hâli birebir geri
-- yazılıyor.

REVOKE ALL ON public.student_active_flow_load_view FROM anon;
REVOKE ALL ON public.teacher_student_operation_view FROM anon;

GRANT SELECT ON public.student_active_flow_load_view TO authenticated;
GRANT SELECT ON public.teacher_student_operation_view TO authenticated;

-- ============================================================
-- ROLLBACK
--   103'teki iki view tanımını yeniden uygula.
-- ============================================================
