-- ============================================================
-- 115 — my_workspace_ids: plpgsql ve gerçekçi satır tahmini
--
-- ============================================================
-- ÖLÇÜM (114 sonrası, B öğretmeni, RLS dahil — baseline.md)
--
--   Execution 70 ms · Planning 20 ms
--
-- Planda `my_workspace_ids` ~20 ayrı yerde görünüyor (her politika
-- kullanımı ayrı bir hashed SubPlan). Her biri:
--
--   ProjectSet (rows=1000) (actual time=1.3..1.9 rows=3 loops=1)
--     Buffers: shared hit=44
--
-- Yani 3 satırlık bir sonuç için çağrı başına ~1,5 ms; toplam ~30 ms.
--
-- İKİ NEDEN
--
-- 1. SQL dilinde ve SECURITY DEFINER. Böyle bir fonksiyon çağıran
--    sorguya GÖMÜLEMEZ; her çağrı yerinde gövdesi o sorgu için yeniden
--    hazırlanır. Gövdede de gömülemeyen iki fonksiyon var
--    (current_profile_id, workspace_access_ok) ve onlar da her
--    seferinde ayrıca hazırlanır. plpgsql ise hazırladığı planları
--    OTURUM boyunca saklar; PostgREST bağlantıları kalıcı olduğu için
--    ilk istekten sonra hazırlık yükü kalkar.
--
-- 2. `rows=1000`: SETOF fonksiyonun varsayılan tahmini. Gerçekte bir
--    öğretmen 1-3 alanın üyesi. Yanlış tahmin, bu kümeyle kurulan
--    birleşimlerin planını bozuyor. `ROWS 3` verildi.
--
-- ============================================================
-- ANLAM DEĞİŞMİYOR
--
-- Gövde 107'deki sorgunun AYNISI; tek fark profil kimliğinin bir kez
-- bir değişkene okunması (current_profile_id STABLE olduğu için sorgu
-- içinde de tek değer döner — davranış aynı). workspace_access_ok
-- çağrısı korunuyor: erişim kuralı tek kaynakta kalsın (107'nin notu).
--
-- ADIM 2 bunu kanıtlıyor: eski tanım geçici bir kopya olarak kurulup
-- yenisiyle HER GERÇEK KULLANICI için (profiles.auth_user_id) ve
-- politikalarda geçen ÜÇ ROL KÜMESİNİN her biri için karşılaştırılıyor.
-- Tek fark varsa migration duruyor.
-- ============================================================


-- ------------------------------------------------------------
-- ADIM 1 — Eski tanımın geçici kopyası (karşılaştırma için)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_workspace_ids_115_eski(p_roles TEXT[])
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.profile_id = public.current_profile_id()
    AND wm.role       = ANY(p_roles)
    AND wm.status     = 'active'
    AND w.status      = 'active'
    AND public.workspace_access_ok(w.id);
$$;

CREATE OR REPLACE FUNCTION public.my_workspace_ids_115_yeni(p_roles TEXT[])
RETURNS SETOF UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
ROWS 3
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.profile_id = v_profile_id
    AND wm.role       = ANY(p_roles)
    AND wm.status     = 'active'
    AND w.status      = 'active'
    AND public.workspace_access_ok(w.id);
END;
$$;


-- ------------------------------------------------------------
-- ADIM 2 — Her kullanıcı ve her rol kümesi için eşdeğerlik
-- ------------------------------------------------------------
DO $dogrula$
DECLARE
  v_kullanici  RECORD;
  v_roller     TEXT[];
  v_eski       UUID[];
  v_yeni       UUID[];
  v_denenen    INT := 0;
  v_bos_olmayan INT := 0;
BEGIN
  FOR v_kullanici IN
    SELECT auth_user_id FROM public.profiles WHERE auth_user_id IS NOT NULL
  LOOP
    -- auth.uid() bu ayardan okur; yalnız bu işlem için (true = local).
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', v_kullanici.auth_user_id, 'role', 'authenticated')::text,
      true
    );

    FOREACH v_roller SLICE 1 IN ARRAY ARRAY[
      ARRAY['owner', 'teacher', 'assistant'],
      ARRAY['owner', 'teacher', ''],
      ARRAY['owner', '', '']
    ] LOOP
      -- Boş dizgeler yalnız 2B dizinin kare olması için; hiçbir rol ''
      -- olmadığından sonucu değiştirmez. Yine de temizleniyor.
      v_roller := array_remove(v_roller, '');

      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_eski
      FROM public.my_workspace_ids_115_eski(v_roller) x;
      SELECT coalesce(array_agg(x ORDER BY x), '{}') INTO v_yeni
      FROM public.my_workspace_ids_115_yeni(v_roller) x;

      IF v_eski IS DISTINCT FROM v_yeni THEN
        RAISE EXCEPTION
          '115 DOĞRULAMA: kullanıcı % için % rollerinde sonuç farklı (eski %, yeni %). Geçiş YAPILMADI.',
          v_kullanici.auth_user_id, v_roller, v_eski, v_yeni;
      END IF;

      v_denenen := v_denenen + 1;
      IF cardinality(v_eski) > 0 THEN
        v_bos_olmayan := v_bos_olmayan + 1;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM set_config('request.jwt.claims', '', true);

  -- Hepsi boş çıktıysa karşılaştırma hiçbir şey kanıtlamaz (ör. auth.uid()
  -- ayarı okumuyorsa iki taraf da boş döner ve "eşit" görünür).
  IF v_bos_olmayan = 0 THEN
    RAISE EXCEPTION '115 DOĞRULAMA: hiçbir kullanıcıda boş olmayan sonuç yok, karşılaştırma anlamsız. Geçiş YAPILMADI.';
  END IF;

  RAISE NOTICE '115: % karşılaştırmada birebir eşdeğer (% tanesi boş olmayan sonuç).', v_denenen, v_bos_olmayan;
