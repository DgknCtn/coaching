# Üretime Hazırlık — Faz 0: Canlı Durum Ölçümü

**Tarih:** 24 Eylül 2026
**Kaynak:** `Vercel_Supabase_Production_Readiness_Assessment.pdf` (dış denetim)
**Yöntem:** canlı veritabanına salt okunur SQL. Hiçbir şey değiştirilmedi.

## Neden bu belge var

Denetim kendi sınırını yazıyor: *"The audit did not inspect application source code, function bodies, HTTP request traces, execution plans, secrets management, CI/CD configuration or full Supabase logs."*

Kaynağa bakmayan bir denetimin bulguları "açık" değil "incelenmeli" niteliğindedir. Doğrulamadan düzeltmeye geçmek, olmayan sorunu düzeltip yerine gerçek bir sorun koymaktır. Bu faz her P0 için **gerçek / yanlış alarm / daha kötü** kararını veriyor.

---

## Özet tablo

| Denetim bulgusu | İddia | Canlı gerçek | Karar |
|---|---|---|---|
| SEC-03: RLS'siz iki public tablo | `rate_limit_counters`, `rate_limit_salt` | RLS **açık**, politika 0, anon ve authenticated'a **kapalı** | **Yanlış alarm** |
| SEC-02: anon çalıştırabilen fonksiyonlar | 97 | **155** (158 SECURITY DEFINER içinden) | **Gerçek — denetimden kötü** |
| SEC-01: 42501 izin hataları | "finans/denetim/partner nesnelerinde yetki hatası" | Bu 16 tablo anon'a **kasıtlı** kapalı; liste birebir örtüşüyor | **Yanlış teşhis** |
| PERF-02: yüksek tarama sayıları | `workspaces` 191.697 seq scan | 203.068 — ama istatistik penceresi **62 gün** | **Bayat veri** |
| Lisans/deneme kapısı | *denetimde yok* | 75 politika kapısız | **Gerçek — denetimin kaçırdığı** |

---

## 1. RLS durumu — denetim yanılıyor

```sql
SELECT c.relname, c.relrowsecurity, ...
FROM pg_class c ... WHERE n.nspname='public' AND c.relkind='r' AND c.relrowsecurity = false;
-- (0 rows)
```

**`public` şemasında RLS'i kapalı tek bir tablo yok.** Denetimin işaret ettiği iki tablo:

| Tablo | RLS | Politika | anon SELECT | authenticated SELECT |
|---|---|---|---|---|
| `rate_limit_counters` | açık | 0 | hayır | hayır |
| `rate_limit_salt` | açık | 0 | hayır | hayır |

Bu tam olarak `050_rate_limit.sql:39-45` ve `068_audit_hardening.sql:170-171`'in tasarladığı hâl: RLS açık, **politika bilerek yok**, tüm istemci yetkileri geri alınmış. Erişimin tek yolu `check_rate_limit` SECURITY DEFINER fonksiyonu.

Denetim büyük olasılıkla "RLS açık ama politika yok" durumunu "RLS yok" diye yorumladı. Aksi doğru: politikasız RLS, **en kapalı** hâldir.

**Aksiyon: yok.** SEC-03 kapandı.

---

## 2. SECURITY DEFINER yüzeyi — denetimden daha kötü

```
security_definer: 158   anon çalıştırabilir: 155   authenticated: 158   toplam fonksiyon: 165
```

Denetim 97 demişti; gerçek **155**. Sebebi PostgreSQL'in varsayılanı: fonksiyonlara `EXECUTE` *`PUBLIC`'e* verilir. Depoda 101 `GRANT EXECUTE ... TO authenticated` var ama yalnız 32 fonksiyonda `REVOKE ... FROM PUBLIC` bulunuyor. `GRANT TO authenticated` yazmak anon'u **engellemez**.

Bugün sömürülebilirlik düşük: gövdeler `has_workspace_role` / `current_profile_id` kontrol ediyor ve anon'da `auth.uid()` NULL. Ama savunma tek katmana bırakılmış durumda — gövdesinde kontrol unutulan tek bir fonksiyon doğrudan dışarı açık olur.

**Aksiyon: Faz 2 (migration 108).**

---

## 3. 42501 hataları — yanlış teşhis

Anon'a **kapalı** 16 tablo:

```
audit_events, auth_events, billing_orders, deletion_requests,
finance_lessons, finance_payments, parent_payment_notices,
partner_commissions, partners, rate_limit_counters, rate_limit_salt,
student_fees, support_messages, support_tickets, usage_counters,
workspace_licenses
```

Denetimin 42501 listesi — *"finance, payment, student-fee, audit, partner"* — bu kümeyle **birebir** örtüşüyor.

Yani hata "eksik GRANT" değil. Bu tabloların anon'a kapalı olması **doğru ve kasıtlı**. 42501, uygulamanın oturumu olmayan (ya da süresi dolmuş, anon'a düşmüş) bir istemciyle bu tabloları okumaya çalışmasından geliyor.

Kanıtlayıcı ikinci gözlem: uygulama kodunda bu tablolara **hiç doğrudan yazma yok** (hepsi RPC üzerinden), yani `068`'in `REVOKE INSERT/UPDATE/DELETE` kısıtlaması da kaynak değil.

**Yapılmayacak:** bu tablolara `GRANT` vermek. Denetimin kendi uyarısı: *"Do not fix by granting ALL to anon/authenticated globally."* Bu durumda herhangi bir GRANT, gerçek bir güvenlik gerilemesi olurdu.

**Aksiyon:** Supabase API loglarından 42501'lerin hangi uçtan geldiği çıkarılır; düzeltme oturum kaybının ele alınışındadır (yönlendirme/yeniden deneme), yetkide değil. Faz 0'ın tek açık kalemi — log erişimi gerekiyor.

---

## 4. Performans istatistikleri — bayat

```
stats_reset: 2026-07-24 08:28:18+00   pencere: 62 gün
```

| Tablo | Satır | Seq scan | Index scan |
|---|---|---|---|
| `profiles` | 21 | 38.306 | 24.682.645 |
| `workspace_members` | 28 | 5 | 22.584.222 |
| `workspaces` | 7 | 203.068 | 20.462.697 |
| `workspace_licenses` | 2 | 26 | 18.287.848 |
| `students` | 21 | 9.218 | 1.851.756 |

