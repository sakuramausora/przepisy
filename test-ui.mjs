// Test interfejsu w prawdziwym DOM (jsdom) – klikamy przez całą aplikację.
// Uruchom: npm install && node test-ui.mjs
// (bez jsdom test po prostu się pomija, żeby „npm test” działał na gołym folderze)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

let JSDOM, VirtualConsole;
try {
  ({ JSDOM, VirtualConsole } = await import("jsdom"));
} catch {
  console.log("\nPominięto testy interfejsu – brak jsdom.");
  console.log("Zainstaluj zależności: npm install");
  process.exit(0);
}

const here = dirname(fileURLToPath(import.meta.url));
const appSource = readFileSync(join(here, "app.js"), "utf8");
const html = readFileSync(join(here, "index.html"), "utf8");

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log("  ok  " + name);
  } catch (e) {
    console.error("FAIL  " + name + "\n      " + (e && e.message));
    process.exitCode = 1;
  }
}

/** Uruchamia aplikację w świeżym jsdom i zwraca udogodnienia. */
async function boot(options = {}) {
  const virtualConsole = new VirtualConsole();
  const errors = [];
  virtualConsole.on("jsdomError", (e) => errors.push("jsdomError: " + e.message));
  virtualConsole.on("error", (msg) => errors.push("console.error: " + msg));

  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    pretendToBeVisual: true,
    url: "https://example.test/przepisnik/",
    virtualConsole,
  });
  const { window } = dom;
  const doc = window.document;
  const fetchCalls = [];

  window.fetch = async (url, init) => {
    fetchCalls.push({ url, init });
    return options.fetchResponse(url, init);
  };
  window.confirm = () => (options.confirmAnswer ?? true);
  window.scrollTo = () => {};
  if (!window.crypto.randomUUID) {
    let n = 0;
    Object.defineProperty(window, "crypto", { value: { randomUUID: () => "id-" + ++n } });
  }
  // stan z poprzedniej sesji (np. test „szkic przeżywa odświeżenie")
  for (const [store, entries] of Object.entries(options.storage || {})) {
    for (const [k, v] of Object.entries(entries)) window[store].setItem(k, v);
  }
  // skrót na testy, które nie chcą dodatkowego zapytania o miniaturkę
  if (options.settings) {
    const raw = window.localStorage.getItem("recipe-bro.settings");
    window.localStorage.setItem(
      "recipe-bro.settings",
      JSON.stringify({ ...(raw ? JSON.parse(raw) : {}), ...options.settings })
    );
  }

  // Trzeba poczekać na prawdziwe DOMContentLoaded jsdomu – inaczej trzeba by je
  // wysłać ręcznie, a init() odpaliłby się wtedy drugi raz i każdy przycisk
  // dostałby dwa nasłuchy.
  await new Promise((r) => setTimeout(r, 0));
  window.eval(appSource);
  assert.notEqual(doc.readyState, "loading", "readyState – inicjalizacja byłaby podwójna");

  const $ = (sel) => doc.querySelector(sel);
  const $$ = (sel) => [...doc.querySelectorAll(sel)];
  const view = () => $$("main > section").find((s) => !s.classList.contains("hidden"))?.id;
  const text = (sel) => $(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
  const values = (sel) => $$(sel).map((el) => el.value);
  const click = (sel) => {
    const el = typeof sel === "string" ? $(sel) : sel;
    assert.ok(el, "nie znaleziono elementu: " + sel);
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    return el;
  };
  const setValue = (sel, value) => {
    const el = typeof sel === "string" ? $(sel) : sel;
    assert.ok(el, "nie znaleziono inputa: " + sel);
    el.value = value;
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    el.dispatchEvent(new window.Event("change", { bubbles: true }));
    return el;
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { dom, window, doc, $, $$, view, text, values, click, setValue, tick, errors, fetchCalls };
}

/** Odpowiedź Gemini, która tytuł zależy od tego, co wysłaliśmy w treści. */
function echoTitleResponse() {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    const sent = body.contents[0].parts[0].text;
    return geminiResponse({ title: sent.includes("Naleśniki") ? "Naleśniki z sera" : "Placki ziemniaczane" });
  };
}

/** Podstawia FileReader, który natychmiast „czyta" podaną treść. */
function stubFileReader(ui, content) {
  ui.window.FileReader = function () {
    this.readAsText = () => {
      this.result = content;
      this.onload();
    };
  };
}

/** Symuluje wybór pliku – jsdom nie otwiera okna dialogowego po click(). */
function pickFile(ui, selector, file = {}) {
  const input = ui.$(selector);
  const stub = { name: "plik", type: "", size: 1024, ...file };
  Object.defineProperty(input, "files", { value: [stub], configurable: true });
  input.dispatchEvent(new ui.window.Event("change", { bubbles: true }));
}

/**
 * Atry dla ścieżki „import ze zdjęcia": jsdom nie ma FileReader dla plików
 * pamięciowych, Image nie dekoduje, a canvas bez pakietu `canvas` rzuca wyjątek.
 * Bez tego cała gałąź zdjęcia byłaby nietestowana.
 */
function stubImagePipeline(ui) {
  ui.window.FileReader = function () {
    this.readAsDataURL = () => {
      this.result = "data:image/jpeg;base64,QUJD";
      this.onload();
    };
  };
  ui.window.Image = function () {
    this.width = 400;
    this.height = 300;
    Object.defineProperty(this, "src", {
      set() {
        this.onload();
      },
    });
  };
  ui.window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {} });
  ui.window.HTMLCanvasElement.prototype.toDataURL = () => "data:image/jpeg;base64,QUJD";
}

