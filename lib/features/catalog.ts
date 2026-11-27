// İZ ÖZELLİK KATALOĞU — /ozellikler, anasayfa önizlemesi ve yol haritası
// için TEK KAYNAK (PRD "Feature Showcase & Product Expansion", §11).
//
// KURAL (PRD Risk 2): herkese açık sayfalar yalnız `available` (ve açıkça
// etiketlenen `beta`) özellikleri gösterir. `planned` özellikler burada
// durur ama hiçbir tanıtım sayfasında "var" gibi görünmez; bir özellik
// geliştirilince durumu `available` yapılır ve sayfa kendiliğinden günceller.
//
// İÇERİK KURALI: her `available` maddesi bugün çalışan bir ürün davranışına
// karşılık gelir. Ekip/çok öğretmen özelliği ürün desteklemediği için yok
// (PRD Persona 3 "ASSUMED" notu).

export type FeatureStatus = 'available' | 'beta' | 'planned' | 'archived'

/** Ekran bileşeni anahtarı — components/marketing/features/feature-mock.tsx eşler. */
export type MockKey =
  | 'student-list'
  | 'homework'
  | 'approval'
  | 'import'
  | 'student-week'
  | 'parent'
  | 'lessons'
  | 'ledger'
  | 'whatsapp'

export type CategoryIcon =
  | 'users'
  | 'clipboard'
  | 'book'
  | 'smartphone'
  | 'parent'
  | 'calendar'
  | 'wallet'
  | 'message'

export interface FeatureCategory {
  id: string
  /** Sayfa içi anchor: /ozellikler#<slug>. */
  slug: string
  name: string
  /** Kategori kartındaki kısa açıklama. */
  description: string
  /** Detay bölümünün fayda başlığı (PRD §7.3). */
  headline: string
  /** Detay bölümünün açıklama paragrafı. */
  lead: string
  icon: CategoryIcon
  /** Detay bölümünde gösterilen ekranlar, sırayla. */
  mocks: MockKey[]
  /** Bölüm CTA etiketi (PRD'deki "… Keşfet" metinleri). */
  cta: string
  sortOrder: number
}

export interface Feature {
  id: string
  slug: string
  title: string
  category: string
  status: FeatureStatus
  shortDescription: string
  /** Fayda cümlesi — "özellik değil fayda" (PRD ilke 1). */
  benefit: string
  bullets: string[]
  /** Anasayfa önizlemesinde gösterilir (PRD §8.2: 5–7 kart). */
  featured: boolean
  sortOrder: number
  related?: string[]
}