Sayılar **62 günlük kümülatif** ve bu pencere `091`/`092` RLS optimizasyonundan **öncesini de kapsıyor**. 092 kendi başlığında ölçmüştü: `profiles` taramaları %41 düştü, `/teacher` 3.298ms → 1.115ms. Yani denetimin gördüğü rakamlar bugünkü performansı göstermiyor.

Dokümanın kendi uyarısı da aynı yönde: *"Cumulative PostgreSQL statistics may predate the current test session."*

**Dikkat çeken:** `workspace_licenses` 2 satırlık bir tablo ama 18,2 milyon indeks taraması almış. Kaynağı `workspace_access_ok` — RPC gövdelerindeki `has_workspace_role` çağrıları üzerinden. **Bu, Faz 1 için doğrudan uyarı:** kapıyı 75 politikaya bağlamak bu sayıyı artırabilir, o yüzden Faz 1 ölçümsüz kapanmayacak.

**Aksiyon:** `pg_stat_reset()` sonrası temsilî bir pencerede yeniden ölçüm (Faz 5). PERF-01'in (70 FK indeksi) önkoşulu budur.

---

## 5. Lisans/deneme kapısı — denetimin kaçırdığı gerçek açık

Canlı `my_workspace_ids` gövdesinde `workspace_access_ok` **geçmiyor** (`position(...) = 0`).

Politika dağılımı (toplam 99):

| Yardımcı | Politika | Deneme/lisans kapısı |
|---|---|---|
| `my_workspace_ids` | **75** | **yok** |
| `is_workspace_member` | 3 | var |
| `has_workspace_role` | 2 | var |

Süresi dolmuş bir kiracı kendi `workspaces` satırını göremiyor (3 politika kapılı) ama **öğrenci, ödev ve finans verisini görebiliyor** (75 politika kapısız). Hassas olan açık, önemsiz olan kapalı.

Tek kalan koruma `lib/workspace.ts:40` → `/erisim` yönlendirmesi; yani arayüz. Denetimin kendi cümlesi: *"UI hiding is not an authorization control."* Deneme süresi 3 güne indiği için (`099`) bu durum daha sık yaşanacak.

**Kanıtın biçimi.** Canlıda "sömürü gösterimi" yapılamadı ve sebebi dürüstçe şu: salt okunur denetim kullanıcısı da RLS'e tabi (`my_workspace_ids` çalıştırma yetkisi yok, `workspaces` boş dönüyor) ve şu anda süresi dolmuş bir çalışma alanı bulunmuyor. Kanıt bu yüzden **yapısal**: fonksiyon gövdesinde kapı yok + 75 politika o fonksiyonu çağırıyor. İkisi de canlıdan okundu, ikisi de kesin.

Çalışan bir "öncesi/sonrası" gösterimi ancak süresi dolmuş bir hesapla mümkün; o da Faz 3'ün tohumlanmış test hesaplarıyla gelecek.

**Aksiyon: Faz 1 (migration 107) — sıradaki iş.**

---

## Faz 0 sonucu

- **Kapandı:** SEC-03 (yanlış alarm).
- **Teşhis düzeltildi:** SEC-01 — GRANT yazılmayacak; log incelemesi bekliyor.
- **Doğrulandı ve büyüdü:** SEC-02 (97 → 155).
- **Ertelendi:** PERF-01/02 — istatistik sıfırlanana kadar veri karar veremez.
- **Yeni P0:** lisans kapısı; denetimde yok, canlıda aktif.

---

## Faz 1 sonrası doğrulama (107 + 108 uygulandı)

### Kapı yerinde

| Fonksiyon | `workspace_access_ok` |
|---|---|
| `my_workspace_ids` | var |
| `has_workspace_role` | var |
| `my_member_workspace_ids` | **yok** — kasıtlı (ticari tablolar) |

Politika dağılımı: **75** kapılı, **2** kapısız ikiz (yalnız `billing_orders` + `workspace_licenses`), **3** `is_workspace_member`, `has_workspace_role` kalıntısı **0**. Üç farklı yetki cevabı tek cevaba indi.

### 107 bir kusuru görünür kıldı (108 ile kapandı)

107 uygulandıktan sonra `/api/health` **503** dönmeye başladı. Sebep sağlık kontrolü değildi; anon anahtarla yapılan en basit sorgu patlıyordu:

```
GET /rest/v1/students?select=id&limit=1
{"code":"42501","message":"permission denied for function my_workspace_ids"}
```

**Kusur 107'nin değil, 092'nin.** `091:82` fonksiyondan `PUBLIC`'in `EXECUTE` hakkını aldı (anon PUBLIC üyesidir); fonksiyon o gün tek tabloda deneniyordu, etkisi görünmedi. 092 deseni 75 politikaya yayınca anon oturumundaki her sorgu, değerlendiremediği bir politika ifadesine çarpar oldu.

Bu, **§3'teki teşhisi düzeltiyor**: anon yalnız korunan tablolarda değil, **korunmayan** tablolarda da (`students`, `books`, `homework_items`) 42501 alıyordu. Denetimin raporladığı 62 Postgres hatasının önemli bir kısmı buradan geliyor; uptime monitörü her çağrıda bir tane üretiyordu.

Ayrım önemli: *"yetkisiz erişim reddedildi"* değil, *"yetkili erişim değerlendirilemedi"*. RLS'in işi satırı süzmek; süzemediğinde sorgu patlar.

108 sonrası: anon `students` sorgusu `[]` döndürüyor, `/api/health` **200**.

### Maliyet ölçüldü — kapı performansı bozmadı

Tek `/teacher/students` yüklemesi, 107+108 sonrası:

| Tablo | Tarama (bu sayfa için) |
|---|---|
| `workspace_licenses` — kapının doğrudan maliyeti | **63** |
| `workspace_members` | 55 |
| `workspaces` | 64 |
| `profiles` | 68 |

Karşılaştırma noktası 092'nin kendi başlığındaki ölçüm (aynı sayfa, tek yükleme): `profiles` 13.462 → 7.891, `workspace_members` 13.373 → 7.802.

Bugün aynı sayfa **onlarca** tarama üretiyor, binlerce değil. Yani:
- 092'nin kazancı korunuyor (kapı, InitPlan kaldırmasını bozmadı),
- kapının maliyeti 2 satırlık indeksli bir tabloda sayfa başına ~63 arama.

