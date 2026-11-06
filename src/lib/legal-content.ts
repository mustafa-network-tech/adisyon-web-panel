import { company } from "./legal";

export type LegalSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
  table?: { head: string[]; rows: string[][] };
};

export type LegalDocument = {
  slug: string;
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
};

const email = company.email;
const brand = "Adisyon Web";
const owner = company.name;

export const privacyPolicy: LegalDocument = {
  slug: "gizlilik-politikasi",
  title: "Gizlilik Politikası",
  description: `${brand} kişisel verileri nasıl topluyor, kullanıyor ve koruyor: veri türleri, amaçlar, saklama süreleri ve haklarınız.`,
  intro: `Bu politika, ${owner} tarafından sunulan ${brand} restoran yönetim yazılımında (adisyonweb.com ve uygulama) kişisel verilerinizin nasıl işlendiğini açıklar. Kişisel verilerin işlenmesine ilişkin yasal bilgilendirme için KVKK Aydınlatma Metni'ni de okuyun.`,
  sections: [
    {
      id: "kapsam",
      heading: "1. Kapsam ve rollerimiz",
      paragraphs: [
        `${brand}, restoran, kafe ve benzeri işletmelerin masa, sipariş, mutfak, kasa ve personel işlerini yönettiği bulut tabanlı bir yazılımdır.`,
        "Hesap açan işletme yetkilileri ve kullanıcılar için kişisel verilerinizin sorumlusu biziz. İşletmelerin yazılıma girdiği kendi çalışan ve müşteri verileri için ise işletme veri sorumlusudur; biz bu verileri işletme adına, onun talimatlarıyla ve yalnızca hizmeti sunmak için işleyen taraf olarak tutarız.",
      ],
    },
    {
      id: "veriler",
      heading: "2. Hangi verileri topluyoruz?",
      table: {
        head: ["Veri grubu", "Örnekler", "Kaynağı"],
        rows: [
          ["Hesap ve kimlik", "Ad soyad, e-posta adresi, telefon (isteğe bağlı), parola (yalnızca özetlenmiş/şifrelenmiş hâliyle)", "Üyelik ve işletmeye katılma talebi"],
          ["Yetki ve çalışma bilgisi", "Rol, şube atamaları, ek yetkiler, vardiya planı", "İşletme yöneticisi"],
          ["İşletme operasyonu", "Menü, masa, sipariş, ödeme türü ve tutarı, kasa vardiyaları, indirim/iptal kayıtları, raporlar", "İşletme kullanıcıları"],
          ["Personel yönetimi", "Pozisyon, işe giriş tarihi, çalışma durumu, puantaj, maaş/prim kayıtları, acil durum kişisi ve yönetici notları", "İşletme yöneticisi"],
          ["QR menü ziyaretçileri", "Sipariş içeriği, masa bilgisi, garson çağırma/hesap isteme kaydı. Ad, telefon veya ödeme kartı bilgisi istenmez.", "Ziyaretçinin kendisi"],
          ["Teknik ve güvenlik", "Oturum bilgisi, işlem/denetim kayıtları, tarayıcı ve cihaz türü, hata kayıtları", "Otomatik"],
        ],
      },
      paragraphs: [
        "Kart ödemeleri bu yazılımda kart numarası, son kullanma tarihi veya CVV tutularak alınmaz; yazılım yalnızca ödemenin nakit veya kart olduğunu ve tutarını kaydeder.",
      ],
    },
    {
      id: "amaclar",
      heading: "3. Verileri hangi amaçlarla kullanıyoruz?",
      items: [
        "Hesabınızı oluşturmak, kimliğinizi doğrulamak ve hizmeti sunmak",
        "İşletmenizin sipariş, mutfak, kasa, rapor ve personel işlevlerini çalıştırmak",
        "Yetkilendirme yapmak ve işletmeler arasındaki veri ayrımını sağlamak",
        "Güvenliği sağlamak, kötüye kullanımı ve hataları tespit etmek, denetim kaydı tutmak",
        "Destek taleplerinizi yanıtlamak ve abonelik işlemlerini yürütmek",
        "Yasal yükümlülüklerimizi yerine getirmek",
      ],
    },
    {
      id: "paylasim",
      heading: "4. Verileriniz kimlerle paylaşılır?",
      paragraphs: [
        "Kişisel verilerinizi satmayız ve reklam amacıyla üçüncü taraflarla paylaşmayız.",
        "Hizmeti sunabilmek için altyapı sağlayıcılarımızdan yararlanırız: veritabanı ve kimlik doğrulama hizmeti (Supabase) ile web barındırma hizmeti (Vercel). Bu sağlayıcılar verileri yalnızca bizim adımıza ve hizmetin gerektirdiği ölçüde işler. Sağlayıcıların sunucuları Türkiye dışında bulunabilir; bu durumda aktarım KVKK'nın yurt dışına aktarıma ilişkin hükümlerine uygun olarak yapılır.",
        "Yetkili kamu kurum ve kuruluşlarının yasal talepleri hâlinde, yasanın gerektirdiği ölçüde bilgi verebiliriz.",
      ],
    },
    {
      id: "saklama",
      heading: "5. Ne kadar süre saklıyoruz?",
      paragraphs: [
        "Verilerinizi, abonelik ve hesabınız devam ettiği sürece ve sonrasında yasal saklama yükümlülükleri ile olası uyuşmazlıklardaki zamanaşımı süreleri boyunca saklarız. Süre dolduğunda veriler silinir, yok edilir veya anonim hâle getirilir. Hesabın ve verilerin silinmesini ayrıca talep edebilirsiniz.",
      ],
    },
    {
      id: "guvenlik",
      heading: "6. Verilerinizi nasıl koruyoruz?",
      items: [
        "İşletmelerin verileri veritabanı düzeyinde birbirinden ayrılır; bir işletme başka bir işletmenin verisine erişemez.",
        "Erişim rol ve şube bazlı yetkilendirmeyle sınırlandırılır; kritik işlemler denetim kaydına yazılır.",
        "Bağlantılar şifreli (HTTPS) yapılır; parolalar düz metin olarak saklanmaz.",
        "Maaş, prim ve personel kartı gibi hassas bilgiler yalnızca yetkilendirilmiş yöneticiler tarafından görülebilir.",
      ],
      paragraphs: [
        "Hiçbir sistem mutlak güvenlik sağlayamaz. Bir güvenlik ihlali fark ederseniz bize hemen bildirin.",
      ],
    },
    {
      id: "haklar",
      heading: "7. Haklarınız",
      paragraphs: [
        `6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamındaki haklarınız (verilerinize erişme, düzeltme, silme, işlenmesine itiraz etme vb.) KVKK Aydınlatma Metni'nde ayrıntılı anlatılmıştır. Başvurularınızı ${email} adresine iletebilirsiniz.`,
      ],
    },
    {
      id: "degisiklik",
      heading: "8. Değişiklikler ve iletişim",
      paragraphs: [
        `Bu politikayı güncelleyebiliriz; güncel sürüm bu sayfada yayımlanır ve sayfanın başındaki tarih değişir. Sorularınız için: ${email}`,
      ],
    },
  ],
};

