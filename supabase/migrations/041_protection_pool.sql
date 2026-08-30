-- ============================================================
-- 041_protection_pool  (R5.4 — Koruma Havuzu)
--
-- Koruma Havuzu bir TEKRAR PROGRAMI DEĞİL, "UNUTMA RADARIDIR": daha önce
-- gerçekten çalışılmış konuları son doğrulanmış doğrudan temas tarihine
-- göre sıralar. 7/21/45 gün gibi zorunlu tekrar eşikleri YOKTUR; sistem
-- otomatik test seçmez, ödev atamaz. Tekrar kararını eğitmen verir.
--
-- ============================================================
-- TEMAS MODELİ: HİBRİT (§6.7'nin iki seçeneği arasından)
-- ============================================================
-- Şartname iki seçenek sunuyor: mevcut kayıtlardan TÜRETME veya source
-- referanslı topic_contacts EVENT modeli. Minimum duplication yaratan
-- üçüncü yol seçildi:
--
--   Onaylı test/sayfa temasları  -> TÜRETİLİR (kopyalanmaz)
--   Ders / serbest çalışma        -> topic_contacts'a YAZILIR
--   Son temas                     -> ikisinin MAX'ı
--
-- Türetmenin bedava getirdikleri:
--   KH-15 (aynı item iki kez approve -> duplicate contact yok): kopya
--     kayıt hiç oluşmadığı için duplicate kavramı yok.
--   KH-16 (reject / approval reversal -> temas düşer): completion
--     status='reverted' olunca türetme onu görmez; senkronlanacak ikinci
--     bir tablo yok.
--
-- Event modeli seçilseydi her onay/geri alma/red işleminde ikinci bir
-- tabloyu tutarlı tutmak gerekirdi — §8.3'ün "mevcut source-of-truth'u
-- tekrar etme" kuralının ihlali.
--
-- ============================================================
-- SON TEMAS = GERÇEK ÇALIŞMA GÜNÜ (§6.2, KH-04)
-- ============================================================
-- "Öğrenci 10 Ekim'de çalışıp öğretmen 13 Ekim'de onayladıysa Son Temas
-- = 10 Ekim." Bu yüzden okuma HER YERDE:
--     COALESCE(tc.studied_on, tc.completed_at::date)
-- studied_on 037'de eklendi; eski kayıtlarda NULL'dır ve onay gününe
-- düşülür (bilinen ve kabul edilen yaklaşım).
--
-- ============================================================
-- TEMAS ITEM/BÖLÜM SEVİYESİNDEN TÜRETİLİR (§6.7)
-- ============================================================
-- Assignment başlığından DEĞİL. Bir ödev birden çok konu içerebilir;
-- zincir test_completions -> book_tests -> book_sections -> topic_id.
-- Bölümün topic eşlemesi yoksa (R5.3'te nullable) o çalışma temas
-- üretmez ve konu havuzda görünmez. Bu bilinçli: eşlemesiz veriden
-- uydurma temas üretmek radar'ı yanıltırdı.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- ============================================================
-- 1) topic_contacts — YALNIZ karşılığı olmayan temas kaynakları
--
-- Onaylı test/sayfa çalışması BURAYA YAZILMAZ; o türetilir. Bu tablo
-- yalnız sistemde başka karşılığı olmayan iki olay için:
--   lesson     — gerçekleşmiş, topic'e bağlı ders (§6.3)
--   self_study — eğitmenin doğruladığı öğrenci kendi çalışması (§6.3)
--
-- PLANLANMIŞ AMA YAPILMAMIŞ DERS TEMAS DEĞİLDİR (KH-09): bu tabloya
-- yalnız GERÇEKLEŞMİŞ olaylar yazılır. Planlama başka bir kavramdır ve
-- burada yeri yoktur.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.topic_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id    UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id      UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  -- Çalışmanın GERÇEKLEŞTİĞİ gün. Kaydın girildiği gün değil.
  activity_date DATE NOT NULL,
  kind          TEXT NOT NULL CHECK (kind IN ('lesson', 'self_study')),
  -- "2 test", "40 dakika" gibi serbest miktar notu. Miktar YORUM
  -- MALZEMESİDİR, temas geçerliliği eşiği DEĞİLDİR (§6.4).
  amount_note   TEXT,
  note          TEXT,
  created_by_profile_id UUID REFERENCES public.profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT topic_contacts_activity_date_chk
    CHECK (activity_date <= CURRENT_DATE + 1)
);

