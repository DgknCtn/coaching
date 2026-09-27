-- ============================================================
-- 118 — MÜDAHALE KAYDI (PRD · B16)
--
-- ============================================================
-- NEDEN
--
-- Panel "kim neden dikkat istiyor" sorusunu yanıtlıyor (B02); ama
-- öğretmenin o öğrenci için NE YAPTIĞI ve bunun SONUCU hiçbir yerde
-- tutulmuyordu. Risk → görüşme → kapanış ilişkisi parçalıydı: görüşme
-- notu bir yerde, durum başka yerde, "düzeldi mi" hiçbir yerde.
--
-- Müdahale küçük bir kayıt:
--   - AÇILIŞ: o anki durum ve gerekçeler ANLIK GÖRÜNTÜ olarak saklanır
--     (durum sonradan değişse de "neden başladık" kaybolmaz).
--   - YAPILAN: bir görüşme bağlanabilir, not düşülebilir.
--   - KAPANIŞ: sonuç (düzeldi / değişmedi / başka) ve kapanış notu.
--
-- Öğrenci başına AYNI ANDA TEK açık müdahale. Kapanış otomatik DEĞİL:
-- durum "Yolunda"ya dönünce arayüz kapatmayı önerir, karar öğretmenin.
-- Kendiliğinden kapanan bir kayıt, öğretmenin ne yaptığını değil
-- sistemin ne hesapladığını anlatırdı.
--
-- GÖRÜNÜRLÜK: yalnız öğretmen/sahip. Öğrenci ve veliye kapalı — bu,
-- öğretmenin çalışma notu (academic_notes ile aynı sınıf).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.interventions (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id             UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status                 TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- Açılıştaki durum (lib/student-status.ts sözlüğü) ve gerekçeler.
  opened_status          TEXT NOT NULL
                         CHECK (opened_status IN ('yolunda', 'takip_et', 'geride', 'mudahale')),
  opened_signals         TEXT[] NOT NULL DEFAULT '{}',
  note                   TEXT CHECK (note IS NULL OR length(note) <= 2000),
  session_id             UUID REFERENCES public.service_sessions(id) ON DELETE SET NULL,
  opened_by_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  opened_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  outcome                TEXT CHECK (outcome IN ('duzeldi', 'degismedi', 'diger')),
  close_note             TEXT CHECK (close_note IS NULL OR length(close_note) <= 2000),
  closed_by_profile_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_at              TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Kapalıysa sonuç ve zaman zorunlu; açıksa ikisi de boş.
  CONSTRAINT interventions_close_consistency CHECK (
    (status = 'open'   AND closed_at IS NULL AND outcome IS NULL) OR
    (status = 'closed' AND closed_at IS NOT NULL AND outcome IS NOT NULL)
  )
);

-- Öğrenci başına tek açık müdahale.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_intervention_open_per_student
  ON public.interventions (student_id) WHERE status = 'open';

CREATE INDEX IF NOT EXISTS idx_interventions_workspace_status
  ON public.interventions (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_interventions_student
  ON public.interventions (student_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_interventions_session
  ON public.interventions (session_id) WHERE session_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_interventions_updated_at ON public.interventions;
CREATE TRIGGER trg_interventions_updated_at
  BEFORE UPDATE ON public.interventions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------
-- RLS — 092 deseni: korelasyonsuz alan kümesi (InitPlan).
-- ------------------------------------------------------------
ALTER TABLE public.interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "interventions_select_teacher" ON public.interventions;
CREATE POLICY "interventions_select_teacher" ON public.interventions
  FOR SELECT
  USING (interventions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

DROP POLICY IF EXISTS "interventions_insert_teacher" ON public.interventions;
CREATE POLICY "interventions_insert_teacher" ON public.interventions
  FOR INSERT
  WITH CHECK (
    interventions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text]))
    -- Öğrenci aynı alandan olmalı: başka kiracının öğrencisine kayıt açılamaz.
    AND EXISTS (
      SELECT 1 FROM public.students s
      WHERE s.id = interventions.student_id AND s.workspace_id = interventions.workspace_id
    )
  );

DROP POLICY IF EXISTS "interventions_update_teacher" ON public.interventions;
CREATE POLICY "interventions_update_teacher" ON public.interventions
  FOR UPDATE
  USING (interventions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])))
  WITH CHECK (interventions.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text, 'teacher'::text])));

-- SİLME YOK: müdahale geçmişi bir kayıttır. Yanlış açılan kayıt
-- 'diger' sonucuyla ve bir notla kapatılır.

-- Supabase public şemasındaki yeni tablolara authenticated için VARSAYILAN
-- olarak TÜM yetkileri veriyor (DELETE ve TRUNCATE dahil). Önce hepsi
-- geri alınır, sonra yalnız gerekenler verilir; aksi hâlde aşağıdaki
-- doğrulama "silme yetkisi açık" der (ilk uygulamada böyle oldu).
REVOKE ALL ON public.interventions FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.interventions TO authenticated;

-- ------------------------------------------------------------
-- Doğrulama
-- ------------------------------------------------------------
DO $dogrula$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.interventions'::regclass) THEN
    RAISE EXCEPTION '118 DOĞRULAMA: RLS kapalı.';
  END IF;
  IF has_table_privilege('anon', 'public.interventions', 'SELECT') THEN
    RAISE EXCEPTION '118 DOĞRULAMA: anon okuyabiliyor.';
  END IF;
  IF has_table_privilege('authenticated', 'public.interventions', 'DELETE') THEN
    RAISE EXCEPTION '118 DOĞRULAMA: silme yetkisi açık.';
  END IF;
  RAISE NOTICE '118: interventions tablosu RLS ile hazır.';
END;
$dogrula$;

-- ROLLBACK: DROP TABLE IF EXISTS public.interventions;
