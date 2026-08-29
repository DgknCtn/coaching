-- ============================================================
-- 039_curriculum_flow  (R5.2 — Müfredat Akışı)
--
-- Müfredat Akışı bir TAKVİM UYGULAMASI DEĞİLDİR. Öğrencinin ana konu
-- sırasının zaman eksenine yerleştirilmiş, kişiselleştirilebilir
-- akademik akışıdır.
--
-- TEK ÖĞRENCİ, TEK MERKEZÎ AKIŞ (§4.1)
-- Okul + kurs + MatMüh için üç paralel takvim TUTULMAZ. Öğrencinin tek
-- kişisel akışı vardır; referans kaynağı (school/course/matmuh/custom)
-- yalnız metadata'dır ve ikinci bir takvim yaratmaz.
--
-- TEMPLATE -> STUDENT SNAPSHOT (§4.2)
-- Şablon öğrenciye atandığında BAĞIMSIZ YAŞAYAN kayıtlar oluşur.
-- Şablon sonradan değişirse mevcut öğrencilerin tarihleri SESSİZCE
-- DEĞİŞMEZ (MA-03). Bu yüzden student_curriculum_items şablona FK ile
-- değil, yalnız izlenebilirlik için source_template_item_id ile bağlanır
-- ve o bağ ON DELETE SET NULL'dur.
--
-- KONU BLOĞU TEKTİR (§4.3, MA-04)
-- "Fonksiyonlar 4 hafta" TEK kayıttır, 4 ayrı haftalık satır değil.
-- Bu yüzden model (start_date, end_date) tutar; hafta hafta satır açmaz.
--
-- OVERLAP HATA DEĞİLDİR (MA-07): aynı scope içinde iki konu aynı haftaya
-- denk gelebilir. Bunu engelleyen HİÇBİR kısıt eklenmemiştir; bilinçli.
--
-- MÜFREDAT DURUMU: SADECE "GEÇİLDİ" SAKLANIR
-- Şartname üç durum tanımlıyor (§4.4): Yaklaşıyor / Zamanı Geldi /
-- Geçildi. Ama ilk ikisi TARİHTEN TÜRETİLEBİLİR:
--   start_date > bugün            -> Yaklaşıyor
--   start_date <= bugün, geçilmedi -> Zamanı Geldi
--   passed_at dolu                 -> Geçildi
--
-- Bu yüzden yalnız passed_at saklanır. §8.3'ün "türetilmiş bilgi mümkünse
-- türetilsin" ilkesi ve projenin mevcut deriveTestState kalıbı bunu
-- gerektiriyor. Ayrıca MA-08'i ("planlanan bitiş tarihi geçince topic
-- otomatik Geçildi olmaz") BEDAVA sağlar: end_date hiçbir duruma girmez.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) curriculum_templates
--
-- Şablon SCOPE BAŞINADIR: "TYT Matematik 2026". Bir şablon birden fazla
-- dersi kapsamaz; ekranda ders ve şablon ayrı seçiliyor.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.curriculum_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope_id     UUID NOT NULL REFERENCES public.academic_scopes(id) ON DELETE CASCADE,
  name         TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  description  TEXT,
  active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_profile_id UUID REFERENCES public.profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_templates_scope
  ON public.curriculum_templates (workspace_id, scope_id);

-- ============================================================
-- 2) curriculum_template_items
--
-- Şablonda MUTLAK TARİH YOKTUR; yalnız sıra ve süre vardır. Somut
-- tarihler atama anında, seçilen başlangıç gününden zincirlenerek
-- hesaplanır. Aynı şablon farklı tarihlerde iki öğrenciye atanabilsin
-- diye böyle (MA-01).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.curriculum_template_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  template_id    UUID NOT NULL REFERENCES public.curriculum_templates(id) ON DELETE CASCADE,
  topic_id       UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  duration_weeks INTEGER NOT NULL DEFAULT 1 CHECK (duration_weeks BETWEEN 1 AND 104),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  note           TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_template_items_template
  ON public.curriculum_template_items (template_id, sort_order);

