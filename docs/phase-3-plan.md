# MK Adisyon Web — Faz 3 geliştirme planı

## Durum (2026-11-05)

- Faz A–F tamamlandı ve yayına gönderildi (migration 0015–0025).
- Faz G ertelendi: termal yazıcı köprüsü, yazarkasa, stok/reçete, çevrimdışı sipariş kuyruğu, abonelik ödemesi, paket servis entegrasyonları ve yedekleme politikası. Gerekli donanım/hesap bilgileri (yazarkasa markası, yazıcı modeli, ödeme sağlayıcısı) şu an yok; gerektiğinde yeniden planlanacak.
- Her migration değişikliğinden sonra `pnpm db:check-sql` ve `pnpm db:smoke` çalıştırılmalıdır.

Durum: 2026-11-05 itibarıyla onaylanan kararlara göre hazırlandı.

## Onaylanan kararlar

| Konu | Karar |
|---|---|
| Hazırlık yeri | Su/kola gibi ürünler **doğrudan servis**: mutfağa ve fişe gitmez, yalnızca adisyona yazılır. Ayrı bar ekranı yok. |
| Fiş | İlk aşamada **tarayıcı üzerinden** 58/80 mm şablon. Termal yazıcı köprüsü ve yazarkasa sonraya. |
| Vardiya/puantaj | **Plan + yönetici onayı.** Personel giriş/çıkış yapmaz; yönetici planlar, dönem sonunda gerçekleşeni onaylar. |
| Maaş/prim | **Yönetici girişli kayıt.** Otomatik bordro yok; sistem puantajla dönem özeti çıkarır. |
| Görünürlük | Maaş, prim ve puantaj yalnızca **şirket yöneticisi (tenant_admin)** tarafından görülür/yönetilir. |

## Faz A — Sağlamlaştırma
- README değişikliğini commit et.
- `pnpm lint`, `typecheck`, `test`, `test:e2e` çalıştır; sorunları düzelt.
- QR menü, onboarding ve rol kapsamları için e2e testleri.
- Kabul: tüm kontroller yeşil.

## Faz B — Hazırlık yeri (mutfağa gitmeyen ürünler)
Mevcut durum: `submit_order`, `kitchen_station_id` boş ürünü reddeder; 0013 tüm
ürünlere varsayılan "Mutfak" atadı, bu yüzden içecekler de mutfağa düşer.

- Migration: `menu_categories` ve `products` için `fulfillment` alanı
  (`kitchen` | `direct`). Ürün değeri boşsa kategoriden miras alır.
- `order_items` anlık görüntüsüne fulfillment kopyalanır.
- `submit_order`: `direct` kalemler için mutfak bileti oluşturmaz, kalemi
  gönderilmiş sayar. Siparişte yalnızca `direct` kalem varsa bilet oluşmaz.
- Sipariş durumu: yalnızca `direct` kalemli sipariş mutfak beklemeden
  "hazır/servis" akışına geçer.
- 0013'ün atamasını içecek kategorileri için geri alan veri düzeltmesi.
- Katalog ekranında kategori/ürün için "Hazırlık yeri" seçimi.
- Kabul: su+yemek siparişinde mutfak fişinde yalnızca yemek görünür; yalnızca
  su siparişinde mutfak ekranında bilet oluşmaz; adisyon ve ödeme değişmez.

## Faz C — Fiş çıktıları ve yazarkasa hazırlığı
- Mutfak fişi: masa, saat, garson, istasyon, kalemler, notlar.
- Adisyon/hesap fişi: kalemler, KDV oranı kırılımı, toplam, ödeme türü, fiş no.
- Ödeme sonrası kasa fişi.
- Fiş verisi yazıcıdan bağımsız belge modeli olarak üretilir (ileride ESC/POS
  ve yazarkasa aynı modeli kullanır).
- Ürün KDV oranı, ödeme türü ve fiş numarası alanları yazarkasa için
  doğrulanır; marka/model belli olunca ödeme türleri genişletilir.
- Kabul: 80 mm ve 58 mm önizleme/yazdırma doğru; tutarlar siparişle eşleşir.

## Faz D — Personel, vardiya ve rol atama
- Personel kartı: pozisyon, işe giriş tarihi, iletişim, notlar (hassas alanlar
  yalnızca tenant_admin).
- Vardiya planı: şube bazlı haftalık çizelge, vardiya şablonları, personel
  ataması, izin/devamsızlık işareti.
- Personelin ekranında yalnızca kendi vardiyası görünür.
- Rol atama koşulları (kural tablosu, veritabanında zorlanır):
  - Rolü yalnızca kendi seviyesinin altındaki rollere atayabilir.
  - Şube kapsamlı yönetici yalnızca kendi şubesine atama yapar.
  - tenant_admin ataması yalnızca tenant_admin tarafından yapılır.
  - Kullanıcı kendi rolünü yükseltemez; son tenant_admin kaldırılamaz.
  - Her rol değişikliği audit kaydına yazılır.
- Kabul: yetkisiz atama RLS/RPC düzeyinde reddedilir (pgTAP testleri).

## Faz E — Puantaj, maaş ve prim

Görünürlük: puantaj (günlük çalışma süresi) onayı `attendance.manage` yetkisiyle yapılır; varsayılan olarak şirket yöneticisi ve işletme sahibi, müdür ancak şirket yöneticisi ek yetki verirse. Vardiya planlama (`shifts.manage`) müdürde varsayılan kalır. Maaş ve prim tutarları `payroll.manage` yetkisiyle görülür; varsayılan olarak yalnızca şirket yöneticisi ve işletme sahibi, isteğe bağlı olarak müdüre "ek yetki" ile verilebilir. Tutarlar denetim kaydına yazılmaz.
- Dönem sonu puantaj: planlanan vs. onaylanan gün/saat, devamsızlık, fazla mesai.
- Maaş kaydı, kesinti/avans girişi; dönem özeti ve dışa aktarma.
- Prim **zorunlu değil**: istenirse yönetici elle girer (tutar + açıklama). Otomatik prim kuralı (ciro yüzdesi, bahşiş payı) yok.
- Tüm erişim ve değişiklikler audit kaydına yazılır.
- KVKK: kimlik/IBAN gibi alanlar eklenecekse ayrı erişim kaydı ile tutulur.
- Kabul: tenant_admin dışındaki hiçbir rol maaş/prim verisini okuyamaz.

## Faz F — Raporlama ve operasyon
- Günlük ciro, ürün satışı, vardiya (kasa oturumu) raporu, personel bazlı satış.
- İndirim (ürün/adisyon) ve yetkisi.
- Masa taşıma/birleştirme, garson bildirimleri, audit log ekranı.

## Faz G — Genişleme
- Termal yazıcı köprüsü (ESC/POS) ve yazarkasa entegrasyonu.
- Stok/reçete, çevrimdışı sipariş kuyruğu, abonelik ödemesi, paket servis
  entegrasyonları, yedekleme politikası.

## Açık noktalar
- Yazarkasa marka/modeli (Faz G öncesi gerekli).
- Termal yazıcı modeli ve bağlantı türü (USB/ağ).
- Prim: karar verildi, yalnızca isteğe bağlı manuel giriş.
