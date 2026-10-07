"use client";

import { toBlob } from "html-to-image";
import { toast } from "sonner";

export async function billElementToPngBlob(el: HTMLElement): Promise<Blob> {
  const blob = await toBlob(el, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
  });
  if (!blob) throw new Error("Could not render the bill image");
  return blob;
}

export async function copyBillImage(el: HTMLElement) {
  const blob = await billElementToPngBlob(el);
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    toast.success("Bill image copied", { description: "Paste it in WhatsApp, SMS, or email" });
    return;
  }
  downloadBlob(blob, "bill.png");
  toast.message("Copied images are not supported here — downloaded a PNG instead");
}

export async function shareBillImage(el: HTMLElement, title: string) {
  const blob = await billElementToPngBlob(el);
  const file = new File([blob], `${title.replace(/[^\w.-]+/g, "-")}.png`, { type: "image/png" });
  const nav = navigator as Navigator & { canShare?: (d: { files?: File[] }) => boolean };
  if (nav.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ title, files: [file], text: title });
    return;
  }
  await copyBillImage(el);
}

const THERMAL_PRINT_STYLES = `
  @page { margin: 2mm 2mm 6mm 2mm; size: 80mm auto; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  .bill-print-root { display: flex; justify-content: center; width: 100%; }
  .bill-sheet { box-shadow: none !important; ring: none !important; }
  .bill-sheet img { max-height: 52px; width: auto; margin: 0 auto; display: block; }
  .bill-sheet.thermal {
    width: 80mm; max-width: 80mm; padding: 1.5mm 1.5mm 8mm 1.5mm; margin: 0 auto;
    font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.3;
    box-shadow: none !important;
  }
  .bill-sheet.thermal img { max-height: 32px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .bill-sheet.thermal table { table-layout: fixed; width: 100%; border-collapse: collapse; }
  .bill-sheet.thermal td, .bill-sheet.thermal th { padding: 1px 2px; }
  .bill-sheet.thermal td:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bill-sheet.thermal td:last-child, .bill-sheet.thermal th:last-child { white-space: nowrap; }
  .bill-sheet.thermal .bill-footer { margin-top: 4px; padding-bottom: 4mm; }
`;

function absolutizePrintImages(root: ParentNode, baseHref: string) {
  for (const img of root.querySelectorAll("img")) {
    const src = img.getAttribute("src");
    if (!src || /^(?:https?:|data:|blob:)/i.test(src)) continue;
    img.setAttribute("src", new URL(src, baseHref).href);
  }
}

function waitForPrintImages(doc: Document): Promise<void> {
  const pending = Array.from(doc.images).filter((img) => !img.complete);
  if (!pending.length) return Promise.resolve();
  return Promise.all(
    pending.map(
      (img) =>
        new Promise<void>((resolve) => {
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        }),
    ),
  ).then(() => undefined);
}

/** Print only the bill element (thermal 80mm). Falls back to page print CSS when no target. */
export function printBill(source?: HTMLElement | null) {
  const el =
    source ??
    document.querySelector<HTMLElement>(".bill-print-only") ??
    document.querySelector<HTMLElement>(".bill-print-root");
  if (!el) {
    window.print();
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }

  const baseHref = `${window.location.origin}/`;
  doc.open();
  doc.write("<!DOCTYPE html><html><head><title>Bill</title>");
  doc.write(`<base href="${baseHref}">`);
  doc.write(`<style>${THERMAL_PRINT_STYLES}</style>`);
  for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
    doc.head.appendChild(sheet.cloneNode(true));
  }
  doc.write("</head><body></body></html>");
  doc.close();

  const clone = el.cloneNode(true) as HTMLElement;
  absolutizePrintImages(clone, baseHref);
  doc.body.appendChild(clone);

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 500);
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 10_000);

  void waitForPrintImages(doc).then(() => {
    win.focus();
    win.print();
  });
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
