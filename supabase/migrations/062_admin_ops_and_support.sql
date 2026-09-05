-- ============================================================
-- 062 — YÖNETİM PANELİ OPERASYONEL VERİSİ + DESTEK KATEGORİLERİ
--
-- SORUN: yönetim paneli "sistemde ne var" diyordu, "ne oluyor ve ne
-- yapmam gerekiyor" demiyordu. Tablo bir veritabanı sayımıydı: hangi
-- müşterinin ürünü gerçekten kullandığı, kimin ödemesi yarıda kaldığı,
-- hangi denemenin bitmek üzere olduğu görünmüyordu.
--
-- Bu migration üç iş yapıyor:
--   1. Destek kategorileri dörtten dokuza çıkar.
--   2. admin_list_workspaces'e son aktivite, plan süresi ve bekleyen
--      ödeme alanları eklenir.
--   3. admin_workspace_detail eklenir — tek müşterinin 360° görünümü.
--
-- ÖĞRENCİ VERİSİ YOK: 060'ın koyduğu sınır burada da geçerli. Koçun
-- kaç öğrencisi olduğu bir faturalama bilgisidir; öğrencinin KİM olduğu
-- platform yöneticisini ilgilendirmez. Aşağıdaki hiçbir fonksiyon
-- öğrenci adı, ödev içeriği ya da mesaj gövdesi döndürmez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) DESTEK KATEGORİLERİ
--
-- Dört kategori (genel/teknik/odeme/oneri) öğretmenin gerçekte
-- ayırdığı alanları karşılamıyordu; "öğrenci ekleyemiyorum" ile
-- "rapor yanlış" aynı kovaya düşüyordu.
--
-- GERİYE DÖNÜK UYUMLU: eski dört değer kümede duruyor, veri taşıma
-- gerekmiyor. Kısıt önce DÜŞÜRÜLÜYOR — aksi hâlde ikinci çalıştırmada
-- "already exists" verir.
-- ------------------------------------------------------------
ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_category_check;

ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_category_check
  CHECK (category IN (
    'genel', 'hesap', 'ogrenci', 'odev', 'kitap', 'rapor',
    'teknik', 'odeme', 'oneri'
  ));

COMMENT ON COLUMN public.support_tickets.category IS
  'Talep kategorisi. Turkce etiketler lib/support.ts icinde; ikisi birlikte guncellenmeli.';

-- ------------------------------------------------------------
-- 2) admin_list_workspaces — genişletilmiş
--
-- DÖNÜŞ TİPİ DEĞİŞTİĞİ İÇİN ÖNCE DROP: CREATE OR REPLACE bir
-- fonksiyonun RETURNS TABLE şeklini değiştiremez. Bu ders 058'de
-- get_workspace_access_state ile bir kez öğrenildi.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_workspaces(TEXT, INTEGER);

CREATE FUNCTION public.admin_list_workspaces(
  p_search TEXT DEFAULT NULL,
  p_limit  INTEGER DEFAULT 100
)
RETURNS TABLE (
  workspace_id     UUID,
  workspace_name   TEXT,
  owner_name       TEXT,
  owner_email      TEXT,
  created_at       TIMESTAMPTZ,
  plan             TEXT,
  status           TEXT,
  active_students  INTEGER,
  student_limit    INTEGER,
  trial_ends_at    TIMESTAMPTZ,
  license_ends_at  TIMESTAMPTZ,
  total_paid_kurus BIGINT,
  partner_code     TEXT,
  -- 062 ile eklenenler:
  license_student_count INTEGER,
  license_months        INTEGER,
  last_activity_at      TIMESTAMPTZ,
  pending_order_kurus   BIGINT
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
    w.id,
    w.name,
    p.full_name,
    p.email,
    w.created_at,
    w.plan,
    w.status,
    (SELECT COUNT(*)::INTEGER FROM public.students s
      WHERE s.workspace_id = w.id AND s.status = 'active'),
    w.student_limit,
    w.trial_ends_at,
    l.ends_at,
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'paid'), 0)::BIGINT,
    pt.code,
    l.student_count,
    -- SÜRE, TEK SİPARİŞTEN DEĞİL LİSANSIN KENDİSİNDEN hesaplanıyor.
    -- settle_billing_order alımları üst üste bindiriyor (058); son
    -- siparişin "months" değeri toplam süreyi göstermez. Takvim farkı
    -- yığılmış lisansta da doğru kalır.
    (CASE WHEN l.starts_at IS NULL THEN NULL ELSE
      (EXTRACT(YEAR FROM age(l.ends_at, l.starts_at)) * 12
       + EXTRACT(MONTH FROM age(l.ends_at, l.starts_at)))::INTEGER
    END),
    -- SON AKTİVİTE: audit_events; öğrenci/kitap/ödev/davet/görev/
    -- faturalama akışlarının hepsinden yazılıyor ve zaman damgası
    -- taşıyor. usage_counters yalnız GÜN tutuyor (054), "5 dk önce"
    -- diyemez.
    (SELECT MAX(a.created_at) FROM public.audit_events a
      WHERE a.workspace_id = w.id),
    COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
      WHERE o.workspace_id = w.id AND o.status = 'pending'), 0)::BIGINT
  FROM public.workspaces w
  LEFT JOIN public.profiles p ON p.id = w.owner_profile_id
  LEFT JOIN public.partners pt ON pt.id = w.referred_by_partner_id
  LEFT JOIN public.workspace_licenses l
    ON l.workspace_id = w.id AND l.status = 'active'
  WHERE p_search IS NULL
     OR w.name ILIKE '%' || p_search || '%'
     OR p.full_name ILIKE '%' || p_search || '%'
     OR p.email ILIKE '%' || p_search || '%'
  ORDER BY w.created_at DESC
  LIMIT LEAST(COALESCE(p_limit, 100), 500);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_list_workspaces(TEXT, INTEGER) TO authenticated;