const IMAGE_FILE = { name: "przepis.jpg", type: "image/jpeg" };

/** Odpowiedź z obrazkiem – dokładnie tak wygląda odpowiedź modelu graficznego. */
function imageResponse(data = "QUJD", mimeType = "image/png") {
  return {
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }),
  };
}

/** Po imporcie aplikacja woła Gemini dwukrotnie: po przepis i po miniaturkę. */
function isRecipeCall(call) {
  try {
    return JSON.parse(call.init.body).generationConfig?.responseMimeType === "application/json";
  } catch {
    return false;
  }
}

function isImageCall(call) {
  try {
    return JSON.parse(call.init.body).generationConfig?.responseModalities?.[0] === "IMAGE";
  } catch {
    return false;
  }
}

const recipeCalls = (ui) => ui.fetchCalls.filter(isRecipeCall);
const imageCalls = (ui) => ui.fetchCalls.filter(isImageCall);

/** Odpowiedź Gemini w formacie, w jakim naprawdę przychodzi. */
function geminiResponse(overrides = {}) {  const payload = {
    isRecipe: true,
    confidenceNote: "",
    title: "Placki ziemniaczane",
    description: "Proste placki.",
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 10,
    totalMinutes: 30,
    tags: ["szybkie", "wegetariańskie"],
    ingredients: [
      { raw: "600 g ziemniaków", name: "ziemniaki", quantity: 600, unit: "g", note: "" },
      { raw: "1 szypułka czosnku", name: "czosnek", quantity: 1, unit: "szt", note: "" },
      { raw: "2 łyżki mąki", name: "mąka pszenna", quantity: 2, unit: "łyżka", note: "opcjonalnie" },
    ],
    steps: [
      { text: "Zetrzeć ziemniaki.", durationMinutes: 10 },
      { text: "Wymieszać i smażyć.", durationMinutes: 20 },
    ],
    warnings: [],
    ...overrides,
  };
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
  };
}

console.log("\nnawigacja");
await test("startuje na zakładce importu bez klucza", async () => {
  const ui = await boot();
  assert.equal(ui.view(), "view-import");
  assert.match(ui.text("#importNotice"), /Brak klucza API/);
  assert.equal(ui.$("#keyPill").className, "keypill bad");
  assert.equal(ui.text("#keyPill"), "brak klucza");
});

await test("wszystkie zakładki otwierają swoje widoki", async () => {
  const ui = await boot();
  const pairs = [
    ["recipes", "view-recipes"],
    ["shopping", "view-shopping"],
    ["settings", "view-settings"],
    ["import", "view-import"],
  ];
  for (const [tab, expected] of pairs) {
    ui.click(`.tabbar button[data-view="${tab}"]`);
    assert.equal(ui.view(), expected, `zakładka ${tab}`);
    const current = ui.$$(".tabbar button").filter((b) => b.getAttribute("aria-current") === "page");
    assert.equal(current.length, 1, "dokładnie jedna aktywna zakładka");
  }
});

await test("przycisk klucza prowadzi do ustawień", async () => {
  const ui = await boot();
  ui.click("#keyPill");
  assert.equal(ui.view(), "view-settings");
});

console.log("\nklucz API");
await test("zapamiętywanie klucza przeżywa przeładowanie", async () => {
  const ui = await boot();
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaMojKlucz");
  assert.match(ui.text("#settingsNotice"), /zapamiętany na stałe/);
  assert.equal(ui.$("#keyPill").className, "keypill ok");
  assert.equal(ui.window.localStorage.getItem("recipe-bro.key"), "AIzaMojKlucz");
  // to samo localStorage, nowa karta
  const ui2 = await boot({ storage: { localStorage: { "recipe-bro.key": "AIzaMojKlucz" } } });
  assert.equal(ui2.text("#keyPill"), "klucz ✓");
  ui2.click('.tabbar button[data-view="settings"]');
  assert.equal(ui2.$("#apiKeyInput").value, "AIzaMojKlucz", "pole nie zostało wypełnione po przeładowaniu");
  assert.match(ui2.text("#settingsNotice"), /zapamiętany na stałe/);
});

await test("odznaczenie „zapamiętaj” chodzi do sessionStorage", async () => {
  const ui = await boot();
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaChwilowy");
  ui.$("#rememberKey").checked = false;
  ui.$("#rememberKey").dispatchEvent(new ui.window.Event("change", { bubbles: true }));
  assert.equal(ui.window.localStorage.getItem("recipe-bro.key"), null);
  assert.equal(ui.window.sessionStorage.getItem("recipe-bro.key"), "AIzaChwilowy");
  assert.match(ui.text("#settingsNotice"), /tylko do zamknięcia karty/);
});

await test("klucz nie trafia do settings (nie idzie na dysk razem z resztą)", async () => {
  const ui = await boot();
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTajny");
  const stored = JSON.parse(ui.window.localStorage.getItem("recipe-bro.settings"));
  assert.equal(stored.apiKey, undefined, "klucz jest w settings – trafiłby do eksportu");
});

await test("kursor nie skacze: wpisywanie nie przepisuje pola", async () => {
  const ui = await boot();
  ui.click('.tabbar button[data-view="settings"]');
  const input = ui.$("#apiKeyInput");
  input.value = "AIza";
  input.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  input.value = "AIzaX";
  input.dispatchEvent(new ui.window.Event("input", { bubbles: true }));
  assert.equal(input.value, "AIzaX", "wartość pola została nadpisana");
  assert.equal(ui.$("#keyPill").className, "keypill ok");
});

