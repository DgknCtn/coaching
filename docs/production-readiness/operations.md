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

> **Birincil:** Doğukan Çetin · **Yedek:** yok · **Kanal:** e-posta (`eem.dogukancetin@gmail.com`)

**"Yedek: yok" bilerek böyle yazılıyor.** Tek kişilik nöbetin riski gizlenmiyor: birincil kişi ulaşılamazsa alarm kimseye gitmez. Bu, bir eksik değil bir **kabul edilmiş risk** — ikinci bir kişi eklendiği gün bu satır güncellenir. Boş bırakmak ya da "ekip" yazmak, aynı riski görünmez kılardı.

Kanalın e-posta olmasının sonucu da yazılmalı: **e-posta gece bakılmaz.** Yani bugünkü müdahale süresi "sabah" mertebesindedir; saatler içinde müdahale gereken bir olay için anlık bildirim (telefon/push) kurulmalıdır. Bu ölçek için şimdilik kabul edilebilir, çünkü sistem 33 MB ve aktif kullanıcı sayısı tek haneli.

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

### Karar — Free planda yedek yoktu, kendi düzenimiz kuruldu

**Supabase Free planda otomatik yedek yok.** 26 Eylül'de belgeye şu yazılmıştı: veritabanı kaybedilse geri dönülecek nokta yok, RTO ve RPO **sonsuz**. Karar plan yükseltmek değil, kendi yedek düzenini kurmak oldu.

| Soru | Cevap |
|---|---|
| Yedek sıklığı | **Her gece 03:00 (TRT)** — `.github/workflows/yedek.yml`, cron `0 0 * * *` UTC |
| Saklama süresi | **30 gün** (31 gün önceki bir kayıp geri alınamaz) |
| Point-in-time recovery | **Yok.** Gün içi bir noktaya dönmek mümkün değil; PITR Pro planın ek özelliği |
| En kötü durumda veri kaybı (RPO) | **24 saat** — son gece yedeğinden bu yana olan her şey |
| Nerede duruyor | `DgknCtn/coaching-yedek` (**private**) deposunun Releases bölümü, AES-256 şifreli |
| Geri yükleme sorumlusu | Doğukan Çetin (tek kişi) |
| Runbook | `docs/production-readiness/yedek-geri-yukleme.md` |

### Tasarımın üç kritik kararı

**1. Yedek kod deposunda DURMUYOR.** `DgknCtn/coaching` public ve public depoda Actions çıktılarını (artifact) herkes indirebilir. Yedeği oraya bırakmak, reşit olmayan öğrencilerin kişisel verisini, veli ödeme kayıtlarını ve finans verisini açık internete koymak olurdu. Ayrı private depo + şifreleme, bu yüzden tercih değil zorunluluk.

**2. Yedek sessizce başarısız olamaz.** `scripts/yedek/al.sh` altı denetimden geçiyor: sürüm, boyut (1 MB altı → hata), `public` veri girdisi sayısı (50 altı → hata), `auth.users` varlığı, şifreleme ve **geri açılabilirlik**. Sonuncusu en kritik: şifreli dosya tekrar çözülüp `pg_restore` ile okunuyor. Bu olmasa sistem 30 gün boyunca açılamayan dosyalar üretip her sabah yeşil görünebilirdi.

Denetimlerin kendisi de `scripts/yedek/denetim-testi.sh` ile sınanıyor — beş senaryo kasten bozulmuş girdilerle çalıştırılıyor ve her birinin **hata vermesi** bekleniyor. Bu test yedek işinin ilk adımı olarak her gece koşuyor: denetimleri kırılmış bir betikle alınan yedek, doğrulanmamış yedektir.

**3. Başarısızlık zaten alarm.** §2'nin "sahipsiz alarm, kapatılan alarmdır" kuralı burada kendiliğinden karşılanıyor: GitHub başarısız zamanlanmış koşuyu depo sahibine e-postayla bildirir. Ayrı bir izleme kurulmadı, çünkü kurulacak alarmın ta kendisi bu.

### Bu kararın kabul ettiği risk

Gece yedeği, **gün içi** bir veri kaybını geri almaz: sabah 10'da silinen bir şey için elde gece 03:00'ün hâli var. Bu bilinçli bir kabul — alternatifi Pro plan ve PITR. Sistem 33 MB ve aktif kullanıcı tek haneliyken makul; kullanıcı sayısı arttığında **yeniden karara bağlanmalı** ve tetikleyici §3'ün kuralıyla aynı: ölçülen tüketim değil, kabul edilebilir veri kaybının değişmesi.

### Geri yükleme tatbikatı — yılda en az bir kez

**Denenmemiş yedek, yedek değildir.** Tatbikat şu soruyu cevaplar: *"Bugün veritabanını kaybetsek, kaç saatte ve ne kadar veri kaybıyla geri döneriz?"*

1. Yedekten **ayrı** bir projeye geri yükle (üretimin üzerine asla).
2. Doğrula: tablo sayısı, satır sayıları, **RLS politikaları ve fonksiyon yetkileri**.
3. Süreyi kaydet → kurtarma süresi (RTO).
4. Yedek anı ile olay anı arasındaki farkı kaydet → veri kaybı toleransı (RPO).

**RLS ve yetkiler ayrıca doğrulanmalı.** Bu turda görüldü: bir yetki kusuru (`my_workspace_ids`'in anon'a kapalı olması) hiçbir ekranı bozmadan aylarca sürebiliyor. Geri yüklenmiş bir veritabanı "veri yerinde" diye onaylanıp yetkileri bozuk kalabilir. Tatbikattan sonra şu iki test geri yüklenen projeye karşı koşulmalı:

