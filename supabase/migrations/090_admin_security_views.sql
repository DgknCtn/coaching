-- ============================================================
-- 090_admin_security_views — yönetim panelindeki Güvenlik sekmesi
-- ============================================================
--
-- 089 veriyi TOPLUYOR; bu dosya onu OKUNABİLİR hâle getiriyor.
--
-- NEDEN RPC, NEDEN DOĞRUDAN TABLO OKUMASI DEĞİL: auth_events'in RLS
-- politikası kiracıya göre yalıtılmış (089) — öğretmen yalnız kendi
-- çalışma alanını görür ve bu doğru. Platform yöneticisinin ise
-- tamamına bakması gerekiyor. 063'teki `admin_recent_activity` ile aynı
-- desen: SECURITY DEFINER + girişte `is_platform_admin()` kontrolü.
--
-- "KİM ONLINE" BU DOSYADA YOK. Supabase'in `auth.sessions` tablosu
-- oturumların IP'sini ve tarayıcısını zaten tutuyor ve doğru kaynak o —
-- ama bu şemaya okuma yetkisi henüz verilmedi, dolayısıyla sütun adları
-- DOĞRULANAMADI. Varsayımla SQL yazıp canlıya uygulamak, tam da bu
-- projede 083'ün WHERE'siz DELETE'iyle bir kez yaşanan hataya davetiye
-- olurdu: çalışma zamanında patlayan, migration sırasında görünmeyen
-- kod. Yetki verildiğinde ayrı bir migration olarak eklenecek.
--
-- Yeniden çalıştırılabilir.
-- ============================================================

-- ============================================================
-- 1) admin_auth_events — filtreli giriş kaydı
--
-- Sayfalama SUNUCUDA. Tablo zamanla en büyük tablolardan biri olacak
-- (her giriş bir satır); tamamını çekip istemcide süzmek, panelin
-- kullanılamaz hâle gelmesi demekti.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_auth_events(INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ);