export const CATEGORIES: FeatureCategory[] = [
  {
    id: 'student-management',
    slug: 'ogrenci-yonetimi',
    name: 'Öğrenci Yönetimi',
    description: 'Tüm öğrencileriniz, durumları ve takip gerektirenler tek panelde.',
    headline: 'Her öğrencinizin durumunu tek bakışta görün.',
    lead: 'Öğrenci listesi, haftalık çalışmalar, geciken görevler ve takip gerektiren durumlar aynı panelde.',
    icon: 'users',
    mocks: ['student-list'],
    cta: 'Öğrenci Takibini Keşfet',
    sortOrder: 1,
  },
  {
    id: 'assignment-management',
    slug: 'odev-ve-haftalik-plan',
    name: 'Ödev ve Haftalık Plan',
    description: 'Ödevi tek ekranda verin; öğrenci teslim etsin, siz onaylayın.',
    headline: 'Ödev verin. Öğrenci teslim etsin. Siz onaylayın.',
    lead:
      'Haftalık çalışma planını oluşturun. Öğrenciniz telefonundan görevlerini takip etsin ve tamamladığını bildirsin. Gerçek ilerleme öğretmen onayıyla kayda geçsin.',
    icon: 'clipboard',
    mocks: ['homework', 'approval'],
    cta: 'Ödev Akışını Gör',
    sortOrder: 2,
  },
  {
    id: 'book-tracking',
    slug: 'kitap-takibi',
    name: 'Kitap ve İlerleme Takibi',
    description: 'Bölüm, test ve sayfa düzeyinde kitap ilerlemesi.',
    headline: 'Kitap takibini defterden çıkarın.',
    lead:
      'Kitapların bölüm, test ve sayfa ilerlemelerini öğrenci bazında takip edin. Kitap içeriklerini tek tek girmek zorunda değilsiniz.',
    icon: 'book',
    mocks: ['homework', 'import'],
    cta: 'Kitap Haritasını Gör',
    sortOrder: 3,
  },
  {
    id: 'student-portal',
    slug: 'ogrenci-paneli',
    name: 'Öğrenci Paneli',
    description: 'Öğrenci haftasını, görevlerini ve kitaplarını telefonunda görür.',
    headline: 'Öğrenciniz ne yapacağını kendi ekranında görsün.',
    lead: 'Haftalık görevlerini, günlük planını, teslimlerini ve kitap ilerlemesini telefonundan takip etsin.',
    icon: 'smartphone',
    mocks: ['student-week'],
    cta: 'Öğrenci Ekranını Gör',
    sortOrder: 4,
  },
  {
    id: 'parent-portal',
    slug: 'veli-paneli',
    name: 'Veli Paneli',
    description: 'Veli, öğretmenin onayladığı ilerlemeyi kendi ekranından izler.',
    headline: 'Veliler sormadan öğrenci durumunu görebilsin.',
    lead: 'Öğretmen tarafından onaylanan çalışmalar, geciken görevler ve kitap ilerlemesi velinin kendi ekranında.',
    icon: 'parent',
    mocks: ['parent'],
    cta: 'Veli Panelini Keşfet',
    sortOrder: 5,
  },
  {
    id: 'lessons-meetings',
    slug: 'ders-ve-gorusme',
    name: 'Görüşme ve Ders Takibi',
    description: 'Dersler, görüşmeler ve Google Takvim tek akışta.',
    headline: 'Öğrencinizle yaptığınız dersler ve görüşmeler kaybolmasın.',
    lead: 'Derslerinizi ve görüşmelerinizi öğrenci bazında kayıt altında tutun; takviminizdeki dersler kendiliğinden gelsin.',
    icon: 'calendar',
    mocks: ['lessons'],
    cta: 'Ders Takibini Gör',
    sortOrder: 6,
  },
  {
    id: 'finance',
    slug: 'finans',
    name: 'Finans ve Cari Hesap',
    description: 'Öğrenci başına ders, ödeme, borç ve gider kaydı.',
    headline: 'Öğrenci bazında ödeme ve cari hesabınızı takip edin.',
    lead: 'Öğrenci bazında borç, ödeme ve gider kayıtlarını aynı sistemde tutun.',
    icon: 'wallet',
    mocks: ['ledger'],
    cta: 'Finans Takibini Gör',
    sortOrder: 7,
  },
  {
    id: 'whatsapp',
    slug: 'whatsapp',
    name: 'WhatsApp İş Akışı',
    description: 'Ödev ve hatırlatma mesajları hazır; tek dokunuşla gönderin.',
    headline: 'Ödev mesajını saniyeler içinde hazırlayın.',
    lead:
      'İZ’de hazırladığınız ödevleri düzenli bir mesaj hâline getirin ve WhatsApp üzerinden öğrencinize iletin. Mesajı siz gönderirsiniz; otomatik gönderim yoktur.',
    icon: 'message',
    mocks: ['whatsapp'],
    cta: 'Mesaj Akışını Gör',
    sortOrder: 8,
  },
]

