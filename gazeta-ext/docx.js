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

  function documentXml(p) {
    let b = "";
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
    p.entries.forEach((e, i) => {
      for (const s of [e.site, e.date]) if (s && s.trim()) b += para("Source", run(s, SMALL));
      b += para(
        "Head",
        `${run(e.title, SMALL)}<w:r><w:rPr>${SMALL}<w:u w:val="single"/></w:rPr><w:tab/></w:r>${run("Стр.", SMALL)}${field(`PAGEREF ${bookmark(i)} \\h`, "", SMALL)}`,
        `<w:tabs><w:tab w:val="left" w:pos="${PAGE_NO_TAB}"/></w:tabs><w:ind w:right="${TEXT_WIDTH - PAGE_NO_TAB}"/><w:jc w:val="left"/>`
      );
      for (const k of e.lead) b += para("Lead", run(e.paragraphs[k], SMALL));
      b += para("Source");
    });
    b += para("Normal") + '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

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
   * p = {title, org, date, entries:[{site, date, author, title, paragraphs:[...], lead:[индексы], heads:[индексы]}]}
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
      // updateFields: Word при открытии пересчитает номера страниц «Стр.N» в содержании
      ["word/settings.xml", `${HEAD}<w:settings ${NS}><w:updateFields w:val="true"/></w:settings>`],
      ["word/footer1.xml", footerXml()],
      ["word/footer2.xml", blankFooter()],
      ["word/header1.xml", headerXml(p)],
      ["word/header2.xml", blankHeader()],
      ["word/_rels/document.xml.rels", `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/styles" Target="styles.xml"/><Relationship Id="rId2" Type="${REL}/settings" Target="settings.xml"/><Relationship Id="rId3" Type="${REL}/footer" Target="footer1.xml"/><Relationship Id="rId4" Type="${REL}/header" Target="header1.xml"/><Relationship Id="rId5" Type="${REL}/header" Target="header2.xml"/><Relationship Id="rId6" Type="${REL}/footer" Target="footer2.xml"/></Relationships>`],
    ]);
  }

  return { build };
})();
if (typeof module === "object") module.exports = Docx;
