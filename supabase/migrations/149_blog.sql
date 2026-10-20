-- ============================================================
-- 149 — BLOG: PAZARLAMA İÇERİĞİ VE YÖNETİM PANELİNDEN YÖNETİMİ
--
-- NEDEN: arama motoruna açık içeriğin tamamı tanıtım sayfası ve beş
-- hukuki metinden ibaretti (lib/brand.ts, PUBLIC_ROUTES). Ürün hiçbir
-- arama sorgusunda görünmüyor, yani organik giriş kanalı yok. Blog
-- yazı başına bir adres, kendi başlık/açıklama etiketleri ve sitemap
-- girdisi getiriyor.
--
-- YAZILAR KİRACI VERİSİ DEĞİL: workspace_id SÜTUNU YOK ve bilinçli
-- olarak yok. Blog pazarlama içeriği; bir çalışma alanına ait değil,
-- platformun kendisine ait. workspace_id koymak, hangi alanın yazısı
-- olduğu sorusunu doğurur ve RLS'i gereksizce karmaşıklaştırırdı.
--
-- KARARLAR (kullanıcı, 20 Ekim 2026):
--   - İçerik MARKDOWN olarak saklanır; HTML değil. Dönüştürme
--     uygulamada (lib/blog-markdown.ts) ve React elemanı üretiyor,
--     yani HTML enjeksiyonu yüzeyi hiç açılmıyor. Veritabanı metni
--     olduğu gibi tutar.
--   - KAPAK GÖRSELİ YOK: Supabase Storage bu projede hiç kullanılmıyor
--     ve CSP img-src yalnız 'self' veriyor. Görsel alanı açmak ikisini
--     birden değiştirmek demekti.
--   - KATEGORİ AYRI TABLO DEĞİL, CHECK'li TEXT. Kategori kullanıcı
--     verisi değil pazarlama kararı; sayısı bir elin parmağını geçmez.
--     Tek kaynak lib/blog-categories.ts ve ikisinin ayrışmaması
--     tests/blog-categories.test.ts ile korunuyor.
--   - YAZMA YALNIZ PLATFORM YÖNETİCİSİ: her admin_* fonksiyonu
--     is_platform_admin() denetler (060'ın kuralı).
--
-- OKUMA DA RPC İLE — RLS POLİTİKASIYLA DEĞİL.
--
-- Bu projede bugüne kadar HİÇBİR tablo anon'a SELECT vermedi; anon
-- erişimi her zaman SECURITY DEFINER bir fonksiyonla verildi
-- (resolve_partner_code, verify_student_pin, request_pin_reason).
-- Aynı yol burada da seçildi çünkü tabloya ileride eklenecek bir
-- sütun (iç not, taslak yorumu, yazar e-postası) SESSİZCE herkese
-- açık hâle gelmesin: fonksiyon sütunları TEK TEK sayıyor.
--
-- YÖNETİM KAYDI YALNIZ GERİ ALINAMAZ/GÖRÜNÜR İŞLEMLERDE:
-- admin_actions her kayıt için 10-500 karakter GEREKÇE şart koşuyor
-- (128). Taslak kaydetmede gerekçe istemek, bir yazıyı yazarken on kez
-- gerekçe yazmak demekti — kimse yazmaz, herkes "güncelleme" yazar ve
-- kayıt değersizleşir. Bu yüzden kayda YALNIZ yayınla / geri çek / sil
-- giriyor; taslak kaydetme girmiyor.
--
-- KAPSAM DIŞI — ZAMANLANMIŞ YAYIN: panelde ileri tarih seçilemez,
-- admin_set_blog_post_status published_at'i NOW() yapar. Aşağıdaki
-- "published_at <= NOW()" koşulu bir özellik değil SAVUNMA: veritabanına
-- elle ileri tarihli bir satır girilirse public'te erken görünmesin.
--
-- YENİDEN ÇALIŞTIRILABİLİR.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.blog_posts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Yazının KALICI adresi. Yayından sonra değiştirmek paylaşılmış her
  -- bağlantıyı kırar; arayüz bunu uyarıyla söylüyor.
  slug            TEXT NOT NULL UNIQUE
                  CONSTRAINT blog_posts_slug_format
                  CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 3 AND 120),

  title           TEXT NOT NULL CHECK (length(btrim(title)) BETWEEN 3 AND 200),

  -- Liste kartında ve meta description yedeğinde görünür; bu yüzden
  -- zorunlu. Boş bırakılabilse kartlar yarım görünürdü.
  excerpt         TEXT NOT NULL CHECK (length(btrim(excerpt)) BETWEEN 20 AND 400),

  content         TEXT NOT NULL CHECK (length(btrim(content)) BETWEEN 50 AND 60000),

  category        TEXT NOT NULL CHECK (category IN (
                    'koclugun-temelleri',
                    'sinav-stratejisi',
                    'veli-iletisimi',
                    'urun-notlari'
                  )),

  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),

  -- Taslakta NULL. Yayınlanınca dolar ve GERİ ÇEKMEDE KORUNUR: yazı
  -- yeniden yayınlandığında ilk yayın tarihi kaybolmasın (arama motoru
  -- datePublished'ın geriye gitmesini şüpheli bulur).
  published_at    TIMESTAMPTZ,

  -- Arama sonucunda görünen başlık/açıklama. NULL ise title/excerpt
  -- kullanılır — iki alanı zorunlu kılmak her yazıda aynı metni iki kez
  -- yazdırmak olurdu.
  seo_title       TEXT CHECK (seo_title IS NULL OR length(btrim(seo_title)) BETWEEN 3 AND 70),
  seo_description TEXT CHECK (seo_description IS NULL OR length(btrim(seo_description)) BETWEEN 20 AND 160),

  -- JSON-LD'deki author. KİŞİSEL VERİ DEĞİL, marka adı: yazıların
  -- altında gerçek kişi adı göstermek ayrı bir karar ve ayrı bir
  -- aydınlatma metni gerektirir.
  author_name     TEXT NOT NULL DEFAULT 'İZ' CHECK (length(btrim(author_name)) BETWEEN 1 AND 80),

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Yayınlanmış bir yazının tarihi olmak ZORUNDA: sıralama, sitemap
  -- lastmod ve datePublished hep buna bakıyor. NULL olsa yazı listede
  -- sıralanamaz ve sessizce en sona düşerdi.
  CONSTRAINT blog_posts_published_needs_date
    CHECK (status <> 'published' OR published_at IS NOT NULL)
);

