-- ============================================================
-- 151_curriculum_book_coverage  (M1.0-06 — Müfredat Akışı görünürlüğü +
-- kitap↔konu çoklu eşleşmesi, P0)
--
-- SORUN: öğretmen bir derse şablon uyguluyor, sistem akışın VARLIĞINI
-- biliyor ("Bu derste zaten bir akış var" diyor) ama Akademik Akış ekranı
-- konu listesini göstermiyor. Kök nedenin bir parçası (yanlış scope
-- sekmesine düşme) uygulama katmanında düzeltildi
-- (curriculum/page.tsx + academic-flow-card.tsx). Bu migration kök
-- nedenin VERİ tarafını kapatıyor: çoklu eşleşmede temas/kapsam sinyali
-- kaybı.
--
-- ============================================================
-- (a) student_topic_contact_view — ÇOKLU EŞLEŞME DÜZELTMESİ
--
-- 041/130'dan beri bu view `book_sections.topic_id` (TEK "birincil" kolon)
-- okuyordu. 043'te eklenen book_section_topics N:N tablosu hiç JOIN
-- edilmiyordu — bir bölüm N konuya bağlıysa yalnız 1. konu (kullanıcının
-- tıklama sırasına göre ilk seçtiği) temas alıyordu, geri kalan N-1 konu
-- için sayfa sayısı ne olursa olsun ASLA temas üretilmiyordu.
--
-- DÜZELTME: derived CTE artık book_section_topics üzerinden JOIN ediyor.
-- 043'ün migration-sonu INSERT'i TÜM eski tek-eşlemeleri zaten bu tabloya
-- taşımıştı (bkz. 043 satır 153-157) — bu yüzden book_sections.topic_id'yi
-- AYRICA okumaya gerek yok, book_section_topics tek kaynak olarak yeterli
-- ve eksiksiz.
--
-- ÜRÜN KARARI: bir bölüm N konuya bağlıysa, bölüm tamamlandığında TÜM N
-- konu hem "son temas" günceller hem de kapsam sinyali üretir — çoklu
-- eşleşmede hiçbir konu ikincil sayılmaz (M1.0-06 kullanıcı kararı).
--
-- ÇIKTI KOLONLARI AYNI KALIYOR (workspace_id, student_id, topic_id,
-- last_contact_date, last_contact_source, total_contacts,
-- last_contact_amount) — CREATE OR REPLACE VIEW bunu zorunlu kılıyor.
-- security_invoker = on korunuyor (049/130 kuralı).
--
-- BU KEZ "eski/yeni birebir aynı" doğrulaması YOK (130'daki gibi): bu
-- sefer davranış BİLEREK değişiyor (çoklu eşleşmede artık N satır).
-- ============================================================

CREATE OR REPLACE VIEW public.student_topic_contact_view
WITH (security_invoker = on) AS
WITH all_contacts AS (
  SELECT
    tc.workspace_id,
    tc.student_id,
    bst.topic_id,
    COALESCE(tc.studied_on, tc.completed_at::DATE) AS activity_date,
    'homework'::TEXT                                AS source_kind
  FROM public.test_completions tc
  JOIN public.book_tests          bt  ON bt.id = tc.book_test_id
  JOIN public.book_section_topics bst ON bst.section_id = bt.section_id
  WHERE tc.status = 'active'
  UNION ALL
  SELECT
    c.workspace_id,
    c.student_id,
    c.topic_id,
    c.activity_date,
    c.kind AS source_kind
  FROM public.topic_contacts c
),
ranked AS (
  SELECT
    a.*,
    ROW_NUMBER() OVER (
      PARTITION BY a.workspace_id, a.student_id, a.topic_id
      ORDER BY a.activity_date DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY a.workspace_id, a.student_id, a.topic_id) AS total_contacts,
    COUNT(*) OVER (PARTITION BY a.workspace_id, a.student_id, a.topic_id, a.activity_date) AS day_contacts
  FROM all_contacts a
)
SELECT
  r.workspace_id,
  r.student_id,
  r.topic_id,
  r.activity_date  AS last_contact_date,
  r.source_kind    AS last_contact_source,
  r.total_contacts,
  r.day_contacts   AS last_contact_amount
FROM ranked r
WHERE r.rn = 1;

ALTER VIEW public.student_topic_contact_view SET (security_invoker = on);

-- ============================================================
-- (b) student_topic_source_coverage_view — YENİ
--
-- Konu özetinde farklı kaynakların sayfa/test adedi TEK PAYDAYA
-- toplanmamalı (M1.0-06 kabul kriteri): "1/4 kaynak tamamlandı" KAYNAK
-- BAZLI olmalı. Bu view her (öğrenci, konu, kitap) üçlüsü için o
-- kitaptaki eşleşen bölüm(ler)in TÜM testleri tamamlandı mı
-- (fully_completed) ve en az bir temas var mı (has_contact) bilgisini
-- üretir — sayaç TS tarafında formatBookCoverage() ile kaynak sayısına
-- bölünür.
--
-- ALT BÖLÜM NOTU: book_tests.section_id HER ZAMAN yaprağı gösterir
-- (047). Bir üst bölüm konuya eşlenmiş ama testleri alt bölümdeyse, bu
-- view o üst-bölüm eşlemesi için SIFIR satır üretir (test_count=0) —
-- bilinçli: üst bölüm eşlemesi test taşımıyorsa kapsama katkısı olamaz.
-- Alt bölüm eşlemesi varsa (bu migration'ın UI tarafı, subsection-list.tsx)
-- testler doğru şekilde sayılır.
-- ============================================================

CREATE OR REPLACE VIEW public.student_topic_source_coverage_view
WITH (security_invoker = on) AS
WITH mapped_tests AS (
  SELECT
    bst.workspace_id,
    bst.topic_id,
    bs.book_id,
    bt.id AS book_test_id
  FROM public.book_section_topics bst
  JOIN public.book_sections bs ON bs.id = bst.section_id
  JOIN public.book_tests    bt ON bt.section_id = bst.section_id
),
per_assignment AS (
  SELECT
    mt.workspace_id,
    mt.topic_id,
    mt.book_id,
    sba.student_id,
    EXISTS (
      SELECT 1
      FROM public.test_completions tc
      WHERE tc.student_book_assignment_id = sba.id
        AND tc.book_test_id = mt.book_test_id
        AND tc.status = 'active'
    ) AS completed
  FROM mapped_tests mt
  JOIN public.student_book_assignments sba
    ON sba.book_id = mt.book_id AND sba.workspace_id = mt.workspace_id
)
SELECT
  workspace_id,
  student_id,
  topic_id,
  book_id,
  COUNT(*)                          AS test_count,
  COUNT(*) FILTER (WHERE completed) AS completed_count,
  BOOL_AND(completed)               AS fully_completed,
  BOOL_OR(completed)                AS has_contact
FROM per_assignment
GROUP BY workspace_id, student_id, topic_id, book_id;

ALTER VIEW public.student_topic_source_coverage_view SET (security_invoker = on);

CREATE INDEX IF NOT EXISTS idx_sba_book_id
  ON public.student_book_assignments (book_id);

-- ============================================================
-- (c) RPC sağlamlaştırması — workspace_id simetrisi
--
-- Müfredat Akışı sayfasının okuma sorgusu student_id + scope_id +
-- workspace_id ile filtreliyor. assign_curriculum_template ve
-- save_student_curriculum_flow'un (039) varlık-kontrolü/silme/update
-- sorguları SADECE student_id + scope_id filtreliyor. İleride bir
-- workspace tutarsızlığı (ör. elle veri düzeltmesi) satırın
-- workspace_id'sini öğrencinin güncel workspace_id'sinden ayırırsa, RPC
-- "akış var" der ama sayfa 0 satır okur — tam da bildirilen P0 semptomu.
-- Bu, canlı veriyle DOĞRULANAMAYAN ama ucuz ve güvenli bir
-- sağlamlaştırma. Dönüş tipleri değişmediği için DROP FUNCTION
-- gerekmiyor, CREATE OR REPLACE yeterli.
-- ============================================================

CREATE OR REPLACE FUNCTION public.assign_curriculum_template(
  p_student_id  UUID,
  p_template_id UUID,
  p_start_date  DATE,
  p_replace     BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_scope_id     UUID;
  v_item         RECORD;
  v_cursor       DATE;
  v_index        INT := 0;
  v_existing     INT;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.students WHERE id = p_student_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Öğrenci bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT scope_id INTO v_scope_id
  FROM public.curriculum_templates
  WHERE id = p_template_id AND workspace_id = v_workspace_id;

  IF v_scope_id IS NULL THEN RAISE EXCEPTION 'Şablon bulunamadı'; END IF;

  IF p_start_date IS NULL THEN RAISE EXCEPTION 'Akış başlangıç tarihi gerekli'; END IF;

  SELECT COUNT(*) INTO v_existing
  FROM public.student_curriculum_items
  WHERE student_id = p_student_id
    AND scope_id = v_scope_id
    AND workspace_id = v_workspace_id;

  IF v_existing > 0 AND NOT p_replace THEN
    RAISE EXCEPTION 'Bu derste zaten bir akış var';
  END IF;

  DELETE FROM public.student_curriculum_items
  WHERE student_id = p_student_id
    AND scope_id = v_scope_id
    AND workspace_id = v_workspace_id
    AND passed_at IS NULL;

  v_cursor := p_start_date;

  FOR v_item IN
    SELECT id, topic_id, duration_weeks, note
    FROM public.curriculum_template_items
    WHERE template_id = p_template_id
    ORDER BY sort_order
  LOOP
    INSERT INTO public.student_curriculum_items (
      workspace_id, student_id, scope_id, topic_id,
      start_date, end_date, sort_order, source_template_item_id, note
    ) VALUES (
      v_workspace_id, p_student_id, v_scope_id, v_item.topic_id,
      v_cursor,
      v_cursor + (v_item.duration_weeks * 7 - 1),
      v_index,
      v_item.id,
      v_item.note
    );

    v_cursor := v_cursor + (v_item.duration_weeks * 7);
    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'student_id', p_student_id,
    'scope_id', v_scope_id,
    'item_count', v_index
  );
END;
$fn$;

CREATE OR REPLACE FUNCTION public.save_student_curriculum_flow(
  p_student_id UUID,
  p_scope_id   UUID,
  p_items      JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_item         JSONB;
  v_topic_id     UUID;
  v_id           UUID;
  v_index        INT := 0;
  v_keep         UUID[] := ARRAY[]::UUID[];
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.students WHERE id = p_student_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Öğrenci bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.academic_scopes
    WHERE id = p_scope_id AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Kapsam bulunamadı';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_topic_id := (public.upsert_topic(p_scope_id, v_item->>'name', v_index)->>'topic_id')::UUID;
    v_id := NULLIF(v_item->>'id', '')::UUID;

    IF v_id IS NULL THEN
      INSERT INTO public.student_curriculum_items (
        workspace_id, student_id, scope_id, topic_id,
        start_date, end_date, sort_order, note,
        passed_at
      ) VALUES (
        v_workspace_id, p_student_id, p_scope_id, v_topic_id,
        (v_item->>'start_date')::DATE,
        (v_item->>'end_date')::DATE,
        v_index,
        NULLIF(btrim(COALESCE(v_item->>'note', '')), ''),
        CASE WHEN COALESCE((v_item->>'passed')::BOOLEAN, FALSE) THEN NOW() ELSE NULL END
      )
      RETURNING id INTO v_id;
    ELSE
      UPDATE public.student_curriculum_items
      SET topic_id   = v_topic_id,
          start_date = (v_item->>'start_date')::DATE,
          end_date   = (v_item->>'end_date')::DATE,
          sort_order = v_index,
          note       = NULLIF(btrim(COALESCE(v_item->>'note', '')), ''),
          passed_at  = CASE
                         WHEN COALESCE((v_item->>'passed')::BOOLEAN, FALSE)
                           THEN COALESCE(passed_at, NOW())
                         ELSE NULL
                       END,
          updated_at = NOW()
      WHERE id = v_id
        AND student_id = p_student_id
        AND scope_id = p_scope_id
        AND workspace_id = v_workspace_id;
    END IF;

    v_keep := v_keep || v_id;
    v_index := v_index + 1;
  END LOOP;

  DELETE FROM public.student_curriculum_items
  WHERE student_id = p_student_id
    AND scope_id = p_scope_id
    AND workspace_id = v_workspace_id
    AND NOT (id = ANY(v_keep));

  RETURN jsonb_build_object('item_count', v_index);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   -- (a) ve (b): 130'daki (contact) tanımına geri dön / view'ları düşür:
--   DROP VIEW IF EXISTS public.student_topic_source_coverage_view;
--   -- student_topic_contact_view için 130_topic_contact_view_maliyet.sql'deki
--   -- CREATE OR REPLACE VIEW'ı yeniden çalıştır.
--   DROP INDEX IF EXISTS public.idx_sba_book_id;
--   -- (c): 039_curriculum_flow.sql'deki orijinal tanımları yeniden çalıştır.
-- ============================================================