CREATE INDEX IF NOT EXISTS idx_topic_contacts_student_topic
  ON public.topic_contacts (student_id, topic_id, activity_date DESC);

DROP TRIGGER IF EXISTS handle_updated_at ON public.topic_contacts;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.topic_contacts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.topic_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS topic_contacts_rw ON public.topic_contacts;
CREATE POLICY topic_contacts_rw ON public.topic_contacts
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- 2) student_topic_overrides — "Aktif Tut"
--
-- §6.5: açık çalışması olan konu Aktif Çalışma sayılır ve havuzda
-- görünmez. İSTİSNAİ olarak eğitmen bir konuyu açık çalışması olmasa da
-- aktif tutmak isteyebilir.
--
-- Şartname bunu "normal günlük akışta gerekmez" diye niteliyor; bu yüzden
-- tablo bilinçli olarak minimum: tek bayrak, varsayılan yok.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.student_topic_overrides (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  topic_id     UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  keep_active  BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_student_topic_override
  ON public.student_topic_overrides (student_id, topic_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_topic_overrides;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_topic_overrides
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.student_topic_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_topic_overrides_rw ON public.student_topic_overrides;
CREATE POLICY student_topic_overrides_rw ON public.student_topic_overrides
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- ============================================================
-- 3) student_topic_contact_view
--
-- (öğrenci, konu) başına son temas ve yorum verisi.
--
-- TEMAS OLUŞTURMAYAN olaylar bu view'a HİÇ GİRMEZ (§6.3) — sorgu onları
-- görmüyor bile:
--   - ödev verildi / bekliyor  : homework_items okunmuyor
--   - onay bekliyor            : yalnız test_completions status='active'
--   - video izlendi            : video_watch_marks okunmuyor
--   - müfredat zamanı geldi    : student_curriculum_items okunmuyor
--   - kitap Aktif / plana dahil: student_book_assignments okunmuyor
--   - genel deneme             : denemenin konu bağı yok, zaten giremez
-- ============================================================
CREATE OR REPLACE VIEW public.student_topic_contact_view AS
WITH derived AS (
  -- Onaylı test/sayfa çalışması. Kopyalanmaz, buradan TÜRETİLİR.
  SELECT
    tc.workspace_id,
    tc.student_id,
    bs.topic_id,
    COALESCE(tc.studied_on, tc.completed_at::DATE) AS activity_date,
    'homework'::TEXT                               AS source_kind
  FROM public.test_completions tc
  JOIN public.book_tests    bt ON bt.id = tc.book_test_id
  JOIN public.book_sections bs ON bs.id = bt.section_id
  WHERE tc.status = 'active'
    AND bs.topic_id IS NOT NULL
),
manual AS (
  -- Ders ve serbest çalışma: sistemde başka karşılığı olmayan temaslar.
  SELECT
    c.workspace_id,
    c.student_id,
    c.topic_id,
    c.activity_date,
    c.kind AS source_kind
  FROM public.topic_contacts c
),
all_contacts AS (
  SELECT * FROM derived
  UNION ALL
  SELECT * FROM manual
),
ranked AS (
  SELECT
    a.*,
    ROW_NUMBER() OVER (
      PARTITION BY a.student_id, a.topic_id
      ORDER BY a.activity_date DESC
    ) AS rn,
    COUNT(*) OVER (PARTITION BY a.student_id, a.topic_id) AS total_contacts
  FROM all_contacts a
)
SELECT
  r.workspace_id,
  r.student_id,
  r.topic_id,
  r.activity_date  AS last_contact_date,
  r.source_kind    AS last_contact_source,
  r.total_contacts,
  -- Son temas gününde kaç çalışma yapılmış? "Son temas 18 gün önce •
  -- 2 test" ifadesindeki miktar. Yorum malzemesidir, eşik değildir.
  (
    SELECT COUNT(*)
    FROM all_contacts x
    WHERE x.student_id = r.student_id
      AND x.topic_id = r.topic_id
      AND x.activity_date = r.activity_date
  )                AS last_contact_amount
FROM ranked r
WHERE r.rn = 1;

-- ============================================================
-- 4) student_topic_open_work_view
--
-- Konu üzerinde KAPANMAMIŞ çalışma var mı? (§6.5)
--
-- Açık çalışması olan konu "Aktif Çalışma"dır ve ana havuz listesinde
-- gösterilmez (KH-14). Açık çalışma kapanınca ve geçmişte doğrulanmış
-- temas varsa konu havuzda görünür (KH-13).
-- ============================================================
CREATE OR REPLACE VIEW public.student_topic_open_work_view AS
SELECT
  hb.workspace_id,
  hb.student_id,
  bs.topic_id,
  COUNT(*) AS open_items
