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
  },
  localStorage: store(),
  sessionStorage: store(),
  crypto: { randomUUID: nextUuid },
  fetch: () => Promise.reject(new Error("brak sieci w testach")),
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
