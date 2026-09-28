// ÖĞRENCİ DETAYI — HANGİ SEKME HANGİ VERİYİ İSTER (B13, 28 Eylül 2026)
//
// Sayfa (app/(dashboard)/teacher/students/[studentId]/page.tsx) önceden
// hangi sekme açık olursa olsun TÜM sekmelerin verisini çekiyordu: Veliler
// sekmesi 3 sorguya ihtiyaç duyarken ~31 sorgu gidiyordu, atanabilir kitap
// listesi yalnız Kitaplar'da kullanıldığı hâlde her açılışta ayrı bir
// gidiş-dönüş olarak çalışıyordu. Sayfa senaryosu yük testinde bu sayfa
// ~18 sorguyu aynı anda gönderdiği için basit sorgular bile kuyrukta
// 250-600 ms bekliyordu.
//
// Eşleme BURADA ve TEK YERDE: sayfanın içine dağılmış `if (tab === ...)`
// koşulları, bir sekmeye yeni bir blok eklendiğinde verisinin unutulması
// demekti. Her alanın yanında onu okuyan blok yazılı; tests/
// student-detail-needs.test.ts sekme başına beklenen kümeyi sabitler.
//
// Bir sekme yeni veri kullanmaya başlarsa: buraya ekle, testi güncelle.
// Unutulursa o blok sessizce boş görünür — test bunu yakalamaz, bu yüzden
// yeni bir okuma eklerken önce bu dosyaya bakılmalı.

/** null = Genel Bakış (varsayılan). */
export type StudentDetailTab = 'kitaplar' | 'odevler' | 'veliler' | 'not' | null

export interface StudentDetailNeeds {
  /** Ödev listesi — Genel Bakış (Son Akademik İz) + Ödevler. */
  homeworkBatches: boolean
  /** Onay bekleyen kalemler (iç içe, ağır) — yalnız Ödevler. */
  pendingApprovalItems: boolean
  /** Veli bağları + davetler — yalnız Veliler. */
  parentsAndInvites: boolean
  /** Haftalık sayaçlar, onay/geciken sayıları, son teslim — Genel Bakış. */
  overviewCounters: boolean
  /** "Bu Hafta" satırı — Genel Bakış + Ödevler (etkin akış kimliği). */
  weekOperation: boolean
  /** Akademik notlar + gün notları — Genel Bakış (sinyal, iz) + Not. */
  notes: boolean
  /** Müfredat akışı, konu temas/açık iş/istisna — Genel Bakış (akış kartı, havuz). */
  topicSignals: boolean
  /** Kitap haritası (loadBookMap) — Genel Bakış (Kaynak Planı) + Kitaplar. */
  bookMap: boolean
  /** Öğrenci ve alan kapsamları + atanabilir kitaplar — yalnız Kitaplar. */
  inventory: boolean
}

export function studentDetailNeeds(tab: StudentDetailTab): StudentDetailNeeds {
  const overview = tab === null
  return {
    homeworkBatches: overview || tab === 'odevler',
    pendingApprovalItems: tab === 'odevler',
    parentsAndInvites: tab === 'veliler',
    overviewCounters: overview,
    weekOperation: overview || tab === 'odevler',
    notes: overview || tab === 'not',
    topicSignals: overview,
    bookMap: overview || tab === 'kitaplar',
    inventory: tab === 'kitaplar',
  }
}
