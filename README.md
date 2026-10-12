# Rozvrh – plánovač času

Týždenný rozvrh, úlohy s termínmi a návrhy, kedy čo robiť. Jedna appka pre PC aj mobil, dáta sa synchronizujú cez Supabase.

## Čo appka vie

- **Prihlásenie a registrácia** s overením e-mailu, zabudnuté heslo, odhlásenie. Odkaz z e-mailu funguje aj na inom zariadení.
- **Môj týždeň**: pravidelné bloky (vyučovanie, tréningy, brigáda, voľný čas) s dňami, časom a platnosťou (napr. na polrok).
  - **Rozvrh hodín ako tabuľka**: hodiny × dni, píšeš len predmety. Susedné rovnaké hodiny sa spoja do dvojhodinovky, rovnaký predmet v rovnakom čase v rôzne dni sa uloží ako jeden blok. Enter skočí o hodinu nižšie, predmety sa našepkávajú.
  - **Zvonenie**: časy hodín nastavíš raz v Nastaveniach, potom stačí kliknúť „3.–4. hodina“.
  - **Párne a nepárne týždne**: každý blok môže platiť každý týždeň, len v nepárnom alebo len v párnom. Ktorý týždeň je ktorý, nastavíš jedným klikom v Nastaveniach a ďalej sa striedajú samé.
  - „Uložiť a pridať ďalší“ nechá dni aj párnosť a posunie sa na ďalšiu hodinu.
- **Spoje (autobusy, vlaky)**: nie sú v pravidelnom týždni. Uložíš si ich raz a v Rozvrhu ich vkladáš len do dní konkrétneho týždňa, keď ich potrebuješ. „Skopírovať cesty z minulého týždňa“ prenesie všetky cesty jedným klikom.
- **Úlohy**: čo treba urobiť, dôležitosť (4 úrovne s vlastnými farbami), odhad času, termín, kategória, priebeh.
- **Plánovač** (tlačidlo *Navrhnúť plán*): nájde voľný čas medzi rozvrhom a udalosťami a rozloží do neho prácu na úlohách. Návrh je zakreslený „ceruzkou“, každý blok môžeš prijať, posunúť alebo zahodiť. Pravidlá:
  - nikdy neprekrýva rozvrh, udalosti ani prijaté bloky; plánuje len medzi začiatkom a koncom dňa,
  - najprv to, čo horí (blízky termín), a to, čo je dôležité,
  - denný limit práce, prestávka po každom bloku, najviac 2 bloky jednej úlohy za deň (ak termín nehorí),
  - každý večer drží voľný čas, ktorý obetuje len vtedy, keď by sa termín inak nestihol,
  - keď sa niečo nezmestí, povie, koľko času chýba.
- **Drag & drop v rozvrhu**: bloky práce (aj návrhy ceruzkou) a udalosti presúvaš myšou na iný čas alebo deň, spodným okrajom meníš dĺžku; na mobile blok podržíš a potiahneš. Časy sa prichytávajú na 15 minút, prekrytie s iným blokom appka ukáže. Esc ťahanie zruší.
- **Mobil**: kompaktná hlavička, pás dní na prepínanie (aj swipe do strán), pohľady Deň / 3 dni / Týždeň, spoje a termíny v spodnom paneli, dialógy ako spodné panely, kalendár s bodkami a zoznamom vybraného dňa.
- **Kalendár**: udalosti, cesty, pripomienky, celodenné akcie, termíny úloh; mesačný prehľad.
- **Upozornenia** (keď je appka otvorená): pripomienky a udalosti s upozornením vopred, voliteľne aj začiatok bloku práce.
- **Synchronizácia v reálnom čase**: zmena na PC sa na mobile prejaví do ~1 s (Supabase Realtime) a naopak.
- Svetlá a tmavá téma, rozloženie pre mobil (spodná navigácia, denný pohľad).

