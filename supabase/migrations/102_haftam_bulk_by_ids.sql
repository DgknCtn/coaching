-- ============================================================
-- 102 — HAFTAM V2: KİMLİK LİSTESİYLE TOPLU İŞLEM (R8)
--
-- Haftam V2'nin iki maddesi, mevcut toplu yolların karşılayamadığı bir
-- şey istiyor: SERBEST BİR KALEM KÜMESİ üzerinde tek işlem.
--
--   §8  "Öğrenci bir günlük çalışma bloğunu tamamladığında TEK TİK atar."
--       Blok = ekrandaki kart = o güne ayrılmış kalemler. Mevcut
--       `submit_homework_items_bulk` parti+kitap kırılımıyla çalışıyor;
--       "Salı'ya ayrılan Test 2-4" gibi bir küme onunla ifade edilemez.
--
--   §7  Kart bölme: "Test 1-7" kartından yalnız 2, 3, 4 Salı'ya ayrılır.
--       Bu, N kalemin `planned_for_date`'ini tek seferde değiştirmek.
--
-- ============================================================
-- NEDEN DÖNGÜ DEĞİL TEK RPC
--
-- Sunucu eyleminde 200 kez tekil RPC çağırmak 200 ayrı işlem demek:
-- 140'ıncıda ağ koparsa kartın yarısı teslim olmuş, yarısı olmamış olur
-- ve öğrenci ekranda bunun neden böyle olduğunu anlayamaz. Tek çağrı:
-- ya hepsi ya hiçbiri.
--
-- ============================================================
-- KART BAĞIMSIZ BİR KAYIT DEĞİLDİR (§7 veri ilkesi)
--
-- Buradaki hiçbir fonksiyon yeni bir akademik kayıt ÜRETMEZ, eskisini
-- SİLMEZ. Kart yalnız mevcut tekil kalemlerin görsel gruplamasıdır;
-- bölmek de tiklemek de yalnız var olan satırların alanlarını değiştirir.
-- Bu yüzden çift sayım şemaca imkânsız.
--
-- ============================================================
-- YETKİ HER KALEM İÇİN AYRI AYRI DENETLENİR
--
-- Tek bir kalemin sahibi olmak, listedeki diğerlerinin sahibi olmayı
-- gerektirmez. Aşağıdaki fonksiyonlar listedeki HER kalemin öğrencisini
-- doğrular; biri bile yabancıysa işlemin tamamı reddedilir. "Yetkisiz
-- olanları atla" davranışı, öğrenciye sessizce eksik sonuç döndürürdü.
--
-- GERİ ALMA: dosya sonundaki ROLLBACK bloğu.
-- ============================================================

-- Tek seferde işlenebilecek kalem sayısı; yapıştırma/otomasyon kazasına
-- karşı. 100+ çalışmalık hafta belgenin kabul testi #1'inde var, o yüzden
-- sınır cömert.
-- (Sabit yok; her fonksiyonda 500 olarak yazılı.)

