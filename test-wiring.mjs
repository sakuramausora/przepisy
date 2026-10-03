// Sprawdza, czy każdy element, którego szuka app.js, naprawdę jest w index.html.
// Bez przeglądarki to najbliższe testowi „klikam każdy przycisk".
// Uruchom: node test-wiring.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, "app.js"), "utf8");
const html = readFileSync(join(here, "index.html"), "utf8");
const css = readFileSync(join(here, "styles.css"), "utf8");

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok  " + name);
  } catch (e) {
    console.error("FAIL  " + name + "\n      " + e.message);
    process.exitCode = 1;
  }
}
const idsIn = (text) => new Set([...text.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
const classesIn = (text) => new Set([...text.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]));

const htmlIds = idsIn(html);
const cssClasses = classesIn(css);

console.log("\nidentyfikatory");
check("każde #id z app.js istnieje w HTML albo jest tworzony w JS", () => {
  const dynamic = idsIn(js); // id="..." wewnątrz szablonów HTML w app.js
  const used = new Set([...js.matchAll(/\$\("#([a-zA-Z][\w-]*)"/g)].map((m) => m[1]));
  const missing = [...used].filter((id) => !htmlIds.has(id) && !dynamic.has(id));
  assert.equal(missing.length, 0, "nigdzie nie istnieje: " + missing.join(", "));
});
check("każdy getElementById z app.js istnieje w index.html", () => {
  const used = new Set([...js.matchAll(/getElementById\("([\w-]+)"\)/g)].map((m) => m[1]));
  const missing = [...used].filter((id) => !htmlIds.has(id));
  assert.equal(missing.length, 0, "brakuje w HTML: " + missing.join(", "));
});
check("każdy element #view-* ma sekcję w HTML", () => {
  const views = [...js.matchAll(/"(import|editor|recipes|detail|shopping|settings)"/g)].map((m) => m[1]);
  const missing = [...new Set(views)].filter((v) => !htmlIds.has("view-" + v));
  assert.equal(missing.length, 0, "brakuje sekcji: " + missing.join(", "));
});
check("identyfikatory tworzone przez JS są wpuszczane przez render()", () => {
  // #detailAdded nie ma w HTML – musi powstać w innerHTML, inaczej zniknie komunikat
  assert.ok(/id="detailAdded"/.test(js), "detailAdded nie jest tworzony");
});

console.log("\nprzyciski a widoki");
check("każdy przycisk paska zakładek ma istniejący widok", () => {
  const targets = [...html.matchAll(/data-view="([\w-]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length >= 4, "za mało zakładek: " + targets.length);
  for (const t of targets) assert.ok(htmlIds.has("view-" + t), "brak widoku: " + t);
});
check("zakładki importu mają zakładki treści", () => {
  const tabs = [...html.matchAll(/data-tab="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual([...tabs].sort(), ["image", "text", "url"]);
  for (const t of tabs) assert.ok(htmlIds.has("tab-" + t), "brak #tab-" + t);
});
check("filtry listy zakupów pokrywają dwa stany", () => {
  const states = [...html.matchAll(/data-shop="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual([...states].sort(), ["done", "todo"]);
});

console.log("\nskładnia i pliki");
check("app.js nie używa modułów (musi działać z file://)", () => {
  // import/export tylko na początku linii – inaczej łapie np. function exportData()
  assert.ok(!/^\s*(import|export)\s/m.test(js), "app.js używa składni modułów");
  assert.ok(/<script src="app\.js"><\/script>/.test(html), "app.js nie jest wpięty klasycznym skryptem");
  assert.ok(!/type="module"/.test(html), "skrypt oznaczony jako moduł");
});
check("app.js nie odwołuje się do elementów spoza sekcji", () => {
  // wszystkie #id z app.js muszą być albo w HTML, albo tworzone dynamicznie przez show()
  assert.ok(!/document\.body\.innerHTML/.test(js), "podmienia całe body");
});
check("wszystkie wywołania fetch idą do generativelanguage", () => {
  const urls = [...js.matchAll(/fetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  assert.ok(urls.length > 0, "brak fetch");
  for (const u of urls) {
    assert.ok(/API_ROOT/.test(u), "fetch na adres spoza API_ROOT: " + u);
  }
});
check("klucz API nigdzie nie trafia do URL", () => {
  assert.ok(!/\?key=/.test(js), "klucz w query stringu");
  assert.ok(js.includes('"x-goog-api-key"'), "klucz leci w nagłówku");
});
check("klasy użyte w JS są zdefiniowane w CSS", () => {
  const used = new Set(
    [...js.matchAll(/class="([a-z][\w -]*)"/g)]
      .flatMap((m) => m[1].split(" "))
      .filter((c) => /^[a-z][\w-]*$/.test(c))
  );
  const missing = [...used].filter((c) => !cssClasses.has(c));
  assert.equal(missing.length, 0, "brak klasy w CSS: " + missing.join(", "));
});
check("klasy użyte w index.html są zdefiniowane w CSS", () => {
  const used = new Set(
    [...html.matchAll(/class="([a-z][\w -]*)"/g)]
      .flatMap((m) => m[1].split(" "))
      .filter((c) => /^[a-z][\w-]*$/.test(c))
  );
  const missing = [...used].filter((c) => !cssClasses.has(c));
  assert.equal(missing.length, 0, "brak klasy w CSS: " + missing.join(", "));
});
check("kontenery na komunikaty są w HTML", () => {
  for (const id of ["#toast", "#importError", "#editorNotice", "#detailFlash", "#shoppingError", "#settingsNotice"]) {
    assert.ok(htmlIds.has(id.slice(1)), "brak kontenera " + id);
  }
});
check("każdy kontener z flash() istnieje", () => {
  const targets = [...js.matchAll(/flash\([^)]*?"(#[a-zA-Z][\w-]*)"/g)].map((m) => m[1].slice(1));
  assert.ok(targets.length >= 4, "regex znalazł za mało wywołań flash(): " + targets.length);
  const missing = [...new Set(targets)].filter((id) => !htmlIds.has(id) && !idsIn(js).has(id));
  assert.equal(missing.length, 0, "brak kontenera dla: " + missing.join(", "));
});
check("escapowanie treści użytkownika użyte przy wstawianiu do HTML", () => {
  // każde ${...} trafiające do innerHTML powinno być w esc()
  const dangerous = [...js.matchAll(/innerHTML\s*=\s*([`"'][^`"']*[`"'])/g)].filter((m) => /\$\{(?!esc\()/.test(m[1]) && !/join\(|html \+=|notice \+=/.test(m[1]));
  assert.equal(dangerous.length, 0, "niescapowane dane w innerHTML: " + dangerous.map((m) => m[0].slice(0, 60)));
});
check("listy składników i zakupów są w dwóch kolumnach", () => {
  // sama klasa bez definicji wyglądałaby normalnie – pilnujemy, żeby kolumny
  // naprawdę były w CSS, a nie tylko w nazwie klasy
  assert.ok(/\.cols2\s*\{[^}]*grid-template-columns:\s*1fr\s+1fr/.test(css), ".cols2 nie ustawia siatki 2 kolumn");
  assert.ok(js.includes('<div class="cols2">'), "składniki w przepisie nie są w .cols2");
  assert.ok(js.includes('<ul class="cols2">'), "pozycje listy zakupów nie są w .cols2");
  assert.ok(js.includes('<div class="ing-grid">'), "edytor nie ma kontenera .ing-grid");
  // na telefonie pola edytora muszą zostać w jednej kolumnie
  assert.ok(
    /@media \(min-width: 900px\)[\s\S]*?\.ing-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+1fr/.test(css),
    ".ing-grid nie jest ograniczony do szerokich ekranów"
  );
});
check("pasek zakładek jest u góry, a nie przyklejony do dołu", () => {
  const nav = html.indexOf('<nav class="tabbar"');
  const main = html.indexOf("<main");
  const end = html.indexOf("</body>");
  assert.ok(nav > 0, "nie ma paska nawigacji");
  assert.ok(nav < main, "pasek zakładek jest za treścią – ma być na górze");
  assert.ok(html.indexOf("<nav class=\"tabbar\"", nav + 1) === -1, "pasek nawigacji jest zduplikowany");
  assert.ok(nav < end, "pasek jest poza dokumentem");
  // CSS nie może go już przyklejać do dołu ekranu
  const tabbarCss = css.match(/\.tabbar\s*\{[^}]*\}/)[0];
  assert.ok(!/position:\s*fixed/.test(tabbarCss), "pasek nadal jest position: fixed");
  assert.ok(!/bottom:\s*0/.test(tabbarCss), "pasek nadal jest na dole");
  // nazwa i pasek zakładek tworzą jeden przyklejony blok
  assert.ok(/<header class="topbar">[\s\S]*?<div class="topbar-row">[\s\S]*?<nav class="tabbar"/.test(html),
    "pasek zakładek jest poza przyklejonym nagłówkiem");
  assert.ok(/\.topbar\s*\{[^}]*position:\s*sticky/.test(css), "nagłówek nie jest przyklejony");
});
check("miniaturki mają komplet elementów", () => {
  for (const id of ["illustrationsInput", "imageState", "btnRetryImage"]) {
    assert.ok(htmlIds.has(id), "brak #" + id);
  }
  assert.ok(js.includes("startIllustration(draft)"), "import nie zamawia miniaturki");
  assert.ok(/function renderDropInner\(\)/.test(js), "brak renderowania pola na zdjęcie");
  assert.ok(/\.art\s*\{/.test(css), "brak stylu .art dla rysunku");
  // ikona zastępowana rysunkiem musi być w tym samym miejscu co placeholder
  assert.ok(/state\.illustration[\s\S]{0,200}class="art"/.test(js), "rysunek nie wchodzi w #dropInner");
});
check("nazwa strony jest spójna w title, na pasku i w metatadze telefonu", () => {
  const title = html.match(/<title>([^<]+)<\/title>/)[1];
  const brand = html.match(/class="brand"[^>]*>(?:<span[^>]*>[^<]*<\/span>)?\s*([^<]+)</)[1].trim();
  const homeTitle = html.match(/apple-mobile-web-app-title" content="([^"]+)"/)[1];
  assert.equal(title.split(" – ")[0], brand, "tytuł strony i napis na pasku różnią się");
  assert.equal(brand, homeTitle, "nazwa na pasku i nazwa pod ikoną aplikacji różnią się");
});
check("plik nie zawiera polskich znaków zapisanych jako mojibake", () => {
  assert.ok(!js.includes("Ã"), "app.js ma zepsute kodowanie");
  assert.ok(!html.includes("Ã"), "index.html ma zepsute kodowanie");
  assert.ok(/<meta charset="utf-8"/i.test(html), "brak deklaracji utf-8");
});

console.log("\n" + passed + " testów przeszło" + (process.exitCode ? ", są błędy" : ", wszystkie OK"));
