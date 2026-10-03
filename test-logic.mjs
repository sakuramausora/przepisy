// Testy czystej logiki Przepiśnik.
// Uruchom: node test-logic.mjs
// app.js ładujemy w vm z atrapą DOM, żeby dostać window.Przepisnik bez przeglądarki.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "app.js"), "utf8");

// --- atrapa DOM -------------------------------------------------------
const noop = () => {};
function fakeEl() {
  const el = {
    style: {},
    dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    children: [],
    value: "",
    checked: false,
    textContent: "",
    innerHTML: "",
    files: [],
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = String(v);
    },
    getAttribute(k) {
      return k in this.attributes ? this.attributes[k] : null;
    },
    removeAttribute(k) {
      delete this.attributes[k];
    },
    hasAttribute(k) {
      return k in this.attributes;
    },
    addEventListener: noop,
    removeEventListener: noop,
    appendChild: noop,
    removeChild: noop,
    insertAdjacentHTML: noop,
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    click: noop,
    focus: noop,
    getContext: () => ({ drawImage: noop }),
    toDataURL: () => "data:image/jpeg;base64,AAAA",
  };
  return el;
}
const doc = {
  readyState: "complete",
  body: fakeEl(),
  documentElement: fakeEl(),
  createElement: fakeEl,
  getElementById: () => fakeEl(),
  querySelector: () => fakeEl(),
  querySelectorAll: () => [],
  addEventListener: noop,
};
const store = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
};
let uuidCounter = 0;
const nextUuid = () => "uuid-" + ++uuidCounter;
const sandbox = {
  document: doc,
  window: {
    matchMedia: () => ({ matches: false }),
    scrollTo: noop,
    crypto: { randomUUID: nextUuid },
    // Adres strony bez fragmentu: udostępnianie linkiem czyta location.hash przy starcie.
    location: { href: "https://przepisnik.test/", hash: "" },
    // nasłuchy poza DOM (pagehide) – w pustym piaskownicy tylko rejestrują się
    addEventListener: noop,
  },
  location: { href: "https://przepisnik.test/", hash: "" },
  navigator: {},
  localStorage: store(),
  sessionStorage: store(),
  crypto: { randomUUID: nextUuid },
  fetch: () => Promise.reject(new Error("brak sieci w testach")),
  // base64 dla pliku przepisów i dla linków z przepisem
  btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  TextEncoder,
  TextDecoder,
  console,
  setTimeout,
  clearTimeout,
  Math,
  Date,
  JSON,
  Object,
  Array,
  String,
  Number,
  parseFloat,
  isFinite,
  Error,
  Promise,
  Blob: function () {},
  FileReader: function () {},
  Image: function () {},
  URL: { createObjectURL: () => "blob:x", revokeObjectURL: noop },
};
sandbox.globalThis = sandbox;
sandbox.window.document = doc;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "app.js" });

const RB = sandbox.window.Przepisnik;
assert.ok(RB, "nie znaleziono window.Przepisnik");

// Tablice tworzone wewnątrz vm mają inny prototyp niż hosta, więc deepEqual
// zawsze by rzucał "same structure but not reference-equal". Porównujemy treść.
const same = (actual, expected, msg) => {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected), msg);
};

// --- testy -------------------------------------------------------------
let passed = 0;
// Testy MUSZĄ iść po kolei: wszystkie współdzielą jeden stub sandbox.fetch,
// więc równoległe testy callGemini nadpisywałyby się nawzajem.
let chain = Promise.resolve();
function test(name, fn) {
  chain = chain.then(async () => {
    try {
      await fn();
      passed++;
      console.log("  ok  " + name);
    } catch (e) {
      console.error("FAIL  " + name + "\n      " + (e && e.message));
      process.exitCode = 1;
    }
  });
}

console.log("\nnormalizeUnit");
test("aliasy polskie", () => {
  assert.equal(RB.normalizeUnit("łyż. stoł."), "łyżka");
  assert.equal(RB.normalizeUnit("łyż."), "łyżka");
  assert.equal(RB.normalizeUnit("łyżek"), "łyżka");
  assert.equal(RB.normalizeUnit("Łyżeczki"), "łyżeczka");
  assert.equal(RB.normalizeUnit("łyż. cz"), "łyżeczka");
  assert.equal(RB.normalizeUnit("gramów"), "g");
  assert.equal(RB.normalizeUnit("SZTUKI"), "szt");
  assert.equal(RB.normalizeUnit("torebka"), "opak.");
  assert.equal(RB.normalizeUnit("opak."), "opak.");
  assert.equal(RB.normalizeUnit(""), "");
  assert.equal(RB.normalizeUnit(null), "");
});
test("nieznana jednostka zostaje, bez kropki na końcu", () => {
  assert.equal(RB.normalizeUnit("Przyprawa."), "przyprawa");
});
test("ogonki niezależnie od zapisu", () => {
  assert.equal(RB.normalizeUnit("gramów"), "g");
  assert.equal(RB.normalizeUnit("gramow"), "g");
  assert.equal(RB.normalizeUnit("Kawałki"), "kawałek");
  assert.equal(RB.normalizeUnit("kawalki"), "kawałek");
  assert.equal(RB.normalizeUnit("szczypt"), "szczypta");
  assert.equal(RB.normalizeUnit("szczyptą"), "szczypta");
  assert.equal(RB.normalizeUnit("łyżki"), "łyżka");
  assert.equal(RB.fold("Łyżka Stoł."), "lyzka stol.");
});

console.log("\nnum");
test("odrzuca śmieci i ujemne", () => {
  assert.equal(RB.num("2,5"), 2.5);
  assert.equal(RB.num("400 g"), 400);
  assert.equal(RB.num(-3), 0);
  assert.equal(RB.num("abc"), 0);
  assert.equal(RB.num(undefined), 0);
  assert.equal(RB.num(0.3333333), 0.33);
});

