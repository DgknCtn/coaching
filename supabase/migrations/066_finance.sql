-- ============================================================
-- 066_finance
--
-- FİNANS / ÖDEMELER — ders başına tahakkuk, ödeme takibi, bakiye.
--
-- ============================================================
-- MODEL: TAHAKKUK DERS BAŞINADIR
--
-- Öğrenciye bir DERS ÜCRETİ tanımlanır. Yapılan her ders bir satırdır ve
-- o satır kadar borç doğurur (tahakkuk). Öğrenciden alınan para ayrı bir
-- satırdır (tahsilat). Bakiye ikisinin farkıdır.
--
--   bakiye = tahakkuk − tahsilat
--   bakiye > 0 → öğrenci borçlu
--   bakiye < 0 → fazla ödeme (gelecek derslerden düşer)
--
-- ÜCRET DERS SATIRINA KOPYALANIR. Ders kaydı, o an geçerli olan ücreti
-- kendi içinde saklar; ücret sonradan değiştiğinde geçmiş dersler
-- ETKİLENMEZ. Aksi hâlde Ocak'ta 500 ₺'ye yapılan on ders, Mart'ta ücret
-- 700 ₺ olunca geriye dönük 2.000 ₺ borç yaratırdı — öğretmenin
-- müşterisine açıklayamayacağı bir tablo.
--
-- ============================================================
-- ERİŞİM: YALNIZ ÇALIŞMA ALANI SAHİBİ
--
-- Ücret ve borç, öğrencinin akademik verisinden farklı bir mahremiyet
-- sınıfı: aynı çalışma alanında ders veren başka bir öğretmenin, bir
-- ailenin ödeme yapıp yapmadığını bilmesi için hiçbir sebep yok.
-- Politikalar 'owner' rolüne kilitli; öğrenci ve veli hiçbir finans
-- satırını GÖREMEZ (kendi borcunu bile — bu ürün veliye fatura kesmiyor,
-- öğretmenin kendi defteri).
-- ============================================================


-- ============================================================
-- 1) ÖĞRENCİ DERS ÜCRETİ
--
-- Öğrenci başına TEK satır (PK student_id): "şu an geçerli ücret".
-- Ücret tarihçesi ayrı bir tabloda tutulmuyor, çünkü tarihçenin işlevini
-- ders satırlarındaki kopya zaten görüyor — hangi dersin kaça yapıldığı
-- orada yazıyor.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.student_fees (
  student_id   UUID PRIMARY KEY REFERENCES public.students(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- KURUŞ, TAM SAYI. Para kayan noktalı sayıyla tutulmaz (bkz. 058).
  per_lesson_kurus INTEGER NOT NULL CHECK (per_lesson_kurus BETWEEN 0 AND 100000000),

  note       TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_fees_workspace
  ON public.student_fees (workspace_id);

DROP TRIGGER IF EXISTS handle_updated_at ON public.student_fees;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.student_fees
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();


-- ============================================================
-- 2) DERS KAYDI (TAHAKKUK)
--
-- Bir satır = bir gün yapılan ders(ler). `quantity` aynı gün birden çok
-- ders yapıldığında ayrı satır açmayı gereksiz kılar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_lessons (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  lesson_date  DATE NOT NULL,
  quantity     SMALLINT NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 20),

  -- Ders anındaki ücretin KOPYASI. Sonradan ücret değişse de bu satır
  -- olduğu gibi kalır.
  unit_price_kurus INTEGER NOT NULL CHECK (unit_price_kurus BETWEEN 0 AND 100000000),

  note       TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_lessons_student
  ON public.finance_lessons (student_id, lesson_date DESC);

CREATE INDEX IF NOT EXISTS idx_finance_lessons_workspace
  ON public.finance_lessons (workspace_id, lesson_date DESC);


-- ============================================================
-- 3) TAHSİLAT
-- ============================================================

CREATE TABLE IF NOT EXISTS public.finance_payments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id   UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,

  paid_on      DATE NOT NULL,
  amount_kurus INTEGER NOT NULL CHECK (amount_kurus BETWEEN 1 AND 100000000),

  -- Yöntem, mutabakat için: "banka hesabında görünmeyen tahsilat" ile
  -- "elden alınan" ayrımı, ay sonunda kasa tutmayınca ilk bakılan yer.
  method TEXT NOT NULL DEFAULT 'nakit'
         CHECK (method IN ('nakit', 'havale', 'kart', 'diger')),

  note       TEXT CHECK (note IS NULL OR length(note) <= 500),
  created_by_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_finance_payments_student
  ON public.finance_payments (student_id, paid_on DESC);

CREATE INDEX IF NOT EXISTS idx_finance_payments_workspace
  ON public.finance_payments (workspace_id, paid_on DESC);


