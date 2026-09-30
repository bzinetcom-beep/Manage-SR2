"use client";

/**
 * تولید PDF در سمت مرورگر.
 * چون متن فارسی/راست‌به‌چپ در کتابخانه‌های PDF سمت سرور به‌درستی شکل نمی‌گیرد،
 * صفحه‌ی نامه توسط موتور رندر مرورگر تصویربرداری شده و در PDF قرار می‌گیرد؛
 * نتیجه‌ی آن، فارسیِ کاملاً صحیح و مطابق پیش‌نمایش است.
 */

export interface PdfLetter {
  id: number;
  fileName: string;
  html: string;
  pageSize?: string;
}

const MM: Record<string, { w: number; h: number }> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
};

function buildNode(html: string, widthMm: number): HTMLDivElement {
  const host = document.createElement("div");
  host.setAttribute("dir", "rtl");
  host.style.cssText = [
    "position:fixed",
    "top:0",
    "left:-10000px",
    `width:${widthMm}mm`,
    "padding:15mm",
    "background:#ffffff",
    "color:#000000",
    "font-family:Vazirmatn, Tahoma, sans-serif",
    "font-size:12pt",
    "line-height:2",
    "box-sizing:border-box",
    "z-index:-1",
  ].join(";");
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

/** تولید یک فایل PDF شامل همه‌ی نامه‌های داده‌شده (هر نامه در صفحه‌ی جدا) */
export async function lettersToPdfBlob(items: PdfLetter[], onProgress?: (done: number, total: number) => void) {
  const { jsPDF } = await import("jspdf");
  const html2canvas = (await import("html2canvas-pro")).default;

  const size = MM[(items[0]?.pageSize || "A4").toUpperCase()] || MM.A4;
  const pdf = new jsPDF({ unit: "mm", format: [size.w, size.h], orientation: "portrait" });

  for (let i = 0; i < items.length; i++) {
    const node = buildNode(items[i].html, size.w);
    try {
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const img = canvas.toDataURL("image/jpeg", 0.94);
      const imgH = (canvas.height * size.w) / canvas.width;
      if (i > 0) pdf.addPage([size.w, size.h], "portrait");
      let remaining = imgH;
      let offset = 0;
      // اگر محتوا بلندتر از یک صفحه بود، به صفحات بعدی سرریز می‌شود
      while (remaining > 0) {
        pdf.addImage(img, "JPEG", 0, -offset, size.w, imgH, undefined, "FAST");
        remaining -= size.h;
        offset += size.h;
        if (remaining > 0) pdf.addPage([size.w, size.h], "portrait");
      }
    } finally {
      node.remove();
    }
    onProgress?.(i + 1, items.length);
  }
  return pdf.output("blob");
}

/** دانلود یک PDF واحد */
export async function downloadMergedPdf(items: PdfLetter[], fileName: string, onProgress?: (d: number, t: number) => void) {
  const blob = await lettersToPdfBlob(items, onProgress);
  triggerDownload(blob, fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`);
}

/** دانلود ZIP شامل یک PDF مجزا برای هر نامه */
export async function downloadPdfZip(items: PdfLetter[], zipName: string, onProgress?: (d: number, t: number) => void) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (let i = 0; i < items.length; i++) {
    const blob = await lettersToPdfBlob([items[i]]);
    zip.file(`${items[i].fileName}.pdf`, blob);
    onProgress?.(i + 1, items.length);
  }
  const out = await zip.generateAsync({ type: "blob" });
  triggerDownload(out, zipName.endsWith(".zip") ? zipName : `${zipName}.zip`);
}

export function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}