console.log("\nfmtQty");
test("ułamki dla jednostek nieprecyzyjnych", () => {
  assert.equal(RB.fmtQty(0.5, "łyżka"), "1/2");
  assert.equal(RB.fmtQty(1.5, "łyżka"), "1 1/2");
  assert.equal(RB.fmtQty(0.75, "szklanka"), "3/4");
  assert.equal(RB.fmtQty(2, "szt"), "2");
});
test("dokładne jednostki bez ułamków", () => {
  assert.equal(RB.fmtQty(400, "g"), "400");
  assert.equal(RB.fmtQty(0.5, "kg"), "0.5");
  assert.equal(RB.fmtQty(0, "g"), "");
});

console.log("\nfmtIng / fmtDuration");
test("składnik jako tekst", () => {
  assert.equal(RB.fmtIng({ name: "mąka pszenna", quantity: 300, unit: "g" }), "300 g mąka pszenna");
  assert.equal(RB.fmtIng({ name: "czosnek", quantity: 2, unit: "szt", note: "opcjonalnie" }), "2 szt czosnek");
  assert.equal(RB.fmtIng({ name: "oliwa", quantity: 2, unit: "łyżka", note: "doprawić" }), "2 łyżka oliwa (doprawić)");
  assert.equal(RB.fmtIng({ name: "sól", quantity: 0, unit: "" }), "sól");
});
test("czas", () => {
  assert.equal(RB.fmtDuration(45), "45 min");
  assert.equal(RB.fmtDuration(60), "1 godz.");
  assert.equal(RB.fmtDuration(95), "1 godz. 35 min");
  assert.equal(RB.fmtDuration(0), "");
});

console.log("\nskalowanie");
test("skaluje ilości", () => {
  assert.equal(RB.scaleQty(400, 1.5), 600);
  assert.equal(RB.scaleQty(0, 3), 0);
  assert.deepEqual(RB.scaleIng({ id: "a", name: "mąka", quantity: 400, unit: "g" }, 1.5).quantity, 600);
});

console.log("\nmergeInto");
test("sumuje te same produkty i nie miesza ręcznych", () => {
  let list = [];
  list = RB.mergeInto(list, "r1", [{ name: "Mąka pszenna", quantity: 400, unit: "g" }]);
  list = RB.mergeInto(list, "r2", [{ name: "mąka   pszenna", quantity: 200, unit: "gram" }]);
  assert.equal(list.length, 1, "powinien być jeden wpis");
  assert.equal(list[0].quantity, 600);
  same(Array.from(list[0].fromRecipes).sort(), ["r1", "r2"]);

  list = RB.mergeInto(list, "r3", [{ name: "chleb", quantity: 1, unit: "szt" }]);
  assert.equal(list.length, 2);
  assert.equal(RB.mergeInto(list, "r3", [{ name: "  ", quantity: 1, unit: "szt" }]).length, 2, "pusty pomijany");
});
test("nie scala z wpisem dodanym ręcznie", () => {
  const manual = [{ id: "m", name: "mąka pszenna", unit: "g", quantity: 100, checked: false, fromRecipes: [], manual: true }];
  const out = RB.mergeInto(manual, "r1", [{ name: "mąka pszenna", quantity: 400, unit: "g" }]);
  assert.equal(out.length, 2);
  assert.equal(out[0].manual, true);
  assert.equal(out[1].quantity, 400);
});
test("nie mutuje tablicy wejściowej", () => {
  const before = [{ id: "x", name: "sól", unit: "g", quantity: 5, checked: false, fromRecipes: ["r1"], manual: false }];
  const snapshot = JSON.stringify(before);
  RB.mergeInto(before, "r2", [{ name: "sól", quantity: 5, unit: "g" }]);
  assert.equal(JSON.stringify(before), snapshot);
});

console.log("\ngroupShopping");
test("grupuje po przepisie", () => {
  const items = [
    { id: "1", name: "mąka", unit: "g", quantity: 400, checked: false, fromRecipes: ["r1"], manual: false },
    { id: "2", name: "woda", unit: "ml", quantity: 300, checked: false, fromRecipes: ["r1"], manual: false },
    { id: "3", name: "masło", unit: "g", quantity: 50, checked: false, fromRecipes: ["r2", "r1"], manual: false },
    { id: "4", name: "chleb", unit: "szt", quantity: 1, checked: false, fromRecipes: [], manual: true },
  ];
  const titles = { r1: "Placki", r2: "Sos" };
  const groups = RB.groupShopping(items, (id) => titles[id] || "usunięty");
  same(Array.from(groups, (g) => g.title), ["Dopisane ręcznie", "Placki", "Wiele przepisów"]);
  assert.equal(groups[1].items.length, 2);
  assert.equal(groups[2].items[0].name, "masło");
});

console.log("\nbuildRequest");
test("zdjęcie: inlineData + mimeType, bez tools", () => {
  const body = RB.buildRequest("image", { data: "QUJD", mimeType: "image/jpeg", hint: "od mamy" });
  const parts = body.contents[0].parts;
  assert.equal(parts[0].inlineData.mimeType, "image/jpeg");
  assert.equal(parts[0].inlineData.data, "QUJD");
  assert.equal(parts[1].text, "od mamy");
  assert.equal(body.tools, undefined);
  assert.equal(body.generationConfig.responseMimeType, "application/json");
  assert.ok(body.generationConfig.responseSchema.properties.ingredients);
});
test("zdjęcie bez podpowiedzi: tylko jedna część", () => {
  const body = RB.buildRequest("image", { data: "QUJD", mimeType: "image/png" });
  assert.equal(body.contents[0].parts.length, 1);
});
test("link: adres w treści + urlContext (bez fileData)", () => {
  const body = RB.buildRequest("url", { url: "https://example.com/przepis" });
  // Prawdziwe API odrzuca fileData.fileUri dla stron HTML („Unsupported MIME type”),
  // więc adres musi być tekstem w poleceniu – sprawdzone na żywo.
  assert.equal(body.contents[0].parts[0].fileData, undefined);
  assert.ok(body.contents[0].parts[0].text.includes("https://example.com/przepis"));
  same(body.tools, [{ urlContext: {} }]);
  same(body.generationConfig.thinkingConfig, { thinkingBudget: 0 });
});
test("tekst: w treści", () => {
  const body = RB.buildRequest("text", { text: "2 jajka" });
  assert.equal(body.contents[0].parts.length, 1);
  assert.ok(body.contents[0].parts[0].text.includes("2 jajka"));
  assert.equal(body.tools, undefined);
});
test("treść żądania serializuje się do JSON", () => {
  assert.doesNotThrow(() => JSON.stringify(RB.buildRequest("url", { url: "https://x.test" })));
});