CREATE FUNCTION public.admin_auth_events(
  p_limit      INTEGER     DEFAULT 50,
  p_offset     INTEGER     DEFAULT 0,
  p_event_type TEXT        DEFAULT NULL,
  p_search     TEXT        DEFAULT NULL,
  p_since      TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id             UUID,
  created_at     TIMESTAMPTZ,
  event_type     TEXT,
  actor_name     TEXT,
  profile_id     UUID,
  workspace_id   UUID,
  workspace_name TEXT,
  ip             TEXT,
  country        TEXT,
  city           TEXT,
  user_agent     TEXT,
  detail         JSONB,
  toplam         BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  WITH suzulmus AS (
    SELECT
      e.id, e.created_at, e.event_type, e.actor_name, e.profile_id,
      e.workspace_id, w.name AS workspace_name,
      -- INET yerine METİN: arayüz tarafında biçimlendirme yapılmıyor,
      -- doğrudan basılıyor.
      host(e.ip) AS ip_text,
      e.country, e.city, e.user_agent, e.detail
    FROM public.auth_events e
    LEFT JOIN public.workspaces w ON w.id = e.workspace_id
    WHERE (p_event_type IS NULL OR e.event_type = p_event_type)
      AND (p_since IS NULL OR e.created_at >= p_since)
      AND (
        p_search IS NULL
        OR btrim(p_search) = ''
        -- Ad, IP ve ülke tek kutudan aranır. Yöneticinin elinde
        -- genelde tek bir ipucu olur ve hangi alana ait olduğunu
        -- bilmez.
        OR e.actor_name ILIKE '%' || btrim(p_search) || '%'
        OR host(e.ip) ILIKE '%' || btrim(p_search) || '%'
        OR e.country ILIKE '%' || btrim(p_search) || '%'
      )
  )
  SELECT
    s.id, s.created_at, s.event_type, s.actor_name, s.profile_id,
    s.workspace_id, s.workspace_name, s.ip_text, s.country, s.city,
    s.user_agent, s.detail,
    -- Toplam sayı HER SATIRDA döner. İkinci bir COUNT sorgusu, farklı
    -- bir anda çalışıp sayfalamayla tutarsız bir toplam verebilirdi.
    COUNT(*) OVER () AS toplam
  FROM suzulmus s
  ORDER BY s.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 50), 200)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_auth_events(INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_events(INTEGER, INTEGER, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

-- ============================================================
-- 2) admin_auth_suspicious — şüpheli hareket
--
-- ÜÇ SİNYAL, hepsi ip_hash üzerinden gruplanıyor:
--   - aynı kaynaktan KAÇ FARKLI hesaba erişilmiş
--   - kaç başarısız deneme yapılmış
--   - kaç kez hız sınırına takılmış
--
-- ip_hash KULLANILIYOR, ip DEĞİL: 90 gün sonra adres NULL'lanıyor ama
-- özet kalıyor (089). Böylece eski dönem için de "aynı kaynak" analizi
-- çalışmaya devam ediyor. Adres hâlâ duruyorsa örnek olarak gösteriliyor.
--
-- EŞİK YOK, SIRALAMA VAR: "kaç başarısız deneme şüphelidir" sorusunun
-- doğru cevabı kiracıya ve döneme göre değişir. SQL'e gömülen bir eşik,
-- değiştirmek için migration gerektirir; karar arayüzde ve gözde kalsın.
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_auth_suspicious(INTEGER, INTEGER);

CREATE FUNCTION public.admin_auth_suspicious(
  p_hours INTEGER DEFAULT 168,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  ip_hash        TEXT,
  ornek_ip       TEXT,
  hesap_sayisi   BIGINT,
  basarisiz      BIGINT,
  engellenen     BIGINT,
  basarili       BIGINT,
  ulkeler        TEXT,
  son_olay       TIMESTAMPTZ
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
    e.ip_hash,
    -- Adres 90 gün sonra silinmiş olabilir; o zaman NULL döner ve
    -- arayüz "adres saklama süresi doldu" gösterir.
    host(MAX(e.ip)) AS ornek_ip,
    COUNT(DISTINCT e.profile_id) FILTER (WHERE e.profile_id IS NOT NULL) AS hesap_sayisi,
    COUNT(*) FILTER (WHERE e.event_type = 'login.failed')       AS basarisiz,
    COUNT(*) FILTER (WHERE e.event_type = 'login.rate_limited') AS engellenen,
    COUNT(*) FILTER (WHERE e.event_type = 'login.success')      AS basarili,
    string_agg(DISTINCT e.country, ', ' ORDER BY e.country)     AS ulkeler,
    MAX(e.created_at)                                           AS son_olay
  FROM public.auth_events e
  WHERE e.ip_hash IS NOT NULL
    AND e.created_at >= NOW() - make_interval(hours => LEAST(GREATEST(COALESCE(p_hours, 168), 1), 8760))
  GROUP BY e.ip_hash
  -- Tek hesaba tek başarılı girişten ibaret olan kaynaklar listeyi
  -- doldurmasın; şüphe ancak çokluktan doğar.
  HAVING COUNT(DISTINCT e.profile_id) FILTER (WHERE e.profile_id IS NOT NULL) > 1
      OR COUNT(*) FILTER (WHERE e.event_type IN ('login.failed', 'login.rate_limited')) > 0
  ORDER BY
    COUNT(*) FILTER (WHERE e.event_type IN ('login.failed', 'login.rate_limited')) DESC,
    COUNT(DISTINCT e.profile_id) DESC,
    MAX(e.created_at) DESC
  LIMIT LEAST(COALESCE(p_limit, 20), 100);
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_auth_suspicious(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_suspicious(INTEGER, INTEGER) TO authenticated;

-- ============================================================
-- 3) admin_auth_summary — sekmenin üstündeki sayaçlar
-- ============================================================
DROP FUNCTION IF EXISTS public.admin_auth_summary(INTEGER);

CREATE FUNCTION public.admin_auth_summary(p_hours INTEGER DEFAULT 24)
RETURNS TABLE (
  basarili        BIGINT,
  basarisiz       BIGINT,
  engellenen      BIGINT,
  farkli_hesap    BIGINT,
  farkli_kaynak   BIGINT,
  temizlenecek_ip BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_since TIMESTAMPTZ;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  v_since := NOW() - make_interval(hours => LEAST(GREATEST(COALESCE(p_hours, 24), 1), 8760));

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (WHERE e.event_type = 'login.success'      AND e.created_at >= v_since),
    COUNT(*) FILTER (WHERE e.event_type = 'login.failed'       AND e.created_at >= v_since),
    COUNT(*) FILTER (WHERE e.event_type = 'login.rate_limited' AND e.created_at >= v_since),
    COUNT(DISTINCT e.profile_id) FILTER (WHERE e.created_at >= v_since AND e.profile_id IS NOT NULL),
    COUNT(DISTINCT e.ip_hash)    FILTER (WHERE e.created_at >= v_since AND e.ip_hash IS NOT NULL),
    -- SAKLAMA SÜRESİ GÖRÜNÜR OLSUN: 90 günü geçmiş ama hâlâ adres taşıyan
    -- satır sayısı. Sıfırdan büyükse temizlik çalışmamış demektir ve
    -- yönetici bunu ekranda görür — sessizce birikmesindense.
    (SELECT COUNT(*) FROM public.auth_events x
      WHERE x.created_at < NOW() - INTERVAL '90 days'
        AND (x.ip IS NOT NULL OR x.city IS NOT NULL OR x.user_agent IS NOT NULL))
  FROM public.auth_events e;
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_auth_summary(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_auth_summary(INTEGER) TO authenticated;