console.log("\nimport z tekstu");
await test("przepis z tekstu trafia do recenzji i zapisuje się", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  assert.equal(ui.view(), "view-import");
  assert.equal(ui.$("#tab-text").classList.contains("hidden"), false, "zakładka tekstu się nie pokazała");

  ui.setValue("#textInput", "Placki ziemniaczane: 600 g ziemniaków, czosnek, mąka.");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(ui.view(), "view-editor");
  assert.match(ui.text("#editorBody"), /Proste placki\./);
  assert.equal(ui.values('[data-f="title"]')[0], "Placki ziemniaczane");
  assert.deepEqual(ui.values('[data-ing-field="name"]'), ["ziemniaki", "czosnek", "mąka pszenna"]);
  assert.deepEqual(ui.values('[data-step-field="text"]'), ["Zetrzeć ziemniaki.", "Wymieszać i smażyć."]);
  // podgląd ułożonej linii składnika
  assert.deepEqual(
    ui.$$("[data-preview]").map((el) => el.textContent),
    ["1. 600 g ziemniaki", "2. 1 szt czosnek", "3. 2 łyżka mąka pszenna"]
  );

  ui.click("#btnSaveDraft");
  await ui.tick();
  assert.equal(ui.view(), "view-detail");
  assert.match(ui.text("#detailBody"), /Placki ziemniaczane/);
  assert.match(ui.text("#detailFlash"), /Zapisano/);
  assert.equal(ui.$$("#recipesList .card.recipe").length, 0);
});

await test("wysyłany jest poprawny JSON do Gemini", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków.");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(recipeCalls(ui).length, 1);
  const call = recipeCalls(ui)[0];
  assert.match(call.url, /generativelanguage\.googleapis\.com.*gemini-3\.5-flash:generateContent$/);
  assert.equal(call.init.headers["x-goog-api-key"], "AIzaTest");
  const body = JSON.parse(call.init.body);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseSchema.properties.ingredients, "brak schematu");
  assert.match(body.contents[0].parts[0].text, /ziemniak/);
  assert.equal(body.tools, undefined, "import z tekstu nie potrzebuje urlContext");
});

await test("wolny import można anulować", async () => {
  // fetch wisi, dopóki nie przyjdzie sygnał przerwania – jak wolne wifi
  const ui = await boot({
    fetchResponse: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new ui.window.Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      }),
  });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(ui.fetchCalls.length, 1, "zapytanie wystartowało");
  assert.ok(ui.$("#btnParse").disabled, "przycisk zablokowany w trakcie");
  assert.equal(ui.$("#btnCancelParse").classList.contains("hidden"), false, "przycisk anulowania widoczny");
  assert.match(ui.text("#parseStatus"), /porządkuję przepis/);

  ui.click("#btnCancelParse");
  await ui.tick();
  assert.match(ui.text("#importError"), /Anulowano/);
  assert.equal(ui.$("#btnParse").disabled, false, "przycisk wrócił");
  assert.ok(ui.$("#btnCancelParse").classList.contains("hidden"), "anulowanie schowane po zakończeniu");
  assert.equal(ui.view(), "view-import");
});

await test("po udanym imporcie pole tekstu jest puste", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(ui.view(), "view-editor", "sądzimy z edytora");
  assert.equal(ui.values("#textInput")[0], "", "stare notatki zostały w polu");
  assert.equal(ui.values('[data-f="title"]')[0], "Placki ziemniaczane", "przepis jest w szkicu");
});

await test("przy błędzie i anulowaniu tekst zostaje, żeby spróbować ponownie", async () => {
  const ui = await boot({
    fetchResponse: () => ({ ok: false, status: 503, text: async () => JSON.stringify({ error: { message: "overloaded" } }) }),
  });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();

  assert.match(ui.text("#importError"), /przeciążone/);
  assert.equal(ui.values("#textInput")[0], "Placki ziemniaczane z ziemniaków i czosnku.", "tekst zniknął po błędzie");
  assert.equal(ui.view(), "view-import");
});

await test("po udanym imporcie link jest pusty", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="url"]');
  ui.setValue("#urlInput", "https://example.test/przepis");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(ui.view(), "view-editor");
  assert.equal(ui.values("#urlInput")[0], "", "adres został w polu");
});

await test("przy błędzie importu z linku adres zostaje do powtórki", async () => {
  const ui = await boot({
    fetchResponse: () => ({ ok: false, status: 503, text: async () => JSON.stringify({ error: { message: "overloaded" } }) }),
  });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="url"]');
  ui.setValue("#urlInput", "https://example.test/przepis");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(ui.values("#urlInput")[0], "https://example.test/przepis", "adres zniknął po błędzie");
});

