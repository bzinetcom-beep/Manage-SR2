/**
 * ساخت فایل Word (.docx) از HTML نامه — بدون وابستگی سنگین.
 * خروجی یک بسته‌ی استاندارد OOXML است که Word / LibreOffice / Google Docs باز می‌کنند.
 * پشتیبانی: پاراگراف، عنوان، پررنگ/ایتالیک/زیرخط، خط جدید، خط افقی، جدول ساده،
 * راست‌به‌چپ کامل (bidi + rtl) و فونت فارسی.
 */
import JSZip from "jszip";

interface RunStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number; // half-points
  color?: string;
}

interface ParaOpts {
  align?: "right" | "center" | "left" | "both";
  size?: number;
  bold?: boolean;
  spacingAfter?: number;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&zwnj;/g, "\u200c")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function runXml(text: string, st: RunStyle, font: string): string {
  if (!text) return "";
  const props = [
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>`,
    st.bold ? "<w:b/><w:bCs/>" : "",
    st.italic ? "<w:i/><w:iCs/>" : "",
    st.underline ? '<w:u w:val="single"/>' : "",
    st.color ? `<w:color w:val="${st.color}"/>` : "",
    `<w:sz w:val="${st.size ?? 24}"/><w:szCs w:val="${st.size ?? 24}"/>`,
    "<w:rtl/>",
  ].join("");
  const parts = text.split("\n");
  return parts
    .map(
      (p, i) =>
        `<w:r><w:rPr>${props}</w:rPr>${i > 0 ? "<w:br/>" : ""}<w:t xml:space="preserve">${esc(p)}</w:t></w:r>`,
    )
    .join("");
}

function paraXml(runs: string, o: ParaOpts = {}): string {
  const jc = o.align === "center" ? "center" : o.align === "left" ? "left" : o.align === "both" ? "both" : "right";
  return (
    `<w:p><w:pPr><w:bidi/><w:jc w:val="${jc}"/>` +
    `<w:spacing w:after="${o.spacingAfter ?? 120}" w:line="360" w:lineRule="auto"/>` +
    `</w:pPr>${runs}</w:p>`
  );
}

/** تبدیل یک قطعه‌ی inline HTML به run های Word */
function inlineToRuns(html: string, base: RunStyle, font: string): string {
  let out = "";
  const re = /<\/?([a-zA-Z0-9]+)[^>]*>/g;
  let last = 0;
  const stack: RunStyle[] = [base];
  let m: RegExpExecArray | null;
  const push = (txt: string) => {
    const clean = decodeEntities(txt).replace(/\s+/g, " ");
    if (clean.trim() === "" && !clean.includes("\n")) {
      if (clean === "") return;
    }
    if (clean) out += runXml(clean, stack[stack.length - 1], font);
  };
  while ((m = re.exec(html))) {
    push(html.slice(last, m.index));
    last = m.index + m[0].length;
    const tag = m[1].toLowerCase();
    const closing = m[0].startsWith("</");
    if (tag === "br") {
      out += `<w:r><w:br/></w:r>`;
      continue;
    }
    const cur = stack[stack.length - 1];
    if (!closing) {
      const next: RunStyle = { ...cur };
      if (tag === "b" || tag === "strong") next.bold = true;
      if (tag === "i" || tag === "em") next.italic = true;
      if (tag === "u") next.underline = true;
      stack.push(next);
    } else if (stack.length > 1) {
      stack.pop();
    }
  }
  push(html.slice(last));
  return out;
}

function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

function tableToXml(tableHtml: string, font: string): string {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((r) => r[1]);
  if (!rows.length) return "";
  const maxCols = Math.max(
    ...rows.map((r) => [...r.matchAll(/<(td|th)[^>]*>[\s\S]*?<\/\1>/gi)].length),
  );
  const colW = Math.floor(9360 / Math.max(1, maxCols));
  const grid = Array.from({ length: maxCols }, () => `<w:gridCol w:w="${colW}"/>`).join("");
  const body = rows
    .map((r) => {
      const cells = [...r.matchAll(/<(td|th)([^>]*)>([\s\S]*?)<\/\1>/gi)];
      const tc = cells
        .map((c) => {
          const isHead = c[1].toLowerCase() === "th";
          const runs = inlineToRuns(c[3], { bold: isHead, size: 22 }, font) || runXml(" ", { size: 22 }, font);
          const shade = isHead ? '<w:shd w:val="clear" w:fill="E8EEF4"/>' : "";
          return (
            `<w:tc><w:tcPr><w:tcW w:w="${colW}" w:type="dxa"/>${shade}` +
            `<w:vAlign w:val="center"/></w:tcPr>` +
            `<w:p><w:pPr><w:bidi/><w:jc w:val="center"/><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr>${runs}</w:p></w:tc>`
          );
        })
        .join("");
      return `<w:tr>${tc}</w:tr>`;
    })
    .join("");
  return (
    `<w:tbl><w:tblPr><w:bidiVisual/><w:tblW w:w="9360" w:type="dxa"/>` +
    `<w:jc w:val="center"/>` +
    `<w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"]
      .map((s) => `<w:${s} w:val="single" w:sz="6" w:space="0" w:color="808080"/>`)
      .join("") +
    `</w:tblBorders></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${body}</w:tbl>` +
    paraXml("", { spacingAfter: 80 })
  );
}