-- ------------------------------------------------------------
-- 3) admin_workspace_detail — müşteri 360°
--
-- Tablodaki satır tıklanabilir olunca açılan ekranın tek kaynağı.
-- Tek JSONB dönüyor: dört ayrı RPC yerine tek gidiş-dönüş, çünkü
-- ekranın hepsine aynı anda ihtiyacı var.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_workspace_detail(p_workspace_id UUID)
RETURNS JSONB
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'Permission denied';
  END IF;

  SELECT jsonb_build_object(
    'workspace', jsonb_build_object(
      'id', w.id,
      'name', w.name,
      'type', w.type,
      'status', w.status,
      'plan', w.plan,
      'created_at', w.created_at,
      'trial_ends_at', w.trial_ends_at,
      'student_limit', w.student_limit,
      'active_students', (SELECT COUNT(*)::INTEGER FROM public.students s
        WHERE s.workspace_id = w.id AND s.status = 'active'),
      'last_activity_at', (SELECT MAX(a.created_at) FROM public.audit_events a
        WHERE a.workspace_id = w.id)
    ),
    'owner', jsonb_build_object(
      'name', p.full_name,
      'email', p.email
    ),
    'license', (
      SELECT jsonb_build_object(
        'student_count', l.student_count,
        'starts_at', l.starts_at,
        'ends_at', l.ends_at,
        'status', l.status
      )
      FROM public.workspace_licenses l
      WHERE l.workspace_id = w.id AND l.status = 'active'
    ),
    'partner', (
      SELECT jsonb_build_object('code', pt.code, 'name', pt.name)
      FROM public.partners pt WHERE pt.id = w.referred_by_partner_id
    ),
    'totals', jsonb_build_object(
      'paid_kurus', COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
        WHERE o.workspace_id = w.id AND o.status = 'paid'), 0),
      'pending_kurus', COALESCE((SELECT SUM(o.gross_kurus) FROM public.billing_orders o
        WHERE o.workspace_id = w.id AND o.status = 'pending'), 0),
      'open_tickets', (SELECT COUNT(*)::INTEGER FROM public.support_tickets t
        WHERE t.workspace_id = w.id AND t.status <> 'closed')
    ),
    'orders', COALESCE((
      SELECT jsonb_agg(sub.o_row)
      FROM (
        SELECT jsonb_build_object(
          'id', o.id,
          'student_count', o.student_count,
          'months', o.months,
          'gross_kurus', o.gross_kurus,
          'status', o.status,
          'created_at', o.created_at,
          'paid_at', o.paid_at
        ) AS o_row
        FROM public.billing_orders o
        WHERE o.workspace_id = w.id
        ORDER BY o.created_at DESC
        LIMIT 20
      ) sub
    ), '[]'::JSONB)
  )
  INTO v_result
  FROM public.workspaces w
  LEFT JOIN public.profiles p ON p.id = w.owner_profile_id
  WHERE w.id = p_workspace_id;

  IF v_result IS NULL THEN
    RAISE EXCEPTION 'Calisma alani bulunamadi';
  END IF;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.admin_workspace_detail(UUID) TO authenticated;

-- ============================================================
-- GERİ ALMA (elle):
--   ALTER TABLE public.support_tickets
--     DROP CONSTRAINT IF EXISTS support_tickets_category_check;
--   ALTER TABLE public.support_tickets
--     ADD CONSTRAINT support_tickets_category_check
--     CHECK (category IN ('genel','teknik','odeme','oneri'));
--   DROP FUNCTION IF EXISTS public.admin_workspace_detail(UUID);
--   -- admin_list_workspaces 060'daki hâline döndürülmeli.
-- ============================================================
