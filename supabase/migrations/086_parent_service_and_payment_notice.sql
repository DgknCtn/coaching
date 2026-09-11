-- ============================================================
-- 086_parent_service_and_payment_notice
--
-- R7 / Site Testi 04 Rev.3 · §8:
--   "Veli, içinde bulunulan ay kaç hizmet planlandığını ve kaçının
--    yapıldığını tarih/saat ile görür."
--   "Öğretmen görünümü 'Tahsil edildi', veli görünümü 'Ödendi' dili
--    kullanabilir."
--   "Veli 'Ödeme yaptım' bildirimi gönderebilir; öğretmen onaylayınca
--    hesap kapanır."
--
-- ============================================================
-- HİZMET KAYITLARI ZATEN VELİYE AÇIK
-- ============================================================
-- 074 `student_services` ve `service_sessions` için `..._read_self`
-- politikalarını kurmuştu: bağlı veli çocuğunun hizmet ve oturum
-- satırlarını okuyabiliyor. Veli ekranının planlanan/yapılan listesini
-- göstermek için yeni bir erişim gerekmiyor; eksik olan tek şey PARA
-- tarafıydı.
--
-- ============================================================
-- SORUN: PARA VELİYE KAPALI, DURUM İSE GÖSTERİLMELİ
-- ============================================================
-- 066 finans tablolarını 'owner' rolüne kilitledi ve gerekçesi hâlâ
-- geçerli: bir ailenin ne kadar borcu olduğu, aynı çalışma alanındaki
-- başka bir öğretmeni ilgilendirmez. Ama doküman veliye "Ödendi /
-- Bekliyor" göstermeyi istiyor.
--
-- ÇÖZÜM: TUTAR DEĞİL, DURUM. Aşağıdaki fonksiyon yalnız üç kelimeden
-- birini döndürür ve hiçbir koşulda rakam sızdırmaz. Veli kendi
-- çocuğunun o ayki ödemesinin kapanıp kapanmadığını görür; kaç lira
-- olduğunu, geçmiş bakiyeyi, başka öğrencileri göremez.
--
-- View DEĞİL, FONKSİYON: view'ın `security_invoker`'ı finans
-- tablolarının RLS'ine takılır ve veliye boş döner; `security_definer`
-- bir view ise 049'daki P0 bulgusunun ta kendisi olurdu (satırlar
-- filtresiz açılır). Fonksiyon, yetkiyi kendi gövdesinde TEK bir
-- öğrenci için sorup yalnız türetilmiş durumu döndürüyor.
--
-- ============================================================
-- "ÖDEME YAPTIM" BİLDİRİMİ BİR TALEPTİR, KAYIT DEĞİL
-- ============================================================
-- Velinin bildirimi `finance_payments`'a satır YAZMAZ. Yazsaydı,
-- öğretmenin defteri veli tarafından değiştirilebilir olurdu — para
-- kaydının tek sahibi öğretmendir (066). Bildirim ayrı bir tabloda
-- "öğretmenin bakması gereken bir şey" olarak durur; öğretmen
-- onaylarken tutarı KENDİ girer ve tahsilat satırı o anda doğar.
--
-- AYNI AY İÇİN TEK AÇIK BİLDİRİM: veli arka arkaya "ödedim" diyerek
-- öğretmenin listesini dolduramaz.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================


