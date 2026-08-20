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

export function printBill() {
  window.print();
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
