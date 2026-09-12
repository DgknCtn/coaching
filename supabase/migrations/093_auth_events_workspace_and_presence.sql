-- ============================================================
-- 093 — giriş kaydına çalışma alanı, "kim online" ve temizlik sayacı
-- ============================================================
--
-- 089/090 çalışıyor ama üç eksiği var:
--
-- 1) ÇALIŞMA ALANI BOŞ KALIYOR. Giriş, çalışma alanı çözülmeden ÖNCE
--    gerçekleşiyor; kayıt `workspace_id` olmadan yazılıyordu. Sonucu
--    yalnız kozmetik değildi: auth_events'in RLS politikası kiracıya
--    göre yalıtılmış, dolayısıyla ÖĞRETMEN KENDİ ÖĞRENCİSİNİN girişini
--    hiç göremiyordu. "Öğrencim siteye giriyor mu" sorusu, öğretmenin
--    bu ekrandan bekleyeceği ilk şey.
--
--    Çözüm UYGULAMA KODUNDA DEĞİL, BURADA: log_auth_event çağrılırken
--    alan verilmemişse fonksiyon kendisi çözüyor. Uygulama tarafında
--    yapılsaydı her çağrı noktasında tekrarlanır ve biri unutulurdu.
--
-- 2) "KİM ONLINE" YOK. Doğru kaynak Supabase'in `auth.sessions`
--    tablosu ama o şemaya okuma yetkisi verilmedi; sütun adları
--    doğrulanamadı ve varsayımla SQL yazmak bu projede bir kez
--    (083) pahalıya patladı. Bunun yerine auth_events'ten TÜRETİLİYOR:
--    son olayı `login.success` olan ve üzerinden oturum ömründen az
--    zaman geçmiş kullanıcılar. Sınırı aşağıda açıkça yazıyor.
--
-- 3) TEMİZLİK ELLE. purge_auth_event_ips() vardı ama çağıran yoktu;
--    panel yalnız uyarı gösteriyordu. Artık zamanlanmış bir uçtan
--    çağrılıyor (app/api/cron/purge-auth-events) ve sonucu denetim
--    kaydına düşüyor.
--
-- Yeniden çalıştırılabilir.
-- ============================================================

-- ------------------------------------------------------------
-- log_auth_event — çalışma alanı çözümü eklendi
--
-- Gövdenin geri kalanı 089'daki hâliyle aynı; tek fark, alan
-- verilmediğinde profilden türetilmesi.
-- ------------------------------------------------------------
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
  v_name         TEXT;
  v_salt         TEXT;
  v_ip           INET;
  v_hash         TEXT;
  v_workspace_id UUID := p_workspace_id;
BEGIN
  IF p_profile_id IS NOT NULL THEN
    SELECT full_name INTO v_name FROM public.profiles WHERE id = p_profile_id;

    -- ÇALIŞMA ALANI ÇÖZÜMÜ.
    --
    -- Önce profilin varsayılan alanı; yoksa ilk aktif üyeliği. İkincisi
    -- şart: davetle gelen öğrenci ve velinin `default_workspace_id`i
    -- kurulmuyor, yalnız üyeliği açılıyor. Sadece varsayılana
    -- bakılsaydı öğretmen tam da görmek istediği kişileri —
    -- öğrencilerini ve velilerini — göremezdi.
    IF v_workspace_id IS NULL THEN
      SELECT COALESCE(
        (SELECT pr.default_workspace_id FROM public.profiles pr WHERE pr.id = p_profile_id),
        (SELECT wm.workspace_id
           FROM public.workspace_members wm
          WHERE wm.profile_id = p_profile_id
            AND wm.status = 'active'
          ORDER BY wm.created_at
          LIMIT 1)
      ) INTO v_workspace_id;
    END IF;
  END IF;

  BEGIN
    v_ip := NULLIF(TRIM(COALESCE(p_ip, '')), '')::INET;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  IF v_ip IS NOT NULL THEN
    SELECT salt INTO v_salt FROM public.rate_limit_salt WHERE id;
    IF v_salt IS NOT NULL THEN
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
    v_workspace_id, p_profile_id, v_name, p_event_type,
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

