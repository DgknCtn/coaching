-- ============================================================
-- 089_auth_events — giriş/çıkış denetim kaydı, IP ve cihaz
-- ============================================================
--
-- NEDEN YENİ BİR TABLO, NEDEN audit_events DEĞİL:
--
-- 051 `audit_events`i kurarken açık bir karar verdi ve yorumuna yazdı:
--   "Serbest bağlam. KİŞİSEL VERİ KOYULMAZ — bu tablo uzun ömürlü ve
--    silme taleplerinde temizlenmesi gereken bir yer olmamalı."
--
-- IP adresi, cihaz bilgisi ve konum KİŞİSEL VERİDİR. Bunları
-- audit_events'e karıştırmak, o kararı sessizce bozmak ve bugüne kadar
-- temiz tutulmuş bir tabloyu silme taleplerinin kapsamına sokmak olurdu.
--
-- Bu yüzden AYRI bir tablo: farklı veri sınıfı, farklı saklama süresi,
-- farklı temizlik kuralı. audit_events "kim neyi değiştirdi" sorusunun
-- kalıcı cevabı; auth_events "kim nereden girdi" sorusunun SÜRELİ cevabı.
--
-- SAKLAMA: IP ve şehir 90 gün sonra NULL'lanır (purge_auth_event_ips).
-- Olay kaydının kendisi kalır — "şu tarihte giriş yapıldı" bilgisi
-- kişisel veri değil, hesabın kendi geçmişi.
--
-- ip_hash NEDEN AYRI: adres silindikten sonra da "aynı kaynaktan kaç
-- farklı hesaba girilmiş" sorusu sorulabilsin diye. Özet, 068'deki hız
-- sınırı kovasıyla AYNI FORMÜLLE alınıyor (aynı tuz, aynı 'ip:' öneki);
-- böylece "bu IP hem hız sınırına takılmış hem de yirmi kez başarısız
-- giriş denemiş" tek sorguda görülebiliyor. Ayrı bir tuz kullanmak bu
-- eşleştirmeyi imkânsız kılardı.
--
-- BAŞARISIZ GİRİŞTE E-POSTA SAKLANMAZ. Girilen adres bilinen bir hesaba
-- aitse `profile_id` yazılır, değilse boş kalır. Ham adresi saklamak iki
-- riski birden getirirdi: gereksiz kişisel veri ve kullanıcının şifresini
-- yanlışlıkla e-posta alanına yazdığı durumda şifrenin düz metin
-- loglanması.
--
-- AKTİF OTURUMLAR İÇİN TABLO YOK. Supabase'in kendi `auth.sessions`
-- tablosu her oturumun IP'sini ve tarayıcısını zaten tutuyor ve GoTrue
-- tarafından bakımlı. Kendi tablomuzu tutmak, her istekte bir "son
-- görülme" yazması demekti — 088'de tam da bu tür istek başına ek
-- maliyeti temizledik.
--
-- Yeniden çalıştırılabilir.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.auth_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NULL OLABİLİR: giriş, çalışma alanı çözülmeden ÖNCE gerçekleşiyor.
  -- Başarısız denemede hiç workspace yoktur.
  workspace_id  UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- NULL OLABİLİR: tanınmayan bir hesaba yapılan deneme.
  -- Profil silinse bile olay kalmalı: SET NULL.
  profile_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- audit_events ile aynı gerekçe: adın O GÜNKÜ hâli korunsun.
  actor_name    TEXT,

  event_type    TEXT NOT NULL CHECK (event_type IN (
    'login.success',
    'login.failed',
    'login.rate_limited',
    'logout',
    'password_reset_requested',
    'password_changed',
    'register',
    'session_revoked'
  )),

  ip            INET,
  ip_hash       TEXT,
  user_agent    TEXT,
  country       TEXT,
  city          TEXT,

  -- Kişisel veri KOYULMAZ; sayı, tarih ve id yeterli.
  detail        JSONB NOT NULL DEFAULT '{}'::JSONB,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Yönetim panelindeki filtreli tablo: tarih aralığı + workspace.
CREATE INDEX IF NOT EXISTS idx_auth_events_workspace_time
  ON public.auth_events (workspace_id, created_at DESC);

