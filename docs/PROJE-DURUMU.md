# MK Adisyon Web — Proje durumu (2026-11-06)

Next.js 16 + Supabase çok kiracılı restoran adisyon sistemi. Test aşamasında, gerçek müşteri yok.
Veritabanı migration'ları 0001–0042 canlıda uygulandı (0039–0042 sahibi tarafından SQL Editor'dan).

## Ürün kuralları (kesinleşmiş)

- **QR:** Yalnızca menü görüntüleme ve garson çağırma. Müşteri siparişi yok.
- **Fiyatlar KDV dahil.** Servis bedeli yok.
- **İndirim/promosyon:** Yalnızca kasada, ödeme sırasında (`order_adjustments`). Nakit/karttan ayrı, değiştirilemez, sipariş tutarı korunur. Sahip ve yetkili yönetici raporlarda denetleyebilir.
- **İade:** Özellik kaldırıldı; geçmiş iadeler raporlarda görünür.
- **Davet sistemi yok.** Personel hesabını açar, sonra işletme kurar veya işletme adı + katılım koduyla talep gönderir. Yönetici onaylayıp rol ve şube belirler. Kod denemeleri hız sınırlı, kod yenilenebilir, bekleyen kullanıcı veri görmez (`/bekleme`).
- **Yetkiler:** Şube yöneticisi başka şubelerin personelini değiştiremez. Ek yetkiler arayüz, zod ve veritabanında aynı 8 kod. Paket kullanıcı sınırı veritabanında zorlanır. Rol bazlı okuma kısıtları (garson/mutfak/kasiyer).
- **Şubeler:** Sahip pasif şubeyi yeniden açabilir. Salt-okunur modda şube ve kasa tabloları da korunur.
- **Abonelik/deneme:** Bitiş gününün 23:59:59'una kadar (Europe/Istanbul) çalışır; ek süre yok.
- **Raporlar:** Brüt, indirim, promosyon, iade, net, nakit, kart ayrı; CSV aynı. Kasa geçmişi sayfalı, sessiz kesme yok.
- **Dayanıklılık:** Realtime kopunca yeniden okuma, yenilemeler birleştirilir; ödeme ve kasa hareketlerinde idempotency anahtarı.
- **Güvenlik:** CSP, güvenilir site URL'i (`NEXT_PUBLIC_SITE_URL`), finans okuma politikaları, rol kilitleri, anon yetki kilidi (0035–0038).

## Migration'lar

| No | İçerik |
|---|---|
| 0035–0038 | Finans okuma, rol kilidi, davet sertleştirme (artık kaldırıldı), anon yetkileri |
| 0039 | Kasada indirim/promosyon; iade, QR sipariş, servis bedeli kaldırıldı |
| 0040 | Katılma talepleri; davetler kaldırıldı; kullanıcı sınırı |
| 0041 | Rol bazlı okuma, salt-okunur tetikleyiciler, `set_branch_active` |
| 0042 | Abonelik bitişi İstanbul gün sonu |

Eski migration'lara dokunulmaz; değişiklik yeni numarayla eklenir. Her SQL değişikliğinden sonra `pnpm db:check-sql` ve `pnpm db:smoke`.

## Doğrulama sonuçları

vitest 151/151, smoke 406, lint hatasız, typecheck temiz, `next build` başarılı.
pgTAP (gerçek PG17): finance_read 58/58, role_management 54/54, product_rules_0039_0042 109/109, anon_privilege 47/48 (kalan 1 test ortamı kaynaklı: pgTAP `public` şemasında).
E2E (Playwright) çalıştırılmadı.

## Bilinen açık noktalar

- Garsonun `void_order_item` ile ikram işaretlemesi duruyor (kaldırılması istenmedi).
- Eski `supabase/tests/hosted_*_smoke.sql` dosyaları eski modele göre; kaldırılan fonksiyonları çağırıyorlarsa çalışmaz.
- İndirim denetim tablosunu `reports.read` yetkisi olan herkes görüyor; yalnızca sahip/yetkili yönetici olacak şekilde sıkılaştırılabilir.
- Katılım kodunu yalnızca şirket düzeyi yönetici görür; şube yöneticisi talepleri onaylayabilir ama kodu göremez.
- `tenant_isolation.test.sql` yerel ortamda doğrulanamadı.
- `supabase/staging/` yerel hazırlama betikleri, commit dışı.

## Ertelenenler (donanım/hesap bilgisi gerekir)

Yazarkasa/e-arşiv, sessiz termal yazdırma, stok-reçete, paket servis entegrasyonları, çevrimdışı sipariş kuyruğu, abonelik ödemesi. Ayrıntı: `product-gap-analysis.md`.

## Çalışma kuralları

Canlı veritabanına SQL, commit, push ve deploy yalnızca sahibin onayıyla. Migration'ları sahibi SQL Editor'dan çalıştırır, sırayla.
