import { BRAND, contactMailto } from '@/lib/brand'
import { REFUND_DAYS, TRIAL_DAYS, TRIAL_STUDENT_LIMIT } from '@/lib/plans'
import { MAX_MONTHS, MAX_SELF_SERVICE_STUDENTS } from '@/lib/billing/pricing'
import { FaqList } from './faq-list'
import { SectionHeading } from './section-heading'

// SSS — satın alma kararının önündeki gerçek soruları karşılar.
// Cevaplar ürünün BUGÜN yaptığı işe göre yazıldı; söz verilen ama
// yapılmayan bir şey yok.

export interface Faq {
  q: string
  a: string
  /**
   * Yalnız /ozellikler'de (Feature Showcase PRD §7.3 Section 17).
   * Anasayfa listesi ve onun FAQPage verisi DEĞİŞMEZ: arama motoruna
   * sayfada görünmeyen soru bildirilmez.
   */
  featuresOnly?: boolean
}

export const FAQS: Faq[] = [
  // KART SORUSU EN BAŞTA — bilinçli. Kayıtta kart istemek, satın alma
  // kararının önündeki en büyük yeni engel. Listenin dibine koymak,
  // itirazı cevaplamak değil saklamak olurdu.
  {
    q: 'Denemek için kredi kartı gerekiyor mu?',
    a: `Hayır. ${TRIAL_DAYS} günlük deneme için kart bilgisi istemiyoruz ve deneme sonunda kendiliğinden hiçbir tahsilat yapılmaz. Lisans almaya karar verirseniz ödemeyi siz başlatırsınız.`,
  },
  {
    q: 'Öğrenci ve velilerim de ücret ödeyecek mi?',
    a: 'Hayır. Yalnızca öğretmen tarafı ücretlendirilir. Öğrenci ve veli hesapları sınırsız ve ücretsizdir; onlara verdiğiniz kullanıcı adı ve PIN ile girerler.',
  },
  {
    q: 'Öğrencimin e-posta adresi yok, nasıl girecek?',
    a: "E-posta gerekmez. Öğrenci sayfasından öğrenciye ve veliye birer kullanıcı adı ve 6 haneli PIN oluşturursunuz; hazır mesajla WhatsApp'tan iletirsiniz. Herkes aynı giriş ekranından girer, rol seçmez.",
  },
  {
    q: 'PIN unutulursa ne oluyor?',
    a: `Öğrenci ya da veli giriş ekranında "PIN'imi unuttum" deyip kullanıcı adını yazar; isteği panelinizde görürsünüz. Tek tıkla yeni PIN üretirsiniz, eskisi o anda geçersiz olur. Yanlış PIN denemeleri birkaç denemeden sonra hesabı geçici olarak kilitler.`,
  },
  {
    q: 'Kitapları tek tek elle mi gireceğim?',
    a: 'Hayır. Kitabın içindekiler listesini kopyalayıp yapıştırırsınız; bölümleri ve alt bölümleri kendisi çıkarır. Kural tek cümle: satırın sonunda test aralığı varsa alt bölüm, yoksa bölüm başlığıdır. Eklemeden önce "kaç bölüm, kaç test açılacak" özetini görürsünüz. Kitap havuzunuzu istediğiniz zaman CSV veya JSON olarak dışa aktarıp yedekleyebilirsiniz.',
  },
  {
    q: 'Sayfa bazlı kitapları nasıl takip ediyor?',
    a: 'Bölümü "Üçgenler, sf. 1-56" gibi tanımlarsınız. Ödevde birden fazla aralık verebilirsiniz (sf. 1-36 ve 42-48). Sistem benzersiz sayfa üzerinden ilerlemeyi hesaplar, kalan aralıkları kendisi çıkarır ve aynı sayfa iki kez sayılmaz.',
  },
  {
    q: 'Ödevi öğrenciye nasıl iletiyorum?',
    a: 'Planı yayınladığınızda öğrencinin panelinde görünür. Ayrıca "Ödev metnini kopyala" ile test, sayfa ve video görevlerini tek bir mesaja sıkıştırıp WhatsApp\'tan gönderebilirsiniz.',
  },
  {
    q: 'Öğrenci "yaptım" derse otomatik tamamlanıyor mu?',
    a: 'Hayır. Öğrenci tamamladığını işaretler, ilerleme ancak siz onayladıktan sonra resmî kayda geçer. Yüzdeler yalnızca öğretmen onaylı çalışmalardan hesaplanır.',
  },
  {
    q: 'Verilerim güvende mi?',
    a: 'Her öğretmenin çalışma alanı veritabanı düzeyinde birbirinden yalıtılmıştır; kimse başkasının verisini göremez. Öğrenci yalnız kendi verisini, veli yalnız bağlı olduğu çocuğunun verisini görür.',
  },
  {
    q: 'Lisansımdaki öğrenci sayısını aşarsam ne olur?',
    a: 'Mevcut verileriniz etkilenmez; yalnızca yeni öğrenci ekleme durur. Arşivlediğiniz öğrenciler sınıra dahil değildir, yani mezun olan öğrenciyi arşivleyerek yer açabilirsiniz. Dilediğiniz zaman daha yüksek öğrenci sayısıyla yeni bir lisans alarak sınırı yükseltebilirsiniz; kalan süreniz kaybolmaz.',
  },
  {
    q: 'Deneme süresi bitince ne oluyor?',
    a: `${TRIAL_DAYS} gün sonunda lisans almazsanız çalışma alanınız erişime kapanır — ama verileriniz SİLİNMEZ. Lisans aldığınız anda aynı verilerle kaldığınız yerden devam edersiniz.`,
  },
  {
    q: 'Kart bilgilerim sizde saklanıyor mu?',
    a: 'Hayır. Kart bilgileriniz ödeme kuruluşunun güvenli sayfasına girilir; bizim sistemimize hiçbir aşamada iletilmez ve saklanmaz. Otomatik yenileme olmadığı için kartınızı saklamamıza gerek de yok.',
  },
  {
    q: 'Aboneliği iptal etmem gerekir mi? Param geri döner mi?',
    a: `Lisans otomatik yenilenmediği için iptal edilecek yinelenen bir ödeme yok — yeni bir lisans almadığınız sürece sizden başka tahsilat yapılmaz. Ayrıca her lisans alımı için ${REFUND_DAYS} gün koşulsuz iade hakkınız var.`,
  },
  {
    q: 'Ders ücretlerini ve ödemeleri de takip edebilir miyim?',
    a: 'Evet. Görüşmeleri ve dersleri kaydedersiniz; her öğrencinin cari hesabında borç ve ödemeler görünür, giderlerinizi de aynı yerde tutarsınız. Veli ödeme yaptığını kendi ekranından tek dokunuşla bildirebilir.',
  },
  {
    q: 'Google Takvim’imi bağlayabilir miyim?',
    a: 'Evet. Ayarlar’dan kendi Google Takvim’inizi bağlarsınız; öğrenciyle eşleşen dersler Ders & Görüşmeler’e kendiliğinden gelir, Meet bağlantısıyla birlikte. Bağlantı yalnız okur: takviminize hiçbir şey yazılmaz. Takvimde iptal edilen ders silinmez, sonucunu siz seçersiniz.',
  },
  {
    q: 'WhatsApp’tan otomatik mesaj atıyor mu?',
    a: 'Hayır, bilinçli olarak. Ödev, ders hatırlatması ve ödev yoklaması için hazır metinler üretilir; tek dokunuşla kopyalar ya da WhatsApp’ta açıp kendiniz gönderirsiniz. Öğrencinizle yazışma sizin numaranızda ve sizin kontrolünüzde kalır.',
  },
  {
    q: 'Bir ödevi vermek ne kadar sürüyor?',
    a: 'Tek ekranda: kitabı seçin, sayfa aralığını (ör. 2-10) yazıp “Ödeve ekle” deyin ve yayımlayın. Kitap henüz atanmamışsa aynı ekrandan atanır; son teslim öğrencinin sıradaki dersine göre kendiliğinden gelir.',
  },
  {
    q: 'Hesabımı ve verilerimi silebilir miyim?',
    a: 'Evet. Ayarlar > Veri bölümünden çalışma alanınızın ya da tek bir öğrencinin silinmesini talep edebilirsiniz. Kitap havuzunuzu dilediğiniz zaman CSV veya JSON olarak dışa aktarabilirsiniz.',
  },
  {
    q: 'Öğrenciler telefondan kullanabilir mi?',
    a: 'Evet. Arayüz telefon için tasarlandı ve uygulamayı ana ekrana ekleyebilirsiniz; tarayıcı çubuğu olmadan, uygulama gibi açılır.',
  },
  // --- /ozellikler (PRD listesi) --------------------------------------------
  {
    q: 'İZ hangi öğretmenler için?',
    a: 'Birden fazla öğrenciyle çalışan özel ders öğretmenleri ve eğitim koçları için. Ödev, kitap ilerlemesi, ders ve ödeme takibini tek yerde toplamak isteyen herkes kullanabilir.',
    featuresOnly: true,
  },
  {
    q: 'Öğrenci hesabı nasıl oluşturulur?',
    a: 'Öğrenciler sayfasından öğrenciyi eklersiniz; ardından öğrenciye ve veliye kullanıcı adı ve 6 haneli PIN oluşturup hazır mesajla iletirsiniz. E-posta gerekmez.',
    featuresOnly: true,
  },
  {
    q: 'Ödevler nasıl takip edilir?',
    a: 'Ödevi kitap haritasından seçip haftalık plana eklersiniz. Öğrenci kendi ekranında görür ve tamamladığını bildirir; siz onaylarsınız. Geciken işler hem sizin panelinizde hem velinin ekranında görünür.',
    featuresOnly: true,
  },
  {
    q: 'Öğretmen onayı neden gerekli?',
    a: 'Öğrencinin “yaptım” demesi bir beyandır. İlerlemeye yalnız sizin onayladığınız iş sayılır; böylece yüzdeler ve velinin gördüğü bilgi gerçeği gösterir. Gerekirse işi notla iade edebilirsiniz.',
    featuresOnly: true,
  },
  {
    q: 'Kitap takibi nasıl çalışır?',
    a: 'Her kitap bölüm ve test ya da sayfa olarak tutulur. Kitap Haritası her birimin durumunu renkle gösterir: verilmedi, ödevde, onay bekliyor, tamamlandı, süresi geçti. İlerleme oranı onaylı birimlerden hesaplanır.',
    featuresOnly: true,
  },
  {
    q: 'Veli kendi ekranından ne görür?',
    a: 'Öğretmen onaylı çalışmaları ve teslim edilenleri ayrı ayrı, geciken işleri ve kitap ilerlemesini görür. Birden fazla çocuğu varsa hepsini izler; ödeme yaptığını bildirebilir. Hiçbir şeyi değiştiremez ve akademik notlarınızı görmez.',
    featuresOnly: true,
  },
  {
    q: 'Ücretsiz deneme nasıl çalışır?',
    a: `Kayıt olduğunuzda çalışma alanınız açılır ve ${TRIAL_DAYS} gün boyunca tüm özellikleri ${TRIAL_STUDENT_LIMIT} öğrenciye kadar kullanırsınız. Kart istenmez; süre bitince kendiliğinden tahsilat yapılmaz ve verileriniz silinmez.`,
    featuresOnly: true,
  },
  {
    q: 'Lisans süresi ve öğrenci sınırı nasıl belirlenir?',
    a: `Lisansı öğrenci sayısına ve süreye (en fazla ${MAX_MONTHS} ay) göre siz seçersiniz; fiyat aşağıdaki hesaplayıcıda anında görünür. ${MAX_SELF_SERVICE_STUDENTS} öğrencinin üzeri için bize yazın. Arşivlediğiniz öğrenciler sınıra dahil değildir.`,
    featuresOnly: true,
  },
]

/** Anasayfa listesi — FAQPage yapılandırılmış verisi de bunu kullanır. */
export const HOME_FAQS: Faq[] = FAQS.filter(f => !f.featuresOnly)

export function FaqSection({
  items = HOME_FAQS,
  trackPage,
}: {
  items?: Faq[]
  /** Verilirse soru açılışı ölçülür (PRD §14). */
  trackPage?: 'features' | 'home'
} = {}) {
  return (
    <section id="sss" className="scroll-mt-16 px-6 py-20 md:py-28">
      <div className="mx-auto max-w-3xl">
        <SectionHeading eyebrow="SSS" title="Sık sorulanlar" />

        <FaqList items={items} trackPage={trackPage} />

        <p className="mt-8 text-center text-sm text-muted-foreground">
          Başka bir sorunuz mu var?{' '}
          <a
            href={contactMailto(`${BRAND.name} hakkında soru`)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            Bize yazın
          </a>
          .
        </p>
      </div>
    </section>
  )
}
