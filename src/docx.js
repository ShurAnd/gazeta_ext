// Формирование «Обзора публикаций СМИ» в формате .docx без библиотек:
// docx — это zip-архив с XML-файлами, собираем его вручную.
// Оформление повторяет образец «СМИ 8 октября 2026 г.docx» (стили, цвета, поля, колонтитулы).
const Docx = (() => {
  // A4, поля как в образце: слева 3 см, справа 1,25 см, сверху и снизу 2 см
  const LEFT = 1701, RIGHT = 709;
  const TEXT_WIDTH = 11906 - LEFT - RIGHT;
  const PAGE_NO_TAB = 8504; // позиция «Стр.N» в содержании
  const PAGE = `<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="${RIGHT}" w:bottom="1134" w:left="${LEFT}" w:header="709" w:footer="709" w:gutter="0"/>`;
  const NS =
    'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

  const esc = (s) =>
    String(s)
      .replace(/[\u0000-\u0008\u000A-\u001F￾￿]/g, " ")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const run = (text, rpr = "") =>
    `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  const para = (style, inner = "", ppr = "") => `<w:p><w:pPr><w:pStyle w:val="${style}"/>${ppr}</w:pPr>${inner}</w:p>`;
  const field = (instr, cached, rpr = "") => {
    const r = (x) => `<w:r>${rpr ? `<w:rPr>${rpr}</w:rPr>` : ""}${x}</w:r>`;
    return `${r('<w:fldChar w:fldCharType="begin"/>')}${r(`<w:instrText xml:space="preserve"> ${instr} </w:instrText>`)}${r('<w:fldChar w:fldCharType="separate"/>')}${run(cached, rpr)}${r('<w:fldChar w:fldCharType="end"/>')}`;
  };
  const orgLines = (org) => String(org || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const bookmark = (i) => `_Art${i + 1}`;
  const SMALL = '<w:sz w:val="27"/><w:szCs w:val="27"/>'; // в содержании шрифт 13,5
  const BOLD = "<w:b/><w:bCs/>";
  // таблица без рамок, по строке на каждую строку названия организации; extra — пустая правая колонка
  const orgTable = (list, tblPr, cell, extra = 0) =>
    `<w:tbl><w:tblPr>${tblPr}<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="1" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="${cell.w}"/>${extra ? `<w:gridCol w:w="${extra}"/>` : ""}</w:tblGrid>` +
    list
      .map((t) => `<w:tr>${cell.trPr || ""}<w:tc><w:tcPr><w:tcW w:w="${cell.w}" w:type="dxa"/></w:tcPr>${para(cell.style, run(t))}</w:tc>${extra ? `<w:tc><w:tcPr><w:tcW w:w="${extra}" w:type="dxa"/></w:tcPr><w:p/></w:tc>` : ""}</w:tr>`)
      .join("") +
    "</w:tbl>";

  // ---------- номера страниц для содержания ----------
  // Word, если попросить его обновить поля при открытии, делает это до разбивки на страницы —
  // и во всех «Стр.N» получается 1. Поэтому номер страницы каждой статьи считаем сами: повторяем,
  // как Word делит текст на строки (ширину слов меряем тем же шрифтом Times New Roman) и строки —
  // на страницы. Номер пишется готовым значением поля PAGEREF; если где-то расчёт разойдётся
  // с Word, Ctrl+A и F9 в Word пересчитают номера точно.
  // Размеры — в пунктах, измерены по Word на этом шаблоне.
  const TW = 20; // твипов в пункте
  // высота строки Times New Roman при одинарном интервале: (ascent + descent + lineGap) / emSize = 2355/2048
  // кегля. Округлять до 1,15 нельзя: за страницу набегает разница, и Word вмещает строку, а расчёт — нет.
  const LINE = 2355 / 2048;
  const BODY_W = TEXT_WIDTH / TW, TOC_HEAD_W = PAGE_NO_TAB / TW, INDENT = 709 / TW;
  const PAGE_BOTTOM = (16838 - 1134) / TW;
  const TOP_FIRST = 1134 / TW;
  // со 2-й страницы текст ниже: шапка с названием организации (строки 9 пт + пустой абзац) не влезает в поле
  const topNext = (orgCount) => Math.max(TOP_FIRST, (709 + (orgCount + 1) * 9 * LINE * TW) / TW);

  // mode (для проверки): "kern" — как браузер по умолчанию, "nokern" — без кернинга,
  // "chars" — сумма ширин отдельных букв с округлением до твипа
  function measurer(mode = "chars") {
    let ctx = null;
    try {
      const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
      ctx = canvas.getContext("2d");
    } catch (e) {
      ctx = null;
    }
    if (!ctx) return null;
    if (mode !== "kern" && "fontKerning" in ctx) ctx.fontKerning = "none";
    const cache = new Map();
    const width = (text, font) => {
      const key = font + "\u0001" + text;
      if (!cache.has(key)) {
        ctx.font = font;
        cache.set(key, ctx.measureText(text).width * 0.75); // пиксели → пункты
      }
      return cache.get(key);
    };
    return (text, size, bold, italic) => {
      const font = `${italic ? "italic " : ""}${bold ? "bold " : ""}${size}pt "Times New Roman"`;
      if (mode !== "chars") return width(text, font);
      let w = 0;
      for (const ch of text) w += Math.round(width(ch, font) * TW) / TW;
      return w;
    };
  }
  // сколько строк займёт абзац: Word заполняет строку словами, пока следующее помещается;
  // переносить строку можно на пробелах и после дефиса или тире
  function lineCount(text, width, indent, size, bold, italic, measure) {
    const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
    if (!words.length) return 1;
    const space = measure(" ", size, bold, italic);
    let lines = 1, x = indent, start = indent;
    for (const word of words) {
      word.split(/(?<=[-–—])/).forEach((piece, k) => {
        const w = measure(piece, size, bold, italic);
        const gap = k === 0 && x > start ? space : 0;
        if (x === start || x + gap + w <= width + 0.01) x += gap + w;
        else {
          lines++;
          start = 0;
          x = w;
        }
        while (x > width + 0.01) {
          // слово длиннее строки (ссылка): Word режет его по буквам
          lines++;
          x -= width;
        }
      });
    }
    return lines;
  }

  // страница, на которой окажется заголовок каждой статьи
  // trace (для проверки по Word): сюда пишется каждый абзац — {lines, page, y}
  function pagesOf(p, measure, trace) {
    const org = orgLines(p.org);
    const items = []; // {lines, lh, keep, mark}
    const add = (text, o) => {
      const size = o.size || 14;
      const width = o.width || BODY_W;
      const indent = o.indent === undefined ? INDENT : o.indent;
      items.push({ lines: lineCount(text, width, indent, size, o.bold, o.italic, measure), lh: size * LINE, keep: !!o.keep, mark: o.mark });
    };
    const blank = (keep) => items.push({ lines: 1, lh: 14 * LINE, keep: !!keep });

    // первая страница: таблица с названием организации, пустая строка, название, дата (кегль 26 + 15 пт после)
    const titleLines = lineCount(p.title, BODY_W, INDENT, 26, true, false, measure);
    let y = TOP_FIRST + org.length * 14 * LINE + (2 + titleLines) * 26 * LINE + 3 * 15 + 8.1;

    p.entries.forEach((e, i) => {
      for (const s of [e.site, e.date]) if (s && s.trim()) add(s, { size: 13.5, bold: true, indent: 0, keep: true });
      add(e.title, { size: 13.5, bold: true, indent: 0, width: TOC_HEAD_W, keep: true });
      for (const k of e.lead) add(e.paragraphs[k], { size: 13.5, bold: true, italic: true });
      blank(true);
    });
    blank(false);
    items.push({ pageBreak: true });

    p.entries.forEach((e, i) => {
      if (i > 0) blank(false), blank(false);
      for (const s of [e.site, e.date, e.author]) if (s && s.trim()) add(s, { bold: true, indent: 0, keep: true });
      blank(true);
      add(e.title, { bold: true, indent: 0, keep: true, mark: i });
      blank(true);
      const lead = new Set(e.lead), heads = new Set(e.heads);
      e.paragraphs.forEach((t, k) => {
        if (!t.trim()) return;
        if (lead.has(k)) add(t.trim(), { bold: true, italic: true });
        else if (heads.has(k)) add(t.trim(), { bold: true, keep: true });
        else add(t.trim(), {});
      });
    });

    // раскладываем строки по страницам
    const top = topNext(org.length);
    const pages = [];
    let page = 1;
    const newPage = () => {
      page++;
      y = top;
    };
    const height = (it) => it.lines * it.lh;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.pageBreak) {
        // Разрыв страницы — отдельный абзац; он остаётся на старой странице, новая начинается сразу
        // со статьи. Но если для его строки места внизу уже нет, он сам переезжает на следующую
        // страницу — и статьи начинаются ещё на страницу дальше.
        if (y + 14 * LINE > PAGE_BOTTOM + 0.01) newPage();
        newPage();
        continue;
      }
      // «не отрывать от следующего»: абзац, цепочка таких же за ним и первая строка следующего
      // должны оказаться на одной странице; если не помещаются — вся цепочка уходит на новую
      if (it.keep && y > top) {
        let need = 0, j = i;
        while (j < items.length && items[j].keep) need += height(items[j++]);
        // от следующего абзаца на этой странице должно остаться не меньше двух строк (запрет висячих
        // строк), а абзац до трёх строк Word вообще не разрывает
        if (j < items.length && !items[j].pageBreak) need += (items[j].lines <= 3 ? items[j].lines : 2) * items[j].lh;
        if (y + need > PAGE_BOTTOM + 0.01 && top + need <= PAGE_BOTTOM) newPage();
      }
      // Строки абзаца по страницам с запретом висячих строк (в Word включён по умолчанию):
      // первая строка абзаца не остаётся одна внизу страницы, последняя — одна вверху следующей.
      let left = it.lines, first = true;
      while (left > 0) {
        const fit = Math.floor((PAGE_BOTTOM + 0.01 - y) / it.lh);
        let k = Math.min(fit, left);
        if (k < left) {
          if (left - k === 1) k--; // последняя строка одна на новой странице
          if (first && k === 1) k = 0; // первая строка одна внизу
          if (k < 0) k = 0;
          if (k === 0 && y <= top) k = Math.max(fit, 1); // абзац длиннее страницы
        }
        if (k > 0) {
          if (first) {
            if (it.mark !== undefined) pages[it.mark] = page;
            if (trace) trace.push({ lines: it.lines, page, y: Math.round(y * 10) / 10 });
            first = false;
          }
          y += k * it.lh;
          left -= k;
        }
        if (left > 0) newPage();
      }
      if (trace) trace[trace.length - 1].endPage = page;
    }
    return pages;
  }

  function documentXml(p) {
    let b = "";
    // номера страниц статей для содержания (если не получилось посчитать — пусто, F9 в Word заполнит)
    let pages = [];
    if (p.toc !== false) {
      try {
        const measure = measurer();
        if (measure) pages = pagesOf(p, measure);
      } catch (e) {
        pages = [];
      }
    }
    // ---------- первая страница: шапка ----------
    const org = orgLines(p.org).map((s) => s.toUpperCase());
    if (org.length) {
      b += orgTable(org, '<w:tblW w:w="0" w:type="auto"/><w:jc w:val="center"/>', { w: 4644, style: "OrgName", trPr: '<w:trPr><w:jc w:val="center"/></w:trPr>' }, 4927);
    }
    // линия под датой — общая нижняя граница трёх абзацев (пустая строка, название, дата)
    b += para("Title");
    b += para("PaperTitle", run(p.title));
    b += para("Title", run(p.date, '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman"/><w:sz w:val="28"/><w:szCs w:val="28"/>'), '<w:ind w:firstLine="0"/>');

    // ---------- содержание: источник, заголовок с «Стр.N», выделенные абзацы ----------
    // (p.toc === false — обзор раздела: содержания нет, статьи идут сразу после шапки)
    if (p.toc !== false) {
      p.entries.forEach((e, i) => {
        for (const s of [e.site, e.date]) if (s && s.trim()) b += para("Source", run(s, SMALL));
        b += para(
          "Head",
          `${run(e.title, SMALL)}<w:r><w:rPr>${SMALL}<w:u w:val="single"/></w:rPr><w:tab/></w:r>${run("Стр.", SMALL)}${field(`PAGEREF ${bookmark(i)} \\h`, pages[i] ? String(pages[i]) : "", SMALL)}`,
          `<w:tabs><w:tab w:val="left" w:pos="${PAGE_NO_TAB}"/></w:tabs><w:ind w:right="${TEXT_WIDTH - PAGE_NO_TAB}"/><w:jc w:val="left"/>`
        );
        for (const k of e.lead) b += para("Lead", run(e.paragraphs[k], SMALL));
        b += para("Source");
      });
      b += para("Normal") + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    }

    // ---------- статьи целиком ----------
    p.entries.forEach((e, i) => {
      if (i > 0) b += para("Normal") + para("Normal");
      for (const s of [e.site, e.date, e.author]) if (s && s.trim()) b += para("Source", run(s));
      b += para("Source");
      b += para("Head", `<w:bookmarkStart w:id="${i}" w:name="${bookmark(i)}"/>${run(e.title)}<w:bookmarkEnd w:id="${i}"/>`);
      b += para("Normal", "", "<w:keepNext/>");
      const lead = new Set(e.lead), heads = new Set(e.heads);
      e.paragraphs.forEach((t, k) => {
        if (!t.trim()) return;
        if (lead.has(k)) b += para("Lead", run(t.trim()));
        else if (heads.has(k)) b += para("Normal", run(t.trim(), BOLD), "<w:keepNext/>"); // подзаголовок
        else b += para("Normal", run(t.trim()));
      });
    });

    const refs = '<w:headerReference w:type="default" r:id="rId4"/><w:headerReference w:type="first" r:id="rId5"/><w:footerReference w:type="default" r:id="rId3"/><w:footerReference w:type="first" r:id="rId6"/>';
    return `${HEAD}<w:document ${NS}><w:body>${b}<w:sectPr>${refs}${PAGE}<w:cols w:space="708"/><w:titlePg/></w:sectPr></w:body></w:document>`;
  }

  // стили и их названия — как в образце, чтобы документ было привычно править в Word
  function stylesXml() {
    const tnr = '<w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:cs="Times New Roman" w:eastAsia="Times New Roman"/>';
    const size = (n) => `<w:sz w:val="${n}"/><w:szCs w:val="${n}"/>`;
    const color = (c) => `<w:color w:val="${c}"/>`;
    const style = (id, name, ppr, rpr, basedOn = "Normal", extra = "") =>
      `<w:style w:type="paragraph" w:customStyle="1" w:styleId="${id}"><w:name w:val="${name}"/><w:basedOn w:val="${basedOn}"/>${extra}<w:qFormat/><w:pPr>${ppr}</w:pPr><w:rPr>${rpr}</w:rPr></w:style>`;
    const rule = '<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="21" w:color="4F81BD"/></w:pBdr>';
    return (
      `${HEAD}<w:styles ${NS}><w:docDefaults><w:rPrDefault><w:rPr>${tnr}<w:lang w:val="ru-RU" w:eastAsia="ru-RU" w:bidi="ar-SA"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
      `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:firstLine="709"/><w:jc w:val="both"/></w:pPr><w:rPr>${tnr}${size(28)}</w:rPr></w:style>` +
      style("OrgName", "Название СЦ", '<w:ind w:firstLine="0"/><w:jc w:val="center"/>', "") +
      style("Title", "Название", `${rule}<w:spacing w:after="300"/><w:contextualSpacing/>`, `${color("17365D")}<w:spacing w:val="5"/><w:kern w:val="28"/>${size(52)}`) +
      style("PaperTitle", "Название газеты", '<w:jc w:val="center"/>', `${tnr}<w:b/><w:bCs/>${color("00B0F0")}<w:sz w:val="52"/><w:szCs w:val="56"/>`, "Title") +
      style("Source", "Заголовок источник", '<w:keepNext/><w:ind w:firstLine="0"/>', `<w:b/><w:bCs/>${color("4F6228")}`, "Normal", '<w:next w:val="Head"/>') +
      style("Head", "Заголовок название", '<w:keepNext/><w:ind w:firstLine="0"/><w:jc w:val="center"/>', `<w:b/><w:bCs/>${color("1F497D")}`) +
      style("Lead", "Заголовок описание", "", `<w:b/><w:bCs/><w:i/><w:iCs/>${color("4F81BD")}`) +
      style("Hdr", "Колонтитул СЦ", '<w:ind w:firstLine="0"/><w:jc w:val="center"/>', `${color("B6DDE8")}${size(18)}`) +
      style("Ftr", "Нижний колонтитул", '<w:ind w:firstLine="0"/><w:jc w:val="center"/>', "") +
      "</w:styles>"
    );
  }

  // колонтитулы со 2-й страницы: название организации сверху справа, номер страницы снизу по центру
  const headerXml = (p) =>
    `${HEAD}<w:hdr ${NS}>${orgTable(orgLines(p.org), `<w:tblW w:w="2268" w:type="dxa"/><w:tblInd w:w="${TEXT_WIDTH - 2408}" w:type="dxa"/>`, { w: 2268, style: "Hdr" })}${para("Hdr")}</w:hdr>`;
  const footerXml = () => `${HEAD}<w:ftr ${NS}>${para("Ftr", field("PAGE", "2"))}</w:ftr>`;
  const blankHeader = () => `${HEAD}<w:hdr ${NS}>${para("Normal")}</w:hdr>`;
  const blankFooter = () => `${HEAD}<w:ftr ${NS}>${para("Normal")}</w:ftr>`;

  // ---------- минимальный zip (без сжатия) ----------
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }
  function zip(files) {
    const enc = new TextEncoder();
    const parts = [], central = [];
    let offset = 0;
    const u16 = (n) => [n & 255, (n >>> 8) & 255];
    const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    for (const [name, text] of files) {
      const nameB = enc.encode(name), data = enc.encode(text);
      const common = [
        ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc32(data)), ...u32(data.length), ...u32(data.length), ...u16(nameB.length), ...u16(0),
      ];
      const local = new Uint8Array([...u32(0x04034b50), ...common]);
      parts.push(local, nameB, data);
      central.push(
        new Uint8Array([...u32(0x02014b50), ...u16(20), ...common, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]),
        nameB
      );
      offset += local.length + nameB.length + data.length;
    }
    const cdSize = central.reduce((n, a) => n + a.length, 0);
    const end = new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(cdSize), ...u32(offset), ...u16(0),
    ]);
    return [...parts, ...central, end];
  }

  /**
   * p = {title, org, date, toc (false — без содержания), entries:[{site, date, author, title, paragraphs:[...], lead:[индексы], heads:[индексы]}]}
   * -> массив частей для Blob
   */
  function build(p) {
    const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    const CT = "application/vnd.openxmlformats-officedocument.wordprocessingml";
    return zip([
      ["[Content_Types].xml", `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="${CT}.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="${CT}.styles+xml"/><Override PartName="/word/settings.xml" ContentType="${CT}.settings+xml"/><Override PartName="/word/footer1.xml" ContentType="${CT}.footer+xml"/><Override PartName="/word/footer2.xml" ContentType="${CT}.footer+xml"/><Override PartName="/word/header1.xml" ContentType="${CT}.header+xml"/><Override PartName="/word/header2.xml" ContentType="${CT}.header+xml"/></Types>`],
      ["_rels/.rels", `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="word/document.xml"/></Relationships>`],
      ["word/document.xml", documentXml(p)],
      ["word/styles.xml", stylesXml()],
      // без updateFields: Word обновляет поля при открытии до разбивки на страницы и пишет «Стр.1»
      // во всём содержании — номера страниц уже посчитаны при сборке (pagesOf)
      ["word/settings.xml", `${HEAD}<w:settings ${NS}></w:settings>`],
      ["word/footer1.xml", footerXml()],
      ["word/footer2.xml", blankFooter()],
      ["word/header1.xml", headerXml(p)],
      ["word/header2.xml", blankHeader()],
      ["word/_rels/document.xml.rels", `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rId3" Type="${REL}/footer" Target="footer1.xml"/><Relationship Id="rId4" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rId5" Type="${REL}/header" Target="header2.xml"/><Relationship Id="rId6" Type="${REL}/footer" Target="footer2.xml"/></Relationships>`],
    ]);
  }

  return { build, pagesOf, measurer };
})();
if (typeof module === "object") module.exports = Docx;
