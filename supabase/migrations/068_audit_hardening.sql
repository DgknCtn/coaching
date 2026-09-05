-- ============================================================
-- 068_audit_hardening
--
-- Dış denetim raporundaki üç veritabanı bulgusu:
--   1) Finans tablolarında çalışma alanı–öğrenci eşleşmesinin
--      doğrulanmaması + gereksiz doğrudan yazma izinleri.
--   2) Hız sınırlama sayacının parametrelerinin çağırandan gelmesi.
--   3) Belirteci yazılamamış siparişlerin yönetimde görünmemesi.
-- ============================================================


-- ============================================================
-- 1) FİNANS: ÇALIŞMA ALANI–ÖĞRENCİ BÜTÜNLÜĞÜ
--
-- SORUN (066_finance.sql:136-153): üç finans tablosunun politikası
-- yalnız satırın KENDİ workspace_id'sine bakıyor; aynı satırdaki
-- student_id'nin o çalışma alanına ait olduğu hiçbir yerde
-- doğrulanmıyor. Üstelik 066:159-161 `authenticated` rolüne doğrudan
-- INSERT/UPDATE/DELETE veriyor, yani RPC'lerdeki doğru kontroller
-- (set_student_fee, add_finance_lesson…) atlanabiliyor.
--
-- Sonuç: A çalışma alanının sahibi `workspace_id = A` + `student_id =
-- B'nin öğrencisi` satırı yazabilir. student_fees'in birincil anahtarı
-- student_id olduğu için bu bir kayıt çakışması da doğurur.
--
-- NEDEN POLİTİKAYI KARMAŞIKLAŞTIRMAK DEĞİL DE KISIT: politikaya bir
-- alt sorgu eklemek her satır için bir kontrol daha demek ve yalnız
-- RLS yolundan geçen yazmaları korur. Kompozit yabancı anahtar ise
-- tutarsız satırı veritabanı düzeyinde İMKÂNSIZ kılar — servis
-- rolüyle yapılan yazmalar dahil.
-- ============================================================

-- ------------------------------------------------------------
-- 1a) Önce mevcut veri kontrolü.
--
-- Tutarsız satır varsa ALTER TABLE zaten başarısız olurdu ama hata
-- mesajı hangi satırların sorunlu olduğunu söylemez. Bu blok migration
-- durmadan önce sayıyı ve tabloyu adıyla söyler.
-- ------------------------------------------------------------
DO $$
DECLARE
  v_fees     INTEGER;
  v_lessons  INTEGER;
  v_payments INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_fees
  FROM public.student_fees f
  JOIN public.students s ON s.id = f.student_id
  WHERE s.workspace_id <> f.workspace_id;

  SELECT COUNT(*) INTO v_lessons
  FROM public.finance_lessons l
  JOIN public.students s ON s.id = l.student_id
  WHERE s.workspace_id <> l.workspace_id;

  SELECT COUNT(*) INTO v_payments
  FROM public.finance_payments p
  JOIN public.students s ON s.id = p.student_id
  WHERE s.workspace_id <> p.workspace_id;

  IF v_fees + v_lessons + v_payments > 0 THEN
    RAISE EXCEPTION
      'Tutarsız finans satırı var (student_fees: %, finance_lessons: %, finance_payments: %). Kısıt eklenmeden önce temizlenmeli.',
      v_fees, v_lessons, v_payments;
  END IF;
END;
$$;

-- ------------------------------------------------------------
-- 1b) Kompozit yabancı anahtarın hedefi.
--
-- students(id) zaten birincil anahtar ama kompozit FK için referans
-- verilen sütun çiftinin kendisi de tekil olmalı. (workspace_id, id)
-- pratikte zaten tekil — id tek başına tekil olduğu için — bu kısıt
-- yalnızca bunu veritabanına SÖYLÜYOR.
-- ------------------------------------------------------------
ALTER TABLE public.students
  DROP CONSTRAINT IF EXISTS students_workspace_id_id_key;

ALTER TABLE public.students
  ADD CONSTRAINT students_workspace_id_id_key UNIQUE (workspace_id, id);

