-- ============================================================
-- 141_finance_v1  (M1.0-02 · Faz 1/3)
--
-- MatMuh M1.0-02 §6-§10 ve §13, P0 10-13:
--   "Finans bunun parasal sonucunu çıkarır."
--   "Tahakkuk ve tahsilat ayrı kayıt türleri olmalı."
--   "Geçmiş fiyatlar tarihsel sürümden okunmalı."
--   "Telafi oturumlarında idempotent finans kontrolü uygulanmalı."
--
-- ============================================================
-- TAHAKKUK = finance_lessons (YENİ TABLO YOK)
-- ============================================================
-- 066'dan beri her toplam `SUM(quantity * unit_price_kurus)` ile
-- hesaplanıyor (view'lar, aylık özet, 086'nın veli rozeti, 137'nin
-- temizliği). Yeni bir tahakkuk tablosu bunların hepsini ikiye
-- bölerdi. Bunun yerine satır TÜRÜ eklenir:
--
--   ders     gerçekleşen oturum (otomatik) ya da elle girilen ders
--   ek_ders  aylık sabitte ek ders (otomatik)
--   aylik    aylık sabit dönem ücreti (otomatik, ayda bir)
--   devir    önceki dönemden devreden bakiye (elle)
--   manuel   diğer elle tahakkuk
--
-- OTOMATİK SATIRDA quantity = 1 ve unit_price_kurus = SATIR TUTARI
-- (085'in kuralı). Gerçek birim ve birim fiyat bilgi olarak
-- `unit_count` / `rate_kurus` kolonlarında durur. Böylece hiçbir
-- toplam ifadesi değişmez.
--
-- ============================================================
-- TUTAR BİRİMDEN, SÜREDEN DEĞİL
-- ============================================================
-- 085: ücret × dakika / 60. Kaldırıldı (karar 11 Ekim 2026). Tutar
-- = ders birimi × o tarihte geçerli fiyat sürümü.
--
-- FİNANS İLİŞKİSİ ÖĞRENCİNİN MODELİNE GÖRE OKUNUR:
--   Modele dahil (aylik_paket) · Aylık Sabit → ücret yok (ek ders hariç)
--                              · Ders Başı   → birim × ders başı fiyatı
--                              · model yok   → ücret yok
--   Oturum başı  (ders_basi)   · Aylık Sabit → birim × ek ders fiyatı
--                              · diğer       → birim × ders başı fiyatı
--   Takip dışı   (haric)       → kayıt yok
--   Telafi                     → hizmeti miras alır; tek satır (UNIQUE)
--
-- GEÇMİŞ DEĞİŞMEZ: tetikleyici yalnız oturum değiştiğinde çalışır.
-- Fiyat sürümü eklemek geçmiş satırları yeniden hesaplamaz.
--
-- YENİDEN ÇALIŞTIRILABİLİR (058'den beri zorunlu).
-- ============================================================


-- ============================================================
-- 1) finance_lessons — tür, birim, birim fiyat
-- ============================================================
ALTER TABLE public.finance_lessons
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'ders';

ALTER TABLE public.finance_lessons
  ADD COLUMN IF NOT EXISTS unit_count NUMERIC(5,2);

ALTER TABLE public.finance_lessons
  ADD COLUMN IF NOT EXISTS rate_kurus INTEGER;

ALTER TABLE public.finance_lessons
  DROP CONSTRAINT IF EXISTS finance_lessons_kind_chk;
ALTER TABLE public.finance_lessons
  ADD CONSTRAINT finance_lessons_kind_chk
  CHECK (kind IN ('ders', 'ek_ders', 'aylik', 'devir', 'manuel'));

-- Aylık sabit ücret ayda BİR kez doğar; ensure_period_accruals kaç kez
-- çağrılırsa çağrılsın.
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_lessons_month_fee
  ON public.finance_lessons (student_id, lesson_date)
  WHERE kind = 'aylik';


-- ============================================================
-- 2) Oturumdan tahakkuk
-- ============================================================
CREATE OR REPLACE FUNCTION public.sync_session_accrual(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_ss         public.service_sessions%ROWTYPE;
  v_service    public.student_services%ROWTYPE;
  v_model      TEXT;
  v_price_type TEXT;
  v_kind       TEXT;
  v_rate       INTEGER;
  v_units      NUMERIC;
  v_amount     INTEGER;
  v_date       DATE;
  v_price_date DATE;
  v_origin     TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_ss FROM public.service_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  SELECT * INTO v_service FROM public.student_services WHERE id = v_ss.service_id;

  IF v_service.finance_link IS NULL
     OR v_service.finance_link = 'haric'
     OR v_ss.status <> 'yapildi'
     OR v_ss.attended IS FALSE
  THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  -- Fiyat GERÇEKLEŞME tarihinde geçerli olandır (§10: "o tarihte
  -- geçerli fiyat").
  v_price_date := (COALESCE(v_ss.actual_at, v_ss.current_planned_at, v_ss.planned_at)
                   AT TIME ZONE 'Europe/Istanbul')::DATE;
  v_model := public.finance_model_at(v_ss.student_id, v_price_date);

  -- PARITY-BEGIN accrual_rule
  IF v_service.finance_link = 'aylik_paket' THEN
    IF v_model = 'ders_basi' THEN
      v_price_type := 'ders_basi';
      v_kind := CASE WHEN v_ss.is_extra THEN 'ek_ders' ELSE 'ders' END;
    ELSIF v_model = 'aylik_sabit' AND v_ss.is_extra THEN
      v_price_type := 'ek_ders';
      v_kind := 'ek_ders';
    ELSE
      v_price_type := NULL;
    END IF;
  ELSE
    -- 'ders_basi' = Oturum başı
    IF v_model = 'aylik_sabit' THEN
      v_price_type := 'ek_ders';
      v_kind := 'ek_ders';
    ELSE
      v_price_type := 'ders_basi';
      v_kind := CASE WHEN v_ss.is_extra THEN 'ek_ders' ELSE 'ders' END;
    END IF;
  END IF;
  -- PARITY-END accrual_rule

  IF v_price_type IS NULL THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  v_rate := public.price_at(v_ss.student_id, v_price_type, v_price_date);

  -- Fiyat tanımsızsa sıfır TL'lik satır açılmaz ("bedava yapıldı"
  -- demek olurdu); ekran oturumu "fiyatsız" diye işaretler.
  IF v_rate IS NULL THEN
    DELETE FROM public.finance_lessons WHERE service_session_id = p_session_id;
    RETURN;
  END IF;

  v_units  := COALESCE(v_ss.unit_count, v_service.default_unit_count, 1);
  v_amount := ROUND(v_rate::NUMERIC * v_units);

  -- TELAFİ ASIL AYA YAZILIR (082/085 ile aynı kural).
  -- PARITY-BEGIN accrual_date
  SELECT asil.planned_at INTO v_origin
  FROM public.service_sessions asil
  WHERE asil.id = v_ss.makeup_of_session_id;

  v_date := (COALESCE(v_origin, v_ss.planned_at) AT TIME ZONE 'Europe/Istanbul')::DATE;
  -- PARITY-END accrual_date

  INSERT INTO public.finance_lessons (
    workspace_id, student_id, lesson_date, quantity, unit_price_kurus,
    service_session_id, kind, unit_count, rate_kurus, note, created_by_profile_id
  )
  VALUES (
    v_ss.workspace_id, v_ss.student_id, v_date, 1, v_amount,
    p_session_id, v_kind, v_units, v_rate,
    'Ders & Görüşmeler kaydından otomatik.', v_ss.created_by_profile_id
  )
  ON CONFLICT (service_session_id) WHERE service_session_id IS NOT NULL
  DO UPDATE SET
    lesson_date      = EXCLUDED.lesson_date,
    unit_price_kurus = EXCLUDED.unit_price_kurus,
    kind             = EXCLUDED.kind,
    unit_count       = EXCLUDED.unit_count,
    rate_kurus       = EXCLUDED.rate_kurus;
END;
$fn$;

REVOKE ALL ON FUNCTION public.sync_session_accrual(UUID) FROM PUBLIC, anon, authenticated;

-- Birim, ek ders ve gerçekleşme anı da tutarı değiştirir.
DROP TRIGGER IF EXISTS trg_sync_session_accrual ON public.service_sessions;
CREATE TRIGGER trg_sync_session_accrual
  AFTER INSERT OR DELETE OR
  UPDATE OF status, attended, duration_minutes, makeup_of_session_id,
            unit_count, is_extra, actual_at
  ON public.service_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_session_accrual();


-- Model/fiyat SONRADAN tanımlandığında, o güne dek fiyatsız kalmış
-- gerçekleşmiş oturumlara satır açar. Var olan satırlara DOKUNMAZ —
-- geçmiş tutarlar değişmez.
CREATE OR REPLACE FUNCTION public.backfill_missing_accruals(p_student_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace UUID;
  v_count     INTEGER := 0;
  r           RECORD;
BEGIN
  SELECT workspace_id INTO v_workspace FROM public.students WHERE id = p_student_id;
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  FOR r IN
    SELECT ss.id
    FROM public.service_sessions ss
    WHERE ss.student_id = p_student_id
      AND ss.status = 'yapildi'
      AND NOT EXISTS (
        SELECT 1 FROM public.finance_lessons l WHERE l.service_session_id = ss.id
      )
  LOOP
    PERFORM public.sync_session_accrual(r.id);
    IF EXISTS (SELECT 1 FROM public.finance_lessons l WHERE l.service_session_id = r.id) THEN
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.backfill_missing_accruals(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.backfill_missing_accruals(UUID) TO authenticated;


-- ============================================================
-- 3) Aylık sabit dönem ücreti
--
-- Oturum üretimiyle aynı TEMBEL desen (cron yok): Finans ekranı
-- açılırken çağrılır, eksik ayları tamamlar, var olana dokunmaz.
--
-- Bir ay, o ayın SON günü itibarıyla model Aylık Sabit ise ücret doğurur
-- (ay ortasında başlayan öğrenci o ayı da öder). Tutar ayın ilk günü
-- geçerli aylık fiyat; o gün henüz fiyat yoksa ayın son günündeki.
--
-- Satır SİLİNMEZ: sahip bir ayın ücretini kaldırırsa satır 0 TL'ye
-- çekilir (delete_finance_entry). Silinseydi bir sonraki çağrı onu
-- geri getirirdi.
-- ============================================================
CREATE OR REPLACE FUNCTION public.ensure_period_accruals(p_workspace_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_created INTEGER := 0;
  v_now     DATE := (NOW() AT TIME ZONE 'Europe/Istanbul')::DATE;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  WITH ilk AS (
    SELECT m.student_id, MIN(date_trunc('month', m.valid_from)::DATE) AS ilk_ay
    FROM public.student_finance_models m
    JOIN public.students s ON s.id = m.student_id
    WHERE m.workspace_id = p_workspace_id
      AND m.model = 'aylik_sabit'
      AND s.status = 'active'
    GROUP BY m.student_id
  ),
  aylar AS (
    SELECT i.student_id, gs::DATE AS ay
    FROM ilk i
    CROSS JOIN LATERAL generate_series(
      i.ilk_ay, date_trunc('month', v_now)::DATE, INTERVAL '1 month'
    ) AS gs
  ),
  ucretli AS (
    SELECT
      a.student_id,
      a.ay,
      COALESCE(
        public.price_at(a.student_id, 'aylik', a.ay),
        public.price_at(a.student_id, 'aylik', (a.ay + INTERVAL '1 month - 1 day')::DATE)
      ) AS tutar
    FROM aylar a
    WHERE public.finance_model_at(a.student_id, (a.ay + INTERVAL '1 month - 1 day')::DATE) = 'aylik_sabit'
  ),
  eklenen AS (
    INSERT INTO public.finance_lessons (
      workspace_id, student_id, lesson_date, quantity, unit_price_kurus,
      kind, unit_count, rate_kurus, note
    )
    SELECT p_workspace_id, u.student_id, u.ay, 1, u.tutar, 'aylik', 1, u.tutar,
           'Aylık sabit ücret.'
    FROM ucretli u
    WHERE u.tutar IS NOT NULL
    ON CONFLICT (student_id, lesson_date) WHERE kind = 'aylik' DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_created FROM eklenen;

  RETURN v_created;
END;
$fn$;

REVOKE ALL ON FUNCTION public.ensure_period_accruals(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_period_accruals(UUID) TO authenticated;


-- ============================================================
-- 4) Elle tahakkuk: devreden bakiye ve diğer
--
-- Telefon notundaki "8 Mart tarihinden kalan = 3.800 lira" satırı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.add_manual_accrual(
  p_student_id   UUID,
  p_kind         TEXT,
  p_amount_kurus INTEGER,
  p_date         DATE,
  p_note         TEXT DEFAULT NULL
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
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;
  IF p_kind NOT IN ('devir', 'manuel') THEN
    RAISE EXCEPTION 'Geçersiz tahakkuk türü';
  END IF;
  IF p_amount_kurus IS NULL OR p_amount_kurus < 1 OR p_amount_kurus > 100000000 THEN
    RAISE EXCEPTION 'Geçerli bir tutar girin';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Tarih gerekli';
  END IF;

  INSERT INTO public.finance_lessons (
    workspace_id, student_id, lesson_date, quantity, unit_price_kurus,
    kind, note, created_by_profile_id
  )
  VALUES (
    v_workspace, p_student_id, p_date, 1, p_amount_kurus,
    p_kind, NULLIF(TRIM(COALESCE(p_note, '')), ''), public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.add_manual_accrual(UUID, TEXT, INTEGER, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_manual_accrual(UUID, TEXT, INTEGER, DATE, TEXT) TO authenticated;


-- ============================================================
-- 5) Tahsilat — hesap, döneme uygulama, banka hazırlığı
--
-- Banka alanları V1'de YAZILMAZ (§10: "V1 banka entegrasyonuna bağımlı
-- değildir"); manuel tahsilatın ileride eşleşmeye dönüşebilmesi için
-- şemada hazır durur.
-- ============================================================
ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS account TEXT;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS applies_to_month DATE;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS bank_name TEXT;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS bank_transaction_id TEXT;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS sender_name TEXT;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS transacted_at TIMESTAMPTZ;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS gross_amount_kurus INTEGER;

ALTER TABLE public.finance_payments
  ADD COLUMN IF NOT EXISTS match_status TEXT;

ALTER TABLE public.finance_payments
  DROP CONSTRAINT IF EXISTS finance_payments_source_chk;
ALTER TABLE public.finance_payments
  ADD CONSTRAINT finance_payments_source_chk
  CHECK (source IN ('manual', 'bank'));

ALTER TABLE public.finance_payments
  DROP CONSTRAINT IF EXISTS finance_payments_account_chk;
ALTER TABLE public.finance_payments
  ADD CONSTRAINT finance_payments_account_chk
  CHECK (account IS NULL OR length(account) <= 80);

ALTER TABLE public.finance_payments
  DROP CONSTRAINT IF EXISTS finance_payments_match_status_chk;
ALTER TABLE public.finance_payments
  ADD CONSTRAINT finance_payments_match_status_chk
  CHECK (match_status IS NULL OR match_status IN ('unmatched', 'suggested', 'matched'));

-- Aynı banka hareketi iki kez içeri alınmasın (ileride).
CREATE UNIQUE INDEX IF NOT EXISTS uq_finance_payments_bank_tx
  ON public.finance_payments (workspace_id, bank_transaction_id)
  WHERE bank_transaction_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.add_finance_payment_v2(
  p_student_id       UUID,
  p_paid_on          DATE,
  p_amount_kurus     INTEGER,
  p_method           TEXT DEFAULT 'nakit',
  p_account          TEXT DEFAULT NULL,
  p_applies_to_month DATE DEFAULT NULL,
  p_note             TEXT DEFAULT NULL
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
  IF v_workspace IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_workspace, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;
  IF p_amount_kurus IS NULL OR p_amount_kurus < 1 THEN
    RAISE EXCEPTION 'Geçerli bir tutar girin';
  END IF;
  IF p_paid_on IS NULL OR p_paid_on > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'Geçerli bir ödeme tarihi girin';
  END IF;
  IF p_method IS NOT NULL AND p_method NOT IN ('nakit', 'havale', 'kart', 'diger') THEN
    RAISE EXCEPTION 'Geçersiz ödeme yöntemi';
  END IF;

  INSERT INTO public.finance_payments (
    workspace_id, student_id, paid_on, amount_kurus, method, account,
    applies_to_month, source, note, created_by_profile_id
  )
  VALUES (
    v_workspace, p_student_id, p_paid_on, p_amount_kurus,
    COALESCE(p_method, 'nakit'),
    NULLIF(TRIM(COALESCE(p_account, '')), ''),
    CASE WHEN p_applies_to_month IS NULL THEN NULL
         ELSE date_trunc('month', p_applies_to_month)::DATE END,
    'manual',
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.add_finance_payment_v2(UUID, DATE, INTEGER, TEXT, TEXT, DATE, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_finance_payment_v2(UUID, DATE, INTEGER, TEXT, TEXT, DATE, TEXT) TO authenticated;


-- ============================================================
-- 6) Giderler
-- ============================================================
CREATE TABLE IF NOT EXISTS public.finance_expenses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  category     TEXT NOT NULL
               CHECK (category IN ('sabit', 'ogrenci', 'oturum', 'kesinti')),
  student_id   UUID,
  session_id   UUID REFERENCES public.service_sessions(id) ON DELETE SET NULL,
  payment_id   UUID REFERENCES public.finance_payments(id) ON DELETE SET NULL,
  amount_kurus INTEGER NOT NULL CHECK (amount_kurus BETWEEN 1 AND 100000000),
  spent_on     DATE NOT NULL,
  note         TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Öğrenciye bağlı gider başka çalışma alanının öğrencisini gösteremez.
ALTER TABLE public.finance_expenses
  DROP CONSTRAINT IF EXISTS finance_expenses_workspace_student_fkey;
ALTER TABLE public.finance_expenses
  ADD CONSTRAINT finance_expenses_workspace_student_fkey
  FOREIGN KEY (workspace_id, student_id)
  REFERENCES public.students (workspace_id, id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_finance_expenses_workspace
  ON public.finance_expenses (workspace_id, spent_on DESC);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_student
  ON public.finance_expenses (student_id, spent_on DESC)
  WHERE student_id IS NOT NULL;

ALTER TABLE public.finance_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finance_expenses_owner ON public.finance_expenses;
CREATE POLICY finance_expenses_owner ON public.finance_expenses
  FOR SELECT
  USING (finance_expenses.workspace_id IN (SELECT public.my_workspace_ids(ARRAY['owner'::text])));

REVOKE INSERT, UPDATE, DELETE ON public.finance_expenses FROM authenticated;
REVOKE ALL ON public.finance_expenses FROM anon;
GRANT SELECT ON public.finance_expenses TO authenticated;

CREATE OR REPLACE FUNCTION public.add_expense(
  p_workspace_id UUID,
  p_category     TEXT,
  p_amount_kurus INTEGER,
  p_spent_on     DATE,
  p_student_id   UUID DEFAULT NULL,
  p_session_id   UUID DEFAULT NULL,
  p_payment_id   UUID DEFAULT NULL,
  p_note         TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id UUID;
BEGIN
  IF NOT public.has_workspace_role(p_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;
  IF p_category NOT IN ('sabit', 'ogrenci', 'oturum', 'kesinti') THEN
    RAISE EXCEPTION 'Geçersiz gider türü';
  END IF;
  IF p_amount_kurus IS NULL OR p_amount_kurus < 1 OR p_amount_kurus > 100000000 THEN
    RAISE EXCEPTION 'Geçerli bir tutar girin';
  END IF;
  IF p_spent_on IS NULL THEN
    RAISE EXCEPTION 'Tarih gerekli';
  END IF;
  -- Bağlantılar AYNI çalışma alanında olmalı; FK yalnız öğrenciyi
  -- kompozit kontrol ediyor.
  IF p_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.service_sessions WHERE id = p_session_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Oturum bulunamadı';
  END IF;
  IF p_payment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.finance_payments WHERE id = p_payment_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'Tahsilat bulunamadı';
  END IF;

  INSERT INTO public.finance_expenses (
    workspace_id, category, student_id, session_id, payment_id,
    amount_kurus, spent_on, note, created_by_profile_id
  )
  VALUES (
    p_workspace_id, p_category, p_student_id, p_session_id, p_payment_id,
    p_amount_kurus, p_spent_on, NULLIF(TRIM(COALESCE(p_note, '')), ''),
    public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.add_expense(UUID, TEXT, INTEGER, DATE, UUID, UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_expense(UUID, TEXT, INTEGER, DATE, UUID, UUID, UUID, TEXT) TO authenticated;


-- 066 imzası korunur; 'expense' türü eklenir. Aylık sabit satır
-- silinmez, sıfırlanır (bkz. ensure_period_accruals).
CREATE OR REPLACE FUNCTION public.delete_finance_entry(
  p_kind TEXT,
  p_id   UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_row_kind     TEXT;
BEGIN
  IF p_kind = 'lesson' THEN
    SELECT workspace_id, kind INTO v_workspace_id, v_row_kind
    FROM public.finance_lessons WHERE id = p_id;
  ELSIF p_kind = 'payment' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.finance_payments WHERE id = p_id;
  ELSIF p_kind = 'expense' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.finance_expenses WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Geçersiz kayıt türü';
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Kayıt bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_kind = 'lesson' AND v_row_kind = 'aylik' THEN
    UPDATE public.finance_lessons
    SET unit_price_kurus = 0,
        note = 'Bu ay ücretlendirilmedi.'
    WHERE id = p_id;
  ELSIF p_kind = 'lesson' THEN
    DELETE FROM public.finance_lessons WHERE id = p_id;
  ELSIF p_kind = 'payment' THEN
    DELETE FROM public.finance_payments WHERE id = p_id;
  ELSE
    DELETE FROM public.finance_expenses WHERE id = p_id;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.delete_finance_entry(TEXT, UUID) TO authenticated;


-- ============================================================
-- 7) Okuma
-- ============================================================

-- 066'nın view'ı: ders sayısı artık yalnız ders/ek ders satırları
-- (aylık ücret ve devir "ders" değildir). Kesirli birim toplamı
-- (5,5 ders) sona eklenen `unit_total` kolonunda; `lesson_count`un
-- tipi değiştirilemez (085'in sezon özeti bu view'a bağlı).
CREATE OR REPLACE VIEW public.student_finance_view AS
SELECT
  s.id                          AS student_id,
  s.workspace_id,
  s.full_name                   AS student_full_name,
  s.status                      AS student_status,
  f.per_lesson_kurus,
  COALESCE(l.lesson_count, 0)   AS lesson_count,
  COALESCE(l.accrued_kurus, 0)  AS accrued_kurus,
  COALESCE(p.collected_kurus, 0) AS collected_kurus,
  COALESCE(l.accrued_kurus, 0) - COALESCE(p.collected_kurus, 0) AS balance_kurus,
  l.last_lesson_on,
  p.last_payment_on,
  COALESCE(l.unit_total, 0)     AS unit_total
FROM public.students s
LEFT JOIN public.student_fees f ON f.student_id = s.id
LEFT JOIN (
  SELECT
    student_id,
    SUM(quantity) FILTER (WHERE kind IN ('ders', 'ek_ders')) AS lesson_count,
    SUM(quantity * unit_price_kurus)  AS accrued_kurus,
    MAX(lesson_date) FILTER (WHERE kind IN ('ders', 'ek_ders')) AS last_lesson_on,
    SUM(COALESCE(unit_count, quantity)) FILTER (WHERE kind IN ('ders', 'ek_ders')) AS unit_total
  FROM public.finance_lessons
  GROUP BY student_id
) l ON l.student_id = s.id
LEFT JOIN (
  SELECT
    student_id,
    SUM(amount_kurus) AS collected_kurus,
    MAX(paid_on)      AS last_payment_on
  FROM public.finance_payments
  GROUP BY student_id
) p ON p.student_id = s.id;

ALTER VIEW public.student_finance_view SET (security_invoker = on);
REVOKE ALL ON public.student_finance_view FROM anon;
GRANT SELECT ON public.student_finance_view TO authenticated;


-- Finans ana ekranının dört göstergesi, seçili ay için. "Bekleyen
-- alacak" ay değil BUGÜN itibarıyla açık bakiyelerin toplamıdır
-- (öğrenci cari hesabı, karar 11 Ekim 2026). Fazla ödeyenin alacağı
-- başkasının borcunu kapatmaz: yalnız pozitif bakiyeler toplanır.
CREATE OR REPLACE FUNCTION public.finance_period_overview(
  p_workspace_id UUID,
  p_month        DATE
)
RETURNS TABLE (
  month_start      DATE,
  accrued_kurus    BIGINT,
  collected_kurus  BIGINT,
  expense_kurus    BIGINT,
  receivable_kurus BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH ay AS (SELECT date_trunc('month', p_month)::DATE AS ilk)
  SELECT
    ay.ilk,
    COALESCE((
      SELECT SUM(l.quantity * l.unit_price_kurus)
      FROM public.finance_lessons l
      WHERE l.workspace_id = p_workspace_id
        AND date_trunc('month', l.lesson_date)::DATE = ay.ilk
    ), 0)::BIGINT,
    COALESCE((
      SELECT SUM(pm.amount_kurus)
      FROM public.finance_payments pm
      WHERE pm.workspace_id = p_workspace_id
        AND date_trunc('month', pm.paid_on)::DATE = ay.ilk
    ), 0)::BIGINT,
    COALESCE((
      SELECT SUM(e.amount_kurus)
      FROM public.finance_expenses e
      WHERE e.workspace_id = p_workspace_id
        AND date_trunc('month', e.spent_on)::DATE = ay.ilk
    ), 0)::BIGINT,
    COALESCE((
      SELECT SUM(GREATEST(b.bakiye, 0))
      FROM (
        SELECT s.id,
               COALESCE((SELECT SUM(l.quantity * l.unit_price_kurus)
                         FROM public.finance_lessons l WHERE l.student_id = s.id), 0)
             - COALESCE((SELECT SUM(pm.amount_kurus)
                         FROM public.finance_payments pm WHERE pm.student_id = s.id), 0) AS bakiye
        FROM public.students s
        WHERE s.workspace_id = p_workspace_id
      ) b
    ), 0)::BIGINT
  FROM ay
  WHERE public.has_workspace_role(p_workspace_id, ARRAY['owner']);
$fn$;

REVOKE ALL ON FUNCTION public.finance_period_overview(UUID, DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finance_period_overview(UUID, DATE) TO authenticated;


-- ============================================================
-- 8) Öğrenci finansını kalıcı silme — yeni tablolar da
-- ============================================================
CREATE OR REPLACE FUNCTION public.purge_student_finance(
  p_student_id   UUID,
  p_confirm_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_student  RECORD;
  v_lessons  INT;
  v_payments INT;
  v_notices  INT;
  v_fee      INT;
  v_prices   INT;
  v_expenses INT;
BEGIN
  SELECT id, workspace_id, full_name INTO v_student
  FROM public.students WHERE id = p_student_id;
  IF v_student.id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;
  IF NOT public.has_workspace_role(v_student.workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;
  IF btrim(COALESCE(p_confirm_name, '')) <> btrim(v_student.full_name) THEN
    RAISE EXCEPTION 'Onay için öğrencinin adını birebir yazın.';
  END IF;

  -- Fiyat ve model ÖNCE: yoksa aşağıdaki silmeler sırasında tetiklenen
  -- bir oturum senkronu tahakkuku yeniden yazabilir (137 ile aynı sıra).
  DELETE FROM public.student_fees WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_fee = ROW_COUNT;
  DELETE FROM public.student_price_versions WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_prices = ROW_COUNT;
  DELETE FROM public.student_finance_models WHERE student_id = p_student_id;
  DELETE FROM public.finance_lessons WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_lessons = ROW_COUNT;
  DELETE FROM public.finance_expenses WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_expenses = ROW_COUNT;
  DELETE FROM public.finance_payments WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_payments = ROW_COUNT;
  DELETE FROM public.parent_payment_notices WHERE student_id = p_student_id;
  GET DIAGNOSTICS v_notices = ROW_COUNT;

  PERFORM public.log_audit_event(
    v_student.workspace_id,
    'finance.purge_student',
    'student',
    v_student.id,
    jsonb_build_object('lessons', v_lessons, 'payments', v_payments,
                       'notices', v_notices, 'fee', v_fee,
                       'prices', v_prices, 'expenses', v_expenses)
  );

  RETURN jsonb_build_object('lessons', v_lessons, 'payments', v_payments,
                            'notices', v_notices, 'fee', v_fee,
                            'prices', v_prices, 'expenses', v_expenses);
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_student_finance(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.purge_student_finance(UUID, TEXT) TO authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.finance_period_overview(UUID, DATE);
--   DROP FUNCTION IF EXISTS public.add_expense(UUID, TEXT, INTEGER, DATE, UUID, UUID, UUID, TEXT);
--   DROP TABLE IF EXISTS public.finance_expenses;
--   DROP FUNCTION IF EXISTS public.add_finance_payment_v2(UUID, DATE, INTEGER, TEXT, TEXT, DATE, TEXT);
--   DROP FUNCTION IF EXISTS public.add_manual_accrual(UUID, TEXT, INTEGER, DATE, TEXT);
--   DROP FUNCTION IF EXISTS public.ensure_period_accruals(UUID);
--   DROP FUNCTION IF EXISTS public.backfill_missing_accruals(UUID);
-- ============================================================
