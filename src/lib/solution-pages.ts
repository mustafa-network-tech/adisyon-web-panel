/**
 * Content of the public solution pages. Every page targets a different search
 * intent and only describes features that exist in the product (see
 * src/lib/pricing.ts for the packages). Update `updatedAt` when a text changes:
 * it feeds the sitemap's lastModified value.
 */

export type SolutionSlug =
  | "adisyon-programi"
  | "restoran-otomasyonu"
  | "kafe-adisyon-programi"
  | "qr-menu"
  | "restoran-pos-sistemi";

export type SolutionPage = {
  slug: SolutionSlug;
  /** Short name used in navigation and breadcrumbs. */
  navLabel: string;
  /** One line shown on cards that link to the page. */
  summary: string;
  metaTitle: string;
  metaDescription: string;
  eyebrow: string;
  h1: string;
  lead: string;
  /** The reader's problem, then how the product answers it. */
  problem: { title: string; paragraphs: string[] };
  sections: {
    id: string;
    title: string;
    intro?: string;
    items: { title: string; text: string }[];
  }[];
  steps?: { title: string; items: { title: string; text: string }[] };
  related: SolutionSlug[];
  updatedAt: string;
};

export const solutionPages: SolutionPage[] = [
  {
    slug: "adisyon-programi",
    navLabel: "Adisyon programı",
    summary: "Masa, adisyon, mutfak ve kasa tek ekranda.",
    metaTitle: "Adisyon Programı: Masa, Sipariş, Mutfak ve Kasa",
    metaDescription:
      "Bulut tabanlı adisyon programıyla masa, sipariş, mutfak ve kasayı tek yerden yönetin. Kurulum gerektirmez; telefon, tablet ve bilgisayarda çalışır.",
    eyebrow: "Adisyon programı",
    h1: "Masa, sipariş ve kasayı tek ekranda toplayan adisyon programı",
    lead:
      "Kâğıt adisyon, sözlü mutfak bildirimi ve elle tutulan kasa defteri arasında kaybolan zamanı geri alın. Adisyon Web, bir masanın açılışından hesabın kapanışına kadar her adımı aynı ekranda izlemenizi sağlar.",
    problem: {
      title: "Yoğun serviste adisyon neden karışır?",
      paragraphs: [
        "Sipariş bir kâğıda yazılır, mutfağa sözlü iletilir, hesap ayrıca toplanır. Bu zincirin herhangi bir halkası aksadığında masa bekler, ürün atlanır ya da hesap yanlış çıkar.",
        "Adisyon programı bu zinciri tek kayıtta birleştirir. Garsonun girdiği sipariş ilgili mutfak istasyonuna düşer, kasa aynı adisyondan hesabı kapatır ve gün sonunda rakamlar bu kayıttan oluşur.",
      ],
    },
    sections: [
      {
        id: "ozellikler",
        title: "Adisyon programında neler yapabilirsiniz?",
        items: [
          { title: "Masa görünümü", text: "Salon, bahçe ve teras gibi alanları ayrı ayrı tanımlayın; hangi masanın boş, hangisinin dolu olduğunu tek bakışta görün." },
          { title: "Dokunmatik sipariş", text: "Menüden ürün seçin, seçenekleri ve notları ekleyin. Sipariş telefon, tablet ya da bilgisayardan girilebilir." },
          { title: "Mutfak ekranı", text: "Siparişler yeni, hazırlanıyor ve hazır olarak izlenir. Birden fazla istasyonda her ekip yalnızca kendi ürünlerini görür." },
          { title: "Kasa ve ödeme", text: "Nakit, kart ve karma ödeme alın, hesabı bölün. Vardiya hareketleri kayıt altında tutulur." },
          { title: "Raporlar", text: "Gün sonu ve satış raporlarını inceleyin; Profesyonel pakette ürün, kategori ve personel raporlarına da ulaşın." },
          { title: "Yetki ve kayıt", text: "Garson, mutfak, kasa ve yönetici için ayrı yetkiler tanımlayın; kritik işlemler denetim kaydında tutulur." },
        ],
      },
      {
        id: "neden-bulut",
        title: "Bulut tabanlı olmanın işletmeye faydası",
        items: [
          { title: "Kurulumsuz başlangıç", text: "Program tarayıcıdan çalışır; sunucu kurmanız gerekmez. Hesabınızı oluşturur, menünüzü ve masalarınızı tanımlar, kullanmaya başlarsınız." },
          { title: "Cihaz esnekliği", text: "Mevcut telefon, tablet ve bilgisayarlarınızı kullanabilirsiniz; arayüz ekran boyutuna uyum sağlar." },
          { title: "Tek işletme, birden fazla şube", text: "Çok Şubeli pakette şubeleriniz tek işletme altında, şube bazlı kullanıcı yetkileriyle yönetilir." },
        ],
      },
    ],
    steps: {
      title: "Bir sipariş adisyon programında nasıl ilerler?",
      items: [
        { title: "Masa açılır", text: "Garson masayı seçer ve adisyonu açar." },
        { title: "Sipariş girilir", text: "Ürünler eklenir; sipariş ilgili mutfak istasyonuna iletilir." },
        { title: "Mutfak hazırlar", text: "İstasyon siparişi hazırlanıyor, ardından hazır olarak işaretler." },
        { title: "Hesap kapanır", text: "Kasa ödemeyi alır; adisyon kapanır ve raporlara yansır." },
      ],
    },
    related: ["restoran-otomasyonu", "qr-menu", "restoran-pos-sistemi"],
    updatedAt: "2026-11-05",
  },
  {
    slug: "restoran-otomasyonu",
    navLabel: "Restoran otomasyonu",
    summary: "Salondan mutfağa ve kasaya tüm operasyon.",
    metaTitle: "Restoran Otomasyonu: Salon, Mutfak, Kasa",
    metaDescription:
      "Restoran otomasyonu ile salon, mutfak istasyonları, kasa, personel yetkileri ve şubelerinizi tek platformdan yönetin. Bulut tabanlı, kurulumsuz başlangıç.",
    eyebrow: "Restoran otomasyonu",
    h1: "Restoran otomasyonu: salondan mutfağa ve kasaya tek akış",
    lead:
      "Restoran yönetimi yalnızca adisyon kesmek değildir; ekiplerin birbirini beklemeden çalışması, yetkilerin doğru dağıtılması ve rakamların güvenilir olması gerekir. Bu sayfa, operasyonun Adisyon Web ile nasıl yürüdüğünü anlatır.",
    problem: {
      title: "Operasyon dağınık olduğunda ne olur?",
      paragraphs: [
        "Salon, mutfak ve kasa ayrı araçlarla çalıştığında bilgi kişiden kişiye sözlü taşınır. Servis yavaşlar, hatalar çoğalır ve yöneticinin gün içinde neler olduğunu görmesi zorlaşır.",
        "Otomasyon, her ekibin kendi ekranını aynı sipariş kaydı üzerinden görmesini sağlar. Herkes yalnızca kendi işine odaklanır, yönetici de tek yerden izler.",
      ],
    },
    sections: [
      {
        id: "ekipler",
        title: "Her ekip için görev odaklı ekran",
        items: [
          { title: "Garson", text: "Masaları görür, sipariş girer, müşteri çağrılarından haberdar olur." },
          { title: "Mutfak", text: "Siparişleri kendi istasyonunun ekranında yeni, hazırlanıyor ve hazır olarak yönetir. Profesyonel ve Çok Şubeli paketlerde mutfak, ızgara, fırın gibi birden fazla istasyon tanımlanır." },
          { title: "Kasa", text: "Hesabı kapatır, ödeme türünü seçer, vardiya hareketlerini takip eder." },
          { title: "Yönetici", text: "Menü, masa düzeni, kullanıcılar, yetkiler ve raporlar üzerinde kontrol sahibi olur." },
        ],
      },
      {
        id: "yonetim",
        title: "Yönetim ve kontrol",
        items: [
          { title: "Rol bazlı yetkiler", text: "Kimin hangi ekrana ve işleme erişeceğini rol bazında belirleyin." },
          { title: "Denetim kayıtları", text: "Kritik işlemler kimin tarafından yapıldığıyla birlikte kaydedilir." },
          { title: "Personel ve puantaj", text: "Personel hesaplarını yönetin ve çalışma kayıtlarını takip edin." },
          { title: "Bildirimler", text: "Müşteri çağrıları gibi durumlar için cihaz bazında bildirim tercihlerini ayarlayın." },
          { title: "Tema ve düzen", text: "Çalışma alanının renk temasını, salonları ve masa düzenini işletmenize göre özelleştirin." },
        ],
      },
      {
        id: "sube",
        title: "Birden fazla şubeniz varsa",
        intro: "Çok Şubeli paket üç şubeye kadar kullanım sunar.",
        items: [
          { title: "Tek işletme altında şubeler", text: "Şubeler aynı işletme hesabında tutulur; her şubenin masaları ve siparişleri ayrı izlenir." },
          { title: "Şube bazlı yetki", text: "Bir çalışanın yalnızca çalıştığı şubeye erişmesini sağlayabilirsiniz." },
          { title: "İşletmeler arası ayrım", text: "Bir işletmenin verisi başka bir işletme tarafından görülemez." },
        ],
      },
    ],
    related: ["adisyon-programi", "restoran-pos-sistemi", "qr-menu"],
    updatedAt: "2026-11-05",
  },
  {
    slug: "kafe-adisyon-programi",
    navLabel: "Kafe adisyon programı",
    summary: "Kafe, pastane ve küçük işletmeler için hızlı sipariş.",
    metaTitle: "Kafe Adisyon Programı: Hızlı Sipariş, Masa Takibi",
    metaDescription:
      "Kafe, pastane ve küçük işletmeler için hızlı sipariş alan, masaları düzenli tutan, QR menü dahil adisyon programı. Başlangıç paketi 15 masaya kadar.",
    eyebrow: "Kafe ve küçük işletmeler",
    h1: "Kafe, pastane ve büfeler için hızlı adisyon programı",
    lead:
      "Kafede sipariş sık, hesaplar küçük ve tempo yüksektir. Küçük ekiplerin karmaşık bir sisteme ayıracak zamanı yoktur; bu yüzden kurulum kısa, ekranlar sade tutuldu.",
    problem: {
      title: "Küçük işletmenin adisyon ihtiyacı farklıdır",
      paragraphs: [
        "Az personelle çalışan bir kafede aynı kişi hem sipariş alır hem kasaya bakar. Menü sık değişir, masalar kısa sürede dolup boşalır, öğle ve akşam yoğunlukları ani gelir.",
        "Adisyon programı burada ağır bir sistem değil, hızlı bir yardımcı olmalıdır: ürünü bulmak, siparişi göndermek ve hesabı kapatmak birkaç dokunuşta bitmelidir.",
      ],
    },
    sections: [
      {
        id: "hiz",
        title: "Hızlı servis için tasarlanan akış",
        items: [
          { title: "Dokunmatik sipariş", text: "Kategorilere ayrılmış menüden ürün seçin; ürün seçeneklerini ve notları ekleyin." },
          { title: "Masa takibi", text: "Masaların durumu görünümde ayrışır; teras ya da bahçeyi ayrı alan olarak tanımlayabilirsiniz." },
          { title: "Mutfak veya bar ekranı", text: "Hazırlık yapılan istasyonu tanımlayın; sipariş orada yeni olarak görünür ve hazır olarak işaretlenir." },
          { title: "Hızlı hesap", text: "Nakit, kart ya da karma ödeme alın; arkadaş gruplarının hesabını kişiler arasında bölün." },
        ],
      },
      {
        id: "qr",
        title: "QR menü ile sıra beklemeden sipariş",
        intro: "Her masaya özel QR kod, müşterinin menüyü telefonundan açmasını ve isterse sipariş vermesini sağlar.",
        items: [
          { title: "Güncel menü", text: "Fiyat veya ürün değişikliği QR menüye yansır; menüleri yeniden basmanız gerekmez." },
          { title: "Siparişi siz yönetirsiniz", text: "QR sipariş özelliğini açıp kapatabilir, kapalıyken menüyü yalnızca görüntüleme modunda kullanabilirsiniz." },
          { title: "Komisyon yok", text: "QR siparişlerinden komisyon alınmaz; QR menü her ücretli pakette dahildir." },
        ],
      },
      {
        id: "paket",
        title: "Hangi paket kafenize uygun?",
        items: [
          { title: "Başlangıç", text: "Tek şube, en fazla 15 masa, 5 personel hesabı ve tek mutfak istasyonu. Küçük kafeler ve pastaneler için yeterli bir başlangıçtır." },
          { title: "Profesyonel", text: "Sınırsız masa, 15 personel hesabı ve birden fazla istasyon. Mutfak ve barı ayrı yönetmek istediğinizde uygundur." },
        ],
      },
    ],
    related: ["qr-menu", "adisyon-programi", "restoran-pos-sistemi"],
    updatedAt: "2026-11-05",
  },
  {
    slug: "qr-menu",
    navLabel: "QR menü",
    summary: "Masaya özel QR kod, QR sipariş, komisyon yok.",
    metaTitle: "QR Menü ve Masadan QR Sipariş Sistemi",
    metaDescription:
      "Her masaya özel QR kodla güncel menü sunun, müşteri masadan sipariş versin. QR sipariş açılıp kapatılabilir, komisyon alınmaz, tüm paketlerde dahildir.",
    eyebrow: "QR menü",
    h1: "Masaya özel QR menü ve komisyonsuz QR sipariş",
    lead:
      "Müşteri masadaki QR kodu okutur, güncel menüyü görür ve dilerse siparişini kendisi verir. Sipariş, garsonun girdiği siparişle aynı yerden mutfağa iletilir.",
    problem: {
      title: "Basılı menü ve sipariş beklemek neden sorun?",
      paragraphs: [
        "Basılı menü her fiyat değişikliğinde yenilenmek zorundadır. Yoğun saatlerde müşteri garsonu beklerken sipariş gecikir, garson da masalar arasında koşturur.",
        "QR menü, menüyü her zaman güncel tutar. QR sipariş açıkken müşteri beklemeden sipariş verir; ekibiniz sipariş almak yerine servise odaklanır.",
      ],
    },
    sections: [
      {
        id: "nasil-calisir",
        title: "QR menü nasıl çalışır?",
        items: [
          { title: "Her masaya özel kod", text: "Her masa kendi QR koduna sahiptir. Sipariş hangi masadan geldiyse o masanın adisyonuna işlenir." },
          { title: "Dinamik menü", text: "Menüyü panelden düzenlersiniz; değişiklikler müşterinin açtığı QR menüde güncel görünür." },
          { title: "Mutfağa doğrudan iletim", text: "QR siparişleri ilgili mutfak istasyonuna doğrudan düşer." },
          { title: "Garson çağırma ve hesap isteme", text: "Müşteri QR menüden garson çağırabilir ya da hesap isteyebilir; ekibiniz bildirimle haberdar olur." },
        ],
      },
      {
        id: "kontrol",
        title: "Kontrol sizde",
        items: [
          { title: "QR siparişi aç veya kapat", text: "İsterseniz müşterilerin sipariş vermesine izin verirsiniz, isterseniz QR menüyü yalnızca görüntüleme modunda tutarsınız. Kapalıyken siparişleri garson alır." },
          { title: "QR kodu yenileme", text: "Bir masanın QR kodunun kötüye kullanıldığını düşünüyorsanız kodu yenileyebilirsiniz." },
          { title: "Kişisel veri toplamama", text: "QR menü ziyaretçilerinden ad, telefon veya ödeme kartı bilgisi istenmez." },
        ],
      },
      {
        id: "komisyon",
        title: "Komisyon ve paketler",
        intro: "QR menü ve QR sipariş özelliği tüm ücretli paketlerde (Başlangıç, Profesyonel, Çok Şubeli) dahildir.",
        items: [
          { title: "Komisyonsuz model", text: "QR siparişlerinden komisyon alınmaz; yalnızca paketin aylık ücretini ödersiniz." },
          { title: "Ayrı QR ücreti yok", text: "QR menü ve QR sipariş için paket ücreti dışında ek bir eklenti bedeli yoktur." },
        ],
      },
    ],
    related: ["kafe-adisyon-programi", "adisyon-programi", "restoran-otomasyonu"],
    updatedAt: "2026-11-05",
  },
  {
    slug: "restoran-pos-sistemi",
    navLabel: "Restoran POS sistemi",
    summary: "Kasa, karma ödeme, hesap bölme ve satış raporları.",
    metaTitle: "Restoran POS Sistemi: Kasa, Ödeme, Raporlar",
    metaDescription:
      "Restoran POS sistemi olarak kasa, nakit-kart-karma ödeme, hesap bölme, vardiya hareketleri ve satış raporlarını mutfak akışıyla aynı kayıtta yönetin.",
    eyebrow: "Kasa ve ödeme",
    h1: "Restoran POS sistemi: kasa, ödeme ve satış raporları",
    lead:
      "Kasa, siparişin bittiği yerdir ve hatanın en pahalı olduğu adımdır. Adisyon Web'un kasa ekranı, hesabı mutfak ve salonla aynı kayıttan kapatır; rakamlar sonradan elle birleştirilmez.",
    problem: {
      title: "Kasada hesap neden tutmaz?",
      paragraphs: [
        "Sipariş ayrı, kasa ayrı tutulduğunda eksik girilen ürün ya da yanlış ödeme türü gün sonunda fark çıkarır. Grup hesabı bölmek ise çoğu zaman hesap makinesine kalır.",
        "Kasayı siparişle aynı sisteme bağlamak, tahsilat ile satışın birbirinden kopmasını önler. Gün sonu raporu da bu tek kayıttan üretilir.",
      ],
    },
    sections: [
      {
        id: "odeme",
        title: "Ödeme ve hesap işlemleri",
        items: [
          { title: "Nakit ve kart", text: "Ödeme türünü seçerek hesabı kapatın; tahsilat adisyona işlenir." },
          { title: "Karma ödeme", text: "Hesabın bir kısmını nakit, kalanını kartla almak gibi karma ödemeleri tek adisyonda kaydedin." },
          { title: "Hesap bölme", text: "Kalabalık masalarda hesabı kişiler arasında bölerek ayrı ayrı tahsil edin." },
          { title: "Vardiya hareketleri", text: "Kasa vardiyalarını ve hareketlerini kayıt altında tutun." },
        ],
      },
      {
        id: "akis",
        title: "Mutfak akışıyla aynı kayıt",
        items: [
          { title: "Sipariş ve hesap birlikte", text: "Garsonun ya da müşterinin QR menüden verdiği sipariş doğrudan masanın adisyonuna eklenir; kasada ayrıca girilmesi gerekmez." },
          { title: "İstasyon bazlı hazırlık", text: "Mutfak ekranındaki sipariş durumları adisyonla aynı kayda bağlıdır; hazırlık süreci ile hesap birbirinden kopmaz." },
        ],
      },
      {
        id: "rapor",
        title: "Satış raporları",
        intro: "Başlangıç paketinde temel satış ve gün sonu raporları, Profesyonel pakette ayrıntılı raporlar bulunur.",
        items: [
          { title: "Gün sonu", text: "Günün satışı ve tahsilatı kasa hareketleriyle birlikte görüntülenir." },
          { title: "Ürün ve kategori", text: "Hangi ürünün ve kategorinin ne kadar sattığını inceleyin." },
          { title: "Personel", text: "Personel bazlı satış raporlarıyla ekibinizin satışlarını izleyin." },
        ],
      },
    ],
    related: ["adisyon-programi", "restoran-otomasyonu", "kafe-adisyon-programi"],
    updatedAt: "2026-11-05",
  },
];

export function getSolution(slug: SolutionSlug) {
  const page = solutionPages.find((item) => item.slug === slug);
  if (!page) throw new Error(`Unknown solution page: ${slug}`);
  return page;
}
