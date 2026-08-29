-- ============================================================
-- 036_student_book_role_status  (R5.1)
--
-- Öğrenci Kaynak Planı'nın cevaplaması gereken ilk soru: "Bu kaynak bu
-- öğrenci için NEDEN kullanılıyor?" Bugün bu bilgi hiçbir yerde yok;
-- kitabın öğrenciye atanmış olması dışında bir niyet kaydı tutulmuyor.
--
-- İKİ EKLEME:
--
-- 1) ROL — kaynağın öğrencinin planındaki işlevi.
--    KRİTİK: rol KİTABIN değil, ÖĞRENCİ-KİTAP İLİŞKİSİNİN özelliğidir
--    (şartname §3.1). Aynı kitap bir öğrencide "Ana Çalışma", başkasında
--    "Pekiştirme" olabilir ve süreç içinde değişir. Bu yüzden books'a
--    değil student_book_assignments'a yazılır.
--
-- 2) DURUM — 'pending' değeri eklenir.
--    Şartname üç durum istiyor: Bekliyor / Aktif / Hedef Tamamlandı.
--    Eşleme:
--      pending   -> Bekliyor            (YENİ)
--      active    -> Aktif               (mevcut)
--      completed -> Hedef Tamamlandı    (mevcut)
--    Mevcut 'paused' ve 'archived' KORUNUR; küme yalnız genişler, hiçbir
--    satır dönüştürülmez.
--
--    Yeni kaynağa geçiş için kilit/koşul motoru YOKTUR (§3.1). "Bekliyor"
--    yalnız bir niyet beyanıdır; başka bir kitabın bitmesini beklemek gibi
--    bir kural üretmez.
--
-- ROL DEĞİŞİMİ İLERLEME VERİSİNE DOKUNMAZ (KP-06): iki alan da yalnız
-- meta bilgidir, hiçbir hesaba girmez.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu. Veri kaybı yok.
-- ============================================================

-- ============================================================
-- 1) role
-- ============================================================
ALTER TABLE public.student_book_assignments
  ADD COLUMN IF NOT EXISTS role TEXT;

ALTER TABLE public.student_book_assignments
  DROP CONSTRAINT IF EXISTS student_book_assignments_role_check;
ALTER TABLE public.student_book_assignments
  ADD CONSTRAINT student_book_assignments_role_check
  CHECK (role IS NULL OR role IN (
    'temel_olusturma',  -- Temel Oluşturma
    'ana_calisma',      -- Ana Çalışma
    'pekistirme',       -- Pekiştirme
    'yeniden_temas'     -- Yeniden Temas
  ));

COMMENT ON COLUMN public.student_book_assignments.role IS
  'R5.1: kaynağın bu öğrencinin planındaki işlevi. Kitabın değil '
  'öğrenci-kitap ilişkisinin özelliğidir ve süreçte değişebilir. '
  'İlerleme hesabına girmez.';

-- ============================================================
-- 2) status: 'pending' (Bekliyor)
-- ============================================================
ALTER TABLE public.student_book_assignments
  DROP CONSTRAINT IF EXISTS student_book_assignments_status_check;
ALTER TABLE public.student_book_assignments
  ADD CONSTRAINT student_book_assignments_status_check
  CHECK (status IN ('pending', 'active', 'completed', 'paused', 'archived'));

COMMENT ON COLUMN public.student_book_assignments.status IS
  'R5.1 Kitap Durumu: pending=Bekliyor, active=Aktif, '
  'completed=Hedef Tamamlandı. paused/archived geriye dönük uyum için '
  'korunur. Durumlar arası geçişte kilit/koşul motoru yoktur.';

-- ============================================================
-- 3) set_student_book_plan
--
-- Rol ve durumu güncelleyen tek giriş noktası. Projenin kuralı gereği
-- yazma yolu SECURITY DEFINER RPC'den geçer.
--
-- Her iki parametre de NULL geçilebilir ve NULL geçildiğinde mevcut değer
-- KORUNUR — böylece yalnız rolü ya da yalnız durumu değiştirmek için ayrı
-- fonksiyon gerekmez. Rolü temizlemek için p_clear_role kullanılır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_student_book_plan(
  p_assignment_id UUID,
  p_status        TEXT DEFAULT NULL,
  p_role          TEXT DEFAULT NULL,
  p_clear_role    BOOLEAN DEFAULT FALSE
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
  FROM public.student_book_assignments WHERE id = p_assignment_id;

  IF v_workspace_id IS NULL THEN RAISE EXCEPTION 'Kitap ataması bulunamadı'; END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_status IS NOT NULL AND p_status NOT IN ('pending', 'active', 'completed') THEN
    RAISE EXCEPTION 'Geçersiz kitap durumu';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN (
    'temel_olusturma', 'ana_calisma', 'pekistirme', 'yeniden_temas'
  ) THEN
    RAISE EXCEPTION 'Geçersiz kaynak rolü';
  END IF;

  UPDATE public.student_book_assignments
  SET status     = COALESCE(p_status, status),
      role       = CASE WHEN p_clear_role THEN NULL ELSE COALESCE(p_role, role) END,
      updated_at = NOW()
  WHERE id = p_assignment_id;

  RETURN jsonb_build_object('assignment_id', p_assignment_id);
END;
$fn$;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.set_student_book_plan(UUID, TEXT, TEXT, BOOLEAN);
--
--   -- 'pending' durumunda atama var mı? Varsa önce 'active'e çekin:
--   SELECT id, student_id, book_id FROM public.student_book_assignments
--   WHERE status = 'pending';
--
--   ALTER TABLE public.student_book_assignments
--     DROP CONSTRAINT IF EXISTS student_book_assignments_status_check;
--   ALTER TABLE public.student_book_assignments
--     ADD CONSTRAINT student_book_assignments_status_check
--     CHECK (status IN ('active', 'completed', 'paused', 'archived'));
--
--   ALTER TABLE public.student_book_assignments
--     DROP CONSTRAINT IF EXISTS student_book_assignments_role_check;
--   ALTER TABLE public.student_book_assignments DROP COLUMN IF EXISTS role;
-- ============================================================