-- ============================================================
-- 3) student_curriculum_items
--
-- Öğrencinin KİŞİSEL akışı. Şablondan doğmuş olabilir ya da sıfırdan
-- kurulmuş olabilir (şablon opsiyoneldir).
--
-- source_template_item_id yalnız izlenebilirlik içindir ve ON DELETE
-- SET NULL'dur: şablon silinse bile öğrencinin akışı ayakta kalır.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_curriculum_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  scope_id     UUID NOT NULL REFERENCES public.academic_scopes(id) ON DELETE CASCADE,
  topic_id     UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  start_date   DATE NOT NULL,
  end_date     DATE NOT NULL,
  -- Geçildi işareti. NULL ise durum tarihten türetilir (bkz. başlık notu).
  passed_at    TIMESTAMPTZ,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  -- school / course / matmuh / custom — ikinci takvim yaratmaz (§4.1).
  source       TEXT NOT NULL DEFAULT 'matmuh'
                 CHECK (source IN ('school', 'course', 'matmuh', 'custom')),
  source_template_item_id UUID
    REFERENCES public.curriculum_template_items(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_curriculum_items_date_chk CHECK (end_date >= start_date)
);

-- Akış her zaman (öğrenci, scope) bağlamında ve sıra ile okunur.
CREATE INDEX IF NOT EXISTS idx_student_curriculum_items_flow
  ON public.student_curriculum_items (student_id, scope_id, sort_order);

-- R5.3 ve R5.4 topic üzerinden sorgulayacak.
CREATE INDEX IF NOT EXISTS idx_student_curriculum_items_topic
  ON public.student_curriculum_items (student_id, topic_id);

-- BİLİNÇLİ OLARAK YOK: (student_id, scope_id, topic_id) unique kısıtı.
-- İleride "Böl" (bir konuyu iki bloğa ayırma) eklenirse aynı topic aynı
-- akışta iki kez görünebilmeli.

DROP TRIGGER IF EXISTS handle_updated_at ON public.curriculum_templates;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.curriculum_templates
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at ON public.curriculum_template_items;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.curriculum_template_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_curriculum_items;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_curriculum_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- 4) RLS — eğitmen/owner
-- ============================================================
ALTER TABLE public.curriculum_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.curriculum_template_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_curriculum_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS curriculum_templates_rw ON public.curriculum_templates;
CREATE POLICY curriculum_templates_rw ON public.curriculum_templates
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS curriculum_template_items_rw ON public.curriculum_template_items;
CREATE POLICY curriculum_template_items_rw ON public.curriculum_template_items
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

DROP POLICY IF EXISTS student_curriculum_items_rw ON public.student_curriculum_items;
CREATE POLICY student_curriculum_items_rw ON public.student_curriculum_items
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- 5) set_curriculum_template_items
--
-- Şablon editörünün tek yazma yolu: gönderilen liste şablonun TAMAMIDIR
-- (replace semantiği). Konular ada göre upsert edilir; aynı ad ikinci kez
-- yazılsa da yeni topic açılmaz.
--
-- p_items: [{"name": "Fonksiyonlar", "duration_weeks": 3, "note": null}, ...]
-- Sıra dizinin kendi sırasıdır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_curriculum_template_items(
  p_template_id UUID,
  p_items       JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_scope_id     UUID;
  v_item         JSONB;
  v_topic_id     UUID;
  v_index        INT := 0;
BEGIN
  SELECT workspace_id, scope_id INTO v_workspace_id, v_scope_id
  FROM public.curriculum_templates WHERE id = p_template_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Şablon bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  DELETE FROM public.curriculum_template_items WHERE template_id = p_template_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::JSONB))
  LOOP
    v_topic_id := (public.upsert_topic(
      v_scope_id,
      v_item->>'name',
      v_index
    )->>'topic_id')::UUID;

    INSERT INTO public.curriculum_template_items (
      workspace_id, template_id, topic_id, duration_weeks, sort_order, note
    ) VALUES (
      v_workspace_id,
      p_template_id,
      v_topic_id,
      GREATEST(1, LEAST(104, COALESCE((v_item->>'duration_weeks')::INT, 1))),
      v_index,
      NULLIF(btrim(COALESCE(v_item->>'note', '')), '')
    );

    v_index := v_index + 1;
  END LOOP;

  RETURN jsonb_build_object('template_id', p_template_id, 'item_count', v_index);
END;
$fn$;

