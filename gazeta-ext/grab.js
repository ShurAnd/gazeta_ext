// Выполняется на странице со статьёй (после Readability.js).
// Возвращает {title, url, site, date, author, paragraphs, heads} или {error}.
(() => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const meta = (q) => {
    const el = document.querySelector(q);
    return el ? norm(el.getAttribute("content")) : "";
  };
  const host = location.hostname.replace(/^www\./, "");

  // Правила для отдельных сайтов: где лежит текст статьи. Если правило не сработало — Readability.
  const SITES = [
    {
      host: /(^|\.)ria\.ru$/,
      root: ".article__body",
      blocks: ".article__text, .article__quote-text, h2, h3, li",
      skip: ".article__summary, [data-type=banner], [data-type=article], [data-type=media]",
    },
    // у НТВ в том же блоке лежат теги-ссылки и список других новостей (li) — берём только абзацы
    { host: /(^|\.)ntv\.ru$/, root: ".news-content__body", blocks: "h2, h3, p, blockquote" },
    { host: /(^|\.)interfax\.ru$/, root: "article[itemprop=articleBody]", blocks: "p, li, blockquote, h2, h3" },
    {
      host: /(^|\.)rt\.com$/,
      root: ".article",
      blocks: ".article__summary, .article__text p, .article__text li, .article__text blockquote, .article__text h2, .article__text h3",
      skip: ".rtcode",
    },
  ];

  // Служебные строки сайтов, которые не относятся к тексту статьи
  const JUNK = [
    /^Краткий пересказ от РИА ИИ/,
    /^Читать .{2,30} в$/,
    /^\d[\d\s]* просмотр/,
    /^\d{1,2}:\d{2} \d{2}\.\d{2}\.\d{4}/, // «13:51 07.10.2026 (обновлено …)»
    /^\d{1,2} [а-я]+ \d{4}, \d{1,2}:\d{2}$/, // «8 октября 2026, 10:04»
    /^Короткая ссылка/,
    /^Ошибка в тексте\?/,
    /^Подписывайтесь на (наш|канал)/,
    /мы пишем в Telegram$/,
    /^Оставайтесь на связи с /,
    /^Добавить .{2,20} в избранные источники/,
    /^(Группа |Канал )?НТВ (в|во|«)/,
    /^(Фото|Видео|Скриншот|Источник фото)\s*:/,
  ];
  // Строки, после которых текст статьи заканчивается (дальше теги, ссылки, реклама)
  const TAIL = /^(Рекомендуем|Теги|Авторы|Персоны|Картина дня|Сегодня в СМИ|Ранее на эту тему|Читайте также|Материалы по теме)\s*:?$/;
  // подпись к фото: «Владимир Зеленский (Фото: … / Getty Images)»
  const CAPTION = /\((Фото|Видео|Кадр)\s*:[^)]*\)$/;

  // ---------- метаданные: JSON-LD, meta-теги ----------
  const ld = [];
  for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const walk = (o) => {
        if (Array.isArray(o)) o.forEach(walk);
        else if (o && typeof o === "object") {
          ld.push(o);
          if (o["@graph"]) walk(o["@graph"]);
        }
      };
      // у некоторых сайтов (РИА) в JSON-LD встречаются переводы строк внутри строк — JSON.parse на них падает
      walk(JSON.parse(s.textContent.replace(/[\u0000-\u001F]+/g, " ")));
    } catch (e) {
      const m = s.textContent.match(/"datePublished"\s*:\s*"([^"]+)"/);
      if (m) ld.push({ datePublished: m[1] });
    }
  }
  const article = ld.find((o) => /Article/.test(String(o["@type"])) && o.datePublished) || ld.find((o) => o.datePublished) || {};

  const site = meta('meta[property="og:site_name"]') || host;
  // Дата: берём первый источник, который удаётся разобрать. РИА пишет в meta «20261007T1351» —
  // такой формат JavaScript не понимает, поэтому приводим его к обычному виду.
  let date = "";
  const toDate = (s) => {
    const m = String(s || "").trim().match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/);
    const d = new Date(m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}` : String(s || "").trim());
    return s && !isNaN(d) ? d : null;
  };
  const published = [
    meta('meta[property="article:published_time"]'),
    meta('meta[itemprop="datePublished"]'),
    article.datePublished,
    meta('meta[name="mediator_published_time"]'),
  ].map(toDate).find(Boolean);
  if (published) {
    const p = (n) => String(n).padStart(2, "0");
    const d = published;
    date = `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // Автор: только то, что похоже на имя человека. РБК склеивает имя с должностью:
  // «Полина ДугановаСтарший редактор…» — разрезаем на стыке строчной и заглавной буквы.
  const NAME = /^[А-ЯЁA-Z][а-яёa-z-]+(\s+[А-ЯЁA-Z][а-яёa-z-]+){1,2}$/;
  const cleanAuthor = (s) =>
    [...new Set(norm(s).replace(/([а-яёa-z])([А-ЯЁA-Z])/g, "$1|$2").split(/\s*[|,;]\s*|\s+и\s+/).filter((x) => NAME.test(x)))].join(", ");
  const ldAuthor = [].concat(article.author || []).map((a) => (typeof a === "string" ? a : a.name || "")).join(", ");

  const h1 = document.querySelector("h1");
  let title = norm(h1 && h1.textContent) || meta('meta[property="og:title"]') || norm(document.title);
  let paragraphs = [];
  const heads = []; // индексы абзацев-подзаголовков
  let byline = "";

  // собирает «листовые» блоки из контейнера, чтобы абзацы не повторялись
  const collect = (root, blocks, skip) => {
    const out = [], hs = [];
    for (const el of root.querySelectorAll(blocks)) {
      if (el.querySelector(blocks)) continue;
      if (skip && el.closest(skip)) continue;
      const t = norm(el.textContent);
      if (t.length > 1 && t !== out[out.length - 1]) {
        if (/^H[2-4]$/.test(el.tagName) && out.length) hs.push(out.length);
        out.push(t);
      }
    }
    return { out, hs };
  };

  // 1. Если человек выделил текст мышью — берём именно его.
  const selection = String(window.getSelection() || "");
  if (norm(selection).length >= 200) {
    paragraphs = selection.split(/\n+/).map(norm).filter(Boolean);
  } else {
    // 2. Правило для известного сайта
    const rule = SITES.find((r) => r.host.test(host));
    const root = rule && document.querySelector(rule.root);
    if (root) {
      const { out, hs } = collect(root, rule.blocks, rule.skip);
      if (out.join("").length >= 150) {
        paragraphs = out;
        heads.push(...hs);
      }
    }
    // 3. Иначе выделяем статью автоматически (тот же алгоритм, что в «режиме чтения» Firefox).
    if (!paragraphs.length) {
      let parsed = null;
      try {
        parsed = new Readability(document.cloneNode(true), { serializer: (el) => el }).parse();
      } catch (e) {
        parsed = null;
      }
      if (parsed && parsed.content) {
        const { out, hs } = collect(parsed.content, "p, li, blockquote, h2, h3, h4, pre");
        paragraphs = out;
        heads.push(...hs);
        if (!paragraphs.length) {
          paragraphs = (parsed.textContent || "").split(/\n+/).map(norm).filter(Boolean);
        }
        if (!title) title = norm(parsed.title);
        byline = norm(parsed.byline);
      }
    }
  }

  const author =
    cleanAuthor(meta('meta[name="mediator_author"]')) ||
    cleanAuthor(ldAuthor) ||
    cleanAuthor(meta('meta[name="author"]')) ||
    cleanAuthor(meta('meta[property="article:author"]')) ||
    cleanAuthor(byline);

  // ---------- чистка: служебные строки, повтор заголовка, «хвост» страницы ----------
  const titles = new Set([title, meta('meta[property="og:title"]'), norm(article.headline), author].filter(Boolean));
  const kept = [], keptHeads = [];
  const headSet = new Set(heads);
  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphs[i];
    if (TAIL.test(t) && kept.length) break;
    if (titles.has(t) || JUNK.some((re) => re.test(t))) continue;
    if (CAPTION.test(t) && t.length < 250) continue;
    if (headSet.has(i) && kept.length) keptHeads.push(kept.length);
    kept.push(t);
  }
  paragraphs = kept;

  const length = paragraphs.reduce((n, p) => n + p.length, 0);
  if (length < 150) {
    return { error: "Не удалось найти текст статьи. Выделите нужный текст мышью и нажмите кнопку ещё раз." };
  }
  return { title, url: location.href.split("#")[0], site, date, author, paragraphs, heads: keptHeads };
})();
