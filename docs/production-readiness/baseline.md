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
