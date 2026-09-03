import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { FlatCompat } from '@eslint/eslintrc'

// ESLint yapılandırması (Faz 2).
//
// Bu katman bugüne kadar HİÇ kurulmamıştı: config dosyası, script ve CI
// adımı yoktu. 80'den fazla bileşenlik bir kod tabanında
// `react-hooks/exhaustive-deps` ve `@next/next/*` kuralları hiç çalışmadı.
//
// KURAL SEÇİMİ: Next'in önerdiği taban alınıyor, üstüne kural EKLENMİYOR.
// Gerekçe: lint'i ilk kez açarken sıkı kurallar yüzlerce uyarı üretir,
// uyarılar görmezden gelinir ve lint fiilen yine çalışmamış olur. Önce
// taban yeşile alınır; kural sıkılaştırması ayrı ve bilinçli bir adımdır.

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
})

const config = [
  {
    // Üretilmiş ve dış kaynaklı dosyalar denetlenmez.
    ignores: [
      '.next/**',
      'node_modules/**',
      'out/**',
      'build/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'next-env.d.ts',
      // Claude Code'un araç dosyaları; uygulamanın parçası değil
      // ve zaten .gitignore'da.
      '.claude/**',
    ],
  },

  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    rules: {
      // `any` kullanımı Supabase'in iç içe select sonuçlarında bilinçli:
      // istemci tek kaydı da dizi tipinde çözebiliyor ve dönüş şekli
      // sorguya göre değişiyor. Her birine tip yazmak sahte bir kesinlik
      // üretirdi. Hata değil uyarı olsun — sayısı artarsa fark edilsin.
      '@typescript-eslint/no-explicit-any': 'warn',

      // Kullanılmayan değişken gerçek bir kod kokusudur, ama alt çizgiyle
      // başlayan adlar bilinçli olarak atılmış demektir (destructuring'de
      // bir alanı dışarıda bırakmak gibi).
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    // Testlerde kurgu veri ve gevşek tipler normaldir.
    files: ['tests/**/*.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]

export default config
