-- ============================================================
-- 120 — AKTİVASYON HUNİSİ (PRD · B17)
--
-- ============================================================
-- NEDEN
--
-- "Kayıt olan öğretmen gerçekten kullanmaya başlıyor mu, nerede
-- takılıyor?" sorusunun ölçümü yoktu. Yeni bir olay kaydı YAZMADAN, var
-- olan tabloların ilk satırlarından her çalışma alanının kilometre
-- taşları türetiliyor:
--
--   alan açıldı → ilk öğrenci → ilk kitap ataması → ilk ödev yayını →
--   ilk öğretmen onayı → ilk öğrenci/veli katılımı
--
-- Geçmiş için de çalışır (geriye dönük veri zaten tablolarda).
--
-- YALNIZ PLATFORM YÖNETİCİSİ. Öğrenci verisi dönmez — yalnız zaman
-- damgaları ve alan adı (admin_list_workspaces ile aynı sınıf, 060).
-- Kütüphane alanı (069) bir kiracı değil; hariç.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_activation_funnel(p_days INTEGER DEFAULT 90)
RETURNS TABLE (
  workspace_id        UUID,
  workspace_name      TEXT,
  created_at          TIMESTAMPTZ,
  first_student_at    TIMESTAMPTZ,
  first_assignment_at TIMESTAMPTZ,
  first_homework_at   TIMESTAMPTZ,
  first_approval_at   TIMESTAMPTZ,
  first_join_at       TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.created_at,
    (SELECT MIN(s.created_at) FROM public.students s WHERE s.workspace_id = w.id),
    (SELECT MIN(a.created_at) FROM public.student_book_assignments a WHERE a.workspace_id = w.id),
    (SELECT MIN(b.created_at) FROM public.homework_batches b WHERE b.workspace_id = w.id),
    (SELECT MIN(i.approved_at) FROM public.homework_items i
       WHERE i.workspace_id = w.id AND i.approved_at IS NOT NULL),
    (SELECT MIN(m.created_at) FROM public.workspace_members m
       WHERE m.workspace_id = w.id AND m.role IN ('student', 'parent') AND m.status = 'active')
  FROM public.workspaces w
  WHERE NOT w.is_library
    AND w.created_at >= NOW() - make_interval(days => LEAST(GREATEST(COALESCE(p_days, 90), 1), 730))
  ORDER BY w.created_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_activation_funnel(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activation_funnel(INTEGER) TO authenticated;

DO $dogrula$
BEGIN
  IF has_function_privilege('anon', 'public.admin_activation_funnel(integer)', 'EXECUTE') THEN
    RAISE EXCEPTION '120 DOĞRULAMA: anon''a açık.';
  END IF;
  RAISE NOTICE '120: aktivasyon hunisi yalnız platform yöneticisine.';
END;
$dogrula$;

-- ROLLBACK: DROP FUNCTION IF EXISTS public.admin_activation_funnel(INTEGER);
