import io

p = 'components/shared/book-page-map.tsx'
s = io.open(p, encoding='utf-8', newline='').read()

OLD = """  // R7-03: alt bölüm kullanılan kaynaklarda basılı aralık; kullanılmayanda null.
  const testRange = formatTestRange(section.testStart, section.testEnd)"""

NEW = """  // R7-03: alt bölüm kullanılan kaynaklarda basılı aralık; kullanılmayanda null.
  const testRange = formatTestRange(section.testStart, section.testEnd)

  // R7-03 REVİZE: sayfa ile takip edilen kaynaklarda test aralığı YALNIZ
  // BİLGİDİR ve Kapsam sütununda "sf. 1-22 · Test 1-6" olarak gösterilir.
  // Meta satırında AYRICA göstermek aynı bilgiyi iki yere koymak olurdu.
  //
  // Test kitaplarında hiçbir şey değişmiyor: aralık meta satırında kalır,
  // Kapsam sütunu sayfa kitabına özgüdür.
  const isPageBook = book.trackingMode === 'page'
  const metaTestRange = isPageBook ? null : testRange"""

if OLD not in s:
    raise SystemExit('BLOK 1 BULUNAMADI')
s = s.replace(OLD, NEW)

OLD2 = "  const scope = sectionScopeLabel(section)"
NEW2 = """  const scope = isPageBook
    ? formatPageAndTestRange(
        section.pageStart,
        section.pageEnd,
        section.testStart,
        section.testEnd
      )
    : sectionScopeLabel(section)"""

if OLD2 not in s:
    raise SystemExit('BLOK 2 BULUNAMADI')
s = s.replace(OLD2, NEW2)

# Meta satırında testRange -> metaTestRange
OLD3 = """          {(section.partTitle ||
            section.groupLabel ||
            section.themeLabel ||
            testRange ||
            outOfScope) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[
                section.partTitle,
                testRange,"""
NEW3 = """          {(section.partTitle ||
            section.groupLabel ||
            section.themeLabel ||
            metaTestRange ||
            outOfScope) && (
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {[
                section.partTitle,
                metaTestRange,"""

if OLD3 not in s:
    raise SystemExit('BLOK 3 BULUNAMADI')
s = s.replace(OLD3, NEW3)

# import
if 'formatPageAndTestRange' not in s.split('export')[0]:
    s = s.replace(
        "import { formatTestRange } from '@/lib/book-structure'",
        "import { formatTestRange, formatPageAndTestRange } from '@/lib/book-structure'",
    )

io.open(p, 'w', encoding='utf-8', newline='').write(s)
print('book-page-map guncellendi')
