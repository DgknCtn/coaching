# SEC-01 — 42501'lerin kaynağını loglardan doğrula

**Ne için:** Faz 0'ın tek açık kalemi. `baseline.md` §3 teşhisi düzeltti (sebep eksik GRANT değil, `my_workspace_ids`'in anon'a kapalı olmasıydı → `108`), ama **108'den sonra 42501'in gerçekten bittiği** log tarafında doğrulanmadı.

**Nasıl çalışır:** Supabase Dashboard → **Logs → Logs Explorer**. Aşağıdaki sorgular elle yapıştırılır; çıktı `baseline.md`'ye eklenir. Salt okunur bağlantı log'lara erişemez, bu yüzden bu adım elle.

**Kırılma noktası:** `108` ve `110` **24 Eylül 2026**'da uygulandı. Sorgular bu tarihe göre "önce / sonra" kırıyor. Beklenen: sonra = **0**.

---

## Neden durum koduna değil, hata koduna bakılıyor

42501 PostgREST gövdesinde döner; HTTP tarafında `401` olarak görünür. Yalnız 401 sayılırsa süresi dolmuş JWT'ler, yanlış anahtarlar ve gerçek yetki kusurları aynı kefeye girer — denetimin ilk yanlış teşhisi tam olarak bu karıştırmadan doğdu.

`edge_logs` gövdeyi taşımaz, yalnız durum kodunu ve yolu taşır. Bu yüzden iki ayrı kanıt gerekiyor:

| Kanıt | Kaynak | Ne söyler |
|---|---|---|
| Uç bazında 401 eğilimi | `edge_logs` | 42501'in **hangi yoldan** geldiği ve 108 sonrası düşüp düşmediği |
| Hata kodunun kendisi | `postgres_logs` | Kodun gerçekten `42501` olduğu ve **hangi fonksiyon/tabloda** |

İkisi birlikte okunmazsa "401 düştü" ifadesi, oturum davranışı değiştiği için de doğru olabilir.

---

## 1. Uç bazında 401 — 108 öncesi / sonrası

```sql
-- Logs Explorer · kaynak: edge_logs
select
  date_trunc('day', timestamp) as gun,
  request.path as yol,
  count(*) as adet
from edge_logs
  cross join unnest(metadata) as m
  cross join unnest(m.request) as request
  cross join unnest(m.response) as response
where response.status_code = 401
  and request.path like '/rest/v1/%'
group by gun, yol
order by gun desc, adet desc
limit 100;
```

**Okuma:** 24 Eylül'den **sonraki** günlerde `/rest/v1/...` yollarında 401 kalmamalı. Kalıyorsa yol adı doğrudan suçluyu gösterir; `baseline.md` §3'ün "oturum kaybının ele alınışı" hipotezi o uçta sınanır.

**Tuzak:** `/auth/v1/token` altındaki 401'ler bu kalemin konusu DEĞİL — onlar yanlış şifre demektir, normaldir. Filtre bu yüzden `/rest/v1/%` ile sınırlı.

## 2. Hata kodunun kendisi — 42501 mi, başka bir şey mi

```sql
-- Logs Explorer · kaynak: postgres_logs
select
  date_trunc('day', timestamp) as gun,
  parsed.error_severity as siddet,
  parsed.sql_state_code as kod,
  count(*) as adet
from postgres_logs
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed
where parsed.sql_state_code in ('42501', '42883', 'P0001')
group by gun, siddet, kod
order by gun desc, adet desc
limit 100;
```

Üç kod birlikte isteniyor, çünkü bu turda üçü de bir kusuru ele verdi:

| Kod | Bu depoda ne demekti |
|---|---|
| `42501` | RLS yardımcısı anon'a kapalı — oturumsuz her sorgu patlıyordu (`108`) |
| `42883` | `check_rate_limit` gövdesi `digest`'i bulamıyordu; hız sınırı iki ay sessizce kapalıydı (`110`) |
| `P0001` | Fonksiyonların kendi `RAISE EXCEPTION`'ları — beklenen iş hataları; taban gürültü seviyesi olarak okunur |

## 3. Mesaj metni — hangi nesne

```sql
-- Logs Explorer · kaynak: postgres_logs
select
  timestamp,
  parsed.sql_state_code as kod,
  event_message
from postgres_logs
  cross join unnest(metadata) as m
  cross join unnest(m.parsed) as parsed
where parsed.sql_state_code = '42501'
order by timestamp desc
limit 50;
```

Mesaj `permission denied for function <ad>` ya da `permission denied for table <ad>` biçiminde gelir; kusurun tam yerini söyleyen tek kanıt budur.

---

## Log penceresi yetmezse

Supabase log saklama süresi plana bağlıdır ve 24 Eylül'den öncesi düşmüş olabilir. O durumda bu belge **geçmişi kanıtlayamaz** ve bunu yazmak gerekir — "log yok" ile "hata yok" aynı şey değildir.

Bu yüzden kalemin kalıcı bekçisi log değil, test: `tests/anon-endpoint-probe.test.ts` anon'un SELECT hakkı olan 38 tablonun ve 11 RLS yardımcısının hiçbirinde 42501 dönmediğini her koşuda ölçüyor; olumsuz kontrolü (`workspace_access_ok`) kusurun imzasını canlıdan gösteriyor. Log, geçmişi; test, bugünü ve yarını kapatıyor.
