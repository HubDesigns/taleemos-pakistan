// Payment allocation across invoices. Amounts are integer paisa (bigint).

export interface OpenInvoice {
  id: string;
  dueDate: Date;
  outstanding: bigint;
}

export interface Allocation {
  invoiceId: string;
  amount: bigint;
}

export interface AllocationResult {
  allocations: Allocation[];
  /** Amount left after all invoices are settled; recorded as credit, never silently dropped. */
  unallocated: bigint;
}

/** Oldest due date first; ties broken by id so the result is deterministic. */
export function allocatePayment(payment: bigint, invoices: readonly OpenInvoice[]): AllocationResult {
  if (payment <= 0n) throw new Error("Payment must be greater than zero");
  const ordered = [...invoices]
    .filter((i) => i.outstanding > 0n)
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.id.localeCompare(b.id));

  let remaining = payment;
  const allocations: Allocation[] = [];
  for (const inv of ordered) {
    if (remaining === 0n) break;
    const amount = remaining < inv.outstanding ? remaining : inv.outstanding;
    allocations.push({ invoiceId: inv.id, amount });
    remaining -= amount;
  }
  return { allocations, unallocated: remaining };
}
