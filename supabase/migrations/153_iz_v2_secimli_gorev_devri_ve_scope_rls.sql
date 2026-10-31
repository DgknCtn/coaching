-- ============================================================
-- 153 — İz V2 tamamlama
--
--   1) Açık akademik görevleri SEÇEREK yeni haftaya devretmek (R04)
--   2) academic_scopes öğrenci politikası anon'da 42501 veriyordu (SEC-01)
--
-- ------------------------------------------------------------
-- 1) SEÇİMLİ GÖREV DEVRİ
--
-- roll_open_tasks_to_flow (148) her Haftam / Haftalık Akış açılışında
-- tarihsiz açık görevleri aktif haftaya kendiliğinden taşıyordu. R04:
-- "Yeni haftaya aktarılacak açık işler ayrıca seçilsin." Öğretmen hafta
-- geçişi penceresinde bir görevi seçmezse, bir sonraki ekran açılışı onu
-- yine de taşımamalı. Bu yüzden ekran açılışındaki çağrılar kaldırıldı
-- (uygulama kodu); taşıma artık iki anda olur:
--
--   - Ödev Planlama'daki hafta geçişi → yalnız SEÇİLEN görevler
--     (carry_academic_tasks)
--   - Haftalık Akış'tan hafta açma → eski davranış korunur: tarihsiz açık
--     görevler hafta açılırken bir kez taşınır (roll_open_tasks_to_flow)
--
-- Görev TEK birimdir (kısmi kalem yok); taşınır, kopyalanmaz. Geldiği
-- hafta origin_flow_id'de kalır (148) — öğrenci ekranı "önceki haftadan"
-- rozetini buradan okur.
--
-- ------------------------------------------------------------
-- 2) academic_scopes_select_student (148)
--
-- Politika student_courses'a bakıyor; anon'un student_courses üzerinde
-- SELECT yetkisi yok. Politika TO public olduğu için anon sorgusunda da
-- değerlendiriliyor ve boş sonuç yerine 42501 dönüyordu
-- (tests/anon-endpoint-probe.test.ts). Öğrenci politikası zaten yalnız
-- oturumlu öğrenci içindir: TO authenticated. Anon'a yeni yetki
-- AÇILMAZ; anon için politika hiç değerlendirilmez ve sonuç boştur.
-- ============================================================


CREATE OR REPLACE FUNCTION public.carry_academic_tasks(p_task_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_student_id UUID;
  v_flow_id    UUID;
  v_count      INTEGER := 0;
BEGIN
  IF p_task_ids IS NULL OR array_length(p_task_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('carried', 0);
  END IF;

  -- Yalnız öğretmen/sahip: devir hafta yönetimidir, öğrenci beyanı değil.
  IF EXISTS (
    SELECT 1 FROM public.academic_tasks t
    JOIN public.students s ON s.id = t.student_id
    WHERE t.id = ANY(p_task_ids)
      AND NOT public.has_workspace_role(s.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF (
    SELECT COUNT(DISTINCT t.student_id) FROM public.academic_tasks t WHERE t.id = ANY(p_task_ids)
  ) > 1 THEN
    RAISE EXCEPTION 'Devredilecek görevler tek bir öğrenciye ait olmalı.';
  END IF;

  SELECT t.student_id INTO v_student_id
  FROM public.academic_tasks t WHERE t.id = ANY(p_task_ids) LIMIT 1;
  IF v_student_id IS NULL THEN
    RETURN jsonb_build_object('carried', 0);
  END IF;

  SELECT id INTO v_flow_id FROM public.weekly_flows
  WHERE student_id = v_student_id AND status = 'active'
  LIMIT 1;
  IF v_flow_id IS NULL THEN
    RAISE EXCEPTION 'Açık bir çalışma haftası yok; önce yeni haftayı açın.';
  END IF;

  UPDATE public.academic_tasks
     SET weekly_flow_id = v_flow_id,
         origin_flow_id = COALESCE(origin_flow_id, weekly_flow_id, v_flow_id),
         planned_for_date = NULL
   WHERE id = ANY(p_task_ids)
     AND student_id = v_student_id
     AND status = 'open'
     AND weekly_flow_id IS DISTINCT FROM v_flow_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('carried', v_count, 'flow_id', v_flow_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.carry_academic_tasks(UUID[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.carry_academic_tasks(UUID[]) TO authenticated;


DROP POLICY IF EXISTS academic_scopes_select_student ON public.academic_scopes;
CREATE POLICY academic_scopes_select_student ON public.academic_scopes
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.student_courses sc
      WHERE sc.scope_id = academic_scopes.id
        AND (SELECT public.is_student_self(sc.student_id))
    )
  );


-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.carry_academic_tasks(UUID[]);
--   -- academic_scopes_select_student için 148 tanımını yeniden çalıştırın
--   -- (TO public; anon 42501 geri gelir).
-- ============================================================