END;
$dogrula$;


-- ------------------------------------------------------------
-- ADIM 3 — Geçiş
--
-- CREATE OR REPLACE: politikalar fonksiyona bağlı olduğu için DROP
-- edilemez; imza ve dönüş tipi aynı kaldığı sürece dil ve gövde
-- değiştirilebilir. EXECUTE yetkileri (108: anon dahil) korunur.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.my_workspace_ids(p_roles TEXT[])
RETURNS SETOF UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
ROWS 3
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id UUID := public.current_profile_id();
BEGIN
  IF v_profile_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT wm.workspace_id
  FROM public.workspace_members wm
  JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE wm.profile_id = v_profile_id
    AND wm.role       = ANY(p_roles)
    AND wm.status     = 'active'
    AND w.status      = 'active'
    -- 092'de düşen koşul. has_workspace_role ile tek kaynağa bağlanır.
    AND public.workspace_access_ok(w.id);
END;
$$;

DROP FUNCTION IF EXISTS public.my_workspace_ids_115_eski(TEXT[]);
DROP FUNCTION IF EXISTS public.my_workspace_ids_115_yeni(TEXT[]);


-- ------------------------------------------------------------
-- ADIM 4 — Geçişin doğrulanması
-- ------------------------------------------------------------
DO $son$
DECLARE
  v_fn OID := 'public.my_workspace_ids(text[])'::regprocedure;
BEGIN
  IF (SELECT l.lanname FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = v_fn) <> 'plpgsql' THEN
    RAISE EXCEPTION '115 DOĞRULAMA: fonksiyon hâlâ eski dilde.';
  END IF;

  IF NOT (SELECT prosecdef FROM pg_proc WHERE oid = v_fn) THEN
    RAISE EXCEPTION '115 DOĞRULAMA: SECURITY DEFINER kayboldu — politikalar workspace_members''ı okuyamaz.';
  END IF;

  IF NOT has_function_privilege('anon', v_fn, 'EXECUTE')
     OR NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
    RAISE EXCEPTION '115 DOĞRULAMA: EXECUTE yetkisi kayboldu (108 gereği anon ve authenticated çağırabilmeli).';
  END IF;

  RAISE NOTICE '115: geçiş tamam — plpgsql, SECURITY DEFINER, ROWS 3, yetkiler yerinde.';
END;
$son$;

-- ============================================================
-- ROLLBACK
--
-- 107'deki `CREATE OR REPLACE FUNCTION public.my_workspace_ids` bloğu
-- aynen çalıştırılır (LANGUAGE sql). ROWS belirtilmezse varsayılana
-- (1000) döner.
-- ============================================================