-- "Bu kullanıcı nereden girdi" ve platform geneli akış.
CREATE INDEX IF NOT EXISTS idx_auth_events_profile_time
  ON public.auth_events (profile_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_events_created_at
  ON public.auth_events (created_at DESC);

-- Şüpheli hareket: aynı kaynaktan çok hesap / çok başarısız deneme.
CREATE INDEX IF NOT EXISTS idx_auth_events_ip_hash_time
  ON public.auth_events (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

ALTER TABLE public.auth_events ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- DEĞİŞMEZLİK: UPDATE/DELETE politikası YOK.
--
-- 051'in audit_events için koyduğu kuralın aynısı: "Denetim kaydı
-- değiştirilebiliyorsa denetim kaydı değildir." Saklama temizliği bile
-- politika üzerinden değil, SECURITY DEFINER fonksiyonla yapılıyor.
-- ============================================================

DROP POLICY IF EXISTS auth_events_select_teacher ON public.auth_events;
CREATE POLICY auth_events_select_teacher ON public.auth_events
  FOR SELECT
  USING (
    -- 088'in dersi: yardımcı çağrı alt sorguya SARILIR, yoksa satır
    -- başına çalışır.
    workspace_id IS NOT NULL
    AND (SELECT public.has_workspace_role(auth_events.workspace_id, ARRAY['owner', 'teacher']))
  );

-- Kullanıcı KENDİ giriş geçmişini görebilir; workspace'i olmayan
-- olaylar (başarısız deneme, şifre sıfırlama) da buna dahil.
DROP POLICY IF EXISTS auth_events_select_self ON public.auth_events;
CREATE POLICY auth_events_select_self ON public.auth_events
  FOR SELECT
  USING (profile_id = (SELECT public.current_profile_id()));

REVOKE ALL ON public.auth_events FROM anon;
GRANT SELECT ON public.auth_events TO authenticated;

-- ============================================================
-- log_auth_event
--
-- HİÇBİR ZAMAN HATA FIRLATMAZ — log_audit_event ile aynı gerekçe:
-- denetim satırı yazılamadı diye kimsenin giriş yapamaması, çok daha
-- kötü bir arıza olurdu.
--
-- anon'a da AÇIK olmak zorunda: başarısız giriş denemesi, tanımı gereği
-- oturumu olmayan bir istemciden gelir. Fonksiyon yalnız YAZAR, hiçbir
-- şey döndürmez; okuma RLS'e tabi kalır.
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_auth_event(
  p_event_type   TEXT,
  p_profile_id   UUID DEFAULT NULL,
  p_workspace_id UUID DEFAULT NULL,
  p_ip           TEXT DEFAULT NULL,
  p_user_agent   TEXT DEFAULT NULL,
  p_country      TEXT DEFAULT NULL,
  p_city         TEXT DEFAULT NULL,
  p_detail       JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp, extensions
AS $fn$
DECLARE
  v_name TEXT;
  v_salt TEXT;
  v_ip   INET;
  v_hash TEXT;
BEGIN
  IF p_profile_id IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = p_profile_id;
  END IF;

  -- Geçersiz IP metni tüm kaydı düşürmesin: adres olmadan da olay
  -- kaydedilmeye değer.
  BEGIN
    v_ip := NULLIF(TRIM(COALESCE(p_ip, '')), '')::INET;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  IF v_ip IS NOT NULL THEN
    SELECT salt INTO v_salt FROM public.rate_limit_salt WHERE id;
    IF v_salt IS NOT NULL THEN
      -- 068'deki hız sınırı kovasıyla AYNI FORMÜL:
      --   digest(salt || ':' || LOWER(TRIM(subject)))   ve subject = 'ip:<adres>'
      -- Ayrışırsa iki kayıt birbirine bağlanamaz ve "bu IP hem sınıra
      -- takıldı hem başarısız giriş denedi" sorusu sorulamaz.
      --
      -- host() kanonik gösterimi verir (IPv6'da kısaltmaları normalize
      -- eder); LOWER ise 068'deki normalizasyonun birebir karşılığı.
      v_hash := encode(
        digest(v_salt || ':' || LOWER('ip:' || host(v_ip)), 'sha256'),
        'hex'
      );
    END IF;
  END IF;

  INSERT INTO public.auth_events (
    workspace_id, profile_id, actor_name, event_type,
    ip, ip_hash, user_agent, country, city, detail
  )
  VALUES (
    p_workspace_id, p_profile_id, v_name, p_event_type,
    v_ip, v_hash, NULLIF(TRIM(COALESCE(p_user_agent, '')), ''),
    NULLIF(TRIM(COALESCE(p_country, '')), ''),
    NULLIF(TRIM(COALESCE(p_city, '')), ''),
    COALESCE(p_detail, '{}'::JSONB)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'auth_events yazılamadı (event=%): %', p_event_type, SQLERRM;
END;
$fn$;

REVOKE ALL ON FUNCTION public.log_auth_event(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB)
  TO anon, authenticated;

-- ============================================================
-- purge_auth_event_ips — SAKLAMA SÜRESİ
--
-- 90 günden eski kayıtlarda adres, şehir ve tarayıcı bilgisi NULL'lanır.
-- Olay satırı SİLİNMEZ: "şu tarihte giriş yapıldı" hesabın kendi
-- geçmişidir ve denetim zincirinin kopmaması gerekir. Silinen, yalnız
-- kişisel veridir.
--
-- ip_hash KORUNUR — geri okunamaz ve "aynı kaynaktan kaç hesap" sorusu
-- adres olmadan da cevaplanabilsin diye.
--
-- Kaç satırın temizlendiğini döndürür; çağıran bunu loglayabilir.
-- ============================================================
CREATE OR REPLACE FUNCTION public.purge_auth_event_ips()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_count INTEGER;
BEGIN
  WITH temizlenen AS (
    UPDATE public.auth_events
    SET ip = NULL, city = NULL, user_agent = NULL
    WHERE created_at < NOW() - INTERVAL '90 days'
      AND (ip IS NOT NULL OR city IS NOT NULL OR user_agent IS NOT NULL)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM temizlenen;

  RETURN v_count;
END;
$fn$;

REVOKE ALL ON FUNCTION public.purge_auth_event_ips() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_auth_event_ips() TO authenticated;