console.log("\nparseDraft");
test("porządkuje odpowiedź modelu", () => {
  const d = RB.parseDraft({
    isRecipe: true,
    title: "  Placki ziemniaczane ",
    description: "Proste.",
    servings: 4,
    prepMinutes: 20,
    cookMinutes: 10,
    tags: ["szybkie", " wegetariańskie ", ""],
    ingredients: [
      { raw: "2 szypułki czosnku", name: " czosnek ", quantity: 2, unit: "sztuki", note: "" },
      { raw: "300 g ziemniaków", name: "ziemniaki", quantity: "300", unit: "g", note: "" },
      { name: "", raw: "x" },
      "śmieć",
    ],
    steps: [
      { text: "Zetrzeć ziemniaki.", durationMinutes: 10 },
      { text: "   " },
    ],
    confidenceNote: "",
    warnings: [],
  });
  assert.equal(d.title, "Placki ziemniaczane");
  assert.equal(d.servings, 4);
  assert.equal(d.totalMinutes, 30, "brak totalMinutes = prep + cook");
  assert.deepEqual(d.tags, ["szybkie", "wegetariańskie"]);
  assert.equal(d.ingredients.length, 3, "śmieci odpadną, brak nazwy → fallback na raw");
  assert.equal(d.ingredients[0].unit, "szt");
  assert.equal(d.ingredients[1].quantity, 300);
  assert.equal(d.ingredients[2].name, "x", "gdy model nie poda nazwy, zostaje surowy tekst do poprawy");
  assert.equal(d.steps.length, 1);
  assert.ok(d.ingredients.every((i) => i.id), "każdy składnik ma id");
});
test("confidenceNote trafia na początek ostrzeżeń, bez duplikatu", () => {
  const d = RB.parseDraft({
    title: "X",
    confidenceNote: "Zdjęcie nieczytelne",
    warnings: ["zdjęcie nieczytelne", "brak ilości mleka", ""],
  });
  same(d.warnings, ["Zdjęcie nieczytelne", "brak ilości mleka"]);
});
test("ostrzeżenia powtarzające uwagę innymi słowami odpadają", () => {
  // tak wygląda prawdziwa odpowiedź Gemini na zdjęcie bez czytelnych liter
  const d = RB.parseDraft({
    title: "Bez tytułu",
    isRecipe: false,
    confidenceNote:
      "Przesłany obraz nie zawiera żadnego tekstu ani przepisu kulinarnego. " +
      "Przedstawia jedynie czarne poziome paski.",
    warnings: ["Obraz nie zawiera przepisu.", "spróbuj innego zdjęcia", ""],
  });
  same(d.warnings, [
    "Przesłany obraz nie zawiera żadnego tekstu ani przepisu kulinarnego. " +
      "Przedstawia jedynie czarne poziome paski.",
    "spróbuj innego zdjęcia",
  ]);
});
test("isRecipe=false gdy pusto", () => {
  const d = RB.parseDraft({ title: "Bez tytułu", ingredients: [], steps: [], isRecipe: true });
  assert.equal(d.isRecipe, false);
  assert.equal(d.title, "Bez tytułu");
});
test("liczby ujemne i śmieci w ilościach", () => {
  const d = RB.parseDraft({ ingredients: [{ name: "sól", quantity: -5, unit: "g" }] });
  assert.equal(d.ingredients[0].quantity, 0);
});
test("null/bezargument nie wywala", () => {
  assert.doesNotThrow(() => RB.parseDraft({}));
  assert.doesNotThrow(() => RB.parseDraft(null));
  assert.doesNotThrow(() => RB.parseDraft("tekst"));
  assert.equal(RB.parseDraft(null).title, "Bez tytułu");
});
test("tags maksymalnie 8", () => {
  const d = RB.parseDraft({
    ingredients: [{ name: "sól", quantity: 1, unit: "g" }],
    tags: Array.from({ length: 12 }, (_, i) => "t" + i),
  });
  assert.equal(d.tags.length, 8);
});

