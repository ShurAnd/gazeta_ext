// Выполняется на странице со статьёй (после Readability.js).
// Возвращает {title, url, site, date, author, paragraphs, heads} или {error}.
(() => {
  const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
  const meta = (q, root = document) => {
    const el = root.querySelector(q);
    return el ? norm(el.getAttribute("content")) : "";
  };
  const host = location.hostname.replace(/^www\./, "");

  // Правила для отдельных сайтов: где лежит текст статьи. Если правило не сработало — Readability.
  const SITES = [
    {
      // РИА и сайты на той же платформе «Россия сегодня» (Прайм, Спутник)
      host: /(^|\.)(ria\.ru|1prime\.ru|sputnik[\w.-]*)$/,
      root: ".article__body",
      title: ".article__title", // у Прайма h1 — это подзаголовок
      blocks: ".article__text, .article__quote-text, h2, h3, li",
      skip: ".article__summary, [data-type=banner], [data-type=article], [data-type=media], [data-type=video], .media__video, .video-js",
    },
    // у НТВ в том же блоке лежат теги-ссылки и список других новостей (li) — берём только абзацы
    { host: /(^|\.)ntv\.ru$/, root: ".news-content__body", blocks: "h2, h3, p, blockquote" },
    { host: /(^|\.)interfax\.ru$/, root: "article[itemprop=articleBody]", blocks: "p, li, blockquote, h2, h3" },
    {
      host: /(^|\.)(rt\.com|russiatoday\.ru)$/, // RT переехал на russiatoday.ru, старый адрес тоже работает
      root: ".article",
      blocks: ".article__summary, .article__text p, .article__text li, .article__text blockquote, .article__text h2, .article__text h3",
      skip: ".rtcode",
    },
  ];

  // Служебные строки сайтов, которые не относятся к тексту статьи
  const JUNK = [
    /^[\d\s.,:;+()\/\-–—%]+$/, // только цифры: счётчики просмотров, телефоны, «4.7», «96», «1 / 2» в галерее
    /^\d[\d\s]*\s*просмотр/i, // «7289просмотров»
    /^(Время чтения|Просмотров|Читать \d+ мин)/i,
    /^Главная\s*[»>\/|→]/, // хлебные крошки «Главная » Новости » …»
    /^(Сюжет|Источник|Тема|Рубрика)\s*:?$/i,
    /^[A-Z0-9_]{4,}$/, // метка рекламного блока «TECHDIG», «SPARROW»
    /^Реклама\.?\s*(Рекламодатель|ООО|АО|ПАО|ИП)/i,
    /^erid\s*:/i,
    /^(\d{4}-\d{2}-\d{2}T\S+\s*)+$/, // служебные метки времени «2026-10-15T08:21:07+10:00»
    /^(https?:\/\/|www\.)\S+$/, // голая ссылка вместо текста
    /^[\w.+-]+@[\w-]+\.[\w.-]+$/, // голый e-mail
    /^Краткий пересказ от РИА ИИ/,
    /^©/, // подпись фотобанка «© РИА Новости / …»
    /Перейти в медиабанк/,
    /^((Дзен|МАКС|Макс|Telegram|VK|ВКонтакте)\s*){2,}$/i, // ряд кнопок соцсетей
    /^Выделить главное$/,
    /^(Вкл|Выкл)$/,
    /подпишись на эти каналы/i,
    /теперь в MAX!?$/i,
    /^(Сегодня|Вчера),?\s+(в\s+)?\d{1,2}:\d{2}$/i,
    /^Чита(ть|йте) .{2,30} в$/, // «Читайте Monocle.ru в» (дальше — значки соцсетей)
    /^(Getty Images|Global Look Press|Shutterstock|Reuters|AP Photo|AFP|EPA|Unsplash|Pixabay|Freepik|Legion-Media|Фотобанк Лори)(\s*[\/|,].*)?$/i, // подпись фотоагентства
    /^\d[\d\s]* просмотр/,
    /^\d{1,2}:\d{2} \d{2}\.\d{2}\.\d{4}/, // «13:51 07.10.2026 (обновлено …)»
    /^\d{1,2} [а-я]+ \d{4}, \d{1,2}:\d{2}$/, // «8 октября 2026, 10:04»
    /^(\d{1,2}:\d{2}\s+)?Пропустить(\s+\d+)?$/, // кнопка видеоплеера
    /^Короткая ссылка/,
    /^Ошибка в тексте\?/,
    /^Подписывайтесь на (наш|канал)/,
    /мы пишем в Telegram$/,
    /^Оставайтесь на связи с /,
    /^Добавить .{2,20} в избранные источники/,
    /^(Группа |Канал )?НТВ (в|во|«)/,
    /^Telegram-канал /,
    /^Канал о бизнесе, финансах/,
    /читайте в подписке/i,
    /^Материал дополняется\.?$/,
    /^(Фото|Видео|Скриншот|Источник фото|Иллюстрация)\s*[:—–-]/i,
    /^(Фото|Видео)\s+[^.!?]{0,90}$/i, // короткая подпись «Фото пресс-службы правительства края»
  ];
  // Строки про cookie — только если строка короткая (баннер), а не абзац статьи о cookie
  const COOKIE = /cookie|куки/i;
  // Строки, после которых текст статьи заканчивается (дальше теги, ссылки, реклама)
  const TAIL = /^(Рекомендуем|Теги|Авторы|Персоны|Картина дня|Сегодня в СМИ|Ранее на эту тему|Читайте также|Материалы по теме|Подробнее)\s*:?$/;
  // подпись к фото: «Владимир Зеленский (Фото: … / Getty Images)»
  const CAPTION = /\((Фото|Видео|Кадр)\s*:[^)]*\)$/;
  // подпись или источник снимка отдельной строкой: «Автор фото: Anelo / Shutterstock»,
  // «Фото t.me/brd_region», «Изображение сгенерировано с помощью ИИ / …», «… Фото: Пруфы».
  // Короткая строка, которая начинается с такого слова и не похожа на обычное предложение.
  const PHOTO_START = /^(Фото|Видео|Скриншот|Иллюстрация|Изображение|Инфографика|Кадр|Автор фото|Источник фото|На фото|Фотограф)(?=[\s:—–-]|$)/i;
  const isCaption = (t) =>
    (t.length < 160 && PHOTO_START.test(t) && (/[:\/©]/.test(t) || !/[.!?…»"]$/.test(t))) ||
    (t.length < 250 && /(Фото|Видео|Источник)\s*:\s*[^.!?]{1,60}$/i.test(t));
  // призывы подписаться и ссылки на соцсети в конце статьи
  const PROMO =
    /^(Чтобы (первыми|быть в курсе|не пропустить)|Подписывайтесь|Подпишитесь|Следите за|Читайте нас|Все (самое |самые )?(важн|главн)\S* (новост|и оперативн)|Больше (новостей|интересного|материалов)|Самое (актуальное|интересное) в|Понравилась (новость|статья)|Поделиться|Увидели опечатку|Нашли (ошибку|опечатку)|Оперативные публикации)/i;
  const isPromo = (t) => t.length < 300 && (PROMO.test(t) || /—\s*в (теме|канале|нашем|telegram|телеграм)/i.test(t));

  // ---------- какую статью брать ----------
  // На сайтах с «бесконечной лентой» на странице несколько статей подряд. Берём ту,
  // что сейчас на экране, — вместе с её заголовком, датой и адресом.
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
  };
  // h1 в шапке сайта — это логотип («Агентство деловых новостей …»), а не заголовок статьи.
  // Шапку статьи (<header> внутри статьи, как у РБК) при этом не трогаем.
  const ARTICLE_SEL = 'article, main, [itemtype*="Article"], [class*="article" i], [class*="news-detail" i]';
  const isSiteHeader = (h) => {
    const hd = h.closest("header");
    return !!hd && !hd.closest(ARTICLE_SEL) && !hd.matches(ARTICLE_SEL);
  };
  const realH1 = (root) =>
    [...root.querySelectorAll("h1")].find((h) => !h.closest('nav, a, [class*="logo" i]') && !isSiteHeader(h) && norm(h.textContent)) || null;
  let cands = [...document.querySelectorAll('article, [itemtype*="Article"], .article')].filter(
    (el) => el.querySelector("h1, h2") && norm(el.textContent).length > 500
  );
  cands = cands.filter((el) => cands.filter((o) => o !== el && el.contains(o)).length < 2); // обёртка ленты — не статья
  cands = cands.filter((el) => !cands.some((o) => o !== el && o.contains(el))); // из вложенных берём внешний
  const multi = cands.length > 1;
  // одна статья на странице: блоком статьи считаем только тот, где стоит главный заголовок,
  // иначе это может оказаться анонс соседнего материала
  const mainH1 = realH1(document);
  const scope = multi
    ? cands.reduce((a, b) => (visible(b) > visible(a) ? b : a))
    : cands[0] && mainH1 && cands[0].contains(mainH1) ? cands[0] : null;
  // блок, в котором ищем дату текстом: статья, а не лента соседних новостей сбоку
  const dateArea = scope || cands[0] || null;
  const area = multi ? scope : document; // где искать заголовок, дату, текст

  // в ленте первая статья — «своя» для этой страницы: ей подходят метаданные всей страницы (ТАСС
  // кладёт дату только в JSON-LD страницы, вне блока статьи)
  const pageOwn = !multi || scope === cands[0];

  // ---------- метаданные: JSON-LD, meta-теги ----------
  const ldOf = (root) => {
    const ld = [];
    for (const s of root.querySelectorAll('script[type="application/ld+json"]')) {
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
    return ld.find((o) => /Article/.test(String(o["@type"])) && o.datePublished) || ld.find((o) => o.datePublished) || {};
  };
  const article = ldOf(area);
  const pageArticle = multi && pageOwn ? ldOf(document) : {};

  const site = meta('meta[property="og:site_name"]') || host;
  // название сайта в разных видах — им не может быть ни автор, ни заголовок статьи
  const lower = (s) => norm(s).toLowerCase();
  const siteNames = [site, meta('meta[property="og:site_name"]'), host.split(".")[0], host].map(lower).filter((s) => s.length > 3);

  // ---------- дата ----------
  // Сайты пишут дату по-разному: «20261007T1351» (РИА), «2026-10-15T06:06+0300» (Прайм),
  // «2026-10-8 13:23» (RT). Приводим к виду, который понимает JavaScript.
  const p2 = (n) => String(n).padStart(2, "0");
  const toDate = (s) => {
    s = String(s || "").trim();
    if (!s) return null;
    let m = s.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})$/);
    if (m) s = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`;
    // Время с часовым поясом переводим в пояс компьютера (московское): у региональных сайтов
    // «09:19+05:00» станет 07:19. Многие сайты пишут время в UTC («+00:00», «Z»), а на странице
    // показывают московское — без перевода время было бы неверным.
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(:\d{2}(\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/);
    if (m) {
      const tz = m[8] ? (m[8] === "Z" ? "Z" : m[8].replace(/^([+-]\d{2}):?(\d{2})$/, "$1:$2")) : "";
      s = `${m[1]}-${p2(m[2])}-${p2(m[3])}T${p2(m[4])}:${m[5]}${m[6] || ":00"}${tz}`;
    }
    const d = new Date(s);
    return isNaN(d) || d.getFullYear() < 2000 ? null : d;
  };
  const fmt = (d) => `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}, ${p2(d.getHours())}:${p2(d.getMinutes())}`;
  // месяц словом: «октября», «Октября», «окт», «окт.»
  const MON = "(янв|фев|мар|апр|ма[йя]|июн|июл|авг|сен|окт|ноя|дек)[а-я]*\\.?";
  const monthNo = (w) => ["янв", "фев", "мар", "апр", "ма", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"].findIndex((k) => w.startsWith(k)) + 1;
  // дата текстом в строке: «12:21, 17 окт 2026 г.», «9 октября, 2026», «18.10.2026 в 10:17»
  const dateIn = (t) => {
    t = t.toLowerCase();
    // «Сегодня, 15:12» / «Вчера в 21:40»
    let m = t.match(/(сегодня|вчера),?\s+(?:в\s+)?(\d{1,2}):(\d{2})/);
    if (m) {
      const d = new Date();
      if (m[1] === "вчера") d.setDate(d.getDate() - 1);
      return `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}, ${p2(m[2])}:${m[3]}`;
    }
    m = t.match(/(\d{1,2}):(\d{2}),?\s+(\d{2})\.(\d{2})\.(\d{4})/);
    if (m) return `${m[3]}.${m[4]}.${m[5]}, ${p2(m[1])}:${m[2]}`;
    m = t.match(/(\d{2})\.(\d{2})\.(\d{4}),?\s+(?:в\s+)?(\d{1,2}):(\d{2})/);
    if (m) return `${m[1]}.${m[2]}.${m[3]}, ${p2(m[4])}:${m[5]}`;
    m = t.match(new RegExp(`(\\d{1,2}):(\\d{2}),?\\s+(\\d{1,2})\\s+${MON},?\\s+(\\d{4})`));
    if (m) return `${p2(m[3])}.${p2(monthNo(m[4]))}.${m[5]}, ${p2(m[1])}:${m[2]}`;
    m = t.match(new RegExp(`(\\d{1,2})\\s+${MON},?\\s+(\\d{4})(?:\\s*(?:г\\.|года))?(?:\\s*[,|·•]?\\s*(?:в\\s+)?(\\d{1,2}):(\\d{2}))?`));
    if (m) return `${p2(m[1])}.${p2(monthNo(m[2]))}.${m[3]}` + (m[4] ? `, ${p2(m[4])}:${m[5]}` : "");
    m = t.match(/\b(\d{2})\.(\d{2})\.(20\d{2})\b/);
    return m ? `${m[1]}.${m[2]}.${m[3]}` : "";
  };
  // Строка, в которой кроме даты почти ничего нет: «07:2918 октября 2026», «9 октября, 2026»,
  // «12:21, 17 окт 2026 г. Лента новостей», «17 Октября 2026 0 Экономика». Такие строки — шапка
  // статьи, попавшая в текст. Предложение с датой («Выборы назначены на 18 сентября 2026 года.»)
  // начинается не с даты и оканчивается точкой — его не трогаем.
  const isDateLine = (t) => {
    if (t.length > 90 || !/^(\d|понедельник|вторник|среда|четверг|пятница|суббота|воскресенье|сегодня|вчера|обновлено|опубликовано)/i.test(t)) return false;
    if (/[!?…»"]$/.test(t) || (/\.$/.test(t) && !/\bг\.$|\sг\.$/.test(t))) return false;
    if (!new RegExp(`\\d{1,2}\\s+${MON}|\\d{2}\\.\\d{2}\\.\\d{4}|^(сегодня|вчера)`, "i").test(t)) return false;
    const rest = t
      .replace(/\d{1,2}[:.]\d{2}([:.]\d{2,4})?/g, " ")
      .replace(new RegExp(`\\d{1,2}\\s+${MON}`, "gi"), " ")
      .replace(/\d+/g, " ")
      .replace(/(^|\s)(г\.|года?|в)(?=\s|$)/gi, " ")
      .replace(/понедельник|вторник|сред[аы]|четверг|пятниц[аы]|суббот[аы]|воскресенье|сегодня|вчера|обновлено|опубликовано/gi, " ");
    return rest.split(/[\s,·|•—–-]+/).filter((w) => /[а-яёa-z]/i.test(w)).length <= 2;
  };
  // заголовок, рядом с которым ищем дату и автора
  const headEl = multi ? realH1(scope) || scope.querySelector("h1, h2") : mainH1;
  // Карточки и списки других материалов рядом со статьёй: их дата и автор — чужие (у Регнума колонка
  // мнений сбоку, у Магаданской правды «читайте также» в одном блоке с заголовком). Части имени
  // класса сравниваем целиком: «align-items-start» (Bootstrap) — не «item».
  const CARD = /^(card|item|teaser|preview|list|sidebar|column|adv|related|recommend)$/i;
  const inCard = (c) => {
    for (let e = c; e && !(headEl && e.contains(headEl)); e = e.parentElement) {
      if (e.tagName === "LI") return true;
      for (const cls of e.classList) if (cls.split(/[-_]+/).some((p) => CARD.test(p))) return true;
    }
    return false;
  };
  // Часы сайта в шапке («18 октября, 2026 19:39:24» у Магаданской правды) — не дата статьи.
  const CLOCK = 'nav, footer, [class*="toolbar" i], [class*="clock" i]';
  // Дата, написанная текстом в поле даты статьи. Ищем только в элементах, похожих на поле даты:
  // в самом тексте статьи встречаются другие даты («22 мая 2025 года»).
  // near — поиск у заголовка: смотрим ещё в блоки «info»/«meta» и в простые элементы, весь текст
  // которых — дата (у Магаданской правды она в div без класса), а карточки соседних материалов
  // пропускаем.
  const textDate = (el, near) => {
    const sel = 'time, [class*="date" i], [class*="time" i]' + (near ? ', [class*="info" i], [class*="meta" i]' : "");
    const t = [...(el || document).querySelectorAll("*")]
      .filter((f) => f.matches(sel) || (near && !f.children.length && isDateLine(norm(f.textContent))))
      .filter((f) => !f.closest(CLOCK) && !(near && inCard(f)))
      .slice(0, 40)
      .map((f) => norm(f.textContent))
      .filter((s) => s.length < 80);
    return dateIn(t.join(" | "));
  };
  // дата рядом с заголовком статьи: в шапке статьи, на несколько уровней вверх от заголовка
  const nearTitleDate = (h) => {
    for (let el = h && h.parentElement, i = 0; el && el !== document.body && i < 4; el = el.parentElement, i++) {
      const d = textDate(el, true);
      if (d) return d;
    }
    return "";
  };
  const attrOf = (el) => el && (el.getAttribute("datetime") || el.getAttribute("content"));
  const timeAttr = (root) => [...root.querySelectorAll("time[datetime]")].find((t) => !t.closest(CLOCK));
  const pageMeta = [
    meta('meta[property="article:published_time"]'),
    meta('meta[itemprop="datePublished"]'),
    (multi ? pageArticle : article).datePublished,
    meta('meta[name="mediator_published_time"]'),
  ];
  const dateSources = multi
    ? [attrOf(scope.querySelector('[itemprop="datePublished"]')), attrOf(timeAttr(scope)), article.datePublished, ...(pageOwn ? pageMeta : [])]
    : [...pageMeta, attrOf(document.querySelector('[itemprop="datePublished"]')), attrOf(timeAttr(scope || document))];
  const published = dateSources.map(toDate).find(Boolean);
  // сначала поле даты у заголовка, потом внутри статьи, и только потом по странице
  let date = published
    ? fmt(published)
    : nearTitleDate(headEl) || (dateArea && textDate(dateArea)) || textDate(document.querySelector("main") || document.body);

  // Автор: только то, что похоже на имя человека. РБК склеивает имя с должностью:
  // «Полина ДугановаСтарший редактор…» — разрезаем на стыке строчной и заглавной буквы.
  // Имя заглавными («Ира ДУЩЕНКО», «ПЕТР АКОПОВ») приводим к обычному виду. Название сайта
  // («Губернiя Daily») автором не считаем.
  // Имя — целиком кириллицей или целиком латиницей: «Губернiя Daily» (с латинской i) — не имя.
  const NAME = /^([А-ЯЁ][а-яё-]+(\s+[А-ЯЁ][а-яё-]+){1,2}|[A-Z][a-z-]+(\s+[A-Z][a-z-]+){1,2})$/;
  const unCaps = (s) => s.replace(/[А-ЯЁA-Z]{2,}(-[А-ЯЁA-Z]{2,})?/g, (w) => w[0] + w.slice(1).toLowerCase());
  const cleanAuthor = (s) =>
    [
      ...new Set(
        norm(s)
          .replace(/([а-яёa-z])([А-ЯЁA-Z])/g, "$1|$2")
          .split(/\s*[|,;]\s*|\s+и\s+/)
          .map(unCaps)
          .filter((x) => NAME.test(x) && !siteNames.some((n) => lower(x).includes(n)))
      ),
    ].join(", ");
  // имя в начале строки: «Сергей Мануков обозреватель Monocle.ru 15 октября…»
  const leadingName = (s) => {
    const w = norm(s).split(" ");
    for (const n of [3, 2]) {
      const a = cleanAuthor(w.slice(0, n).join(" "));
      if (a) return a;
    }
    return "";
  };
  const ldAuthor = [].concat(article.author || []).map((a) => (typeof a === "string" ? a : a.name || "")).join(", ");
  // «Автор: …», «Текст: …», «Автор текста: …» — строка с автором (в тексте или в блоке автора)
  const AUTHOR_LINE = /^(Автор(ы)?(\s+текста)?|Текст|Подготовил[аи]?|Материал подготовил[аи]?)\s*:\s*(.+)$/i;
  // блок автора у заголовка: поднимаемся от заголовка, пока не найдём; фотографов и комментаторов пропускаем
  const AUTHOR_SEL = '[itemprop~="author"], [rel~="author"], [class*="author" i], [class*="byline" i], [class*="avtor" i]';
  const NOT_AUTHOR = 'figure, figcaption, [class*="photo" i], [class*="image" i], [class*="picture" i], [class*="gallery" i], [class*="comment" i], aside, nav, footer';
  const domAuthor = () => {
    for (let el = headEl && headEl.parentElement, i = 0; el && i < 6; el = el.parentElement, i++) {
      for (const c of el.querySelectorAll(AUTHOR_SEL)) {
        if (c.closest(NOT_AUTHOR) || c.querySelector("h1") || inCard(c)) continue;
        const nameEl = c.querySelector('[itemprop="name"], [class*="name" i]') || c;
        const s = norm(nameEl.textContent);
        if (!s || s.length > 200 || /фото/i.test(s)) continue;
        const m = s.match(AUTHOR_LINE);
        const a = cleanAuthor(m ? m[4] : s) || leadingName(m ? m[4] : s);
        if (a) return a;
      }
      if (el === document.body) break;
    }
    return "";
  };

  // ---------- заголовок и адрес ----------
  const rule = SITES.find((r) => r.host.test(host));
  let title;
  let url = location.href.split("#")[0];
  if (multi) {
    const h =
      (rule && rule.title && scope.querySelector(rule.title)) || realH1(scope) || scope.querySelector(".article__title") || scope.querySelector("h1, h2");
    title = norm(h && h.textContent);
    const own = scope.getAttribute("data-url") || attrOf(scope.querySelector('[itemprop="mainEntityOfPage"]')) || "";
    try {
      if (own && !/\.(jpe?g|png|webp|gif)(\?|$)/i.test(own)) url = new URL(own, location.href).href.split("#")[0];
    } catch (e) {
      /* оставляем адрес страницы */
    }
  } else {
    const h = (rule && rule.title && document.querySelector(rule.title)) || mainH1;
    title =
      norm(h && h.textContent) ||
      meta('meta[property="og:title"]') ||
      norm(document.title).replace(/\s+[—–|-]\s+[^—–|]{2,40}$/, "");
  }
  // в og:title и заголовке вкладки к названию часто приписан сайт: «… | Чеснок», «… — РБК»
  for (const name of [site, meta('meta[property="og:site_name"]')].filter((x) => x && x.length > 1)) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    title = title.replace(new RegExp(`\\s+[|—–-]\\s+${esc}\\s*$`, "i"), "");
  }
  let paragraphs = [];
  const heads = []; // индексы абзацев-подзаголовков
  let byline = "";
  let fromRule = false; // текст взят по правилу сайта — ему можно быть короче

  // собирает «листовые» блоки из контейнера, чтобы абзацы не повторялись
  const collect = (root, blocks, skip) => {
    const out = [], hs = [];
    for (const el of root.querySelectorAll(blocks)) {
      if (el.querySelector(blocks)) continue;
      if (skip && el.closest(skip)) continue;
      const t = norm(el.textContent);
      // блок, весь текст которого — ссылки, это список «другие новости», а не абзац статьи
      const linked = norm([...el.querySelectorAll("a")].map((a) => a.textContent).join(" "));
      if ((t.length < 200 && linked.length >= t.length * 0.9) || (t.length < 150 && linked.length >= t.length * 0.6)) continue;
      if (t.length > 1 && t !== out[out.length - 1]) {
        if (/^H[2-4]$/.test(el.tagName) && out.length) hs.push(out.length);
        out.push(t);
      }
    }
    return { out, hs };
  };
  const NOT_ARTICLE =
    'aside, nav, footer, #comments, [class*="comment" i], [class*="news-list" i], [class*="related" i], [class*="recommend" i], [class*="read-also" i], [class*="readmore" i], [class*="more-news" i], [class*="popular" i]';
  // Мелкие служебные блоки внутри статьи: фото с подписями и авторами снимков (НГС, ДП, Регнум),
  // блок автора с должностью («журналист ИрСити»), счётчики, «поделиться», реклама, хлебные крошки,
  // разделители-заголовки меню (Правда ПФО). Убираем только небольшие блоки — не саму статью.
  const NOISE =
    'figure, figcaption, picture, noscript, [class*="caption" i], [class*="author" i], [class*="byline" i], [class*="source" i], [class*="share" i], [class*="social" i], [class*="views" i], [class*="view-count" i], [class*="counter" i], [class*="creative" i], [class*="banner" i], [class*="advert" i], [class*="promo" i], [class*="breadcrumb" i], [class*="divider" i], [class*="subscribe" i]';
  // Readability по отдельному документу: по всей странице или только по выбранной статье.
  // visibleOnly: убираем всё, что браузер не показывает (скрытые CSS-классом блоки), — у EastRussia
  // там лежат полные тексты бюллетеней, и Readability принимал их за статью.
  const readable = (node, visibleOnly) => {
    let doc, src, copy;
    if (node === document) {
      doc = document.cloneNode(true);
      src = document.body;
      copy = doc.body;
    } else {
      doc = document.implementation.createHTMLDocument(title || "");
      copy = doc.importNode(node, true);
      doc.body.appendChild(copy);
      src = node;
    }
    if (visibleOnly && src && copy) {
      const a = src.getElementsByTagName("*"), b = copy.getElementsByTagName("*");
      const drop = [];
      for (let i = 0; i < a.length && i < b.length; i++) {
        if (a[i].hidden) drop.push(b[i]);
        else {
          const cs = getComputedStyle(a[i]);
          if (cs.display === "none" || cs.visibility === "hidden") drop.push(b[i]);
        }
      }
      drop.forEach((n) => n.remove());
    }
    // Списки других новостей, «читают сейчас», комментарии — Readability иногда цепляет их к статье
    // (у Байкал-дейли они лежат внутри блока статьи). Убираем их только после прохода по скрытым
    // элементам: тот идёт по странице и копии параллельно, и удаление раньше сбило бы соответствие.
    // Блок с заголовком статьи не трогаем.
    for (const el of [...copy.querySelectorAll(NOT_ARTICLE)]) if (!el.querySelector("h1")) el.remove();
    for (const el of [...copy.querySelectorAll(NOISE)]) {
      if (el.isConnected && !el.querySelector("h1") && norm(el.textContent).length < 600) el.remove();
    }
    try {
      return new Readability(doc, { serializer: (el) => el }).parse();
    } catch (e) {
      return null;
    }
  };
  const fromReadability = (node) => {
    // сначала только видимое; если так текста не набралось (сайт прячет часть статьи) — всё
    let parsed = readable(node, true);
    if (!parsed || !parsed.content || norm(parsed.textContent).length < 150) parsed = readable(node, false);
    if (!parsed || !parsed.content) return false;
    const { out, hs } = collect(parsed.content, "p, li, blockquote, h2, h3, h4, pre");
    paragraphs = out.length ? out : (parsed.textContent || "").split(/\n+/).map(norm).filter(Boolean);
    heads.length = 0;
    heads.push(...(out.length ? hs : []));
    if (!title) title = norm(parsed.title);
    byline = norm(parsed.byline);
    return paragraphs.join("").length >= 150;
  };

  // 1. Правило для известного сайта (внутри выбранной статьи, если их на странице несколько).
  //    Порог ниже, чем у Readability: у «молний» РИА весь текст — одна короткая фраза.
  const root = rule && area.querySelector(rule.root);
  if (root) {
    const { out, hs } = collect(root, rule.blocks, rule.skip);
    if (out.join("").length >= 60) {
      paragraphs = out;
      heads.push(...hs);
      fromRule = true;
    }
  }
  // 2. Иначе Readability (алгоритм «режима чтения» Firefox): сначала только по блоку статьи —
  //    так в текст не попадают соседние материалы и врезки; если этого мало — по всей странице.
  //    При нескольких статьях на странице всю страницу не берём: получится чужой текст.
  if (!paragraphs.length) {
    if (!(scope && fromReadability(scope)) && !multi) fromReadability(document);
  }

  let author =
    (multi ? "" : cleanAuthor(meta('meta[name="mediator_author"]'))) ||
    cleanAuthor(ldAuthor) ||
    (multi ? "" : cleanAuthor(meta('meta[name="author"]'))) ||
    (multi ? "" : cleanAuthor(meta('meta[property="article:author"]'))) ||
    (multi ? "" : cleanAuthor(meta('meta[name="analytics:author"]'))) ||
    domAuthor() ||
    cleanAuthor(byline);

  // ---------- чистка: служебные строки, повтор заголовка, «хвост» страницы ----------
  const titles = new Set([title, multi ? "" : meta('meta[property="og:title"]'), norm(article.headline), author].filter(Boolean));
  const kept = [], keptHeads = [];
  const headSet = new Set(heads);
  let lineAuthor = "", lineDate = "";
  for (let i = 0; i < paragraphs.length; i++) {
    const t = paragraphs[i];
    if (TAIL.test(t) && kept.length) break;
    if (titles.has(t) || JUNK.some((re) => re.test(t))) continue;
    if (siteNames.includes(lower(t))) continue; // строка — просто название сайта («dp.ru»)
    if (COOKIE.test(t) && t.length < 300) continue;
    if (CAPTION.test(t) && t.length < 250) continue;
    if (isCaption(t) || isPromo(t)) continue;
    if (isDateLine(t)) {
      lineDate = lineDate || dateIn(t);
      continue;
    }
    const am = t.length < 250 && t.match(AUTHOR_LINE);
    if (am) {
      lineAuthor = lineAuthor || cleanAuthor(am[4]);
      continue;
    }
    if (kept.includes(t)) continue; // повтор того же абзаца (скрытая разметка дублирует текст)
    if (headSet.has(i) && kept.length) keptHeads.push(kept.length);
    kept.push(t);
  }
  // подпись автора последней строкой, без «Автор:» (Бизнес-вектор): «Маргарита Нерода»
  const last = kept[kept.length - 1];
  if (kept.length > 1 && last && NAME.test(last) && cleanAuthor(last) && !keptHeads.includes(kept.length - 1)) {
    lineAuthor = lineAuthor || cleanAuthor(last);
    kept.pop();
  }
  paragraphs = kept;
  author = author || lineAuthor;
  date = date || lineDate;

  // ---------- это вообще статья? ----------
  // Главная страница или раздел: адрес «/», либо заголовок — это просто название сайта.
  const titleIsSite = siteNames.some((s) => lower(title) === s || (lower(title).includes(s) && lower(title).length < s.length + 35));
  const looksLikeHome = /^\/?(index\.\w+)?$/.test(location.pathname) || (titleIsSite && !published && meta('meta[property="og:type"]') !== "article");
  if (looksLikeHome) {
    return { error: "Похоже, это не страница статьи, а главная или раздел сайта. Откройте саму статью и нажмите кнопку ещё раз." };
  }

  const length = paragraphs.reduce((n, p) => n + p.length, 0);
  if (length < (fromRule ? 60 : 150)) {
    return { error: "Не удалось найти текст статьи на этой странице." };
  }
  return { title, url, site, date, author, paragraphs, heads: keptHeads };
})();
