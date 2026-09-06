-- ============================================================
-- 073_workspaces_plan_licensed
--
-- SORUN: 058 lisans modelini getirdi ve `settle_billing_order` o günden
-- beri ödeme tamamlanınca `workspaces.plan = 'licensed'` yazıyor. Ama
-- `workspaces_plan_chk`, 052'de tanımlandığı hâliyle duruyordu:
--
--   CHECK (plan IN ('trial', 'starter', 'coach', 'institution'))
--
-- 'licensed' bu listede YOK. Yani başarılı BİR ödeme bile lisansı
-- açamıyordu; tahsilat işlemi kısıt ihlaliyle geri alınıyordu:
--
--   new row for relation "workspaces" violates check constraint
--   "workspaces_plan_chk"
--
-- NEDEN BUGÜNE KADAR GÖRÜLMEDİ: ödeme sağlayıcısı entegrasyonu
-- tamamlanmadığı için `settle_billing_order` üretimde hiç sonuna kadar
-- çalışmamıştı. Hata, ilk gerçek tahsilat denemesinde ortaya çıktı —
-- yani müşteri parasını ödedikten SONRA. Sessizce bekleyen bir tuzaktı.
--
-- 052'deki blok `IF NOT EXISTS (... conname = 'workspaces_plan_chk')`
-- ile korunuyor; o dosyayı düzeltip yeniden çalıştırmak kısıtı
-- güncellemezdi. Bu yüzden kısıt burada DÜŞÜRÜLÜP yeniden kuruluyor.
--
-- ESKİ DEĞERLER LİSTEDE KALIYOR: 'starter' ve 'coach' 058'de kaldırıldı
-- ama o tarihten önce açılmış satırlar hâlâ taşıyor olabilir. Onları
-- listeden çıkarmak, kısıtı eklerken mevcut veriyi reddederdi —
-- migration'ın kendisi patlardı.
-- ============================================================

ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_plan_chk;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_plan_chk
  CHECK (plan IN ('trial', 'licensed', 'institution', 'starter', 'coach'));


-- ============================================================
-- ROLLBACK
--
-- UYARI: geri alma, 'licensed' plandaki çalışma alanlarını kısıt
-- ihlaline sokar ve ALTER TABLE başarısız olur. Önce o satırların planı
-- taşınmalıdır. Zaten geri alınması gereken bir değişiklik değil:
-- kısıtın eski hâli ödeme akışını kırıyordu.
--
--   ALTER TABLE public.workspaces DROP CONSTRAINT IF EXISTS workspaces_plan_chk;
--   ALTER TABLE public.workspaces
--     ADD CONSTRAINT workspaces_plan_chk
--     CHECK (plan IN ('trial', 'starter', 'coach', 'institution'));
-- ============================================================
