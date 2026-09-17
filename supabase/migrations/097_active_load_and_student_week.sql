-- ============================================================
-- 097 — ACİL REVİZE PAKETİ 02 (R7 / Site Testi 06, 17.09.2026)
-- ============================================================
--
-- Dört maddenin veri katmanı tek dosyada, çünkü dördü de aynı cümlenin
-- parçası: "güncel hafta öğrencinin ana çalışma alanıdır".
--
--   R7-06.01  Aktif Yükten Çıkar          -> §1, §2
--   R7-06.03  Öğrencinin günlük dağıtımı  -> §3, §4
--   R7-06.04  Onay sonrası Geri Al yok    -> §5
--   R7-06.05  "Bu Hafta" yalnız aktif akış -> §6
--
-- PEDAGOJİK İLKE (belge, R7-06.01 notu): *"Güncel hafta öğrencinin ana
-- çalışma alanıdır; geçmiş borç öğrenciyi yıl boyu 'borçlu'
-- tutmamalı."* Bu dosyadaki her karar o cümleden çıkıyor.


-- ============================================================
-- 1) release_batch_from_active_load — "Aktif Yükten Çıkar"
-- ============================================================
--
-- NEDEN YENİ SÜTUN YOK: `homework_batches.status` 001'den beri
-- 'archived' değerini kabul ediyor ve bugüne kadar hiç yazılmadı;
-- `homework_items.status` da 'cancelled'ı kabul ediyor ve okuma tarafının
-- TAMAMI onu zaten süzüyor (014'ün görünümleri, 017, 027, 080, 081 ve
-- lib/homework-status.ts). Yani aktif borçtan düşme ile Kitap
-- Haritasında "Henüz verilmedi"ye dönüş, tek satır yazmadan gelen
-- davranış — deriveTestState 'cancelled' için zaten 'not_assigned'
-- döndürüyor. Yeni bir durum icat etmek, aynı anlamı taşıyan ikinci bir
-- sözlük kurmak olurdu.
--
-- SİLME DEĞİL (belge: *"Geçmiş kayıt silinmemeli; tarihçede 'Aktif
-- yükten çıkarıldı' durumuyla kalmalı."*): satırlar yerinde kalır,
-- yalnız durumları değişir. `test_completions`'a HİÇ dokunulmaz —
-- akademik kayıt, ödev yönetiminin kararıyla yok edilemez.
--
-- TAMAMLANMIŞ KALEM KORUNUR (kabul kriteri 4): 1/2'lik kısmi ödevde
-- onaylanan 1 çalışma 'completed' kalır, yalnız yapılmamış 1 serbestleşir.
-- Onay BEKLEYEN kalem ise serbestleşir: öğretmen o ödevi artık takip
-- etmeyeceğine karar verdi, kuyrukta asılı kalmamalı.
--
-- DİZİ PARAMETRESİ: tekil ve toplu işlem aynı RPC. İki ayrı fonksiyon,
-- yetki kontrolünü iki yere yazmak demekti.

CREATE OR REPLACE FUNCTION public.release_batch_from_active_load(
  p_batch_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_released INTEGER := 0;
BEGIN
  IF p_batch_ids IS NULL OR array_length(p_batch_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  -- YETKİ TEK TEK, TOPLU DEĞİL: dizi farklı çalışma alanlarından id
  -- taşıyabilir. Tek bir çalışma alanına bakıp hepsini geçirmek,
  -- yabancı bir ödevi listeye ekleyerek arşivlemeye izin verirdi.
  IF EXISTS (
    SELECT 1
    FROM public.homework_batches hb
    WHERE hb.id = ANY(p_batch_ids)
      AND NOT public.has_workspace_role(hb.workspace_id, ARRAY['owner', 'teacher'])
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  -- Yapılmamış ve onay bekleyen kalemler serbestleşir.
  -- 'completed' BİLİNÇLİ OLARAK DIŞARIDA — kısmi ödevin korunan yarısı.
  UPDATE public.homework_items hi
  SET status = 'cancelled', updated_at = NOW()
  WHERE hi.homework_batch_id = ANY(p_batch_ids)
    AND hi.status IN ('pending', 'pending_approval');

  -- IDEMPOTENT: zaten arşivlenmiş parti ikinci çağrıda sayıma girmez.
  UPDATE public.homework_batches hb
  SET status = 'archived', updated_at = NOW()
  WHERE hb.id = ANY(p_batch_ids)
    AND hb.status = 'active';

  GET DIAGNOSTICS v_released = ROW_COUNT;
  RETURN v_released;
END;
$fn$;


-- ============================================================
-- 2) restore_batch_to_active_load — "Yeniden Aktifleştir"
-- ============================================================
--
-- BELGENİN AÇIK ŞARTI: *"İleride 'Yeniden Aktifleştir' yapılırsa eski
-- teslim tarihi diriltilmemeli; aktif/gelecek Haftalık Akış seçilerek
-- yeni akışın son teslimini miras almalı."*
--
-- Eski `due_date` geri gelseydi ödev doğduğu anda "süresi geçmiş"
-- olurdu ve öğrenci aynı borcu ikinci kez yüklenmiş sayılırdı. Bu
-- yüzden hedef akış ZORUNLU bir parametre: tarihi olmayan bir yeniden
-- aktifleştirme yok.
--
-- 077 kabul #3 ("ikinci bağımsız deadline oluşturmamalı") korunuyor:
-- tarih uydurulmuyor, hedef akışın `due_at`'ı miras alınıyor.

CREATE OR REPLACE FUNCTION public.restore_batch_to_active_load(
  p_batch_id       UUID,
  p_weekly_flow_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_batch public.homework_batches%ROWTYPE;
  v_flow  public.weekly_flows%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM public.homework_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ödev bulunamadı.';
  END IF;

  IF NOT public.has_workspace_role(v_batch.workspace_id, ARRAY['owner', 'teacher']) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_batch.status <> 'archived' THEN
    -- Aktif bir ödevi "yeniden aktifleştirmek" bir şey yapmaz; hata da
    -- değildir (iki sekmeden aynı düğmeye basılabilir).
    RETURN;
  END IF;

  SELECT * INTO v_flow FROM public.weekly_flows WHERE id = p_weekly_flow_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Haftalık akış bulunamadı.';
  END IF;

  IF v_flow.student_id <> v_batch.student_id THEN
    RAISE EXCEPTION 'Seçilen haftalık akış bu öğrenciye ait değil.';
  END IF;

  IF v_flow.status <> 'active' THEN
    RAISE EXCEPTION 'Kapanmış bir haftalık akışa ödev taşınamaz.';
  END IF;

  -- Kalemler açılır. 'completed' olanlara dokunulmaz: arşivlemede
  -- korunan yarı, geri dönüşte de korunur.
  UPDATE public.homework_items hi
  SET status = 'pending', updated_at = NOW()
  WHERE hi.homework_batch_id = p_batch_id
    AND hi.status = 'cancelled';

  -- Son teslim HEDEF AKIŞTAN miras alınır; eski tarih diriltilmez.
  UPDATE public.homework_batches hb
  SET status         = 'active',
      weekly_flow_id = p_weekly_flow_id,
      due_date       = (v_flow.due_at AT TIME ZONE 'Europe/Istanbul')::DATE,
      updated_at     = NOW()
  WHERE hb.id = p_batch_id;
END;
$fn$;


-- ============================================================
-- 3) homework_items.planned_for_date — öğrencinin günlük dağıtımı
-- ============================================================
--
-- 077 bu sütunu BİLİNÇLİ OLARAK AÇMAMIŞTI ve gerekçesini yazmıştı:
-- *"Açılsaydı kimsenin yazmadığı ve bu yüzden yalan söyleyen bir sütun
-- olurdu."* Artık yazan taraf geliyor (R7-06.03, öğrenci "Haftam"
-- ekranı), bu yüzden sütun şimdi açılıyor.
--
-- NEDEN AYRI TABLO DEĞİL: dağıtım bir kaleme birebir bağlı. Ayrı tablo,
-- her okumaya bir JOIN ve "kalem var ama plan satırı yok" diye ikinci
-- bir boşluk hâli eklerdi. NULL bunu zaten söylüyor.
--
-- NULL = "PLANLANMADI" ve bu, belgenin şartını KENDİLİĞİNDEN karşılıyor:
-- *"Hafta ortasında yeni çalışma eklenirse mevcut dağılım bozulmamalı;
-- yalnız yeni işler 'planlanmadı' olarak beklemeli."* Sonradan
-- yayınlanan kalem NULL doğar; mevcut dağıtımı yeniden yazan bir kod
-- yolu YOK.
--
-- BU BİR DEADLINE DEĞİL: öğrencinin kendi planı. Resmi kapanış
-- `weekly_flows.due_at`, ödevin tarihi `homework_batches.due_date`.
-- 077 kabul #3 gereği bu sütun ikisinden hiçbirini etkilemez ve hiçbir
-- gecikme hesabına girmez (`isOverdue` yalnız due_date'e bakar).

ALTER TABLE public.homework_items
  ADD COLUMN IF NOT EXISTS planned_for_date DATE;

-- Haftam ekranı "bu kalemler hangi güne konmuş" diye soruyor; sorgu
-- kalem kümesi üzerinden gidiyor, bu yüzden kısmi indeks yeterli.
CREATE INDEX IF NOT EXISTS idx_homework_items_planned_for_date
  ON public.homework_items (homework_batch_id, planned_for_date)
  WHERE planned_for_date IS NOT NULL;


-- ============================================================
-- 4) set_homework_item_plan_date — dağıtımı öğrenci yazar
-- ============================================================
--
-- NEDEN RPC, NEDEN DOĞRUDAN UPDATE DEĞİL: RLS sütun düzeyinde
-- kısıtlanamaz. `homework_items` üzerinde öğrenciye UPDATE açmak,
-- `status`'ü de yazabilir hâle getirirdi — öğrenci kendi ödevini
-- 'completed' işaretleyebilirdi. Bu fonksiyon tek sütuna dokunur.
--
-- ÖĞRETMEN DE YAZABİLİR: öğrencinin planını birlikte kurmak koçluk
-- görüşmesinin doğal bir parçası. Yetki listesi bu yüzden öğrenciyi VE
-- öğretmeni kapsıyor.

CREATE OR REPLACE FUNCTION public.set_homework_item_plan_date(
  p_homework_item_id UUID,
  p_date             DATE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_item  public.homework_items%ROWTYPE;
  v_batch public.homework_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışma bulunamadı.';
  END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  IF NOT (
    public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher'])
    OR public.is_student_self(v_batch.student_id)
  ) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  -- Arşivlenmiş ya da iptal edilmiş çalışma planlanmaz: aktif yükte
  -- olmayan bir işi güne koymak, kaldırdığımız borcu geri getirirdi.
  IF v_batch.status <> 'active' OR v_item.status = 'cancelled' THEN
    RAISE EXCEPTION 'Bu çalışma artık aktif yükte değil.';
  END IF;

  -- p_date NULL ise plan kaldırılır ("planlanmadı"ya döner).
  UPDATE public.homework_items hi
  SET planned_for_date = p_date, updated_at = NOW()
  WHERE hi.id = p_homework_item_id;
END;
$fn$;


-- ============================================================
-- 5) revert_homework_item_completion — öğrenci onaylanmışı geri alamaz
-- ============================================================
--
-- R7-06.04. 014'teki tanım `('completed', 'pending_approval')` ikisini
-- de geri alıyor ve yetki kontrolü öğrenciyi de geçiriyordu. Testte
-- görülen sonuç: öğretmen onayladıktan sonra öğrenci satırında hâlâ
-- "Geri Al" duruyor ve çalışan bir kapı.
--
-- BELGENİN AYRIMI: *"Onay beklerken öğrenci yanlış gönderimi geri
-- çekebilir. Öğretmen onayladıktan sonra çalışma nihai 'Tamamlandı'
-- durumuna geçmeli ve öğrenci aksiyonu kapanmalı. ... yeniden
-- açma/tamamlanmayı geri alma yetkisi yalnız öğretmen tarafında
-- bulunmalı."*
--
-- KURAL BURADA, ARAYÜZDE DEĞİL: düğmeyi gizleyip RPC'yi açık bırakmak,
-- kilidi kapıya değil kapı resmine takmak olurdu. Arayüz de düzeltiliyor
-- (student/homework-list.tsx) ama tek savunma katmanı o değil.
--
-- CREATE OR REPLACE yeterli: dönüş tipi (JSONB) ve imza DEĞİŞMİYOR.

CREATE OR REPLACE FUNCTION public.revert_homework_item_completion(
  p_homework_item_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_profile_id  UUID;
  v_item        public.homework_items%ROWTYPE;
  v_batch       public.homework_batches%ROWTYPE;
  v_is_teacher  BOOLEAN;
BEGIN
  v_profile_id := public.current_profile_id();

  SELECT * INTO v_item FROM public.homework_items WHERE id = p_homework_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Çalışma bulunamadı.';
  END IF;

  SELECT * INTO v_batch FROM public.homework_batches WHERE id = v_item.homework_batch_id;

  v_is_teacher := public.has_workspace_role(v_item.workspace_id, ARRAY['owner', 'teacher']);

  IF NOT (v_is_teacher OR public.is_student_self(v_batch.student_id)) THEN
    RAISE EXCEPTION 'Bu işlem için yetkiniz yok.';
  END IF;

  IF v_item.status NOT IN ('completed', 'pending_approval') THEN
    RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'nothing_to_revert', true);
  END IF;

  -- YENİ KURAL (R7-06.04): onaylanmış çalışmayı yalnız öğretmen açar.
  IF v_item.status = 'completed' AND NOT v_is_teacher THEN
    RAISE EXCEPTION 'Öğretmenin onayladığı çalışma geri alınamaz.';
  END IF;

  UPDATE public.homework_items hi
  SET status = 'pending', completed_at = NULL, completed_by_profile_id = NULL,
      submitted_at = NULL, submitted_by_profile_id = NULL,
      approved_at = NULL, approved_by_profile_id = NULL
  WHERE hi.id = p_homework_item_id;

  -- Yalnız 'completed' bir kalemin aktif test_completions kaydı olabilir.
  UPDATE public.test_completions tc
  SET status = 'reverted', reverted_at = NOW(), reverted_by_profile_id = v_profile_id
  WHERE tc.student_book_assignment_id = v_item.student_book_assignment_id
    AND tc.book_test_id = v_item.book_test_id
    AND tc.status = 'active';

  RETURN jsonb_build_object('homework_item_id', p_homework_item_id, 'reverted', true);
END;
$fn$;


-- ============================================================
-- 6) student_active_flow_load_view — akış kapsamlı onay ve plan sayısı
-- ============================================================
--
-- R7-06.05. "Bu Hafta" kartı aktif haftada 1 çalışma onay beklerken
-- "2 çalışma onay bekliyor" gösterdi; ikinci kayıt kapanmış bir
-- haftadandı.
--
-- KÖK NEDEN 017'DE VE O KARAR DOĞRUYDU: `student_pending_approval_view`
-- BİLİNÇLİ olarak hafta-bağımsız yapıldı, çünkü Dashboard kartı ile
-- /teacher/tasks listesi farklı sayı gösteriyordu. Hata o görünümde
-- değil, 080'in onu "Bu Hafta" başlığı altında kullanmasında. Bir
-- haftanın özeti, haftadan bağımsız bir sayacı gösteremez.
--
-- ÇÖZÜM: global sayaç KALIYOR (Görevler ekranı onu kullanmaya devam
-- eder — belge de öyle diyor: *"Eski haftadan kalan onay kuyruğu global
-- Görevler ekranında görünmeye devam edebilir"*), yanına akış kapsamlı
-- ikinci bir sayaç geliyor.
--
-- weekly_planned_units DE BURADA (R7-06.03): "dağıtıldı/bekliyor"
-- cümlesi şu an `total - lateAddedUnits` ile TAHMİN ediliyordu
-- (haftalik-akis/page.tsx). Artık gerçek sayı var.

DROP VIEW IF EXISTS public.student_active_flow_load_view CASCADE;

CREATE VIEW public.student_active_flow_load_view
WITH (security_invoker = true) AS
SELECT
  f.workspace_id,
  f.student_id,
  f.id                                            AS weekly_flow_id,
  f.starts_at                                     AS flow_started_at,
  f.due_at                                        AS flow_due_at,
  COUNT(DISTINCT hi.id)                           AS weekly_total,
  COUNT(DISTINCT hi.id) FILTER (
    WHERE hi.status IN ('pending_approval', 'completed')
  )                                               AS weekly_submitted,
  -- AKIŞ KAPSAMLI onay kuyruğu (R7-06.05).
  COUNT(DISTINCT hi.id) FILTER (
    WHERE hi.status = 'pending_approval'
  )                                               AS weekly_pending_approval,
  -- Öğrencinin güne yerleştirdiği çalışma sayısı (R7-06.03).
  COUNT(DISTINCT hi.id) FILTER (
    WHERE hi.planned_for_date IS NOT NULL
  )                                               AS weekly_planned_units,
  MIN(hb.created_at)                              AS first_published_at
FROM public.weekly_flows f
LEFT JOIN public.homework_batches hb
       ON hb.weekly_flow_id = f.id AND hb.status = 'active'
LEFT JOIN public.homework_items hi
       ON hi.homework_batch_id = hb.id AND hi.status <> 'cancelled'
WHERE f.status = 'active'
GROUP BY f.workspace_id, f.student_id, f.id, f.starts_at, f.due_at;


-- ============================================================
-- 7) teacher_student_operation_view — kartın okuduğu alan
-- ============================================================
--
-- 080'in tanımı birebir korunuyor; eklenen YALNIZ iki sütun ve ikisi de
-- SONA yazılıyor (017'deki 42P16 notu: CREATE OR REPLACE kolon sırasını
-- değiştiremez — burada DROP+CREATE var ama sırayı korumak yine de
-- doğru, `SELECT *` okuyan her yer aynı düzeni görür).

DROP VIEW IF EXISTS public.teacher_student_operation_view CASCADE;

CREATE VIEW public.teacher_student_operation_view
WITH (security_invoker = true) AS
SELECT
  s.workspace_id,
  s.id                                            AS student_id,
  s.full_name                                     AS student_full_name,
  s.exam_type,
  s.grade_level,

  -- Haftalık yük ve teslim
  l.weekly_flow_id,
  l.flow_started_at,
  l.flow_due_at,
  l.first_published_at,
  COALESCE(l.weekly_total, 0)                     AS weekly_total,
  COALESCE(l.weekly_submitted, 0)                 AS weekly_submitted,
  CASE
    WHEN COALESCE(l.weekly_total, 0) = 0 THEN 0
    ELSE ROUND(l.weekly_submitted::NUMERIC / l.weekly_total::NUMERIC * 100)
  END                                             AS weekly_submitted_percent,

  -- Öğretmenin kontrolünü bekleyen — GLOBAL (Görevler ekranı bunu okur)
  COALESCE(a.pending_approval_items, 0)           AS approval_pending_count,

  -- Teslim tarihi geçmiş, tamamlanmamış benzersiz çalışma
  COALESCE(o.overdue_items, 0)                    AS overdue_work_count,

  -- Durum bildirimi
  c.last_check_in_at,
  c.pending_check_in_since                        AS status_update_due_at,

  -- Yalnız SİNYAL — içerik değil.
  (n.important_count > 0)                         AS has_important_note,
  COALESCE(n.note_count, 0)                       AS note_count,

  -- Sıradaki temas
  x.next_contact_at,
  x.next_contact_kind,
  x.next_contact_participation,
  x.submission_cutoff_at,

  -- 097 · AKIŞ KAPSAMLI ALANLAR — "Bu Hafta" kartı bunları okur.
  COALESCE(l.weekly_pending_approval, 0)          AS weekly_pending_approval,
  COALESCE(l.weekly_planned_units, 0)             AS weekly_planned_units

FROM public.students s
LEFT JOIN public.student_active_flow_load_view l
       ON l.student_id = s.id AND l.workspace_id = s.workspace_id
LEFT JOIN public.student_pending_approval_view a
       ON a.student_id = s.id AND a.workspace_id = s.workspace_id
LEFT JOIN public.student_overdue_homework_view o
       ON o.student_id = s.id AND o.workspace_id = s.workspace_id
LEFT JOIN public.student_check_in_status_view c
       ON c.student_id = s.id AND c.workspace_id = s.workspace_id
LEFT JOIN public.student_next_contact_view x
       ON x.student_id = s.id AND x.workspace_id = s.workspace_id
LEFT JOIN (
  SELECT
    workspace_id,
    student_id,
    COUNT(*)                                AS note_count,
    COUNT(*) FILTER (WHERE pinned)          AS important_count
  FROM public.academic_notes
  GROUP BY workspace_id, student_id
) n ON n.student_id = s.id AND n.workspace_id = s.workspace_id
WHERE s.status = 'active';


-- ============================================================
-- 8) Yetkiler
-- ============================================================
-- DROP ... CASCADE yetkileri de düşürdü; 080'deki hâli birebir geri
-- yazılıyor.

REVOKE ALL ON public.student_active_flow_load_view FROM anon;
REVOKE ALL ON public.teacher_student_operation_view FROM anon;

GRANT SELECT ON public.student_active_flow_load_view TO authenticated;
GRANT SELECT ON public.teacher_student_operation_view TO authenticated;

GRANT EXECUTE ON FUNCTION public.release_batch_from_active_load(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_batch_to_active_load(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_homework_item_plan_date(UUID, DATE) TO authenticated;