console.log("\ncallGemini / błędy");
const STATE = RB.state;
test("klucz leci w nagłówku x-goog-api-key", async () => {
  STATE.apiKey = "AIzaTEST";
  let seen = null;
  sandbox.fetch = async (url, options) => {
    seen = { url, options };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
    };
  };
  await RB.callGemini("text", { text: "x" }, "gemini-3.5-flash");
  assert.equal(seen.options.headers["x-goog-api-key"], "AIzaTEST");
  assert.equal(seen.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent");
  assert.equal(seen.options.method, "POST");
});
test("klucz czytany z state.apiKey, nie z settings", async () => {
  // regresja: import zawsze krzyczał „Brak klucza", bo settings.apiKey nigdy nie było ustawiane
  STATE.apiKey = "AIzaTEST";
  STATE.settings.apiKey = undefined;
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
  });
  const draft = await RB.callGemini("text", { text: "x" }, "gemini-3.5-flash");
  assert.ok(draft, "callGemini odrzucił mimo ustawionego klucza");
});
test("spacja na końcu klucza nie psuje nagłówka", async () => {
  STATE.apiKey = "  AIzaTEST  ";
  let seen = null;
  sandbox.fetch = async (url, options) => {
    seen = options;
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "{}" }] } }] }),
    };
  };
  await RB.callGemini("text", { text: "x" }, "m");
  assert.equal(seen.headers["x-goog-api-key"], "AIzaTEST");
});
test("zdjęcie i tekst nie gaszą myślenia modelu", () => {
  // przy rozpoznawaniu zdjęcia myślenie pomaga, a import z tekstu jest tani
  assert.equal(RB.buildRequest("text", { text: "x" }).generationConfig.thinkingConfig, undefined);
  assert.equal(
    RB.buildRequest("image", { data: "QUJD", mimeType: "image/png" }).generationConfig.thinkingConfig,
    undefined
  );
});
test("model bez thinkingConfig dostaje powtórkę bez tego pola", async () => {
  STATE.apiKey = "AIzaTEST";
  const bodies = [];
  sandbox.fetch = async (url, options) => {
    bodies.push(JSON.parse(options.body));
    if (bodies.length === 1) {
      return {
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({ error: { message: "Unknown name thinkingConfig at 'generation_config'" } }),
      };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: JSON.stringify({ title: "Naleśniki", ingredients: [{ name: "mąka" }] }) }] } },
          ],
        }),
    };
  };
  const draft = await RB.callGemini("url", { url: "https://x.test" }, "m");
  assert.equal(bodies.length, 2, "powinno być jedno powtórzenie");
  assert.equal(bodies[0].generationConfig.thinkingConfig.thinkingBudget, 0);
  assert.equal(bodies[1].generationConfig.thinkingConfig, undefined, "powtórka bez myślenia");
  assert.equal(draft.title, "Naleśniki");
});
test("inny błąd 400 nie powoduje powtórki", async () => {
  STATE.apiKey = "AIzaTEST";
  let calls = 0;
  sandbox.fetch = async () => {
    calls++;
    return { ok: false, status: 400, text: async () => JSON.stringify({ error: { message: "zła treść" } }) };
  };
  await assert.rejects(() => RB.callGemini("url", { url: "https://x.test" }, "m"), /400/);
  assert.equal(calls, 1, "nie powtarzamy bez powodu");
});
test("bez klucza API nie odpala fetcha", async () => {
  STATE.apiKey = "";
  let called = false;
  sandbox.fetch = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "{}" };
  };
  await assert.rejects(
    () => RB.callGemini("text", { text: "2 jajka" }, "gemini-3.5-flash"),
    /Brak klucza API/
  );
  assert.equal(called, false, "fetch odpalił się bez klucza");
});
test("poprawna odpowiedź daje gotowy przepis", async () => {
  STATE.apiKey = "AIzaTEST";
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    isRecipe: true,
                    title: "Naleśniki",
                    servings: 2,
                    ingredients: [{ name: "mąka", quantity: 200, unit: "g", raw: "200 g mąki", note: "" }],
                    steps: [{ text: "Zagnieść ciasto.", durationMinutes: 5 }],
                    warnings: [],
                  }),
                },
              ],
            },
          },
        ],
      }),
  });
  const draft = await RB.callGemini("text", { text: "…" }, "gemini-3.5-flash");
  assert.equal(draft.title, "Naleśniki");
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.ingredients[0].name, "mąka");
});
test("pusta odpowiedź / blokada treści", async () => {
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } }),
  });
  await assert.rejects(() => RB.callGemini("text", { text: "x" }, "m"), /zablokowało/);
});
test("błąd 401 przy złym kluczu", async () => {
  sandbox.fetch = async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: "API key not valid" } }),
  });
  await assert.rejects(() => RB.callGemini("text", { text: "x" }, "m"), /klucz/i);
});
test("429 z czytelnym komunikatem o limicie", async () => {
  sandbox.fetch = async () => ({
    ok: false,
    status: 429,
    text: async () => JSON.stringify({ error: { message: "quota" } }),
  });
  await assert.rejects(() => RB.callGemini("text", { text: "x" }, "m"), /limit/i);
});
test("brak sieci tłumaczymy po polsku", async () => {
  sandbox.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(() => RB.callGemini("text", { text: "x" }, "m"), /Nie udało się połączyć/);
});
test("model bez urlContext dostaje podpowiedź", () => {
  const err = RB.friendlyError({ error: { message: "Tool use is not supported" } }, { ok: false, status: 400 });
  assert.match(err.message, /gemini-3.5-flash/);
  assert.match(err.message, /Tekst/);
});
test("nieczytelna strona to inny komunikat niż brak narzędzia", () => {
  const err = RB.friendlyError(
    { error: { message: "Cannot fetch content from the provided URL." } },
    { ok: false, status: 400 }
  );
  assert.match(err.message, /Nie udało się odczytać tej strony/);
  assert.match(err.message, /Tekst/);
});
test("wycofany model (404) mówi, żeby wybrać inny", () => {
  const err = RB.friendlyError(
    { error: { message: "This model models/gemini-2.5-flash is no longer available to new users." } },
    { ok: false, status: 404 }
  );
  assert.match(err.message, /404/);
  assert.match(err.message, /gemini-3.5-flash/);
});
test("limit planu (429) sugeruje model Flash", () => {
  const err = RB.friendlyError(
    { error: { message: "You exceeded your current quota, please check your plan and billing details." } },
    { ok: false, status: 429 }
  );
  assert.match(err.message, /429/);
  assert.match(err.message, /Flash/);
});
test("przeciążenie (503) nie straszy błędem klawiatury", () => {
  const err = RB.friendlyError(
    { error: { message: "This model is currently experiencing high demand." } },
    { ok: false, status: 503 }
  );
  assert.match(err.message, /przeciążone/);
  assert.match(err.message, /503/);
});
test("nieznany błąd nie gubi szczegółów", () => {
  const err = RB.friendlyError({ error: { message: "coś nowego" } }, { ok: false, status: 418 });
  assert.match(err.message, /418/);
  assert.match(err.message, /coś nowego/);
});
test("poprawna odpowiedź nie generuje błędu", () => {
  assert.equal(RB.friendlyError({ foo: 1 }, { ok: true, status: 200 }), null);
});

