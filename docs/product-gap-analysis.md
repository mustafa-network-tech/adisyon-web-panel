# Ürün karşılaştırması: adisyon yazılımında olması gerekenler ve eksiklerimiz

Tarih: 2026-11-05. Kaynaklar satıcı siteleri ve blogları olduğu için bağımsız bir sıralama değil, ortak beklenti listesidir. Fiyat, entegrasyon listesi ve yasal yükümlülükler (ÖKC / e-arşiv) satın almadan önce üreticiden ve GİB duyurularından teyit edilmelidir.

## Pazarda ortak beklenen çekirdek
Masa ve sipariş yönetimi, mutfak ekranı/fişi, kasa ve ödeme, raporlama, rol/yetki, stok-reçete-maliyet, paket servis ve online platform entegrasyonu, yazarkasa/e-fatura entegrasyonu, çevrimdışı çalışma, silinen/iptal edilen siparişlerin yöneticiye bildirilmesi, çalışan bazlı performans raporu.

## Bizde olanlar
| Alan | Durum |
|---|---|
| Masa/salon, taşıma, birleştirme | Var |
| Sipariş, mutfak istasyonları, doğrudan servis ürünleri | Var |
| Mutfak ekranı (canlı), süre uyarısı | Var |
| QR menü, QR sipariş, garson çağırma, hesap isteme | Var |
| Kasa vardiyası, nakit/kart, parçalı ve ürün bazlı ödeme, iade | Var |
| İndirim (adisyon/ürün), gerekçeli, yetkili | Var |
| Fiş çıktısı (tarayıcı, 58/80 mm) | Var |
| Satış raporları, CSV | Var |
| Rol/yetki, şube kapsamı, denetim kaydı | Var |
| Personel kartı, vardiya, puantaj, maaş/prim | Var |
| Çok kiracılı, çok şubeli, PWA | Var |

## Eksikler (öncelik sırasıyla)

### A. Dış bilgi gerektirmeyen, yazılım içinde kapatılabilir
1. **Ürün seçenekleri:** porsiyon/boy, ekstra, "çıkar", zorunlu seçim grupları. Şu an yalnızca serbest not var.
2. **Gönderilmiş kalemi iptal/ikram:** gerekçeli, yetkili, yöneticiye bildirimli. Şu an gönderilen miktarın altına inilemiyor.
3. **Hizmet bedeli (servis ücreti):** ayarda alanı var, toplama yansımıyor. Bahşiş girişi de yok.
4. **Ürün tükendi (86) hızlı anahtarı:** menüyü açmadan satıştan kaldırma.
5. **Menü toplu içe aktarma (Excel/CSV)** ve örnek menü ile hızlı kurulum.
6. **Müşteri kaydı ve adres** (paket servisin ön koşulu), isteğe bağlı sadakat.
7. **Gün sonu özeti** ekranı (kasa kapanışı + satış özeti tek sayfa).
8. **Dışa aktarma/yedek:** menü, ürün, rapor verilerini indirme.

### B. Donanım veya hesap bilgisi gerektirir (ertelendi)
1. Yeni nesil ÖKC / yazarkasa ve e-arşiv/e-fatura entegrasyonu.
2. Termal yazıcıya sessiz, otomatik yazdırma (yazıcı köprüsü).
3. Stok, reçete, maliyet, fire.
4. Paket servis ve online platformlar (Yemeksepeti, Getir, Trendyol Yemek), kurye takibi.
5. Çevrimdışı sipariş kuyruğu.
6. Banka POS / yemek kartı entegrasyonu, online ödeme.
7. Abonelik ödemesi.

### C. Sonra düşünülebilir
Rezervasyon, çoklu dil, mobil mağaza uygulaması, yazıcı/mutfak ekranı donanım paketi.

## Satış açısından not
Rakipler öne çıkarken en çok "yazarkasa/e-fatura entegrasyonu", "paket servis entegrasyonu" ve "stok-reçete"yi vurguluyor. Bunlar B grubunda. Landing sayfasında bugün güvenle anlatabileceğimiz güçlü yanlar: QR menü + garson çağırma, canlı mutfak ekranı, çok şube ve rol/yetki, personel vardiya/puantaj, denetim kaydı.

## Alan adı kontrolü (RDAP / DNS)
- adisyonweb.com: kayıtlı görünmüyor (Verisign RDAP 404, DNS yok)
- adisyonyazilim.com: kayıtlı görünmüyor
- `.com.tr` müsaitliği bu yöntemle kontrol edilemedi (TRABIS'ten bakılmalı).