export const FEATURES: Feature[] = [
  // --- Öğrenci Yönetimi ---
  {
    id: 'student-status',
    slug: 'ogrenci-durumu',
    title: 'Öğrenci durumu ve nedeni',
    category: 'student-management',
    status: 'available',
    shortDescription: 'Yolunda, Takip Et, Geride, Müdahale Gerekli — gerekçesiyle.',
    benefit: 'Kimin takibe ihtiyacı olduğunu tek tek kontrol etmeden görürsünüz.',
    bullets: [
      'Durum kurala dayalı ve açıklanabilir: geciken iş, düşen tempo, gelmeyen bildirim.',
      'Bu haftanın teslim oranı ve öğrenci bazında ilerleme.',
      'Takip gerektiren öğrenciler listenin başında.',
    ],
    featured: false,
    sortOrder: 1,
  },
  {
    id: 'student-login',
    slug: 'e-postasiz-giris',
    title: 'E-postasız öğrenci ve veli girişi',
    category: 'student-management',
    status: 'available',
    shortDescription: 'Kullanıcı adı + 6 haneli PIN; hazır mesajla iletilir.',
    benefit: 'E-postası olmayan öğrenci de dakikalar içinde sisteme girer.',
    bullets: [
      'Öğrenciye ve veliye kullanıcı adı ve PIN oluşturursunuz.',
      'Giriş bilgisi hazır WhatsApp mesajıyla iletilir.',
      'PIN unutulursa öğrenci giriş ekranından size bildirir.',
    ],
    featured: false,
    sortOrder: 2,
  },
  // --- Ödev ve Haftalık Plan ---
  {
    id: 'weekly-flow',
    slug: 'haftalik-akis',
    title: 'Haftalık Akış',
    category: 'assignment-management',
    status: 'available',
    shortDescription: 'Haftanın yükü, tempo ve tek son teslim.',
    benefit: 'Ödevi tek ekranda verir, haftanın yükünü ve son teslimi bir arada görürsünüz.',
    bullets: [
      'Kitabı seçin, sayfa aralığını yazın (ör. 2-10), “Ödeve ekle” deyin, yayımlayın.',
      'Son teslim öğrencinin sıradaki dersine göre kendiliğinden gelir.',
      'Kapanmamış hafta yayımlarken sorulur; ödev yanlış haftaya bağlanmaz.',
    ],
    featured: true,
    sortOrder: 1,
  },
  {
    id: 'teacher-approval',
    slug: 'ogretmen-onayi',
    title: 'Öğretmen onayı',
    category: 'assignment-management',
    status: 'available',
    shortDescription: 'Öğrenci beyanı değil, doğrulanmış ilerleme.',
    benefit: 'İlerleme yüzdeleri gerçeği gösterir; veli de aynı doğrulanmış veriyi görür.',
    bullets: [
      'Öğrenci tamamladığını bildirir; işiniz onaylamak.',
      'Yalnız onaylanan iş ilerleme hesabına girer.',
      'Gerekirse iade edin, öğrenci notunuzu görür.',
    ],
    featured: false,
    sortOrder: 2,
  },
  // --- Kitap ---
  {
    id: 'book-map',
    slug: 'kitap-haritasi',
    title: 'Kitap Haritası',
    category: 'book-tracking',
    status: 'available',
    shortDescription: 'Test ve sayfa düzeyinde, renklerle ilerleme.',
    benefit: 'Hangi testin yapıldığını, beklediğini ve geciktiğini tek bakışta görürsünüz.',
    bullets: [
      'Test bazlı ve sayfa bazlı kitaplar.',
      'Öğrenci bazında kitap ilerleme oranı.',
      'Ödev oluştururken içerik doğrudan haritadan seçilir.',
    ],
    featured: true,
    sortOrder: 1,
  },
  {
    id: 'bulk-import',
    slug: 'kitap-icerigi-aktarma',
    title: 'Hazır kütüphane ve içindekileri yapıştırma',
    category: 'book-tracking',
    status: 'available',
    shortDescription: 'İçindekiler listesini yapıştırın; bölümler ve testler çıksın.',
    benefit: 'Kitap içeriklerini tek tek girmek zorunda kalmazsınız.',
    bullets: [
      'Yaygın soru bankaları hazır kütüphanede.',
      'İçindekiler metninden bölüm, alt bölüm ve test aralıkları çıkarılır; eklemeden önce özet görürsünüz.',
      'Kitap havuzunuzu CSV ya da JSON olarak dışa aktarabilirsiniz.',
    ],
    featured: false,
    sortOrder: 2,
  },
  // --- Öğrenci Paneli ---
  {
    id: 'haftam',
    slug: 'haftam',
    title: 'Haftam',
    category: 'student-portal',
    status: 'available',
    shortDescription: 'Bu haftanın işi, son teslim ve günlük plan.',
    benefit: '“Hocam ne yapacaktım?” sorusu biter.',
    bullets: [
      'İşleri günlere kendisi dağıtır; gün notu ve kişisel ajanda.',
      'Tek dokunuşla teslim; öğretmen notu aynı ekranda.',
      'Telefonda ana ekrana eklenir, uygulama gibi açılır.',
    ],
    featured: true,
    sortOrder: 1,
  },
  // --- Veli ---
  {
    id: 'parent-panel',
    slug: 'veli-ekrani',
    title: 'Veli ekranı',
    category: 'parent-portal',
    status: 'available',
    shortDescription: 'Onaylı çalışmalar, geciken işler, kitap ilerlemesi.',
    benefit: '“Çocuğum nasıl gidiyor?” mesajları azalır.',
    bullets: [
      'Teslim edilen ve öğretmen onaylı çalışmalar ayrı ayrı.',
      'Birden fazla çocuğu olan veli hepsini görür.',
      'Ödeme yaptığını tek dokunuşla bildirir. Veli hiçbir şeyi değiştiremez.',
    ],
    featured: true,
    sortOrder: 1,
  },
  // --- Ders ve görüşme ---
  {
    id: 'lessons',
    slug: 'ders-ve-gorusmeler',
    title: 'Ders & Görüşmeler',
    category: 'lessons-meetings',
    status: 'available',
    shortDescription: 'Her dersin akıbeti kayıtlı: yapıldı, yapılmadı, telafi.',
    benefit: 'Hiçbir ders unutulmaz; öğrencinin ders geçmişi tek yerde.',
    bullets: [
      'Düzenli ders programı ve ek dersler öğrenci bazında.',
      'Saati geçen ders kendiliğinden “Yapıldı” sayılmaz; sonucu siz seçersiniz.',
      'Telafi kararları ve plan değişiklikleri geçmişiyle saklanır.',
    ],
    featured: true,
    sortOrder: 1,
  },
  {
    id: 'google-calendar',
    slug: 'google-takvim',
    title: 'Google Takvim bağlantısı',
    category: 'lessons-meetings',
    status: 'available',
    shortDescription: 'Takvimdeki dersler kendiliğinden gelir; yalnız okur.',
    benefit: 'Dersi bir kez planlarsınız; iki yere yazmazsınız.',
    bullets: [
      'Öğrenciyle eşleşen dersler Meet bağlantısıyla birlikte gelir.',
      'Takvimde taşınan ya da iptal edilen ders silinmez; size sorulur.',
      'İZ takviminize hiçbir şey yazmaz.',
    ],
    featured: false,
    sortOrder: 2,
  },
  // --- Finans ---
  {
    id: 'finance',
    slug: 'cari-hesap',
    title: 'Öğrenci cari hesabı',
    category: 'finance',
    status: 'available',
    shortDescription: 'Dersler, tahsilatlar, bakiye ve giderler.',
    benefit: 'Kim ne kadar ödedi, kimin bakiyesi var — ayrı bir deftere gerek kalmaz.',
    bullets: [
      'Tutar yalnız ders “Yapıldı” işaretlenince yazılır.',
      'Ödemeler, borç ve giderler aynı yerde.',
      'Veli ödeme bildirimini panelinden yapar, siz onaylarsınız.',
    ],
    featured: true,
    sortOrder: 1,
  },
  // --- WhatsApp ---
  {
    id: 'whatsapp-messages',
    slug: 'hazir-mesajlar',
    title: 'Hazır WhatsApp metinleri',
    category: 'whatsapp',
    status: 'available',
    shortDescription: 'Ödev, ders hatırlatması ve ödev yoklaması metinleri.',
    benefit: 'Mesajı yazmakla uğraşmazsınız; yazışma sizin numaranızda kalır.',
    bullets: [
      'Yayımladığınız ödevden düzenli mesaj kendiliğinden oluşur.',
      'Tek dokunuşla kopyalayın ya da WhatsApp’ta açın.',
      'Otomatik gönderim yok: mesajı siz gönderirsiniz.',
    ],
    featured: true,
    sortOrder: 1,
  },

  // --- Faz 2 (28.11.2026) — geliştirildi, artık `available` ---
  {
    id: 'plan-copy',
    slug: 'plani-kopyala',
    title: 'Planı kopyala',
    category: 'assignment-management',
    status: 'available',
    shortDescription: 'Önceki planı tek tıkla yeniden kullanın.',
    benefit: 'Her hafta aynı planı sıfırdan kurmazsınız.',
    bullets: [
      'Önceki planın görevleri taslak olarak gelir.',
      'Kitaplarda aynı miktarın devamı seçilir: geçen hafta Test 4-6 ise bu hafta Test 7-9.',
      'Hiçbir şey kendiliğinden yayımlanmaz; düzenleyip siz yayımlarsınız.',
    ],
    featured: false,
    sortOrder: 3,
  },
  {
    id: 'assignment-templates',
    slug: 'odev-sablonlari',
    title: 'Ödev şablonları',
    category: 'assignment-management',
    status: 'available',
    shortDescription: 'Haftalık rutinleri şablon olarak kaydedin.',
    benefit: '“TYT haftalık rutin” gibi kalıpları her öğrenciye yeniden yazmazsınız.',
    bullets: [
      'Sepetteki görevleri tek tıkla şablon olarak kaydedin.',
      'Şablonu herhangi bir öğrenciye uygulayın; görevler taslak olarak gelir.',
      'Yayın yine sizin onayınızla.',
    ],
    featured: false,
    sortOrder: 4,
  },
  {
    id: 'activity-timeline',
    slug: 'aktivite-zaman-tuneli',
    title: 'Öğrenci zaman tüneli',
    category: 'student-management',
    status: 'available',
    shortDescription: 'Öğrencinin geçmişi tek kronolojide.',
    benefit: 'Birden çok ekran açmadan öğrencinin son 90 gününü görürsünüz.',
    bullets: [
      'Verilen ödevler, teslim ve onaylar, dersler, görüşmeler, ödemeler ve notlar tek akışta.',
      'Kategoriye göre süzün: akademik, dersler, görüşmeler, ödemeler, notlar.',
      'Yalnız kayıtlı olaylar; yorum ya da tahmin yok.',
    ],
    featured: false,
    sortOrder: 3,
  },
  {
    id: 'notes-tags',
    slug: 'notlar-ve-etiketler',
    title: 'Öğrenci notları ve etiketler',
    category: 'student-management',
    status: 'available',
    shortDescription: 'Öğretmene özel not, arama ve etiketler.',
    benefit: 'Öğrencinin bağlamını kaybetmez, etiketle hızla süzersiniz.',
    bullets: [
      'Öğretmene özel notlar; sabitleme ve notlarda arama.',
      'Çalışma alanınıza özel, renkli etiketler (ör. “Tekrar ihtiyacı”).',
      'Öğrenci listesini etikete göre süzün. Öğrenci ve veli etiketleri görmez.',
    ],
    featured: false,
    sortOrder: 4,
  },
  // --- YOL HARİTASI (planned) — herkese açık sayfalarda GÖSTERİLMEZ ---
  { id: 'mock-exams', slug: 'deneme-takibi', title: 'Deneme sınavı takibi', category: 'book-tracking', status: 'planned', shortDescription: 'Deneme sonuçları ve konu analizi.', benefit: 'Zayıf konuları görürsünüz.', bullets: [], featured: false, sortOrder: 90 },
]