`EXPLAIN` ile `loops=1` doğrulaması yapılamadı: salt okunur denetim kullanıcısı `my_workspace_ids`'i çalıştıramıyor (107'nin `REVOKE`'u doğru çalışıyor demektir). Yerine 092'nin kendi yöntemi kullanıldı — sayfa başına gerçek tarama farkı, ki daha doğrudan bir ölçüdür.

### Faz 2 için çıkan kritik kısıt

Bu bulgu olmasaydı, Faz 2'nin toplu `REVOKE`'u RLS yardımcılarını da kapsar ve uygulamanın **oturumsuz her sorgusu** 42501'e dönerdi — giriş, davet ve sağlık kontrolü dahil.

İzin listesi bu yüzden iki kategoriden oluşacak:

1. **Oturumsuz akışların çağırdıkları:** `check_rate_limit`, `get_invitation_by_token`, `log_auth_event`
2. **RLS politikalarının çağırdıkları:** `my_workspace_ids`, `my_member_workspace_ids`, `has_workspace_role`, `is_workspace_member`, `current_profile_id`, `is_student_self`, `is_parent_of_student`, `workspace_access_ok`

`tests/tenant-isolation.test.ts` artık bunu davranışsal olarak koruyor: anon korunmayan bir tabloya dokunduğunda hata değil **boş sonuç** almalı.

---

## Faz 2 sonrası doğrulama (109 uygulandı)

### Anon yüzeyi 155 → 14

| Kategori | Adet |
|---|---|
| RLS politikalarından çağrılanlar | 11 |
| Oturumsuz akışlar (`check_rate_limit`, `get_invitation_by_token`, `log_auth_event`) | 3 |
| **Toplam anon'a açık** | **14** |
| `authenticated`'a açık | 166 |

Fazlalık yok; kalan 14'ün tamamı iki meşru kategoriden.

Davranış kontrolleri:
- Anon `admin_overview` çağrısı → **42501 reddedildi**
- Anon `students` okuması → `[]` (hata değil)
- `get_invitation_by_token` anon'dan → çalışıyor; `/invite/<token>` sayfası doğru render ediyor
- `/api/health` → **200**
- Öğretmen paneli, öğrenci detayı → çalışıyor

### 109 bir kusuru daha görünür kıldı: hız sınırı iki aydır çalışmıyor

Anon ile `check_rate_limit` çağrıldığında yetki hatası değil şu döndü:

```
{"code":"42883","message":"function digest(text, unknown) does not exist"}
```

`42883 = undefined_function`. Fonksiyon çağrılabiliyor ama gövdesi çalışamıyor: `digest` `extensions` şemasında, `check_rate_limit`'in `search_path`'i ise yalnız `public, pg_temp` (`068:192`).

**109'un getirdiği bir şey değil.** Canlıdan okunan kanıt:

| Fonksiyon | search_path |
|---|---|
| `log_auth_event` | `public, pg_temp, extensions` |
| `check_rate_limit` | `public, pg_temp` — **eksik** |

Aynı kusur `log_auth_event`'te de vardı ve `093:52` onu düzeltti; `check_rate_limit` o turda gözden kaçtı. İkinci kanıt uygulama logunda: bu oturumun en başında, 109'dan saatler önce, her giriş denemesinde `"Hız sınırı sayacı çalışmadı; istek geçirildi"` yazılıyordu.

**Neden sessiz kaldı.** `lib/rate-limit.ts` bilinçli olarak fail-open: *"sayaç bozulursa istek engellenmez, loglanır — kimsenin giriş yapamaması hız sınırının olmamasından kötü bir arızadır."* O karar doğru, ama sonucu şu: giriş, kayıt, şifre sıfırlama ve davet kabulünde **kaba kuvvet koruması fiilen yoktu** — 050'nin var olma sebebinin tamamı.

Dış denetim bunu göremedi: fonksiyon var, yetkileri doğru, tablo yerinde. Yalnız çalışmıyor.

**Düzeltme:** migration 110, `ALTER FUNCTION` ile gövdeye dokunmadan `extensions`'ı search_path'in sonuna ekliyor (`public` önce kaldığı için gölgeleme riski yok). `tests/rate-limit-sql-parity.test.ts` bekçisi eklendi.

---

## 110 doğrulandı — hız sınırı canlandı

| Kontrol | Sonuç |
|---|---|
| `check_rate_limit` search_path | `public, pg_temp, extensions` (artık `log_auth_event` ile aynı) |
| Sayaç çalışıyor mu | 9 → 8 → 7 → … → 0 |
| Kilit kapanıyor mu | **11. denemede `allowed: false`** |

İki aydır sessizce ölü olan koruma çalışır hâle geldi. Kaba kuvvet savunması artık gerçekten var.

*Not: uygulama logundaki `"Hız sınırı sayacı çalışmadı"` satırının kesildiği bu oturumda gösterilemedi — bu dev sunucusunda giriş denemesi yapılmadı, sayaç sıfır. Kanıt doğrudan RPC çağrılarında ve kesin.*

---

## Faz 4 — istek verimliliği: ölçüm planı yalanladı

Plan iki değişiklik öngörüyordu ve ilkini "en büyük kazanç" diye nitelemişti. **Ölçüm ikisini de zayıf çıkardı.** Plandaki kural gereği (*"tahmine göre optimizasyon yapılmaz"*) sonuçlar aynen kaydediliyor.

Ölçüm üretim derlemesinde yapıldı — **dev sunucusunda prefetch çalışmaz**, orada ölçmek yanıltırdı.

### 1. Kenar çubuğu prefetch'i: %7 kazanç (uygulandı)

Tek `/teacher` ziyareti, aynı hesap, aynı veri:

| Senaryo | Tarama |
|---|---|
| Prefetch açık | 1004 |
| Prefetch kapalı | **936** |

Beklenti çok daha büyük bir düşüştü. Sebep: Next.js `force-dynamic` sayfalarda **kısmi** prefetch yapıyor, tam render değil — yani "her prefetch bir tam sayfa render'ı" varsayımım yanlıştı.

%7 yine de gerçek ve maliyeti tek bir prop, o yüzden tutuldu.

### 2. `select('*')` → kolon listesi: YAPILMADI

`teacher_student_operation_view` **28 kolon** döndürüyor; `teacher/page.tsx` **31 alan referansı** kullanıyor. Yani en geniş `select('*')` çağrısında neredeyse hiçbir kolon israf edilmiyor. Kolon listesi yazmak ölçülebilir kazanç getirmez, yalnız view her değiştiğinde güncellenecek bir kopya daha yaratırdı.

