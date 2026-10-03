/* Przepiśnik – cała aplikacja w jednym pliku, bez zależności i bez buildu.
   Działa z file:// i z GitHub Pages, na telefonie i na komputerze.
   Jedyne wywołanie sieciowe: generativelanguage.googleapis.com (Gemini). */
(function () {
  "use strict";

  // ==================================================================
  // 1. Narzędzia
  // ==================================================================

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  function uid() {
    try {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    } catch (e) {
      /* np. file:// bez secure context */
    }
    return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function num(value) {
    var n = typeof value === "number" ? value : parseFloat(String(value).replace(",", "."));
    return isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
  }

  var UNITS = [
    "g",
    "kg",
    "ml",
    "l",
    "szt",
    "łyżka",
    "łyżeczka",
    "szczypta",
    "garść",
    "szklanka",
    "pestka",
    "opak.",
    "puszka",
    "tabliczka",
    "kawałek",
    "kromka",
  ];

  var UNIT_ALIASES = {
    g: "g",
    gram: "g",
    grama: "g",
    gramy: "g",
    gramow: "g",
    kg: "kg",
    kilogram: "kg",
    ml: "ml",
    mililitr: "ml",
    mililitra: "ml",
    mililitrow: "ml",
    l: "l",
    litr: "l",
    litry: "l",
    litrów: "l",
    szt: "szt",
    sztuka: "szt",
    sztuki: "szt",
    sztuk: "szt",
    sztęk: "szt",
    "łyżka": "łyżka",
    "łyżki": "łyżka",
    "łyżek": "łyżka",
    "łyż.": "łyżka",
    "łyż": "łyżka",
    "łyż. stoł.": "łyżka",
    "łyżka stołowa": "łyżka",
    "łyżki stołowej": "łyżka",
    "łyżeczka": "łyżeczka",
    "łyżeczki": "łyżeczka",
    "łyżeczek": "łyżeczka",
    "łyżeczkę": "łyżeczka",
    "łyż. cz": "łyżeczka",
    "łyż. deser.": "łyżeczka",
    "łyżka deserowa": "łyżeczka",
    "łyżki deserowej": "łyżeczka",
    tl: "łyżeczka",
    szczypta: "szczypta",
    szczyp: "szczypta",
    szczypt: "szczypta",
    szczypty: "szczypta",
    pestka: "pestka",
    pestek: "pestka",
    pczek: "pestka",
    "garść": "garść",
    "garści": "garść",
    "garce": "garść",
    tacka: "tacka",
    tacki: "tacka",
    opakowanie: "opak.",
    opakowania: "opak.",
    opak: "opak.",
    paczka: "opak.",
    torebka: "opak.",
    puszka: "puszka",
    puszki: "puszka",
    tabliczka: "tabliczka",
    tabliczki: "tabliczka",
    "kawałek": "kawałek",
    kawalki: "kawałek",
    "kawałki": "kawałek",
    kromka: "kromka",
    kromki: "kromka",
    szklanka: "szklanka",
    szklanki: "szklanka",
    szklanek: "szklanka",
    kubek: "szklanka",
  };

  // Przepisy piszą „gramów" i „gramow", „kawałki" i „kawalki" – szukamy też bez ogonków.
  var FOLD = { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" };

  function fold(value) {
    return String(value)
      .toLowerCase()
      .replace(/[ąćęłńóśźż]/g, function (ch) {
        return FOLD[ch];
      });
  }

  var FOLDED_ALIASES = (function () {
    var index = {};
    Object.keys(UNIT_ALIASES).forEach(function (key) {
      var folded = fold(key);
      if (!(folded in index)) index[folded] = UNIT_ALIASES[key];
    });
    return index;
  })();

  function normalizeUnit(unit) {
    if (!unit) return "";
    var key = String(unit)
      .trim()
      .toLowerCase();
    if (!key) return "";
    if (UNITS.indexOf(key) !== -1) return key; // już kanoniczna, np. „opak."
    var bare = key.replace(/\.+$/, ""); // „łyż." → „łyż"
    return UNIT_ALIASES[key] || UNIT_ALIASES[bare] || FOLDED_ALIASES[fold(bare)] || bare;
  }

  var EXACT_UNITS = { g: 1, kg: 1, ml: 1, l: 1, szt: 1, "opak.": 1, puszka: 1, tabliczka: 1 };

  function fmtQty(quantity, unit) {
    if (!quantity) return "";
    if (EXACT_UNITS[normalizeUnit(unit)]) return String(Math.round(quantity * 100) / 100);
    var whole = Math.floor(quantity);
    var frac = quantity - whole;
    if (frac < 1e-9) return String(whole);
    var approx = Math.round(frac * 16) / 16;
    if (approx === 1) return String(whole + 1);
    if (approx === 0) return String(whole);
    var table = [
      [1 / 8, "1/8"],
      [1 / 4, "1/4"],
      [1 / 3, "1/3"],
      [3 / 8, "3/8"],
      [1 / 2, "1/2"],
      [5 / 8, "5/8"],
      [2 / 3, "2/3"],
      [3 / 4, "3/4"],
      [7 / 8, "7/8"],
    ];
    var best = table[table.length - 1];
    for (var i = 0; i < table.length; i++) if (frac >= table[i][0]) best = table[i];
    return whole === 0 ? best[1] : whole + " " + best[1];
  }

  function fmtIng(ing) {
    if (!ing) return "";
    var pieces = [fmtQty(ing.quantity, ing.unit), ing.unit].filter(Boolean).join(" ");
    var note = ing.note && !isOptional(ing) ? "(" + ing.note + ")" : "";
    return [pieces, ing.name, note].filter(Boolean).join(" ");
  }

  function fmtDuration(minutes) {
    if (!minutes) return "";
    var h = Math.floor(minutes / 60);
    var m = Math.round(minutes % 60);
    if (h && m) return h + " godz. " + m + " min";
    if (h) return h + " godz.";
    return m + " min";
  }

  function scaleQty(quantity, factor) {
    return quantity ? Math.round(quantity * factor * 100) / 100 : 0;
  }

  function scaleIng(ing, factor) {
    return { id: ing.id, raw: ing.raw, name: ing.name, note: ing.note, unit: ing.unit, quantity: scaleQty(ing.quantity, factor) };
  }

  function isOptional(ing) {
    return /opcjonaln/i.test(ing.note || "");
  }

  function ingKey(name, unit) {
    // nazwy z AI potrafią się różnić spacjami – normalizujemy białe znaki
    return String(name)
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ") + "::" + normalizeUnit(unit);
  }

  /** Dodaje składniki do listy, sumując ilości tych samych produktów. */
  function mergeInto(current, recipeId, ingredients) {
    var next = current.map(function (item) {
      return { id: item.id, name: item.name, unit: item.unit, quantity: item.quantity, checked: item.checked, fromRecipes: item.fromRecipes.slice(), manual: item.manual };
    });
    ingredients.forEach(function (ing) {
      var name = String(ing.name || ing.raw || "").trim();
      if (!name) return;
      var unit = normalizeUnit(ing.unit);
      var key = ingKey(name, unit);
      var found = null;
      for (var i = 0; i < next.length; i++) {
        if (!next[i].manual && ingKey(next[i].name, next[i].unit) === key) {
          found = next[i];
          break;
        }
      }
      if (found) {
        found.quantity = Math.round((found.quantity + ing.quantity) * 100) / 100;
        if (found.fromRecipes.indexOf(recipeId) === -1) found.fromRecipes.push(recipeId);
      } else {
        next.push({
          id: uid(),
          name: name,
          unit: unit,
          quantity: ing.quantity,
          checked: false,
          fromRecipes: [recipeId],
          manual: false,
        });
      }
    });
    return next;
  }

  function groupShopping(items, recipeTitle) {
    var order = [];
    var groups = {};
    items.forEach(function (item) {
      var key;
      if (item.manual || !item.fromRecipes.length) key = "Dopisane ręcznie";
      else if (item.fromRecipes.length > 1) key = "Wiele przepisów";
      else key = recipeTitle(item.fromRecipes[0]);
      if (!groups[key]) {
        groups[key] = [];
        order.push(key);
      }
      groups[key].push(item);
    });
    order.sort(function (a, b) {
      return a.localeCompare(b, "pl");
    });
    return order.map(function (key) {
      return { title: key, items: groups[key] };
    });
  }

  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleString("pl-PL");
    } catch (e) {
      return "";
    }
  }

  var SOURCE_LABEL = {
    image: "ze zdjęcia",
    url: "z linku",
    text: "z tekstu",
    manual: "ręcznie",
  };

  // ==================================================================
  // 2. Gemini
  // ==================================================================

  var API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";

  var SYSTEM_PROMPT = [
    "Jesteś doświadczonym szefem kuchni i parserem przepisów. Twoim zadaniem jest zamienić wejście",
    "(zdjęcie, treść strony albo notatki) w uporządkowany przepis kuchenny.",
    "",
    "Zasady:",
    "- Odczytuj składniki i kroki wiernie, ale normalizuj zapis.",
    "- Ilości podawaj jako liczby w systemie metrycznym. 1 szklanka to 250 ml, 1 łyżka to 15 ml,",
    "  1 łyżeczka to 5 ml. Jeśli źródło nie podaje ilości, wpisz 0.",
    '- Nazwa składnika ma być nazwą produktu, który kupisz w sklepie: mianownik, liczba pojedyncza,',
    '  małe litery, bez ilości i jednostki. "2 szypułki czosnku" -> nazwa "czosnek", ilość 2, jednostka "szt".',
    "- Nie łącz składników w jedną pozycję.",
    "- Kroki pisz bez numeracji, każdy jako osobny element, czas w minutach jeśli da się go wyliczyć.",
    "- Jeśli przepis jest niekompletny albo wejście nie jest przepisem, ustaw isRecipe=false i opisz",
    "  problem w confidenceNote, ale wypełnij to, co da się odczytać.",
    "- Jeśli zdjęcia nie da się odczytać, powiedz to wprost w confidenceNote i warnings. Nie zmyślaj.",
    "- Dodaj 2-5 tagów, np. szybkie, wegetariańskie, zupa.",
    "- title: krótka nazwa dania. description: maksymalnie 2 zdania o daniu.",
  ].join("\n");

  var RECIPE_SCHEMA = {
    type: "object",
    properties: {
      isRecipe: { type: "boolean" },
      confidenceNote: { type: "string" },
      title: { type: "string" },
      description: { type: "string" },
      servings: { type: "number" },
      prepMinutes: { type: "number" },
      cookMinutes: { type: "number" },
      totalMinutes: { type: "number" },
      tags: { type: "array", items: { type: "string" } },
      ingredients: {
        type: "array",
        items: {
          type: "object",
          properties: {
            raw: { type: "string" },
            name: { type: "string" },
            quantity: { type: "number" },
            unit: { type: "string" },
            note: { type: "string" },
          },
          required: ["raw", "name", "quantity", "unit", "note"],
        },
      },
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: { text: { type: "string" }, durationMinutes: { type: "number" } },
          required: ["text", "durationMinutes"],
        },
      },
      warnings: { type: "array", items: { type: "string" } },
    },
    required: [
      "isRecipe",
      "confidenceNote",
      "title",
      "description",
      "servings",
      "prepMinutes",
      "cookMinutes",
      "totalMinutes",
      "tags",
      "ingredients",
      "steps",
      "warnings",
    ],
  };

  /** Buduje ciało żądania – wydzielone, żeby dało się to przetestować bez sieci. */
  function buildRequest(kind, payload) {
    var parts = [];
    if (kind === "image") {
      parts.push({ inlineData: { mimeType: payload.mimeType, data: payload.data } });
      if (payload.hint) parts.push({ text: payload.hint });
    } else if (kind === "url") {
      // Adres MUSI być w treści polecenia – fileData.fileUri oznacza „plik”, a Gemini
      // odrzuca wtedy każdą stronę HTML komunikatem o nieobsługiwanym typie MIME.
      parts.push({
        text:
          "Poniżej adres strony z przepisem. Otwórz ją, odczytaj treść i wyodrębnij przepis:\n\n" +
          payload.url +
          "\n\nJeśli strona nie zawiera przepisu albo nie udało się jej otworzyć, ustaw isRecipe=false " +
          "i opisz dokładnie co było widoczne w confidenceNote.",
      });
    } else {
      parts.push({ text: "Poniżej notatki lub przepis. Uporządkuj je w przepis:\n\n" + payload.text });
    }

    var body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: "user", parts: parts }],
      generationConfig: {
        temperature: 0.2,
        responseMimeType: "application/json",
        responseSchema: RECIPE_SCHEMA,
      },
    };
    // Adres czytamy narzędziem URL context – działa na modelach Flash 3.x.
    if (kind === "url") {
      body.tools = [{ urlContext: {} }];
      // Strona jest już gotowym tekstem, więc długie „myślenie” modelu tylko
      // wydłuża import (zmierzone na żywo: ~13 s → ~5 s). Gdyby model tego pola
      // nie znał, callGemini powtarza zapytanie bez niego.
      body.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }
    return body;
  }

  function geminiError(message, status) {
    var err = new Error(message);
    err.status = status;
    return err;
  }

  function friendlyError(payload, response) {
    var detail = "";
    try {
      detail = (payload && payload.error && payload.error.message) || "";
    } catch (e) {
      detail = "";
    }
    if (!response.ok) {
      // Strona otwarta, ale nie do odczytania (blokuje roboty, wymaga logowania itd.)
      if (/cannot fetch content|unsupported mime|url_retrieval|failed to retrieve/i.test(detail)) {
        return geminiError(
          "Nie udało się odczytać tej strony. Może blokować automatyczne otwieranie albo wymagać " +
            "logowania. Otwórz link i wklej treść w zakładce Tekst.",
          400
        );
      }
      if (response.status === 400 && /url.?context|tool/i.test(detail)) {
        return geminiError(
          "Ten model nie umie czytać stron z linku. Zmień model w Ustawieniach na gemini-3.5-flash " +
            "albo wklej treść przepisu w zakładce Tekst.",
          400
        );
      }
      if (response.status === 400 && /api key not valid|API_KEY_INVALID/i.test(detail)) {
        return geminiError("Klucz API jest nieprawidłowy. Sprawdź go w Ustawieniach.", 401);
      }
      if (response.status === 401 || response.status === 403) {
        return geminiError("Gemini odrzucił klucz API (401/403). Sprawdź klucz i jego ograniczenia.", 401);
      }
      if (response.status === 404) {
        // Gemini wycofuje starsze modele dla nowych kluczy – bardzo częsty przypadek
        return geminiError(
          "Ten model nie jest już dostępny dla Twojego klucza (" + response.status + "). " +
            "Wybierz inny model w Ustawieniach, np. gemini-3.5-flash.",
          404
        );
      }
      if (response.status === 429) {
        if (/quota|billing/i.test(detail)) {
          return geminiError(
            "Przekroczono limit darmowego planu Gemini (429). Modele Pro wymagają płatności – " +
              "używ modelu Flash, np. gemini-3.5-flash.",
            429
          );
        }
        return geminiError("Przekroczono limit zapytań do Gemini (429). Odczekaj chwilę i spróbuj ponownie.", 429);
      }
      if (response.status === 503) {
        return geminiError(
          "Gemini jest teraz przeciążone (503). Spróbuj ponownie za chwilę albo zmień model w Ustawieniach.",
          503
        );
      }
      return geminiError("Gemini zwróciło błąd " + response.status + ": " + (detail || "brak szczegółów"), response.status);
    }
    return null;
  }

  function parseDraft(payload) {
    // model mógł zwrócić liczbę, string albo null – nie wywalajmy się wtedy
    if (!payload || typeof payload !== "object") payload = {};

    var ingredients = Array.isArray(payload.ingredients)
      ? payload.ingredients
          .map(function (raw) {
            if (!raw || typeof raw !== "object") return null;
            var name = String(raw.name || raw.raw || "").trim();
            if (!name) return null;
            return {
              id: uid(),
              raw: String(raw.raw || name).trim(),
              name: name,
              quantity: num(raw.quantity),
              unit: normalizeUnit(raw.unit),
              note: String(raw.note || "").trim(),
            };
          })
          .filter(Boolean)
      : [];

    var steps = Array.isArray(payload.steps)
      ? payload.steps
          .map(function (raw) {
            if (!raw || typeof raw !== "object") return null;
            var text = String(raw.text || "").trim();
            if (!text) return null;
            return { id: uid(), text: text, durationMinutes: num(raw.durationMinutes) };
          })
          .filter(Boolean)
      : [];

    var warnings = Array.isArray(payload.warnings)
      ? payload.warnings
          .map(function (w) {
            return String(w).trim();
          })
          .filter(Boolean)
      : [];
    var note = String(payload.confidenceNote || "").trim();
    // Model często powtarza tę samą informację w confidenceNote i w kilku
    // warningach (np. „zdjęcie nieczytelne” trzy razy innymi słowami).
    // Zostawiamy tylko ostrzeżenia, które wnoszą coś nowego.
    if (note) {
      var words = function (s) {
        return String(s)
          .toLowerCase()
          .replace(/[ąćęłńóśźż]/g, function (c) {
            return { ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z" }[c];
          })
          .split(/[^a-z0-9]+/)
          .filter(function (w) {
            return w.length >= 4;
          });
      };
      var noteWords = words(note);
      var adds = function (text) {
        var own = words(text);
        if (!own.length) return false;
        return !own.every(function (w) {
          return noteWords.indexOf(w) !== -1;
        });
      };
      var lowered = note.toLowerCase();
      warnings = warnings.filter(function (w) {
        return w.toLowerCase() !== lowered && adds(w);
      });
      warnings.unshift(note);
    }

    var total = num(payload.totalMinutes) || num(payload.prepMinutes) + num(payload.cookMinutes);
    var servings = num(payload.servings) || (ingredients.length ? 4 : 2);

    return {
      isRecipe: payload.isRecipe !== false && (ingredients.length > 0 || steps.length > 0),
      confidenceNote: note,
      title: String(payload.title || "").trim() || "Bez tytułu",
      description: String(payload.description || "").trim(),
      servings: Math.max(1, Math.round(servings)),
      prepMinutes: num(payload.prepMinutes),
      cookMinutes: num(payload.cookMinutes),
      totalMinutes: total,
      tags: Array.isArray(payload.tags)
        ? payload.tags.map(String).map(function (t) {
            return t.trim();
          }).filter(Boolean).slice(0, 8)
        : [],
      ingredients: ingredients,
      steps: steps,
      warnings: warnings,
    };
  }

  function callGemini(kind, payload, model, signal) {
    // klucz trzymamy w state.apiKey (nie w settings – settings idzie do localStorage bez sekretów)
    var key = String(state.apiKey || "").trim();
    if (!key) {
      return Promise.reject(
        geminiError("Brak klucza API Gemini. Ustaw go w Ustawieniach.", 401)
      );
    }
    var body = buildRequest(kind, payload);
    return sendGemini(body, key, model, signal).catch(function (error) {
      // Nie każdy model zna thinkingConfig – wtedy powtarzamy bez niego,
      // zamiast pokazywać użytkownikowi surowy błąd API.
      if (body.generationConfig.thinkingConfig && error && error.status === 400 && /thinking/i.test(error.detail || "")) {
        delete body.generationConfig.thinkingConfig;
        return sendGemini(body, key, model, signal);
      }
      throw error;
    });
  }

  /** Jedno zapytanie do Gemini: wysyłka, odczyt odpowiedzi, zamiana na szkic. */
  function sendGemini(body, key, model, signal) {
    return fetch(API_ROOT + "/" + model + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: signal,
    })
      .then(function (response) {
        return response.text().then(function (text) {
          var json = null;
          try {
            json = text ? JSON.parse(text) : null;
          } catch (e) {
            json = null;
          }
          var failure = friendlyError(json, response);
          if (failure) {
            failure.detail = String(
              (json && json.error && json.error.message) || ""
            ).slice(0, 400);
            throw failure;
          }
          var raw =
            json &&
            json.candidates &&
            json.candidates[0] &&
            json.candidates[0].content &&
            json.candidates[0].content.parts
              ? json.candidates[0].content.parts.map(function (p) {
                  return p.text || "";
                }).join("")
              : "";
          if (!raw.trim()) {
            var blocked = json && json.promptFeedback && json.promptFeedback.blockReason;
            throw geminiError(
              blocked
                ? "Gemini zablokowało żądanie (" + blocked + ")."
                : "Gemini zwróciło pustą odpowiedź – spróbuj ponownie lub zmień zdjęcie.",
              502
            );
          }
          var parsed;
          try {
            parsed = JSON.parse(raw);
          } catch (e) {
            throw geminiError("Odpowiedź Gemini nie jest poprawnym JSON-em.", 502);
          }
          return parseDraft(parsed);
        });
      })
      .catch(function (error) {
        if (error && error.status) throw error;
        if (error && error.name === "TypeError") {
          throw geminiError(
            "Nie udało się połączyć z Gemini. Sprawdź internet – ta strona działa w całości w przeglądarce.",
            0
          );
        }
        throw error;
      });
  }

  // ==================================================================
  // 2b. Miniatury przepisów (osobny model graficzny)
  // ==================================================================

  // Modele graficzne to osobna rodzina niż tekstowe i na darmowym planie Gemini
  // zwykle niedostępna (API odpowiada 429 „exceeded your current quota”).
  // Dlatego lista modeli jest z fallbackiem, a błąd limitu nie jest pokazywany
  // jako krzak – tylko zapisywany w ustawieniach i opisany jednym zdaniem.
  var IMAGE_MODELS = ["gemini-2.5-flash-image", "gemini-3.1-flash-image"];
  // 1,4 MB – tyle dataURL wytrzyma bez problemu w pamięci przeglądarki i w podglądzie.
  var MAX_ILLUSTRATION_BYTES = 1400 * 1024;

  function buildImageRequest(text) {
    return {
      contents: [{ role: "user", parts: [{ text: text }] }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: "1:1" },
      },
    };
  }

  /** Prompt po polsku: tytuł + składniki wystarczą, żeby Gemini wymyśliło danie. */
  function illustrationPrompt(draft) {
    var names = (draft.ingredients || [])
      .map(function (i) {
        return i && i.name ? String(i.name) : "";
      })
      .filter(Boolean)
      .slice(0, 10)
      .join(", ");
    return [
      "Narysuj prostą, płaską ilustrację w stylu nowoczesnej ikonki kuchennej:",
      String((draft && draft.title) || "potrawa") + ".",
      names ? "Na obrazku widać składniki: " + names + "." : "",
      "Zasady: jednolite jasne tło, brak tekstu i napisów, brak logotypów i znaków wodnych,",
      "bez ludzi, jeden talerz albo miska w centrum, styl wektorowy, kolory pastelowe.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  function postGeminiImage(model, body, key, signal) {
    return fetch(API_ROOT + "/" + model + ":generateContent", {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(body),
      signal: signal,
    }).then(function (response) {
      return response.text().then(function (text) {
        var json = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch (e) {
          json = null;
        }
        return { response: response, json: json };
      });
    });
  }

  /**
   * Prosi Gemini o rysunek i zwraca dataURL. Przy 404 próbuje następnego modelu,
   * przy 429/403 rzuca błąd z flagą `blocked` – to informacja dla ustawień,
   * a nie zachęta do ponawiania zapytania przy każdym imporcie.
   */
  function callGeminiImage(text, signal) {
    var key = String(state.apiKey || "").trim();
    if (!key) {
      return Promise.reject(geminiError("Brak klucza API Gemini. Ustaw go w Ustawieniach.", 401));
    }
    var body = buildImageRequest(text);
    var index = 0;

    function next() {
      if (index >= IMAGE_MODELS.length) {
        return Promise.reject(geminiError("Nie udało się narysować miniaturki.", 502));
      }
      var model = IMAGE_MODELS[index++];
      return postGeminiImage(model, body, key, signal).then(function (res) {
        var status = res.response.status;
        if (!res.response.ok) {
          var detail = String(((res.json && res.json.error && res.json.error.message) || "")).slice(0, 300);
          if (status === 429 || status === 403) {
            var limited = geminiError("Generowanie obrazów jest niedostępne na tym planie Gemini.", status);
            limited.blocked = true;
            limited.detail = detail;
            throw limited;
          }
          // model wycofany – próbujemy następnego z listy
          if (status === 404) return next();
          throw geminiError("Gemini zwróciło błąd " + status + ": " + detail, status);
        }
        var parts =
          (res.json &&
            res.json.candidates &&
            res.json.candidates[0] &&
            res.json.candidates[0].content &&
            res.json.candidates[0].content.parts) ||
          [];
        var image = null;
        for (var i = 0; i < parts.length; i++) {
          if (parts[i].inlineData && parts[i].inlineData.data) {
            image = parts[i].inlineData;
            break;
          }
        }
        if (!image) {
          throw geminiError("Gemini nie zwrócił obrazka – sama miniaturka, bez importu.", 502);
        }
        if (Math.round((image.data.length * 3) / 4) > MAX_ILLUSTRATION_BYTES) {
          throw geminiError("Miniaturka jest za duża, żeby ją pokazać.", 502);
        }
        return "data:" + (image.mimeType || "image/png") + ";base64," + image.data;
      });
    }

    return next().catch(function (error) {
      if (error && error.name === "TypeError") {
        throw geminiError("Nie udało się połączyć z Gemini.", 0);
      }
      throw error;
    });
  }

  /** Zmniejsza zdjęcie z telefonu, żeby nie wysyłać 8 MP do API. */
  function shrinkImage(file, maxSide, quality) {
    maxSide = maxSide || 1600;
    quality = quality || 0.85;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () {
        reject(geminiError("Nie udało się odczytać pliku ze zdjęciem.", 400));
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          reject(geminiError("To nie jest poprawny plik graficzny.", 415));
        };
        img.onload = function () {
          try {
            var scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            var w = Math.max(1, Math.round(img.width * scale));
            var h = Math.max(1, Math.round(img.height * scale));
            var canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, w, h);
            resolve({
              data: canvas.toDataURL("image/jpeg", quality).split(",")[1],
              mimeType: "image/jpeg",
              width: w,
              height: h,
            });
          } catch (e) {
            reject(geminiError("Nie udało się przetworzyć zdjęcia: " + e.message, 500));
          }
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // ==================================================================
  // 3. Stan i zapis
  // ==================================================================

  // Klucze zostają „recipe-bro.*", choć aplikacja nazywa się Przepiśnik:
   // zmiana prefiksu skasowałaby wszystkie zapisane przepisy i ustawienia.
  var LS_RECIPES = "recipe-bro.recipes";
  var LS_SHOPPING = "recipe-bro.shopping";
  var LS_SETTINGS = "recipe-bro.settings";
  var LS_KEY = "recipe-bro.key"; // klucz tylko na czas sesji
  var DRAFT_KEY = "recipe-bro.draft";

  var DEFAULTS = {
    model: "gemini-3.5-flash",
    shoppingServings: 4,
    rememberKey: true,
    illustrations: true,
    illustrationsBlocked: false,
  };

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Dane z localStorage i z importowanego pliku mogą być byle jakie – dociągamy brakujące pola. */
  function normalizeRecipe(raw) {
    if (!raw || typeof raw !== "object") return null;
    var recipe = {
      id: String(raw.id || uid()),
      title: String(raw.title || "Bez tytułu"),
      description: String(raw.description || ""),
      servings: Math.max(1, Math.round(num(raw.servings)) || 4),
      prepMinutes: num(raw.prepMinutes),
      cookMinutes: num(raw.cookMinutes),
      totalMinutes: num(raw.totalMinutes),
      tags: Array.isArray(raw.tags) ? raw.tags.map(String).filter(Boolean) : [],
      ingredients: Array.isArray(raw.ingredients)
        ? raw.ingredients
            .map(function (ing) {
              if (!ing || typeof ing !== "object") return null;
              var name = String(ing.name || "").trim();
              if (!name) return null;
              return {
                id: String(ing.id || uid()),
                raw: String(ing.raw || name),
                name: name,
                quantity: num(ing.quantity),
                unit: normalizeUnit(ing.unit),
                note: String(ing.note || ""),
              };
            })
            .filter(Boolean)
        : [],
      steps: Array.isArray(raw.steps)
        ? raw.steps
            .map(function (step) {
              if (!step || typeof step !== "object") return null;
              var text = String(step.text || "").trim();
              if (!text) return null;
              return { id: String(step.id || uid()), text: text, durationMinutes: num(step.durationMinutes) };
            })
            .filter(Boolean)
        : [],
      warnings: Array.isArray(raw.warnings) ? raw.warnings.map(String).filter(Boolean) : [],
      source: raw.source ? String(raw.source) : null,
      sourceType: SOURCE_LABEL[raw.sourceType] ? raw.sourceType : "manual",
      createdAt: raw.createdAt || new Date().toISOString(),
      updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
    };
    return recipe;
  }

  function normalizeShopping(raw) {
    if (!raw || typeof raw !== "object") return null;
    var name = String(raw.name || "").trim();
    if (!name) return null;
    return {
      id: String(raw.id || uid()),
      name: name,
      unit: normalizeUnit(raw.unit),
      quantity: num(raw.quantity),
      checked: !!raw.checked,
      fromRecipes: Array.isArray(raw.fromRecipes) ? raw.fromRecipes.map(String) : [],
      manual: !!raw.manual || !Array.isArray(raw.fromRecipes) || raw.fromRecipes.length === 0,
    };
  }

  function normalizeList(list, mapper) {
    return Array.isArray(list) ? list.map(mapper).filter(Boolean) : [];
  }

  // Modele Gemini 2.x zostały wycofane dla nowych kluczy (API odpowiada 404).
  // Ktoś, kto ustawił je przed aktualizacją, niech dostanie model działający.
  var RETIRED_MODELS = [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.5-pro",
  ];

  function normalizeSettings(raw) {
    var merged = Object.assign({}, DEFAULTS, raw);
    if (RETIRED_MODELS.indexOf(merged.model) !== -1) merged.model = DEFAULTS.model;
    return merged;
  }

  var state = {
    recipes: normalizeList(load(LS_RECIPES, []), normalizeRecipe),
    shopping: normalizeList(load(LS_SHOPPING, []), normalizeShopping),
    settings: normalizeSettings(load(LS_SETTINGS, {}) || {}),
    apiKey: "",
    view: "import",
    detailId: null,
    draft: null,
    draftIsNew: false,
    importTab: "image",
    shoppingTab: "todo",
    search: "",
    tag: "",
    pendingImage: null,
    illustration: null,
    illustrating: false,
    illustrationToken: 0,
    importAbort: null,
    excluded: {},
    servings: null,
    addedNote: false,
  };

  function persistRecipes() {
    if (!save(LS_RECIPES, state.recipes)) {
      flash("Nie udało się zapisać – pamięć przeglądarki jest pełna.", "err");
    }
  }

  function persistShopping() {
    if (!save(LS_SHOPPING, state.shopping)) {
      flash("Nie udało się zapisać listy zakupów – pamięć przeglądarki jest pełna.", "err");
    }
  }

  function persistSettings() {
    save(LS_SETTINGS, state.settings);
    try {
      if (state.settings.rememberKey) {
        localStorage.setItem(LS_KEY, state.apiKey);
        sessionStorage.removeItem(LS_KEY);
      } else {
        localStorage.removeItem(LS_KEY);
        sessionStorage.setItem(LS_KEY, state.apiKey);
      }
    } catch (e) {
      /* pamięć niedostępna */
    }
  }

  function loadKey() {
    var stored = "";
    try {
      stored = localStorage.getItem(LS_KEY) || sessionStorage.getItem(LS_KEY) || "";
    } catch (e) {
      stored = "";
    }
    state.apiKey = stored.trim();
    if (!state.settings.rememberKey && stored) state.settings.rememberKey = false;
    if (!stored) state.settings.rememberKey = true;
  }

  function persistDraft() {
    try {
      if (state.draft) {
        sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft: state.draft, isNew: state.draftIsNew }));
      } else {
        sessionStorage.removeItem(DRAFT_KEY);
      }
    } catch (e) {
      /* ignorujemy */
    }
  }

  // ==================================================================
  // 4. Nawigacja
  // ==================================================================

  var VIEWS = ["import", "editor", "recipes", "detail", "shopping", "settings"];

  function show(view) {
    state.view = view;
    state.addedNote = false;
    VIEWS.forEach(function (name) {
      var el = document.getElementById("view-" + name);
      if (el) el.classList.toggle("hidden", name !== view);
    });
    $$(".tabbar button").forEach(function (btn) {
      var target = btn.getAttribute("data-view");
      var active = target === view || (view === "detail" && target === "recipes") || (view === "editor" && target === "import");
      if (active) btn.setAttribute("aria-current", "page");
      else btn.removeAttribute("aria-current");
    });
    window.scrollTo(0, 0);
    render();
  }

  function render() {
    updateKeyPill();
    updateBadge();
    if (state.view === "recipes") renderRecipes();
    if (state.view === "detail") renderDetail();
    if (state.view === "shopping") renderShopping();
    if (state.view === "editor") renderEditor();
    if (state.view === "settings") renderSettings();
    if (state.view === "import") renderImportNotice();
  }

  function updateKeyPill() {
    var pill = $("#keyPill");
    if (state.apiKey) {
      pill.textContent = "klucz ✓";
      pill.className = "keypill ok";
    } else {
      pill.textContent = "brak klucza";
      pill.className = "keypill bad";
    }
  }

  function updateBadge() {
    var count = state.shopping.filter(function (i) {
      return !i.checked;
    }).length;
    var badge = $("#shopBadge");
    badge.textContent = count > 99 ? "99+" : String(count);
    badge.classList.toggle("hidden", count === 0);
  }

  // ==================================================================
  // 5. Widok: import
  // ==================================================================

  function renderImportNotice() {
    var box = $("#importNotice");
    if (state.apiKey) {
      box.innerHTML = "";
      return;
    }
    box.innerHTML =
      '<div class="note warn">Brak klucza API Gemini. Dodaj go w <b>Ustawieniach</b> ' +
      '(ikona ⚙️ na dole ekranu). Klucz zostaje wyłącznie w tej przeglądarce.</div>';
  }

  function setImportTab(tab) {
    state.importTab = tab;
    $$("#importCard .seg button").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-tab") === tab ? "true" : "false");
    });
    $("#tab-image").classList.toggle("hidden", tab !== "image");
    $("#tab-url").classList.toggle("hidden", tab !== "url");
    $("#tab-text").classList.toggle("hidden", tab !== "text");
    $("#drop").style.display = tab === "image" ? "" : "none";
    $("#cameraRow").hidden = tab !== "image" || !isTouch();
    renderDropInner();
  }

  function isTouch() {
    return window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
  }

  // Stan początkowy pola do upuszczania zdjęcia – zapamiętywany przy pierwszym