/** Herkese açık sayfalarda gösterilebilir mi (PRD Risk 2). */
export function isPublic(f: Feature): boolean {
  return f.status === 'available' || f.status === 'beta'
}

export function publicFeatures(): Feature[] {
  return FEATURES.filter(isPublic).sort((a, b) => a.sortOrder - b.sortOrder)
}

export function featuresOf(categoryId: string): Feature[] {
  return publicFeatures().filter(f => f.category === categoryId)
}

/** Yalnız en az bir herkese açık özelliği olan kategoriler, sıralı. */
export function publicCategories(): FeatureCategory[] {
  return [...CATEGORIES]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter(c => featuresOf(c.id).length > 0)
}

/** Anasayfa önizlemesi (PRD §8.2–8.3: 5–7 kart). */
export function featuredFeatures(): Feature[] {
  const order = new Map(CATEGORIES.map(c => [c.id, c.sortOrder]))
  return publicFeatures()
    .filter(f => f.featured)
    .sort((a, b) => (order.get(a.category) ?? 0) - (order.get(b.category) ?? 0))
}

export function categoryOf(f: Feature): FeatureCategory {
  const c = CATEGORIES.find(x => x.id === f.category)
  if (!c) throw new Error(`Bilinmeyen kategori: ${f.category}`)
  return c
}
