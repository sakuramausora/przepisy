// Jednorazowy test prawdziwego API Gemini – NIE jest częścią testów aplikacji.
// Klucz bierzemy ze zmiennej środowiskowej GEMINI_KEY, nigdy z pliku.
//   PowerShell: $env:GEMINI_KEY = "AIza..."; npm run live; Remove-Item Env:\GEMINI_KEY
// Wypisuje wnioski i kody HTTP, ale nigdy klucza.
// Warto odpalić, gdy Gemini zmieni modele – raz złapało tu wycofanie całej serii 2.x.
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const KEY = (process.env.GEMINI_KEY || "").trim();
if (!KEY) {
  console.error("Brak GEMINI_KEY");
  process.exit(1);
}
const masked = KEY.slice(0, 5) + "…" + KEY.slice(-4) + " (" + KEY.length + " znaki)";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "app.js"), "utf8");

// --- minimalna atrapa DOM, żeby dostać dostęp do kodu aplikacji --------------
const noop = () => {};
const el = () => ({
  style: {}, dataset: {}, children: [], value: "", files: [], attributes: {},
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  setAttribute(k, v) { this.attributes[k] = String(v); },
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; },
  removeAttribute(k) { delete this.attributes[k]; },
  hasAttribute(k) { return k in this.attributes; },
  addEventListener: noop, removeEventListener: noop, appendChild: noop,
  removeChild: noop, insertAdjacentHTML: noop, querySelector: () => null,
  querySelectorAll: () => [], closest: () => null, click: noop, focus: noop,
  getContext: () => ({ drawImage: noop }), toDataURL: () => "data:image/png;base64,AAAA",
});
const store = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    clear: () => m.clear(),
    key: (i) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};
const document = {
  readyState: "complete", body: el(), documentElement: el(),
  createElement: el, getElementById: () => el(), querySelector: () => el(),
  querySelectorAll: () => [], addEventListener: noop,
};
const sandbox = {
  document, console, setTimeout, clearTimeout, fetch,
  localStorage: store(), sessionStorage: store(),
  crypto: { randomUUID: () => "live-" + Math.random().toString(36).slice(2) },
  window: { matchMedia: () => ({ matches: false }), scrollTo: noop, crypto: null },
  Blob: function () {}, FileReader: function () {}, Image: function () {},
  URL: { createObjectURL: () => "", revokeObjectURL: noop },
};
sandbox.window.crypto = sandbox.crypto;
sandbox.globalThis = sandbox;
sandbox.window.document = document;
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "app.js" });

const RB = sandbox.window.Przepisnik;
RB.state.apiKey = KEY;
const MODEL = process.env.MODEL || "gemini-3.5-flash";

// --- surowe zapytanie, żeby zobaczyć odpowiedź API jak jest -----------------
const ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

async function raw(body, headers) {
  const url = ROOT + "/" + MODEL + ":generateContent";
  const started = Date.now();
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  const ms = Date.now() - started;
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* pusta odpowiedź */
  }
  return { status: res.status, ms, json };
}

function report(label, result) {
  const { status, ms, json } = result;
  const err = json && json.error;
  const meta = json && json.candidates && json.candidates[0] && json.candidates[0].urlContextMetadata;
  const promptFb = json && json.promptFeedback;
  console.log("  HTTP " + status + "  (" + ms + " ms)");
  if (err) console.log("  błąd API: " + err.status + " – " + String(err.message).slice(0, 300));
  if (promptFb && promptFb.blockReason) console.log("  blokada treści: " + promptFb.blockReason);
  if (meta) console.log("  urlContext: " + JSON.stringify(meta).slice(0, 220));
  if (label) console.log("  (" + label + ")");
  return { status, json };
}

console.log("\n=== Przepiśnik – test prawdziwego API Gemini ===");
console.log("klucz: " + masked + "   model: " + MODEL);

// A) Czy klucz w ogóle działa i czy Gemini przyjmuje responseSchema + urlContext
console.log("\n1. Czy klucz i schema są akceptowane");
{
  const body = RB.buildRequest("text", { text: "Naleśniki: 200 g mąki, 2 jajka, sól." });
  const r = await raw(body, { "content-type": "application/json", "x-goog-api-key": KEY });
  report(null, r);

  if (r.status === 400 || r.status === 401 || r.status === 403) {
    // Może to token OAuth, a nie klucz AIza... – sprawdzamy drugi sposób.
    const oauth = await raw(body, { "content-type": "application/json", authorization: "Bearer " + KEY });
    console.log("\n  próba z nagłówkiem Authorization: Bearer");
    report(null, oauth);
  }
}

