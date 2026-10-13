const $ = (id) => document.getElementById(id);
const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const DEFAULT_TITLE = "Обзор публикаций СМИ";
// шапка и колонтитул, по строкам (пока не настраивается)
const ORG = "Ситуационный центр\nКонтрольного управления\nПрезидента РФ";

let pool = [];
// разделы: [{id, name, articles: [...]}]; статьи в разделе — копии, очистка газеты их не трогает
let sections = [];
let view = "paper"; // открытая вкладка: "paper" или "sections"
let current = null; // id выбранного раздела
let menuFor = null; // url статьи газеты, у которой открыт список разделов
const opened = new Set(); // «список:url» статей, у которых раскрыт список абзацев

// выделенные абзацы (идут в содержание и выделяются синим); по умолчанию — первый
const leadOf = (a) => (Array.isArray(a.lead) ? a.lead : [0]).filter((k) => k < a.paragraphs.length);
const currentSection = () => sections.find((s) => s.id === current);

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const savePool = () => Pool.set(pool);
const saveSections = () => chrome.storage.local.set({ sections });

function flash(id, text, warn = false) {
  $(id).className = "status" + (warn ? " warn" : "");
  $(id).textContent = text;
}

// кнопка с подтверждением: первое нажатие — «Точно?», второе в течение 3 секунд — действие
function confirmButton(btn, label, ask, action) {
  btn.textContent = label;
  btn.addEventListener("click", () => {
    if (btn.dataset.armed) {
      delete btn.dataset.armed; btn.textContent = label;
      action();
    } else {
      btn.dataset.armed = "1"; btn.textContent = ask;
      setTimeout(() => { delete btn.dataset.armed; btn.textContent = label; }, 3000);
    }
  });
}

function copyToSection(s, a) {
  menuFor = null;
  if (s.articles.some((x) => x.url === a.url)) {
    flash("status", `Статья уже есть в разделе «${s.name}».`, true);
  } else {
    s.articles.push(JSON.parse(JSON.stringify(a)));
    saveSections();
    flash("status", `Скопировано в раздел «${s.name}».`);
  }
  render();
}

// список статей (газета или раздел): заголовок, выделенные абзацы, порядок, удаление
function renderArticles(list, items, { key, save, empty, removeTitle, inPaper }) {
  list.textContent = "";
  if (!items.length) {
    list.append(el("div", { className: "empty", textContent: empty }));
    return;
  }
  items.forEach((a, i) => {
    const title = el("input", { className: "title", value: a.title, title: "Заголовок можно поправить" });
    title.addEventListener("change", () => { a.title = title.value.trim() || a.title; save(); });

    const link = el("a", { href: a.url, target: "_blank", textContent: a.url });
    const chars = a.paragraphs.reduce((n, p) => n + p.length, 0);
    const meta = el("div", { className: "meta" }, [a.site, a.date, a.author, `${a.paragraphs.length} абз., ${chars} зн.`].filter(Boolean).join("  •  ") + "  •  ", link);
    const lead = leadOf(a);
    const shown = lead.map((k) => a.paragraphs[k]).join(" ") || "(нет выделенных абзацев)";
    const preview = el("div", { className: "preview", textContent: shown.length > 260 ? shown.slice(0, 260) + "…" : shown });

    const id = key + ":" + a.url;
    const toggle = el("button", { className: "link", textContent: opened.has(id) ? "Скрыть абзацы ▴" : `Выбрать выделенные абзацы (${lead.length}) ▾` });
    toggle.addEventListener("click", () => { opened.has(id) ? opened.delete(id) : opened.add(id); render(); });
    const picker = el("div", { className: "picker" });
    if (opened.has(id)) {
      const where = inPaper ? "Выделенные абзацы попадают в содержание." : "В обзоре они будут выделены синим.";
      picker.append(el("div", { className: "hint", textContent: "Щёлкните абзац, чтобы выделить его синим или снять выделение. " + where }));
      a.paragraphs.forEach((t, k) => {
        const row = el("div", { className: "par" + (lead.includes(k) ? " on" : ""), textContent: t });
        row.addEventListener("click", () => {
          a.lead = lead.includes(k) ? lead.filter((x) => x !== k) : [...lead, k].sort((x, y) => x - y);
          save(); render();
        });
        picker.append(row);
      });
    }

    const ctl = el("div", { className: "ctl" });
    const text = el("div", { className: "text" }, title, meta, preview, toggle, picker);
    if (inPaper) {
      const to = el("button", { textContent: "В раздел", title: "Скопировать статью в раздел" });
      to.addEventListener("click", () => { menuFor = menuFor === a.url ? null : a.url; render(); });
      ctl.append(to);
      if (menuFor === a.url) {
        const menu = el("div", { className: "menu" });
        if (!sections.length) {
          const go = el("button", { className: "link", textContent: "Создать раздел" });
          go.addEventListener("click", () => { menuFor = null; view = "sections"; render(); $("newName").focus(); });
          menu.append(el("span", { className: "hint", textContent: "Разделов пока нет." }), go);
        } else {
          menu.append(el("span", { className: "hint", textContent: "Скопировать в раздел:" }));
          for (const s of sections) {
            const b = el("button", { textContent: `${s.name} (${s.articles.length})` });
            b.addEventListener("click", () => copyToSection(s, a));
            menu.append(b);
          }
        }
        text.append(menu);
      }
    }
    const up = el("button", { textContent: "▲", title: "Выше", disabled: i === 0 });
    up.addEventListener("click", () => { [items[i - 1], items[i]] = [items[i], items[i - 1]]; save(); render(); });
    const down = el("button", { textContent: "▼", title: "Ниже", disabled: i === items.length - 1 });
    down.addEventListener("click", () => { [items[i + 1], items[i]] = [items[i], items[i + 1]]; save(); render(); });
    const del = el("button", { textContent: "✖", title: removeTitle });
    del.addEventListener("click", () => { items.splice(i, 1); save(); render(); });
    ctl.append(up, down, del);

    list.append(el("li", {}, el("div", { className: "num", textContent: i + 1 + "." }), text, ctl));
  });
}

