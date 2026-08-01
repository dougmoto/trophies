/* =====================================================================
   Trophy Tracker — shared engine
   Every game page calls Tracker.init({...}). You should not need to edit
   this file to add a game; only to change how things behave everywhere.

   TROPHY TYPES
   ------------
   1. Simple checkbox (default):
        { id: "ch1", name: "Chapter 1", desc: "Cleared Chapter 1" }

   2. Counter — partial progress toward a number:
        { id: "ghosts", name: "A Curious Soul", desc: "444 Ghosts",
          type: "counter", target: 444, step: 10 }
      `step` is optional (default 1) and sets what the +/- buttons move by.

   3. Sublist — a trophy made of many smaller items:
        { id: "bundles", name: "Community Center", type: "group",
          children: [
            { group: "Pantry" },                     // section label
            { id: "b_spring", name: "Spring Crops" },
            { id: "b_summer", name: "Summer Crops", note: "optional hint" }
          ]}
      The parent auto-completes when every child is ticked.

   STORAGE
   -------
   State is one object: { itemId: true } for checks, { itemId: 137 } for
   counters, child ids stored individually. A separate `summary` key holds
   { done, total } so the hub can show progress without knowing the
   internals of each game.
   ===================================================================== */

const Tracker = (function () {
  const CHECK_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="#0b0d14" stroke-width="3">' +
    '<path d="M3 8.5L6.5 12L13 4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const CARET_SVG =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5">' +
    '<path d="M6 3L11 8L6 13" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  let cfg = null;
  let state = {};
  let openGroups = {};

  /* ---------- storage ---------- */
  function progressKey() { return cfg.key + "-progress-v2"; }
  function summaryKey()  { return cfg.key + "-summary-v2"; }

  function load() {
    // migrate from the old v1 format if present
    try {
      const v2 = localStorage.getItem(progressKey());
      if (v2) return JSON.parse(v2);
      const v1 = localStorage.getItem(cfg.key + "-progress-v1");
      if (v1) {
        const migrated = JSON.parse(v1);
        localStorage.setItem(progressKey(), JSON.stringify(migrated));
        return migrated;
      }
    } catch (e) {}
    const seed = {};
    (cfg.earned || []).forEach((id) => (seed[id] = true));
    // counters already at a known value, e.g. { ghosts: 444 }
    Object.keys(cfg.counters || {}).forEach((id) => (seed[id] = cfg.counters[id]));
    return seed;
  }

  function save() {
    const el = document.getElementById("statusLine");
    try {
      localStorage.setItem(progressKey(), JSON.stringify(state));
      const t = totals();
      localStorage.setItem(summaryKey(), JSON.stringify({
        done: t.done, total: t.total, updated: Date.now()
      }));
      if (el) {
        el.textContent = "Saved to this device automatically.";
        el.classList.remove("bad");
      }
    } catch (e) {
      if (el) {
        el.textContent = "Couldn't save — copy the backup code below.";
        el.classList.add("bad");
      }
    }
  }

  /* ---------- completion logic ---------- */
  function realChildren(item) {
    return (item.children || []).filter((c) => c.id);
  }

  function childDone(item) {
    return realChildren(item).filter((c) => state[c.id]).length;
  }

  function isComplete(item) {
    if (item.type === "counter") return (state[item.id] || 0) >= item.target;
    if (item.type === "group") {
      const kids = realChildren(item);
      return kids.length > 0 && childDone(item) === kids.length;
    }
    return !!state[item.id];
  }

  function isPartial(item) {
    if (isComplete(item)) return false;
    if (item.type === "counter") return (state[item.id] || 0) > 0;
    if (item.type === "group") return childDone(item) > 0;
    return false;
  }

  function allItems() {
    return cfg.sections.reduce((acc, s) => acc.concat(s.items), []);
  }

  function totals() {
    const items = allItems();
    return { done: items.filter(isComplete).length, total: items.length };
  }

  /* ---------- rendering ---------- */
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function renderCounter(item, row) {
    const val = state[item.id] || 0;
    const step = item.step || 1;
    const wrap = el("div", "counter");

    const track = el("div", "counter-track");
    const fill = el("div", "counter-fill");
    fill.style.width = Math.min(100, Math.round((val / item.target) * 100)) + "%";
    track.appendChild(fill);
    wrap.appendChild(track);

    const controls = el("div", "counter-controls");

    const minus = el("button", null, "\u2212");
    const input = document.createElement("input");
    input.type = "number";
    input.inputMode = "numeric";
    input.value = val;
    input.min = 0;
    const plus = el("button", null, "+");
    const of = el("span", "counter-of", "of " + item.target);

    function setVal(n) {
      const clamped = Math.max(0, Math.min(item.target, Math.round(n) || 0));
      state[item.id] = clamped;
      save();
      render();
    }

    minus.addEventListener("click", (e) => { e.stopPropagation(); setVal(val - step); });
    plus.addEventListener("click", (e) => { e.stopPropagation(); setVal(val + step); });
    input.addEventListener("click", (e) => e.stopPropagation());
    input.addEventListener("change", () => setVal(parseInt(input.value, 10)));

    controls.appendChild(minus);
    controls.appendChild(input);
    controls.appendChild(of);
    controls.appendChild(plus);
    if (step > 1) controls.appendChild(el("span", "counter-step", "\u00b1" + step));
    wrap.appendChild(controls);

    row.appendChild(wrap);
  }

  function renderChildren(item, row) {
    const wrap = el("div", "children");
    (item.children || []).forEach((c) => {
      if (!c.id) {                       // section label inside the sublist
        wrap.appendChild(el("div", "child-group-label", c.group));
        return;
      }
      const done = !!state[c.id];
      const child = el("div", "child" + (done ? " checked" : ""));
      const box = el("div", "child-box");
      box.innerHTML = CHECK_SVG;
      const textWrap = el("div", "child-text");
      textWrap.appendChild(document.createTextNode(c.name));
      if (c.note) {
        const n = el("span", "child-note", c.note);
        textWrap.appendChild(n);
      }
      child.appendChild(box);
      child.appendChild(textWrap);
      child.addEventListener("click", (e) => {
        e.stopPropagation();
        state[c.id] = !state[c.id];
        save();
        render();
      });
      wrap.appendChild(child);
    });
    row.appendChild(wrap);
  }

  function renderRow(item) {
    const complete = isComplete(item);
    const partial = isPartial(item);
    const isGroup = item.type === "group";
    const open = !!openGroups[item.id];

    const row = el("div",
      "row" + (complete ? " checked" : "") + (open ? " open" : "") +
      (item.type === "counter" || isGroup ? " no-toggle" : ""));

    const head = el("div", "row-head");

    const box = el("div", "box" + (partial ? " partial" : ""));
    box.innerHTML = CHECK_SVG;
    head.appendChild(box);

    const main = el("div", "row-main");
    const titleLine = el("div", "row-title-line");
    titleLine.appendChild(el("span", "row-title", item.name));

    if (item.chapter) titleLine.appendChild(el("span", "badge chapter", "Ch." + item.chapter));
    if (item.caution) titleLine.appendChild(el("span", "badge caution", "Do it on purpose"));
    if (item.platinum) titleLine.appendChild(el("span", "badge plat", "Platinum"));
    if (item.type === "counter") {
      titleLine.appendChild(el("span", "badge count",
        (state[item.id] || 0) + " / " + item.target));
    }
    if (isGroup) {
      const kids = realChildren(item);
      titleLine.appendChild(el("span", "badge count",
        childDone(item) + " / " + kids.length));
    }
    main.appendChild(titleLine);

    if (item.desc) main.appendChild(el("div", "row-sub", item.desc));
    if (item.note) main.appendChild(el("div", "row-note", item.note));
    head.appendChild(main);

    if (isGroup) {
      const caret = el("div", "sub-toggle");
      caret.innerHTML = CARET_SVG;
      head.appendChild(caret);
    }

    // click behaviour depends on type
    if (isGroup) {
      head.addEventListener("click", () => {
        openGroups[item.id] = !openGroups[item.id];
        render();
      });
    } else if (item.type !== "counter") {
      head.addEventListener("click", () => {
        state[item.id] = !state[item.id];
        save();
        render();
      });
    }

    row.appendChild(head);
    if (item.type === "counter") renderCounter(item, row);
    if (isGroup) renderChildren(item, row);

    return row;
  }

  function render() {
    const container = document.getElementById("sections");
    container.innerHTML = "";

    cfg.sections.forEach((s) => {
      const sec = el("div", "section");
      sec.appendChild(el("h2", null, s.title));
      if (s.desc) sec.appendChild(el("p", "desc", s.desc));
      const rows = el("div", "rows");
      s.items.forEach((item) => rows.appendChild(renderRow(item)));
      sec.appendChild(rows);
      container.appendChild(sec);
    });

    const t = totals();
    const pct = t.total ? Math.round((t.done / t.total) * 100) : 0;
    document.getElementById("doneCount").textContent = t.done;
    document.getElementById("totalCount").textContent = t.total;
    document.getElementById("pctLabel").textContent = "(" + pct + "%)";
    document.getElementById("barFill").style.width = pct + "%";
  }

  /* ---------- backup ---------- */
  function initBackup() {
    const box = document.getElementById("codeBox");
    const msg = document.getElementById("backupMsg");
    const copyBtn = document.getElementById("copyBtn");
    const loadBtn = document.getElementById("loadBtn");
    if (!box) return;

    copyBtn.addEventListener("click", () => {
      box.value = btoa(JSON.stringify(state));
      box.select();
      try {
        document.execCommand("copy");
        msg.textContent = "Copied — paste it somewhere safe.";
      } catch (e) {
        msg.textContent = "Code shown above — copy it manually.";
      }
    });

    let awaiting = false;
    loadBtn.addEventListener("click", () => {
      if (!awaiting) {
        awaiting = true;
        box.readOnly = false;
        box.value = "";
        box.placeholder = "Paste your code, then tap this again";
        box.focus();
        msg.textContent = 'Paste your code above, then tap "Paste & restore" again.';
        return;
      }
      try {
        state = JSON.parse(atob(box.value.trim()));
        save();
        render();
        msg.textContent = "Progress restored.";
      } catch (e) {
        msg.textContent = "That code didn't look right — check it and try again.";
      } finally {
        box.readOnly = true;
        box.placeholder = "Your progress code appears here";
        awaiting = false;
      }
    });
  }

  /* ---------- public ---------- */
  function init(config) {
    cfg = config;
    state = load();
    document.title = cfg.title + " — Trophy Tracker";
    const h = document.getElementById("gameTitle");
    if (h) h.textContent = cfg.title;
    const s = document.getElementById("gameSub");
    if (s) s.textContent = cfg.subtitle || "";
    render();
    save();          // writes the summary so the hub is accurate immediately
    initBackup();
  }

  return { init: init };
})();
