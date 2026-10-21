"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
require("../domain.js");
const { calculateSale, stockStatus, isWithinInclusiveRange, projectStock, grossProfit } = globalThis.MotorPartsDomain;

test("calculates line totals, discounts, and INR totals to paise", () => {
  const result = calculateSale([
    { quantity: 2, unitPrice: 10.25 },
    { quantity: 1, unitPrice: 3.5 }
  ], 2);
  assert.deepEqual(result, {
    lines: [
      { quantity: 2, unitPrice: 10.25, lineTotal: 20.5 },
      { quantity: 1, unitPrice: 3.5, lineTotal: 3.5 }
    ],
    subtotal: 24,
    discount: 2,
    total: 22
  });
});

test("rejects empty carts, invalid quantities, and excessive discounts", () => {
  assert.throws(() => calculateSale([]), RangeError);
  assert.throws(() => calculateSale([{ quantity: 0, unitPrice: 10 }]), RangeError);
  assert.throws(() => calculateSale([{ quantity: 1.5, unitPrice: 10 }]), RangeError);
  assert.throws(() => calculateSale([{ quantity: 1, unitPrice: 10 }], 10.01), RangeError);
});

test("classifies out-of-stock and low-stock boundaries", () => {
  assert.equal(stockStatus(0, 0), "out");
  assert.equal(stockStatus(2, 2), "low");
  assert.equal(stockStatus(3, 2), "good");
});

test("uses inclusive report date boundaries", () => {
  assert.equal(isWithinInclusiveRange(100, 100, 200), true);
  assert.equal(isWithinInclusiveRange(200, 100, 200), true);
  assert.equal(isWithinInclusiveRange(201, 100, 200), false);
});

test("estimates gross profit after discounts from saved sale totals and cost snapshots", () => {
  const profit = grossProfit(
    [{ id: "sale-1", total: 20 }, { id: "sale-2", total: 15 }],
    [{ saleId: "sale-1", unitCost: 6, quantity: 2 }, { saleId: "sale-2", unitCost: 5, quantity: 1 }]
  );
  assert.equal(profit, 18);
});

test("reconstructs historical opening/closing and movement categories", () => {
  const movements = [
    { type: "opening", quantity: 8, timestamp: 50 },
    { type: "sale", quantity: -2, timestamp: 110 },
    { type: "received", quantity: 5, timestamp: 150 },
    { type: "damaged", quantity: -1, timestamp: 160 },
    { type: "sale", quantity: -3, timestamp: 250 }
  ];
  assert.deepEqual(projectStock(7, movements, 100, 200), {
    opening: 8,
    received: 5,
    sold: 2,
    returnsAndAdjustments: -1,
    closing: 10
  });
});