function render() {
  $("tabPaper").classList.toggle("on", view === "paper");
  $("tabSections").classList.toggle("on", view === "sections");
  $("paperView").hidden = view !== "paper";
  $("sectionsView").hidden = view !== "sections";

  // ---------- газета ----------
  $("build").disabled = $("clear").disabled = pool.length === 0;
  renderArticles($("list"), pool, {
    key: "paper",
    save: savePool,
    empty: "Пока пусто. Откройте статью в браузере и нажмите кнопку расширения «Добавить статью в газету».",
    removeTitle: "Убрать из газеты",
    inPaper: true,
  });

  // ---------- разделы ----------
  if (!currentSection()) current = sections.length ? sections[0].id : null;
  const chips = $("chips");
  chips.textContent = "";
  for (const s of sections) {
    const b = el("button", { className: s.id === current ? "on" : "", textContent: `${s.name} (${s.articles.length})` });
    b.addEventListener("click", () => { current = s.id; render(); });
    chips.append(b);
  }
  const s = currentSection();
  $("noSections").hidden = !!s;
  $("sectionBody").hidden = !s;
  if (!s) return;
  if (document.activeElement !== $("secName")) $("secName").value = s.name;
  $("secBuild").disabled = s.articles.length === 0;
  renderArticles($("secList"), s.articles, {
    key: "section-" + s.id,
    save: saveSections,
    empty: "В разделе пока нет статей. Добавьте их кнопкой «В раздел» на вкладке «Газета».",
    removeTitle: "Убрать из раздела",
  });
}

function stamp(now) {
  const p2 = (n) => String(n).padStart(2, "0");
  return {
    date: `${now.getDate()} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`,
    time: `${p2(now.getHours())}-${p2(now.getMinutes())}`,
  };
}

const entriesOf = (items) => {
  const origin = (u) => { try { return new URL(u).origin + "/"; } catch (e) { return u; } };
  return items.map((a) => ({
    site: origin(a.url),
    date: a.date || "",
    author: a.author || "",
    title: a.title,
    paragraphs: a.paragraphs,
    lead: leadOf(a),
    heads: a.heads || [],
  }));
};

// собирает .docx и сохраняет в загрузки; возвращает имя файла
async function download(doc, name) {
  const blob = new Blob(Docx.build(doc), {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
  const url = URL.createObjectURL(blob);
  let saved = false;
  // Firefox: надёжнее через API загрузок; Chrome: обычная ссылка для скачивания.
  if (chrome.downloads && chrome.downloads.download) {
    try {
      await chrome.downloads.download({ url, filename: name });
      saved = true;
    } catch (e) {
      saved = false;
    }
  }
  if (!saved) {
    const a = el("a", { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function buildPaper() {
  const { date, time } = stamp(new Date());
  const name = `СМИ ${date} г. (${time}).docx`;
  await download({ title: $("title").value.trim() || DEFAULT_TITLE, org: ORG, date, entries: entriesOf(pool) }, name);
  flash("status", `Файл «${name}» сохранён в папку загрузок.`);
}

// обзор раздела: та же шапка и оформление, но без содержания — сразу статьи
async function buildSection() {
  const s = currentSection();
  if (!s) return;
  const { date, time } = stamp(new Date());
  const name = `${s.name.replace(/[\\/:*?"<>|]+/g, "_")} ${date} г. (${time}).docx`;
  await download({ title: s.name, org: ORG, date, toc: false, entries: entriesOf(s.articles) }, name);
  flash("secStatus", `Файл «${name}» сохранён в папку загрузок.`);
}

async function init() {
  const stored = await chrome.storage.local.get({ pool: [], sections: [], reviewTitle: DEFAULT_TITLE });
  pool = stored.pool;
  sections = stored.sections;
  $("title").value = stored.reviewTitle;
  $("title").addEventListener("change", () => chrome.storage.local.set({ reviewTitle: $("title").value }));

  $("tabPaper").addEventListener("click", () => { view = "paper"; render(); });
  $("tabSections").addEventListener("click", () => { view = "sections"; render(); });

  $("build").addEventListener("click", buildPaper);
  confirmButton($("clear"), "Очистить список", "Точно очистить?", () => {
    pool = []; menuFor = null; savePool(); render();
  });

  $("newForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("newName").value.trim();
    if (!name) return;
    const s = { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, articles: [] };
    sections.push(s);
    current = s.id;
    $("newName").value = "";
    saveSections(); render();
  });
  $("secName").addEventListener("change", () => {
    const s = currentSection();
    if (!s) return;
    s.name = $("secName").value.trim() || s.name;
    $("secName").value = s.name;
    saveSections(); render();
  });
  $("secBuild").addEventListener("click", buildSection);
  confirmButton($("secDelete"), "Удалить раздел", "Точно удалить раздел?", () => {
    sections = sections.filter((s) => s.id !== current);
    current = null;
    saveSections(); render();
  });

  // изменения из других вкладок (новые статьи, правки разделов) появляются сразу
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.pool) pool = changes.pool.newValue || [];
    if (changes.sections) sections = changes.sections.newValue || [];
    if (changes.pool || changes.sections) render();
  });
  render();
}
init();