console.log("\nminiatury przepisów");
test("zapytanie o miniaturkę prosi o obraz w kwadracie", () => {
  const body = RB.buildImageRequest("rysunek naleśnika");
  assert.equal(body.generationConfig.responseModalities[0], "IMAGE");
  assert.equal(body.generationConfig.imageConfig.aspectRatio, "1:1");
  assert.equal(body.contents[0].parts[0].text, "rysunek naleśnika");
  assert.equal(body.generationConfig.responseMimeType, undefined, "to nie jest odpowiedź JSON");
});
test("prompt zawiera tytuł i składniki oraz zakaz napisów", () => {
  const prompt = RB.illustrationPrompt({
    title: "Naleśniki z sera",
    ingredients: [{ name: "mąka pszenna" }, { name: "twaróg" }, null, { name: "" }],
  });
  assert.match(prompt, /Naleśniki z sera/);
  assert.match(prompt, /mąka pszenna/);
  assert.match(prompt, /twaróg/);
  assert.match(prompt, /brak tekstu/i);
  assert.equal(prompt.includes("null"), false, "ułamki składników trafiają do promptu");
});
test("prompt znosi pusty szkic", () => {
  assert.match(RB.illustrationPrompt({ title: "", ingredients: [] }), /potrawa/);
});
test("obraz z odpowiedzi wraca jako dataURL", async () => {
  STATE.apiKey = "AIzaTEST";
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QUJD" } }] } }] }),
  });
  const url = await RB.callGeminiImage("rysunek");
  assert.equal(url, "data:image/png;base64,QUJD");
});
test("obraz bierze się z dowolnej części odpowiedzi", async () => {
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        candidates: [
          { content: { parts: [{ text: "Proszę bardzo:" }, { inlineData: { mimeType: "image/jpeg", data: "QQ" } }] } },
        ],
      }),
  });
  assert.equal(await RB.callGeminiImage("rysunek"), "data:image/jpeg;base64,QQ");
});
test("limit planu (429) to informacja dla ustawień, nie wyjątek do pokazania", async () => {
  STATE.apiKey = "AIzaTEST";
  let calls = 0;
  sandbox.fetch = async () => {
    calls++;
    return {
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: "exceeded your current quota" } }),
    };
  };
  await assert.rejects(() => RB.callGeminiImage("rysunek"), (e) => e.blocked === true);
  assert.equal(calls, 1, "nie próbujemy następnego modelu po 429");
});
test("wycofany model graficzny (404) przechodzi na następny", async () => {
  const asked = [];
  sandbox.fetch = async (url) => {
    asked.push(url);
    if (asked.length === 1) {
      return { ok: false, status: 404, text: async () => JSON.stringify({ error: { message: "no such model" } }) };
    }
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: "QQ" } }] } }] }),
    };
  };
  assert.equal(await RB.callGeminiImage("rysunek"), "data:image/png;base64,QQ");
  assert.equal(asked.length, 2);
  assert.match(asked[0], /models\/gemini-2\.5-flash-image/);
  assert.match(asked[1], /models\/gemini-3\.1-flash-image/);
});
test("200 bez obrazu to błąd, nie pusty dataURL", async () => {
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "nie umiem" }] } }] }),
  });
  await assert.rejects(() => RB.callGeminiImage("rysunek"), /nie zwrócił obrazka/);
});
test("przesadnie duża miniaturka jest odrzucana", async () => {
  sandbox.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        candidates: [
          { content: { parts: [{ inlineData: { mimeType: "image/png", data: "A".repeat(2 * 1024 * 1024) } }] } },
        ],
      }),
  });
  await assert.rejects(() => RB.callGeminiImage("rysunek"), /za duża/);
});
test("bez klucza nie ma zapytania o miniaturkę", async () => {
  STATE.apiKey = "";
  let called = false;
  sandbox.fetch = async () => {
    called = true;
    return { ok: true, status: 200, text: async () => "{}" };
  };
  await assert.rejects(() => RB.callGeminiImage("rysunek"), /Brak klucza API/);
  assert.equal(called, false);
});
test("brak sieci przy miniaturze nie wywraca aplikacji", async () => {
  STATE.apiKey = "AIzaTEST";
  sandbox.fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(() => RB.callGeminiImage("rysunek"), /Nie udało się połączyć/);
});

console.log("\nplik przepisów na GitHubie");
function ghJson(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
    json: async () => body,
  };
}
function setGh(settings) {
  Object.assign(STATE.settings, { ghRepo: "mnia/przepisnik", ghToken: "ghp_TEST", ghBranch: "", ...settings });
}