// B) Import z tekstu przez normalną ścieżkę aplikacji (callGemini + parseDraft)
console.log("\n2. Import z tekstu (pełna ścieżka: callGemini + parseDraft)");
{
  const started = Date.now();
  try {
    const draft = await RB.callGemini(
      "text",
      { text: "Placki ziemniaczane: 600 g ziemniaków, 1 szypułka czosnku, 2 łyżki mąki, sól i pieprz. Zetrzeć ziemniaki, odcisnąć, dodać resztę, smażyć na oleju." },
      MODEL
    );
    console.log("  OK w " + (Date.now() - started) + " ms");
    console.log("  tytuł:      " + draft.title);
    console.log("  porcje:     " + draft.servings + "   czas: " + draft.totalMinutes + " min");
    console.log("  tagi:       " + (draft.tags.join(", ") || "(brak)"));
    console.log("  składniki:  " + draft.ingredients.length);
    for (const i of draft.ingredients) {
      console.log("      " + [i.quantity, i.unit, i.name, i.note && "(" + i.note + ")"].filter(Boolean).join(" "));
    }
    console.log("  kroki:      " + draft.steps.length);
    for (const [n, s] of draft.steps.entries()) console.log("      " + (n + 1) + ". " + s.text);
    if (draft.confidenceNote) console.log("  uwaga AI:   " + draft.confidenceNote);
  } catch (e) {
    console.log("  BŁĄD: " + e.message);
  }
}

// C) Import z linku – prawdziwa strona z przepisem (adres w treści + urlContext)
console.log("\n3. Import z linku (urlContext) – bbcgoodfood");
{
  const body = RB.buildRequest("url", { url: "https://www.bbcgoodfood.com/recipes/classic-pancakes" });
  const r = await raw(body, { "content-type": "application/json", "x-goog-api-key": KEY });
  report(null, r);
  const parts = r.json && r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content.parts;
  if (parts && parts[0] && parts[0].text) {
    const d = RB.parseDraft(JSON.parse(parts[0].text));
    console.log("  tytuł: " + d.title + " | składniki: " + d.ingredients.length + " | kroki: " + d.steps.length);
    console.log("  porcje: " + d.servings + "  czas: " + d.totalMinutes + " min  tagi: " + (d.tags.join(", ") || "-"));
    for (const i of d.ingredients) {
      console.log("      " + [i.quantity, i.unit, i.name].filter(Boolean).join(" "));
    }
    if (d.confidenceNote) console.log("  uwaga AI: " + d.confidenceNote);
  }
}

// D) Import ze zdjęcia – sprawdzamy czy obraz w ogóle przechodzi
//    (generujemy PNG z czarnymi „liniami tekstu”, bo bez biblioteki nie napiszemy czcionek)
console.log("\n4. Import ze zdjęcia (inlineData) – obraz testowy bez czytelnych liter");
{
  const png = fakeTextPage();
  const body = RB.buildRequest("image", { data: png.base64, mimeType: "image/png" });
  const r = await raw(body, { "content-type": "application/json", "x-goog-api-key": KEY });
  report(null, r);
  const parts = r.json && r.json.candidates && r.json.candidates[0] && r.json.candidates[0].content.parts;
  if (parts && parts[0] && parts[0].text) {
    const d = RB.parseDraft(JSON.parse(parts[0].text));
    console.log("  isRecipe: " + d.isRecipe + " | tytuł: " + d.title);
    console.log("  składniki: " + d.ingredients.length + " | kroki: " + d.steps.length);
    if (d.confidenceNote) console.log("  uwaga AI: " + d.confidenceNote);
    if (d.warnings.length) console.log("  ostrzeżenia: " + d.warnings.join("; "));
  }
  console.log("  (rozmiar obrazu: " + Math.round((png.base64.length * 3) / 4 / 1024) + " kB)");
}

// E) Wycofany model – czy własny komunikat zamienia surowy błąd API na czytelny
console.log("\n5. Wycofany model -> komunikat dla użytkownika (bez wnioskowania o siebie)");
{
  const body = RB.buildRequest("text", { text: "2 jajka" });
  const res = await fetch(ROOT + "/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch {}
  const friendly = RB.friendlyError(json, res);
  console.log("  HTTP " + res.status + " -> " + (friendly ? friendly.message : "brak błędu?!"));
}

console.log("\nKoniec.\n");

/** PNG 300x220 z liniami „tekstu” – sprawdza transport obrazu, nie OCR. */
function fakeTextPage() {
  const W = 300, H = 220;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  let p = 0;
  for (let y = 0; y < H; y++) {
    raw[p++] = 0; // bez filtra
    for (let x = 0; x < W; x++) {
      const wiersz = Math.floor((y - 30) / 34);
      const wierszObecny = y > 30 && y < H - 30 && wiersz >= 0 && wiersz <= 5;
      const wTytul = wiersz === 0;
      const szer = wierszObecny && x > 25 && x < (wTytul ? 200 : 25 + (wiersz * 37) % 190);
      const czarny = wierszObecny && szer && (y - 30) % 34 < (wTytul ? 18 : 9);
      const v = czarny ? 30 : 250;
      raw[p++] = v; raw[p++] = v; raw[p++] = v;
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return {
    base64: Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]).toString("base64"),
  };
}

var CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}