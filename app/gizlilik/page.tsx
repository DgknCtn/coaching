import type { Metadata } from 'next'
import { LegalShell, LegalHeading } from '@/components/marketing/legal-shell'
import { BRAND } from '@/lib/brand'

// KVKK aydınlatma ve gizlilik metni — TASLAK.
//
// UYARI (kod incelemesi için): bu metin ürünün gerçekte ne yaptığını
// anlatır ve teknik olarak doğrudur, ama HUKUKİ İNCELEMEDEN GEÇMEMİŞTİR.
// Yayına çıkmadan önce bir hukukçu tarafından gözden geçirilmeli; özellikle
// veri sorumlusu kimliği, saklama süreleri ve yurt dışı aktarım maddesi
// şirket yapısına göre değişir.
//
// Reşit olmayan öğrenci verisi işlendiği için bu metin ticari bir
// gerekliliktir, teknik bir detay değil: kurumsal müşterinin ilk
// soracağı şeylerden biri.

export const metadata: Metadata = {
  title: `Gizlilik ve KVKK Aydınlatma Metni · ${BRAND.name}`,
  description:
    'Hangi verileri neden işlediğimiz, ne kadar sakladığımız ve haklarınızı nasıl kullanacağınız.',
}

export default function PrivacyPage() {
  return (
    <LegalShell title="Gizlilik ve KVKK Aydınlatma Metni" updatedAt="4 Eylül 2026">
      <p>
        Bu metin, {BRAND.name} platformunda kişisel verilerin nasıl işlendiğini açıklar.
        Platform; öğretmenlerin, öğrencilerin ve velilerin akademik takip verilerini
        işler. <strong className="text-foreground">Öğrenci verilerinin bir kısmı reşit
        olmayan kişilere aittir</strong> ve bu veriler özel bir dikkatle işlenir.
      </p>

      <LegalHeading>Veri sorumlusu</LegalHeading>
      <p>
        Platformu kullanan eğitim kurumu ya da öğretmen, kendi öğrencilerine ait veriler
        bakımından <strong className="text-foreground">veri sorumlusudur</strong>.
        {' '}{BRAND.name}, bu verileri kurumun talimatı doğrultusunda barındıran ve işleyen
        <strong className="text-foreground"> veri işleyendir</strong>. Öğrenci ve veli
        talepleri öncelikle ilgili öğretmene ya da kuruma yöneltilmelidir.
      </p>

      <LegalHeading>İşlenen veriler</LegalHeading>
      <p>Platform yalnızca akademik takip için gereken verileri işler:</p>
      <ul className="ml-5 list-disc space-y-2">
        <li>
          <strong className="text-foreground">Kimlik ve iletişim:</strong> ad soyad,
          e-posta adresi, isteğe bağlı telefon numarası.
        </li>
        <li>
          <strong className="text-foreground">Eğitim verisi:</strong> sınıf düzeyi, sınav
          türü, atanan kaynaklar, verilen ödevler, tamamlanan çalışmalar, ilerleme
          yüzdeleri, müfredat planı ve öğretmenin girdiği akademik notlar.
        </li>
        <li>
          <strong className="text-foreground">Kullanım kayıtları:</strong> oturum
          bilgileri ve hesap güvenliği için tutulan teknik kayıtlar; öğretmenin yaptığı
          geri alınamaz işlemlerin denetim kaydı (kim, ne zaman, hangi işlem).
        </li>
      </ul>
      <p>
        Özel nitelikli kişisel veri (sağlık, inanç, biyometrik veri vb.){' '}
        <strong className="text-foreground">işlenmez</strong> ve platformda bu verilerin
        girileceği bir alan bulunmaz.
      </p>

      <LegalHeading>İşleme amacı ve hukuki sebep</LegalHeading>
      <p>
        Veriler, öğretmen ile öğrenci arasındaki eğitim hizmetinin yürütülmesi amacıyla,
        sözleşmenin ifası ve meşru menfaat hukuki sebeplerine dayanarak işlenir.
        Pazarlama amaçlı profilleme yapılmaz; verileriniz reklam için kullanılmaz ve
        üçüncü taraflara satılmaz.
      </p>

      <LegalHeading>Kimler görebilir</LegalHeading>
      <p>
        Erişim, veritabanı düzeyinde satır bazlı güvenlik kurallarıyla sınırlanır —
        yani yetkisiz erişim yalnız arayüzde değil, veri katmanında da engellenir.
      </p>
      <ul className="ml-5 list-disc space-y-2">
        <li>Öğretmen yalnız kendi çalışma alanındaki öğrencileri görür.</li>
        <li>Öğrenci yalnız kendi verisini görür; başka bir öğrenciyi göremez.</li>
        <li>
          Veli yalnız bağlı olduğu öğrencinin verisini görür ve hiçbir şeyi değiştiremez.
          Öğretmenin akademik notları veliye gösterilmez.
        </li>
      </ul>

      <LegalHeading>Saklama süresi</LegalHeading>
      <p>
        Veriler, hesap aktif olduğu sürece saklanır. Hesap kapatıldığında ya da silme
        talebi geldiğinde kişisel veriler{' '}
        <strong className="text-foreground">30 gün içinde</strong> silinir. Denetim
        kayıtları, hukuki yükümlülükler nedeniyle kişisel veri içermeyecek şekilde
        anonimleştirilerek saklanabilir.
      </p>

      <LegalHeading>Haklarınız</LegalHeading>
      <p>
        KVKK kapsamında; verilerinize erişme, düzeltilmesini isteme, silinmesini isteme,
        işlemeye itiraz etme ve verilerinizin bir kopyasını talep etme haklarına
        sahipsiniz. Bu haklarınızı kullanmak için önce öğretmeninize ya da kurumunuza,
        gerekirse{' '}
        <a
          href={`mailto:${BRAND.contactEmail}`}
          className="text-primary underline underline-offset-4"
        >
          {BRAND.contactEmail}
        </a>{' '}
        adresine başvurabilirsiniz. Talepler en geç 30 gün içinde yanıtlanır.
      </p>

      <LegalHeading>Çerezler</LegalHeading>
      <p>
        Platform yalnızca çalışması için gereken çerezleri kullanır: oturum çerezi,
        aktif çalışma alanı tercihi ve arayüz tercihleri (tema, menü durumu). Reklam ya
        da üçüncü taraf takip çerezi kullanılmaz.
      </p>

      <LegalHeading>Güvenlik</LegalHeading>
      <p>
        Veriler şifreli bağlantı üzerinden iletilir ve erişim yetkileri veritabanı
        düzeyinde uygulanır. Şifreler geri döndürülemez biçimde saklanır; kimse
        şifrenizi göremez. Bir güvenlik ihlali durumunda etkilenen kullanıcılar ve
        yetkili kurum mevzuatın öngördüğü süre içinde bilgilendirilir.
      </p>
    </LegalShell>
  )
}
