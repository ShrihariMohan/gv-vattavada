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
  @page { margin: 4mm; size: auto; }
  html, body { margin: 0; padding: 0; background: #fff; color: #111; }
  .bill-sheet { box-shadow: none !important; max-width: none !important; }
  .bill-sheet img { max-height: 52px; width: auto; margin: 0 auto; display: block; }
  .bill-sheet.thermal {
    width: 80mm; max-width: 80mm; padding: 2mm; margin: 0 auto;
    font-family: ui-monospace, monospace; font-size: 11px; box-shadow: none;
  }
  .bill-sheet.thermal img { max-height: 32px; }
`;

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

  doc.open();
  doc.write("<!DOCTYPE html><html><head><title>Bill</title>");
  doc.write(`<style>${THERMAL_PRINT_STYLES}</style>`);
  for (const sheet of document.querySelectorAll('link[rel="stylesheet"]')) {
    doc.head.appendChild(sheet.cloneNode(true));
  }
  doc.write("</head><body></body></html>");
  doc.close();

  doc.body.appendChild(el.cloneNode(true));

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 500);
  };
  win.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 10_000);

  win.focus();
  win.print();
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