-- Public liste sorgusunun tam şekli: yayınlanmışları tarihe göre.
CREATE INDEX IF NOT EXISTS idx_blog_posts_published
  ON public.blog_posts (status, published_at DESC);

-- Kategori filtresi aynı sorgunun daraltılmışı.
CREATE INDEX IF NOT EXISTS idx_blog_posts_category
  ON public.blog_posts (category, published_at DESC);

-- Yönetim listesi güncellenme sırasına bakıyor (taslaklar dahil).
CREATE INDEX IF NOT EXISTS idx_blog_posts_updated
  ON public.blog_posts (updated_at DESC);

DROP TRIGGER IF EXISTS handle_updated_at ON public.blog_posts;
CREATE TRIGGER handle_updated_at
  BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- RLS AÇIK, POLİTİKA YOK: tüm erişim aşağıdaki fonksiyonlardan.
-- Politika yazmak, fonksiyonların sütun sayma güvencesini boşa
-- çıkarırdı (yukarıdaki "OKUMA DA RPC İLE" gerekçesi).
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.blog_posts FROM PUBLIC, anon, authenticated;

-- ============================================================
-- PUBLIC OKUMA — anon ve authenticated
--
-- Üçünün de ortak kuralı: status = 'published' VE published_at <= NOW().
-- Taslak hiçbir koşulda dışarı çıkmaz.
-- ============================================================

