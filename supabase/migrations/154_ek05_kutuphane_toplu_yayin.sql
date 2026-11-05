-- ============================================================
-- 154 — EK-05 (04.11.2026): Koç havuzundan kütüphaneye SEÇEREK yayın
--
-- Sude kütüphaneden kitap ekleyemiyordu. Kaynak Kütüphanesi yalnız
-- kütüphane alanındaki 'approved' kitapları listeliyor (069); Burak'ın
-- 131 kitabı Burak'ın kendi havuzunda ve kütüphaneye girmenin tek yolu
-- tek tek "öner → yönetici onayla" idi. Dosyayla tüm kataloğu taşımak
-- (≈15 MB) 4 MB sınırına takılıyordu.
--
-- Karar: platform yöneticisi bir koçun havuzundan kitapları SEÇER ve
-- kütüphaneye yayınlar; diğer koçlar kütüphaneden istediğini alır
-- (copy_library_books, 069 — değişmedi).
--
-- GİZLİLİK SINIRI: başka öğretmenin verisine genel erişim açılmaz.
--   - İki fonksiyon da yalnız is_platform_admin() için çalışır.
--   - Liste yalnız kitap künyesini döndürür (ad, yayınevi, ders, düzey,
--     yayın durumu, bölüm/test sayısı); öğrenci ya da ilerleme yok.
--   - Yayınlanan, kütüphanedeki AYRI bir kopyadır (_copy_book_tree);
--     koçun kitabı yerinde kalır. Konu eşlemesi alan dışına taşınmaz (069).
--
-- Tek kitap kendi alt işleminde: biri hata verirse o kitap geri alınır
-- (yarım kopya kalmaz), rapora yazılır, diğerleri devam eder. Zaten
-- yayınlanmış kitap atlanır — tekrar çalıştırmak kopya üretmez.
-- ============================================================


CREATE OR REPLACE FUNCTION public.admin_list_workspace_books(p_workspace_id UUID)
RETURNS TABLE (
  id             UUID,
  title          TEXT,
  subject        TEXT,
  publisher      TEXT,
  level_exam     TEXT,
  edition_year   INTEGER,
  tracking_mode  TEXT,
  library_status TEXT,
  section_count  BIGINT,
  test_count     BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT b.id, b.title, b.subject, b.publisher, b.level_exam, b.edition_year,
         b.tracking_mode, b.library_status,
         (SELECT COUNT(*) FROM public.book_sections s WHERE s.book_id = b.id AND s.status = 'active'),
         (SELECT COUNT(*) FROM public.book_tests t WHERE t.book_id = b.id AND t.status = 'active')
  FROM public.books b
  JOIN public.workspaces w ON w.id = b.workspace_id
  WHERE b.workspace_id = p_workspace_id
    AND NOT w.is_library
    AND b.status = 'active'
  ORDER BY b.subject, b.title;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_list_workspace_books(UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.admin_list_workspace_books(UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.publish_books_to_library(
  p_book_ids UUID[],
  p_reason   TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_library_ws UUID;
  v_book_id    UUID;
  v_src        public.books%ROWTYPE;
  v_new_id     UUID;
  v_published  INTEGER := 0;
  v_skipped    JSONB := '[]'::JSONB;
  v_failed     JSONB := '[]'::JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;
  PERFORM public.require_admin_reason(p_reason);

  IF p_book_ids IS NULL OR array_length(p_book_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Kitap seçilmedi';
  END IF;
  IF array_length(p_book_ids, 1) > 50 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 50 kitap yayınlanabilir';
  END IF;

  SELECT id INTO v_library_ws FROM public.workspaces WHERE is_library LIMIT 1;
  IF v_library_ws IS NULL THEN
    RAISE EXCEPTION 'Kütüphane çalışma alanı tanımlı değil';
  END IF;

  FOREACH v_book_id IN ARRAY p_book_ids LOOP
    SELECT * INTO v_src FROM public.books WHERE id = v_book_id;

    IF v_src.id IS NULL OR v_src.workspace_id = v_library_ws OR v_src.status <> 'active' THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_book_id, 'reason', 'Kitap bulunamadı ya da aktif değil');
      CONTINUE;
    END IF;

    -- Zaten yayında: kütüphanedeki kopyası hâlâ duruyorsa tekrar kopyalanmaz.
    IF v_src.library_status = 'approved' AND EXISTS (
      SELECT 1 FROM public.books lb
      WHERE lb.id = v_src.library_source_book_id
        AND lb.workspace_id = v_library_ws
        AND lb.status = 'active'
    ) THEN
      v_skipped := v_skipped || jsonb_build_object('id', v_book_id, 'title', v_src.title, 'reason', 'Zaten kütüphanede');
      CONTINUE;
    END IF;

    BEGIN
      v_new_id := public._copy_book_tree(
        p_book_id             => v_book_id,
        p_target_workspace_id => v_library_ws,
        p_term_id             => NULL,
        p_title               => NULL,
        p_edition_year        => NULL,
        p_library_source      => NULL,
        p_library_status      => 'approved'
      );

      UPDATE public.books
      SET library_status = 'approved',
          library_source_book_id = v_new_id,
          library_review_note = NULL,
          updated_at = NOW()
      WHERE id = v_book_id;

      v_published := v_published + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Alt işlem geri alınır: yarım kopya kalmaz.
      v_failed := v_failed || jsonb_build_object('id', v_book_id, 'title', v_src.title, 'reason', SQLERRM);
    END;
  END LOOP;

  PERFORM public.record_admin_action(
    'library.bulk_publish', NULL, NULL, p_reason,
    jsonb_build_object('requested', array_length(p_book_ids, 1)),
    jsonb_build_object('published', v_published, 'skipped', jsonb_array_length(v_skipped), 'failed', jsonb_array_length(v_failed))
  );

  RETURN jsonb_build_object('published', v_published, 'skipped', v_skipped, 'failed', v_failed);
END;
$fn$;

REVOKE ALL ON FUNCTION public.publish_books_to_library(UUID[], TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.publish_books_to_library(UUID[], TEXT) TO authenticated;


-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.publish_books_to_library(UUID[], TEXT);
--   DROP FUNCTION IF EXISTS public.admin_list_workspace_books(UUID);
--   -- Yayınlanmış kopyalar kütüphanede kalır; geri almak için kütüphane
--   -- kitabı arşivlenir (silinmez — koçlar kopyalamış olabilir).
-- ============================================================