### Asıl darboğaz başka yerde

Tek `/teacher` ziyaretinin tablo bazlı dağılımı:

| Tablo | Tarama | Tür |
|---|---|---|
| `workspaces` | 196 | yetki |
| `profiles` | 179 | yetki |
| `workspace_licenses` | 172 | yetki (107'nin kapısı) |
| `workspace_members` | 149 | yetki |
| `homework_items` | 99 | veri |
| `students` | **7** | veri |

**Taramanın ~%86'sı yetki ve kiracı çözümlemesi.** Asıl iş verisi (`students`) 7 tarama alırken yetki tabloları 696 alıyor.

Sebep bileşik: `getTeacherContext` 6 round-trip yapıyor, sayfa 7 sorgu daha ekliyor (öğrenci detayı ~19), ve **her sorgu kendi RLS değerlendirmesini** yapıyor — 092'nin InitPlan kazancı sorgu başına bir kez geçerli, sayfa başına değil.

Yani gerçek kaldıraç **sayfa başına sorgu sayısı**; prefetch ve payload değil. Bu, ölçülmeden yapılacak bir iş değil ve `force-dynamic` kaldırmak da çözüm değil (kiracıya özel, RLS'e bağlı sayfalarda yanlış önbellekleme = başka kiracının verisi).

**Sonraki adım için doğru soru:** `getTeacherContext`'in 6 turu ve panelin 7 sorgusu kaça indirilebilir? Bu, ayrı bir ölçüm turu hak ediyor.

---

## Faz 3 — çapraz kiracı izolasyonu doğrulandı (SEC-04 kapandı)

İki ayrı çalışma alanındaki gerçek öğretmen hesaplarıyla, gerçek JWT'ler üzerinden: **10/10 geçti.**

| Deneme | Sonuç |
|---|---|
| Kendi öğrencisini okuma (pozitif kontrol) | 1 satır |
| Yabancı öğrenciyi id ile okuma | boş |
| Yabancı `workspace_id` ile süzme | boş |
| Süzgeçsiz listede yabancı satır | yok |
| Yabancı öğrenciyi güncelleme | satır değişmedi (sahibi doğruladı) |
| Yabancı kiracıya ekleme | **42501** |
| Kendi kiracısına ekleme (pozitif kontrol) | başarılı, sonra silindi |
| Yabancı öğrenciyi silme | satır yerinde |
| Yabancı öğrenci üzerinde RPC | reddedildi |
| Kişisel ajanda (§14) — kendi kiracısında bile | boş |

**Servis anahtarı kullanılmadı.** Testler anon anahtarla gerçek giriş yapıp JWT alıyor; `vitest.config.ts`'in kararı korundu. **Hiçbir hesap oluşturulmadı** — yardımcıda `signUp` yolu yok, çünkü servis anahtarı olmadan açılan hesap silinemez.

### İki teknik not

**`supabase-js` kullanılamadı.** Kütüphane her `createClient` çağrısında Realtime istemcisi başlatıyor ve bu Node 22+ native WebSocket istiyor; ortamda Node 20 var. Testin Realtime ile işi yok, bu yüzden `tenant-isolation.test.ts`'in deseni sürdürüldü: doğrudan `fetch` ile PostgREST. Node sürümünden bağımsız, bağımlılık eklemiyor ve ürünün gerçekten kullandığı HTTP yolunu ölçüyor.

**Test mutasyonla sınandı.** "Yabancı öğrenciyi id ile isteyince boş döner" iddiasında yabancı id yerine kendi id'si konuldu; test kırmızıya düştü. Yani iddia gerçekten satır sayısına bakıyor, kendiliğinden yeşil yanmıyor.

### Neden pozitif kontroller kritik

RLS okumada hata vermez, satırı sessizce süzer. "Yabancı veri gelmedi" iddiası; veritabanı boşsa, kimlik bilgisi yanlışsa ya da sorgu hatalıysa da doğrudur. Bu yüzden her negatifin yanında aynı sorgunun kendi kiracıda **dolu** döndüğünü gösteren bir kontrol var. Yazmada ise sessiz no-op istemciden başarı gibi görünür; tek güvenilir kanıt diğer kiracının satırı yeniden okuyup değişmemiş bulmasıdır.

---

## Kimlik formları GET ile gönderiliyordu (üretim derlemesinde görüldü)

Ölçüm için giriş yapılırken adres çubuğunda şu göründü:

```
/login?email=dogu%40test.com&password=test123123
```

**Şifre URL'de.** Oradan tarayıcı geçmişine, sunucu erişim loglarına ve Referer başlığıyla üçüncü taraflara sızar.

**Sebep:** form gönderimi JavaScript ile yakalanıyor ama `<form>` etiketinde `method` yoktu. JS hazır değilken (hydration tamamlanmadan) gönderim yapılırsa tarayıcı kendi varsayılanını uygular ve `method` yoksa varsayılan **GET**'tir. Aynı sebeple giriş de yapılamıyordu: form hiç işlenmiyor, sayfa yeniden yükleniyordu.

Bu "yalnız yavaş bağlantıda olur" bir durum değil — ilk yüklemede, sekme arka plandayken ya da JS bir uzantı yüzünden geciktiğinde de oluşur.

**Düzeltme:** beş kimlik formuna `method="post"` (giriş, kayıt, şifre güncelleme, davet kabulü, şifremi unuttum). Aynı kazada alanlar istek gövdesinde gider. `tests/auth-form-method.test.ts` bekçisi eklendi ve mutasyonla sınandı.

Dış denetimin göremeyeceği bir kusur: rapor veritabanı ve platform katmanına bakıyordu, istemci tarafındaki form davranışına değil.

### Sürecin kendisinden çıkan ders

Düzeltme yapıldı ama **kullanıcıya ulaşmadı**: eski üretim sunucusu durdurulmadan yenisi başlatıldı, `EADDRINUSE` ile düştü ve sağlık kontrolü *eski* sunucudan 200 aldığı için "hazır" sanıldı. Doğrulama, derlemenin içinde `method="post"` olduğunu görmekle yapılmıştı — yetersiz. Doğru kontrol, **sunucunun gerçekte ne gönderdiğine** bakmaktı:

```
curl -s http://localhost:3100/login | grep -oE "<form[^>]*>"
```

---

## Sorgu birleştirme ölçüldü — kazanç yok denecek kadar az

`getTeacherContext` aynı `workspaces` tablosunu tek istekte iki kez sorguluyordu (biri aktif alan, biri seçici listesi; ikincisi birincisini zaten kapsıyor). Birleştirildi ve ölçüldü:

| Tablo | Öncesi | Sonrası |
|---|---|---|
| `workspaces` | 196 | 194 |
| `profiles` | 179 | 177 |
| `workspace_licenses` | 172 | 171 |
| `workspace_members` | 149 | 148 |

**~6 tarama, %1'in altında.** Sorgular zaten `Promise.all` içinde paralel olduğu için gecikme kazancı da yok.

Değişiklik tutuldu ama gerekçesi değişti: **performans değil, mükerrerliğin giderilmesi**. Aynı tabloyu aynı istekte iki kez sormanın sebebi yoktu.

**Asıl darboğazı bu ölçüm de doğruluyor:** kaldıraç bir sorguyu silmek değil, sayfanın yedi sorgusunu üçe indirmek. Her sorgu kendi RLS değerlendirmesini yapıyor ve 092'nin InitPlan kazancı sorgu başına geçerli, sayfa başına değil. Ayrı bir ölçüm turu istiyor.

---

## Çapraz kiracı testi canlıda 5 kayıt bırakmıştı

Testin "kendi kiracısına ekleyebilir (pozitif kontrol — sonra siler)" adımı kaydı **silmiyordu**. `students` tablosunda DELETE politikası yok (ürün öğrenciyi silmez, arşivler) ve PostgREST bunu hata olarak bildirmiyor: **200 dönüyor, 0 satır siliyor**. `code` null olduğu için test geçiyordu.

Tam olarak testin kendi başlığında uyardığı tuzak — *"sessiz no-op istemciden başarı gibi görünür"* — kontrol yazma testlerine konmuş, temizlik adımına konmamıştı. Beş koşu, beş kayıt.

**Yapılanlar:**
- Kalan 5 kayıt arşivlendi (kalıcı silme yalnız Supabase panelinden mümkün).
- Kayıt oluşturan pozitif kontrol **kaldırıldı**. Gerek de yoktu: negatif iddia hata kodunun `42501` (yetki reddi) olmasını şart koşuyor — ekleme başka bir sebeple düşseydi (`23502` zorunlu kolon, `42703` kolon yok) test kırılırdı. Yani iddia kendi anlamını çöp bırakmadan garanti ediyor.
- Silme testi de `code` yerine dönen satır sayısına bakacak şekilde sıkılaştırıldı.
- Doğrulandı: yeni koşu hiç kayıt oluşturmuyor.

---

## Faz 4 kapanışı — sorgu silmek bu sayfada kaldıraç değil

`getTeacherContext`'teki mükerrer `workspaces` sorgusundan sonra ikinci bir mükerrerlik daha bulundu: panel `workspace_licenses` tablosunu ayrı sorguyla soruyordu, oysa `get_workspace_usage` dönüşünde `license_status` zaten var (058). O sorgu da kaldırıldı.

**Ölçüm sonucu, ilkiyle aynı yöne işaret etmedi — tam tersine gürültünün içinde kayboldu:**

| Tablo | Birleştirme sonrası | Lisans sorgusu da silindikten sonra |
|---|---|---|
| `profiles` | 177 | 193 |
| `workspaces` | 194 | 204 |
| `workspace_licenses` | 171 | 178 |
| `workspace_members` | 148 | 159 |

Sorgu **silindiği hâlde sayılar arttı**. Sayfa yüklemeleri arasındaki doğal dalgalanma (±20 tarama), tek bir sorgunun etkisinden büyük.

**Dürüst sonuç: bu ölçüm yöntemi bu mertebedeki farkları ayırt edemiyor.** İki değişiklik de tutuldu ama gerekçeleri performans değil, **mükerrerliğin giderilmesi** — aynı bilgiyi aynı istekte iki kez sormanın sebebi yoktu. Koddaki yorumlar da bu ölçümle güncellendi; orada "büyük kazanç" ima eden bir metin bırakmak sonraki okuyucuyu yanıltırdı.

**APP-01 bu noktada kapatılıyor.** Sayfa başına sorgu sayısını düşürmek mantıklı bir yön olmaya devam ediyor, ama tek tek sorgu silerek ölçülebilir kazanç elde edilemiyor. Anlamlı bir fark için ya sorgu sayısı katlarca azalmalı (7 → 3 gibi) ya da ölçüm daha hassas bir yöntemle (aynı senaryonun çok sayıda tekrarı, ortalama) yapılmalı. İkisi de ayrı bir tur.

---

## PERF-01 — 70 FK adayından 4'ü (migration 111)

Karar kodda ve canlı istatistiklerde doğrulanarak verildi.

**Elenen 66 adayın gerekçesi:**

- **~40 tanesi "kim yaptı" kolonu** (`approved_by_profile_id`, `created_by_profile_id`, `author_profile_id`…). Kod aramasında bu kolonlar üzerinden **tek bir filtre bile yok**. Kayıt tutuyorlar, sorgulanmıyorlar.
- **Sıfır ve çok küçük tablolar** (`group_sessions` 0, `topic_contacts` 0, `homework_item_notes` 1, `student_personal_items` 7…). Denetimin kendi notu: *"Sequential scans on very small tables can be optimal."*
- **Zaten bileşik indeksin başında olanlar** — sorgu `indkey[0]` ile yapıldı, çünkü PostgreSQL bileşik indeksi ancak baştan kullanabilir.

**Eklenen 4'ün gerekçesi:**

| İndeks | Gerekçe |
|---|---|
| `homework_items(book_id)`, `(section_id)` | 1.429 satır, 1,6 M indeks taraması. PostgREST gömülü ilişkileri bu FK'lerden çözüyor (`haftam/page.tsx:91-92`, `student/page.tsx:43`) — her Haftam ve Ödevlerim yüklemesi bu yoldan geçiyor |
| `student_curriculum_items(workspace_id)` | 379 satır ama **1.310 sıralı tarama** — listedeki en yüksek oran. `workspace_id` burada sıradan bir FK değil, **RLS'in süzdüğü kolon**: indeks yoksa RLS'in kendisi sıralı tarama demek |
| `curriculum_template_items(workspace_id)` | 952 satır — indekssizler içinde en büyüğü, yine RLS kolonu |

**Bu son söz değil.** Karar 62 günlük bayat istatistiklerle verildi. `docs/production-readiness/perf-02-yeniden-olcum.sql`, sıfırlama sonrası hem bu dördünün gerçekten kullanıldığını hem de yeni aday olup olmadığını yeniden ölçüyor.

---

## Kapanış — denetim listesi vs. gerçekte bulunanlar

### Denetimin P0'ları

| Bulgu | Sonuç |
|---|---|
| SEC-01 (42501) | **Teşhis yanlıştı ve kapandı.** Kaynak eksik GRANT değil; anon'un RLS yardımcısını çağıramamasıydı (108). Önerilen `GRANT` yazılsaydı gerçek bir gerileme olurdu. Bekçi: `tests/anon-endpoint-probe.test.ts` (38 tablo + 11 yardımcı) |
| SEC-02 (SECURITY DEFINER) | **Gerçek ve denetimden kötüydü** (97 değil 155). Kapatıldı: anon yüzeyi **155 → 14** |
| SEC-03 (RLS'siz tablolar) | **Yanlış alarm.** Canlıda RLS'i kapalı tek bir public tablo yok |
| SEC-04 (çapraz kiracı) | **Kapandı.** İki gerçek hesapla 10/10 |
| PERF-02 | **Bayat veri.** Sıfırlama betiği hazır |
| PERF-01 | 70 adaydan 4'ü gerekçelendirildi (111) |
| APP-01 | Ölçüldü; prefetch %7, sorgu silme gürültünün altında |
| OBS-01 / OPS-01 / OPS-02 | `operations.md` |
| LOAD-01 | Koşumcu yazıldı (`scripts/load/`, `npm run load`); staging bekliyor |

### Denetimin göremediği beş kusur

Beşi de bu turda bulundu, beşi de bir testle kapatıldı:

1. **Lisans/deneme kapısı RLS'ten düşmüştü** (092'den beri). Süresi dolmuş kiracı öğrenci, ödev ve finans verisini görebiliyordu; yalnız arayüz engelliyordu. → `107`, `workspace-access-parity.test.ts`
2. **Anon hiçbir sorgu yapamıyordu** (092'den beri). `my_workspace_ids` anon'a kapalıydı, 75 politika onu çağırıyordu; korunmayan tablolarda bile 42501 dönüyordu. Sağlık kontrolü aylarca "degraded"di. → `108`, `tenant-isolation.test.ts`
3. **Hız sınırı iki aydır çalışmıyordu** (068'den beri). `digest` `extensions` şemasında, `search_path` ise `public, pg_temp`. Fail-open tasarım yüzünden sessizdi: giriş, kayıt ve şifre sıfırlamada kaba kuvvet koruması **yoktu**. → `110`, `rate-limit-sql-parity.test.ts`
4. **Şifre URL'ye yazılıyordu.** Kimlik formlarında `method` yoktu; JS hazır olmadan gönderim yapılırsa tarayıcı GET yapıyor ve şifre adres çubuğuna, geçmişe ve Referer başlığına düşüyordu. → `auth-form-method.test.ts`
5. **`098`'de üç fonksiyon `search_path` sağlamlaştırmasını kaybetmişti** (024'ün kurduğu korumayı geri alan tek regresyon). → `109`

Ortak noktaları şu: **hiçbiri ekranı bozmuyordu.** Üçü aylarca sürdü. Denetim de göremezdi — kaynağa bakmıyordu ve bunu kendi sınırında yazıyordu.

Bu yüzden her kusur bir testle kapatıldı ve testlerin gerçekten koruduğu, kusuru kasten geri koyup kırmızıya düştükleri görülerek doğrulandı.

---

## SEC-01 kapandı — 42501 yüzeyi dört tablodan kırk dokuz noktaya çıkarıldı

**Tarih:** 26 Eylül 2026.

Faz 0'ın tek açık kalemi buydu ve açık kalma sebebi teşhis değil **kapsam**dı. 108'in düzeltmesi doğruydu ama doğrulaması o gün **elle ve dört tabloyla** yapılmıştı (`tenant-isolation.test.ts` · "anon · politika değerlendirilebiliyor"). Yani şu soru cevapsızdı: *anon'un dokunabildiği geri kalan yüzeyde 42501 kalmış mı?*

Canlıdan ölçüldü: anon'un `SELECT` hakkı olan **38 tablo** ve RLS politikalarının çağırdığı **11 yardımcı fonksiyon** var. `tests/anon-endpoint-probe.test.ts` bunların hepsini artı üç oturumsuz akış fonksiyonunu (`check_rate_limit`, `get_invitation_by_token`, `log_auth_event`) dolaşıyor. **Sonuç: 56 iddia, 42501 sıfır.**

### Bu dosya `tenant-isolation.test.ts`'in tersi değil, eksik yarısı

42501 iki farklı şeyin adı olabilir ve bu ayrım denetimin yanlış teşhisinin de kaynağıydı:

| Anlam | Örnek | Hangi test ölçer |
|---|---|---|
| Yetkisiz erişim **reddedildi** | anon `billing_orders` okumaya çalışıyor | `tenant-isolation` — 42501 **başarı** |
| Yetkili erişim **değerlendirilemedi** | anon `students` okuyor, politika yardımcısı çağrılamıyor | `anon-endpoint-probe` — 42501 **kusur** |

İkisi birlikte şunu söylüyor: kapalı olması gereken kapalı, **açık olması gereken de çalışıyor.** Denetim yalnız ikinci sütunun sonucunu görmüş ve birinci sütunun çözümünü (`GRANT`) önermişti.

### Olumsuz kontrol: testin dişi olduğunun kanıtı

Dosyadaki iddiaların tamamı "42501 gelmedi" biçiminde ve böyle bir iddia, prob hiç istek atmıyorsa da doğrudur — `cross-tenant.test.ts`'in başlığındaki tuzak. Bu yüzden içine bir **olumsuz kontrol** kondu: anon'a kapalı olan `workspace_access_ok` çağrılıyor ve 42501 **beklenmesi** gerekiyor. Canlıdan ölçülen cevap:

```
POST /rest/v1/rpc/workspace_access_ok   (anon)
{"code":"42501","message":"permission denied for function workspace_access_ok"}
```

Yani kusur geri konduğunda imzanın ne olduğu testin içinde yazılı. O blok kırmızıya düşerse diğer 55 iddia da ölçüm yapmıyor demektir.

### Üç prob'un kurgusu: canlıya yazmadan ölçmek

Yetki denetimi fonksiyon **gövdesinden önce** yapılır. Bu, "çağırabiliyorum" kanıtını gövdeyi tamamlamadan almayı mümkün kılıyor:

| Prob | Kurgu | Canlıya etkisi |
|---|---|---|
| `check_rate_limit` (geçersiz eylem) | `CASE` bloğu `RAISE EXCEPTION`'a düşer (P0001) | sayaç artmaz |
| `log_auth_event` (geçersiz olay tipi) | `event_type` CHECK'i tutmaz | satır yazılmaz (servis anahtarıyla doğrulandı: `event_type LIKE 'probe%'` → 0) |
| `get_invitation_by_token` (olmayan özet) | salt okunur | yok |

Tek istisna bilinçli: `check_rate_limit` **gerçek** eylemle de çağrılıyor ve `rate_limit_counters`'a prob'a özel kovada (`probe:sec-01`) bir satır yazıyor. Gerekçesi 110'un kusuru — fonksiyon çağrılabiliyor, yetkiler doğru, tablo yerinde, **yalnız gövdesi `digest`'i bulamıyor** (42883) ve fail-open tasarım yüzünden hız sınırı iki ay sessizce kapalı kalıyor. Yalnız yetkiyi yoklayan bir prob o kusuru göremez; gövdenin **sonucunu** okumak gerekiyor. Satır gerçek kullanıcının IP/e-posta kovasına dokunmuyor ve fonksiyonun fırsatçı temizliği bir gün içinde siliyor.

### Bu turda görülen iki şey

**1. `log_auth_event` da fail-open.** Gövdesi `EXCEPTION WHEN OTHERS THEN RAISE WARNING` ile bitiyor (093:111), yani CHECK ihlali dahil her hata yutuluyor ve çağrı başarılı görünüyor. Karar bilinçli ve doğru (denetim kaydı yazılamadı diye giriş engellenmemeli), ama sonucu şu: **bu fonksiyonun içindeki bir arıza dışarıya hiç sinyal vermez** — tam olarak hız sınırının iki ay sessiz kalma biçimi. Uygulama tarafında `reportError` dikişi var (`lib/rate-limit.ts`), burada yok. Bugün bir kusur değil; ama denetim kaydı tutulmadığı hâlde her şeyin yeşil göründüğü bir senaryo mümkün.

**2. Salt okunur rol RLS tablolarını okuyamıyor.** `iz_readonly` ile `auth_events` sorgulandığında dönen cevap `permission denied for function my_workspace_ids` oldu. Beklenen: o rol `anon`/`authenticated` değil, dolayısıyla 108'in `GRANT`'leri onu kapsamıyor. Üretim davranışını etkilemiyor ama **ölçüm aracının sınırı**: tablo içeriği bu bağlantıyla okunamaz. `pg_stat_*` görünümleri RLS'e tabi olmadığı için PERF-02 ölçümü bundan etkilenmiyor.

### Geçmiş tarafı: log

Test bugünü ve yarını kapatıyor; **geçmişi** kapatan şey log. `docs/production-readiness/sec-01-log-sorgusu.md`, Supabase Logs Explorer için üç sorgu taşıyor (uç bazında 401 eğilimi, `sql_state_code` kırılımı, mesaj metni) ve 108'in uygulandığı 24 Eylül'e göre önce/sonra kırıyor. Log saklama penceresi o tarihten kısaysa belge bunu da söylüyor: **"log yok" ile "hata yok" aynı şey değildir.**

---

## Panel çökmesi kapatıldı — 112 ve 113 (27 Eylül 2026)

Bu bölüm bir denetim bulgusunun değil, **yük testinin** ürettiği kusurun kaydı. Dış denetim de PRD de bu yolu "gereksiz bekleme ihtimali" diye işaretlemişti; ölçüm "kesinti" dedi.

### Kusur

40 eşzamanlı kullanıcıda API'nin **%70'i** 5xx döndü ve hata kodu beklenen zaman aşımı değildi:

```
25P02: current transaction is aborted, commands ignored until end of transaction block
```

Zincir: panel sorgusu `authenticated` rolünün `statement_timeout`'unu (8 sn) aşıyor → işlem abort oluyor → pooler o bağlantıyı bir sonraki isteğe veriyor → 25P02 → hata **panelle sınırlı kalmıyor, tüm uçlara yayılıyor.** Kanıt: ilk hata panelde değil kitap ilerleyiş adımında göründü ve 5xx oranı on adımda ~%70'te eşitlendi.

**Ders kapasiteden genel:** tek bir yavaş sorgu, yük altında API'nin tamamını düşürebiliyor.

### İki adımda çözüldü, çünkü ilk adım yetmedi

**112 — fan-out ve `COUNT(DISTINCT)` kaldırıldı.** Eski tanım her aktif atama için o kitabın tüm testlerini satır olarak açıyor, sonra `count(DISTINCT)` ile teke indiriyordu. İki gözlem: `total_tests` atamaya değil **kitaba** bağlı (aynı kitabı 10 öğrenci kullanıyorsa sayım 10 kez yapılıyordu), `completed_tests` ise küçük bir tabloda. İkisi ayrı toplanıp anahtar üzerinden birleştirildi.

**Yetmedi — ve nedenini ölçüm söyledi.** 112 sonrası tablo tersine döndü:

| Kiracı | Aktif atama | RLS'in gösterdiği test | `book_progress` |
|---|---|---|---|
| A | **3** | 20.076 | **770 ms** |
| B | 79 | 28.228 | 160 ms |

3 atamalı kiracı, 79 atamalıdan beş kat yavaş — yani maliyet kiracının kendi verisinden gelmiyor. Doğrudan ölçüldü:

```
A · tüm book_tests sayımı (RLS taraması)   675 ms
A · student_book_progress_view             770 ms   <-- tarama kadar
A · tek kitabın testleri (indeks yolu)      75 ms   <-- ağ tabanı
```

112'nin `WHERE book_id IN (...)` filtresi A'da taramanın **altına inmiyor**: 3 kitabın 75 satırı için 20.076 satır okunup RLS'ten geçiriliyor. Sebep `tests_select` politikasının kütüphane dalı — A'nın gördüğü satırların çoğu oradan geliyor, o dal seçici değil ve satır başına pahalı. B'nin satırları ağırlıkla kendi çalışma alanından, planlayıcı daha iyi bir yol seçiyor.

**Bu, çözümün neden değiştiğini açıklıyor:** davranış veri dağılımına bağlıydı. Bugün bir kiracıda çalışıp yarın başkasında çöken bir düzeltme, düzeltme değildir.

**113 — erişim indekse zorlandı.** `JOIN LATERAL` ile alt sorgu atamayla korele: `bt.book_id = sba.book_id` sabit bir indeks koşulu, yani `idx_tests_book_id` üzerinden yalnız o kitabın satırları okunuyor. Planlayıcının filtreyi indirmesini *ummak* yerine sorgu zaten indirmiş oluyor. Korele alt sorgu burada N+1 değil: alternatif 20-28 bin satırı okuyup atmaktı.

### Sonuç (tek kullanıcı, 8-12 tekrar medyanı)

| Ölçüm | Başlangıç | 112 sonrası | **113 sonrası** | Toplam kazanç |
|---|---|---|---|---|
| A · `student_book_progress_view` | — | 770 ms | **127 ms** | **−84%** |
| A · `teacher_student_overview_view` | — | 896 ms | **252 ms** | **−72%** |
| B · `student_book_progress_view` | 331 ms | 160 ms | **99 ms** | **−70%** |
| B · `teacher_student_overview_view` | 529 ms | 409 ms | **208 ms** | **−61%** |

### Davranış değişmedi — ve bu kanıtlandı

Her iki migration yeni tanımı önce geçici bir view olarak kurup mevcut tanımla **iki yönlü `EXCEPT ALL`** ile karşılaştırıyor; tek satır fark varsa `EXCEPTION` atıp duruyor ve geçiş yapılmıyor. Tek yön yeterli değildi: yeni tanım fazladan satır üretiyorsa tek yönlü karşılaştırma bunu görmez. Boş sonuç üzerinde "fark yok" demek de hiçbir şey kanıtlamayacağı için satır sayısının sıfır olmadığı ayrıca iddia ediliyor. Karşılaştırma `postgres` rolüyle koştuğu için (`rolbypassrls = true`) **tüm kiracıların** satırları üzerinde yapılıyor.

Korunan üç ince davranış: kitabında hiç test satırı olmayan atama görünmüyor (004'ten gelen INNER JOIN semantiği), tamamlamanın testi atamanın kitabına ait olmak zorunda, ve `security_invoker=on` yerinde — kaybı 049'un kapattığı P0 açığını geri getirirdi, o yüzden ayrıca denetleniyor.

### Kapanmayan komşu kalem

`book_tests` **tam taraması** hâlâ pahalı: A'da 589 ms, B'de 366 ms. Panel artık o yola girmiyor ama gerçekten çok satır okuyan ekranlar (kitap haritası) bundan etkilenmeye devam ediyor. Kaynak, `tests_select` politikasının satır başına maliyeti. PRD'nin B13 kaleminde ayrı iş olarak duruyor.

## 114 — kurum filtresi ödev kalemine indi (27 Eylül 2026)

40 eşzamanlı koşuda (112 + 113 sonrası) 5xx = 0 ama panel p50 2.163 ms. B öğretmeninin panel sorgusu SQL Editor'de, öğretmen kimliğiyle ve RLS dahil açıklandı (`scripts/teshis-panel-plani.sql`). Geciken ve onay bekleyen alt sorguları `homework_items`'ı yalnız duruma göre tarıyordu; başka kiracının 4 satırı politikanın öğrenci/veli dalını kurduruyordu (SubPlan 58: 24,4 ms, SubPlan 52: 23,8 ms). Maliyet veritabanındaki kiracı sayısıyla büyüyordu.

114 birleşime `hi.workspace_id = hb.workspace_id` ekledi (veri koşulu ve iki yönlü `EXCEPT ALL` eşdeğerliği migration içinde doğrulandı).

| Ölçüm | 114 öncesi | 114 sonrası |
|---|---|---|
| B · panel planı (Execution / Planning) | 117 / 31 ms | **70 / 20 ms** |
| B · `teacher_student_operation_view` (REST, kurum filtreli, p50) | 260 ms | **149 ms** |
| B · `teacher_student_overview_view` (REST, kurum filtreli, p50) | 258 ms | **142 ms** |
| A · `teacher_student_operation_view` (REST, kurum filtreli, p50) | 116 ms | 109 ms |

REST ölçümlerinde ağ tabanı ~70 ms. Kalan maliyet: `my_workspace_ids` her politika kullanımında yeniden hesaplanıyor (~20 kez × ~1,5 ms) ve 20 ms planlama.

## 115 — my_workspace_ids plpgsql ve ROWS 3 (27 Eylül 2026)

`my_workspace_ids` panel planında ~20 kez çalışıyordu; her çağrı 3 satır için ~1,5 ms ve satır tahmini 1000. 115 fonksiyonu aynı gövdeyle plpgsql'e çevirdi (plan oturum boyunca saklanıyor) ve `ROWS 3` verdi. Migration eski/yeni tanımı her gerçek kullanıcı ve üç rol kümesi için karşılaştırdı. Sonrasında canlı RLS testleri (`tenant-isolation`, `cross-tenant`, `anon-endpoint-probe`) 112/112 yeşil.

| Ölçüm | 114 öncesi | 114 sonrası | **115 sonrası** |
|---|---|---|---|
| B · panel planı (Execution / Planning) | 117 / 31 ms | 70 / 20 ms | **52 / 18 ms** |
| B · `my_workspace_ids` çağrı başına | ~1,5 ms | ~1,5 ms | **~0,7 ms** |
| B · `teacher_student_operation_view` (REST, p50) | 260 ms | 149 ms | **119 ms** |
| B · `teacher_student_overview_view` (REST, p50) | 258 ms | 142 ms | **118 ms** |
| A · `teacher_student_operation_view` (REST, p50) | 116 ms | 109 ms | **87 ms** |

Satır tahmini düzelince planlayıcı iki alt sorguda Memoize'lu iç içe döngü seçti (812 satırda 791 önbellek isabeti). REST ölçümlerinde ağ tabanı ~70 ms: B'de veritabanı payı ~190 ms'den ~50 ms'ye indi.