CREATE OR REPLACE FUNCTION public.blog_list_published(
  p_category TEXT DEFAULT NULL,
  p_limit    INTEGER DEFAULT 20,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  slug         TEXT,
  title        TEXT,
  excerpt      TEXT,
  category     TEXT,
  published_at TIMESTAMPTZ,
  total        BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
  SELECT b.slug, b.title, b.excerpt, b.category, b.published_at,
         COUNT(*) OVER ()
  FROM public.blog_posts b
  WHERE b.status = 'published'
    AND b.published_at <= NOW()
    AND (p_category IS NULL OR b.category = p_category)
  ORDER BY b.published_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.blog_get_published(p_slug TEXT)
RETURNS TABLE (
  slug            TEXT,
  title           TEXT,
  excerpt         TEXT,
  content         TEXT,
  category        TEXT,
  published_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  seo_title       TEXT,
  seo_description TEXT,
  author_name     TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
  SELECT b.slug, b.title, b.excerpt, b.content, b.category, b.published_at,
         b.updated_at, b.seo_title, b.seo_description, b.author_name
  FROM public.blog_posts b
  WHERE b.slug = p_slug
    AND b.status = 'published'
    AND b.published_at <= NOW();
END;
$fn$;

-- Sitemap: yalnız adres ve tarih. İçerik taşımıyor çünkü sitemap
-- üretimi her yazının gövdesini çekmek zorunda kalmamalı.
CREATE OR REPLACE FUNCTION public.blog_published_slugs()
RETURNS TABLE (slug TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  RETURN QUERY
  SELECT b.slug, b.updated_at
  FROM public.blog_posts b
  WHERE b.status = 'published'
    AND b.published_at <= NOW()
  ORDER BY b.published_at DESC
  LIMIT 5000;
END;
$fn$;

-- ============================================================
-- YÖNETİM — her biri is_platform_admin() denetler
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_list_blog_posts(
  p_status   TEXT DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit    INTEGER DEFAULT 100,
  p_offset   INTEGER DEFAULT 0
)
RETURNS TABLE (
  id           UUID,
  slug         TEXT,
  title        TEXT,
  category     TEXT,
  status       TEXT,
  published_at TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ,
  total        BIGINT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT b.id, b.slug, b.title, b.category, b.status, b.published_at,
         b.updated_at, COUNT(*) OVER ()
  FROM public.blog_posts b
  WHERE (p_status IS NULL OR b.status = p_status)
    AND (p_category IS NULL OR b.category = p_category)
  ORDER BY b.updated_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)
  OFFSET GREATEST(COALESCE(p_offset, 0), 0);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_get_blog_post(p_id UUID)
RETURNS TABLE (
  id              UUID,
  slug            TEXT,
  title           TEXT,
  excerpt         TEXT,
  content         TEXT,
  category        TEXT,
  status          TEXT,
  published_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ,
  seo_title       TEXT,
  seo_description TEXT,
  author_name     TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  RETURN QUERY
  SELECT b.id, b.slug, b.title, b.excerpt, b.content, b.category, b.status,
         b.published_at, b.updated_at, b.seo_title, b.seo_description, b.author_name
  FROM public.blog_posts b
  WHERE b.id = p_id;
END;
$fn$;

-- EKLE/GÜNCELLE — p_id NULL ise yeni yazı.
--
-- YÖNETİM KAYDINA YAZMAZ (dosya başındaki gerekçe). Yeni yazı her zaman
-- TASLAK doğar: yayın ayrı ve gerekçeli bir karar.
CREATE OR REPLACE FUNCTION public.admin_save_blog_post(
  p_id              UUID,
  p_slug            TEXT,
  p_title           TEXT,
  p_excerpt         TEXT,
  p_content         TEXT,
  p_category        TEXT,
  p_seo_title       TEXT DEFAULT NULL,
  p_seo_description TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id   UUID;
  v_slug TEXT := btrim(COALESCE(p_slug, ''));
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  -- Boş alanlar NULL'a iner: arayüz boş metin gönderiyor ve
  -- "" ile NULL'ı ayırmak CHECK kısıtını gereksizce zorlardı.
  IF v_slug = '' THEN
    RAISE EXCEPTION 'Yazının adresi boş olamaz.';
  END IF;

  -- Çakışmayı ÖNCE açık bir mesajla yakala. Aşağıdaki EXCEPTION bloğu
  -- yalnız yarış durumu için yedek; buradaki kontrol kullanıcıya hangi
  -- alanın sorunlu olduğunu söylüyor.
  IF EXISTS (
    SELECT 1 FROM public.blog_posts b
    WHERE b.slug = v_slug AND (p_id IS NULL OR b.id <> p_id)
  ) THEN
    RAISE EXCEPTION 'Bu adres zaten kullanılıyor. Başka bir adres yazın.';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.blog_posts (
      slug, title, excerpt, content, category, status,
      seo_title, seo_description
    )
    VALUES (
      v_slug,
      btrim(p_title),
      btrim(p_excerpt),
      p_content,
      p_category,
      'draft',
      NULLIF(btrim(COALESCE(p_seo_title, '')), ''),
      NULLIF(btrim(COALESCE(p_seo_description, '')), '')
    )
    RETURNING blog_posts.id INTO v_id;
  ELSE
    UPDATE public.blog_posts b
    SET slug            = v_slug,
        title           = btrim(p_title),
        excerpt         = btrim(p_excerpt),
        content         = p_content,
        category        = p_category,
        seo_title       = NULLIF(btrim(COALESCE(p_seo_title, '')), ''),
        seo_description = NULLIF(btrim(COALESCE(p_seo_description, '')), '')
    WHERE b.id = p_id
    RETURNING b.id INTO v_id;

    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Yazı bulunamadı.';
    END IF;
  END IF;

  RETURN jsonb_build_object('id', v_id, 'slug', v_slug);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Bu adres zaten kullanılıyor. Başka bir adres yazın.';
END;
$fn$;

-- YAYINLA / GERİ ÇEK — gerekçeli, yönetim kaydına yazılır.
CREATE OR REPLACE FUNCTION public.admin_set_blog_post_status(
  p_id     UUID,
  p_status TEXT,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_before public.blog_posts;
  v_after  public.blog_posts;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  IF p_status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'Geçersiz yayın durumu.';
  END IF;

  SELECT * INTO v_before FROM public.blog_posts WHERE id = p_id FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Yazı bulunamadı.';
  END IF;

  UPDATE public.blog_posts b
  SET status = p_status,
      -- İlk yayında tarih konur; sonraki yayınlarda KORUNUR.
      published_at = CASE
        WHEN p_status = 'published' AND b.published_at IS NULL THEN NOW()
        ELSE b.published_at
      END
  WHERE b.id = p_id
  RETURNING * INTO v_after;

  PERFORM public.record_admin_action(
    CASE WHEN p_status = 'published' THEN 'blog.publish' ELSE 'blog.unpublish' END,
    NULL,
    p_id,
    p_reason,
    jsonb_build_object('status', v_before.status, 'published_at', v_before.published_at),
    jsonb_build_object('status', v_after.status, 'published_at', v_after.published_at)
  );

  RETURN jsonb_build_object('id', p_id, 'status', v_after.status, 'slug', v_after.slug);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.admin_delete_blog_post(
  p_id     UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_before public.blog_posts;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT * INTO v_before FROM public.blog_posts WHERE id = p_id FOR UPDATE;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Yazı bulunamadı.';
  END IF;

  -- Kayıt SİLMEDEN ÖNCE yazılıyor: record_admin_action patlarsa
  -- (gerekçe kısa, yetki yok) silme de olmaz — tek transaction.
  PERFORM public.record_admin_action(
    'blog.delete',
    NULL,
    p_id,
    p_reason,
    jsonb_build_object(
      'slug', v_before.slug,
      'title', v_before.title,
      'category', v_before.category,
      'status', v_before.status
    ),
    '{}'::JSONB
  );

  DELETE FROM public.blog_posts WHERE id = p_id;

  RETURN jsonb_build_object('id', p_id, 'slug', v_before.slug);
END;
$fn$;

-- ============================================================
-- YETKİLER VE DOĞRULAMA
-- ============================================================

DO $yetki$
DECLARE
  v_fn TEXT;
BEGIN
  -- Public okuma: anon DA çağırabilmeli. Oturumsuz ziyaretçi blogu
  -- okuyan asıl kitle; 'authenticated' tek başına yetmez.
  FOREACH v_fn IN ARRAY ARRAY[
    'blog_list_published(text,integer,integer)',
    'blog_get_published(text)',
    'blog_published_slugs()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO anon, authenticated', v_fn);

    IF NOT has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '149 DOĞRULAMA: % anon tarafından çağrılamıyor.', v_fn;
    END IF;
    -- Public okuma fonksiyonu yayın filtresini TAŞIMAK ZORUNDA; yoksa
    -- taslaklar herkese açılır.
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%published%' THEN
      RAISE EXCEPTION '149 DOĞRULAMA: % yayın filtresi uygulamıyor.', v_fn;
    END IF;
  END LOOP;

  -- Yönetim: anon'a KAPALI, gövdesinde yönetici denetimi ŞART.
  FOREACH v_fn IN ARRAY ARRAY[
    'admin_list_blog_posts(text,text,integer,integer)',
    'admin_get_blog_post(uuid)',
    'admin_save_blog_post(uuid,text,text,text,text,text,text,text)',
    'admin_set_blog_post_status(uuid,text,text)',
    'admin_delete_blog_post(uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', v_fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated', v_fn);

    IF has_function_privilege('anon', ('public.' || v_fn)::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION '149 DOĞRULAMA: % anon''a açık.', v_fn;
    END IF;
    IF pg_get_functiondef(('public.' || v_fn)::regprocedure) NOT LIKE '%is_platform_admin()%' THEN
      RAISE EXCEPTION '149 DOĞRULAMA: % yönetici denetimi yapmıyor.', v_fn;
    END IF;
  END LOOP;

  -- TABLONUN KENDİSİ KAPALI OLMALI. Bu iddia dosyanın can alıcı yeri:
  -- buradan geçen bir değişiklik, yazı tablosunu herkese açmış olurdu.
  IF has_table_privilege('anon', 'public.blog_posts', 'SELECT')
     OR has_table_privilege('authenticated', 'public.blog_posts', 'SELECT')
     OR has_table_privilege('anon', 'public.blog_posts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.blog_posts', 'UPDATE') THEN
    RAISE EXCEPTION '149 DOĞRULAMA: blog_posts doğrudan erişilebilir.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid = 'public.blog_posts'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION '149 DOĞRULAMA: blog_posts üzerinde RLS kapalı.';
  END IF;

  RAISE NOTICE '149: blog tablosu, üç public okuma ve beş yönetim işlemi hazır.';
END;
$yetki$;

-- ROLLBACK (yönetim kaydı SİLİNMEZ — admin_actions salt eklenir):
--   DROP FUNCTION IF EXISTS public.admin_delete_blog_post(uuid,text);
--   DROP FUNCTION IF EXISTS public.admin_set_blog_post_status(uuid,text,text);
--   DROP FUNCTION IF EXISTS public.admin_save_blog_post(uuid,text,text,text,text,text,text,text);
--   DROP FUNCTION IF EXISTS public.admin_get_blog_post(uuid);
--   DROP FUNCTION IF EXISTS public.admin_list_blog_posts(text,text,integer,integer);
--   DROP FUNCTION IF EXISTS public.blog_published_slugs();
--   DROP FUNCTION IF EXISTS public.blog_get_published(text);
--   DROP FUNCTION IF EXISTS public.blog_list_published(text,integer,integer);
--   DROP TRIGGER IF EXISTS handle_updated_at ON public.blog_posts;
--   DROP TABLE IF EXISTS public.blog_posts;
