-- ============================================================
-- 053_account_deletion  —  Faz 4 (KVKK)
--
-- VERİ SİLME TALEBİ.
--
-- Gizlilik metni "talep geldiğinde kişisel veriler 30 gün içinde silinir"
-- diyor. Bu söz bir mekanizmayla karşılanmazsa metin yanlış beyandır —
-- hukuki metnin en tehlikeli hâli, yerine getirilmeyen bir taahhüttür.
--
-- NEDEN ANINDA SİLİNMİYOR: silme geri alınamaz ve yanlışlıkla ya da
-- hesabı ele geçirilmiş biri tarafından tetiklenebilir. 30 günlük bir
-- bekleme penceresi hem KVKK'nın öngördüğü süreye uyar hem de yanlış
-- talebin iptal edilmesine imkân verir.
--
-- NEDEN CRON YOK: bekleyen talepler `deletion_requests` tablosunda durur
-- ve silme, süresi dolanlar için ELLE ya da ileride bir zamanlanmış işle
-- yürütülür. Otomatik silme yazmak, test edilmemiş bir yıkım aracını
-- üretime koymaktır; önce talep akışı ve görünürlük kurulur.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.deletion_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Talebi kim açtı. Profil silinse bile talep kaydı kalmalı.
  requested_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_by_name TEXT,
  -- Ne silinecek: tüm çalışma alanı mı, tek bir öğrenci mi?
  scope         TEXT NOT NULL CHECK (scope IN ('workspace', 'student')),
  -- scope='student' ise hedef öğrenci.
  student_id    UUID REFERENCES public.students(id) ON DELETE CASCADE,
  reason        TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'cancelled', 'completed')),
  -- Bekleme penceresinin bitişi. Bu tarihten önce silme YAPILMAZ.
  execute_after TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- scope='student' ise student_id zorunlu, 'workspace' ise boş olmalı.
  CONSTRAINT deletion_requests_scope_chk CHECK (
    (scope = 'student'   AND student_id IS NOT NULL) OR
    (scope = 'workspace' AND student_id IS NULL)
  )
);

-- Aynı hedef için ikinci bir bekleyen talep açılmasın.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_workspace_deletion
  ON public.deletion_requests (workspace_id)
  WHERE status = 'pending' AND scope = 'workspace';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_student_deletion
  ON public.deletion_requests (student_id)
  WHERE status = 'pending' AND scope = 'student';

DROP TRIGGER IF EXISTS handle_updated_at ON public.deletion_requests;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.deletion_requests
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.deletion_requests ENABLE ROW LEVEL SECURITY;

-- Yalnız okuma politikası. Yazma tek yoldan: aşağıdaki RPC'ler.
DROP POLICY IF EXISTS deletion_requests_select ON public.deletion_requests;
CREATE POLICY deletion_requests_select ON public.deletion_requests
  FOR SELECT
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

REVOKE ALL ON public.deletion_requests FROM anon;
GRANT SELECT ON public.deletion_requests TO authenticated;

-- ------------------------------------------------------------
-- request_data_deletion
--
-- Yalnız SAHİP çalışma alanı silme talebi açabilir: bir öğretmen kendi
-- kurumunun tüm verisini silememelidir. Öğrenci silme talebini öğretmen de
-- açabilir — o günlük bir işlem (yanlış eklenen öğrenci, ayrılan öğrenci).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.request_data_deletion(
  p_workspace_id UUID,
  p_scope        TEXT,
  p_student_id   UUID DEFAULT NULL,
  p_reason       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_name       TEXT;
  v_id         UUID;
BEGIN
  IF p_scope NOT IN ('workspace', 'student') THEN
    RAISE EXCEPTION 'Geçersiz silme kapsamı';
  END IF;

  IF p_scope = 'workspace' THEN
    IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
      RAISE EXCEPTION 'Çalışma alanını yalnız sahibi silebilir';
    END IF;
    IF p_student_id IS NOT NULL THEN
      RAISE EXCEPTION 'Çalışma alanı silme talebinde öğrenci belirtilmez';
    END IF;
  ELSE
    IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner', 'teacher']) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
    IF p_student_id IS NULL THEN
      RAISE EXCEPTION 'Silinecek öğrenci belirtilmedi';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.students
      WHERE id = p_student_id AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Öğrenci bulunamadı';
    END IF;
  END IF;

  SELECT id, full_name INTO v_profile_id, v_name
  FROM public.profiles WHERE id = public.current_profile_id();

  INSERT INTO public.deletion_requests (
    workspace_id, requested_by_profile_id, requested_by_name,
    scope, student_id, reason
  )
  VALUES (
    p_workspace_id, v_profile_id, v_name,
    p_scope, p_student_id, NULLIF(TRIM(COALESCE(p_reason, '')), '')
  )
  RETURNING id INTO v_id;

  PERFORM public.log_audit_event(
    p_workspace_id,
    'data.deletion_request',
    p_scope,
    COALESCE(p_student_id, p_workspace_id),
    jsonb_build_object('scope', p_scope)
  );

  RETURN jsonb_build_object('request_id', v_id);
END;
$fn$;

-- ------------------------------------------------------------
-- cancel_data_deletion
--
-- Bekleme penceresinin varlık sebebi: yanlış ya da kötü niyetli talep
-- geri alınabilmeli.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_data_deletion(p_request_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_scope        TEXT;
BEGIN
  SELECT workspace_id, scope INTO v_workspace_id, v_scope
  FROM public.deletion_requests
  WHERE id = p_request_id AND status = 'pending';

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Bekleyen silme talebi bulunamadı';
  END IF;

  -- İptal yetkisi, talebi açmaya gereken yetkiyle aynı.
  IF v_scope = 'workspace' THEN
    IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  ELSE
    IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
      RAISE EXCEPTION 'Permission denied';
    END IF;
  END IF;

  UPDATE public.deletion_requests
  SET status = 'cancelled', updated_at = NOW()
  WHERE id = p_request_id;

  PERFORM public.log_audit_event(
    v_workspace_id, 'data.deletion_cancel', 'deletion_request', p_request_id
  );

  RETURN jsonb_build_object('cancelled', p_request_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.request_data_deletion(UUID, TEXT, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_data_deletion(UUID) TO authenticated;

-- ============================================================
-- SİLMENİN YÜRÜTÜLMESİ — bilinçli olarak burada YOK
--
-- Süresi dolan talepler şu sorguyla listelenir:
--
--   SELECT * FROM public.deletion_requests
--   WHERE status = 'pending' AND execute_after <= NOW();
--
-- Silme işlemi bugün ELLE yapılır. Otomatik yıkım aracı yazmak, test
-- edilmemiş bir geri alınamaz işlemi üretime koymaktır; önce talep akışı
-- ve görünürlük kurulur, otomasyon ayrı ve dikkatli bir adımdır.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.cancel_data_deletion(UUID);
--   DROP FUNCTION IF EXISTS public.request_data_deletion(UUID, TEXT, UUID, TEXT);
--   DROP TABLE IF EXISTS public.deletion_requests;
-- ============================================================
