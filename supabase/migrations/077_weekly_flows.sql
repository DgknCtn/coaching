-- ============================================================
-- 077 — HAFTALIK AKIŞ (R7 / Site Testi 05)
-- ============================================================
--
-- Belgenin zihinsel modeli: "Ana temas haftalık ritmi kurar; Haftalık
-- Akış o ritmi yönetir; Ödev Planlama aktif akışın içine çalışma yükü
-- yerleştirir."
--
-- BU MİGRATION'IN ÇÖZDÜĞÜ ASIL SORUN: bugüne kadar bir ödevin tek
-- zaman bilgisi homework_batches.due_date idi. Belge bunun yetmediğini
-- söylüyor (§5): *"Ödevin yalnız bir son teslim tarihi olması yeterli
-- değildir. Her ödevin hangi Haftalık Akış'a ait olduğu da açıkça
-- tutulmalıdır."*
--
-- Tarihten ÇIKARMAK neden yetmiyor: 20 Eylül'de kapanan bir akışa ait
-- ödev, akışın kapanışı sonradan taşındığında birden başka bir haftaya
-- ait görünürdü. Aidiyet türetilmiş değil, KAYITLI olmalı — geçmiş
-- akışlar "değişmeden arşivlenir" (kabul #12) ancak böyle mümkün.
--
-- KAPSAM SINIRI: bu migration öğretmen tarafındaki veri modelini kurar.
-- Öğrencinin günlük dağıtımı (planned_for_date, sürükle-bırak) belgenin
-- kendi ifadesiyle SONRAKİ adımdır ("R7-05 sonraki adım: öğrenci
-- Haftalık Akış ekranı, günlük dağıtım etkileşimi ve mobil görünüm"),
-- bu yüzden burada tablo açılmıyor. Açılsaydı kimsenin yazmadığı ve bu
-- yüzden yalan söyleyen bir sütun olurdu.


-- ============================================================
-- 1) weekly_flows — öğrencinin aktif çalışma döngüsü
-- ============================================================

CREATE TABLE IF NOT EXISTS public.weekly_flows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  -- Akışı besleyen ana temas. Hizmet sonradan silinirse akış ÖLMEZ:
  -- geçmiş hafta kendi başına bir kayıttır (kabul #12).
  anchor_service_id UUID REFERENCES public.student_services(id) ON DELETE SET NULL,

  starts_at TIMESTAMPTZ NOT NULL,

  -- Akışın TEK RESMİ KAPANIŞI. Ana temastan üretilmiş olabilir
  -- (due_source='anchor') ya da öğretmen elle seçmiş olabilir
  -- ('custom'); her iki hâlde de resmi kapanış BU sütundur. İkinci bir
  -- deadline sütunu açmak, belgenin kritik kuralının ("ikinci bağımsız
  -- deadline oluşturmamalı", kabul #3) tam tersi olurdu.
  due_at     TIMESTAMPTZ NOT NULL,
  due_source TEXT NOT NULL DEFAULT 'anchor' CHECK (due_source IN ('anchor', 'custom')),

  status    TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  closed_at TIMESTAMPTZ,

  -- ZAMANINDA TESLİM FOTOĞRAFI (kabul #9). Kapanış anında yazılır ve bir
  -- daha DEĞİŞMEZ. Tamamlanma oranından türetilemez çünkü geç teslimler
  -- sonradan eklenince o oran 135/135'e çıkar; "110'u zamanında geldi"
  -- bilgisi ise o an kaydedilmezse geri getirilemez.
  on_time_delivered INTEGER,
  on_time_total     INTEGER,

  note       TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT weekly_flows_due_after_start CHECK (due_at > starts_at),
  -- Kapanmış akışın kapanış anı olmalı; açık akışın olmamalı. Aksi
  -- hâlde "kapalı ama ne zaman kapandığı bilinmeyen" satırlar doğardı.
  CONSTRAINT weekly_flows_closed_has_time CHECK (
    (status = 'closed' AND closed_at IS NOT NULL) OR
    (status = 'active' AND closed_at IS NULL)
  )
);

-- KABUL #2: "Her öğrenci için aynı anda en fazla 1 aktif Haftalık Akış
-- bulunmalı." Kural arayüzde değil ŞEMADA: iki sekmeden aynı anda akış
-- açan bir öğretmen, uygulama katmanındaki kontrolü yarıştırabilirdi.
CREATE UNIQUE INDEX IF NOT EXISTS uq_weekly_flows_one_active
  ON public.weekly_flows (student_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_weekly_flows_student_time
  ON public.weekly_flows (student_id, due_at DESC);

CREATE INDEX IF NOT EXISTS idx_weekly_flows_workspace
  ON public.weekly_flows (workspace_id, status);

DROP TRIGGER IF EXISTS handle_updated_at ON public.weekly_flows;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.weekly_flows
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.weekly_flows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS weekly_flows_rw ON public.weekly_flows;
CREATE POLICY weekly_flows_rw ON public.weekly_flows
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- Öğrenci kendi haftasını görür; veli de görür — son teslim ikisinin de
-- ortak bilgisidir. Yazma yok: haftayı öğretmen kurar.
DROP POLICY IF EXISTS weekly_flows_read_self ON public.weekly_flows;
CREATE POLICY weekly_flows_read_self ON public.weekly_flows
  FOR SELECT
  USING (
    (SELECT public.is_student_self(student_id)) OR
    (SELECT public.is_parent_of_student(student_id))
  );


-- ============================================================
-- 2) homework_batches.weekly_flow_id — ödevin hafta aidiyeti
-- ============================================================
--
-- NULLABLE ve öyle kalmalı: geçmiş ödevlerin tamamı akış kavramı
-- olmadan yazıldı ve onları uydurma bir haftaya bağlamak, olmayan bir
-- geçmişi kaydetmek olurdu. Gelecek haftaya verilen ödev de (Senaryo B)
-- ilgili döngü açılana kadar burada NULL bekler.

ALTER TABLE public.homework_batches
  ADD COLUMN IF NOT EXISTS weekly_flow_id UUID
  REFERENCES public.weekly_flows(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_homework_batches_flow
  ON public.homework_batches (weekly_flow_id)
  WHERE weekly_flow_id IS NOT NULL;


-- ============================================================
-- 3) open_weekly_flow — döngüyü aç
-- ============================================================
--
-- Önceki akışı kapatmak ile yenisini açmak AYNI İŞLEMDE olmalı: ikisi
-- ayrı çağrı olsaydı, ikincisi hata verdiğinde öğrenci hiç aktif akışı
-- olmayan bir boşlukta kalırdı.

CREATE OR REPLACE FUNCTION public.open_weekly_flow(
  p_student_id UUID,
  p_starts_at  TIMESTAMPTZ,
  p_due_at     TIMESTAMPTZ,
  p_due_source TEXT DEFAULT 'anchor',
  p_anchor_service_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_active_id    UUID;
  v_new_id       UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_due_source NOT IN ('anchor', 'custom') THEN
    RAISE EXCEPTION 'Geçersiz son teslim kaynağı.';
  END IF;

  IF p_due_at <= p_starts_at THEN
    RAISE EXCEPTION 'Son teslim, akışın başlangıcından sonra olmalı.';
  END IF;

  -- Açık akış varsa kapanır ve fotoğrafı çekilir. Silinmez (kabul #12).
  SELECT id INTO v_active_id
  FROM public.weekly_flows
  WHERE student_id = p_student_id AND status = 'active';

  IF v_active_id IS NOT NULL THEN
    PERFORM public.close_weekly_flow(v_active_id);
  END IF;

  INSERT INTO public.weekly_flows (
    workspace_id, student_id, anchor_service_id,
    starts_at, due_at, due_source, created_by_profile_id
  )
  VALUES (
    v_workspace_id, p_student_id, p_anchor_service_id,
    p_starts_at, p_due_at, p_due_source, auth.uid()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$fn$;


-- ============================================================
-- 4) close_weekly_flow — kapat ve fotoğrafı çek
-- ============================================================
--
-- Fotoğraf SQL'de çekiliyor, arayüzde değil: kapanış anındaki sayıyı
-- istemciye hesaplatmak, iki tarayıcının iki farklı "zamanında teslim"
-- sayısı yazması demekti.
--
-- ZAMANINDA SAYILMA ÖLÇÜTÜ ÖĞRENCİNİN GÖNDERİMİDİR (kabul #8), öğretmen
-- onayı değil: *"Öğretmen onayı öğrencinin ilerlemesini geriye
-- düşürmez."* Bu yüzden ölçüt test_completions.completed_at — öğrencinin
-- teslim ettiği an. İade edilen (reverted) kayıtta da ilk gönderim anı
-- korunur, çünkü satır silinmez yalnız durumu değişir.

CREATE OR REPLACE FUNCTION public.close_weekly_flow(
  p_flow_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_flow      public.weekly_flows%ROWTYPE;
  v_total     INTEGER;
  v_on_time   INTEGER;
BEGIN
  SELECT * INTO v_flow FROM public.weekly_flows WHERE id = p_flow_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Haftalık akış bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_flow.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_flow.status = 'closed' THEN
    -- Yeniden kapatmak fotoğrafı BOZARDI: ikinci çağrı, aradan geçen
    -- sürede gelen geç teslimleri "zamanında" sayardı.
    RETURN;
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (
      WHERE tc.id IS NOT NULL AND tc.completed_at <= v_flow.due_at
    )
  INTO v_total, v_on_time
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  LEFT JOIN public.test_completions tc
    ON tc.source_homework_item_id = hi.id
  WHERE hb.weekly_flow_id = p_flow_id
    AND hi.status <> 'cancelled';

  UPDATE public.weekly_flows
  SET status            = 'closed',
      closed_at         = NOW(),
      on_time_total     = COALESCE(v_total, 0),
      on_time_delivered = COALESCE(v_on_time, 0)
  WHERE id = p_flow_id;
END;
$fn$;


-- ============================================================
-- 5) set_weekly_flow_due — resmi kapanışı değiştir
-- ============================================================
--
-- Öğretmen özel son teslim seçtiğinde due_source 'custom' olur ve bir
-- daha ana temasla KENDİLİĞİNDEN oynanmaz (§4). Kaynağı da güncellemek
-- şart: yalnız tarihi değiştirip kaynağı 'anchor' bırakmak, bir sonraki
-- otomatik hesabın öğretmenin kararını sessizce ezmesi demekti.

CREATE OR REPLACE FUNCTION public.set_weekly_flow_due(
  p_flow_id UUID,
  p_due_at  TIMESTAMPTZ,
  p_source  TEXT DEFAULT 'custom'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_flow public.weekly_flows%ROWTYPE;
BEGIN
  SELECT * INTO v_flow FROM public.weekly_flows WHERE id = p_flow_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Haftalık akış bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_flow.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_flow.status <> 'active' THEN
    -- Kapanmış haftanın son teslimini değiştirmek, o haftanın zamanında
    -- teslim fotoğrafını geçersiz kılardı. Geçmiş yeniden yazılmaz.
    RAISE EXCEPTION 'Kapanmış haftalık akışın son teslimi değiştirilemez.';
  END IF;

  IF p_source NOT IN ('anchor', 'custom') THEN
    RAISE EXCEPTION 'Geçersiz son teslim kaynağı.';
  END IF;

  IF p_due_at <= v_flow.starts_at THEN
    RAISE EXCEPTION 'Son teslim, akışın başlangıcından sonra olmalı.';
  END IF;

  UPDATE public.weekly_flows
  SET due_at = p_due_at, due_source = p_source
  WHERE id = p_flow_id;
END;
$fn$;


-- ============================================================
-- 6) attach_batch_to_flow — ödevi haftaya bağla
-- ============================================================
--
-- Ödev Planlama YENİ HAFTA YARATMAZ (§3): yalnız aktif akışın içine
-- yayın yapar. Bu yüzden burada akış açma yolu yok; aktif akış yoksa
-- ödev akışsız (NULL) kalır ve öğretmen haftayı ayrıca açar.
--
-- Gelecek tarihli ödev bilerek bağlanmaz (kabul #7): aktif haftanın
-- toplamına karışmaması gereken bir yükü bağlamak, ekrandaki "bu hafta
-- ne kadar yük var" sayısını yalancı yapardı.

CREATE OR REPLACE FUNCTION public.attach_batch_to_flow(
  p_batch_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch public.homework_batches%ROWTYPE;
  v_flow  public.weekly_flows%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödev bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  SELECT * INTO v_flow
  FROM public.weekly_flows
  WHERE student_id = v_batch.student_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Aidiyet kuralı lib/weekly-flow.ts'teki flowMembership ile AYNI
  -- olmalı: son teslim akışın kapanışını aşıyorsa bu hafta değildir.
  --
  -- Karşılaştırma GÜN düzeyinde: due_date bir DATE, kapanış ise saatli
  -- bir an. Kapanış günü Pazar 10:00 iken o güne verilmiş bir ödevi
  -- "gelecek hafta" saymak, öğretmenin aynı gün verdiği işi ekrandan
  -- düşürürdü. Gün, kapanışın yerel (Europe/Istanbul) günüdür — UTC
  -- alınsaydı gece yarısına yakın kapanışlar bir gün kayardı.
  IF v_batch.due_date > (v_flow.due_at AT TIME ZONE 'Europe/Istanbul')::DATE THEN
    RETURN NULL;
  END IF;

  UPDATE public.homework_batches
  SET weekly_flow_id = v_flow.id
  WHERE id = p_batch_id;

  RETURN v_flow.id;
END;
$fn$;


REVOKE ALL ON FUNCTION public.open_weekly_flow(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.close_weekly_flow(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_weekly_flow_due(UUID, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.attach_batch_to_flow(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.open_weekly_flow(UUID, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_weekly_flow(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_weekly_flow_due(UUID, TIMESTAMPTZ, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.attach_batch_to_flow(UUID) TO authenticated;