// wyborze pliku, żeby po imporcie dało się przywrócić go bez powielania
// znaczników w JS.
  var dropInnerDefault = null;

  function defaultDropHtml() {
    if (dropInnerDefault === null) dropInnerDefault = $("#dropInner").innerHTML;
    return dropInnerDefault;
  }

  /**
   * Pole na zdjęcie ma cztery stany: wybrany plik, rysowana miniaturka,
   * gotowa miniaturka albo czysty placeholder z ikoną.
   */
  function renderDropInner() {
    var box = $("#dropInner");
    if (!box) return;
    if (state.pendingImage) {
      var fileName = esc((state.pendingImage && state.pendingImage.name) || "zdjęcie");
      box.innerHTML =
        '<div style="font-size: 30px">✅</div>' +
        '<p class="mb" style="margin-top:6px">' +
        fileName +
        "</p><p class='tiny'>Kliknij, żeby wybrać inne</p>";
      return;
    }
    if (state.illustrating) {
      box.innerHTML =
        '<div style="font-size: 26px">🎨</div>' +
        '<p class="mb" style="margin-top:6px">Rysuję miniaturkę…</p>' +
        "<p class='tiny'>Przepis możesz już edytować</p>";
      return;
    }
    if (state.illustration && state.illustration.url) {
      box.innerHTML =
        '<img class="art" src="' +
        state.illustration.url +
        '" alt="Miniatura przepisu" /><p class="tiny">Kliknij, żeby zrobić zdjęcie</p>';
      return;
    }
    box.innerHTML = defaultDropHtml();
  }

  /**
   * Rysunek powstaje w tle po imporcie – nie blokujemy otwarcia edytora.
   * Token chroni przed odpowiedzią do nieaktualnego przepisu (np. gdy użytkownik
   * zdążył zaimportować kolejny, zanim pierwsza miniaturka się doczekała).
   */
  function startIllustration(draft) {
    if (!state.settings.illustrations || state.settings.illustrationsBlocked) return;
    if (!String(state.apiKey || "").trim()) return;
    var token = ++state.illustrationToken;
    state.illustrating = true;
    state.illustration = null;
    renderDropInner();
    callGeminiImage(illustrationPrompt(draft))
      .then(function (url) {
        if (token !== state.illustrationToken) return;
        state.illustrating = false;
        state.illustration = { url: url, title: (draft && draft.title) || "" };
        renderDropInner();
      })
      .catch(function (error) {
        if (token !== state.illustrationToken) return;
        state.illustrating = false;
        // limit planu to nie błąd importu – zapamiętujemy go i milczymy
        if (error && error.blocked) {
          state.settings.illustrationsBlocked = true;
          persistSettings();
          renderSettings();
        }
        renderDropInner();
      });
  }

  function setImage(file) {
    if (!file) return;
    if (!/^image\//.test(file.type)) {
      flash("To nie jest plik graficzny.", "err", "#importError");
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      flash("Zdjęcie jest za duże (limit 25 MB).", "err", "#importError");
      return;
    }
    setImportTab("image");
    state.pendingImage = file;
    // wybranie nowego zdjęcia kasuje starą miniaturkę i przerywa jej rysowanie
    state.illustrationToken++;
    state.illustrating = false;
    state.illustration = null;
    $("#imageInfo").innerHTML = "Wybrano: <b>" + esc(file.name || "bez nazwy") + "</b>";
    defaultDropHtml();
    renderDropInner();
    // na telefonie pokazujemy oba wybory: aparat i galeria
    $("#cameraRow").hidden = false;
  }

  /** Czyści wejście wybranej zakładki po udanym imporcie. */
  function clearImportInput(kind) {
    if (kind === "text") {
      $("#textInput").value = "";
    } else if (kind === "url") {
      $("#urlInput").value = "";
    } else if (kind === "image") {
      state.pendingImage = null;
      renderDropInner();
      $("#imageInfo").innerHTML = "";
      $("#imageHint").value = "";
      $("#cameraRow").hidden = !isTouch();
    }
  }

  async function runParse() {
    var btn = $("#btnParse");
    var status = $("#parseStatus");
    var errorBox = $("#importError");
    errorBox.innerHTML = "";
    var kind = state.importTab;
    var payload;

    if (kind === "image") {
      if (!state.pendingImage) {
        flash("Najpierw wybierz zdjęcie przepisu.", "err", "#importError");
        return;
      }
      status.innerHTML = '<span class="spinner"></span> zmniejszam zdjęcie…';
      try {
        var small = await shrinkImage(state.pendingImage);
        payload = { data: small.data, mimeType: small.mimeType, hint: $("#imageHint").value.trim() };
        status.innerHTML = '<span class="spinner"></span> czytam przepis ze zdjęcia…';
      } catch (e) {
        status.textContent = "";
        flash(e.message, "err", "#importError");
        return;
      }
    } else if (kind === "url") {
      var raw = $("#urlInput").value.trim();
      if (!raw) {
        flash("Wklej adres strony z przepisem.", "err", "#importError");
        return;
      }
      var url = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
      // tania walidacja – Gemini i tak nie otworzy czegoś, co nie jest adresem
      if (!/^https?:\/\/[^\s/?#]+\.[a-z]{2,}(\/|$|\?)/i.test(url)) {
        flash("To nie wygląda na adres strony. Popraw link i spróbuj ponownie.", "err", "#importError");
        return;
      }
      payload = { url: url };
      status.innerHTML = '<span class="spinner"></span> czytam stronę…';
    } else {
      var text = $("#textInput").value;
      if (text.trim().length < 10) {
        flash("Wklej więcej treści – minimum kilka zdań.", "err", "#importError");
        return;
      }
      payload = { text: text.slice(0, 40000) };
      status.innerHTML = '<span class="spinner"></span> porządkuję przepis…';
    }

    btn.disabled = true;
    state.importAbort = new AbortController();
    var cancelBtn = $("#btnCancelParse");
    cancelBtn.classList.remove("hidden");
    // Import z linku potrafi trwać minutę na słabym wifi – mówimy wprost,
    // żeby użytkownik nie myślał, że aplikacja się zawiesiła.
    var slowHint = setTimeout(function () {
      if (!state.importAbort) return;
      status.textContent =
        kind === "url" ? "Strona wciąż się otwiera – to może potrwać do minuty…" : "Gemini się zastanawia…";
    }, 12000);
    try {
      var draft = await callGemini(kind, payload, state.settings.model, state.importAbort.signal);
      state.draft = draft;
      state.draftIsNew = true;
      state.draft.sourceType = kind;
      state.draft.source = kind === "url" ? payload.url : null;
      persistDraft();
      // Po udanym imporcie czyścimy wejście – przepis jest już w szkicu, a stare
      // notatki, link czy zdjęcie tylko plesły przy następnym imporcie. Przy błędzie
      // zostawiamy wszystko, bo użytkownik pewnie spróbuje jeszcze raz.
      clearImportInput(kind);
      // miniaturka rysuje się w tle, więc edytor otwiera się od razu
      startIllustration(draft);
      status.textContent = "";
      show("editor");
    } catch (e) {
      status.textContent = "";
      if (e && (e.name === "AbortError" || e.cancelled)) {
        flash("Anulowano.", "", "#importError");
      } else {
        flash(e.message, "err", "#importError");
      }
    } finally {
      clearTimeout(slowHint);
      state.importAbort = null;
      cancelBtn.classList.add("hidden");
      btn.disabled = false;
    }
  }

  function cancelParse() {
    if (state.importAbort) state.importAbort.abort();
  }

  // ==================================================================
  // 6. Widok: recenzja / edytor
  // ==================================================================

  function unitOptions(selected) {
    var value = normalizeUnit(selected);
    var html = '<option value="">—</option>';
    UNITS.forEach(function (unit) {
      html +=
        '<option value="' +
        esc(unit) +
        '"' +
        (unit === value ? " selected" : "") +
        ">" +
        esc(unit) +
        "</option>";
    });
    if (value && UNITS.indexOf(value) === -1) {
      html += '<option value="' + esc(value) + '" selected>' + esc(value) + "</option>";
    }
    return html;
  }

  function renderEditor() {
    var draft = state.draft;
    if (!draft) {
      show("import");
      return;
    }
    $("#editorHeading").textContent = state.draftIsNew ? "Sprawdź i zapisz" : "Edycja przepisu";
    $("#editorSub").textContent = state.draftIsNew
      ? "AI mogło coś przeoczyć – popraw rzeczy, które chcesz."
      : "Zmiany zapisuję przyciskiem na dole.";

    var notice = "";
    // confidenceNote jest pierwszym elementem warnings – pokazujemy je tylko raz
    if (draft.confidenceNote) {
      notice += '<div class="note warn">' + esc(draft.confidenceNote) + "</div>";
    }
    if (draft.warnings && draft.warnings.length > 1) {
      notice +=
        '<div class="note warn"><b>Uwagi AI</b><ul style="margin:6px 0 0 18px;padding:0">' +
        draft.warnings
          .slice(1)
          .map(function (w) {
            return "<li>" + esc(w) + "</li>";
          })
          .join("") +
        "</ul></div>";
    }
    $("#editorNotice").innerHTML = notice;

    var html =
      '<div class="card">' +
      '<label class="field"><span>Tytuł</span><input data-f="title" value="' + esc(draft.title) + '"></label>' +
      '<label class="field"><span>Opis</span><textarea data-f="description" rows="2">' + esc(draft.description) + "</textarea></label>" +
      '<div class="grid4">' +
      '<label class="field"><span>Porcje</span><input type="number" min="1" step="1" data-f="servings" value="' + esc(draft.servings) + '"></label>' +
      '<label class="field"><span>Przygotowanie</span><input type="number" min="0" data-f="prepMinutes" value="' + (draft.prepMinutes || "") + '" placeholder="min"></label>' +
      '<label class="field"><span>Gotowanie</span><input type="number" min="0" data-f="cookMinutes" value="' + (draft.cookMinutes || "") + '" placeholder="min"></label>' +
      '<label class="field"><span>Razem</span><input type="number" min="0" data-f="totalMinutes" value="' + (draft.totalMinutes || "") + '" placeholder="min"></label>' +
      "</div>" +
      '<label class="field"><span>Tagi (po przecinku)</span><input data-f="tags" value="' + esc(draft.tags.join(", ")) + '" placeholder="szybkie, wegetariańskie"></label>' +
      "</div>";

    html +=
      '<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Składniki (' +
      draft.ingredients.length +
      ')</h2><div class="spacer"></div><button class="btn ghost sm" type="button" id="btnAddIng">+ Składnik</button></div>' +
      '<div class="ing-grid">';
    draft.ingredients.forEach(function (ing, index) {
      html +=
        '<div class="ing" data-ing="' +
        esc(ing.id) +
        '">' +
        '<div class="grid4" style="grid-template-columns:4.6rem 6.5rem 1fr auto">' +
        '<input type="number" min="0" step="any" placeholder="0" data-ing-field="quantity" data-id="' +
        esc(ing.id) +
        '" value="' +
        (ing.quantity || "") +
        '">' +
        '<select data-ing-field="unit" data-id="' +
        esc(ing.id) +
        '">' +
        unitOptions(ing.unit) +
        "</select>" +
        '<input placeholder="mąka pszenna" data-ing-field="name" data-id="' +
        esc(ing.id) +
        '" value="' +
        esc(ing.name) +
        '">' +
        '<button class="icon-btn" type="button" data-ing-del="' +
        esc(ing.id) +
        '" aria-label="Usuń">✕</button>' +
        "</div>" +
        '<div class="preview" data-preview="' +
        esc(ing.id) +
        '">' +
        (index + 1) +
        ". " +
        esc(fmtIng(ing)) +
        "</div>" +
        '<div class="ops">' +
        '<button class="icon-btn" type="button" data-ing-opt="' +
        esc(ing.id) +
        '" aria-pressed="' +
        (isOptional(ing) ? "true" : "false") +
        '">opcjonalne</button>' +
        '<input placeholder="np. świeży, do smaku" data-ing-field="note" data-id="' +
        esc(ing.id) +
        '" value="' +
        esc(ing.note) +
        '" style="flex:1;min-height:36px;font-size:.85rem">' +
        "</div></div>";
    });
    if (!draft.ingredients.length) {
      html += '<p class="small muted mb">Brak składników – dodaj je ręcznie.</p>';
    }
    html += "</div></div>";

    html +=
      '<div class="card"><div class="row" style="margin-bottom:10px"><h2 style="margin:0">Kroki (' +
      draft.steps.length +
      ')</h2><div class="spacer"></div><button class="btn ghost sm" type="button" id="btnAddStep">+ Krok</button></div>';
    draft.steps.forEach(function (step, index) {
      html +=
        '<div class="step" data-step="' +
        esc(step.id) +
        '"><span class="num">' +
        (index + 1) +
        '</span><textarea placeholder="Co robić…" data-step-field="text" data-id="' +
        esc(step.id) +
        '">' +
        esc(step.text) +
        '</textarea><span class="side"><input type="number" min="0" placeholder="min" title="Czas kroku w minutach" data-step-field="durationMinutes" data-id="' +
        esc(step.id) +
        '" value="' +
        (step.durationMinutes || "") +
        '"><span class="moves"><button type="button" data-step-move="up" data-id="' +
        esc(step.id) +
        '">↑</button><button type="button" data-step-move="down" data-id="' +
        esc(step.id) +
        '">↓</button><button type="button" data-step-move="del" data-id="' +
        esc(step.id) +
        '">✕</button></span></span></div>';
    });
    if (!draft.steps.length) {
      html += '<p class="small muted mb">Brak kroków.</p>';
    }
    html += "</div>";

    $("#editorBody").innerHTML = html;
  }

  function findIng(id) {
    return state.draft.ingredients.filter(function (i) {
      return i.id === id;
    })[0];
  }

  function findStep(id) {
    return state.draft.steps.filter(function (i) {
      return i.id === id;
    })[0];
  }

  function refreshPreview(id) {
    var ing = findIng(id);
    var el = $('[data-preview="' + id + '"]');
    if (!ing || !el) return;
    var index = state.draft.ingredients.indexOf(ing);
    el.textContent = (index + 1) + ". " + fmtIng(ing);
  }

  /** Puste wiersze zostawione po kliknięciu „+ Składnik" nie powinny trafić do przepisu. */
  function cleanDraft(draft) {
    draft.ingredients = draft.ingredients.filter(function (i) {
      return String(i.name || "").trim() || String(i.raw || "").trim();
    });
    draft.steps = draft.steps.filter(function (s) {
      return String(s.text || "").trim();
    });
    if (!draft.steps.length && !draft.ingredients.length) return false;
    return true;
  }

  function saveDraft() {
    var draft = state.draft;
    if (!draft) return;
    if (!draft.title.trim()) {
      flash("Przepis musi mieć tytuł.", "err", "#editorNotice");
      return;
    }
    if (!cleanDraft(draft)) {
      flash("Przepis musi mieć przynajmniej jeden składnik albo jeden krok.", "err", "#editorNotice");
      return;
    }
    var now = new Date().toISOString();
    if (state.draftIsNew) {
      var recipe = {
        id: uid(),
        title: draft.title.trim(),
        description: draft.description,
        servings: draft.servings,
        prepMinutes: draft.prepMinutes,
        cookMinutes: draft.cookMinutes,
        totalMinutes: draft.totalMinutes,
        tags: draft.tags,
        ingredients: draft.ingredients,
        steps: draft.steps,
        warnings: draft.warnings,
        source: draft.source || null,
        sourceType: draft.sourceType || "manual",
        createdAt: now,
        updatedAt: now,
      };
      state.recipes.unshift(recipe);
      state.detailId = recipe.id;
      state.draft = null;
      state.draftIsNew = false;
      persistDraft();
      persistRecipes();
      state.servings = recipe.servings;
      state.excluded = {};
      flash("Zapisano „" + recipe.title + "”.", "ok", "#detailFlash");
      show("detail");
      return;
    }
    var index = state.recipes.findIndex(function (r) {
      return r.id === state.detailId;
    });
    if (index === -1) {
      show("recipes");
      return;
    }
    state.recipes[index] = Object.assign({}, state.recipes[index], {
      title: draft.title.trim(),
      description: draft.description,
      servings: draft.servings,
      prepMinutes: draft.prepMinutes,
      cookMinutes: draft.cookMinutes,
      totalMinutes: draft.totalMinutes,
      tags: draft.tags,
      ingredients: draft.ingredients,
      steps: draft.steps,
      warnings: draft.warnings,
      updatedAt: now,
    });
    state.draft = null;
    state.draftIsNew = false;
    persistDraft();
    persistRecipes();
    // portcje mogły się zmienić – wracamy do nowej wartości, inaczej detail pokazałby
    // przeskalowane składniki względem starej liczby porcji
    state.servings = draft.servings;
    state.excluded = {};
    flash("Zapisano zmiany.", "ok", "#detailFlash");
    show("detail");
  }

  // ==================================================================
  // 7. Widok: lista przepisów
  // ==================================================================

  function allTags() {
    var counts = {};
    state.recipes.forEach(function (r) {
      (r.tags || []).forEach(function (t) {
        counts[t] = (counts[t] || 0) + 1;
      });
    });
    return Object.keys(counts)
      .sort(function (a, b) {
        return counts[b] - counts[a] || a.localeCompare(b, "pl");
      })
      .map(function (name) {
        return { name: name, count: counts[name] };
      });
  }

  function filteredRecipes() {
    var q = state.search.trim().toLowerCase();
    return state.recipes.filter(function (recipe) {
      if (state.tag && (recipe.tags || []).indexOf(state.tag) === -1) return false;
      if (!q) return true;
      return (
        recipe.title.toLowerCase().indexOf(q) !== -1 ||
        (recipe.description || "").toLowerCase().indexOf(q) !== -1 ||
        (recipe.tags || []).join(" ").toLowerCase().indexOf(q) !== -1 ||
        recipe.ingredients.some(function (i) {
          return i.name.toLowerCase().indexOf(q) !== -1;
        })
      );
    });
  }

  function renderRecipes() {
    $("#recipesSub").textContent = state.recipes.length
      ? state.recipes.length === 1
        ? "1 zapisany przepis"
        : state.recipes.length + " zapisanych przepisów"
      : "Jeszcze nic tu nie ma";

    var tags = allTags();
    var tagHtml = allTagsButton("", "Wszystkie");
    tags.forEach(function (t) {
      tagHtml += allTagsButton(t.name, t.name + " " + t.count);
    });
    $("#tagBar").innerHTML = tags.length ? tagHtml : "";

    var list = filteredRecipes();
    if (!state.recipes.length) {
      $("#recipesList").innerHTML =
        '<div class="card empty">Nie masz jeszcze żadnego przepisu.<br>Wróć do zakładki <b>📷 Import</b> ' +
        "i wrzuć zdjęcie, link albo tekst.</div>";
      return;
    }
    if (!list.length) {
      $("#recipesList").innerHTML = '<div class="card empty">Nic nie pasuje do tego filtra.</div>';
      return;
    }

    $("#recipesList").innerHTML = list
      .map(function (recipe) {
        var chips =
          '<span class="chip">' + esc(recipe.servings) + " porcji</span>" +
          (recipe.totalMinutes ? '<span class="chip">' + esc(fmtDuration(recipe.totalMinutes)) + "</span>" : "") +
          '<span class="chip">' + esc(recipe.ingredients.length) + " skł.</span>" +
          (recipe.tags || [])
            .slice(0, 3)
            .map(function (t) {
              return '<span class="chip accent">' + esc(t) + "</span>";
            })
            .join("");
        return (
          '<div class="card recipe"><div class="recipe-head"><span class="thumb ph" aria-hidden="true">🍽️</span>' +
          '<div style="min-width:0;flex:1"><h3>' + esc(recipe.title) + "</h3>" +
          '<p class="small muted clamp2" style="margin:2px 0 0">' +
          esc(recipe.description || SOURCE_LABEL[recipe.sourceType] || "") +
          "</p></div></div>" +
          '<div class="chips">' + chips + "</div>" +
          '<div class="row"><button class="btn sm" type="button" data-open="' + esc(recipe.id) + '" style="flex:1">Otwórz</button>' +
          '<button class="btn danger sm" type="button" data-del="' + esc(recipe.id) + '">Usuń</button></div></div>'
        );
      })
      .join("");
  }

  function allTagsButton(value, label) {
    return (
      '<button class="chip" type="button" data-tag="' + esc(value) + '" style="cursor:pointer;border:0;' +
      (state.tag === value ? "background:var(--accent);color:#fff;" : "") +
      '">' + esc(label) + "</button>"
    );
  }

  // ==================================================================
  // 8. Widok: przepis
  // ==================================================================

  function recipeById(id) {
    return state.recipes.filter(function (r) {
      return r.id === id;
    })[0];
  }

  function renderDetail() {
    var recipe = recipeById(state.detailId);
    var box = $("#detailBody");
    if (!recipe) {
      box.innerHTML = '<div class="card empty">Nie znaleziono przepisu.</div>';
      return;
    }
    var servings = state.servings || recipe.servings;
    var factor = servings / Math.max(1, recipe.servings);

    var head =
      '<div class="card"><h1 style="margin-bottom:2px">' + esc(recipe.title) + "</h1>" +
      (recipe.description ? '<p class="small muted" style="margin-bottom:10px">' + esc(recipe.description) + "</p>" : "") +
      '<div class="chips mb">' +
      '<span class="chip">' + esc(SOURCE_LABEL[recipe.sourceType] || "przepis") + "</span>" +
      (recipe.prepMinutes ? '<span class="chip">prep ' + esc(fmtDuration(recipe.prepMinutes)) + "</span>" : "") +
      (recipe.cookMinutes ? '<span class="chip">gotowanie ' + esc(fmtDuration(recipe.cookMinutes)) + "</span>" : "") +
      (recipe.tags || [])
        .map(function (t) {
          return '<span class="chip accent">' + esc(t) + "</span>";
        })
        .join("") +
      (recipe.source
        ? '<a class="chip" href="' + esc(recipe.source) + '" target="_blank" rel="noopener noreferrer">źródło</a>'
        : "") +
      "</div>" +
      '<div class="row" style="border-top:1px solid var(--line);padding-top:12px">' +
      '<label class="field" style="margin:0;width:96px"><span>Porcje</span><input type="number" min="1" max="50" id="detailServings" value="' + esc(servings) + '"></label>' +
      (factor !== 1 ? '<span class="small muted">×' + (Math.round(factor * 100) / 100) + " oryginalne</span>" : "") +
      '<div class="spacer"></div>' +
      '<button class="btn ghost sm" type="button" id="btnEditRecipe">Edytuj</button>' +
      '<button class="btn danger sm" type="button" id="btnDeleteRecipe">Usuń</button>' +
      "</div></div>";

    var ingHtml = recipe.ingredients
      .map(function (ing) {
        var scaled = scaleIng(ing, factor);
        var off = !!state.excluded[ing.id];
        return (
          '<label class="shop-item ing-item">' +
          '<input type="checkbox" data-toggle-ing="' + esc(ing.id) + '"' + (off ? "" : " checked") + ">" +
          '<span class="name"' + (off ? ' style="opacity:.45"' : "") + ">" +
          "<b>" + esc(scaled.name) + "</b> <span class='muted small'>" +
          esc([fmtQty(scaled.quantity, scaled.unit), scaled.unit, scaled.note ? "(" + scaled.note + ")" : ""].filter(Boolean).join(" ")) +
          "</span></span></label>"
        );
      })
      .join("");
    if (!recipe.ingredients.length) ingHtml = '<p class="small muted">Ten przepis nie ma składników.</p>';

    var selected = recipe.ingredients.filter(function (i) {
      return !state.excluded[i.id];
    }).length;
    var excludedCount = recipe.ingredients.length - selected;

    var ingredients =
      '<div class="card"><h2>Składniki</h2><div class="cols2">' + ingHtml + "</div>" +
      '<div style="border-top:1px solid var(--line);padding-top:12px;margin-top:4px">' +
      '<button class="btn block" type="button" id="btnAddToShop"' + (selected ? "" : " disabled") + ">Dodaj " + selected + " skł. do listy zakupów</button>" +
      (excludedCount ? '<button class="btn ghost sm block mt" type="button" id="btnSelectAll">Zaznacz wszystkie</button>' : "") +
      "</div></div>";

    var steps = recipe.steps
      .map(function (step, index) {
        return (
          '<li class="detail-step">' +
          '<span class="num">' + (index + 1) + "</span><div>" +
          '<div class="step-text">' + esc(step.text) + "</div>" +
          (step.durationMinutes
            ? '<span class="tiny muted">' + esc(fmtDuration(step.durationMinutes)) + "</span>"
            : "") +
          "</div></li>"
        );
      })
      .join("");
    var stepsHtml =
      '<div class="card"><h2>Przygotowanie</h2>' +
      (steps ? '<ol style="margin:0;padding:0;list-style:none">' + steps + "</ol>" : '<p class="small muted">Ten przepis nie ma kroków.</p>') +
      (recipe.warnings && recipe.warnings.length
        ? '<div class="note warn" style="margin:12px 0 0"><b>Sprawdź przed gotowaniem</b><ul style="margin:6px 0 0 18px;padding:0">' +
          recipe.warnings.map(function (w) { return "<li>" + esc(w) + "</li>"; }).join("") +
          "</ul></div>"
        : "") +
      "</div>";

    // Jednorazowe potwierdzenie – stan, bo renderDetail() zaraz nadpisze zawartość kontenera.
    var addedHtml = state.addedNote
      ? '<div class="note ok" id="detailAdded">Dodane do listy zakupów. ' +
        '<button class="btn ghost sm" type="button" id="btnGoShopping">Otwórz listę</button></div>'
      : "";
    state.addedNote = false;

    box.innerHTML =
      head +
      addedHtml +
      ingredients +
      stepsHtml +
      '<p class="tiny muted">Dodano ' + esc(formatDate(recipe.createdAt)) +
      (recipe.updatedAt !== recipe.createdAt ? " · edycja " + esc(formatDate(recipe.updatedAt)) : "") +
      "</p>";
  }

  /**
   * Usuwa przepis i sprząta listę zakupów: znikają pozycje, które pochodziły wyłącznie
   * z niego, a wspólne z innymi przepisami zostają.
   */
  function deleteRecipe(id) {
    state.recipes = state.recipes.filter(function (r) {
      return r.id !== id;
    });
    state.shopping = state.shopping
      .map(function (item) {
        if (item.manual) return item;
        return Object.assign({}, item, {
          fromRecipes: item.fromRecipes.filter(function (rid) {
            return rid !== id;
          }),
        });
      })
      .filter(function (item) {
        return item.manual || item.fromRecipes.length > 0;
      });
    if (state.detailId === id) state.detailId = null;
    persistRecipes();
    persistShopping();
    updateBadge();
  }

  // ==================================================================
  // 9. Widok: lista zakupów
  // ==================================================================

  function renderShopping() {
    var left = state.shopping.filter(function (i) {
      return !i.checked;
    }).length;
    $("#shoppingSub").textContent = state.shopping.length
      ? left + " do kupienia · " + (state.shopping.length - left) + " kupione"
      : "Pusto – dodaj składniki z przepisu";

    $$("[data-shop]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.getAttribute("data-shop") === state.shoppingTab ? "true" : "false");
    });

    var visible = state.shopping.filter(function (item) {
      return state.shoppingTab === "done" ? item.checked : !item.checked;
    });
    if (!visible.length) {
      $("#shoppingList").innerHTML =
        '<div class="card empty">' +
        (state.shopping.length
          ? state.shoppingTab === "done"
            ? "Nic tu nie ma – sprawdź zakładkę „Do kupienia”."
            : "Wszystko kupione. 🎉"
          : "Lista jest pusta. Otwórz przepis i kliknij „Dodaj składniki do listy zakupów”.") +
        "</div>";
      return;
    }

    var titles = {};
    state.recipes.forEach(function (r) {
      titles[r.id] = r.title;
    });
    var groups = groupShopping(visible, function (id) {
      return titles[id] || "usunięty przepis";
    });

    $("#shoppingList").innerHTML = groups
      .map(function (group) {
        var rows = group.items
          .map(function (item) {
            var qty = [fmtQty(item.quantity, item.unit), item.unit].filter(Boolean).join(" ");
            return (
              '<li class="shop-item' + (item.checked ? " done" : "") + '">' +
              '<input type="checkbox" data-shop-check="' + esc(item.id) + '"' + (item.checked ? " checked" : "") +
              ' aria-label="' + esc(item.name) + '">' +
              '<span class="name">' + esc(item.name) + "</span>" +
              (qty ? '<span class="qty">' + esc(qty) + "</span>" : "") +
              '<button class="icon-btn" type="button" data-shop-del="' + esc(item.id) + '" aria-label="Usuń">✕</button>' +
              "</li>"
            );
          })
          .join("");
        return '<div class="card shop-group"><h2>' + esc(group.title) + '</h2><ul class="cols2">' + rows + "</ul></div>";
      })
      .join("");
  }

  function addManualItem() {
    var input = $("#manualItem");
    var name = input.value.trim();
    if (!name) return;
    state.shopping = state.shopping.concat([
      { id: uid(), name: name, unit: "", quantity: 0, checked: false, fromRecipes: [], manual: true },
    ]);
    input.value = "";
    persistShopping();
    renderShopping();
    updateBadge();
  }

  // ==================================================================
  // 10. Widok: ustawienia
  // ==================================================================

  /** Aktualizuje tylko opis klucza – bez dotykania pola, żeby nie przeskakiwał kursor. */
  function renderKeyStatus() {
    $("#settingsNotice").innerHTML = state.apiKey
      ? '<div class="note ok">Klucz jest w tej przeglądarce ' +
        (state.settings.rememberKey ? "zapamiętany na stałe" : "tylko do zamknięcia karty") +
        " – wysyłany jest wyłącznie do Gemini.</div>"
      : '<div class="note warn">Bez klucza import nie zadziała. Poniżej wklej swój klucz z AI Studio.</div>';

    $("#keyState").textContent = state.apiKey
      ? "Zapisano " + state.apiKey.trim().length + " znaków, początek: " + state.apiKey.trim().slice(0, 6) + "…"
      : "Klucza jeszcze nie ma.";
  }

  function renderSettings() {
    $("#apiKeyInput").value = state.apiKey;
    $("#rememberKey").checked = !!state.settings.rememberKey;
    $("#modelInput").value = state.settings.model;
    $("#servingsInput").value = state.settings.shoppingServings;
    $("#illustrationsInput").checked = state.settings.illustrations !== false;
    renderImageState();
    renderKeyStatus();
  }

  /** Jedno zdanie o miniaturkach: włączone, wyłączone albo zablokowane przez limit planu. */
  function renderImageState() {
    var box = $("#imageState");
    if (!box) return;
    var btn = $("#btnRetryImage");
    if (state.settings.illustrations === false) {
      box.innerHTML = '<p class="tiny muted">Miniaturki wyłączone.</p>';
      if (btn) btn.classList.add("hidden");
      return;
    }
    if (state.settings.illustrationsBlocked) {
      box.innerHTML =
        '<div class="note warn">Gemini odmawia generowania obrazów na tym planie (limit lub brak płatności). ' +
        "Import przepisów działa normalnie – miniaturki wrócą po wykupieniu planu albo po kliknięciu " +
        "„Spróbuj ponownie”.</div>";
      if (btn) btn.classList.remove("hidden");
      return;
    }
    box.innerHTML = '<p class="tiny muted">Model graficzny: ' + esc(IMAGE_MODELS[0]) + ".</p>";
    if (btn) btn.classList.add("hidden");
  }

  function exportData() {
    var blob = new Blob(
      [JSON.stringify({ version: 1, recipes: state.recipes, shopping: state.shopping }, null, 2)],
      { type: "application/json" }
    );
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "przepisnik-" + new Date().toISOString().slice(0, 10) + ".json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(reader.result);
        if (!data || !Array.isArray(data.recipes)) throw new Error("brak tablicy recipes");
        state.recipes = normalizeList(data.recipes, normalizeRecipe);
        state.shopping = normalizeList(data.shopping, normalizeShopping);
        persistRecipes();
        persistShopping();
        flash("Zaimportowano " + state.recipes.length + " przepisów.", "ok");
        render();
      } catch (e) {
        flash("Nie udało się wczytać pliku: " + e.message, "err", "#settingsNotice");
      }
    };
    reader.readAsText(file);
  }

  // ==================================================================
  // 11. Komunikaty
  // ==================================================================

  var toastTimer = null;

  /**
   * Komunikat na miejscu (selector) albo nadany toast widoczny z każdego ekranu.
   * Miejsce jest potrzebne dla błędów, które muszą zostać przeczytane przed podjęciem decyzji.
   */
  function flash(message, kind, selector) {
    var box = $(selector || "#toast");
    if (!box) return;
    box.innerHTML = '<div class="note ' + (kind || "info") + '">' + esc(message) + "</div>";
    if (selector) return;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      if (box.textContent.indexOf(message) !== -1) box.innerHTML = "";
    }, 5000);
  }

  // ==================================================================
  // 12. Obsługa zdarzeń
  // ==================================================================

  function wire() {
    // nawigacja
    $$(".tabbar button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        show(btn.getAttribute("data-view"));
      });
    });
    $("#keyPill").addEventListener("click", function () {
      show("settings");
    });

    // import: zakładki
    $$("#importCard .seg button").forEach(function (btn) {
      btn.addEventListener("click", function () {
        setImportTab(btn.getAttribute("data-tab"));
      });
    });

    // import: pliki
    var drop = $("#drop");
    var openPicker = function () {
      $("#fileGallery").click();
    };
    drop.addEventListener("click", openPicker);
    drop.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openPicker();
      }
    });
    ["dragenter", "dragover"].forEach(function (type) {
      drop.addEventListener(type, function (e) {
        e.preventDefault();
        drop.classList.add("over");
      });
    });
    ["dragleave", "drop"].forEach(function (type) {
      drop.addEventListener(type, function () {
        drop.classList.remove("over");
      });
    });
    drop.addEventListener("drop", function (e) {
      e.preventDefault();
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]) setImage(e.dataTransfer.files[0]);
    });
    $("#fileGallery").addEventListener("change", function (e) {
      setImage(e.target.files[0]);
      e.target.value = "";
    });
    $("#fileCamera").addEventListener("change", function (e) {
      setImage(e.target.files[0]);
      e.target.value = "";
    });
    $("#btnCamera").addEventListener("click", function () {
      $("#fileCamera").click();
    });
    $("#btnGallery").addEventListener("click", function () {
      $("#fileGallery").click();
    });
    $("#btnParse").addEventListener("click", runParse);
    $("#btnCancelParse").addEventListener("click", cancelParse);

    // wklejanie obrazu ze schowka (desktop)
    document.addEventListener("paste", function (e) {
      var items = (e.clipboardData && e.clipboardData.items) || [];
      for (var i = 0; i < items.length; i++) {
        if (items[i].type && items[i].type.indexOf("image/") === 0) {
          var file = items[i].getAsFile();
          if (file) {
            setImportTab("image");
            setImage(file);
          }
          return;
        }
      }
    });

    // import: tekst
    $("#textInput").addEventListener("keydown", function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") runParse();
    });

    // edytor – zdarzenia delegowane (bez re-renderu, żeby nie zgubić fokusu)
    var body = $("#editorBody");
    body.addEventListener("input", function (e) {
      var field = e.target.getAttribute("data-f");
      if (field) {
        var value = e.target.value;
        if (["servings", "prepMinutes", "cookMinutes", "totalMinutes"].indexOf(field) !== -1) {
          state.draft[field] = Math.max(field === "servings" ? 1 : 0, Math.round(num(value)));
        } else if (field === "tags") {
          state.draft.tags = value.split(",").map(function (t) { return t.trim(); }).filter(Boolean);
        } else {
          state.draft[field] = value;
        }
        persistDraft();
        return;
      }
      var ingField = e.target.getAttribute("data-ing-field");
      if (ingField) {
        var ing = findIng(e.target.getAttribute("data-id"));
        if (!ing) return;
        ing[ingField] = ingField === "quantity" ? num(e.target.value) : e.target.value;
        if (ingField === "name" && !ing.raw) ing.raw = e.target.value;
        if (ingField === "unit") ing.unit = normalizeUnit(e.target.value);
        refreshPreview(ing.id);
        persistDraft();
        return;
      }
      var stepField = e.target.getAttribute("data-step-field");
      if (stepField) {
        var step = findStep(e.target.getAttribute("data-id"));
        if (!step) return;
        step[stepField] = stepField === "durationMinutes" ? num(e.target.value) : e.target.value;
        persistDraft();
      }
    });
    body.addEventListener("click", function (e) {
      var target = e.target.closest("[data-ing-del],[data-ing-opt],[data-step-move],#btnAddIng,#btnAddStep");
      if (!target) return;
      if (target.id === "btnAddIng") {
        state.draft.ingredients.push({ id: uid(), raw: "", name: "", quantity: 0, unit: "", note: "" });
        renderEditor();
        persistDraft();
        return;
      }
      if (target.id === "btnAddStep") {
        state.draft.steps.push({ id: uid(), text: "", durationMinutes: 0 });
        renderEditor();
        persistDraft();
        return;
      }
      if (target.hasAttribute("data-ing-del")) {
        state.draft.ingredients = state.draft.ingredients.filter(function (i) {
          return i.id !== target.getAttribute("data-ing-del");
        });
        renderEditor();
        persistDraft();
        return;
      }
      if (target.hasAttribute("data-ing-opt")) {
        var ing = findIng(target.getAttribute("data-ing-opt"));
        if (ing) {
          ing.note = isOptional(ing) ? "" : "opcjonalnie";
          renderEditor();
          persistDraft();
        }
        return;
      }
      var move = target.getAttribute("data-step-move");
      if (!move) return;
      var id = target.getAttribute("data-id");
      var steps = state.draft.steps;
      var index = steps.findIndex(function (s) {
        return s.id === id;
      });
      if (index === -1) return; // bez tego splice(-1, 1) skasowałby ostatni krok
      if (move === "del") {
        steps.splice(index, 1);
      } else {
        var to = move === "up" ? index - 1 : index + 1;
        if (to < 0 || to >= steps.length) return;
        var tmp = steps[index];
        steps[index] = steps[to];
        steps[to] = tmp;
      }
      renderEditor();
      persistDraft();
    });

    $("#btnSaveDraft").addEventListener("click", saveDraft);
    $("#btnCancelDraft").addEventListener("click", function () {
      state.draft = null;
      state.draftIsNew = false;
      persistDraft();
      if (state.detailId && recipeById(state.detailId)) show("detail");
      else show("import");
    });

    // przepisy
    var search = $("#searchInput");
    search.addEventListener("input", function () {
      state.search = search.value;
      renderRecipes();
    });
    $("#tagBar").addEventListener("click", function (e) {
      var btn = e.target.closest("[data-tag]");
      if (!btn) return;
      state.tag = btn.getAttribute("data-tag");
      renderRecipes();
    });
    $("#recipesList").addEventListener("click", function (e) {
      var open = e.target.closest("[data-open]");
      if (open) {
        state.detailId = open.getAttribute("data-open");
        var recipe = recipeById(state.detailId);
        state.servings = recipe ? recipe.servings : null;
        state.excluded = {};
        show("detail");
        return;
      }
      var del = e.target.closest("[data-del]");
      if (del && confirm("Usunąć ten przepis? Zniknie też z listy zakupów.")) {
        deleteRecipe(del.getAttribute("data-del"));
        renderRecipes();
      }
    });
    $("#btnBackToRecipes").addEventListener("click", function () {
      show("recipes");
    });

    // szczegóły
    $("#detailBody").addEventListener("click", function (e) {
      var edit = e.target.closest("#btnEditRecipe");
      if (edit) {
        var recipe = recipeById(state.detailId);
        if (!recipe) return;
        state.draft = JSON.parse(JSON.stringify(recipe));
        state.draftIsNew = false;
        persistDraft();
        show("editor");
        return;
      }
      var del = e.target.closest("#btnDeleteRecipe");
      if (del && confirm("Usunąć ten przepis?")) {
        deleteRecipe(state.detailId);
        show("recipes");
        return;
      }
      var selectAll = e.target.closest("#btnSelectAll");
      if (selectAll) {
        state.excluded = {};
        renderDetail();
        return;
      }
      var add = e.target.closest("#btnAddToShop");
      if (add) {
        var r = recipeById(state.detailId);
        if (!r) return;
        var chosen = r.ingredients
          .filter(function (i) {
            return !state.excluded[i.id];
          })
          .map(function (i) {
            return scaleIng(i, (state.servings || r.servings) / Math.max(1, r.servings));
          });
        state.shopping = mergeInto(state.shopping, r.id, chosen);
        persistShopping();
        updateBadge();
        state.addedNote = true;
        renderDetail();
        return;
      }
      if (e.target.closest("#btnGoShopping")) {
        show("shopping");
      }
    });
    $("#detailBody").addEventListener("change", function (e) {
      var servingsInput = e.target.closest("#detailServings");
      if (servingsInput) {
        state.servings = Math.max(1, Math.round(num(servingsInput.value)));
        renderDetail();
        return;
      }
      var toggle = e.target.closest("[data-toggle-ing]");
      if (toggle) {
        var id = toggle.getAttribute("data-toggle-ing");
        if (toggle.checked) delete state.excluded[id];
        else state.excluded[id] = true;
        renderDetail();
      }
    });

    // zakupy
    $$("[data-shop]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.shoppingTab = btn.getAttribute("data-shop");
        renderShopping();
      });
    });
    $("#btnManual").addEventListener("click", addManualItem);
    $("#manualItem").addEventListener("keydown", function (e) {
      if (e.key === "Enter") addManualItem();
    });
    $("#shoppingList").addEventListener("change", function (e) {
      var box = e.target.closest("[data-shop-check]");
      if (!box) return;
      var id = box.getAttribute("data-shop-check");
      state.shopping = state.shopping.map(function (item) {
        return item.id === id ? Object.assign({}, item, { checked: box.checked }) : item;
      });
      persistShopping();
      renderShopping();
      updateBadge();
    });
    $("#shoppingList").addEventListener("click", function (e) {
      var del = e.target.closest("[data-shop-del]");
      if (!del) return;
      state.shopping = state.shopping.filter(function (item) {
        return item.id !== del.getAttribute("data-shop-del");
      });
      persistShopping();
      renderShopping();
      updateBadge();
    });
    $("#btnClearChecked").addEventListener("click", function () {
      state.shopping = state.shopping.filter(function (item) {
        return !item.checked;
      });
      persistShopping();
      renderShopping();
      updateBadge();
    });
    var confirmWipe = false;
    $("#btnClearAll").addEventListener("click", function () {
      if (!state.shopping.length) return;
      if (!confirmWipe) {
        confirmWipe = true;
        flash("Kliknij jeszcze raz, żeby wyczyścić całą listę.", "warn", "#shoppingError");
        setTimeout(function () {
          confirmWipe = false;
        }, 4000);
        return;
      }
      confirmWipe = false;
      state.shopping = [];
      persistShopping();
      renderShopping();
      updateBadge();
      $("#shoppingError").innerHTML = "";
    });

    // ustawienia
    var keyInput = $("#apiKeyInput");
    keyInput.addEventListener("input", function () {
      // bez trim() i bez pełnego renderu – inaczej kursor skacze przy każdym znaku
      state.apiKey = keyInput.value;
      persistSettings();
      updateKeyPill();
      renderKeyStatus();
    });
    keyInput.addEventListener("change", function () {
      state.apiKey = keyInput.value.trim();
      persistSettings();
      renderSettings();
    });
    $("#rememberKey").addEventListener("change", function () {
      state.settings.rememberKey = $("#rememberKey").checked;
      persistSettings();
      renderSettings();
    });
    $("#modelInput").addEventListener("change", function () {
      state.settings.model = $("#modelInput").value;
      persistSettings();
    });
    $("#servingsInput").addEventListener("change", function () {
      state.settings.shoppingServings = Math.max(1, Math.min(50, Math.round(num($("#servingsInput").value)) || 4));
      persistSettings();
      renderSettings();
    });
    $("#illustrationsInput").addEventListener("change", function () {
      state.settings.illustrations = $("#illustrationsInput").checked;
      // włączanie z powrotem czyści też blokadę limitu – może plan już działa
      if (state.settings.illustrations) state.settings.illustrationsBlocked = false;
      persistSettings();
      renderSettings();
    });
    $("#btnRetryImage").addEventListener("click", function () {
      state.settings.illustrationsBlocked = false;
      persistSettings();
      renderSettings();
      // nie mamy już przepisu do narysowania, więc tylko sprawdzamy, czy API odpowiada
      var draft = state.draft || (state.recipes[0] ? state.recipes[0] : null);
      if (draft) startIllustration(draft);
    });
    $("#btnExport").addEventListener("click", exportData);
    $("#btnImport").addEventListener("click", function () {
      $("#importFile").click();
    });
    $("#importFile").addEventListener("change", function (e) {
      if (e.target.files[0]) importData(e.target.files[0]);
      e.target.value = "";
    });
    $("#btnWipe").addEventListener("click", function () {
      if (!confirm("Usunąć wszystkie przepisy i listę zakupów z tej przeglądarki?")) return;
      state.recipes = [];
      state.shopping = [];
      state.detailId = null;
      persistRecipes();
      persistShopping();
      render();
    });
  }

  // ==================================================================
  // 13. Start
  // ==================================================================

  function restoreDraft() {
    try {
      var raw = sessionStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && data.draft) {
        state.draft = data.draft;
        state.draftIsNew = !!data.isNew;
      }
    } catch (e) {
      /* ignorujemy */
    }
  }

  function init() {
    loadKey();
    restoreDraft();
    wire();
    setImportTab("image");
    show(state.draft ? "editor" : "import");
  }

  // Mały eksport do testów (node --check + smoke testy).
  window.Przepisnik = {
    uid: uid,
    esc: esc,
    num: num,
    normalizeUnit: normalizeUnit,
    fmtQty: fmtQty,
    fmtIng: fmtIng,
    fmtDuration: fmtDuration,
    scaleQty: scaleQty,
    scaleIng: scaleIng,
    isOptional: isOptional,
    ingKey: ingKey,
    fold: fold,
    deleteRecipe: deleteRecipe,
    mergeInto: mergeInto,
    groupShopping: groupShopping,
    normalizeRecipe: normalizeRecipe,
    normalizeShopping: normalizeShopping,
    normalizeSettings: normalizeSettings,
    RETIRED_MODELS: RETIRED_MODELS,
    DEFAULTS: DEFAULTS,
    cleanDraft: cleanDraft,
    buildRequest: buildRequest,
    callGemini: callGemini,
    buildImageRequest: buildImageRequest,
    illustrationPrompt: illustrationPrompt,
    callGeminiImage: callGeminiImage,
    IMAGE_MODELS: IMAGE_MODELS,
    friendlyError: friendlyError,
    parseDraft: parseDraft,
    SYSTEM_PROMPT: SYSTEM_PROMPT,
    RECIPE_SCHEMA: RECIPE_SCHEMA,
    state: state,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();