export const kvkkNotice: LegalDocument = {
  slug: "kvkk-aydinlatma-metni",
  title: "KVKK Aydınlatma Metni",
  description: `6698 sayılı KVKK kapsamında ${brand} kullanıcılarına yönelik kişisel verilerin işlenmesine ilişkin aydınlatma metni.`,
  intro: "6698 sayılı Kişisel Verilerin Korunması Kanunu'nun 10. maddesi uyarınca, kişisel verilerinizin hangi amaçla, hangi hukuki sebeple, kimlere aktarıldığı ve haklarınız hakkında sizi bilgilendiririz.",
  sections: [
    {
      id: "veri-sorumlusu",
      heading: "1. Veri sorumlusu",
      paragraphs: [
        `Veri sorumlusu ${owner}'dır. İletişim: ${email}`,
        "Restoran işletmelerinin yazılıma girdiği çalışan ve müşteri verilerinde veri sorumlusu ilgili işletmedir; biz bu verilerde veri işleyen sıfatıyla hareket ederiz. Bu verilere ilişkin başvurularınızı öncelikle ilgili işletmeye yapmalısınız.",
      ],
    },
    {
      id: "veriler",
      heading: "2. İşlenen kişisel veriler",
      items: [
        "Kimlik ve iletişim: ad soyad, e-posta adresi, telefon numarası",
        "Hesap ve işlem güvenliği: parola özeti, oturum bilgisi, işlem ve denetim kayıtları, cihaz/tarayıcı bilgisi",
        "Kullanım ve işletme bilgisi: rol ve şube atamaları, vardiya ve puantaj kayıtları, siparişleri alan çalışan bilgisi",
        "Personel yönetimi (işletme yöneticisi tarafından girilen): pozisyon, işe giriş ve çıkış tarihi, acil durum kişisi bilgisi, maaş/prim kayıtları",
        "Müşteri işlemi: QR menüden verilen sipariş içeriği, masa bilgisi, garson çağırma kaydı",
      ],
    },
    {
      id: "amac",
      heading: "3. İşleme amaçları",
      items: [
        "Üyelik ve abonelik süreçlerinin yürütülmesi, hizmetin sunulması",
        "Kimlik doğrulama, yetkilendirme ve bilgi güvenliği süreçlerinin yürütülmesi",
        "Destek taleplerinin alınması ve yanıtlanması",
        "Hukuki yükümlülüklerin yerine getirilmesi ve olası uyuşmazlıklarda hakların korunması",
        "Hizmetin iyileştirilmesi ve hataların giderilmesi",
      ],
    },
    {
      id: "hukuki-sebep",
      heading: "4. Hukuki sebepler",
      paragraphs: [
        "Verileriniz KVKK'nın 5. maddesinin 2. fıkrasındaki şu sebeplere dayanılarak işlenir: sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması, hukuki yükümlülüğün yerine getirilmesi, bir hakkın tesisi, kullanılması veya korunması ve temel hak ve özgürlüklerinize zarar vermemek kaydıyla meşru menfaatimiz. Bu sebeplerin bulunmadığı durumlarda açık rızanız aranır.",
      ],
    },
    {
      id: "aktarim",
      heading: "5. Verilerin aktarılması",
      paragraphs: [
        "Verileriniz, hizmetin sunulması amacıyla veritabanı ve kimlik doğrulama (Supabase) ile web barındırma (Vercel) hizmeti sağlayıcılarımıza ve yasal olarak yetkili kamu kurumlarına, KVKK'nın 8. ve 9. maddelerine uygun olarak aktarılabilir. Altyapı sağlayıcılarının sunucuları yurt dışında bulunabilir.",
      ],
    },
    {
      id: "yontem",
      heading: "6. Toplama yöntemi",
      paragraphs: [
        "Verileriniz; üyelik ve giriş formları, işletmeye katılma talepleri, yazılımın kullanımı sırasında girilen bilgiler ve otomatik teknik kayıtlar aracılığıyla, elektronik ortamda toplanır.",
      ],
    },
    {
      id: "haklar",
      heading: "7. KVKK madde 11 kapsamındaki haklarınız",
      items: [
        "Kişisel verilerinizin işlenip işlenmediğini öğrenme",
        "İşlenmişse buna ilişkin bilgi talep etme",
        "İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme",
        "Yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme",
        "Eksik veya yanlış işlenmişse düzeltilmesini isteme",
        "KVKK'da öngörülen şartlar çerçevesinde silinmesini veya yok edilmesini isteme",
        "Düzeltme, silme ve yok etme işlemlerinin aktarıldığı üçüncü kişilere bildirilmesini isteme",
        "İşlenen verilerin münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme",
        "Kanuna aykırı işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme",
      ],
    },
    {
      id: "basvuru",
      heading: "8. Başvuru yöntemi",
      paragraphs: [
        `Haklarınıza ilişkin taleplerinizi, kimliğinizi doğrulayacak bilgilerle birlikte ${email} adresine e-posta ile iletebilirsiniz. Başvurunuz, talebin niteliğine göre en geç 30 gün içinde ücretsiz olarak sonuçlandırılır; işlemin ayrıca bir maliyet gerektirmesi hâlinde Kişisel Verileri Koruma Kurulu'nca belirlenen tarife uygulanabilir.`,
      ],
    },
  ],
};