-- ============================================================
-- 1) Kalem listesini bir güne planlar (§7)
--
-- `set_homework_item_plan_date` (097) ile AYNI kural, çoğul hâli:
-- yalnız `planned_for_date` yazılır. Resmî son teslime
-- (`homework_batches.due_date`, `weekly_flows.due_at`) DOKUNULMAZ —
-- 077 kabul #3.
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_homework_items_plan_date(
  p_homework_item_ids UUID[],
  p_date DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total   INT;
  v_allowed INT;
  v_count   INT;
BEGIN
  IF p_homework_item_ids IS NULL OR array_length(p_homework_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'İşlenecek çalışma yok';
  END IF;

  v_total := array_length(p_homework_item_ids, 1);
  IF v_total > 500 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 500 çalışma işlenebilir';
  END IF;

  -- HER kalem bu öğrencinin mi? Sayılar tutmuyorsa listede yabancı
  -- (ya da silinmiş) bir kalem var demektir.
  SELECT COUNT(*) INTO v_allowed
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  WHERE hi.id = ANY(p_homework_item_ids)
    AND (
      public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
      OR public.is_student_self(hb.student_id)
    );

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.homework_items hi
  SET planned_for_date = p_date
  WHERE hi.id = ANY(p_homework_item_ids)
    AND hi.status <> 'cancelled';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('planned_count', v_count, 'date', p_date);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.set_homework_items_plan_date(UUID[], DATE) TO authenticated;

-- ============================================================
-- 2) Kalem listesini teslim eder (§8 — tek tik)
--
-- Gövde `submit_homework_items_bulk` (037) ile aynı alanları yazar;
-- değişen yalnız kalemlerin SEÇİLME biçimi.
--
-- `status = 'pending'` süzgeci korunuyor: zaten teslim edilmiş ya da
-- onaylanmış kalem ikinci kez teslim edilmez. Bu, tikin iki kez
-- basılmasını zararsız kılar.
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_homework_items_by_ids(
  p_homework_item_ids UUID[],
  p_studied_on DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id UUID;
  v_total      INT;
  v_allowed    INT;
  v_count      INT;
BEGIN
  v_profile_id := public.current_profile_id();

  IF p_homework_item_ids IS NULL OR array_length(p_homework_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'İşlenecek çalışma yok';
  END IF;

  v_total := array_length(p_homework_item_ids, 1);
  IF v_total > 500 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 500 çalışma işlenebilir';
  END IF;

  SELECT COUNT(*) INTO v_allowed
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  WHERE hi.id = ANY(p_homework_item_ids)
    AND (
      public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
      OR public.is_student_self(hb.student_id)
    );

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'pending_approval',
      submitted_at = NOW(),
      submitted_by_profile_id = v_profile_id,
      studied_on = COALESCE(p_studied_on, hi.studied_on),
      rejected_at = NULL,
      teacher_note = NULL
  WHERE hi.id = ANY(p_homework_item_ids)
    AND hi.status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('submitted_count', v_count);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.submit_homework_items_by_ids(UUID[], DATE) TO authenticated;

-- ============================================================
-- 3) Kalem listesinin teslimini geri alır (§10 — "Geri al")
--
-- KURAL DEĞİŞMİYOR (097 / R7-06.04): öğretmenin ONAYLADIĞI çalışma geri
-- alınamaz. Bu yüzden süzgeç yalnız `pending_approval`. Öğrenci yanlış
-- tikini geri alabilir; öğretmenin kapattığı işi açamaz.
--
-- `submitted_at` NULL'lanır: 081'in kuralı gereği ilerleme teslimden
-- sayılıyor, geri alınan iş sayılmamalı.
-- ============================================================
CREATE OR REPLACE FUNCTION public.revert_homework_items_by_ids(
  p_homework_item_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_total   INT;
  v_allowed INT;
  v_count   INT;
BEGIN
  IF p_homework_item_ids IS NULL OR array_length(p_homework_item_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'İşlenecek çalışma yok';
  END IF;

  v_total := array_length(p_homework_item_ids, 1);
  IF v_total > 500 THEN
    RAISE EXCEPTION 'Tek seferde en fazla 500 çalışma işlenebilir';
  END IF;

  SELECT COUNT(*) INTO v_allowed
  FROM public.homework_items hi
  JOIN public.homework_batches hb ON hb.id = hi.homework_batch_id
  WHERE hi.id = ANY(p_homework_item_ids)
    AND (
      public.has_workspace_role(hi.workspace_id, ARRAY['owner', 'teacher'])
      OR public.is_student_self(hb.student_id)
    );

  IF v_allowed <> v_total THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'pending',
      submitted_at = NULL,
      submitted_by_profile_id = NULL
  WHERE hi.id = ANY(p_homework_item_ids)
    AND hi.status = 'pending_approval';

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('reverted_count', v_count);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.revert_homework_items_by_ids(UUID[]) TO authenticated;

-- ============================================================
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.revert_homework_items_by_ids(UUID[]);
--   DROP FUNCTION IF EXISTS public.submit_homework_items_by_ids(UUID[], DATE);
--   DROP FUNCTION IF EXISTS public.set_homework_items_plan_date(UUID[], DATE);
-- ============================================================
