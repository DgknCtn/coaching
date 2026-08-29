-- ============================================================
-- 028_teacher_manual_completion  (R6-03)
--
-- Bugün bir çalışmanın tamamlanmış sayılabilmesi tek zincire bağlı:
--   ödev ver -> öğrenci gönder -> öğretmen onayla
--
-- Gerçek kullanımda bu zincir sık sık kurulmuyor: öğrenci sisteme
-- eklenmeden önce bazı testleri bitirmiş oluyor, panelden göndermeyi
-- unutuyor ama öğretmen çalışmayı başka şekilde kontrol ediyor, ya da
-- süresi geçmiş bir çalışma sonradan tamamlanıyor. R6-03 eğitmene bu
-- durumlarda DOĞRUDAN akademik kayıt yetkisi veriyor.
--
-- YENİ TABLO YOK. Şema bu işi zaten kaldırıyor:
--   - test_completions.source CHECK'i teacher_manual değerini destekliyor
--     (001_initial_schema.sql), yani "kayıt kaynağı" ayrımı hazır.
--   - uniq_active_test_completion kısmi indeksi (001) atama+birim başına tek
--     aktif tamamlanma garantisi veriyor -> duplicate imkânsız.
--   - Sayfa takipli kitapta her fiziksel sayfa ayrı bir book_tests satırıdır
--     (022) ve section_id'ye bağlıdır. "F1 sf.15 ile F2 sf.15 ayrı çalışmadır"
--     kuralı bu yüzden şemadan geliyor; ek kontrol gerekmiyor.
--
-- KAVRAMSAL AYRIM (dokümanın 4. maddesi)
--   Onayla           -> öğrenci gönderimini onaylar   (source = homework)
--   Tamamlandı İşle  -> eğitmenin doğrudan yetkisi    (source = teacher_manual)
-- Sonuç aynı statüye gitse de kayıt kaynağı ayrışır ve geçmişte okunabilir.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. Üç fonksiyon da DROP edilir;
-- hiçbir tablo/kolon eklenmediği için veri kaybı olmaz.
-- ============================================================

