# Üretim Operasyonu — Eşikler, Alarmlar ve Runbook

**Kapsam:** OBS-01 (gözlemlenebilirlik tabanı), OPS-01 (yükseltme tetikleyicileri), OPS-02 (yedek/kurtarma ve olay müdahalesi).
**Kaynak:** `Vercel_Supabase_Production_Readiness_Assessment.pdf` §8, §11.
**Ölçüm tarihi:** 24 Eylül 2026.

## Bu belgenin kuralı

Denetimin en önemli cümlesi kapasiteyle ilgili değil, karar biçimiyle ilgili:

> *"Do not choose Vercel/Supabase tiers from registered-user count alone."*

Buradaki hiçbir eşik "kaç kullanıcımız var" sorusundan türetilmedi. Hepsi **ölçülen tüketime** ve **baş edebilme payına** bağlı.

Bir eşik ancak şu üçü varsa işe yarar: **ne ölçüleceği**, **hangi değerde ne yapılacağı**, ve **kimin bakacağı**. Sahipsiz alarm, kapatılan alarmdır.

---

## 1. Bugünkü taban (OBS-01)

Eşikler bu sayılara göre konuldu.

| Ölçü | Bugün | Kaynak |
|---|---|---|
| Veritabanı boyutu | **33 MB** | `pg_database_size` |
| Toplam satır (public) | 46.215 | `pg_stat_user_tables` |
| Tablo sayısı | 54 | — |
| Supabase egress | ~0,17 GB | denetim anlık görüntüsü |
| Supabase API isteği | 8.102 / 24 saat | denetim anlık görüntüsü |
| Vercel Fluid Active CPU | 59 dk 9 sn | denetim anlık görüntüsü |
| Vercel fonksiyon çağrısı | 64 K | denetim anlık görüntüsü |
| Aktif test kullanıcısı | 3–4 | — |

**Bu sayılar üretim tahmini için kullanılamaz.** Denetimin kendi uyarısı: geliştirici davranışı (sayfa yenileme, aynı akışı tekrarlama, yönetici işlemleri) normal kullanıcıdan farklıdır. Taban, *büyümeyi* ölçmek için var, *tahmin* için değil.

---

## 2. Alarm eşikleri ve sahipleri

Uygulama tarafında yapısal hata kaydı zaten var: `lib/observability.ts` JSON yazıyor, Vercel çalışma zamanı loglarında topluyor. Eksik olan, **ne zaman birinin bakacağı**.

### Supabase

| Ölçü | Uyarı | Kritik | Kritikte yapılacak |
|---|---|---|---|
| Veritabanı boyutu | 250 MB | 400 MB | Büyüme kalemini bul (`pg_total_relation_size` ile tablo bazında); arşivleme/temizlik yoksa plan yükselt |
| Egress (aylık) | %50 | %80 | Önce payload incele (`select('*')`, sayfalama); tekrar eden çağrıları kes; sonra plan |
| API hata oranı | %1 | %2 | Hata kodlarına ayır: 42501 **yetki kusuru** (kapasite değil), 5xx **güvenilirlik**. İkisi de plan sorunu değildir |
| p95 sorgu süresi | 300 ms | 800 ms | Önce sorgu/indeks; iş zaten verimliyse compute yükselt |
| Bağlantı kullanımı | %60 | %80 | Havuzlama ve sızan bağlantı; sonra plan |

### Vercel

| Ölçü | Uyarı | Kritik | Kritikte yapılacak |
|---|---|---|---|
| Fluid Active CPU | plan payının %50'si | %80 | Önce sıcak fonksiyonlar; denetim de "ilk izlenecek kaynak" diyor |
| Fonksiyon çağrısı | %50 | %80 | Mükerrer çağrı ve prefetch davranışı incele, sonra plan |
| Fonksiyon hata/zaman aşımı | %0,5 | %1 | Doğruluk sorunu olarak ele al, kapasite olarak değil |
| Fast Origin Transfer | %50 | %80 | Payload ve önbellekleme |

**Sahiplik:** her alarmın bir insanı olmalı. Bu satır doldurulmadan alarm kurulmuş sayılmaz:

> Birincil: `______` · Yedek: `______` · Kanal: `______`

### Kuralın kendisi

**Hata oranı bir kapasite göstergesi değildir.** Bu turda üç kez doğrulandı: 42501'lerin kaynağı eksik yetki değil, RLS yardımcısının anon'a kapalı olmasıydı (108); hız sınırı ise `search_path` yüzünden iki aydır sessizce çalışmıyordu (110). Üçü de plan yükselterek çözülmezdi.

---

## 3. Yükseltme tetikleyicileri (OPS-01)

Yükseltme kararı tek bir ölçüye değil, **üç sorunun cevabına** bağlı:

1. **Ölçülen tüketim** plan payının %80'ini sürekli aşıyor mu? (bir kerelik sıçrama değil, eğilim)
2. İş zaten **verimli** mi? (önce sorgu/indeks/önbellek; yavaş kodu daha büyük makinede çalıştırmak pahalı bir erteleme)
3. Beklenen zirve, mevcut payın içinde kalıyor mu?

Üçü de "evet"se yükselt. Biri "hayır"sa önce o düzeltilir.

**Tahmin yöntemi:** aylık büyümeyi temsilî bir pencereden ölç, sınıra kalan ayı hesapla, **payın tükenmesinden önce** yükselt. Bugünkü 33 MB ile veritabanı boyutu yakın bir kısıt değil; ilk sıkışacak kalem denetimin de dediği gibi **Vercel Active CPU**.