await test("po udanym imporcie zdjęcie jest odznaczone", async () => {
  const ui = await boot({
    fetchResponse: () => geminiResponse({ title: "Placki" }),
    settings: { illustrations: false },
  });
  stubImagePipeline(ui);
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  pickFile(ui, "#fileGallery", IMAGE_FILE);
  assert.ok(ui.window.Przepisnik.state.pendingImage, "zdjęcie nie zostało wybrane");
  ui.setValue("#imageHint", "przepis od mamy");
  ui.click("#btnParse");
  await ui.tick();

  assert.equal(ui.view(), "view-editor");
  assert.equal(recipeCalls(ui).length, 1, "zdjęcie nie poszło do Gemini");
  assert.equal(JSON.parse(recipeCalls(ui)[0].init.body).contents[0].parts[0].inlineData.mimeType, "image/jpeg");
  assert.equal(imageCalls(ui).length, 0, "miniaturki wyłączone, a mimo to poszło zapytanie");
  assert.equal(ui.window.Przepisnik.state.pendingImage, null, "zdjęcie zostało w stanie po imporcie");
  assert.equal(ui.text("#imageInfo"), "", "nazwa pliku została w widoku");
  assert.equal(ui.values("#imageHint")[0], "", "podpowiedź została");
  assert.match(ui.text("#dropInner"), /Kliknij, żeby wybrać zdjęcie/, "ramka nie wróciła do początkowego wyglądu");
  assert.equal(ui.$("#cameraRow").hidden, true, "przyciski telefonu zostały na ekranie");
});

await test("zdjęcie zostaje wybrane, gdy import się nie uda", async () => {
  const ui = await boot({
    fetchResponse: () => ({ ok: false, status: 500, text: async () => JSON.stringify({ error: { message: "boom" } }) }),
  });
  stubImagePipeline(ui);
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  pickFile(ui, "#fileGallery", IMAGE_FILE);
  ui.click("#btnParse");
  await ui.tick();

  assert.ok(ui.window.Przepisnik.state.pendingImage, "zdjęcie zniknęło mimo błędu");
  assert.match(ui.text("#imageInfo"), /Wybrano/, "zniknęła informacja o wybranym pliku");
  assert.equal(ui.view(), "view-import");
});

// --- miniaturki rysowane przez AI ---------------------------------------

/** Odpowiada raz na zapytanie o przepis i raz na zapytanie o miniaturkę. */
function recipeThenArt(art = () => imageResponse()) {
  return (url, init) => (isImageCall({ init }) ? art() : geminiResponse({ title: "Naleśniki z sera" }));
}

async function importFromText(ui, text = "Naleśniki z sera, mąka, twaróg, jajka.") {
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", text);
  ui.click("#btnParse");
  await ui.tick();
  await ui.tick();
}

await test("miniaturka wchodzi w miejsce ikony w polu na zdjęcie", async () => {
  const ui = await boot({ fetchResponse: recipeThenArt(() => imageResponse("SEVMQ0U", "image/jpeg")) });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  await importFromText(ui);

  assert.equal(recipeCalls(ui).length, 1);
  assert.equal(imageCalls(ui).length, 1, "miniatury nie zamówiono");
  const sent = JSON.parse(imageCalls(ui)[0].init.body).contents[0].parts[0].text;
  assert.match(sent, /Naleśniki z sera/, "model nie dostał nazwy przepisu");
  assert.equal(ui.$("#dropInner .art")?.getAttribute("src"), "data:image/jpeg;base64,SEVMQ0U");
  assert.equal(ui.view(), "view-editor", "edytor nie może czekać na rysunek");
});

await test("miniaturka pojawia się też po powrocie do zakładki Zdjęcie", async () => {
  const ui = await boot({ fetchResponse: recipeThenArt() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  await importFromText(ui);
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="image"]');

  assert.ok(ui.$("#dropInner .art"), "rysunek zniknął przy zmianie zakładki");
});

await test("wybranie nowego zdjęcia kasuje starą miniaturkę", async () => {
  const ui = await boot({ fetchResponse: recipeThenArt() });
  stubImagePipeline(ui);
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  await importFromText(ui);
  pickFile(ui, "#fileGallery", IMAGE_FILE);

  assert.equal(ui.$("#dropInner .art"), null, "stary rysunek został przy nowym zdjęciu");
  assert.match(ui.text("#dropInner"), /przepis\.jpg/);
  assert.equal(ui.window.Przepisnik.state.illustrating, false, "rysowanie starego przepisu nie zostało przerwane");
});

await test("limit planu nie psuje importu – wraca ikona i jest jedno zdanie w Ustawieniach", async () => {
  const art = () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ error: { message: "You exceeded your current quota" } }),
  });
  const ui = await boot({ fetchResponse: recipeThenArt(art) });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  await importFromText(ui);

  assert.equal(ui.view(), "view-editor", "limit miniatur nie może zatrzymać przepisu");
  assert.match(ui.text("#dropInner"), /Kliknij, żeby wybrać zdjęcie/, "ramka nie wróciła do ikony");
  assert.equal(ui.text("#toast"), "", "limit nie może być krzykiem na ekranie");
  assert.equal(ui.window.Przepisnik.state.settings.illustrationsBlocked, true);
  assert.match(ui.text("#imageState"), /odmawia generowania obrazów/);
  assert.equal(ui.$("#btnRetryImage").classList.contains("hidden"), false, "nie ma jak odblokować");
});

await test("po zablokowaniu aplikacja nie odpytuje o miniaturkę przy każdym imporcie", async () => {
  const art = () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ error: { message: "quota" } }),
  });
  const ui = await boot({ fetchResponse: recipeThenArt(art) });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  await importFromText(ui);
  const raz = imageCalls(ui).length;

  ui.click('#btnSaveDraft');
  await ui.tick();
  ui.click('.tabbar button[data-view="import"]');
  await importFromText(ui, "Drugi przepis: pierogi z serem i cebulką.");

  assert.equal(recipeCalls(ui).length, 2, "drugi przepis się nie zaimportował");
  assert.equal(imageCalls(ui).length, raz, "aplikacja pyta o obraz mimo zapamiętanej blokady");
});

