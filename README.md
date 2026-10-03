# Przepiśnik

Wrzuć przepis jako **zdjęcie, link albo notatki** — AI z Gemini zamieni to w uporządkowany
przepis z listą składników i krokami, a listę składników dodasz jednym kliknięciem na listę zakupów.

Cała aplikacja to trzy pliki: `index.html`, `styles.css`, `app.js`. **Nie ma serwera ani buildu** —
działa po prostu otwarta w przeglądarce, z telefonu i z komputera, również z GitHub Pages.

---

## Szybki start

**Na komputerze:** kliknij dwukrotnie `index.html`. Gotowe.

**Na telefonie albo z repo:** wrzuć na GitHub Pages (niżej) albo uruchom lokalnie:

```bash
npm start          # http://localhost:3020
```

Potem w aplikacji: zakładka **⚙️ Ustawienia** → wklej swój klucz Gemini z
[Google AI Studio](https://aistudio.google.com/apikey).

---

## ⚠️ Klucz API jest w przeglądarce

Aplikacja działa w całości po stronie klucza, więc **klucz musi być w kodzie strony i każdy, kto
otworzy tę stronę, może go podejrzeć w narzędziach deweloperskich.** Dlatego:

- klucz wklejaj **w przeglądarce**, nigdy do plików repozytorium;
- w AI Studio ogranicz klucz do samego Gemini API;
- odznacz „Zapamiętaj klucz", jeśli korzystasz z współdzielonego lub publicznego urządzenia.

Jeśli kiedyś będziesz chciała ukryć klucz przed odwiedzającymi, trzeba dodać serwer (Cloudflare
Worker, Netlify Functions) — wtedy klucz zostaje w nim, a strona tylko prosi o niego.

---

## Jak tego używać

| Zakładka | Co robi |
| --- | --- |
| **📷 Import** | Zdjęcie (aparat lub galeria), link albo tekst → AI. Przed zapisem możesz wszystko poprawić. |
| **📖 Przepisy** | Wszystkie zapisane, wyszukiwanie po nazwie i składnikach, filtrowanie po tagach. |
| **🛒 Zakupy** | Lista zakupów. Pozycje z tego samego produktu sumują się (400 g + 200 g = 600 g). |
| **⚙️ Ustawienia** | Klucz, model Gemini, domyślne porcje, plik przepisów na GitHubie, eksport i import danych. |

Przy przepisie:

- **Porcje** – wpisz liczbę, a ilości przeliczą się same względem oryginału.
- Odznacz składniki, których nie kupujesz – przycisk doda tylko resztę.
- **Udostępnij** – link z przepisem w środku albo czytelny tekst do wklejenia (niżej).
- **Usuń przepis** – zniknie też z listy zakupów, ale tylko te pozycje, które pochodziły
  wyłącznie z tego przepisu.

Wszystkie dane leżą w `localStorage` tej przeglądarki albo — jeśli włączysz GitHuba — w pliku
`przepisy.json` w repozytorium (niżej). Zdjęcia importowane są **wysyłane do Gemini, ale nigdzie nie
są zapisywane**. Ręczna kopia zapasowa: Ustawienia → Eksport do pliku JSON.

Nawigacja (**Import / Przepisy / Zakupy / Ustawienia**) jest u góry strony, razem z nazwą
aplikacji — cały ten blok zostaje przyklejony przy przewijaniu.

---

## Przepisy w pliku na GitHubie (ten sam zestaw w każdej przeglądarce)

Przepisy w `localStorage` są **per urządzenie i per przeglądarka** — na telefonie masz swoje, na
komputerze inne. Jeśli chcesz **ten sam zestaw wszędzie**, w Ustawieniach wskaż repozytorium
GitHub. Aplikacja trzyma w nim plik `przepisy.json` i wymienia go z każdą przeglądarką:

- **Wczytuj z GitHuba przy każdym otwarciu** — otwierasz stronę na telefonie, komputerze czy
  tablecie i masz te same przepisy;
- **Zapisuj automatycznie** — każda zmiana (nowy przepis, usunięcie, pozycja na zakupach) po
  4 sekundach trafia do repozytorium; przed zamknięciem karty zapis idzie od razu;
- przyciski **Wczytaj z GitHuba** i **Zapisz na GitHubie** działają zawsze, gdy auto jest wyłączone.

Dzięki temu GitHub jest też **historią zmian** i kopią zapasową — w każdej chwili możesz cofnąć
przepis do poprzedniej wersji.

### Co trzeba zrobić

1. Załóż repozytorium na GitHubie. **Prywatne** — przepisy to nie sprawy publiczne (patrz niżej).
2. Wejdź w **Settings → Developer settings → Personal access tokens → Fine-grained tokens** i
   wystaw token: **tylko jedno** repozytorium, uprawnienie **Contents: Read and write**.
3. W Przepiśniku: **⚙️ Ustawienia → Ten sam plik przepisów wszędzie**, wpisz `twoj-user/nazwa-repo`
   (albo wklej cały adres — aplikacja sama wyczyści `https://github.com/`), wklej token, zaznacz obie
   automatyczne opcje i kliknij **Zapisz na GitHubie**.
4. Na drugim urządzeniu: wpisz to samo repozytorium i **ten sam token** (token nie przenosi się
   sam — jest sekretem przeglądarki, jak klucz Gemini).

### Zasady i granice

- **Token jest w przeglądarce**, więc przepisy trzymaj w **prywatnym** repo. W publicznym repo
  plik `przepisy.json` da się odczytać bez logowania — aplikacja ostrzega o tym w Ustawieniach.
  Najwygodniej: strona żyje w publicznym repo, a dane w osobnym prywatnym (`przepisnik-dane`).
- **Token nie zapisuje się w ustawieniach** ani w pliku przepisów — siedzi obok klucza Gemini,
  w pamięci sesji (albo na stałe, jeśli zaznaczysz „Zapamiętaj token na tym urządzeniu").
- **Dwie przeglądarki otwarte w tej samej chwili** mogą nadpisać się nawzajem: wygrywa ostatni zapis.
  Zmiany w rekordach przepisów są chronione datą — jeśli na telefonie poprawisz przepis później niż
  plik w repo, aplikacja zachowa Twoją wersję i wypchnie ją do repozytorium.
- Prywatne repozytorium z GitHub Pages wymaga płatnego planu — dlatego osobne repo na dane.
- Do zapisu wystarczy zwykły limit API (5000 zapytań/h na token); auto-zapis łączy kilka zmian w jedno.

---

## Dzielenie się przepisem

Przy przepisie jest karta **Udostępnij** z dwoma przyciskami:

- **Kopiuj link** — cały przepis siedzi w części adresu za znakiem `#`, więc link jest sam w sobie
  przepisem. Otwiera go ktokolwiek, w każdej przeglądarce, bez logowania i bez Twojego serwera;
  u odbiorcy otwiera się gotowy przepis w edytorze do poprawienia i zapisania. Treść **nigdy nie
  wychodzi na serwer strony** — to fragment adresu, którego przeglądarka nie wysyła.
- **Kopiuj tekstem** — czytelny przepis do wklejenia w komunikatorze; działa też jako
  awaryjny wariant, gdyby link był bardzo długi (przycisk sam ostrzega powyżej ~4000 znaków).

Do linków nadaje się **opublikowaną stronę** (GitHub Pages) — plik `index.html` otwarty z dysku
nie da się udostępnić, bo odbiorca nie miałby gdzie kliknąć. Poza ostrzeżeniem o długości link
jest zwykłym adresem HTTP.

---

## Miniaturki rysowane przez AI

Po każdym udanym imporcie Gemini **rysuje ilustrację dania** w tle i wstawia ją w miejsce ikony
🖼️ w polu „Zdjęcie”. Przepis otwiera się od razu — rysunek pojawia się, kiedy będzie gotowy
(wcześniej widać „Rysuję miniaturkę…”).

Dwie ważne rzeczy:

- **Modele graficzne wymagają płatnego planu Gemini.** Na darmowym planie API odpowiada 429
  („exceeded your current quota”) i miniaturki po prostu się nie pojawiają. Aplikacja wtedy
  wraca do ikony, **nie pokazuje błędu** i raz zapamiętuje blokadę; w Ustawieniach jest jedno
  zdanie i przycisk „Spróbuj rysowania ponownie”. Wyłączyć miniaturki można od znacznika
  **AI rysuje mały obrazek przepisu**.
- **Rysunek nie jest zapisywany** – znika po odświeżeniu strony (tak samo jak zdjęcia). Trzymanie
  go w pamięci przeglądarki na stałe wymagałoby IndexedDB; świadomie tego nie dodawałem, bo
  koszt jest niewielki, a `localStorage` i tak ma ~5 MB.

Modele próbowane po kolei: `gemini-2.5-flash-image`, potem `gemini-3.1-flash-image` (gdy pierwszy
zwróci 404). Odpowiedź musi ważyć mniej niż 1,4 MB.

---

## Wdrożenie na GitHub Pages

Cała zawartość strony to trzy pliki bez zależności, więc są trzy proste drogi.

### 1. Ręcznie (najszybciej)

1. Na GitHubie: **New repository** (nazwij np. `przepisnik`, zaznacz **Public**).
2. Wrzuć zawartość tego katalogu (przeciągnij pliki na stronę „Add files").
3. **Settings → Pages → Source: Deploy from a branch**, gałąź `main`, folder `/ (root)`, **Save**.
4. Adres będzie `https://twoj-user.github.io/przepisnik/`.

Uwaga: przy tej metodzie publiczne staną się też pliki testowe — są nieszkodliwe, ale możesz je
przed wrzuceniem usunąć (`test-*.mjs`, `serve.mjs`, `live-check.mjs`, `package.json`).

### 2. Automatycznie przez GitHub Actions (zalecane)

W repozytorium jest gotowy workflow `.github/workflows/pages.yml` — publikuje tylko
`index.html`, `styles.css` i `app.js`, a przed wdrożeniem uruchamia testy.

1. Wrzuć repo na GitHub (gałąź `main`).
2. **Settings → Pages → Source: GitHub Actions**.
3. Każdy push na `main` sam aktualizuje stronę i pokazuje adres w zakładce **Actions**.

### 3. Bez GitHuba

Cały katalog możesz wgrać na dowolny hosting statyczny (Netlify, Cloudflare Pages, Vercel).
Żadnej konfiguracji nie trzeba — wszystkie ścieżki w kodzie są względne.

---

## Import z linku — ważna uwaga

Przeglądarka nie może pobrać cudzej strony (blokada CORS), więc treść wczytuje samo Gemini —
tzw. **URL context**. Z tego wynikają ograniczenia:

- działa na modelach **Flash** (`gemini-3.5-flash` domyślnie). Gemini wycofało w 2026 modele 2.x
  dla nowych kluczy — aplikacja sama przeskakuje na działający, a przy innym błędzie 404
  podpowiada, żeby zmienić model;
- strona musi być **publicznie dostępna** — logowanie, płatność i paywall nie zadziałają;
- strona musi pokazywać przepis od razu; aplikacje renderujące recepturę dopiero po kliknięciu
  (`Kliknij, aby zobaczyć przepis`) nie mają czego czytać.

W takich przypadkach wystarczy **zakładka Tekst** i wklejenie przepisu — albo zrzut ekranu do
zakładki Zdjęcie.

Jeśli Gemini nie odczyta strony, mówi o tym wprost (`isRecipe: false` + komunikat), a nie
zmyśla przepisu.

Import z linku to najwolniejsza ścieżka (w realnym teście od 5 do 90 s, zależnie od serwera strony
i obciążenia Gemini), dlatego przyciskiem **Anuluj** można przerwać czekanie.

---

## Testy

```bash
npm test          # wszystko
npm run test:quick # bez zależności (sprawdzenie + logika)
```

| Plik | Co sprawdza |
| --- | --- |
| `test-wiring.mjs` | spójność szkieletu: czy każde `#id` użyte w JS istnieje w HTML, czy każda klasa jest w CSS, czy nic nie wycieka do `fetch` poza Gemini i GitHubem, czy klucz nie leci w URL, czy token nie ląduje w pliku przepisów ani w ustawieniach, czy nie ma niescapowanych danych w `innerHTML`. |
| `test-logic.mjs` | ładuje `app.js` w `node:vm` z atrapą DOM i sprawdza logikę: jednostki, ułamki, skalowanie, scalanie listy zakupów, budowę zapytania do Gemini (przepis i miniaturka), mapowanie błędów (401/404/429/503/brak sieci), obronę przed danymi z importowanego pliku, zapis i odczyt pliku `przepisy.json` na GitHubie (sha, gałąź, base64 z polskimi znakami) oraz kodowanie i odkodowywanie przepisu w linku. |
| `test-ui.mjs` | przeklika całą aplikację w prawdziwym DOM (jsdom): klucz, import z tekstu, linku i zdjęcia, czyszczenie pól po imporcie, anulowanie, miniaturki rysowane przez AI (także blokada z powodu limitu planu), edycja, zapis, skalowanie porcji, dodanie do zakupów, scalanie ilości, usuwanie, eksport/import, odzyskiwanie szkicu, zapis i wczytywanie na GitHubie (w tym auto-zapis, dociąganie zapisu przy zamykaniu karty i ochrona nowszych danych) oraz udostępnianie linkiem od strony odbiorcy. |

`test-ui.mjs` potrzebuje jsdom, więc przed nim `npm install` (albo samo `npm ci` na CI).
Test uruchamia się w pamięci – nie zapisuje niczego w `localStorage` przeglądarki.

### Test na prawdziwym API

```bash
# PowerShell – klucz nigdy nie trafia na dysk
$env:GEMINI_KEY = "AIza..."; npm run live; Remove-Item Env:\GEMINI_KEY
```

`live-check.mjs` to nie jest test aplikacji, tylko jednorazowa weryfikacja integracji: wysyła
przez ten sam kod `buildRequest`/`callGemini` zapytanie z tekstem, linkiem i obrazem, wypisuje
kody HTTP, czasy odpowiedzi i to, co Gemini odczytało. Klucz czyta **wyłącznie ze zmiennej
środowiskowej**. Skrypt warto odpalić, gdy Gemini coś zmieni w modelach (tak było w 2026 —
modele 2.x zostały wycofane).

**Nie ma tu testu wizualnego w przeglądarce** – patrz „Ograniczenia” niżej.

---

## Ograniczenia

- **Bez serwera = brak sekretów.** Klucz jest widoczny w przeglądarce (patro wyżej), tak samo token
  GitHuba.
- **Przechowywanie w `localStorage`.** Przepisy są per urządzenie i per przeglądarka; po
  czyszczeniu danych przeglądarki znikają. Dlatego eksport do JSON i opcjonalny plik na GitHubie.
- **GitHub to synchronizacja, nie multiurządzenie w czasie rzeczywistym.** Dwie przeglądarki otwarte
  naraz mogą nadpisać się nawzajem (wygrywa ostatni zapis); po zamknięciu jednej i otwarciu drugiej
  wszystko jest już zsynchronizowane.
- **Link do przepisu działa tylko na opublikowanej stronie** — plik `index.html` z dysku nie ma
  adresu, pod którym odbiorca mógłby otworzyć przepis.
- **Zdjęcia nie są zapisywane** – `localStorage` ma ~5 MB, a zdjęcia z telefonu są duże.
  Świadomie odpuściłem je, żeby nie zaśmiecać pamięci. Tak samo rysunki AI: znikają po
  odświeżeniu strony.
- **Miniaturki wymagają płatnego planu Gemini** (modele graficzne odpowiadają 429 na darmowym
  koncie). Na darmowym planie import działa, a w miejscu ikony zostaje ikona.
- **Import z linku** zależy od URL context Gemini i od tego, czy strona jest publiczna.
- **Gemini wycofuje modele** i zmienia nazwy. Domyślny `gemini-3.5-flash` przetestowany
  3 października 2026; jak API zacznie odpowiadać 404, aplikacja podpowie zmianę modelu
  (albo sama przeskocze na nowy, jeśli stary był zapisany w ustawieniach).
- **Interfejs nie był sprawdzony wizualnie** w przeglądarce — testy klikają przez aplikację
  w jsdom, ale nie renderują jej. Logika, przepływy i spójność HTML/CSS są pokryte testami,
  a wygląd na telefonie warto obejrzeć po wdrożeniu i dopracować w `styles.css`.
- Brak planera posiłków i eksportu do formatu do druku — świadomie, żeby nie rozrastać
  aplikacji.
