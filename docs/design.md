# Infra Ledger - Tasarim

Tarih: 2026-10-22
Durum: Onaylandi (v1 kapsami), v2/v3 taslak

## Amac

Cok sayida sunucu, veritabani, cloud hesabi ve servis icin baglanti bilgilerini ve credential'lari Obsidian vault'u icinde, harici servis kullanmadan, aranabilir ve disiplinli bir yapida tutmak. Sifre degistiginde eski degerin tarihiyle birlikte gecmise yazilmasi.

Mevcut durum: bilgiler ~45 dosyaya dagilmis, etiketsiz code block'lar, proje notlarina gomulu SQL ve .env parcalari. Plugin once duzgun bir yapi kurar (v1), sonra dagitik veriyi toplamaya ve sifrelemeye yardim eder (v2).

## Isimlendirme

- Gorunen isim: `Infra Ledger`
- Plugin id: `infra-ledger`
- Repo: `aligundogdu/Infra-Ledger`
- Code block dili: `creds`

## Veri modeli

### Kaynak (resource)

Her kaynak bir markdown notudur. Kaynak olarak taninmasi icin frontmatter'da `type` alani gerekir.

```yaml
---
type: server          # server | database | cloud | service  (zorunlu)
ip: 1.2.3.4           # opsiyonel
host: db.example.com  # opsiyonel
url: https://...      # opsiyonel (panel, konsol)
provider: hetzner     # opsiyonel
env: prod             # opsiyonel (prod | stage | dev | ... serbest)
ssh_port: 22          # opsiyonel, varsayilan 22
tags: [seodisias]     # opsiyonel
---
```

Frontmatter duz (flat) tutulur, ic ice yapi yoktur. Boylece Obsidian properties arayuzu, arama ve Dataview sorunsuz calisir. Notun geri kalani serbest metindir, plugin dokunmaz.

### Credential

Credential'lar kaynak notunun icinde bir ya da birden fazla ` ```creds ` blogunda, YAML liste olarak durur.

```yaml
- id: seodisias-root        # zorunlu, vault genelinde benzersiz
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
- `id` vault genelinde benzersiz olmali. Cakisma durumunda iki kayit da indekste "duplicate" uyarisiyla isaretlenir, yazma islemleri reddedilir.
- `ref` girdisi sadece `ref` alanini tasir. Hedef bulunamazsa satir "cozulemeyen referans" uyarisiyla gosterilir.
- Bilinmeyen alanlar korunur (okunur, yeniden yazimda kaybolmaz).

## v1 Kapsami

### 1. Parser ve indeks

- `parseCredsBlock(text) -> { entries, errors }`: saf fonksiyon, Obsidian'a bagimli degil. `yaml` paketi (Document API) ile parse edilir, boylece yeniden yazimda yorumlar ve sira korunur.
- `LedgerIndex`: vault acilinca (`onLayoutReady`) tum markdown dosyalarini tarar. Frontmatter'i `metadataCache`'ten okur; `creds` blogu iceren dosyalari `metadataCache` section bilgisinden bulup icerigini okur.
- `vault.on('modify' | 'rename' | 'delete')` ve `metadataCache.on('changed')` ile ilgili dosya yeniden indekslenir (debounce 300ms).
- Indeks icerigi: kaynaklar (dosya yolu, ad, frontmatter alanlari), credential'lar (id, kaynak dosyasi, alanlar), referanslar, hatalar.

### 2. Blok gorunumu

- `registerMarkdownCodeBlockProcessor('creds', ...)` ile okuma modunda (ve live preview'da) blok tablo olarak render edilir.
- Kolonlar: label, user, kind, secret (maskeli `••••••`), aksiyonlar.
- Aksiyonlar: goster/gizle, kullanici kopyala, secret kopyala, sifreyi degistir, gecmis.
- `ref` satirlari hedef credential'in bilgileriyle, kaynak notuna link ile gosterilir.
- YAML hatasi varsa tablo yerine hata kutusu (satir numarasiyla) gosterilir; yazma aksiyonlari devre disi.
- Kopyalanan secret ayarlanan sure sonra (varsayilan 30 sn) panodan temizlenir. Temizleme oncesi pano hala ayni degeri tasiyorsa temizlenir; pano okunamiyorsa (mobil) yine de temizlenir.

### 3. Sifreyi degistir

- Modal: yeni secret (elle veya "uret" butonu), opsiyonel sebep.
- Islem: mevcut `secret`, `until: <bugun>` ve `reason` ile `history` listesinin basina eklenir; `secret` yeni degerle, `updated` bugunle guncellenir.
- Dosya `vault.process()` ile atomik yazilir. Blok, icindeki `id` ile bulunur (pozisyona guvenilmez). Blok bulunamazsa ya da parse edilemezse islem iptal edilir ve Notice gosterilir.
- Sifre uretici: `crypto.getRandomValues`, ayarlanabilir uzunluk (varsayilan 24) ve karakter seti (sembol ac/kapa, karisabilecek karakterleri haric tut).

### 4. Gecmis

- Modal: credential'in history listesi tarih sirasiyla; her eski secret maskeli, goster/kopyala ile.

### 5. Hizli arama

- Komut: "Infra Ledger: Search". `SuggestModal` uzerinde fuzzy arama.
- Aranan alanlar: kaynak adi, type, ip, host, provider, env, tags; credential label, user, kind, id.
- Sonuclar credential bazinda listelenir (her satir: `kaynak > label (user)`); credential'i olmayan kaynaklar da kaynak satiri olarak cikar.
- Tuslar:
  - Enter: secret kopyala
  - Shift+Enter: user kopyala
  - Mod+Enter: SSH komutu kopyala (`ssh -p <ssh_port> <user>@<ip|host>`, sadece ip/host varsa)
  - Alt+Enter: kaynak notunu ac
- Modal altinda tus kisayollari ipucu olarak gosterilir.

### 6. Yeni kaynak

- Komut: "Infra Ledger: New resource". Tip secimi, ad girisi, not ayarlardaki klasorde (varsayilan `Infra`) tipe ozel sablonla olusturulur ve acilir.
- Sablon: frontmatter iskeleti + bos bir `creds` blogu.

### Ayarlar (v1)

- Kaynak klasoru (varsayilan `Infra`)
- Pano temizleme suresi (sn, 0 = kapali)
- Sifre uretici: uzunluk, semboller, karisan karakterleri haric tut

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
  util/clipboard.ts    Kopyala + zamanli temizle
  util/generator.ts    Sifre uretici
  util/ssh.ts          SSH komutu olusturma
```

