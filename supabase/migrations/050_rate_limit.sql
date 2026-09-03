-- ============================================================
-- 050_rate_limit  —  P1 GÜVENLİK
--
-- Kimlik akışlarına hız sınırı: giriş, kayıt, şifre sıfırlama, davet kabulü.
--
-- SORUN: uygulama katmanında hiçbir savunma yoktu. Giriş kaba kuvvete,
-- kayıt otomatik hesap üretimine, şifre sıfırlama da e-posta bombardımanına
-- açıktı. Yalnız Supabase'in genel limitlerine güveniliyordu.
--
-- NEDEN VERİTABANI, NEDEN BELLEK DEĞİL: uygulama sunucusuz çalışıyor.
-- Bellekteki bir sayaç yalnız o örnekte yaşar; ikinci bir örnek ayağa
-- kalktığında sayaç sıfırdan başlar ve sınır fiilen uygulanmaz. Ortak bir
-- durum gerekiyor, veritabanı da zaten her istekte erişilen tek ortak yer.
--
-- SABİT PENCERE, KAYAN PENCERE DEĞİL: kayan pencere daha adil sayar ama
-- her istek için geçmiş kayıtların taranmasını gerektirir. Kimlik akışları
-- düşük hacimli; sabit pencere burada yeterli ve ucuz. Sınırın hemen
-- ardından pencere sıfırlanınca kısa bir patlama mümkün olur — kabul
-- edilebilir, çünkü amaç mükemmel adalet değil kaba kuvveti kırmak.
--
-- GİZLİLİK: anahtar HAM DEĞER TUTMAZ. IP ve e-posta çağıran tarafta
-- SHA-256'dan geçirilerek gelir; tabloda kimlik değil, kimliğin özeti
-- durur. Sayaç tablosu sızsa bile kimin denediği okunamaz.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  -- 'login:<sha256>' gibi: eylem adı + hedefin özeti.
  bucket_key   TEXT        NOT NULL,
  -- Pencerenin başlangıcı; (key, window_start) tekil.
  window_start TIMESTAMPTZ NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket_key, window_start)
);

-- Temizlik taraması için: eski pencereler zamana göre silinir.
CREATE INDEX IF NOT EXISTS idx_rate_limit_window
  ON public.rate_limit_counters (window_start);

-- RLS açık ve HİÇBİR POLİTİKA YOK: tabloya yalnız aşağıdaki
-- SECURITY DEFINER fonksiyon yazabilir. Ne anon ne authenticated
-- doğrudan okuyabilir veya yazabilir — sayaçları okuyabilmek,
-- sınıra ne kadar kaldığını görüp ona göre saldırmak demektir.
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.rate_limit_counters FROM anon, authenticated, PUBLIC;

-- ------------------------------------------------------------
-- check_rate_limit
--
-- Sayacı ARTIRIR ve sınır aşıldıysa false döner. Yani "sor ve sonra artır"
-- değil, tek atomik adım: iki eşzamanlı denemenin ikisinin de sınırı
-- geçmesi (race) böylece engellenir.
--
-- Dönüş: { allowed, remaining, retry_after_seconds }
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_bucket_key      TEXT,
  p_max_attempts    INTEGER,
  p_window_seconds  INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_attempts     INTEGER;
BEGIN
  IF COALESCE(TRIM(p_bucket_key), '') = '' THEN
    RAISE EXCEPTION 'bucket_key zorunlu';
  END IF;

  IF p_max_attempts < 1 OR p_window_seconds < 1 THEN
    RAISE EXCEPTION 'Geçersiz sınır tanımı';
  END IF;

  -- Pencereyi tabana yuvarla: aynı pencereye düşen tüm denemeler tek satır.
  v_window_start := to_timestamp(
    floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
  );

  INSERT INTO public.rate_limit_counters (bucket_key, window_start, attempts)
  VALUES (p_bucket_key, v_window_start, 1)
  ON CONFLICT (bucket_key, window_start)
  DO UPDATE SET attempts = public.rate_limit_counters.attempts + 1
  RETURNING attempts INTO v_attempts;

  -- Fırsatçı temizlik: her 100 çağrıda bir eski pencereleri sil. Ayrı bir
  -- zamanlanmış iş kurmamak için; tablo küçük kalsın yeter.
  IF (random() < 0.01) THEN
    DELETE FROM public.rate_limit_counters
    WHERE window_start < NOW() - INTERVAL '1 day';
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_attempts <= p_max_attempts,
    'remaining', GREATEST(0, p_max_attempts - v_attempts),
    'retry_after_seconds',
      GREATEST(
        0,
        CEIL(EXTRACT(epoch FROM (v_window_start + make_interval(secs => p_window_seconds) - NOW())))
      )::INTEGER
  );
END;
$fn$;

-- Giriş ve kayıt oturumsuz yapılır; anon çağırabilmeli.
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER)
  TO anon, authenticated;

-- ============================================================
-- ROLLBACK
--
--   DROP FUNCTION IF EXISTS public.check_rate_limit(TEXT, INTEGER, INTEGER);
--   DROP TABLE IF EXISTS public.rate_limit_counters;
--
-- Geri alma kimlik akışlarını kaba kuvvete yeniden açar.
-- ============================================================
