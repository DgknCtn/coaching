# P9 — Tasarım / Fizibilite Notları

Bu faz kod içermez; P6-P8'de tamamlanan özelliklerin ardından değerlendirilen üç fikrin tasarım ve fizibilite özetidir.

## 1. WhatsApp Entegrasyonu

**Amaç:** Tek yönlü otomatik bildirim (ödev atandı, onaylandı) + öğretmene onay bekleyen ödev hatırlatması.

**Önerilen sağlayıcı: Meta WhatsApp Business Cloud API.**
- Resmi API, mesaj başına Twilio'nun eklediği ek ücret katmanı yok.
- wa.me linki gerçek otomasyon sağlamaz (öğretmenin manuel tıklayıp mesaj göndermesi gerekir) — bildirim otomasyonu için uygun değil.
- Twilio, aynı Meta onay sürecine ek bir ücretli katman ekliyor — doğrudan Meta API'yi kullanmak daha ucuz ve daha az bağımlılık.

**Ön koşul (kod ile aşılamaz):** Meta, ilk temas mesajları için önceden onaylı şablon (template) zorunlu kılıyor. Öğretmenin Meta Business Manager'da 2-3 şablonu (örn. "yeni ödev atandı", "ödevin onaylandı") önceden onaylatması gerekiyor — bu dışsal, manuel bir süreç.

**Telefon numarası durumu:** `students.phone` ve veli profili (`parent_student_links` → `profiles.phone`) zaten mevcut, ancak `lib/validation.ts`'teki `studentSchema.phone` serbest metin (`z.string().max(30)`) — E.164 formatı (`+90...`) zorunlu değil. Gerçek gönderim öncesi bu alanın normalize/zorunlu hale getirilmesi gerekir.

**Tasarım (uygulanacaksa):**
- `lib/whatsapp.ts` — `lib/observability.ts` deseninde tek gönderim fonksiyonu:
  ```ts
  sendWhatsAppTemplateMessage(to: string, templateName: string, params: string[])
  ```
- Sunucu-only env değişkenleri: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` (`.env.example`'a eklenir, `NEXT_PUBLIC_` prefiksi yok).
- Tetikleyici noktalar: `create_homework_batch` sonrası ("yeni ödev atandı"), `approve_homework_item` sonrası ("ödevin onaylandı").
- Hatırlatmalar için: mevcut altyapıda cron/queue yok — Vercel Cron + `app/api/cron/whatsapp-reminders/route.ts` (günlük, `pending_approval` süresi geçmiş ödevleri tarar) en uygun yaklaşım.
- Kimlik bilgileri: erişim tokenı DB'de saklanmamalı, Vercel env değişkeni olarak tutulmalı. Çoklu workspace desteği gerekirse bu ayrı bir gizli-bilgi yönetimi tasarımı gerektirir (şimdilik tek-kullanıcılı varsayım geçerli).

## 2. TickTick Entegrasyonu

TickTick'in bir Open API'si (OAuth2, görev/proje CRUD) var, ancak genel-erişilebilir webhook/push mekanizması yok ve dokümantasyonu Google Calendar gibi olgun API'lere kıyasla daha zayıf.

**Öneri:** Düşük öncelik / keşif aşamasında bırakılsın. "Takvimi kopyalama" ihtiyacı için iki alternatif değerlendirilebilir:
- **.ics dışa aktarımı** — sıfır API entegrasyonu, TickTick dahil her takvim uygulamasıyla çalışır.
- **Google Calendar API** — daha olgun, iyi dokümante, webhook/push destekli — "planı takvime kopyala" hedefine TickTick'ten daha iyi hizmet edebilir.

Şimdilik uygulama kapsamı dışında.

## 3. Ödeme / Kasa / Abonelik Yönetimi

Şu an sistemde hiç ödeme kodu yok. Gelecekte bir faz (P10+) olarak ele alınmak üzere taslak şema:

```sql
CREATE TABLE public.student_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  student_id     UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount         NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
  currency       TEXT NOT NULL DEFAULT 'TRY',
  due_date       DATE,
  paid_date      DATE,
  status         TEXT NOT NULL CHECK (status IN ('pending','paid','overdue','cancelled')) DEFAULT 'pending',
  payment_method TEXT,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Mevcut `workspace_id` + RLS deseni (`003_rls_policies.sql`) takip edilerek eşleşen politikalar eklenir; basit bir liste+özet sayfası `app/(dashboard)/teacher/payments/page.tsx` (toplam alacak, geciken sayısı, öğrenci bazlı döküm) düşünülebilir.

**Bu fazda uygulanmadı** — gelecekteki bir "P10 ile devam edelim" isteğinde başlangıç noktası olarak burada tutuluyor.