-- ------------------------------------------------------------
-- 1c) Üç finans tablosunda tekil FK yerine kompozit FK.
--
-- ON DELETE CASCADE korunuyor: öğrenci silindiğinde finans satırları da
-- gitmeli (066'daki davranış). Öğrencinin workspace_id'si değişmiyor —
-- çalışma alanı taşıma diye bir işlem yok — bu yüzden ON UPDATE
-- gerekmiyor.
-- ------------------------------------------------------------
ALTER TABLE public.student_fees
  DROP CONSTRAINT IF EXISTS student_fees_student_id_fkey,
  DROP CONSTRAINT IF EXISTS student_fees_workspace_student_fkey;

ALTER TABLE public.student_fees
  ADD CONSTRAINT student_fees_workspace_student_fkey
  FOREIGN KEY (workspace_id, student_id)
  REFERENCES public.students (workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.finance_lessons
  DROP CONSTRAINT IF EXISTS finance_lessons_student_id_fkey,
  DROP CONSTRAINT IF EXISTS finance_lessons_workspace_student_fkey;

ALTER TABLE public.finance_lessons
  ADD CONSTRAINT finance_lessons_workspace_student_fkey
  FOREIGN KEY (workspace_id, student_id)
  REFERENCES public.students (workspace_id, id) ON DELETE CASCADE;

ALTER TABLE public.finance_payments
  DROP CONSTRAINT IF EXISTS finance_payments_student_id_fkey,
  DROP CONSTRAINT IF EXISTS finance_payments_workspace_student_fkey;

ALTER TABLE public.finance_payments
  ADD CONSTRAINT finance_payments_workspace_student_fkey
  FOREIGN KEY (workspace_id, student_id)
  REFERENCES public.students (workspace_id, id) ON DELETE CASCADE;

-- ------------------------------------------------------------
-- 1d) Doğrudan yazma izinlerini geri al.
--
-- Yazma zaten YALNIZ RPC'ler üzerinden yapılıyor (set_student_fee,
-- add_finance_lesson, add_finance_payment, delete_finance_entry — hepsi
-- SECURITY DEFINER ve girişte rolü kontrol ediyor). Doğrudan DML
-- yetkisi, o RPC'lerin taşıdığı kontrolleri isteğe bağlı hâle
-- getiriyordu.
--
-- SELECT KALIYOR: student_finance_view security_invoker ile çalışıyor,
-- yani okuma çağıranın yetkisiyle yapılıyor ve RLS politikası doğru
-- süzüyor.
-- ------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.student_fees     FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.finance_lessons  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.finance_payments FROM authenticated;


-- ============================================================
-- 2) HIZ SINIRI: LİMİTLER SUNUCUDA
--
-- SORUN (050_rate_limit.sql:56-59, :109-111): check_rate_limit anon'a
-- açık ve ÜÇ parametresi de çağırandan geliyor — kova anahtarı, üst
-- sınır ve pencere. Sunucu tarafında eylem→limit eşlemesi yok.
--
-- İki ayrı istismar:
--   a) `p_max_attempts = 1` gönderip sayacı tek çağrıda doldurmak.
--   b) Anahtar tahmin edilebilir olduğu için (lib/rate-limit.ts tuzsuz
--      SHA-256 kullanıyordu) hedefin e-postasının kovasını hesaplayıp
--      hiç giriş denemeden o hesabı 15 dakika kilitlemek.
--
-- ÇÖZÜM: fonksiyon artık eylem ADI alıyor; limitler içeride. Özet de
-- burada, SUNUCUDA alınıyor — uygulamaya hiç gitmeyen bir tuzla.
-- Uygulama düz e-postayı gönderiyor (zaten TLS üzerinden ve zaten
-- biliyor), kova anahtarı dışarıdan yeniden üretilemiyor.
-- ============================================================

-- ------------------------------------------------------------
-- 2a) Tuz.
--
-- Tek satırlık bir tablo. Değeri hiçbir GRANT ile dışarı açılmıyor;
-- yalnız aşağıdaki SECURITY DEFINER fonksiyon okuyor.
--
-- NEDEN ORTAM DEĞİŞKENİ DEĞİL: .env.example'da yazdığımız gibi sahte
-- sır yanlış güvenlik varsayımı üretir. Bu değerin uygulamada hiç
-- bulunmaması, sızabileceği yüzeyi tamamen kaldırıyor.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_salt (
  id   BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  salt TEXT NOT NULL
);