-- ============================================================
-- 4) RLS — SAHİBE KİLİTLİ
--
-- 'teacher' rolü BİLİNÇLİ OLARAK YOK. Öğrenci ve veli için politika hiç
-- yazılmadı: politika olmayan tabloda RLS açıkken satır görünmez.
-- ============================================================

ALTER TABLE public.student_fees      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_lessons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.finance_payments  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_fees_owner ON public.student_fees;
CREATE POLICY student_fees_owner ON public.student_fees
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])));

DROP POLICY IF EXISTS finance_lessons_owner ON public.finance_lessons;
CREATE POLICY finance_lessons_owner ON public.finance_lessons
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])));

DROP POLICY IF EXISTS finance_payments_owner ON public.finance_payments;
CREATE POLICY finance_payments_owner ON public.finance_payments
  FOR ALL
  USING ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])))
  WITH CHECK ((SELECT public.has_workspace_role(workspace_id, ARRAY['owner'])));

REVOKE ALL ON public.student_fees     FROM anon;
REVOKE ALL ON public.finance_lessons  FROM anon;
REVOKE ALL ON public.finance_payments FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fees     TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_lessons  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_payments TO authenticated;


-- ============================================================
-- 5) ÖĞRENCİ BAZINDA BAKİYE — view
--
-- security_invoker = on: view ÇAĞIRANIN haklarıyla çalışır, yani
-- yukarıdaki 'owner' politikaları burada da geçerlidir. Bu ayar
-- olmadan view, sahibinin haklarıyla çalışıp RLS'i delerdi (049'daki
-- P0 bulgusu tam olarak buydu).
--
-- ARŞİVLENMİŞ ÖĞRENCİ DE LİSTEDE: ayrılan öğrencinin ödenmemiş borcu
-- silinmiş olmuyor. Süzme kararı arayüzde.
-- ============================================================

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
  p.last_payment_on
FROM public.students s
LEFT JOIN public.student_fees f ON f.student_id = s.id
LEFT JOIN (
  SELECT
    student_id,
    SUM(quantity)                     AS lesson_count,
    SUM(quantity * unit_price_kurus)  AS accrued_kurus,
    MAX(lesson_date)                  AS last_lesson_on
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


-- ============================================================
-- 6) AYLIK ÖZET — son N ay, tahakkuk ve tahsilat
--
-- Grafiği besleyen tek sorgu. İki tabloyu ayrı ayrı çekip istemcide
-- birleştirmek, boş ayların hiç görünmemesine yol açardı: gelir
-- grafiğinde eksik ay, düşüşü gizler.
-- ============================================================