## Spustenie

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # testy plánovača
npm run build      # produkčný build do dist/
```

Pripojenie na databázu je v `.env` (nie je v gite), vzor je v `.env.example`.

### Inštalácia ako appka na PC

Otvor appku v Chrome alebo Edge a v adresnom riadku klikni na ikonu **Inštalovať** (alebo menu → *Inštalovať appku Rozvrh*). Spustí sa vo vlastnom okne s ikonou na ploche a v štarte. Rovnako sa dá „pridať na plochu“ v mobile.

## Supabase

- Projekt: `aiTimetable` (`zykkkkxudmvinrgpwvqc`), organizácia *aiTimeslop*, región Frankfurt.
- Schéma je v `supabase/migrations/`. Každá tabuľka má RLS: používateľ vidí a mení len svoje riadky. Kategórie a úlohy sa dajú prepájať len v rámci jedného účtu (zložené cudzie kľúče).
- Po registrácii sa automaticky vytvorí profil a základné kategórie (Škola, Práca, Osobné, Voľný čas, Hry, Cestovanie).

### Treba nastaviť v Supabase dashboarde

1. **Authentication → URL Configuration**
   - *Site URL*: adresa, kde appka beží (lokálne `http://localhost:3000`, neskôr produkčná doména).
   - *Redirect URLs*: pridaj `http://localhost:3000/**` a produkčnú doménu s `/**`.
2. **E-maily (dôležité)**: zabudovaný e-mailový server Supabase posiela overovacie e-maily **len členom tímu organizácie** a len pár za hodinu. Na testovanie so svojím e-mailom to stačí. Pre ostatných používateľov nastav vlastné SMTP v **Authentication → Emails → SMTP Settings** (napr. Resend, Brevo, SendGrid). S vlastným SMTP sa dajú aj šablóny e-mailov preložiť do slovenčiny.
3. Overenie e-mailu (*Confirm email*) je zapnuté predvolene, netreba nič meniť.

### Vlastné e-maily (overenie, nové heslo…)

Šablóny v štýle appky (slovensky, bez obrázkov, fungujú v Gmaili, Outlooku aj na mobile) sú v `supabase/templates/`. Generuje ich `scripts/email-templates.mjs`, takže meníš len tento jeden súbor a spustíš `npm run emails`.

Free projekt Supabase so zabudovaným e-mailovým serverom šablóny upraviť **nedovolí**, najprv treba vlastné SMTP:

1. Založ si účet u poskytovateľa SMTP:
   - **Brevo** (300 e-mailov denne zadarmo) overí aj samotnú adresu odosielateľa, nepotrebuješ vlastnú doménu,
   - **Resend** alebo **Postmark** majú lepšiu doručiteľnosť, ale chcú vlastnú doménu.
2. Vytvor si prístupový token Supabase: https://supabase.com/dashboard/account/tokens
3. Do `.env.local` (nie je v gite) daj `SUPABASE_ACCESS_TOKEN` a `SMTP_*` hodnoty podľa `.env.example`.
4. Spusti `npm run emails:apply`. Nahrá SMTP nastavenia, predmety aj šablóny naraz.

Ručne to ide aj v dashboarde: *Authentication → Emails* (SMTP Settings a potom Templates, obsah súborov skopíruj dnu).

## Architektúra

```
src/
  lib/planner.ts        plánovací algoritmus (čistá funkcia, testy v planner.test.ts)
  lib/data.tsx          načítanie dát, zápisy a Realtime synchronizácia
  lib/supabase.ts       klient Supabase
  auth/                 prihlásenie, registrácia, reset hesla
  components/TimeGrid   mriežka rozvrhu (týždeň aj deň)
  editor/               dialógy pre udalosti, úlohy, pravidelné bloky, naplánované bloky
  pages/                Rozvrh, Kalendár, Úlohy, Môj týždeň, Nastavenia
supabase/migrations/    databázová schéma
```

React + TypeScript + Vite, PWA cez `vite-plugin-pwa`, dátumy `date-fns` (slovenská lokalizácia).

## Mobilná verzia neskôr

Kód je pripravený na zabalenie cez [Capacitor](https://capacitorjs.com) do natívnej appky pre Android a iOS, bez prepisovania:

```bash
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init Rozvrh sk.rozvrh.app --web-dir dist
npm run build && npx cap add android && npx cap open android
```

Potom sa oplatí doplniť:
- `@capacitor/local-notifications` pre pripomienky aj pri zatvorenej appke,
- deep link (napr. `sk.rozvrh.app://`) do *Redirect URLs* v Supabase, aby odkaz z e-mailu otvoril appku.

Podobne sa dá pre PC vyrobiť klasický `.exe` cez Tauri alebo Electron, ak by inštalácia z prehliadača nestačila.

## Čo ďalej

- Push notifikácie pri zatvorenej appke (Web Push + Supabase Edge Function).
- Ťahanie blokov myšou v rozvrhu.
- AI asistent, ktorý z textu („v piatok mám test z chémie, potrebujem 3 hodiny“) vytvorí úlohu a doplní plán.
