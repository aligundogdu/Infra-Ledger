# Infra Ledger - Tasarim

Tarih: 2026-10-22
Durum: Onaylandi (v1 kapsami), v2/v3 taslak
Revizyon: 2026-10-22 review duzeltmeleri islenmistir (ozet asagida "Review ozeti" bolumunde).

## Amac

Cok sayida sunucu, veritabani, cloud hesabi ve servis icin baglanti bilgilerini ve credential'lari Obsidian vault'u icinde, harici servis kullanmadan, aranabilir ve disiplinli bir yapida tutmak. Sifre degistiginde eski degerin tarihiyle birlikte gecmise yazilmasi.

Mevcut durum: bilgiler ~45 dosyaya dagilmis, etiketsiz code block'lar, proje notlarina gomulu SQL ve .env parcalari. Plugin once duzgun bir yapi kurar (v1), sonra dagitik veriyi toplamaya ve sifrelemeye yardim eder (v2).

## Review ozeti (2026-10-22)

Ilk review sonrasi metne islenen karar ve netlesimler (ayrintilar ilgili bolumlerde normatif metin olarak gecer):

- Indeks tum markdown dosyalarini tarar; "Kaynak klasoru" ayari indeksi kisitlamaz, yalnizca yeni kaynak notunun yerini belirler.
- `type`'siz notlardaki creds bloklari indekslenir ve aramada "kaynaksiz" olarak gorunur; kaynak kaydi yalnizca `type`'li notlar icindir.
- Duplicate id: goruntuleme/kopyalama/gecmis calisir; yalnizca o credential'lar icin yazma reddedilir, dosyadaki diger credential'lar etkilenmez.
- `ref` girdisi ekstra alan tasirsa "gecersiz ref girdisi" uyarisi uretilir; veri korunur, mutate o satira dokunmaz.
- Temel alanlar her zaman string'dir; ham kaynak metinden okunur, sayi/boolean gorunumlu degerler (`0xdeadbeef`, `12345678`) degistirilmez (detay: Kurallar + Review ozeti 2).
- Pano temizligi TUM secret kopyalama noktalarina uygulanir; pano gecmisi tutan uygulamalarin (macOS Universal Clipboard, pano yoneticileri) bu temizligi garanti etmedigi kullaniciya ayar aciklamasinda bildirilir.
- v1 kapsamina "Credential ekle / sil" akisi eklendi (7. bolum) ve id otomatik turetimi tanimlandi.
- Bos / yalnizca yorumlu creds blogu gecerlidir (0 girdi).
- v2: kurtarma anahtari vault'a (data.json dahil) yazilmaz; PBKDF2 en az 600.000 iterasyon; sifrelenecek alan listesi ayarlarda secilebilir (varsayilan `secret` + `history[].secret`); kilitliyken render maskelemede kalir.
- v3 "N gundur degismeyen sifreler" uyarisi yalnizca `updated` dolu kayitlari sayar.

## Review ozeti 2 (2026-10-22)

- Temel alanlar YAML'in yorumladigi degerden degil, ham kaynak metinden okunur (`0xdeadbeef`, `0123456`, `1e10`, `null` bozulmadan kalir). Plugin secret'lari her zaman cift tirnakla yazar.
- Bicim garantisi netlesti: yalnizca hedef `creds` blogu yeniden bicimlenebilir, notun geri kalani ve diger bloklar byte byte ayni kalir.
- Sync conflict kopyasi icin ayri tespit yazilmaz; duplicate id mekanizmasi uzerinden "muhtemel sync kopyasi" Notice'i verilir.
- Eklemede yalnizca yeni id'nin cakismasi reddedilir; nottaki baska duplicate'lar eklemeyi engellemez.
- Duplicate id'ye isaret eden `ref` "belirsiz referans" olarak isaretlenir, kopyalama kapatilir.
- Mobilde pano okunamazken bos string yazilmasinin yan etkisi ayar aciklamasinda belirtilir.
- Katalog cakisma kontrolu 2026-10-22'de yapildi (`infra-ledger` bos); yayin oncesi tekrar kontrol edilir.

## Isimlendirme