await test("„Spróbuj ponownie” odblokowuje miniaturki", async () => {
  let allowArt = false;
  const ui = await boot({
    fetchResponse: recipeThenArt(() =>
      allowArt
        ? imageResponse()
        : { ok: false, status: 429, text: async () => JSON.stringify({ error: { message: "quota" } }) }
    ),
  });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  await importFromText(ui);
  assert.equal(ui.window.Przepisnik.state.settings.illustrationsBlocked, true);

  allowArt = true;
  ui.click('.tabbar button[data-view="settings"]');
  ui.click("#btnRetryImage");
  await ui.tick();

  assert.equal(ui.window.Przepisnik.state.settings.illustrationsBlocked, false);
  assert.match(ui.text("#imageState"), /Model graficzny/);
  assert.equal(ui.$("#btnRetryImage").classList.contains("hidden"), true);
});

await test("miniaturki można wyłączyć w Ustawieniach", async () => {
  const ui = await boot({ fetchResponse: recipeThenArt() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click("#illustrationsInput");
  assert.match(ui.text("#imageState"), /wyłączone/);

  await importFromText(ui);

  assert.equal(recipeCalls(ui).length, 1);
  assert.equal(imageCalls(ui).length, 0, "wyłączone miniaturki nadal są generowane");
});

await test("za krótki tekst jest odrzucany bez zapytania do Gemini", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "jajka");
  ui.click("#btnParse");
  await ui.tick();
  assert.match(ui.text("#importError"), /minimum kilka zdań/);
  assert.equal(ui.fetchCalls.length, 0);
  assert.equal(ui.view(), "view-import");
});

await test("brak klucza kończy się czytelnym komunikatem", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  assert.match(ui.text("#importError"), /Brak klucza API/);
  assert.equal(ui.fetchCalls.length, 0);
});

await test("błąd Gemini trafia do użytkownika", async () => {
  const ui = await boot({
    fetchResponse: () => ({ ok: false, status: 401, text: async () => JSON.stringify({ error: { message: "API key not valid" } }) }),
  });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaZly");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  assert.match(ui.text("#importError"), /klucz/i);
  assert.equal(ui.$("#btnParse").disabled, false, "przycisk został zablokowany");
});

console.log("\nedytor");
await test("poprawka tytułu i składnika przechodzi do zapisu", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();

  ui.setValue('[data-f="title"]', "Placki po mojemu");
  const nameInput = ui.$('[data-ing-field="name"]');
  ui.setValue(nameInput, "ziemniak młody");
  assert.match(ui.text('[data-preview]'), /ziemniak młody/, "podgląd się nie odświeżył");
  // pole nie może stracić fokusu przez przerysowanie
  assert.equal(ui.$('[data-ing-field="name"]'), nameInput);

  ui.click("#btnSaveDraft");
  await ui.tick();
  assert.match(ui.text("#detailBody"), /Placki po mojemu/);
  assert.match(ui.text("#detailBody"), /ziemniak młody/);
});

await test("dodanie i usunięcie składnika oraz kroku", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();

  const beforeIng = ui.$$('[data-ing-field="name"]').length;
  ui.click("#btnAddIng");
  assert.equal(ui.$$('[data-ing-field="name"]').length, beforeIng + 1);

  ui.click(ui.$("[data-ing-del]"));
  assert.equal(ui.$$('[data-ing-field="name"]').length, beforeIng);

  ui.click("#btnAddStep");
  assert.equal(ui.$$('[data-step-field="text"]').length, 3);
  // pusty wiersz nie może zostać zapisany
  ui.click("#btnSaveDraft");
  await ui.tick();
  assert.equal(ui.view(), "view-detail");
  assert.equal(ui.$$("#detailBody .detail-step").length, 2, "pusty krok trafił do przepisu");
});

await test("kolejność kroków można zmienić", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  assert.match(ui.$$('[data-step-field="text"]')[0].value, /Zetrzeć/);
  ui.click(ui.$('[data-step-move="down"]'));
  assert.match(ui.$$('[data-step-field="text"]')[0].value, /Wymieszać/);
  assert.match(ui.$$('[data-step-field="text"]')[1].value, /Zetrzeć/);
});

await test("przycisk „opcjonalne” przełącza składnik", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  const opt = ui.$$("[data-ing-opt]").filter((b) => b.getAttribute("aria-pressed") === "true");
  assert.equal(opt.length, 1, "jeden składnik powinien być opcjonalny");
  ui.click(opt[0]);
  assert.equal(ui.$$("[data-ing-opt]").filter((b) => b.getAttribute("aria-pressed") === "true").length, 0);
});

await test("przepis bez tytułu nie zapisuje się", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  ui.setValue('[data-f="title"]', "   ");
  ui.click("#btnSaveDraft");
  await ui.tick();
  assert.match(ui.text("#editorNotice"), /musi mieć tytuł/);
  assert.equal(ui.view(), "view-editor");
});

await test("anulowanie wraca do importu i nie zapisuje", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  ui.click("#btnCancelDraft");
  assert.equal(ui.view(), "view-import");
  assert.equal(ui.window.sessionStorage.getItem("recipe-bro.draft"), null, "szkic został w sesji");
});

