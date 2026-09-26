# coaching — veritabanı yedekleri

Bu depoda **şifreli** PostgreSQL dökümleri duruyor. Her gece 03:00'te (TRT) `DgknCtn/coaching` deposundaki **Gece yedeği** işi tarafından oluşturulur.

- Yedekler **Releases** bölümünde: `yedek-YYYY-MM-DD`
- İçerik: `public` + `auth` + `storage` şemaları, yetkiler (GRANT) dahil
- Şifreleme: GPG simetrik, AES-256
- Saklama: **30 gün** — daha eski release'ler otomatik silinir

## Geri yükleme

Adım adım komutlar uygulama deposunda: `docs/production-readiness/yedek-geri-yukleme.md`

Kısaca:

```bash
gh release download yedek-2026-09-27 --repo DgknCtn/coaching-yedek
gpg --decrypt --output yedek.dump yedek-2026-09-27.dump.gpg
pg_restore --dbname="<AYRI-BIR-PROJENIN-URL>" --no-owner --clean --if-exists yedek.dump
```

**Üretimin üzerine asla geri yüklenmez** — ayrı bir Supabase projesine yüklenip doğrulanır.

## Uyarı

Dosyaları açmak için `YEDEK_GPG_PAROLA` gerekiyor. **O parola kaybolursa buradaki hiçbir yedek okunamaz.** Parola yöneticisinde bir kopyası olmalı — yedeğin kendisinden daha kritik, çünkü yedek yeniden alınabilir, parola alınamaz.

## Bu dosya elle oluşturulmadı

`Gece yedeği` işi, depoyu boş bulduğunda bu dosyayı kendisi oluşturur (release bir commit'e tutunmak zorunda, boş depoda oluşturulamıyor). Kaynağı: `scripts/yedek/depo-okubeni.md`.