- Gorunen isim: `Infra Ledger`
- Plugin id: `infra-ledger` (2026-10-22'de Community Plugins katalogunda 9.295 eklenti tarandi, ad ve id bos; yayin oncesi tekrar kontrol edilir)
- Repo: `aligundogdu/Infra-Ledger`
- Code block dili: `creds` (daha ozgun `infra-creds` alternatifi sonradan dusunulebilir; simdilik `creds`)

## Veri modeli

### Kaynak (resource)

Her kaynak bir markdown notudur. Kaynak olarak taninmasi icin frontmatter'da `type` alani gerekir.

```yaml
---
type: server          # server | database | cloud | service | other  (zorunlu)
ip: 1.2.3.4           # opsiyonel
host: db.example.com  # opsiyonel
url: https://...      # opsiyonel (panel, konsol)
provider: hetzner     # opsiyonel
env: prod             # opsiyonel (prod | stage | dev | ... serbest)
ssh_port: 22          # opsiyonel, tam sayi, varsayilan 22
tags: [homelab]     # opsiyonel
---
```

Netlesimler:
- `type` listesine `other` eklendi; kapsayici, domain, router gibi diger durumlarda `other` kullanilir. Taninmayan bir deger gelirse hata uretilmez, "other" gibi indekslenir.
- Frontmatter duz (flat) tutulur, ic ice yapi yoktur. Boylece Obsidian properties arayuzu, arama ve Dataview sorunsuz calisir. Notun geri kalani serbest metindir, plugin dokunmaz.
- "Kaynak klasoru" ayari veri modeli secmez; indeks tum vault'a bakar (bkz. Parser ve indeks).

### Credential

Credential'lar kaynak notunun icinde bir ya da birden fazla ` ```creds ` blogunda, YAML liste olarak durur.

```yaml
- id: homeserver-root        # zorunlu, vault genelinde benzersiz
  label: root               # zorunlu, insan okunur ad
  user: root                # opsiyonel
  secret: "xxxx"            # opsiyonel (ileride "enc:v1:..." olabilir)
  kind: ssh                 # ssh | db | panel | api-key | other (varsayilan other)
  note: sudo sifresi ayni   # opsiyonel
  updated: 2026-10-22       # opsiyonel, plugin sifre degisiminde yazar
  history:                  # opsiyonel, en yeni en ustte
    - secret: "eski"
      until: 2026-03-10
      reason: rotasyon
- ref: forge-shared-key     # baska kaynakta tanimli credential'a referans
```

Kurallar:

- `id` vault genelinde benzersiz olmali. Yeni id'yi plugin turetip onerir (`kaynak-adi-label`, orn: `homeserver-root`); olusturma/ekleme oncesi indeksle karsilastirilir, cakisma varsa kayit reddedilir.
- Indekste duplicate id bulundugunda iki (veya daha fazla) kayit "duplicate" uyarisiyla isaretlenir:
  - Goruntuleme, kopyalama ve gecmisi acma calismaya devam eder.
  - Yalnizca bu credential'lar icin yazi islemleri (sifre degistirme, silme, gecmis kayit silme) reddedilir ve Notice ile bildirilir; ayni dosyadaki diger credential'lar etkilenmez.
- `ref` girdisi ideal olarak sadece `ref` alanini tasir:
  - `ref` ile birlikte ekstra alan gelirse "gecersiz ref girdisi" uyarisi; satir korunur, mutate bu satira dokunmaz.
  - Hedef bulunamazsa satir "cozulemeyen referans" uyarisiyla gosterilir.
  - Hedef id duplicate ise satir "belirsiz referans" uyarisiyla gosterilir ve kopyalama kapatilir (yanlis sifre kopyalanmasin diye).
- Temel alanlar (id, label, user, secret, kind, note, ref, reason) her zaman string'dir ve YAML'in yorumladigi degerden DEGIL, ham kaynak metinden okunur:
  - Sebep: YAML bu degerleri once sayi/null olarak yorumlar ve deger o anda bozulur. `secret: 0xdeadbeef` -> 3735928559, `secret: 0123456` -> bastaki sifir kaybolur, `secret: 1e10`, `secret: null`, `secret: ~`, `secret: true` da benzer sekilde degisir. Sonradan `String(value)` ile cevirmek orijinal sifreyi geri getirmez.
  - Uygulama: plain (tirnaksiz) scalar'larda deger, `yaml` Document API'nin verdigi node `range` bilgisiyle blok metninden aynen alinir. Tirnakli scalar'larda YAML'in kacis kurallari uygulanmis deger kullanilir.
  - Plugin secret (ve history secret) yazarken degeri her zaman cift tirnakla yazar; elle yazilmis tirnaksiz degerler okunurken korunur, plugin o girdiyi yeniden yazarsa tirnaklanir.
  - Alan degeri map/list ise "gecersiz alan" uyarisi yazilir; veri korunur, mutate bu satira dokunmaz.
- Icerigi bos veya yalnizca yorumdan olusan creds blogu gecerlidir: 0 girdi, hatasiz (yeni kaynak sablonu boyle bir blok birakir).
- Bilinmeyen alanlar korunur (okunur, yeniden yazimda kaybolmaz).
- `updated` ve `until` tarih-only'dir (YYYY-MM-DD); ayni gun icinde ikinci degisimde siralama `history` satir sirasindan alinir.

## v1 Kapsami

### 1. Parser ve indeks

- `parseCredsBlock(text) -> { entries, errors }`: saf fonksiyon, Obsidian'a bagimli degil. `yaml` paketi (Document API) ile parse edilir, boylece yeniden yazimda yorumlar ve sira korunur.
- `LedgerIndex`: vault acilinca (`onLayoutReady`) TUM markdown dosyalarini tarar; "Kaynak klasoru" ayari indeksi kisitlamaz. Frontmatter'i `metadataCache`'ten okur; kod blogu iceren dosyalarin yerini section bilgisinden alir (section bilgisi kod blogunun konumunu verir ama dilini vermez; dil icerik okunurken teyit edilir), `creds` blogunun icerigini parse eder.
- `vault.on('modify' | 'rename' | 'delete')` ve `metadataCache.on('changed')` ile ilgili dosya yeniden indekslenir (debounce 300ms).
- Indeks icerigi: kaynaklar (dosya yolu, ad, frontmatter alanlari), credential'lar (id, kaynak dosyasi, alanlar), referanslar, hatalar. `type`'siz dosyalardan gelen credential'lar indeksde "kaynaksiz" olarak isaretlenir (arama ve goruntuleme dahil); kaynak kayit/frontmatter alanlari bu girdilerde yoktur.

### 2. Blok gorunumu

- `registerMarkdownCodeBlockProcessor('creds', ...)` ile okuma modunda (ve live preview'da) blok tablo olarak render edilir.
- Kolonlar: label, user, kind, secret (maskeli `••••••`), aksiyonlar.
- Aksiyonlar: goster/gizle, kullanici kopyala, secret kopyala, sifreyi degistir, gecmis, sil (onayli).
- "goster" ile acilan secret, ayarlanan sure sonra (varsayilan 10 sn) otomatik olarak tekrar maskelenir; tekrar gosterildiginde sure yenilenir.
- `ref` satirlari hedef credential'in bilgileriyle, kaynak notuna link ile gosterilir.
- YAML hatasi varsa tablo yerine hata kutusu (satir numarasiyla) gosterilir; yazma aksiyonlari devre disi.
- Pano temizligi TUM secret kopyalama noktalarina uygulanir: blok tablosu, degistir modal, gecmis modal, arama ve ref uzerinden kopyalama. Kopyalanan her secret ayarlardaki sure sonra (varsayilan 30 sn, 0 = kapali) panodan temizlenir. Temizleme once panonun ayni degeri tasidigini kontrol eder; pano okunamiyorsa (mobil) yine de temiz deger (bos string) yazilir. Bilinen yan etki: kullanici bu sure icinde baska bir sey kopyaladiysa o da silinir. Bu bilincli bir tercihtir ve ayar aciklamasinda yazilir.

### 3. Sifreyi degistir

- Modal: yeni secret (elle veya "uret" butonu), opsiyonel sebep.
- Islem: mevcut `secret`, `until: <bugun>` ve `reason` ile `history` listesinin basina eklenir; `secret` yeni degerle, `updated` bugunle guncellenir.
- Dosya `vault.process()` ile atomik yazilir. Blok, icindeki `id` ile bulunur (pozisyona guvenilmez). Blok bulunamazsa ya da parse edilemezse islem iptal edilir ve Notice gosterilir.
- Duplicate id'li credential'da bu aksiyon reddedilir (bkz. Kurallar).
- Sifre uretici: `crypto.getRandomValues`, ayarlanabilir uzunluk (varsayilan 24) ve karakter seti (sembol ac/kapa, karisabilecek karakterleri haric tut).

### 4. Gecmis

- Modal: credential'in history listesi tarih sirasiyla; her eski secret maskeli, goster/kopyala ile.
- Her eski kayit icin silme aksiyonu vardir (onayli); silme `vault.process()` ile atomik yazilir.

### 5. Hizli arama

- Komut: "Infra Ledger: Search". `SuggestModal` uzerinde fuzzy arama.
- Aranan alanlar: kaynak adi (kaynaksizlarda dosya adi), type, ip, host, provider, env, tags; credential label, user, kind, id.
- Sonuclar credential bazinda listelenir; her satir: `kaynak > label (user)` (kaynaksizlarda `dosya-adi > label (user)`). Credential'i olmayan kaynaklar da kaynak satiri olarak cikar.
- Tuslar:
  - Enter: secret kopyala
  - Shift+Enter: user kopyala
  - Mod+Enter: SSH komutu kopyala (`ssh -p <ssh_port> <user>@<ip|host>`, sadece ip/host varsa)
  - Alt+Enter: kaynak notunu ac
- Masaustunde tus kisayollari ipucu olarak gosterilir.
- Mobilde klavye kisayollari kullanilamaz: sonuca dokunulunca ayni aksiyonlari iceren kucuk bir aksiyon menusu acilir (secret kopyala, user kopyala, SSH kopyala, notu ac).

### 6. Yeni kaynak

- Komut: "Infra Ledger: New resource". Tip secimi, ad girisi, not ayarlardaki klasorde (varsayilan `Infra`; bu ayar indeksi kisitlamaz, yalnizca yeni not yeri belirler) tipe ozel sablonla olusturulur ve acilir.
- Sablon: frontmatter iskeleti + bos bir `creds` blogu (bos blok parse ederken 0 girdi, hatasiz kabul).
- Tip seciminde `other` secenegi bulunur; boylece kullanicilar `type`siz not birakmaz.

### 7. Credential ekle / sil

- Kaynak notundan "Yeni credential ekle" aksiyonu: label zorunlu; user, secret (elle/uret), kind, note opsiyonel. id otomatik onerilir (`kaynak-adi-label`) ve indeksle cakisma kontrolu yapilir; cakisma varsa kayit reddedilir (id elle duzeltilebilir).
- Yazma `vault.process()` ile atomik: girdi mevcut creds blogunun sonuna eklenir. Notta hic creds blogu yoksa, icerigi bos yeni bir blog olusturulur.
- Silme: credential satirinda "sil" aksiyonu onay modal ile; girdi ve gecmisi birlikte silinir. Bu credential silindikten sonra ona bagli ref'ler indekste "cozulemeyen referans" uyarisiyla gosterilir.
- Silme, duplicate id'li credential'da reddedilir (Kurallar).
- Eklemede yalnizca yeni girdinin id'si kontrol edilir: indekste ayni id varsa ekleme reddedilir. Ayni notta ya da vault'ta baska duplicate'lar bulunmasi eklemeyi engellemez.

### Ayarlar (v1)

- Kaynak klasoru (varsayilan `Infra`), indeksi kisitlamaz, yalnizca yeni kaynak notunun yerini belirler
- Pano temizleme suresi (sn, 0 = kapali). Ayar aciklamasinda iki not yer alir: pano gecmisi tutan uygulamalar (macOS Universal Clipboard, pano yoneticileri) bu temizligi garanti etmez; mobilde pano okunamadigi icin sure dolunca pano kosulsuz bosaltilir.
- Maskeli secret'in acik gorunum suresi (varsayilan 10 sn)
- Sifre uretici: uzunluk, semboller, karisabilecek karakterleri haric tut

## Mimari

```
src/
  main.ts              Plugin giris noktasi, komut/processor/event kaydi
  settings.ts          Ayar tipi, varsayilanlar, settings tab
  model.ts             Tipler: Resource, Credential, CredRef, HistoryEntry
  creds/parse.ts       Saf: blok metni -> entries + errors
  creds/mutate.ts      Saf: blok metni + id + degisiklik -> yeni blok metni (yorum/sira korunur)
  creds/locate.ts      Saf: not metni + id -> blok konumu
  index/ledger-index.ts  Vault tarama, guncelleme, sorgu
  ui/block-view.ts     Code block renderer
  ui/change-modal.ts   Sifre degistirme modal
  ui/history-modal.ts  Gecmis modal
  ui/search-modal.ts   Hizli arama
  ui/new-resource.ts   Yeni kaynak akisi
  ui/credential-modal.ts  Credential ekle/sil akisi
  util/clipboard.ts    Kopyala + zamanli temizle
  util/generator.ts    Sifre uretici
  util/ssh.ts          SSH komutu olusturma
```

Saf moduller (`creds/*`, `util/generator.ts`, `util/ssh.ts`, arama esleme mantigi) Obsidian API'sine bagimli degildir ve birim testlerle kapsanir. Temel alanlarin ham metinden string olarak okunmasi saf fonksiyonlarda uygulanir.

## Teknik kararlar

- TypeScript, esbuild (resmi sample plugin yapisi), `vitest` ile birim test.
- `yaml` npm paketi (Document API, yorum ve sira korunur). YAML 1.2 core schema kullanilir (tarihler string kalir, `yes`/`no` boolean'a donmez).
- Bicim garantisi:
  - Yalnizca degisikligin yapildigi hedef `creds` blogunun ici yeniden bicimlenebilir (bos satirlar, blok scalar, tirnak bicimi). Orada garanti, icerigin yapisal dogrulugudur.
  - Notun geri kalani (frontmatter, serbest metin, diger code block'lar, diger `creds` bloklari) byte byte ayni kalir. Yazma, sadece hedef blogun icerik araligini degistirir.
- Mobil destek: `isDesktopOnly: false`. Node API'si kullanilmaz; kripto icin Web Crypto.
- Minimum Obsidian surumu: 1.4.10 (API'ler 1.1.0'dan beri var ama eski surumler test edilmedi) (mobil davranisi manuel test kapsaminda dogrulanir).

## Hata yonetimi

- Parse hatasi: render'da hata kutusu, indekste hata kaydi, yazma reddi.
- Duplicate id: iki kayit da uyari ile isaretlenir; yalnizca o credential'lar icin ve yeni id olusturmada yazma reddedilir, goruntuleme ve diger credential'lar etkilenmez.
- Yazma sirasinda blok bulunamazsa (dosya bu arada degismis): islem iptal, Notice.
- Cihazlar arasi sync cakismasi (Obsidian Sync/iCloud): yerel yazma atomiktir; iki cihaz ayni dosyaya paralel yazarsa sync servisi conflict kopyasi uretebilir (`HomeServer 2.md` gibi). Plugin bu cakismayi otomatik cozmez ve dosya adindan conflict tespiti yapmaz (isim kalibi servise gore degisir, guvenilir degil).
  - Kopya, orijinaldeki tum id'leri tasidigi icin duplicate id mekanizmasi devreye girer ve iki dosyadaki credential'lar yazmaya kapanir. Bu istenen davranistir: hangisinin dogru oldugunu kullanici secer.
  - Bir dosyadaki TUM id'ler baska tek bir dosyada da varsa Notice ozel mesaj verir: "`HomeServer 2.md` looks like a sync copy of `HomeServer.md`. Keep one, delete the other."
- Hicbir durumda plugin bloku tahminle yeniden yazmaz.

## Test

- Birim (vitest): parse (gecerli, bozuk YAML, eksik alan, ref, bilinmeyen alan, bos blog [0 girdi], ham metinden okuma: `0xdeadbeef`, `0123456`, `1e10`, `null`, `~`, `true`, `2026-10-22` aynen string kalir; ref + ekstra alan, duplicate id, duplicate hedefe ref = belirsiz), mutate (sifre degisimi history'ye ekler, yazilan secret cift tirnakli, yorumlar korunur, bilinmeyen alanlar korunur, birden fazla blok iceren notta dogru blok, hedef blok disindaki metin byte byte ayni, ref satirina dokunmama, duplicate id'de yazma reddedilme, nottaki baska duplicate'lar eklemeyi engellemez, bos bloga credential ekleme), locate, sync kopyasi tespiti (tum id'leri baska tek dosyada olan dosya), generator (uzunluk, karakter seti), ssh komutu, arama esleme.
- Manuel: test vault'unda build edilmis plugin ile senaryolar (render, kopyala ve pano temizligi, degistir, gecmis + eski kayit silme, credential ekle/sil, arama, yeni kaynak, mobil render + mobil arama davranisi).

## v2 Taslak (ayri spec ile detaylanacak)

### Sifreleme (opsiyonel, geri alinabilir)

- Varsayilan kapali.
- Rastgele bir veri anahtari (DEK, AES-256-GCM). DEK iki kez sarilir: ana paroladan PBKDF2-SHA256 ile turetilen anahtarla (en az 600.000 iterasyon; iterasyon ve diger parametreler sifreleme formati icinde saklanir, ileride arttirilabilir) ve kurulumda uretilen kurtarma anahtariyla. Sarilmis anahtarlar plugin data'sinda tutulur.
- KRITIK kural: kurtarma anahtarinin KENDISI vault'a (data.json dahil) yazilmaz; kurulumda kullaniciya bir kez gosterilir ve vault disinda (parola yoneticisi, yazili kagit) saklamasi istenir. Aksi durumde vault'u ve data.json'u birlikte kopyalayan biri parolasiz cozer.
- Sifrelenecek alan listesi ayarlardan secilebilir; varsayilan: `secret` ve `history[].secret`. Kapsam bilincli olarak frontmatter'i (ip/host/topoloji) kapsamaz; bu sinir dokumante edilir. `note` alani (sirr/anahtar iceren notlar yazilabilir) opsiyonel kapsama alinabilir.
- Sadece secilen alanlar sifrelenir: `enc:v1:<iv-b64>:<ct-b64>` (surum numarasi, formatin ileride degistirilmesine izin verir).
- Komutlar: "Tumunu sifrele", "Tumunu coz", "Parolayi degistir", kilitle/kilidi ac. Oturum kilidi zaman asimi; kilitli durumda blok gorunumu maskede kalir ve sifreli degerler cozulmez.
- Format dokumante edilir; plugin olmadan cozmek icin kucuk bir script repoda bulunur.

### Secret tarayici ve ice aktarma

- Vault'u sifre/key/IP/DSN gorunumlu satirlar icin tarar (kaynak notlari haric). Tarama kapsami baslangicta tum vault; ayarlarda klasor listesiyle daraltilabilir (performans/gizlilik).
- Bulgu listesinde her biri icin: hedef kaynak sec (veya yeni olustur), label/user/kind gir, ice aktar.
- Ice aktarilan satirin yerine `[[Kaynak]]` linki koymayi teklif eder; her degisim tek tek kullanici onayi ile uygulanir, toplu otomatik degisim yoktur.

## v3 Taslak

- Yan panelde envanter gorunumu: filtreler (type, env, provider, tag).
- Uyarilar: N gundur degismeyen sifreler (yalnizca `updated` dolu kayitlar; `updated` bos olanlar ayrica "eksik updated" uyari listesine girer), cozulemeyen referanslar, duplicate id'ler.
- Kaynak alanlari icin gecmis (IP degisimi vb.), ihtiyac olursa.

## Yayin oncesi kontrol listesi

- Community Plugins katalogunda `infra-ledger` id ve "Infra Ledger" adi tekrar kontrol edilir (ilk kontrol 2026-10-22, bos).
- `minAppVersion` = 1.4.10 (test edilmemis eski surumler icin soz verilmez); kod blogu processor'unun ve pano temizliginin mobilde manuel test edilmesi.
- Manifest teyit edilir: `isDesktopOnly: false`; Node API kullanilmiyor (yalnizca Web Crypto).

---

# Sonraki surumler (2026-10-22 kararlari)

Surum sirasi: `0.1.0` mevcut v1 (manuel test sonrasi yayin), `0.2.0` klasor alanlari + `network` blogu, `0.3.0` cihaz, rehber notlari ve `ledger` blogu, `0.4.0` envanter paneli. Sifreleme ve secret tarayici (eski v2 taslagi) `0.4.0` sonrasina kayar.

Kapsam disi (README'de acikca yazilir): calisiyor mu takibi (ping, uptime, port tarama), agda cihaz kesfi, satin alma/fatura/amortisman.

## 0.2.0: Alanlar (spaces), coklu adres ve port

### Alanlar

- Ayar `resourceFolder` (tek klasor) yerine isimli liste: `spaces: { name: string; folder: string }[]`. Varsayilan: `[{ name: "Infra", folder: "Infra" }]`. Eski ayar ilk yuklemede bu listeye tasinir.
- Alan listesi indeksi KISITLAMAZ. Bir not, yolu bir alanin klasoruyle basliyorsa o alana aittir (en uzun eslesen klasor kazanir), hicbirine uymuyorsa alansizdir ve yine indekslenir.
- "New resource" penceresinde alan secimi; son secilen alan `lastSpace` ayarinda hatirlanir. Tek alan varsa secim gosterilmez.
- Arama:
  - Sonuc alt satirinda alan adi yer alir: `Work · server · prod · 10.0.0.4`.
  - `@<alan>` oneki aramayi o alana daraltir (`@work prod pg`). Buyuk/kucuk harf ve aksan duyarsiz, alan adinin basiyla eslesir (`@w` -> Work). Eslesen alan yoksa sonuc bos ve bos durum metni: `No space named "<x>". Spaces: Personal, Work.`

### Ag bilgisi: `network` blogu

Karar (2026-10-22): adresler ve portlar Properties yerine notun altinda bir ` ```network ` blogunda tutulur. Sebep: bir sunucuda birden fazla public ve private adres, VPN adresi, arayuz, MAC, gateway, VLAN gibi teknik bilgiler olabilir; Properties'in duz listeleri buna yetmez ve liste girisi Obsidian'in tip menusunu bilmeyi gerektirir. Blok acik uclu tasarlanir: ileride gelecek teknik alanlar icin kod degisikligi gerekmez.

```yaml
- ip: 85.10.20.30/26       # adres, istege bagli CIDR
  scope: public            # public | private | vpn | other; yoksa adresten tahmin edilir
  label: main
  iface: eth0
  mac: 00:11:22:33:44:55
  gateway: 85.10.20.1
  vlan: 4000
  ethId: 2                 # bilinmeyen alan: korunur, detayda gosterilir, aranir
- ip: 10.0.0.4
  scope: private
  label: vswitch
- port: 5432
  proto: tcp               # tcp | udp, varsayilan tcp
  service: postgres
  note: sadece private agdan
```

- Girdi tipi anahtara gore belirlenir: `ip` (ya da `host`) iceren girdi adrestir, `port` iceren girdi porttur. Ikisi de yoksa "gecersiz ag girdisi" uyarisi; satir korunur.
- Adres alanlari: `ip` veya `host` (biri zorunlu), `scope`, `label`, `iface`, `mac`, `gateway`, `vlan`, `note`. `ip` icindeki `/nn` CIDR olarak ayrilir; SSH ve kopyalama CIDR'siz adresi kullanir.
- `scope` yoksa tahmin: 10/8, 172.16/12, 192.168/16, fc00::/7, fe80::/10 -> private; 100.64/10 -> vpn; host adlari ve digerleri -> public. Bilinmeyen scope degeri `other`.
- Port alanlari: `port` (1-65535 tam sayi, zorunlu), `proto`, `service`, `note`. Gecersiz port uyari ile atlanir.
- Bilinmeyen alanlar her iki tipte de korunur, gosterilir ve aranir. Ham metinden okuma ve "yalnizca hedef blok degisir" kurallari `creds` ile aynidir.
- Properties'teki tekil `ip`, `host` ve `ports` alanlari (deger + istege bagli etiket, tek deger ya da liste) okunmaya devam eder; basit sunucular icin tek satir yeterlidir. Bunlar blok satirlarindan once siralanir.
- Gorunum (okuma modu): gruplu tablo: Public, Private, VPN, Other, Ports. Satirda deger (mono), etiket, arayuz, detaylar (mac, gateway, vlan, bilinmeyen alanlar), not; aksiyonlar: kopyala, SSH komutunu kopyala (adreslerde), sil (onayli). Altta "Add address" ve "Add port" butonlari form acar.
- Properties'ten gelen adresler `creds` blogunun ustunde rozet olarak kalir (sadece Properties kaynakli olanlar; `network` blogundakiler kendi tablosunda).
- Silme ve ekleme `vault.process` ile atomik; silme girdinin sirasi ve degeri (ip/port) eslesirse yapilir, eslesmezse "blok degisti" mesaji.
- SSH: adres sirasi Properties ip'leri, blok adresleri (yazildigi sirayla), Properties host'lari. Tek adres -> dogrudan, birden fazla -> secici; secicide etiket ve scope gorunur.
- Arama: tum adres, host, port, servis, etiket, arayuz, mac ve bilinmeyen alan degerleri aranir.
- Komutlar: "Add address", "Add port" (aktif not). Yeni kaynak sablonu `server` ve `device` icin bos bir `network` blogu icerir.

### Test (0.2.0)

- Birim: alan eslestirme (en uzun klasor, alansiz not, buyuk/kucuk harf), ayar tasima (eski `resourceFolder`), `@alan` ayristirma ve daraltma, Properties adres/port ayristirma (tekil, liste, etiketli, gecersiz port, bos satir), `network` blogu parse (adres, host, port, CIDR, scope tahmini, bilinmeyen alan, gecersiz girdi, ham okuma), network mutate (adres/port ekleme, sira+deger eslesmesiyle silme, blok yoksa olusturma, blok disi byte byte ayni), SSH adres sirasi, arama haystack'inde tum ag alanlari.
- Manuel: iki alanli test vault'u, New resource alan secimi, network tablosu ve Add address/Add port formlari, coklu adresli SSH secici, mobil aksiyon menusu.

## 0.3.0: Cihazlar, rehber notlari, ledger blogu

### Yeni tipler

- `device`: donanim. Istege bagli duz alanlar: `device_type` (serbest metin: laptop, phone, router, nas...), `model`, `serial`, `location`, `assigned_to`, `warranty_until` (YYYY-MM-DD). Adres/port alanlari sunucuyla ayni.
- Rehber tipleri: `person`, `location`. Credential tasimazlar; aramada ve envanterde gorunurler, SSH aksiyonu yoktur.
- Saglayici icin ayri tip yoktur: saglayici notu `type: cloud` (ya da `service`) olan siradan bir kaynaktir, panel girisinin credential'i orada durur.

### Link alanlari

- `provider`, `location`, `assigned_to` (ve `ledger` icindeki `to`/`from`) duz metin ya da wiki link (`"[[Hetzner]]"`) kabul eder.
- Link ise indeks hedef notu cozer; gosterimde notun adi ve tiklanabilir link kullanilir, aramada hedef notun adi da aranir. Cozulemeyen link duz metin gibi gosterilir, hata uretilmez.
- Kisiler icin varsayilan oneri `type: person` notlaridir (karar A). Plugin kisi listesini `type: person` notlarindan ve gecmis `assigned_to` degerlerinden olusturur.

### ledger blogu

- Her kaynakta kullanilabilir (sunucu, cihaz, servis...). Dil: ` ```ledger `. YAML liste, en yeni en ustte.

```yaml
- date: 2026-10-22
  event: assigned        # assigned | returned | service | repair | upgrade | moved | lost | retired | note
  to: "[[Ayse Yilmaz]]"
  note: yeni ise basladi
- date: 2026-09-01
  event: service
  note: batarya degisti
```

- Alanlar: `date` (zorunlu, YYYY-MM-DD), `event` (zorunlu; bilinmeyen deger `note` gibi gosterilir), `to`, `from`, `note` (istege bagli). Bilinmeyen alanlar korunur. Ham metinden okuma ve "yalnizca hedef blok degisir" kurallari `creds` ile ayni.
- Okuma gorunumu: zaman cizelgesi; ustte durum satiri: `Assigned to Ayse Yilmaz since 2026-10-22` / `Not assigned` / `Retired 2026-10-22`.

### Komutlar

- Assign: kisi secici (rehber + gecmis), istege bagli not. Islem tek `vault.process` icinde: mevcut `assigned_to` doluysa once `returned` (from: eski kisi) kaydi, sonra `assigned` (to: yeni kisi) kaydi eklenir; frontmatter `assigned_to` guncellenir. Notta `ledger` blogu yoksa olusturulur.
- Return: `assigned_to` bosaltilir, `returned` kaydi eklenir. Zimmetli degilse komut gorunmez.
- Add event: olay tipi, tarih (varsayilan bugun), not.
- Frontmatter guncellemesi `vault.process` icinde ayni yazimda yapilir (tek atomik yazim). Frontmatter'da sadece `assigned_to` satiri degisir; diger satirlar byte byte ayni kalir.

### Test (0.3.0)

- Birim: ledger parse (ham okuma, zorunlu alanlar, bilinmeyen event), assign/return mutate (iki kayit sirasi, frontmatter tek satir degisimi, blok yoksa olusturma), link alanlari cozumleme, rehber tiplerinin aramada SSH aksiyonu olmamasi.
- Manuel: cihaz notu, zimmet ve iade akisi, kisi notunun backlink'leri, zaman cizelgesi gorunumu.

## 0.4.0: Envanter paneli

Sag kenar cubugunda bir panel (`ItemView`). Komut "Open inventory" ve ribbon menusu ile acilir; masaustu ve mobilde calisir. Panel indeks degistikce kendini yeniler. Tum filtreleme, gruplama ve uyari hesaplari saf fonksiyonlardadir (`src/inventory/*`) ve birim testlidir.

### Resources sekmesi

- Tablo kolonlari: Name (nota link), Type, Space, Detail (cihazda `device_type`, digerlerinde `env`), Provider, Location, Holder, Addresses (sayi), Credentials (sayi).
- Filtreler: serbest metin (aramayla ayni esleme, `@alan` dahil), Type, Space, Provider, Location, Holder acilir listeleri. Liste secenekleri indeksteki mevcut degerlerden olusur; "Any" varsayilandir.
- Kolon basligina tiklamak siralar (artan/azalan). Varsayilan siralama: Name.
- Satira tiklamak notu acar (Mod+tik yeni sekmede).

### People sekmesi

- Zimmetli cihazlar kisiye gore gruplanir: grup basliginda kisi adi (kisi notu varsa link) ve cihaz sayisi; altinda cihaz adi, `device_type`, `model`, `since` tarihi.
- En altta "Not assigned" grubu: zimmetli olmayan ve emekli olmayan cihazlar.
- Emekli (`retired`) cihazlar listelenmez.

### Warnings sekmesi

Her uyari tek satir: ne oldugu, hangi not, tiklayinca not acilir. Gruplar:

- Warranty: `warranty_until` gecmis ("Warranty ended 2026-05-01") ya da N gun icinde bitiyor ("Warranty ends in 12 days"). N ayardan, varsayilan 30. Emekli cihazlar haric.
- Password age: `updated` tarihi N gunden eski credential'lar ("root on HomeServer: changed 240 days ago"). N ayardan, varsayilan 180. `updated` olmayan credential'lar ayri bir satirda sayilir: "12 credentials have no change date yet".
- Duplicate id, cozulemeyen ve belirsiz ref, sync kopyasi ipucu.
- Blok sorunlari: YAML hatasi ve uyarilar (gecersiz port, eksik id vb.), not basina sayi ile.
- Sekme basliginda toplam uyari sayisi gorunur. Uyari yoksa "Nothing to fix."

### related blogu

Kisi, lokasyon ve saglayici notlarinda "bu nota baglanan her sey" listesi. Blok bos yazilir (` ```related ` + ` ``` `), icerigi indeksten uretilir; veri kopyalanmaz.

- Bolumler (bos olanlar gosterilmez): Has now (bu nota zimmetli cihazlar, since tarihi ve Return butonu), Had before (cihaz defterlerinden cikarilan bitmis zimmet donemleri: ilk "assigned to bu not" donemi acar, sonraki returned, retired, lost ya da baskasina assigned kapatir), Located here (`location` bu not), Provided here (`provider` bu not).
- Eslesme: link ise Obsidian'in link cozumlemesiyle hedef notun yolu bu not olmali; duz metin ise not adiyla buyuk/kucuk harf duyarsiz ayni olmali.
- `person` ve `location` sablonlari blogu icerir. "Add related list" komutu mevcut notun sonuna ekler (zaten varsa eklemez).

### Ayarlar

- `warrantyWarnDays` (varsayilan 30, 0 = kapali)
- `passwordMaxAgeDays` (varsayilan 180, 0 = kapali)

### Test (0.4.0)

- Birim: filtreleme (her filtre, metin + `@alan`, birlikte), siralama, kisiye gore gruplama (link ve duz metin ayni kisi sayilmaz, emekliler haric, not assigned grubu), uyari hesaplari (garanti gecmis/yaklasan/sinir gunu/kapali, sifre yasi esigi/kapali/updated yok sayaci, duplicate, ref, sync kopyasi, blok sorunlari).
- Birim (related): kisinin simdiki cihazlari (link ve duz metin), bitmis donemler (iade, baskasina zimmet), lokasyon ve saglayici listeleri.
- Manuel: panelin acilmasi, filtreler, siralama, sekmeler, tiklayinca not acilmasi, indeks degisince yenilenmesi, mobilde gorunum.

## 0.5.0: Secret tarayici

Vault'ta daginik duran sifreleri bulup kaynaklara aktarmak icin. Tamamen yerel calisir, ag erisimi yoktur. Hicbir degisiklik kullanici onayi olmadan yapilmaz.

### Tarama

- Komut "Scan vault for secrets". Tum markdown notlari okunur; `creds`, `network`, `ledger` ve `related` bloklarinin ici taranmaz.
- Kurallar ve guven seviyeleri:
  - Etiketli deger (yuksek): ayni satirda etiket + `:`/`=` + bosluksuz ya da tirnakli deger. Etiketler: password, passwd, pass, pwd, sifre, parola, secret, token, api key, access key, secret key (Turkce karakterli yazimlar dahil). Deger bos, yer tutucu (`xxx`, `****`, `<...>`) ya da `[[link]]` ise atlanir.
  - Alt satirdaki deger (yuksek): satirda sadece etiket var (`Administrator Password`), sonraki dolu satir tek parca bir deger.
  - Etiket + bosluk + deger (orta): `sa password Abc!2026` gibi; deger en az 6 karakter ve rakam ya da sembol icerir.
  - Baglanti adresi (yuksek): `scheme://user:pass@host`; kullanici ve host da cikarilir.
  - SQL (yuksek): `IDENTIFIED BY '...'`, `PASSWORD = '...'`, `ENCRYPTED PASSWORD '...'`; ayni satirdaki kullanici/login adi cikarilir.
  - Bilinen token bicimleri (yuksek): AWS `AKIA...` ve iki satir icindeki 40 karakterlik secret, `ghp_`, `github_pat_`, `sk_live_`, `xox?-`, `-----BEGIN ... PRIVATE KEY-----` blogu.
  - .env satiri (orta): anahtarinda PASS, SECRET, TOKEN ya da KEY gecen `KEY=value`.
  - Etiketsiz aday (dusuk, ayarla acilir, varsayilan kapali): diger dillerdeki code block'larda tek basina duran 8-64 karakterlik, en az uc karakter sinifi iceren, URL ya da yol olmayan satir.
- Ayni araliga denk gelen bulgulardan guveni yuksek olan kalir.

### Sonuc paneli

- Sag panelde not bazinda gruplu liste; her bulgu: tur, guven, satir numarasi, maskeli deger (`Fx••••gL`), goster/gizle.
- Import: hedef kaynak (mevcut kaynaklar ya da yeni not), label, user, kind, id tahminle dolu gelir. Credential hedefin `creds` bloguna eklenir.
- Import formunda "Replace in source with see [[Kaynak]]" secenegi (varsayilan acik). Secilirse kaynak nottaki yalnizca sifre metni `see [[Kaynak]]` ile degistirilir; satirin geri kalani ve notun diger kisimlari ayni kalir. Degistirme sifreyi eklemeden once yapilir; yazim aninda sifre metni beklenen yerde degilse islem iptal edilir.
- Ignore: bulgu bir daha gosterilmez. Saklanan sadece notun yolu ve satir metninin SHA-256 ozetidir; deger saklanmaz.
- Panel her import, ignore ya da elle duzeltmeden sonra ilgili notu yeniden tarar.

### Test (0.5.0)

- Birim: her kural icin pozitif ve negatif ornekler (yer tutucu, link, duzyazi), bloklarin disarida birakilmasi, cakisan bulgularin tekillestirilmesi, DSN/SQL kullanici cikarimi, maskeleme, kaynak satirda degistirme (yalnizca deger, kayma durumunda red).
- Manuel: test vault'unda tarama, import (mevcut ve yeni kaynak), degistirme, ignore.

## 0.6.0: Sifreleme (opsiyonel, geri alinabilir)

Bu bolum eski "v2 Taslak / Sifreleme" bolumunun yerine gecer.

### Anahtarlar

- Veri anahtari (DEK): 32 rastgele bayt (`crypto.getRandomValues`), AES-256-GCM.
- DEK iki kez sarilir (her biri AES-256-GCM, 12 bayt rastgele IV):
  - Parola anahtari: ana paroladan PBKDF2-SHA256, 16 bayt rastgele salt, 600.000 iterasyon. Iterasyon sayisi kayitta tutulur, ileride arttirilabilir.
  - Kurtarma anahtari: 32 rastgele bayt, kullaniciya base32 (Crockford alfabesi, 4'lu gruplar) olarak bir kez gosterilir. Hicbir yere yazilmaz.
- Plugin verisinde (`data.json`) saklanan: `encryption: { version: 1, kdf: { iterations, salt }, byPassword: { iv, data }, byRecovery: { iv, data } }`. Hepsi base64. Parola, kurtarma anahtari ve acik DEK asla saklanmaz.
- Yanlis parola ya da kurtarma anahtari GCM dogrulamasinda reddedilir; ayri bir dogrulayici tutulmaz.

### Deger bicimi

- `enc:v1:<iv-base64>:<sifreli-veri-base64>`; sifreli veri GCM etiketini icerir. AAD: `infra-ledger:v1`.
- Sifrelenen alanlar: `secret` ve `history[].secret`. `user`, `note`, Properties ve `network` blogu acik kalir (aranabilsin diye). Bu sinir README ve ayarlarda yazar.
- Deger `enc:v1:` ile baslamiyorsa acik metindir. Ayni blokta acik ve sifreli degerler bir arada bulunabilir.

### Oturum

- Kilit acikken DEK yalnizca bellekte durur. Otomatik kilit: son islemden N dakika sonra (ayar, varsayilan 15, 0 = Obsidian kapanana kadar). "Lock" komutu hemen kilitler.
- Kilitliyken sifreli degerler maskeli ve kilit isaretli gorunur. Goster, kopyala, sifre degistir, credential ekle ve import islemleri once kilit acma penceresini acar.
- Kilit acma penceresi: ana parola; "Use recovery key" ile kurtarma anahtari. Kurtarma anahtariyla acilinca yeni ana parola belirlemek zorunludur.

### Yazma

- Sifreleme aktifken plugin'in yazdigi her yeni secret (sifre degistirme, credential ekleme, import) sifreli yazilir. Sifre degisiminde eski deger oldugu gibi (acik ya da sifreli) gecmise tasinir.
- "Encrypt all": tum notlardaki acik `secret` ve gecmis degerlerini sifreler. "Decrypt all": tersini yapar. Her not tek `vault.process` ile yazilir; sifreleme asenkron oldugu icin degerler once hesaplanir, yazim aninda not degismisse o not atlanir ve raporlanir. Yalnizca ilgili `creds` bloklari degisir; notun geri kalani byte byte ayni kalir.
- Sonuc raporu: kac not, kac deger, atlanan notlar.

### Kurulum ve yonetim (Ayarlar)

- Set up encryption: parola + tekrar (en az 12 karakter) -> kurtarma anahtari gosterilir, "I saved the recovery key" onayi olmadan devam edilmez -> "Encrypt all now?" sorulur.
- Change password: kilit acik olmali; DEK yeni parola anahtariyla yeniden sarilir. Kurtarma anahtari degismez.
- New recovery key: kilit acik olmali; yeni kurtarma anahtari uretilir ve gosterilir, eskisi gecersiz olur.
- Turn off encryption: vault'ta sifreli deger kaldiysa sayisini soyleyip reddeder ("Decrypt all first"). Hic kalmadiysa anahtar kaydini siler.
- Durum satiri: "Encryption on, locked" / "on, unlocked" / "off", ve vault'taki acik ve sifreli secret sayilari.

### Pluginsiz cozme

- `scripts/decrypt.mjs`: Node 18+ ile calisan, bagimsiz bir script. `node scripts/decrypt.mjs <data.json> <dosya-ya-da-deger>` parolayi (ya da `--recovery`) terminalden sorar, verilen notun ya da tek degerin acik halini yazar. Format `docs/encryption.md` icinde belgelenir.

### Test (0.6.0)

- Birim: kurulum -> parolayla ve kurtarma anahtariyla acma, yanlis parola/anahtar reddi, parola degistirme sonrasi eski parolanin reddi, yeni kurtarma anahtari sonrasi eskisinin reddi, sifrele/coz gidis-donus (Turkce karakter, bos olmayan uzun deger), kurcalanmis degerin reddi, `enc:v1` bicim ayristirma, base32 gidis-donus ve bosluk/tire toleransi, blok donusumu (sadece secret ve history secret degisir, digerleri ve blok disi byte byte ayni, ref satirina dokunulmaz, karisik acik/sifreli), decrypt script'inin plugin formatini cozmesi.
- Manuel: kurulum, otomatik kilit, kilitliyken goster/kopyala, encrypt all / decrypt all raporu, kurtarma akisi, turn off reddi, mobilde kilit acma.

## 0.7.0: Anahtarla giris ve credential'dan SSH komutu

### auth ve key_path

```yaml
- id: homeserver-deploy
  label: deploy
  user: deploy
  kind: ssh
  auth: key                          # password | key; yoksa password
  key_path: ~/.ssh/hetzner_ed25519   # anahtarin bilgisayardaki yeri
  secret: "passphrase"               # istege bagli: anahtarin passphrase'i
```

- `auth` ve `key_path` temel alanlardir (ham metinden okunur). Bilinmeyen `auth` degeri `password` sayilir.
- Anahtar dosyasinin icerigi nota yazilmaz; sadece yolu tutulur. `secret` key kullanan credential'da passphrase anlamina gelir ve sifreleme aciksa sifrelenir; `key_path` acik kalir.
- Tablo: key kullanan satirda anahtar ikonu ve dosya adi; passphrase varsa maskeli olarak yaninda.
- Add credential formu: "Password / SSH key" secimi; key secilince "Key file" ve "Passphrase" alanlari.

### Copy SSH login

- Notta en az bir adres varsa, `kind: ssh` ya da `auth: key` olan credential satirinda "Copy SSH login" butonu.
- Komut: `ssh -p <ssh_port> [-i <key_path>] <user>@<adres>`. Bosluk iceren yol cift tirnakla yazilir.
- Tek adres: dogrudan kopyalanir. Birden fazla: secici; her satirda etiket, scope ve tam komut.
- Sifreyle giris: komut `-i` olmadan kopyalanir; bildirim sifre icin kopyala butonunu hatirlatir.
- Aramadaki Mod+Enter, mobil aksiyon menusu ve network tablosundaki SSH butonu da credential'in `key_path`'ini kullanir.

### Test (0.7.0)

- Birim: `auth`/`key_path` okuma (yoksa password, bilinmeyen deger), key credential ekleme (alan sirasi, passphrase opsiyonel), SSH komutunda `-i` ve tirnaklama, sshTargets'in anahtari tasimasi.
- Manuel: key credential ekleme, tablo gorunumu, tek ve coklu adreste Copy SSH login, sifreli passphrase.

## 0.7.1: Duzenleme

- Credential, adres ve port satirlarinda kalem butonu; ekleme formu mevcut degerlerle acilir.
- Credential duzenleme: label, user, kind, note, auth ve key_path degisir; bos birakilan alan silinir. Secret bu formda degismez (Change password gecmisi korur). Id salt okunurdur (ref'ler ona baglidir). Bilinmeyen alanlar korunur.
- Adres/port duzenleme: bilinen alanlar formdan yeniden yazilir, bos olanlar silinir, bilinmeyen alanlar kalir. Kayit sirasi ve degeri (ip/port) dogrulanir; uyusmazsa "blok degisti". Adres porta ya da port adrese donusturulemez.
