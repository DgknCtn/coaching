-- ============================================================
-- 134 — ÖĞRENCİ ARŞİVİ, GERİ ALMA VE KALICI SİLME (M1.0-01 §1.1)
--
-- Gerçek kullanıma geçerken test öğrencileri aktif listelerde kalıcı
-- hale geliyordu. İki işlem:
--
--   ARŞİVLE (varsayılan, gerçek öğrenci): status='archived'. Öğrenci
--   Dashboard, Görevler, yaklaşan temaslar, aktif liste ve takip
--   sinyallerinden çıkar; akademik geçmiş SİLİNMEZ ve geri alınabilir.
--   Kota yalnız aktif öğrenciyi saydığı için arşiv bir koltuk boşaltır.
--
--   KALICI SİL (test öğrencisi): yalnız ARŞİVDEKİ öğrenci ve yalnız
--   tam adı birebir yazılarak. İki adım, gerçek bir öğrencinin tek
--   tıkla yok olmasını engeller. Silmeden önce öğrencinin adı
--   audit_events'e yazılır: satır gittikten sonra izin tek kaynağı odur.
--
-- SİLME SIRASI AÇIK YAZILIR. homework_items ve test_completions
-- student_book_assignments'a ON DELETE kuralı olmadan bağlı (001);
-- students'tan başlayan tek bir CASCADE bugün aynı ifadede hepsini
-- sildiği için geçer, ama bu sıraya güvenmek bir sonraki FK ile kırılır.
-- students'a bağlı diğer tüm tablolar ON DELETE CASCADE (001–119).
--
-- ÖĞRENCİ HESABI: profiles satırı silinmez (auth kullanıcısı başka bir
-- çalışma alanında da olabilir); yalnız bu alandaki 'student' üyeliği
-- kaldırılır.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS archived_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ============================================================
-- archive_student
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_student(p_student_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.students
     SET status = 'archived',
         archived_at = NOW(),
         archived_by_profile_id = public.current_profile_id(),
         updated_at = NOW()
   WHERE id = p_student_id;

  RETURN jsonb_build_object('student_id', p_student_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.archive_student(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_student(UUID) TO authenticated;

-- ============================================================
-- restore_student
--
-- Kota tetikleyicisi (052) yalnız INSERT'te çalışıyor; arşivden dönüş
-- bir UPDATE olduğu için sınır burada aynı metinle denetlenir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_student(p_student_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_limit        INTEGER;
  v_count        INTEGER;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id AND status = 'archived';

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT student_limit INTO v_limit FROM public.workspaces WHERE id = v_workspace_id;
  IF v_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_count
    FROM public.students
    WHERE workspace_id = v_workspace_id AND status = 'active';
    IF v_count >= v_limit THEN
      RAISE EXCEPTION
        'Planınızın öğrenci sınırına ulaştınız (% öğrenci). Arşivden geri almak için planınızı yükseltin ya da başka bir öğrenciyi arşivleyin.',
        v_limit;
    END IF;
  END IF;

  UPDATE public.students
     SET status = 'active',
         archived_at = NULL,
         archived_by_profile_id = NULL,
         updated_at = NOW()
   WHERE id = p_student_id;

  RETURN jsonb_build_object('student_id', p_student_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.restore_student(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.restore_student(UUID) TO authenticated;

-- ============================================================
-- purge_archived_student
-- ============================================================
CREATE OR REPLACE FUNCTION public.purge_archived_student(
  p_student_id   UUID,
  p_confirm_name TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_student RECORD;
BEGIN
  SELECT id, workspace_id, full_name, status, profile_id
    INTO v_student
  FROM public.students WHERE id = p_student_id;

  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Student not found';
  END IF;

  IF NOT public.has_workspace_role(v_student.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF v_student.status <> 'archived' THEN
    RAISE EXCEPTION 'Kalıcı silme yalnız arşivdeki öğrenci için yapılabilir. Önce arşivleyin.';
  END IF;

  IF btrim(COALESCE(p_confirm_name, '')) <> btrim(v_student.full_name) THEN
    RAISE EXCEPTION 'Onay için öğrencinin adını birebir yazın.';
  END IF;

  -- İz önce yazılır: silmeden sonra öğrenciye dair başka kayıt kalmaz.
  PERFORM public.log_audit_event(
    v_student.workspace_id,
    'student.purge',
    'student',
    v_student.id,
    jsonb_build_object('full_name', v_student.full_name)
  );

  DELETE FROM public.test_completions WHERE student_id = p_student_id;

  DELETE FROM public.homework_items
   WHERE homework_batch_id IN (
     SELECT id FROM public.homework_batches WHERE student_id = p_student_id
   );

  DELETE FROM public.homework_batches WHERE student_id = p_student_id;

  IF v_student.profile_id IS NOT NULL THEN
    DELETE FROM public.workspace_members
     WHERE workspace_id = v_student.workspace_id
       AND profile_id = v_student.profile_id
       AND role = 'student';
  END IF;

  -- Kalan bağımlılar (atamalar, hizmetler, oturumlar, notlar, akışlar,
  -- finans, giriş kodu…) ON DELETE CASCADE ile gider.
  DELETE FROM public.students WHERE id = p_student_id;

  RETURN jsonb_build_object('purged_student_id', p_student_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_archived_student(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purge_archived_student(UUID, TEXT) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.purge_archived_student(UUID, TEXT);
--   DROP FUNCTION IF EXISTS public.restore_student(UUID);
--   DROP FUNCTION IF EXISTS public.archive_student(UUID);
--   ALTER TABLE public.students DROP COLUMN IF EXISTS archived_by_profile_id;
--   ALTER TABLE public.students DROP COLUMN IF EXISTS archived_at;
-- ============================================================