-- ============================================================
-- 1) complete_units_manually
--
-- Seçili birimleri eğitmen yetkisiyle tamamlanmış yapar.
--
-- DAVRANIŞ (dokümanın 11. maddesi):
--   - Birimin AÇIK bir homework_items kaydı varsa o kayıt completed yapılır.
--     Yeni assignment/completion zinciri ÜRETİLMEZ; mevcut öğenin durumu
--     güncellenir.
--   - Açık kaydı yoksa doğrudan test_completions'a teacher_manual yazılır.
--   - Zaten aktif tamamlanması olan birim sessizce atlanır (idempotent).
--     Aynı çağrı iki kez gitse de duplicate oluşmaz.
--   - Süresi geçmiş bir çalışma tamamlandığında homework_items.status artık
--     pending olmadığı için aktif "Süresi Geçen" sayısından kendiliğinden
--     düşer (student_overdue_homework_view yalnız pending sayıyor).
-- ============================================================
CREATE OR REPLACE FUNCTION public.complete_units_manually(
  p_student_book_assignment_id UUID,
  p_book_test_ids              UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id   UUID;
  v_sba          public.student_book_assignments%ROWTYPE;
  v_test_id      UUID;
  v_item         public.homework_items%ROWTYPE;
  v_completed    INT := 0;
  v_skipped      INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_sba
  FROM public.student_book_assignments
  WHERE id = p_student_book_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  -- Bu, öğrencinin değil EĞİTMENİN yetkisidir; is_student_self kabul edilmez.
  IF NOT public.has_workspace_role(v_sba.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOREACH v_test_id IN ARRAY COALESCE(p_book_test_ids, ARRAY[]::UUID[])
  LOOP
    -- Birim gerçekten bu kitaba mı ait? Farklı bir kitabın/bölümün test
    -- id'si gönderilerek kapsam dışına yazılamamalı.
    IF NOT EXISTS (
      SELECT 1 FROM public.book_tests bt
      WHERE bt.id = v_test_id AND bt.book_id = v_sba.book_id
    ) THEN
      RAISE EXCEPTION 'Birim bu kitaba ait değil';
    END IF;

    -- Zaten aktif tamamlanması varsa hiçbir şey yapma (idempotent).
    IF EXISTS (
      SELECT 1 FROM public.test_completions tc
      WHERE tc.student_book_assignment_id = p_student_book_assignment_id
        AND tc.book_test_id = v_test_id
        AND tc.status = 'active'
    ) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Açık bir ödev kalemi var mı? (iptal edilmemiş, tamamlanmamış)
    SELECT hi.* INTO v_item
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hi.student_book_assignment_id = p_student_book_assignment_id
      AND hi.book_test_id = v_test_id
      AND hi.status IN ('pending', 'pending_approval')
      AND hb.status = 'active'
    ORDER BY hb.due_date DESC
    LIMIT 1;

    IF FOUND THEN
      -- Mevcut öğenin durumu güncellenir; yeni zincir üretilmez.
      UPDATE public.homework_items
      SET status = 'completed',
          completed_at = NOW(),
          completed_by_profile_id = v_profile_id,
          approved_at = NOW(),
          approved_by_profile_id = v_profile_id,
          rejected_at = NULL,
          teacher_note = NULL
      WHERE id = v_item.id;

      INSERT INTO public.test_completions (
        workspace_id, academic_term_id, student_id,
        student_book_assignment_id, book_test_id,
        completed_at, completed_by_profile_id,
        source, source_homework_item_id, status
      ) VALUES (
        v_sba.workspace_id, v_sba.academic_term_id, v_sba.student_id,
        p_student_book_assignment_id, v_test_id,
        NOW(), v_profile_id,
        'teacher_manual', v_item.id, 'active'
      )
      ON CONFLICT DO NOTHING;
    ELSE
      -- Hiç ödeve verilmemiş çalışma: doğrudan akademik kayıt.
      INSERT INTO public.test_completions (
        workspace_id, academic_term_id, student_id,
        student_book_assignment_id, book_test_id,
        completed_at, completed_by_profile_id,
        source, source_homework_item_id, status
      ) VALUES (
        v_sba.workspace_id, v_sba.academic_term_id, v_sba.student_id,
        p_student_book_assignment_id, v_test_id,
        NOW(), v_profile_id,
        'teacher_manual', NULL, 'active'
      )
      ON CONFLICT DO NOTHING;
    END IF;

    v_completed := v_completed + 1;
  END LOOP;

  RETURN jsonb_build_object('completed', v_completed, 'skipped', v_skipped);
END;
$fn$;

-- ============================================================
-- 2) approve_units_bulk
--
-- Seçili birimlerin YALNIZ pending_approval durumundakilerini onaylar; yani
-- normal öğretmen onayı. Uygun olmayan öğeler hata vermez, atlanır: karma
-- seçimde "Onayla (2)" 9 öğeden yalnız 2'sine uygulanır (10. madde).
--
-- 020'deki approve_homework_items_bulk batch/kitap bazlıdır; bu ise Kaynak
-- Haritasındaki serbest seçime karşılık gelir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_units_bulk(
  p_student_book_assignment_id UUID,
  p_book_test_ids              UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_sba        public.student_book_assignments%ROWTYPE;
  v_approved   INT := 0;
  v_item       RECORD;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_sba
  FROM public.student_book_assignments
  WHERE id = p_student_book_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_sba.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  FOR v_item IN
    SELECT hi.id, hi.book_test_id
    FROM public.homework_items hi
    JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
    WHERE hi.student_book_assignment_id = p_student_book_assignment_id
      AND hi.book_test_id = ANY(COALESCE(p_book_test_ids, ARRAY[]::UUID[]))
      AND hi.status = 'pending_approval'
      AND hb.status = 'active'
  LOOP
    UPDATE public.homework_items
    SET status = 'completed',
        approved_at = NOW(), approved_by_profile_id = v_profile_id,
        completed_at = NOW(), completed_by_profile_id = v_profile_id
    WHERE id = v_item.id;

    INSERT INTO public.test_completions (
      workspace_id, academic_term_id, student_id,
      student_book_assignment_id, book_test_id,
      completed_at, completed_by_profile_id,
      source, source_homework_item_id, status
    ) VALUES (
      v_sba.workspace_id, v_sba.academic_term_id, v_sba.student_id,
      p_student_book_assignment_id, v_item.book_test_id,
      NOW(), v_profile_id,
      'homework', v_item.id, 'active'
    )
    ON CONFLICT DO NOTHING;

    v_approved := v_approved + 1;
  END LOOP;

  RETURN jsonb_build_object('approved', v_approved);
END;
$fn$;

-- ============================================================
-- 3) revert_units_completion
--
-- "Sil" değil "Tamamlanmayı Geri Al" (9. madde). Hard delete YAPILMAZ:
-- test_completions satırı reverted işaretlenir, geçmiş izi korunur.
--
-- Geri alma sonrası çalışmanın döneceği durum AYRICA HESAPLANMAZ; ödev
-- kaydı yeniden açılır ve durum lib/homework-status.ts'teki deriveTestState
-- tarafından kendiliğinden doğru türetilir:
--   aktif ödev + tarih geçmemiş -> Öğrenciden Beklenen
--   aktif ödev + tarih geçmiş   -> Süresi Geçti
--   daha önce gönderilmişti     -> Onay Bekliyor
--   hiç ödeve verilmemişti      -> Henüz Verilmedi
--
-- Bu yüzden submitted_at BİLİNÇLİ olarak sıfırlanmaz: öğrencinin gönderim
-- yaptığı bilgisi kaybolursa "Onay Bekliyor"a dönüş mümkün olmazdı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.revert_units_completion(
  p_student_book_assignment_id UUID,
  p_book_test_ids              UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_sba        public.student_book_assignments%ROWTYPE;
  v_reverted   INT := 0;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_sba
  FROM public.student_book_assignments
  WHERE id = p_student_book_assignment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_sba.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  WITH reverted AS (
    UPDATE public.test_completions tc
    SET status = 'reverted',
        reverted_at = NOW(),
        reverted_by_profile_id = v_profile_id
    WHERE tc.student_book_assignment_id = p_student_book_assignment_id
      AND tc.book_test_id = ANY(COALESCE(p_book_test_ids, ARRAY[]::UUID[]))
      AND tc.status = 'active'
    RETURNING tc.book_test_id
  )
  SELECT COUNT(*) INTO v_reverted FROM reverted;

  -- Tamamlanmış ödev kalemleri yeniden açılır. submitted_at korunur ki
  -- öğrenci daha önce gönderdiyse durum "Onay Bekliyor"a dönebilsin.
  UPDATE public.homework_items hi
  SET status = CASE WHEN hi.submitted_at IS NOT NULL
                    THEN 'pending_approval'
                    ELSE 'pending' END,
      completed_at = NULL,
      completed_by_profile_id = NULL,
      approved_at = NULL,
      approved_by_profile_id = NULL
  FROM public.homework_batches hb
  WHERE hb.id = hi.homework_batch_id
    AND hi.student_book_assignment_id = p_student_book_assignment_id
    AND hi.book_test_id = ANY(COALESCE(p_book_test_ids, ARRAY[]::UUID[]))
    AND hi.status = 'completed'
    AND hb.status = 'active';

  RETURN jsonb_build_object('reverted', v_reverted);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.complete_units_manually(UUID, UUID[]);
--   DROP FUNCTION IF EXISTS public.approve_units_bulk(UUID, UUID[]);
--   DROP FUNCTION IF EXISTS public.revert_units_completion(UUID, UUID[]);
--
-- Bu migration hiçbir tablo/kolon eklemez ve hiçbir satırı silmez; geri
-- alma yalnız yeni yetenekleri kaldırır, mevcut veriyi olduğu gibi bırakır.
-- ============================================================