await test("niedokończony szkic wraca po odświeżeniu strony", async () => {
  const ui = await boot({ fetchResponse: echoTitleResponse() });
  await withRecipe(ui);
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Naleśniki z sera");
  ui.click("#btnParse");
  await ui.tick();
  assert.equal(ui.values('[data-f="title"]')[0], "Naleśniki z sera");
  const savedDraft = ui.window.sessionStorage.getItem("recipe-bro.draft");

  // nowa karta z tym samym szkicem w sesji
  const ui2 = await boot({ storage: { sessionStorage: { "recipe-bro.draft": savedDraft } } });
  assert.equal(ui2.view(), "view-editor", "szkic nie wrócił");
  assert.equal(ui2.values('[data-f="title"]')[0], "Naleśniki z sera");
  ui2.click("#btnSaveDraft");
  await ui2.tick();
  assert.equal(ui2.view(), "view-detail");
  assert.match(ui2.text("#detailBody"), /Naleśniki z sera/);
});

console.log("\nprzepisy i wyszukiwanie");
async function withRecipe(ui) {
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#apiKeyInput", "AIzaTest");
  ui.click('.tabbar button[data-view="import"]');
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.setValue("#textInput", "Placki ziemniaczane z ziemniaków i czosnku.");
  ui.click("#btnParse");
  await ui.tick();
  ui.click("#btnSaveDraft");
  await ui.tick();
}

await test("zapisany przepis jest na liście i widać go po wyszukaniu", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click('.tabbar button[data-view="recipes"]');
  assert.match(ui.text("#recipesSub"), /1 zapisany przepis/);
  assert.match(ui.text("#recipesList"), /Placki ziemniaczane/);
  assert.match(ui.text("#recipesList"), /wegetariańskie/);

  ui.setValue("#searchInput", "czosnek");
  assert.match(ui.text("#recipesList"), /Placki/);
  ui.setValue("#searchInput", "naleśniki");
  assert.match(ui.text("#recipesList"), /Nic nie pasuje/);
  ui.setValue("#searchInput", "");
});

await test("filtrowanie po tagu", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click('.tabbar button[data-view="recipes"]');
  const tags = ui.$$("#tagBar [data-tag]").map((b) => b.dataset.tag);
  assert.deepEqual(tags, ["", "szybkie", "wegetariańskie"]);
  ui.click('#tagBar [data-tag="wegetariańskie"]');
  assert.match(ui.text("#recipesList"), /Placki/);
  ui.click('#tagBar [data-tag="szybkie"]');
  assert.match(ui.text("#recipesList"), /Placki/);
});

await test("usuwanie przepisu z listy", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click('.tabbar button[data-view="recipes"]');
  ui.click("[data-del]");
  await ui.tick();
  assert.match(ui.text("#recipesList"), /Nie masz jeszcze żadnego przepisu/);
  assert.equal(JSON.parse(ui.window.localStorage.getItem("recipe-bro.recipes")).length, 0);
});

await test("usuwanie przepisu odmówione zostawia przepis", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse(), confirmAnswer: false });
  await withRecipe(ui);
  ui.click('.tabbar button[data-view="recipes"]');
  ui.click("[data-del]");
  await ui.tick();
  assert.match(ui.text("#recipesList"), /Placki ziemniaczane/);
});

console.log("\nskalowanie i lista zakupów");
await test("zmiana porcji przelicza składniki", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  assert.match(ui.text("#detailBody"), /ziemniaki 600 g/);
  ui.setValue("#detailServings", "6");
  assert.match(ui.text("#detailBody"), /ziemniaki 900 g/);
  assert.match(ui.text("#detailBody"), /×1\.5 oryginalne/);
  ui.setValue("#detailServings", "2");
  assert.match(ui.text("#detailBody"), /ziemniaki 300 g/);
});

await test("odznaczenie składnika zmienia liczbę w przycisku", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  assert.match(ui.text("#btnAddToShop"), /Dodaj 3 skł\./);
  const box = ui.$("[data-toggle-ing]");
  box.checked = false;
  box.dispatchEvent(new ui.window.Event("change", { bubbles: true }));
  assert.match(ui.text("#btnAddToShop"), /Dodaj 2 skł\./);
  assert.match(ui.text("#btnSelectAll"), /Zaznacz wszystkie/);
  ui.click("#btnSelectAll");
  assert.match(ui.text("#btnAddToShop"), /Dodaj 3 skł\./);
  assert.equal(ui.$("#btnSelectAll"), null, "przycisk powinien zniknąć");
});

await test("składniki są w dwóch kolumnach", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  const cols = ui.$$("#detailBody .cols2");
  assert.equal(cols.length, 1, "przepis ma jeden kontener listy składników");
  assert.equal(cols[0].querySelectorAll(".ing-item").length, 3, "wszystkie składniki są w kontenerze");

  ui.click("#btnAddToShop");
  await ui.tick();
  ui.click('.tabbar button[data-view="shopping"]');
  const list = ui.$$("#shoppingList ul.cols2");
  assert.equal(list.length, 1, "pozycje zakupów są w jednej siatce");
  assert.equal(list[0].querySelectorAll(".shop-item").length, 3, "wszystkie pozycje w siatce");
});

