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
- Minimum Obsidian surumu: `vault.process` icin 1.1.0+ (mobil davranisi manuel test kapsaminda dogrulanir).

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
- `minAppVersion` = 1.1.0 (`vault.process`) dogrulanir; kod blogu processor'unun ve pano temizliginin mobilde manuel test edilmesi.
- Manifest teyit edilir: `isDesktopOnly: false`; Node API kullanilmiyor (yalnizca Web Crypto).