test("bez repo i tokenu nie odpalamy sieci", async () => {
  STATE.settings.ghRepo = null;
  STATE.settings.ghToken = "";
  let called = false;
  sandbox.fetch = async () => {
    called = true;
    return ghJson({});
  };
  await assert.rejects(() => RB.ghLoad(), /Uzupełnij repozytorium/);
  await assert.rejects(() => RB.ghSave(), /Uzupełnij repozytorium/);
  assert.equal(called, false);
});
test("zapis odczytuje sha pliku i wysyła je w treści żądania", async () => {
  setGh();
  STATE.recipes = [RB.normalizeRecipe({ title: "Placki", ingredients: [{ name: "ziemniaki", quantity: 3, unit: "szt" }] })];
  const seen = [];
  sandbox.fetch = async (url, options) => {
    seen.push({ url, options });
    if (!options.method) return ghJson({ sha: "abc123", content: Buffer.from('{"recipes":[]}').toString("base64") });
    return ghJson({ content: { sha: "def456" } });
  };
  await RB.ghSave();

  assert.equal(seen.length, 2, "najpierw sha, potem zapis");
  assert.equal(seen[0].url, "https://api.github.com/repos/mnia/przepisnik/contents/przepisy.json?ref=main");
  assert.equal(seen[0].options.headers.authorization, "Bearer ghp_TEST");
  assert.equal(seen[1].options.method, "PUT");
  const body = JSON.parse(seen[1].options.body);
  assert.equal(body.sha, "abc123", "bez sha GitHub odrzuci zapis");
  assert.equal(body.branch, "main");
  assert.match(body.message, /Przepiśnik/);
});
test("pierwszy zapis tworzy plik – bez sha w treści", async () => {
  setGh();
  let put = null;
  sandbox.fetch = async (url, options) => {
    if (!options.method) return ghJson({ message: "Not Found" }, 404); // pliku jeszcze nie ma
    put = JSON.parse(options.body);
    return ghJson({ content: { sha: "new1" } });
  };
  await RB.ghSave();

  assert.ok(put, "nie było żądania zapisu");
  assert.equal(put.sha, undefined, "nowy plik nie może dostać sha");
});
test("własna gałąź trafia do zapytania", async () => {
  setGh({ ghBranch: "moja-galaz" });
  const seen = [];
  sandbox.fetch = async (url, options) => {
    seen.push({ url, options });
    return options.method ? ghJson({ content: { sha: "x" } }) : ghJson({ sha: "s" });
  };
  await RB.ghSave();
  // odczyt sha musi pytać o wskazaną gałąź; zapis niesie gałąź w treści żądania
  assert.match(seen[0].url, /\?ref=moja-galaz$/);
  assert.equal(JSON.parse(seen[1].options.body).branch, "moja-galaz");
});
test("wczytanie zamienia dane i pamięta sha", async () => {
  setGh();
  STATE.recipes = [];
  STATE.shopping = [];
  const payload = {
    recipes: [{ title: "Naleśniki", ingredients: [{ name: "mąka", quantity: 200, unit: "g" }] }],
    shopping: [{ name: "mąka", quantity: 200, unit: "g", fromRecipes: ["x"] }],
  };
  sandbox.fetch = async () =>
    ghJson({ sha: "sha-1", content: Buffer.from(JSON.stringify(payload), "utf8").toString("base64") });

  const count = await RB.ghLoad();

  assert.equal(count, 1);
  assert.equal(STATE.recipes.length, 1);
  assert.equal(STATE.recipes[0].title, "Naleśniki");
  assert.equal(STATE.shopping.length, 1, "lista zakupów nie wjechała");
  assert.equal(STATE.ghFileSha, "sha-1");
});
test("plik z polskimi znakami wraca nietknięty (base64, nie latin1)", async () => {
  setGh();
  STATE.recipes = [];
  const title = "Żurek z chrzanem – śmiała";
  sandbox.fetch = async () =>
    ghJson({ sha: "s", content: RB.toBase64(JSON.stringify({ recipes: [{ title }] })) });
  await RB.ghLoad();
  assert.equal(STATE.recipes[0].title, title);
});
test("zapis i odczyt to dla siebie odwrotnością", async () => {
  setGh();
  STATE.recipes = [RB.normalizeRecipe({ title: "Pierogi ruskie", tags: ["pierogi"], ingredients: [{ name: "mąka", quantity: 300, unit: "g" }], steps: [{ text: "Ugotuj.", durationMinutes: 8 }] })];
  let written = "";
  sandbox.fetch = async (url, options) => {
    if (options.method) {
      written = JSON.parse(options.body).content;
      return ghJson({ content: { sha: "s" } });
    }
    return ghJson({ sha: "s", content: written });
  };
  await RB.ghSave();
  STATE.recipes = [];
  await RB.ghLoad();
  assert.equal(STATE.recipes[0].title, "Pierogi ruskie");
  assert.equal(STATE.recipes[0].steps[0].text, "Ugotuj.");
  assert.equal(STATE.recipes[0].ingredients[0].quantity, 300);
});
test("wczytanie z repo nie planuje zapisu tego samego pliku z powrotem", async () => {
  // inaczej każde otwarcie strony kończyłoby się pustym commitem w repo
  setGh({ ghAutoSave: true });
  STATE.recipes = [];
  const planned = [];
  const realTimeout = sandbox.setTimeout;
  sandbox.setTimeout = (fn) => {
    planned.push(fn);
    return 1;
  };
  sandbox.fetch = async () =>
    ghJson({ sha: "s", content: RB.toBase64(JSON.stringify({ updatedAt: new Date().toISOString(), recipes: [{ title: "Z repo" }] })) });

  try {
    await RB.ghLoad();
  } finally {
    sandbox.setTimeout = realTimeout;
  }
  assert.equal(STATE.recipes[0].title, "Z repo");
  assert.equal(planned.length, 0, "wczytanie zaplanowało zapis z powrotem: " + planned.length);
});
test("zły token mówi o tokenie, a nie o bazie", async () => {
  setGh();
  sandbox.fetch = async () => ghJson({ message: "Bad credentials" }, 401);
  await assert.rejects(() => RB.ghLoad(), /Token GitHuba jest nieprawidłowy/);
});
test("brak praw do repo mówi, czego brakuje w uprawnieniach", async () => {
  setGh();
  sandbox.fetch = async () => ghJson({ message: "Resource not accessible by personal access token" }, 403);
  await assert.rejects(() => RB.ghSave(), /Contents: read and write/);
});
test("limit zapytań GitHuba jest rozpoznany", () => {
  const err = RB.ghError(403, "API rate limit exceeded for user");
  assert.match(err.message, /limit zapytań/);
});
test("brak repo mówi, że sprawdzić nazwę", async () => {
  setGh();
  sandbox.fetch = async () => ghJson({ message: "Not Found" }, 404);
  await assert.rejects(() => RB.ghLoad(), /repozytorium/);
});
test("plik bez tablicy recipes jest odrzucony", async () => {
  setGh();
  sandbox.fetch = async () => ghJson({ sha: "s", content: RB.toBase64('{"cos":1}') });
  await assert.rejects(() => RB.ghLoad(), /nie zawiera listy przepisów/);
});
test("dwa zapisy naraz nie nadpisują się nawzajem", async () => {
  setGh();
  let puts = 0;
  sandbox.fetch = async (url, options) => {
    if (options.method) {
      puts++;
      await new Promise((r) => setTimeout(r, 5));
      return ghJson({ content: { sha: "s" } });
    }
    return ghJson({ sha: "s" });
  };
  const first = RB.ghSave();
  await assert.rejects(() => RB.ghSave(), /już trwa/, "drugi zapis powinien zostać odparty");
  await first;
  assert.equal(puts, 1);
});
test("zapis nie leci klucza Gemini ani tokenu w treści pliku", async () => {
  setGh();
  STATE.apiKey = "AIzaTajny";
  let put = "";
  sandbox.fetch = async (url, options) => {
    if (options.method) put = options.body;
    return options.method ? ghJson({ content: { sha: "s" } }) : ghJson({ sha: "s" });
  };
  await RB.ghSave();
  assert.ok(!put.includes("AIzaTajny"), "klucz Gemini w pliku przepisów");
  assert.ok(!put.includes("ghp_TEST"), "token GitHuba w pliku przepisów");
});
test("zła nazwa repo wraca do null przy wczytywaniu ustawień", () => {
  assert.equal(RB.normalizeSettings({ ghRepo: "zly-adres" }).ghRepo, null);
  assert.equal(RB.normalizeSettings({ ghRepo: "  " }).ghRepo, null);
  assert.equal(RB.normalizeSettings({ ghRepo: 42 }).ghRepo, null);
  assert.equal(RB.normalizeSettings({ ghRepo: "mnia/przepisnik" }).ghRepo, "mnia/przepisnik");
  assert.equal(RB.normalizeSettings({ ghRepo: "mnia/przepisnik", ghAutoSave: true }).ghAutoSave, true);
  assert.equal(RB.normalizeSettings({}).ghAutoSave, false, "auto-zapis domyślnie wyłączony");
});