ALTER TABLE public.rate_limit_salt ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_salt FROM anon, authenticated, PUBLIC;

INSERT INTO public.rate_limit_salt (id, salt)
VALUES (TRUE, encode(gen_random_bytes(32), 'hex'))
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2b) Yeni imza.
--
-- ESKİ SAYAÇLAR GEÇERSİZ KALIYOR ve bu doğru: anahtar biçimi değişti,
-- eski kovalar artık kimseye karşılık gelmiyor. En kötü ihtimalle
-- birkaç kullanıcı bir pencere boyunca fazladan hakka sahip olur;
-- fırsatçı temizlik onları bir gün içinde siler.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_action  TEXT,
  p_subject TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_max          INTEGER;
  v_window       INTEGER;
  v_salt         TEXT;
  v_bucket_key   TEXT;
  v_window_start TIMESTAMPTZ;
  v_attempts     INTEGER;
BEGIN
  -- EYLEM→LİMİT EŞLEMESİ BURADA. Değerler lib/rate-limit.ts'teki
  -- RATE_LIMITS ile aynı; orası artık yalnız BELGELEME, karar burada.
  CASE p_action
    WHEN 'login'         THEN v_max := 10; v_window := 15 * 60;
    WHEN 'register'      THEN v_max := 5;  v_window := 60 * 60;
    WHEN 'passwordReset' THEN v_max := 5;  v_window := 60 * 60;
    WHEN 'inviteAccept'  THEN v_max := 10; v_window := 15 * 60;
    ELSE
      -- Bilinmeyen eylem SESSİZCE GEÇİLMEZ: yanlış yazılmış bir eylem
      -- adı, koruması hiç çalışmayan bir akış demektir.
      RAISE EXCEPTION 'Bilinmeyen hız sınırı eylemi: %', p_action;
  END CASE;

  SELECT salt INTO v_salt FROM public.rate_limit_salt WHERE id;

  -- Konu verilmediyse (yalnız IP kovası) çağıran zaten kendi
  -- anahtarını veremiyor; boş konu tek bir ortak kovaya düşer.
  v_bucket_key := p_action || ':' ||
    encode(
      digest(v_salt || ':' || COALESCE(LOWER(TRIM(p_subject)), ''), 'sha256'),
      'hex'
    );

  -- Pencereyi tabana yuvarla: aynı pencereye düşen tüm denemeler tek satır.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM NOW()) / v_window) * v_window
  );

  INSERT INTO public.rate_limit_counters (bucket_key, window_start, attempts)
  VALUES (v_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET attempts = public.rate_limit_counters.attempts + 1
  RETURNING attempts INTO v_attempts;

  -- Fırsatçı temizlik: her 100 çağrıda bir eski pencereleri sil.
  IF (random() < 0.01) THEN
    DELETE FROM public.rate_limit_counters
    WHERE window_start < NOW() - INTERVAL '1 day';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_attempts <= v_max,
    'remaining', GREATEST(0, v_max - v_attempts),
    'retry_after_seconds',
      GREATEST(
        0,
        CEIL(EXTRACT(epoch FROM (v_window_start + make_interval(secs => v_window) - NOW())))
      )::INTEGER
  );
END;
$fn$;

-- Eski üç parametreli imza DÜŞÜRÜLÜYOR. Aşırı yükleme olarak kalırsa
-- hem PostgREST hangisini çağıracağını bilemez hem de saldırganın
-- kendi limitini verdiği yol açık kalırdı.
DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, INTEGER, INTEGER);

-- Giriş ve kayıt oturumsuz yapılır; anon çağırabilmeli.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, TEXT) TO anon, authenticated;