CREATE OR REPLACE FUNCTION public.finance_monthly_summary(
  p_workspace_id UUID,
  p_months       INTEGER DEFAULT 6
)
RETURNS TABLE (
  month_start     DATE,
  accrued_kurus   BIGINT,
  collected_kurus BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  WITH bounds AS (
    SELECT
      date_trunc('month', CURRENT_DATE)::DATE
        - (GREATEST(LEAST(COALESCE(p_months, 6), 24), 1) - 1) * INTERVAL '1 month' AS from_month
  ),
  -- Ay ekseni ÖNCE üretilir: hiç hareket olmayan ay da sıfırla görünsün.
  months AS (
    SELECT generate_series(
      (SELECT from_month FROM bounds),
      date_trunc('month', CURRENT_DATE),
      INTERVAL '1 month'
    )::DATE AS month_start
  )
  SELECT
    m.month_start,
    COALESCE((
      SELECT SUM(l.quantity * l.unit_price_kurus)
      FROM public.finance_lessons l
      WHERE l.workspace_id = p_workspace_id
        AND date_trunc('month', l.lesson_date)::DATE = m.month_start
    ), 0)::BIGINT,
    COALESCE((
      SELECT SUM(pm.amount_kurus)
      FROM public.finance_payments pm
      WHERE pm.workspace_id = p_workspace_id
        AND date_trunc('month', pm.paid_on)::DATE = m.month_start
    ), 0)::BIGINT
  FROM months m
  -- YETKİ KONTROLÜ SORGUNUN İÇİNDE: fonksiyon SECURITY DEFINER, yani
  -- RLS'i atlıyor. Rol kontrolü olmasaydı herhangi bir kullanıcı
  -- başkasının çalışma alanının cirosunu okuyabilirdi.
  WHERE public.has_workspace_role(p_workspace_id, ARRAY['owner'])
  ORDER BY m.month_start;
$fn$;

GRANT EXECUTE ON FUNCTION public.finance_monthly_summary(UUID, INTEGER) TO authenticated;


-- ============================================================
-- 7) DERS ÜCRETİ BELİRLEME
--
-- UPSERT: ücret öğrenci başına tek satır. Ayrı "ekle" ve "güncelle"
-- yolları, arayüzün önce var mı diye sorması demekti.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_student_fee(
  p_student_id       UUID,
  p_per_lesson_kurus INTEGER,
  p_note             TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_per_lesson_kurus IS NULL OR p_per_lesson_kurus < 0 THEN
    RAISE EXCEPTION 'Geçerli bir ders ücreti girin';
  END IF;

  INSERT INTO public.student_fees (student_id, workspace_id, per_lesson_kurus, note)
  VALUES (p_student_id, v_workspace_id, p_per_lesson_kurus, NULLIF(TRIM(COALESCE(p_note, '')), ''))
  ON CONFLICT (student_id) DO UPDATE
    SET per_lesson_kurus = EXCLUDED.per_lesson_kurus,
        note             = EXCLUDED.note;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_student_fee(UUID, INTEGER, TEXT) TO authenticated;


-- ============================================================
-- 8) DERS KAYDI EKLEME
--
-- Ücret PARAMETRE DEĞİL, tablodan okunur. İstemcinin gönderdiği bir
-- fiyatı yazmak, öğrenciye istediği tutarı borç yazabilen bir uç
-- açardı. Tanımlı ücret yoksa işlem reddedilir: 0 ₺'lik ders kaydı,
-- öğretmenin fark etmeyeceği sessiz bir kayıp olurdu.
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_finance_lesson(
  p_student_id  UUID,
  p_lesson_date DATE,
  p_quantity    SMALLINT DEFAULT 1,
  p_note        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_price        INTEGER;
  v_id           UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  SELECT per_lesson_kurus INTO v_price
  FROM public.student_fees WHERE student_id = p_student_id;

  IF v_price IS NULL THEN
    RAISE EXCEPTION 'Önce bu öğrenci için ders ücreti tanımlayın';
  END IF;

  IF p_lesson_date IS NULL OR p_lesson_date > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'Geçerli bir ders tarihi girin';
  END IF;

  INSERT INTO public.finance_lessons (
    workspace_id, student_id, lesson_date, quantity, unit_price_kurus, note,
    created_by_profile_id
  )
  VALUES (
    v_workspace_id, p_student_id, p_lesson_date, COALESCE(p_quantity, 1), v_price,
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'lesson_id',     v_id,
    'accrued_kurus', COALESCE(p_quantity, 1)::BIGINT * v_price
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.add_finance_lesson(UUID, DATE, SMALLINT, TEXT) TO authenticated;


-- ============================================================
-- 9) TAHSİLAT EKLEME
-- ============================================================

CREATE OR REPLACE FUNCTION public.add_finance_payment(
  p_student_id   UUID,
  p_paid_on      DATE,
  p_amount_kurus INTEGER,
  p_method       TEXT DEFAULT 'nakit',
  p_note         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_workspace_id UUID;
  v_id           UUID;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM public.students WHERE id = p_student_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Öğrenci bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_amount_kurus IS NULL OR p_amount_kurus < 1 THEN
    RAISE EXCEPTION 'Geçerli bir tutar girin';
  END IF;

  IF p_paid_on IS NULL OR p_paid_on > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'Geçerli bir ödeme tarihi girin';
  END IF;

  INSERT INTO public.finance_payments (
    workspace_id, student_id, paid_on, amount_kurus, method, note,
    created_by_profile_id
  )
  VALUES (
    v_workspace_id, p_student_id, p_paid_on, p_amount_kurus,
    COALESCE(NULLIF(TRIM(COALESCE(p_method, '')), ''), 'nakit'),
    NULLIF(TRIM(COALESCE(p_note, '')), ''),
    public.current_profile_id()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('payment_id', v_id);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.add_finance_payment(UUID, DATE, INTEGER, TEXT, TEXT) TO authenticated;


-- ============================================================
-- 10) KAYIT SİLME
--
-- Yanlış girilen bir ders ya da tahsilat düzeltilebilmeli; düzeltilemeyen
-- bir defter, kullanılmayan bir defterdir. Silme SAHİBE ve KENDİ çalışma
-- alanına kilitli; RLS zaten bunu sağlıyor ama fonksiyon üzerinden
-- gitmek, arayüzün iki tablo için iki ayrı yol tutmasını engelliyor.
-- ============================================================

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
BEGIN
  IF p_kind = 'lesson' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.finance_lessons WHERE id = p_id;
  ELSIF p_kind = 'payment' THEN
    SELECT workspace_id INTO v_workspace_id FROM public.finance_payments WHERE id = p_id;
  ELSE
    RAISE EXCEPTION 'Geçersiz kayıt türü';
  END IF;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Kayıt bulunamadı';
  END IF;

  IF NOT public.has_workspace_role(v_workspace_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'Bu işlemi yalnız çalışma alanı sahibi yapabilir';
  END IF;

  IF p_kind = 'lesson' THEN
    DELETE FROM public.finance_lessons WHERE id = p_id;
  ELSE
    DELETE FROM public.finance_payments WHERE id = p_id;
  END IF;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.delete_finance_entry(TEXT, UUID) TO authenticated;