console.log("\nudostępnianie linkiem");
const SHARED = {
  title: "Naleśniki z sera",
  description: "Szybki obiad",
  servings: 4,
  prepMinutes: 20,
  cookMinutes: 15,
  tags: ["szybkie", "wegetariańskie"],
  ingredients: [
    { name: "mąka pszenna", quantity: 200, unit: "g", note: "" },
    { name: "twaróg", quantity: 150, unit: "g", note: "półturego" },
  ],
  steps: [{ text: "Zagnieść ciasto.", durationMinutes: 10 }],
};

test("przepis wraca z linku identyczny", () => {
  const back = RB.recipeFromPayload(JSON.parse(JSON.stringify(RB.sharePayload(SHARED))));
  assert.equal(back.title, "Naleśniki z sera");
  assert.equal(back.servings, 4);
  assert.equal(back.ingredients.length, 2);
  assert.equal(back.ingredients[1].quantity, 150);
  assert.equal(back.ingredients[1].note, "półturego");
  assert.equal(back.steps[0].durationMinutes, 10);
  assert.equal(back.totalMinutes, 35);
});
test("link z przepisem nie ma znaków psujących adres", () => {
  const url = RB.shareUrl(RB.normalizeRecipe(SHARED));
  assert.ok(url.startsWith("https://przepisnik.test/#przepis="));
  assert.ok(!/[+/=]/.test(url.split("#przepis=")[1]), "w ładunku linku został znak + / lub =");
  assert.ok(!url.includes(" "), "w linku jest spacja");
});
test("polskie znaki i emoji przeżywają link", () => {
  const recipe = RB.normalizeRecipe({
    title: "Żurek – śmiała, żeby wszystko było po polsku 🙂",
    ingredients: [{ name: "chrzan", quantity: 1, unit: "łyżka", note: "świeży" }],
  });
  const back = RB.recipeFromHash("#przepis=" + RB.base64UrlEncode(JSON.stringify(RB.sharePayload(recipe))));
  assert.equal(back.title, "Żurek – śmiała, żeby wszystko było po polsku 🙂");
  assert.equal(back.ingredients[0].name, "chrzan");
});
test("zwykłe wejście na stronę nie robi przepisu", () => {
  assert.equal(RB.recipeFromHash(""), null);
  assert.equal(RB.recipeFromHash("#moj-anchor"), null);
  assert.equal(RB.recipeFromHash("#przepis=to-nie-json"), null, "śmieci w linku nie mogą wywracać aplikacji");
  assert.equal(RB.recipeFromHash("#przepis=" + RB.base64UrlEncode('{"t":""}')), null, "bez tytułu nie ma przepisu");
});
test("do linku nie wchodzą ostrzeżenia ani źródło", () => {
  const recipe = RB.normalizeRecipe({
    title: "Test",
    warnings: ["płukanie"],
    source: "https://przyklad.test",
    sourceType: "url",
  });
  const payload = RB.sharePayload(recipe);
  assert.equal(payload.t, "Test");
  assert.equal(payload.w, undefined, " ostrzeżenia kuchenne nie w linku");
  assert.equal(payload.u, undefined, "adres źródłowy nie w linku");
});
test("tekstowa wersja przepisu jest czytelna i kompletna", () => {
  const recipe = RB.normalizeRecipe(SHARED);
  const text = RB.recipeAsText(recipe, 1);
  assert.match(text, /^Naleśniki z sera/);
  assert.match(text, /Składniki:/);
  assert.match(text, /- 200 g mąka pszenna/);
  assert.match(text, /twaróg \(półturego\)/);
  assert.match(text, /1\. Zagnieść ciasto\. \(10 min\)/);
});
test("tekstowa wersja respektuje przeliczone porcje", () => {
  const recipe = RB.normalizeRecipe(SHARED);
  const text = RB.recipeAsText(recipe, 2);
  assert.match(text, /400 g mąka pszenna/);
  assert.match(text, /300 g twaróg/);
});