FROM public.homework_items hi
JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
JOIN public.book_sections    bs ON bs.id = hi.section_id
WHERE hb.status = 'active'
  AND hi.status IN ('pending', 'pending_approval')
  AND bs.topic_id IS NOT NULL
GROUP BY hb.workspace_id, hb.student_id, bs.topic_id;

-- ============================================================
-- 5) add_topic_contact
--
-- Ders veya serbest çalışma temasını kaydeder. activity_date GERÇEKLEŞME
-- günüdür; girilmezse bugün kabul edilir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_topic_contact(
  p_student_id    UUID,
  p_topic_id      UUID,
  p_kind          TEXT,
  p_activity_date DATE DEFAULT NULL,
  p_amount_note   TEXT DEFAULT NULL,
  p_note          TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_contact_id   UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.students WHERE id = p_student_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Öğrenci bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_kind NOT IN ('lesson', 'self_study') THEN
    RAISE EXCEPTION 'Geçersiz temas türü';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.topics WHERE id = p_topic_id AND workspace_id = v_workspace_id
  ) THEN
    RAISE EXCEPTION 'Konu bulunamadı';
  END IF;

  INSERT INTO public.topic_contacts (
    workspace_id, student_id, topic_id, activity_date, kind,
    amount_note, note, created_by_profile_id
  ) VALUES (
    v_workspace_id, p_student_id, p_topic_id,
    COALESCE(p_activity_date, public.today_local()), p_kind,
    NULLIF(btrim(COALESCE(p_amount_note, '')), ''),
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    public.current_profile_id()
  ) RETURNING id INTO v_contact_id;

  RETURN jsonb_build_object('contact_id', v_contact_id);
END;
$fn$;

-- ============================================================
-- 6) set_topic_keep_active — "Aktif Tut" override
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_topic_keep_active(
  p_student_id UUID,
  p_topic_id   UUID,
  p_keep       BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id FROM public.students WHERE id = p_student_id;
  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Öğrenci bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_keep THEN
    INSERT INTO public.student_topic_overrides (workspace_id, student_id, topic_id, keep_active)
    VALUES (v_workspace_id, p_student_id, p_topic_id, TRUE)
    ON CONFLICT (student_id, topic_id)
    DO UPDATE SET keep_active = TRUE, updated_at = NOW();
  ELSE
    DELETE FROM public.student_topic_overrides
    WHERE student_id = p_student_id AND topic_id = p_topic_id;
  END IF;

  RETURN jsonb_build_object('topic_id', p_topic_id, 'keep_active', p_keep);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_topic_keep_active(UUID, UUID, BOOLEAN);
--   DROP FUNCTION IF EXISTS public.add_topic_contact(UUID, UUID, TEXT, DATE, TEXT, TEXT);
--   DROP VIEW IF EXISTS public.student_topic_open_work_view;
--   DROP VIEW IF EXISTS public.student_topic_contact_view;
--   DROP TABLE IF EXISTS public.student_topic_overrides;
--   DROP TABLE IF EXISTS public.topic_contacts;
--
-- Türetilen temaslar zaten kopyalanmadığı için geri alma HİÇBİR çalışma
-- kaydını etkilemez; yalnız elle girilmiş ders/serbest çalışma kayıtları
-- silinir.
-- ============================================================