export const termsOfUse: LegalDocument = {
  slug: "kullanim-kosullari",
  title: "Kullanım Koşulları",
  description: `${brand} hizmetinin kullanım koşulları: hesap, abonelik, deneme süresi, sorumluluklar ve yasal belge uyarısı.`,
  intro: `Bu koşullar, ${owner} tarafından sunulan ${brand} yazılımını kullanımınızı düzenler. Üye olarak veya hizmeti kullanarak bu koşulları kabul etmiş sayılırsınız.`,
  sections: [
    {
      id: "hizmet",
      heading: "1. Hizmetin tanımı",
      paragraphs: [
        `${brand}; masa ve adisyon yönetimi, mutfak ekranı, kasa, QR menü ve sipariş, raporlama ve personel yönetimi işlevlerini internet üzerinden sunan bir yazılım hizmetidir. Hizmetin kapsamı ve sınırları (şube, masa, personel hesabı sayısı gibi) seçilen pakete göre belirlenir.`,
      ],
    },
    {
      id: "hesap",
      heading: "2. Hesap ve sorumluluklar",
      items: [
        "Doğru ve güncel bilgi vermekle ve hesap bilgilerinizin güvenliğini korumakla yükümlüsünüz.",
        "İşletmenize eklediğiniz kullanıcıların yetkilerinden ve yaptıkları işlemlerden işletme yöneticisi olarak siz sorumlusunuz.",
        "Hesabınızın izinsiz kullanıldığını fark ederseniz bize gecikmeden bildirmelisiniz.",
      ],
    },
    {
      id: "abonelik",
      heading: "3. Deneme, abonelik ve ücretler",
      items: [
        "Yeni işletmelere 7 günlük deneme süresi tanınır; yazılım denemesi ücretsizdir. Deneme süresi hesabın oluşturulduğu anda değil, işletmenin ilk kurulumu (salonlar, masalar, mutfak istasyonları ve menü) tamamlandıktan sonra işletme sahibinin denemeyi başlatmasıyla başlar. Kurulum işletme tarafından yapılabileceği gibi MK Digital Systems ekibinden bu dört alanda destek de istenebilir. Deneme süresinin sonunda hizmeti sürdürmek için bir paket etkinleştirilmesi gerekir; deneme sona erdiğinde verileriniz silinmez, hesabınız salt okunur olur.",
        "Paketler, aylık ücretler ve varsa kampanya koşulları sitedeki fiyat listesinde yayımlanır. Fiyatlara KDV dahil değildir.",
        "Abonelikler hesabınız oluşturulduktan sonra ekibimiz tarafından etkinleştirilir. Ödeme ve faturalandırma bilgileri etkinleştirme sırasında bildirilir.",
        "Kampanyalı fiyat, kampanya koşullarında belirtilen süre boyunca geçerlidir; süre sonunda paketin normal fiyatı uygulanır. Fiyat listesini ileriye dönük olarak güncelleme hakkımız saklıdır.",
        "Aboneliğin iptali için bir sonraki dönem başlamadan önce yazılı bildirim yapmanız gerekir. Başlamış dönem için ücret iadesi, aksi yazılı olarak kararlaştırılmadıkça yapılmaz.",
      ],
    },
    {
      id: "kullanim",
      heading: "4. Kabul edilebilir kullanım",
      items: [
        "Hizmeti yasalara, genel ahlaka ve üçüncü kişilerin haklarına aykırı biçimde kullanamazsınız.",
        "Hizmetin güvenliğini veya işleyişini bozacak girişimlerde bulunamaz, diğer işletmelerin verisine erişmeye çalışamazsınız.",
        "Menü, fiyat, görsel ve benzeri içeriklerin doğruluğundan ve haklarının size ait olmasından siz sorumlusunuz.",
      ],
    },
    {
      id: "veri",
      heading: "5. Verileriniz",
      paragraphs: [
        "İşletmenizin yazılıma girdiği veriler size aittir. Bu verileri yalnızca hizmeti sunmak amacıyla ve Gizlilik Politikası ile KVKK Aydınlatma Metni'nde açıklandığı şekilde işleriz. Çalışanlarınıza ve müşterilerinize karşı veri sorumlusu yükümlülükleri işletme olarak sizdedir.",
      ],
    },
    {
      id: "yasal-belge",
      heading: "6. Mali belge uyarısı",
      paragraphs: [
        `${brand} tarafından üretilen adisyon, hesap fişi ve mutfak fişleri bilgi amaçlıdır ve mali değer taşımaz; yeni nesil ödeme kaydedici cihaz (yazarkasa), e-fatura, e-arşiv veya benzeri yasal belge ve cihazların yerine geçmez. Vergi ve muhasebe mevzuatından doğan yükümlülükler işletmeye aittir.`,
      ],
    },
    {
      id: "sureklilik",
      heading: "7. Hizmet sürekliliği",
      paragraphs: [
        "Hizmeti kesintisiz ve hatasız sunmak için makul çabayı gösteririz; ancak bakım, altyapı sağlayıcı kesintileri veya mücbir sebepler nedeniyle geçici kesintiler olabilir. İnternet bağlantısı olmayan ortamlarda bazı işlemler (örneğin ödeme alma) yapılamaz.",
      ],
    },
    {
      id: "sorumluluk",
      heading: "8. Sorumluluğun sınırı",
      paragraphs: [
        "Yasaların izin verdiği ölçüde, hizmetin kullanımından doğan dolaylı zararlardan, kâr kaybından veya veri girişindeki hatalardan kaynaklanan zararlardan sorumlu değiliz. Tüketici mevzuatından doğan zorunlu haklarınız saklıdır.",
      ],
    },
    {
      id: "fikri",
      heading: "9. Fikri mülkiyet",
      paragraphs: [
        `${brand} yazılımı, markası, tasarımı ve içeriğine ilişkin tüm haklar ${owner}'a aittir. Size aboneliğiniz süresince hizmeti kullanma hakkı verilir; yazılımı kopyalayamaz, tersine mühendislik yapamaz veya devredemezsiniz.`,
      ],
    },
    {
      id: "sona-erme",
      heading: "10. Sona erme",
      paragraphs: [
        "Aboneliğinizi sona erdirebilirsiniz. Koşulları ihlal etmeniz hâlinde hesabı askıya alma veya sonlandırma hakkımız saklıdır. Sona ermeden sonra verilerinizin dışa aktarılması veya silinmesi için bize yazabilirsiniz.",
      ],
    },
    {
      id: "genel",
      heading: "11. Değişiklikler, uygulanacak hukuk ve iletişim",
      paragraphs: [
        "Bu koşulları güncelleyebiliriz; güncel sürüm bu sayfada yayımlanır ve değişiklikten sonra hizmeti kullanmaya devam etmeniz yeni koşulları kabul ettiğiniz anlamına gelir. Bu koşullara Türkiye Cumhuriyeti hukuku uygulanır.",
        `Sorularınız için: ${email}`,
      ],
    },
  ],
};