Saf moduller (`creds/*`, `util/generator.ts`, `util/ssh.ts`, arama esleme mantigi) Obsidian API'sine bagimli degildir ve birim testlerle kapsanir.

## Teknik kararlar

- TypeScript, esbuild (resmi sample plugin yapisi), `vitest` ile birim test.
- `yaml` npm paketi (Document API, yorum ve sira korunur).
- Mobil destek: `isDesktopOnly: false`. Node API'si kullanilmaz; kripto icin Web Crypto.
- Minimum Obsidian surumu: `vault.process` icin 1.1.0+.

## Hata yonetimi

- Parse hatasi: render'da hata kutusu, indekste hata kaydi, yazma reddi.
- Duplicate id: iki kayit da uyari ile isaretlenir, yazma reddi.
- Yazma sirasinda blok bulunamazsa (dosya bu arada degismis): islem iptal, Notice.
- Hicbir durumda plugin bloku tahminle yeniden yazmaz.

## Test

- Birim (vitest): parse (gecerli, bozuk YAML, eksik alan, ref, bilinmeyen alan), mutate (sifre degisimi history'ye ekler, yorumlar korunur, bilinmeyen alanlar korunur, birden fazla blok iceren notta dogru blok), locate, generator (uzunluk, karakter seti), ssh komutu, arama esleme.
- Manuel: test vault'unda build edilmis plugin ile senaryolar (render, kopyala, degistir, gecmis, arama, yeni kaynak).

## v2 Taslak (ayri spec ile detaylanacak)

### Sifreleme (opsiyonel, geri alinabilir)

- Varsayilan kapali.
- Rastgele bir veri anahtari (DEK, AES-256-GCM). DEK iki kez sarilir: ana paroladan PBKDF2-SHA256 ile turetilen anahtarla ve kurulumda uretilen kurtarma anahtariyla. Sarilmis anahtarlar plugin data'sinda tutulur.
- Sadece `secret` alanlari (ve history icindeki secret'lar) sifrelenir: `enc:v1:<iv-b64>:<ct-b64>`.
- Komutlar: "Tumunu sifrele", "Tumunu coz", "Parolayi degistir", kilitle/kilidi ac. Oturum kilidi zaman asimi.
- Format dokumante edilir; plugin olmadan cozmek icin kucuk bir script repoda bulunur.

### Secret tarayici ve ice aktarma

- Vault'u sifre/key/IP/DSN gorunumlu satirlar icin tarar (kaynak notlari haric).
- Bulgu listesinde her biri icin: hedef kaynak sec (veya yeni olustur), label/user/kind gir, ice aktar.
- Ice aktarilan satirin yerine `[[Kaynak]]` linki koymayi teklif eder.

## v3 Taslak

- Yan panelde envanter gorunumu: filtreler (type, env, provider, tag).
- Uyarilar: N gundur degismeyen sifreler, cozulemeyen referanslar, duplicate id'ler.
- Kaynak alanlari icin gecmis (IP degisimi vb.), ihtiyac olursa.