-- ============================================================
-- 6) assign_curriculum_template
--
-- SNAPSHOT. Şablonun sıra + süre bilgisinden, seçilen başlangıç gününden
-- zincirlenerek SOMUT TARİHLER üretilir ve öğrenciye ait BAĞIMSIZ satırlar
-- yazılır. Bu andan sonra şablonla öğrenci arasında canlı bağ yoktur.
--
-- Aynı scope'ta zaten akış varsa: p_replace TRUE ise GEÇİLMEMİŞ satırlar
-- silinip yenisi kurulur, GEÇİLMİŞ satırlar KORUNUR (geçmiş silinmez,
-- §4.4). FALSE ise hata verilir — sessizce üst üste yazmak sürpriz olurdu.
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
  WHERE student_id = p_student_id AND scope_id = v_scope_id;

  IF v_existing > 0 AND NOT p_replace THEN
    RAISE EXCEPTION 'Bu derste zaten bir akış var';
  END IF;

  -- Geçilmiş konular korunur; yalnız gelecek/aktif satırlar tazelenir.
  DELETE FROM public.student_curriculum_items
  WHERE student_id = p_student_id
    AND scope_id = v_scope_id
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
      -- 1 haftalık blok: başlangıç günü + 6 gün. Bloklar bitişiktir.
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

-- ============================================================
-- 7) save_student_curriculum_flow
--
-- Akış ekranının tek yazma yolu ("Akışı Kaydet"). Taşıma, süre değişimi,
-- konu ekleme/çıkarma gibi işlemler istemcide saf fonksiyonlarla
-- (lib/curriculum-flow.ts) hesaplanır ve sonuç bütün olarak buraya
-- gönderilir. Böylece zincirleme kaydırma mantığı TEK yerde durur ve
-- test edilebilir kalır.
--
-- p_items: [{"id": uuid|null, "name": "...", "start_date": "...",
--            "end_date": "...", "passed": bool, "note": "..."}]
-- id NULL ise yeni konu; listede olmayan mevcut satırlar SİLİNİR.
--
-- KRİTİK: yalnız p_scope_id'ye ait satırlara dokunulur. TYT Matematik
-- kaydırması AYT Fizik'i etkilemez (MA-11) — bu, kaydetmenin scope
-- bağlamında olmasının doğal sonucudur.
-- ============================================================
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
          -- Geçildi işareti korunur; yalnız gerçekten değiştiyse yazılır.
          passed_at  = CASE
                         WHEN COALESCE((v_item->>'passed')::BOOLEAN, FALSE)
                           THEN COALESCE(passed_at, NOW())
                         ELSE NULL
                       END,
          updated_at = NOW()
      WHERE id = v_id
        AND student_id = p_student_id
        AND scope_id = p_scope_id;
    END IF;

    v_keep := v_keep || v_id;
    v_index := v_index + 1;
  END LOOP;

  -- Listeden çıkarılan konular akıştan silinir. Bu YALNIZ kişisel akışı
  -- değiştirir; öğrencinin o konudaki geçmiş çalışması (test_completions)
  -- bambaşka bir tabloda durur ve etkilenmez (MA-10).
  DELETE FROM public.student_curriculum_items
  WHERE student_id = p_student_id
    AND scope_id = p_scope_id
    AND NOT (id = ANY(v_keep));

  RETURN jsonb_build_object('item_count', v_index);
END;
$fn$;

-- ============================================================
-- 8) set_curriculum_item_passed
--
-- "Geçildi" YALNIZ eğitmenin işaretiyle olur (§4.4). Planlanan bitiş
-- tarihinin geçmesi bu alanı ASLA doldurmaz — hiçbir trigger/cron yok.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_curriculum_item_passed(
  p_item_id UUID,
  p_passed  BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.student_curriculum_items WHERE id = p_item_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Akış kaydı bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.student_curriculum_items
  SET passed_at = CASE WHEN p_passed THEN COALESCE(passed_at, NOW()) ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_item_id;

  RETURN jsonb_build_object('item_id', p_item_id, 'passed', p_passed);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_curriculum_item_passed(UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.save_student_curriculum_flow(UUID, UUID, JSONB);
--   DROP FUNCTION IF EXISTS public.assign_curriculum_template(UUID, UUID, DATE, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.set_curriculum_template_items(UUID, JSONB);
--   DROP TABLE IF EXISTS public.student_curriculum_items;
--   DROP TABLE IF EXISTS public.curriculum_template_items;
--   DROP TABLE IF EXISTS public.curriculum_templates;
--
-- Geri alma yalnız müfredat akışını kaldırır; kitap, ödev ve tamamlanma
-- verilerinin hiçbirine dokunmaz.
-- ============================================================