-- ============================================================
-- 1) AYIN ÖDEME DURUMU — tutarsız
-- ============================================================
-- Üç değer döner: 'paid' · 'partial' · 'pending'. Tahakkuk yoksa NULL:
-- aylık pakete dahil ya da finansal takip dışı bir ayda söylenecek bir
-- şey yok ve "Ödendi" yazmak, hiç borç doğmamışken ödeme yapıldığını
-- ima ederdi.
--
-- lib/finance.ts'teki `monthPaymentState` ile AYNI eşikleri kullanır;
-- ayrışırlarsa veli ile öğretmen aynı ay için farklı rozet görür.
CREATE OR REPLACE FUNCTION public.student_month_payment_state(
  p_student_id  UUID,
  p_month_start DATE
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_accrued   BIGINT := 0;
  v_collected BIGINT := 0;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Yetki gövdenin İÇİNDE sorulur. SECURITY DEFINER bir fonksiyonun
  -- RLS'i atladığı yer tam olarak burası; kontrol unutulursa herkes
  -- herkesin ödeme durumunu okur.
  IF NOT (
    public.has_workspace_role(v_workspace, ARRAY['owner', 'teacher'])
    OR public.is_parent_of_student(p_student_id)
  ) THEN
    RAISE EXCEPTION 'Bu kaydı görme yetkiniz yok.';
  END IF;

  -- PARITY-BEGIN payment_state
  SELECT COALESCE(SUM(quantity * unit_price_kurus), 0) INTO v_accrued
  FROM public.finance_lessons
  WHERE student_id = p_student_id
    AND date_trunc('month', lesson_date)::DATE = p_month_start;

  SELECT COALESCE(SUM(amount_kurus), 0) INTO v_collected
  FROM public.finance_payments
  WHERE student_id = p_student_id
    AND date_trunc('month', paid_on)::DATE = p_month_start;

  IF v_accrued <= 0 THEN
    RETURN NULL;
  ELSIF v_collected <= 0 THEN
    RETURN 'pending';
  ELSIF v_collected >= v_accrued THEN
    RETURN 'paid';
  ELSE
    RETURN 'partial';
  END IF;
  -- PARITY-END payment_state
END;
$fn$;

REVOKE ALL ON FUNCTION public.student_month_payment_state(UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_month_payment_state(UUID, DATE) TO authenticated;


-- ============================================================
-- 2) VELİNİN ÖDEME BİLDİRİMİ
-- ============================================================
CREATE TABLE IF NOT EXISTS public.parent_payment_notices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  -- Hangi ayın ödemesi olduğu. Ayın ilk günü olarak saklanır.
  month_start DATE NOT NULL,

  -- Velinin kendi notu ("havale yaptım, dekont WhatsApp'ta" gibi).
  -- TUTAR ALANI YOK: bildirim para kaydı değil. Tutarı öğretmen
  -- onaylarken kendi girer (bkz. resolve_payment_notice).
  note TEXT CHECK (note IS NULL OR length(note) <= 500),

  status TEXT NOT NULL DEFAULT 'pending'
         CHECK (status IN ('pending', 'confirmed', 'rejected')),

  created_by_profile_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at            TIMESTAMPTZ,
  -- Öğretmenin veliye dönen kısa cevabı ("2.000 TL eksik" gibi).
  resolution_note TEXT CHECK (resolution_note IS NULL OR length(resolution_note) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_payment_notices_student
  ON public.parent_payment_notices (student_id, month_start DESC);

CREATE INDEX IF NOT EXISTS idx_payment_notices_open
  ON public.parent_payment_notices (workspace_id, status)
  WHERE status = 'pending';

-- Aynı ay için tek AÇIK bildirim. Kapanmış bildirimler çoğalabilir:
-- veli Eylül'de iki taksit ödeyip iki kez haber verebilir.
CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_notice_open
  ON public.parent_payment_notices (student_id, month_start)
  WHERE status = 'pending';

ALTER TABLE public.parent_payment_notices ENABLE ROW LEVEL SECURITY;

-- Öğretmen ve sahip: kendi çalışma alanındaki bildirimleri okur ve
-- sonuçlandırır. 066'nın "finans yalnız owner" kuralı BURADA GEÇERLİ
-- DEĞİL, çünkü bildirimde tutar yok — ders veren öğretmenin "veli
-- ödediğini söylüyor" bilgisini görmesi işin akışının parçası.
DROP POLICY IF EXISTS payment_notices_teacher ON public.parent_payment_notices;
CREATE POLICY payment_notices_teacher ON public.parent_payment_notices
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner', 'teacher'])));

-- Veli: YALNIZ OKUR. Yazma tek kapıdan, RPC'den geçer — aksi hâlde
-- veli `status`'ü doğrudan 'confirmed' yapabilirdi.
DROP POLICY IF EXISTS payment_notices_parent_read ON public.parent_payment_notices;
CREATE POLICY payment_notices_parent_read ON public.parent_payment_notices
  FOR SELECT
  USING ((SELECT public.is_parent_of_student(student_id)));

REVOKE ALL ON public.parent_payment_notices FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.parent_payment_notices TO authenticated;


-- ============================================================
-- 3) BİLDİRİM GÖNDER — veli
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_payment_notice(
  p_student_id  UUID,
  p_month_start DATE,
  p_note        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_id        UUID;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı.';
  END IF;

  IF NOT public.is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_month_start IS NULL THEN
    RAISE EXCEPTION 'Hangi ayın ödemesi olduğunu seçin.';
  END IF;

  -- Ay her zaman ayın ilk günü. İstemciden 15'i gelirse iki ayrı ay
  -- gibi görünür ve "tek açık bildirim" kuralı delinirdi.
  p_month_start := date_trunc('month', p_month_start)::DATE;

  -- GELECEK AY BİLDİRİLEMEZ: henüz doğmamış bir borcun ödemesi
  -- öğretmenin listesinde ne yapacağı belirsiz bir satır olurdu.
  IF p_month_start > date_trunc('month', CURRENT_DATE)::DATE THEN
    RAISE EXCEPTION 'Gelecek bir ay için ödeme bildirimi gönderilemez.';
  END IF;

  INSERT INTO public.parent_payment_notices (
    workspace_id, student_id, month_start, note, created_by_profile_id
  )
  VALUES (
    v_workspace, p_student_id, p_month_start, NULLIF(btrim(p_note), ''),
    public.current_profile_id()
  )
  ON CONFLICT (student_id, month_start) WHERE status = 'pending'
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Bu ay için zaten bekleyen bir bildiriminiz var.';
  END IF;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.create_payment_notice(UUID, DATE, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_payment_notice(UUID, DATE, TEXT) TO authenticated;


-- ============================================================
-- 4) BİLDİRİMİ SONUÇLANDIR — öğretmen
-- ============================================================
-- TUTARI ÖĞRETMEN GİRER. Velinin bildirimi bir TALEP; defterin sahibi
-- öğretmen. Tutar verilirse tahsilat satırı burada doğar, verilmezse
-- bildirim yalnız kapanır (öğretmen parayı Finans ekranından ayrıca
-- işlemiş olabilir).
CREATE OR REPLACE FUNCTION public.resolve_payment_notice(
  p_notice_id       UUID,
  p_status          TEXT,
  p_amount_kurus    INTEGER DEFAULT NULL,
  p_method          TEXT DEFAULT 'havale',
  p_resolution_note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_notice public.parent_payment_notices%ROWTYPE;
BEGIN
  SELECT * INTO v_notice FROM public.parent_payment_notices WHERE id = p_notice_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bildirim bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_notice.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF p_status NOT IN ('confirmed', 'rejected') THEN
    RAISE EXCEPTION 'Geçersiz sonuç.';
  END IF;

  IF v_notice.status <> 'pending' THEN
    RAISE EXCEPTION 'Bu bildirim zaten sonuçlandırılmış.';
  END IF;

  -- TAHSİLAT SATIRI YALNIZ SAHİBİN ELİNDEN ÇIKAR (066). Öğretmen rolü
  -- bildirimi kapatabilir ama parayı deftere yazamaz; tutar vermesi
  -- gerekiyorsa sahip yapar.
  IF p_status = 'confirmed' AND p_amount_kurus IS NOT NULL THEN
    IF NOT public.has_workspace_role(v_notice.workspace_id, ARRAY['owner']) THEN
      RAISE EXCEPTION 'Tahsilat kaydı için çalışma alanı sahibi olmalısınız.';
    END IF;

    IF p_amount_kurus <= 0 THEN
      RAISE EXCEPTION 'Tutar sıfırdan büyük olmalı.';
    END IF;

    IF p_method NOT IN ('nakit', 'havale', 'kart', 'diger') THEN
      RAISE EXCEPTION 'Geçersiz ödeme yöntemi.';
    END IF;

    INSERT INTO public.finance_payments (
      workspace_id, student_id, paid_on, amount_kurus, method, note,
      created_by_profile_id
    )
    VALUES (
      v_notice.workspace_id, v_notice.student_id, CURRENT_DATE, p_amount_kurus,
      p_method, 'Veli ödeme bildirimi onaylandı.', public.current_profile_id()
    );
  END IF;

  UPDATE public.parent_payment_notices
  SET status                 = p_status,
      resolved_by_profile_id = public.current_profile_id(),
      resolved_at            = NOW(),
      resolution_note        = NULLIF(btrim(p_resolution_note), '')
  WHERE id = p_notice_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.resolve_payment_notice(UUID, TEXT, INTEGER, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_payment_notice(UUID, TEXT, INTEGER, TEXT, TEXT) TO authenticated;