console.log("\nwczytanie obcych danych");
test("wycofany model zapisany w ustawieniach wraca na działający", () => {
  for (const retired of RB.RETIRED_MODELS) {
    assert.equal(RB.normalizeSettings({ model: retired }).model, RB.DEFAULTS.model, retired);
  }
  assert.equal(RB.normalizeSettings({ model: "gemini-3.1-flash-lite" }).model, "gemini-3.1-flash-lite");
  assert.equal(RB.normalizeSettings({}).model, RB.DEFAULTS.model, "brak modelu → domyślny");
  assert.equal(RB.normalizeSettings({ model: "coś-naszego" }).model, "coś-naszego", "własny model zostaje");
  assert.equal(RB.normalizeSettings({ shoppingServings: 6 }).shoppingServings, 6);
});
test("domyślny model to jeden z dostępnych w API", () => {
  assert.match(RB.DEFAULTS.model, /^gemini-3/);
});
test("normalizeRecipe dociąga brakujące pola", () => {
  const r = RB.normalizeRecipe({ id: "x", title: "Placki", ingredients: [{ name: "ziemniaki", quantity: "3", unit: "SZTUKI" }] });
  assert.equal(r.servings, 4, "brak porcji → 4");
  assert.equal(r.ingredients[0].unit, "szt");
  assert.ok(r.steps && Array.isArray(r.steps));
  assert.ok(Array.isArray(r.tags) && Array.isArray(r.warnings));
  assert.equal(r.sourceType, "manual");
  assert.ok(r.createdAt && r.updatedAt);
});
test("normalizeRecipe odrzuca śmieci", () => {
  assert.equal(RB.normalizeRecipe(null), null);
  assert.equal(RB.normalizeRecipe("tekst"), null);
  const r = RB.normalizeRecipe({
    title: "T",
    ingredients: [null, "śmieć", { name: "  " }, { name: "sól", quantity: "x", unit: null }],
    steps: [{ text: "" }, "x", { text: "Ugotuj", durationMinutes: "12" }],
    sourceType: "nieznany",
  });
  assert.equal(r.ingredients.length, 1);
  assert.equal(r.ingredients[0].quantity, 0);
  assert.equal(r.steps.length, 1);
  assert.equal(r.steps[0].durationMinutes, 12);
});
test("normalizeShopping nadaje id i zabezpiecza fromRecipes", () => {
  const s = RB.normalizeShopping({ name: " chleb " });
  assert.ok(s.id);
  assert.equal(s.name, "chleb");
  assert.ok(Array.isArray(s.fromRecipes));
  assert.equal(s.manual, true, "pozycja bez przepisu traktowana jako ręczna");
  assert.equal(RB.normalizeShopping({ name: "   " }), null);
  assert.equal(RB.normalizeShopping(undefined), null);
});
test("cleanDraft wyrzuca puste wiersze", () => {
  const draft = {
    title: "T",
    ingredients: [{ id: "1", name: "sól", raw: "sól" }, { id: "2", name: "", raw: "" }],
    steps: [{ id: "s1", text: "Gotuj" }, { id: "s2", text: "  " }],
  };
  assert.equal(RB.cleanDraft(draft), true);
  assert.equal(draft.ingredients.length, 1);
  assert.equal(draft.steps.length, 1);
  const pusty = { ingredients: [], steps: [] };
  assert.equal(RB.cleanDraft(pusty), false);
});

test("deleteRecipe czyści listę zakupów", () => {
  STATE.recipes = [
    { id: "r1", title: "Placki", ingredients: [], steps: [] },
    { id: "r2", title: "Sos", ingredients: [], steps: [] },
  ];
  STATE.shopping = [
    { id: "s1", name: "mąka", unit: "g", quantity: 400, checked: false, fromRecipes: ["r1"], manual: false },
    { id: "s2", name: "masło", unit: "g", quantity: 50, checked: false, fromRecipes: ["r1", "r2"], manual: false },
    { id: "s3", name: "chleb", unit: "szt", quantity: 1, checked: false, fromRecipes: [], manual: true },
  ];
  RB.deleteRecipe("r1");
  assert.deepEqual(Array.from(STATE.recipes, (r) => r.id), ["r2"]);
  assert.deepEqual(Array.from(STATE.shopping, (i) => i.id), ["s2", "s3"]);
  assert.deepEqual(Array.from(STATE.shopping[0].fromRecipes), ["r2"], "wspólne pozycje zostają");
  assert.equal(STATE.shopping[1].manual, true, "wpisy ręczne zostają");
});

console.log("\nesc / uid");
test("ucieczka z HTML", () => {
  assert.equal(RB.esc('<img src=x onerror="alert(1)">'), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert.equal(RB.esc("a & b"), "a &amp; b");
  assert.equal(RB.esc(null), "");
});
test("uid unikalne", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) seen.add(RB.uid());
  assert.equal(seen.size, 500, "identyfikatory się powtarzają");
});
test("uid działa bez crypto.randomUUID", () => {
  const withoutCrypto = { ...sandbox, crypto: {}, window: { ...sandbox.window, crypto: {} } };
  withoutCrypto.globalThis = withoutCrypto;
  vm.createContext(withoutCrypto);
  vm.runInContext(source, withoutCrypto, { filename: "app.js" });
  const Fallback = withoutCrypto.window.Przepisnik;
  const ids = new Set();
  for (let i = 0; i < 200; i++) ids.add(Fallback.uid());
  assert.equal(ids.size, 200);
});

await chain;
console.log("\n" + passed + " testów przeszło" + (process.exitCode ? ", są błędy" : ", wszystkie OK"));