-- ============================================================
-- 3) YÖNETİM: BELİRTECİ OLMAYAN SİPARİŞLER
--
-- Ödeme başlatılırken belirtecin siparişe yazılamaması artık ödemeyi
-- hiç başlatmıyor (068 öncesi kod bunu sessizce geçiyordu). Yine de bu
-- düzeltmeden ÖNCE açılmış siparişler ve yarış durumları için elle
-- mutabakat gerekiyor — görünmeyen bir şey mutabık edilemez.
--
-- admin_overview'a bir sütun eklemek RETURNS TABLE değişikliği
-- gerektiriyor, bu yüzden fonksiyon önce düşürülüyor.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_overview();

CREATE OR REPLACE FUNCTION public.admin_overview()
RETURNS TABLE (
  total_workspaces    INTEGER,
  trial_workspaces    INTEGER,
  licensed_workspaces INTEGER,
  total_students      INTEGER,
  open_tickets        INTEGER,
  revenue_kurus       BIGINT,
  pending_kurus       BIGINT,
  expiring_trials     INTEGER,
  awaiting_payment    INTEGER,
  at_student_limit    INTEGER,
  -- 068:
  unmatched_orders    INTEGER
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INTEGER FROM public.workspaces),
    (SELECT COUNT(*)::INTEGER FROM public.workspaces WHERE plan = 'trial'),
    (SELECT COUNT(*)::INTEGER FROM public.workspaces WHERE plan = 'licensed'),
    (SELECT COUNT(*)::INTEGER FROM public.students WHERE status = 'active'),
    (SELECT COUNT(*)::INTEGER FROM public.support_tickets WHERE status <> 'closed'),
    COALESCE((SELECT SUM(gross_kurus) FROM public.billing_orders WHERE status = 'paid'), 0)::BIGINT,
    COALESCE((SELECT SUM(gross_kurus) FROM public.billing_orders WHERE status = 'pending'), 0)::BIGINT,
    -- Bitmesine 3 gün ya da daha az kalan denemeler. Süresi ÇOKTAN
    -- dolmuşlar sayılmıyor: onlar için yapılacak bir şey kalmadı,
    -- "dikkat gerektiren" bir iş değiller.
    (SELECT COUNT(*)::INTEGER FROM public.workspaces
      WHERE plan = 'trial'
        AND trial_ends_at IS NOT NULL
        AND trial_ends_at > NOW()
        AND trial_ends_at <= NOW() + INTERVAL '3 days'),
    (SELECT COUNT(DISTINCT workspace_id)::INTEGER FROM public.billing_orders
      WHERE status = 'pending'),
    (SELECT COUNT(*)::INTEGER FROM public.workspaces w
      WHERE w.student_limit IS NOT NULL
        AND (SELECT COUNT(*) FROM public.students s
              WHERE s.workspace_id = w.id AND s.status = 'active') >= w.student_limit),
    -- BELİRTECİ OLMAYAN AÇIK SİPARİŞLER. Bir saatlik pencere, ödeme
    -- başlatma ile belirtecin yazılması arasındaki normal boşluğu
    -- sayıma katmamak için: o aralıktaki bir sipariş henüz sorunlu
    -- değil, sadece yeni.
    (SELECT COUNT(*)::INTEGER FROM public.billing_orders
      WHERE status = 'pending'
        AND provider_token IS NULL
        AND created_at < NOW() - INTERVAL '1 hour');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_overview() TO authenticated;


-- ============================================================
-- ROLLBACK (elle)
--   -- 3)
--   DROP FUNCTION IF EXISTS public.admin_overview();
--   -- admin_overview 063'teki on sütunlu hâline döndürülmeli.
--
--   -- 2)
--   DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, TEXT);
--   DROP TABLE IF EXISTS public.rate_limit_salt;
--   -- check_rate_limit 050'deki üç parametreli hâline döndürülmeli
--   -- ve lib/rate-limit.ts eski çağrı biçimine geri alınmalı.
--
--   -- 1)
--   ALTER TABLE public.student_fees
--     DROP CONSTRAINT IF EXISTS student_fees_workspace_student_fkey,
--     ADD CONSTRAINT student_fees_student_id_fkey
--       FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
--   -- finance_lessons ve finance_payments için aynısı.
--   ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_workspace_id_id_key;
--   GRANT INSERT, UPDATE, DELETE ON public.student_fees, public.finance_lessons,
--     public.finance_payments TO authenticated;
-- ============================================================