/** HTML → بدنه‌ی document.xml */
export function htmlToDocxBody(html: string, font: string): string {
  let out = "";
  // بلوک‌ها را به‌ترتیب پیمایش می‌کنیم
  const blockRe = /<(table|h1|h2|h3|h4|p|div|hr|ul|ol)([^>]*)>([\s\S]*?)<\/\1>|<hr\s*\/?>/gi;
  let idx = 0;
  let m: RegExpExecArray | null;
  const leftover = (txt: string) => {
    const t = stripTags(txt);
    if (t) out += paraXml(runXml(t, { size: 24 }, font));
  };
  while ((m = blockRe.exec(html))) {
    leftover(html.slice(idx, m.index));
    idx = m.index + m[0].length;
    const tag = (m[1] || "hr").toLowerCase();
    const attrs = m[2] || "";
    const inner = m[3] ?? "";
    const align: ParaOpts["align"] = /text-align\s*:\s*center/i.test(attrs)
      ? "center"
      : /text-align\s*:\s*left/i.test(attrs)
        ? "left"
        : /text-align\s*:\s*justify/i.test(attrs)
          ? "both"
          : "right";
    if (tag === "hr") {
      out +=
        `<w:p><w:pPr><w:bidi/><w:pBdr><w:bottom w:val="single" w:sz="12" w:space="1" w:color="14532D"/></w:pBdr>` +
        `<w:spacing w:after="160"/></w:pPr></w:p>`;
      continue;
    }
    if (tag === "table") {
      out += tableToXml(m[0], font);
      continue;
    }
    if (tag === "ul" || tag === "ol") {
      const items = [...inner.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)];
      items.forEach((li, i) => {
        const bullet = tag === "ol" ? `${i + 1}. ` : "• ";
        out += paraXml(runXml(bullet, { size: 24 }, font) + inlineToRuns(li[1], { size: 24 }, font), { align: "right" });
      });
      continue;
    }
    const isHeading = /^h[1-4]$/.test(tag);
    const bigger = /font-size\s*:\s*(\d+(?:\.\d+)?)pt/i.exec(attrs);
    const size = isHeading ? 32 : bigger ? Math.round(parseFloat(bigger[1]) * 2) : 24;
    const bold = isHeading || /font-weight\s*:\s*(700|800|bold)/i.test(attrs);
    // بلوک‌های تودرتو (مثل div حاوی table) بازگشتی پردازش می‌شوند
    if (/<(table|p|div|h[1-4]|ul|ol|hr)/i.test(inner)) {
      out += htmlToDocxBody(inner, font);
      continue;
    }
    const runs = inlineToRuns(inner, { size, bold }, font);
    if (runs) out += paraXml(runs, { align, spacingAfter: isHeading ? 200 : 140 });
  }
  leftover(html.slice(idx));
  return out || paraXml(runXml(" ", { size: 24 }, font));
}

export interface DocxOptions {
  pageSize?: string; // A4 | A5
  font?: string;
  title?: string;
}

/** ساخت بافر .docx از HTML (چند نامه با page-break جدا می‌شوند) */
export async function htmlToDocx(htmlPages: string[], opts: DocxOptions = {}): Promise<Buffer> {
  const font = opts.font || "B Nazanin";
  const a5 = (opts.pageSize || "A4").toUpperCase() === "A5";
  const pgW = a5 ? 8419 : 11906;
  const pgH = a5 ? 11906 : 16838;

  const bodies = htmlPages.map((h) => htmlToDocxBody(h, font));
  const pageBreak = `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  const content = bodies.join(pageBreak);

  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:body>${content}` +
    `<w:sectPr><w:pgSz w:w="${pgW}" w:h="${pgH}"/>` +
    `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>` +
    `<w:bidi/></w:sectPr></w:body></w:document>`;

  const stylesXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr>` +
    `<w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/>` +
    `<w:sz w:val="24"/><w:szCs w:val="24"/><w:rtl/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>` +
    `<w:pPr><w:bidi/><w:jc w:val="right"/></w:pPr></w:style></w:styles>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
    `<Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `</Types>`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
    `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
    `</Relationships>`;

  const docRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    `</Relationships>`;

  const core =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ` +
    `xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" ` +
    `xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${esc(opts.title || "نامه")}</dc:title>` +
    `<dc:creator>SRMS</dc:creator><cp:lastModifiedBy>SRMS</cp:lastModifiedBy>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>` +
    `</cp:coreProperties>`;

  const zip = new JSZip();
  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels")!.file(".rels", rels);
  zip.folder("docProps")!.file("core.xml", core);
  const word = zip.folder("word")!;
  word.file("document.xml", documentXml);
  word.file("styles.xml", stylesXml);
  word.folder("_rels")!.file("document.xml.rels", docRels);

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export function safeFileName(s: string): string {
  return (s || "letter").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 80);
}
