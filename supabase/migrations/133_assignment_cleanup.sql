-- ============================================================
-- 133 — ATANMIŞ KAYNAK TEMİZLİĞİ (M1.0-01 §1.2)
--
-- Gerçek kullanıma geçerken yanlış atanan kitaplar sistemde kalıcı hale
-- geliyordu: geri dönüş yolu yoktu. İki ayrı durum, iki ayrı işlem:
--
--   1. HİÇ KULLANILMAMIŞ kaynak (ödev kalemi ve resmi tamamlama yok):
--      SİLİNİR. Taslak, hedef ve video işaretleri CASCADE ile gider
--      (019, 022, 023).
--   2. KULLANILMIŞ kaynak: ARŞİVLENİR. Silinemez — homework_items ve
--      test_completions sba'ya ON DELETE kuralı olmadan bağlı (001) ve
--      geçmiş haftalar/raporlar bu satırlara dayanıyor. Arşivlenen
--      kaynağın AÇIK ödev kalemleri iptal edilir (öğrencinin güncel
--      sorumluluğundan çıkar); tamamlananlar ve test_completions olduğu
--      gibi kalır.
--
-- GERİ ALMA: unarchive_assignment. Aynı kitabı aynı dönemde yeniden
-- atamak UNIQUE (student_id, book_id, academic_term_id) yüzünden zaten
-- mümkün değildi; arşivden dönüş tek doğru yoldur. İptal edilen kalemler
-- GERİ GELMEZ — onlar yeni ödevle verilir (sessizce eski teslim tarihli
-- yük doğurmak yanlış olurdu).
--
-- DERS/KAPSAM DEĞİŞİMİ (§1.3) için yeni fonksiyon yok: set_student_book_scope
-- (098) yalnız scope_id'yi yazar; ilerleme, hedefler, tarihler ve ödev
-- geçmişi atamanın id'sine bağlı olduğu için olduğu gibi kalır.
--
-- GERİ ALMA (migration): dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- Kaynağın kullanılmış sayılıp sayılmadığı TEK yerde. INVOKER: doğrudan
-- çağrıda RLS geçerli; DEFINER fonksiyonların içinden sahibin yetkisiyle çalışır.
CREATE OR REPLACE FUNCTION public.assignment_is_used(p_assignment_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
           SELECT 1 FROM public.homework_items
           WHERE student_book_assignment_id = p_assignment_id
         )
      OR EXISTS (
           SELECT 1 FROM public.test_completions
           WHERE student_book_assignment_id = p_assignment_id
         );
$$;

REVOKE ALL ON FUNCTION public.assignment_is_used(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.assignment_is_used(UUID) TO authenticated;

-- ============================================================
-- delete_unused_assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_unused_assignment(p_assignment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments
  WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF public.assignment_is_used(p_assignment_id) THEN
    RAISE EXCEPTION 'Bu kaynak ödev veya ilerleme üretmiş; silinemez, arşivleyin.';
  END IF;

  DELETE FROM public.student_book_assignments WHERE id = p_assignment_id;

  RETURN jsonb_build_object('deleted_assignment_id', p_assignment_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.delete_unused_assignment(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.delete_unused_assignment(UUID) TO authenticated;

-- ============================================================
-- archive_assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.archive_assignment(p_assignment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_cancelled    INT;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments
  WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Açık kalemler aktif yükten çıkar. Tamamlananlara dokunulmaz.
  UPDATE public.homework_items
     SET status = 'cancelled', updated_at = NOW()
   WHERE student_book_assignment_id = p_assignment_id
     AND status IN ('pending', 'pending_approval');
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  UPDATE public.student_book_assignments
     SET status = 'archived', updated_at = NOW()
   WHERE id = p_assignment_id;

  -- Tüm kalemleri iptal olan aktif partiler de arşive iner: "Yayınlanan
  -- Ödevler"de boş bir aktif parti kalmasın (097'deki parti semantiği).
  UPDATE public.homework_batches hb
     SET status = 'archived', updated_at = NOW()
   WHERE hb.status = 'active'
     AND EXISTS (
       SELECT 1 FROM public.homework_items hi
       WHERE hi.homework_batch_id = hb.id
         AND hi.student_book_assignment_id = p_assignment_id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.homework_items hi
       WHERE hi.homework_batch_id = hb.id
         AND hi.status IN ('pending', 'pending_approval')
     );

  RETURN jsonb_build_object('assignment_id', p_assignment_id, 'cancelled_items', v_cancelled);
END;
$fn$;

REVOKE ALL ON FUNCTION public.archive_assignment(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.archive_assignment(UUID) TO authenticated;

-- ============================================================
-- unarchive_assignment
-- ============================================================
CREATE OR REPLACE FUNCTION public.unarchive_assignment(p_assignment_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_book_assignments
  WHERE id = p_assignment_id AND status = 'archived';

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.student_book_assignments
     SET status = 'active', updated_at = NOW()
   WHERE id = p_assignment_id;

  RETURN jsonb_build_object('assignment_id', p_assignment_id);
END;
$fn$;

REVOKE ALL ON FUNCTION public.unarchive_assignment(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.unarchive_assignment(UUID) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.unarchive_assignment(UUID);
--   DROP FUNCTION IF EXISTS public.archive_assignment(UUID);
--   DROP FUNCTION IF EXISTS public.delete_unused_assignment(UUID);
--   DROP FUNCTION IF EXISTS public.assignment_is_used(UUID);
-- ============================================================
