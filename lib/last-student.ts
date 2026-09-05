/**
 * SON ÇALIŞILAN ÖĞRENCİ — çerez adı ve doğrulama.
 *
 * SORUN: sol menüdeki "Müfredat Akışı", "Kaynak Planı" gibi bağlantılar
 * öğrenci listesine gidiyor (`?ekran=...`), çünkü o ekranlar URL'de bir
 * öğrenci kimliği taşımak zorunda. Ama öğretmen genellikle TEK bir
 * öğrenci üzerinde arka arkaya çalışıyor: aynı öğrenciyi listeden
 * seçmek, her ekran değişiminde tekrarlanan bir vergiye dönüşüyordu.
 *
 * ÇÖZÜM: en son hangi öğrencinin ekranında çalışıldığı bir çerezde
 * tutulur; `?ekran=` ile gelindiğinde liste atlanır.
 *
 * NEDEN ÇEREZ, localStorage DEĞİL: karar SUNUCUDA veriliyor —
 * `students/page.tsx` render edilmeden önce yönlendirme yapılabilsin
 * diye. localStorage okunana kadar liste zaten çizilmiş olurdu ve
 * kullanıcı bir ekran sıçraması görürdü. (lib/sidebar-prefs.ts ve
 * lib/active-workspace.ts aynı gerekçeyle çerez kullanıyor.)
 *
 * NEDEN httpOnly DEĞİL: değeri yazan taraf tarayıcı (öğrenci ekranı
 * açıldığında). İçeriği bir TERCİH, bir yetki değil — çerezdeki
 * kimliğin gerçekten bu çalışma alanının öğrencisi olduğu her okumada
 * doğrulanır (bkz. resolveLastStudentId), doğrulanamazsa liste
 * gösterilir. RLS de bağımsız olarak aynı sınırı çiziyor.
 */

export const LAST_STUDENT_COOKIE = 'last_student'

/** Bir yıl: tercih, oturumdan bağımsız olarak kalıcı olmalı. */
export const LAST_STUDENT_MAX_AGE_SECONDS = 60 * 60 * 24 * 365

/** Rotalardaki `[studentId]` ile aynı biçim: çıplak UUID. */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Çerezdeki kimliği, kullanıcının GERÇEKTEN erişebildiği öğrenci
 * listesine karşı doğrular.
 *
 * Doğrulama şart: kullanıcı çalışma alanı değiştirmiş, öğrenci
 * arşivlenmiş ya da çerez elle kurcalanmış olabilir. Doğrulanmamış bir
 * kimlikle yönlendirmek, kullanıcıyı erişemediği bir sayfaya atıp orada
 * bir hata ekranıyla karşılaştırmak olurdu.
 */
export function resolveLastStudentId(
  raw: string | undefined,
  availableStudentIds: readonly string[]
): string | null {
  if (!raw || !UUID.test(raw)) return null
  return availableStudentIds.includes(raw) ? raw : null
}