await test("dodanie do zakupów sumuje ilości tego samego produktu", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();
  assert.match(ui.text("#detailBody"), /Dodane do listy zakupów/);
  assert.match(ui.text("#shopBadge"), /^3$/);

  ui.click("#btnGoShopping");
  assert.equal(ui.view(), "view-shopping");
  assert.match(ui.text("#shoppingList"), /ziemniaki/);
  assert.match(ui.text("#shoppingList"), /600 g/);
  assert.match(ui.text("#shoppingList"), /Placki ziemniaczane/, "grupa jest nazwana przepisem");

  // drugi przepis z tym samym składnikiem ma zwiększyć ilość
  ui.window.Przepisnik.state.recipes.push({
    id: "r2",
    title: "Naleśniki",
    servings: 2,
    totalMinutes: 20,
    tags: [],
    ingredients: [{ id: "i1", raw: "300 g ziemniaków", name: "ziemniaki", quantity: 300, unit: "g", note: "" }],
    steps: [],
    warnings: [],
    sourceType: "manual",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  ui.click('.tabbar button[data-view="recipes"]');
  ui.click('#recipesList [data-open="r2"]');
  assert.match(ui.text("#detailBody"), /Naleśniki/);
  ui.click("#btnAddToShop");
  await ui.tick();
  ui.click('.tabbar button[data-view="shopping"]');
  const names = ui.$$("#shoppingList .shop-item .name").map((n) => n.textContent.trim());
  assert.equal(names.filter((n) => n === "ziemniaki").length, 1, "powstały dwie pozycje ziemniaków");
  assert.match(ui.text("#shoppingList"), /900 g/);
  assert.match(ui.text("#shoppingList"), /Wiele przepisów/);
});

await test("odznaczanie, kasowanie i czyszczenie listy", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();

  ui.click('.tabbar button[data-view="shopping"]');
  assert.equal(ui.text("#shopBadge"), "3");
  const names = () => ui.$$("#shoppingList .shop-item .name").map((n) => n.textContent.trim());
  const first = names()[0];

  const box = ui.$("[data-shop-check]");
  box.checked = true;
  box.dispatchEvent(new ui.window.Event("change", { bubbles: true }));
  assert.equal(ui.text("#shopBadge"), "2", "odznaczona pozycja nie znika z licznika");
  assert.deepEqual(names(), names().filter((n) => n !== first), "odznaczona pozycja została na liście");

  ui.click('[data-shop="done"]');
  assert.deepEqual(names(), [first], "zakładka „kupione” pokazuje tylko odznaczone");

  // odznaczamy resztę i kasujemy – zostaje pusta lista.
  // Po każdym kliknięciu lista się przerysowuje, więc szukamy od nowa.
  ui.click('[data-shop="todo"]');
  for (let i = 0; i < 10 && ui.$("[data-shop-check]"); i++) {
    const next = ui.$("[data-shop-check]");
    next.checked = true;
    next.dispatchEvent(new ui.window.Event("change", { bubbles: true }));
  }
  assert.match(ui.text("#shoppingList"), /Wszystko kupione/);
  ui.click("#btnClearChecked");
  assert.match(ui.text("#shoppingList"), /Lista jest pusta/, "lista nie jest pusta po skasowaniu kupionych");
  assert.match(ui.text("#shoppingSub"), /Pusto – dodaj składniki z przepisu/);
  assert.equal(ui.$("#shopBadge").classList.contains("hidden"), true);
});

await test("ręczne dopisywanie i podwójne potwierdzenie czyszczenia", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();
  ui.click('.tabbar button[data-view="shopping"]');

  ui.setValue("#manualItem", "chleb");
  ui.click("#btnManual");
  assert.match(ui.text("#shoppingList"), /chleb/);
  assert.match(ui.text("#shoppingList"), /Dopisane ręcznie/);
  assert.equal(ui.$("#manualItem").value, "", "pole nie wyczyściło się po dodaniu");
  assert.equal(ui.text("#shopBadge"), "4");

  ui.click("#btnClearAll");
  assert.match(ui.text("#shoppingError"), /Kliknij jeszcze raz/);
  assert.match(ui.text("#shoppingList"), /ziemniaki/, "pierwsze kliknięcie nie czyści");
  ui.click("#btnClearAll");
  assert.match(ui.text("#shoppingList"), /Lista jest pusta/);
  assert.equal(ui.$("#shopBadge").classList.contains("hidden"), true);
});

await test("usuwanie pojedynczej pozycji z listy", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();
  ui.click('.tabbar button[data-view="shopping"]');
  assert.equal(ui.$$("[data-shop-del]").length, 3);
  ui.click(ui.$("[data-shop-del]"));
  assert.equal(ui.$$("[data-shop-del]").length, 2);
});

await test("usunięcie przepisu sprząta jego pozycje z zakupów", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();
  ui.click('.tabbar button[data-view="shopping"]');
  ui.setValue("#manualItem", "chleb");
  ui.click("#btnManual");
  ui.click('.tabbar button[data-view="recipes"]');
  ui.click("[data-del]");
  await ui.tick();
  ui.click('.tabbar button[data-view="shopping"]');
  assert.match(ui.text("#shoppingList"), /chleb/, "wpis dodany ręcznie zniknął razem z przepisem");
  assert.doesNotMatch(ui.text("#shoppingList"), /ziemniaki/);
});

console.log("\nedycja przepisu");
await test("edycja istniejącego przepisu nie gubi źródła i dat", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnEditRecipe");
  assert.equal(ui.view(), "view-editor");
  ui.setValue('[data-f="title"]', "Placki z serem");
  ui.click("#btnSaveDraft");
  await ui.tick();
  assert.equal(ui.view(), "view-detail");
  assert.match(ui.text("#detailBody"), /Placki z serem/);
  assert.match(ui.text("#detailBody"), /z tekstu/, "źródło przepadło");
  const saved = JSON.parse(ui.window.localStorage.getItem("recipe-bro.recipes"));
  assert.equal(saved.length, 1);
  assert.equal(saved[0].sourceType, "text");
  assert.ok(saved[0].createdAt, "brak createdAt");
});