```
tests/tenant-isolation.test.ts       (anon erişimi + politika değerlendirilebilirliği)
tests/cross-tenant.test.ts           (rol bazlı çapraz kiracı)
tests/anon-endpoint-probe.test.ts    (38 tablo + 11 RLS yardımcısı: 42501 var mı)
```

Üçüncüsü tatbikatın **en hızlı** kontrolü: geri yüklenen projede fonksiyon yetkileri eksikse (yedek `GRANT`'leri taşımazsa) anon yüzeyinin tamamı 42501'e döner ve bu dosya saniyeler içinde kırmızıya düşer.

**İlk tatbikat tarihi:** 2026 Aralık ayının ilk haftası (öneri). Yıllık tekrar; tarih geçtiğinde bu satır yeni tarihle güncellenir. **Tarihi olmayan tatbikat yapılmamış tatbikattır** — bu yüzden boş bırakılmıyor, önerilen tarih yazılıyor.

Tatbikatın adım adım komutları artık ayrı bir belgede: **`yedek-geri-yukleme.md`**. Orada indirme, şifre çözme, `pg_restore`, yetki doğrulama ve RTO/RPO ölçümü sırayla yazılı — olay anında bu belgeye değil oraya bakılır.

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

## 5. Yük testi (LOAD-01) — koşumcu yazıldı, çalıştırılmadı

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

### Koşumcu — `scripts/load/`, `npm run load`

Yukarıdaki tablo artık bir tarif değil, **çalıştırılabilir kod**:

| Dosya | İşi |
|---|---|
| `scripts/load/run.mjs` | Kademeler, rampa, düşünme süresi, üretim kilidi |
| `scripts/load/senaryolar.mjs` | Giriş + iş karışımı (12 adım; her adımın yanında kaynak dosya yazılı) |
| `scripts/load/olcum.mjs` | p50/p95/p99 ve **sınıflara ayrılmış** hata sayaçları |

Üç tasarım kararı ve gerekçeleri:

**1. Harici yük aracı yok (k6/artillery değil).** Koşumcu `fetch` kullanıyor, çünkü ürünün gerçekten kullandığı HTTP yolu bu ve araya kütüphane davranışı girmiyor — `tests/helpers/tenant.ts`'nin aynı gerekçesi. Ayrıca bağımlılık eklemeden, `node scripts/load/run.mjs` ile staging'de derleme adımı olmadan koşuyor.

**2. Üretim kilidi iki katmanlı.** `ALLOW_LOAD_TEST=1` yoksa **ve** hedef `.env.local`'deki üretim URL'siyle aynıysa koşum **başlamadan** çıkıyor. Tek katman yetmezdi: bayrağı bir kez açan geliştirici hedefi değiştirmeyi unutursa üretime 250 eşzamanlı istek gider. `.env.local` okunamıyorsa da reddediyor — doğrulanamayan hedefe yük bindirilmez.

**3. Hata sınıfları raporda ayrı.** `42501` (yetki), `5xx` (güvenilirlik), `429` (hız sınırı), cevapsızlık (kapasite) ayrı sayılıyor ve 42501 görülürse çıkış kodu hata veriyor. §2'nin kuralı ölçümün içine gömülü: *hata oranı bir kapasite göstergesi değildir.* Toplayıcının bu ayrımı gerçekten yaptığı `tests/load-olcum.test.ts` ile doğrulanıyor (ağ gerektirmez, her koşuda çalışır).

**Hâlâ koşulmadı ve bu bilinçli.** Eksik olan tek şey 1. önkoşul: staging projesi. Koşumcu hazır olduğu için o proje açıldığı gün ölçüm, yazılım işi değil yalnız komut işi:

```
ALLOW_LOAD_TEST=1 LOAD_SUPABASE_URL=https://<staging>.supabase.co \
LOAD_SUPABASE_ANON_KEY=... LOAD_USERS='ogretmen@x.com:sifre' \
LOAD_STAGE=taban npm run load
```

**Koşumcunun ölçemediği şey:** Vercel tarafı yalnız `/api/health` üzerinden yoklanıyor (`LOAD_APP_URL` verilirse). Sayfa render'ı (SSR) oturum çerezi gerektirdiği için karışımda yok; yani rapor **Supabase tarafını** ölçer, Vercel Active CPU eğilimi panodan okunur. Bunu yazmak gerekiyor, çünkü "yük testi geçti" cümlesi aksi hâlde ölçülmeyen bir kaynağı da kapsıyormuş gibi görünür.

---

## 6. Kapanmamış kalemler

| Kalem | Durum | Engel |
|---|---|---|
| PERF-02 | **Pencere başladı** | Sıfırlama Supabase'de mümkün değil (`postgres` rolüne kapalı); yöntem iki anlık görüntünün farkına çevrildi. Başlangıç: `perf-02-anlik-01.md`. 3 gün boyunca canlıya karşı test koşulmaz |
| PERF-01 | **Açık** | `111` canlıda YOKTU (26 Eylül'de ölçüldü); panelde uygulanması bekleniyor. Kalan 66 aday fark ölçümünden sonra değerlendirilecek |
| LOAD-01 | **Koşumcu hazır** | Yalnız staging projesi eksik (§5) |
| OPS-02 | **Kapandı (tatbikat hariç)** | Gece yedeği kuruldu: 03:00 TRT, 30 gün, şifreli, private depoda. RPO 24 saat. İlk tatbikat Aralık ilk haftası |
| Alarm sahipliği | **Kapandı** | Birincil, yedek (yok) ve kanal §2'de yazılı |
| SEC-01 | **Kapandı** | Teşhis 108 ile düzeltildi; kalıcı bekçi `tests/anon-endpoint-probe.test.ts`, geçmiş kanıtı `sec-01-log-sorgusu.md` |
