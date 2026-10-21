"use strict";

(() => {
  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function calculateSale(lines, discount = 0) {
    if (!Array.isArray(lines) || lines.length === 0) throw new RangeError("A sale must contain at least one line.");
    const normalized = lines.map(line => {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new RangeError("Sale quantities must be positive whole numbers and prices cannot be negative.");
      }
      return { quantity, unitPrice: roundMoney(unitPrice), lineTotal: roundMoney(quantity * unitPrice) };
    });
    const subtotal = roundMoney(normalized.reduce((sum, line) => sum + line.lineTotal, 0));
    const normalizedDiscount = roundMoney(Number(discount));
    if (!Number.isFinite(normalizedDiscount) || normalizedDiscount < 0 || normalizedDiscount > subtotal) {
      throw new RangeError("Discount must be between zero and the subtotal.");
    }
    return { lines: normalized, subtotal, discount: normalizedDiscount, total: roundMoney(subtotal - normalizedDiscount) };
  }

  function stockStatus(quantity, minimum) {
    if (quantity <= 0) return "out";
    if (quantity <= minimum) return "low";
    return "good";
  }

  function isWithinInclusiveRange(timestamp, start, end) {
    return timestamp >= start && timestamp <= end;
  }

  function grossProfit(sales, lines) {
    return roundMoney(sales.reduce((sum, sale) => {
      const cost = lines
        .filter(line => line.saleId === sale.id)
        .reduce((subtotal, line) => subtotal + Number(line.unitCost || 0) * line.quantity, 0);
      return sum + sale.total - cost;
    }, 0));
  }

  function projectStock(currentQuantity, movements, start, end) {
    const periodMovements = movements.filter(move => isWithinInclusiveRange(move.timestamp, start, end));
    const afterPeriod = movements.filter(move => move.timestamp > end).reduce((sum, move) => sum + move.quantity, 0);
    const periodNet = periodMovements.reduce((sum, move) => sum + move.quantity, 0);
    const received = periodMovements
      .filter(move => move.type === "received" && move.quantity > 0)
      .reduce((sum, move) => sum + move.quantity, 0);
    const sold = Math.abs(periodMovements
      .filter(move => move.type === "sale" && move.quantity < 0)
      .reduce((sum, move) => sum + move.quantity, 0));
    return {
      opening: currentQuantity - afterPeriod - periodNet,
      received,
      sold,
      returnsAndAdjustments: periodNet - received + sold,
      closing: currentQuantity - afterPeriod
    };
  }

  globalThis.MotorPartsDomain = Object.freeze({ calculateSale, stockStatus, isWithinInclusiveRange, projectStock, grossProfit, roundMoney });
})();
