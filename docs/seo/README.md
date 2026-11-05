# SEO notları

Canonical adres: `https://www.adisyonweb.com` (apex alan adı Vercel'de www'ye yönlenir). Adres `src/lib/site.ts` içindeki `siteUrl` değerinden gelir; `NEXT_PUBLIC_SITE_URL` tanımlıysa onu kullanır, bu yüzden Vercel'de ya boş bırakın ya da www adresini yazın.

## Nerede ne var

| Konu | Dosya |
| --- | --- |
| Başlık/açıklama/canonical/OG yardımcısı, JSON-LD üreticileri | `src/lib/seo.ts` |
| JSON-LD bileşeni | `src/components/seo/json-ld.tsx` |
| Çözüm sayfası içerikleri | `src/lib/solution-pages.ts` |
| Çözüm sayfası şablonu | `src/components/marketing/solution-page-view.tsx` |
| Üst menü (mobil dahil) / altbilgi | `src/components/marketing/site-header.tsx`, `site-footer.tsx` |
| robots / sitemap | `src/app/robots.ts`, `src/app/sitemap.ts` |
| noindex | `(auth)/layout.tsx`, workspace `layout.tsx`, `mk-admin`, `offline`, `qr/[token]`, `next.config.ts` (X-Robots-Tag) |

## Yeni herkese açık sayfa eklerken

1. Sayfada `pageMetadata({ title, description, path })` kullanın (canonical + OG + Twitter).
2. Sitemap'e `src/app/sitemap.ts` içinden ekleyin; `lastModified` içerik değiştiğinde elle güncellenir (build tarihi kullanılmaz).
3. İçerik değişince ilgili `updatedAt` değerini güncelleyin.
4. Özel/oturumlu ekranlara `noIndexMetadata` verin.

## Kurallar

- Sahte puan, yorum, müşteri sayısı, telefon/adres/sosyal medya hesabı eklemeyin.
- JSON-LD yalnızca görünür içerikle uyumlu olmalı. Fiyat (`offers`) bilerek eklenmedi: lansman fiyatı + normal fiyat tek bir Offer ile doğru anlatılamıyor.
- Giriş/kayıt sayfaları robots.txt ile engellenmez; Google'ın `noindex` etiketini görebilmesi gerekir.

## Search Console (kullanıcı tarafından yapılacak)

1. Alan adı veya URL öneki mülkü oluşturun.
2. Google'ın verdiği doğrulama kodunu ekleyin (kod yoksa etiket eklenmedi; `metadata.verification.google` ile eklenebilir).
3. `https://www.adisyonweb.com/sitemap.xml` adresini gönderin.
4. Ana sayfa ve beş çözüm sayfasında URL Denetimi yapıp indeksleme isteyin.

## Sonraki üç ay için içerik önerileri

- Ay 1: "Masa açılışından hesap kapanışına bir sipariş" rehberi; "QR menü nasıl hazırlanır" adım adım yazısı.
- Ay 2: "Kafe için menü ve masa düzeni nasıl kurulur", "Hesap bölme ve karma ödeme nasıl yapılır" rehberleri.
- Ay 3: "Çok şubeli işletmede yetki ve rapor yönetimi"; gerçek müşteri izniyle yayımlanan vaka çalışması.
