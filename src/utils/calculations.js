// utils/calculations.js

function calculateTotals(items, discount = 0, taxRate = 0.08) {
  let total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let discountAmount = total * (discount / 100);
  let tax = (total - discountAmount) * taxRate;
  let finalAmount = total - discountAmount + tax;
  return { total, discountAmount, tax, finalAmount };
}

module.exports = calculateTotals;
