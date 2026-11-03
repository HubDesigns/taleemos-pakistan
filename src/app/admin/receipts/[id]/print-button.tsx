"use client";

import { btnCls } from "@/components/ui";

export function PrintButton() {
  return <button type="button" className={btnCls} onClick={() => window.print()}>Print or save as PDF</button>;
}