export const cookiePolicy: LegalDocument = {
  slug: "cerez-politikasi",
  title: "Çerez Politikası",
  description: `${brand} hangi çerezleri ve tarayıcı depolamasını kullanıyor, neden kullanıyor ve nasıl yönetebilirsiniz.`,
  intro: `${brand}, hizmetin çalışması için gerekli çerezleri ve tarayıcı depolamasını kullanır. Şu anda reklam, pazarlama veya üçüncü taraf analiz çerezi kullanmıyoruz.`,
  sections: [
    {
      id: "kullanilanlar",
      heading: "1. Kullandıklarımız",
      table: {
        head: ["Ad / tür", "Amaç", "Süre", "Zorunlu mu?"],
        rows: [
          ["Oturum çerezleri (kimlik doğrulama)", "Giriş yapmanızı ve oturumunuzu güvenle sürdürmenizi sağlar", "Oturum süresi boyunca / yenilenir", "Evet"],
          ["Tarayıcı depolaması (localStorage)", "Cihazınızdaki tercihleri hatırlar: bildirim sesi ve türleri, fiş kağıdı boyutu", "Siz silene kadar", "Hayır (tercihler)"],
          ["Uygulama önbelleği (service worker)", "Uygulamanın hızlı açılmasını ve bağlantı koptuğunda bilgilendirme sayfasını gösterir", "Sürüm güncellenene kadar", "Hayır (performans)"],
        ],
      },
      paragraphs: [
        "Giriş yapmamış ziyaretçiler için (tanıtım sayfası, QR menü) yalnızca sayfanın çalışması için gerekli teknik veriler kullanılır.",
      ],
    },
    {
      id: "yonetim",
      heading: "2. Çerezleri nasıl yönetirsiniz?",
      paragraphs: [
        "Tarayıcınızın ayarlarından çerezleri ve site verilerini silebilir veya engelleyebilirsiniz. Zorunlu çerezleri engellerseniz giriş yapamaz ve hizmeti kullanamazsınız. Tarayıcı depolamasını silerseniz bildirim ve fiş tercihleriniz varsayılana döner.",
      ],
    },
    {
      id: "degisiklik",
      heading: "3. Değişiklikler",
      paragraphs: [
        `İleride ölçümleme veya benzeri amaçlarla ek çerez kullanmamız gerekirse bu politikayı güncelleyip, gerekli olduğu durumlarda onayınızı alırız. Sorularınız için: ${email}`,
      ],
    },
  ],
};

export const legalDocuments = [termsOfUse, privacyPolicy, kvkkNotice, cookiePolicy];