await test("zmiana porcji w edytorze nie zostawia starych przeskalowanych ilości", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.setValue("#detailServings", "8");
  assert.match(ui.text("#detailBody"), /ziemniaki 1200 g/);
  ui.click("#btnEditRecipe");
  ui.setValue('[data-f="servings"]', "6");
  ui.click("#btnSaveDraft");
  await ui.tick();
  // nowa baza to 6 porcji, więc ilości wracają do oryginalnych 600 g
  assert.match(ui.text("#detailBody"), /ziemniaki 600 g/, "nadal skaluje do starych porcji");
  assert.doesNotMatch(ui.text("#detailBody"), /oryginalne/, "przycisk sugeruje skalowanie");
  assert.equal(ui.$("#detailServings").value, "6", "pole porcji pokazuje nową wartość");
});

console.log("\nustawienia i dane");
await test("eksport tworzy plik z przepisami i listą", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();
  let blob = null;
  ui.window.Blob = function (parts, opts) {
    blob = { parts, opts };
  };
  ui.window.URL.createObjectURL = () => "blob:test";
  ui.click('.tabbar button[data-view="settings"]');
  ui.click("#btnExport");
  assert.ok(blob, "nie utworzono pliku");
  const data = JSON.parse(blob.parts[0]);
  assert.equal(data.recipes.length, 1);
  assert.equal(data.shopping.length, 3);
  assert.equal(blob.opts.type, "application/json");
});

await test("import pliku wczytuje przepisy i nie wywala się na śmieciach", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  stubFileReader(
    ui,
    JSON.stringify({
      recipes: [{ id: "x", title: "Importowany", ingredients: [{ name: "sól" }, null, "śmieć"], steps: [{}] }],
      shopping: [{ name: "chleb" }, { name: "" }, "śmieć"],
    })
  );
  ui.click('.tabbar button[data-view="settings"]');
  pickFile(ui, "#importFile");
  await ui.tick();
  ui.click('.tabbar button[data-view="recipes"]');
  assert.match(ui.text("#recipesSub"), /1 zapisany przepis/, "import nie zastąpił danych");
  assert.match(ui.text("#recipesList"), /Importowany/);
  ui.click('#recipesList [data-open="x"]');
  assert.match(ui.text("#detailBody"), /sól/);
  assert.match(ui.text("#detailBody"), /Ten przepis nie ma kroków/);
  ui.click('.tabbar button[data-view="shopping"]');
  assert.match(ui.text("#shoppingList"), /chleb/);
});

await test("usunięcie wszystkich danych czyści bazę", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click("#btnAddToShop");
  await ui.tick();
  ui.click('.tabbar button[data-view="settings"]');
  ui.click("#btnWipe");
  await ui.tick();
  assert.equal(JSON.parse(ui.window.localStorage.getItem("recipe-bro.recipes")).length, 0);
  assert.equal(JSON.parse(ui.window.localStorage.getItem("recipe-bro.shopping")).length, 0);
  assert.equal(ui.window.sessionStorage.getItem("recipe-bro.draft"), null);
  ui.click('.tabbar button[data-view="recipes"]');
  assert.match(ui.text("#recipesList"), /Nie masz jeszcze żadnego przepisu/);
  ui.click('.tabbar button[data-view="shopping"]');
  assert.match(ui.text("#shoppingList"), /Lista jest pusta/);
});

await test("błędny plik importu mówi o błędzie zamiast psuć aplikację", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  stubFileReader(ui, "{ to nie jest json");
  ui.click('.tabbar button[data-view="settings"]');
  pickFile(ui, "#importFile");
  await ui.tick();
  assert.match(ui.text("#settingsNotice"), /Nie udało się wczytać pliku/);
  assert.equal(ui.view(), "view-settings");
});

await test("plik bez tablicy recipes jest odrzucony", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  stubFileReader(ui, JSON.stringify({ przepisy: [] }));
  ui.click('.tabbar button[data-view="settings"]');
  pickFile(ui, "#importFile");
  await ui.tick();
  assert.match(ui.text("#settingsNotice"), /Nie udało się wczytać pliku/);
  ui.click('.tabbar button[data-view="recipes"]');
  assert.match(ui.text("#recipesList"), /Placki ziemniaczane/, "dane przepadły mimo błędnego pliku");
});

await test("zmiana modelu jest zapamiętywana", async () => {
  const ui = await boot();
  ui.click('.tabbar button[data-view="settings"]');
  ui.setValue("#modelInput", "gemini-3.1-flash-lite");
  assert.equal(JSON.parse(ui.window.localStorage.getItem("recipe-bro.settings")).model, "gemini-3.1-flash-lite");
});
await test("wycofany model zapisany wcześniej nie zostaje w UI", async () => {
  const ui = await boot({
    storage: { localStorage: { "recipe-bro.settings": JSON.stringify({ model: "gemini-2.5-flash" }) } },
  });
  ui.click('.tabbar button[data-view="settings"]');
  assert.equal(ui.window.Przepisnik.state.settings.model, "gemini-3.5-flash");
  assert.equal(ui.values("#modelInput")[0], "gemini-3.5-flash");
});

console.log("\nbłędy w konsoli");
await test("cały przebieg nie zostawia błędów w konsoli", async () => {
  const ui = await boot({ fetchResponse: () => geminiResponse() });
  await withRecipe(ui);
  ui.click('#importCard .seg button[data-tab="text"]');
  ui.click("#btnParse");
  await ui.tick();
  assert.deepEqual(ui.errors, []);
});

console.log("\n" + passed + " testów przeszło" + (process.exitCode ? ", są błędy" : ", wszystkie OK"));