-- ------------------------------------------------------------
-- admin_active_users — "şu an kim online"
--
-- NE ÖLÇÜYOR VE NE ÖLÇMÜYOR — bu ayrım ekranda da yazıyor:
--
-- Kullanıcının SON olayı `login.success` ise ve üzerinden p_hours
-- saatten az geçmişse "aktif" sayılıyor. Bu bir YAKLAŞIKLIK:
--   - Sekmeyi kapatan ama çıkış yapmayan kullanıcı bir süre daha
--     listede kalır.
--   - Oturumu sunucuda düşmüş bir kullanıcı da öyle.
-- Kesin cevap `auth.sessions`'ta; oraya yetki verildiğinde bu fonksiyon
-- onunla değiştirilmeli. Yaklaşık olduğunu SÖYLEYEN bir ekran, kesin
-- olduğunu ima eden yanlış bir ekrandan iyidir.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_active_users(INTEGER);

CREATE FUNCTION public.admin_active_users(p_hours INTEGER DEFAULT 12)
RETURNS TABLE (
  profile_id     UUID,
  actor_name     TEXT,
  workspace_id   UUID,
  workspace_name TEXT,
  son_giris      TIMESTAMPTZ,
  ip             TEXT,
  country        TEXT,
  city           TEXT,
  user_agent     TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH son_olay AS (
    -- Kullanıcı başına EN SON olay. DISTINCT ON, her profil için
    -- sıralamanın ilk satırını verir.
    SELECT DISTINCT ON (e.profile_id)
      e.profile_id, e.event_type, e.created_at, e.workspace_id,
      e.actor_name, e.ip, e.country, e.city, e.user_agent
    FROM public.auth_events e
    WHERE e.profile_id IS NOT NULL
      AND e.created_at >= NOW() - make_interval(hours => LEAST(GREATEST(COALESCE(p_hours, 12), 1), 168))
      AND e.event_type IN ('login.success', 'logout', 'session_revoked')
    ORDER BY e.profile_id, e.created_at DESC
  )
  SELECT
    s.profile_id, s.actor_name, s.workspace_id, w.name,
    s.created_at, host(s.ip), s.country, s.city, s.user_agent
  FROM son_olay s
  LEFT JOIN public.workspaces w ON w.id = s.workspace_id
  WHERE s.event_type = 'login.success'
  ORDER BY s.created_at DESC;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_active_users(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_active_users(INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- teacher_auth_events — öğretmenin kendi alanı için hesap hareketleri
--
-- NEDEN AYRI RPC: auth_events'in RLS politikası öğretmene kendi
-- workspace'inin satırlarını zaten açıyor, yani doğrudan okuma da
-- çalışırdı. Ama sayfalama ve toplam sayı sunucuda hesaplanmalı
-- (admin tarafındaki gerekçenin aynısı) ve öğretmenin `ip_hash` gibi
-- iç alanları görmesi için bir sebep yok.
--
-- SECURITY DEFINER DEĞİL: bilinçli. Bu fonksiyonun RLS'i atlaması
-- gerekmiyor — çağıranın kendi yetkisiyle okuması tam olarak doğru
-- davranış ve yanlışlıkla başka kiracının verisini döndürmesi
-- imkânsız hâle geliyor.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.teacher_auth_events(UUID, INTEGER, INTEGER);

CREATE FUNCTION public.teacher_auth_events(
  p_workspace_id UUID,
  p_limit        INTEGER DEFAULT 30,
  p_offset       INTEGER DEFAULT 0
)
RETURNS TABLE (
  id         UUID,
  created_at TIMESTAMPTZ,
  event_type TEXT,
  actor_name TEXT,
  ip         TEXT,
  country    TEXT,
  city       TEXT,
  user_agent TEXT,
  toplam     BIGINT
)
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $fn$
  SELECT
    e.id, e.created_at, e.event_type, e.actor_name,
    host(e.ip), e.country, e.city, e.user_agent,
    COUNT(*) OVER () AS toplam
  FROM public.auth_events e
  WHERE e.workspace_id = p_workspace_id
  ORDER BY e.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 30), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
$fn$;

REVOKE ALL ON FUNCTION public.teacher_auth_events(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.teacher_auth_events(UUID, INTEGER, INTEGER) TO authenticated;
