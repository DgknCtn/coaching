-- ============================================================
-- PERF-02 — İSTATİSTİKLERİ SIFIRLA VE YENİDEN ÖLÇ
--
-- Bu dosya bir migration DEĞİLDİR ve migration dizininde durmaz:
-- şemayı değiştirmiyor, yalnız sayaçları sıfırlıyor. Supabase SQL
-- düzenleyicisinden ELLE çalıştırılır.
--
-- ============================================================
-- NEDEN GEREKİYOR
--
-- Dış denetim yüksek tarama sayıları raporladı:
--   workspaces 191.697 sıralı tarama, profiles 24,6 milyon indeks taraması
--
-- Ama ölçülen pencere 62 GÜNLÜK ve 091/092 RLS optimizasyonundan
-- ÖNCESİNİ de kapsıyor. 092 kendi başlığında ölçmüştü: profiles
-- taramaları %41 düştü, /teacher 3.298 ms -> 1.115 ms.
--
-- Yani denetimin gördüğü rakamlar bugünkü performansı göstermiyor.
-- Denetimin kendi uyarısı da bu yönde:
--   "Cumulative PostgreSQL statistics may predate the current test session."
--
-- PERF-01 (70 FK indeksi) kararı buna bağlı: bayat sayıya bakarak
-- indeks eklemek, olmayan bir sorunu çözmek olur.
--
-- ============================================================
-- SIRA ÖNEMLİ
--
--   1. ADIM 1'i çalıştır (sıfırlama)
--   2. TEMSİLÎ BİR KULLANIM PENCERESİ geçir — birkaç gün gerçek
--      kullanım. Sıfırlamadan hemen sonra ölçmek hiçbir şey söylemez.
--   3. ADIM 2 ve 3'ü çalıştır, çıktıyı baseline.md'ye ekle.
-- ============================================================


-- ============================================================
-- ADIM 1 — SIFIRLA
--
-- Yalnız sayaçları sıfırlar; veriye, şemaya, plana dokunmaz.
-- Geri alınamaz: sıfırlanan geçmiş geri gelmez. Zaten amaç bu —
-- 62 günlük karışık pencereden kurtulmak.
-- ============================================================

SELECT pg_stat_reset();

-- Sıfırlandığını doğrula: pencere sıfıra yakın olmalı.
SELECT stats_reset, now() - stats_reset AS pencere
FROM pg_stat_database
WHERE datname = current_database();


-- ============================================================
-- ADIM 2 — TABLO TARAMALARI (temsilî pencereden SONRA)
--
-- Beklenen: 092 sonrası profiles / workspace_members sayıları,
-- denetimdeki milyonluk mertebeden çok daha düşük olmalı.
-- ============================================================

SELECT
  relname                        AS tablo,
  n_live_tup                     AS satir,
  seq_scan                       AS sirali_tarama,
  idx_scan                       AS indeks_taramasi,
  CASE
    WHEN seq_scan + COALESCE(idx_scan, 0) = 0 THEN NULL
    ELSE round(100.0 * seq_scan / (seq_scan + COALESCE(idx_scan, 0)), 1)
  END                            AS sirali_yuzde
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY seq_scan DESC
LIMIT 25;


-- ============================================================
-- ADIM 3 — 111'DEKİ DÖRT İNDEKS GERÇEKTEN KULLANILIYOR MU
--
-- İndeks eklemek bir iddiadır: "bu sorgu yolu sıcak". Kullanılmayan
-- indeks yalnız yazma maliyeti demektir.
--
-- `idx_scan = 0` çıkan bir indeks DÜŞÜRÜLMELİ — ama yalnız temsilî
-- bir pencereden sonra. Sıfırlamadan hemen sonra hepsi sıfırdır.
-- ============================================================

SELECT
  indexrelname                   AS indeks,
  relname                        AS tablo,
  idx_scan                       AS kullanim,
  pg_size_pretty(pg_relation_size(indexrelid)) AS boyut
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND indexrelname IN (
    'idx_homework_items_book',
    'idx_homework_items_section',
    'idx_student_curriculum_items_workspace',
    'idx_curriculum_template_items_workspace'
  )
ORDER BY idx_scan;


-- ============================================================
-- ADIM 4 — KALAN FK ADAYLARINI YENİDEN DEĞERLENDİR
--
-- 111'de 70 adaydan 4'ü eklendi, 66'sı "bugünkü veriyle gerekçesi
-- yok" diye bekletildi. Bu sorgu, taze istatistiklerle listeyi
-- yeniden üretir.
--
-- KARAR KURALI: bir aday ancak şu ikisi birden doğruysa indekslenir —
--   (a) tablo anlamlı büyüklükte (birkaç yüz satırın üzerinde),
--   (b) kolon gerçekten filtre/join'de kullanılıyor (kod araması).
--
-- "Kim yaptı" kolonları (*_by_profile_id) kod aramasında hiçbir
-- filtrede geçmiyor; tablo büyüse bile aday değiller.
-- ============================================================

SELECT
  c.conrelid::regclass::text     AS tablo,
  a.attname                      AS kolon,
  s.n_live_tup                   AS satir,
  s.seq_scan                     AS sirali_tarama
FROM pg_constraint c
JOIN pg_attribute a
  ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
JOIN pg_namespace n ON n.oid = c.connamespace
JOIN pg_stat_user_tables s ON s.relid = c.conrelid
WHERE c.contype = 'f'
  AND n.nspname = 'public'
  -- İndeksin YALNIZ İLK kolonu sayılır: PostgreSQL bileşik indeksi
  -- ancak baştan kullanabilir.
  AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid AND a.attnum = i.indkey[0]
  )
  AND a.attname NOT LIKE '%\_by\_profile\_id'
  AND s.n_live_tup > 200
ORDER BY s.seq_scan DESC, s.n_live_tup DESC;