---

## 4. Yedekleme ve kurtarma (OPS-02)

### Karar

Supabase'in plan bazlı otomatik yedeği kullanılır. Doldurulacak:

| Soru | Cevap |
|---|---|
| Yedek sıklığı | `______` |
| Saklama süresi | `______` |
| Point-in-time recovery var mı | `______` |
| Geri yükleme sorumlusu | `______` |

### Geri yükleme tatbikatı — yılda en az bir kez

**Denenmemiş yedek, yedek değildir.** Tatbikat şu soruyu cevaplar: *"Bugün veritabanını kaybetsek, kaç saatte ve ne kadar veri kaybıyla geri döneriz?"*

1. Yedekten **ayrı** bir projeye geri yükle (üretimin üzerine asla).
2. Doğrula: tablo sayısı, satır sayıları, **RLS politikaları ve fonksiyon yetkileri**.
3. Süreyi kaydet → kurtarma süresi (RTO).
4. Yedek anı ile olay anı arasındaki farkı kaydet → veri kaybı toleransı (RPO).

**RLS ve yetkiler ayrıca doğrulanmalı.** Bu turda görüldü: bir yetki kusuru (`my_workspace_ids`'in anon'a kapalı olması) hiçbir ekranı bozmadan aylarca sürebiliyor. Geri yüklenmiş bir veritabanı "veri yerinde" diye onaylanıp yetkileri bozuk kalabilir. Tatbikattan sonra şu iki test geri yüklenen projeye karşı koşulmalı:

```
tests/tenant-isolation.test.ts     (anon erişimi + politika değerlendirilebilirliği)
tests/cross-tenant.test.ts         (rol bazlı çapraz kiracı)
```

### Olay müdahalesi

| Adım | İçerik |
|---|---|
| 1. Tespit | Alarm ya da kullanıcı bildirimi. Zamanı kaydet |
| 2. Sınıflandır | Yetki / güvenilirlik / kapasite / veri kaybı — **ilk üçü plan yükselterek çözülmez** |
| 3. Sınırla | Etkilenen kiracı sayısı; veri sızıntısı riski var mı |
| 4. Müdahale | Geri alma (migration'ların ROLLBACK blokları) ya da düzeltme |
| 5. Doğrula | İlgili testi koş; canlıda davranışı gör |
| 6. Kayıt | Kök neden ve tekrarı önleyen test |

**6. adım pazarlık konusu değil.** Bu turdaki her kusur bir testle kapatıldı: `workspace-access-parity`, `function-grants`, `auth-form-method`, `rate-limit-sql-parity`, `cross-tenant`. Testsiz kapatılan kusur, geri gelen kusurdur.

---

## 5. Yük testi (LOAD-01) — hazır, çalıştırılmadı

Denetimin §9'u kademeli bir yük testi istiyor ve **P0'lar kapandıktan sonra** koşulmasını şart koşuyor. P0'lar kapandı; test **bilinçli olarak çalıştırılmadı**.

**Neden:** elde ayrı bir staging projesi yok. Yük testini üretim veritabanına karşı koşmak, gerçek kiracı verisinin durduğu bir sisteme yapay yük bindirmek olurdu — hem ölçümü kirletir hem gerçek kullanıcıyı etkiler.

### Önkoşullar

1. **Üretim benzeri veriyle ayrı bir Supabase projesi** (kopyalanmış şema + sentetik veri).
2. Gerçek rollerle kimlik doğrulayan betikler (anon uçlara vurmak yanıltır — denetim: *"Do not use a single synthetic endpoint as a proxy"*).
3. Gözlemlenebilirlik açık (§2'deki panolar).

### Kademeler

| Aşama | Eşzamanlı | Süre | Amaç |
|---|---|---|---|
| Taban | 10 | 10 dk | Betikleri ve kimlik doğrulamayı doğrula |
| Normal | 25–50 | 15 dk | Tipik etkileşim karışımı |
| Büyüme | 100 | 15–30 dk | DB/API/CPU eğilimi |
| Stres | 250 | 15 dk | İlk doyma noktası |
| İsteğe bağlı | 500 | 10–15 dk | Yalnız öncekiler sağlıklıysa |

**İş karışımı:** giriş, panel, öğrenci listesi/detayı, Haftam, ödev işlemleri, finans görünümü ve temsilî yazmalar.

**Ölçülecek:** p50/p95/p99 gecikme, HTTP hata oranı, **42501 ve 5xx sayıları ayrı ayrı**, DB CPU ve bağlantı baskısı, sorgu süresi, egress, Vercel Active CPU ve çağrı sayısı.

**Kabul:** yetki gerilemesi yok (`cross-tenant` ve `tenant-isolation` testleri yük altında da geçmeli) ve kararlaştırılan gecikme/hata hedefleri tutuyor.

---

## 6. Kapanmamış kalemler

| Kalem | Durum | Engel |
|---|---|---|
| PERF-02 | Bekliyor | `pg_stat_reset()` + temsilî pencere gerekiyor; salt okunur bağlantı bunu yapamaz |
| PERF-01 | Kısmen | 4 indeks gerekçelendirildi (111); kalan 66 aday sıfırlama sonrası yeniden değerlendirilecek |
| LOAD-01 | Hazır | Staging projesi gerekiyor |
| OPS-02 | Kısmen | Yedek politikası ve tatbikat tarihi doldurulacak |
| Alarm sahipliği | Açık | İsim ve kanal atanacak |
