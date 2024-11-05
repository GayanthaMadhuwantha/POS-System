const { ipcRenderer } = require("electron");

document.addEventListener("DOMContentLoaded", () => {
  loadProducts();
  showLowStockAlerts();
  loadAuditLogs();
});

// Load products for display
async function loadProducts() {
  const products = await ipcRenderer.invoke("fetch-products");
  const productList = document.getElementById("product-list");

  products.forEach((product) => {
    const productItem = document.createElement("div");
    productItem.textContent = `${product.ProductName} - $${product.Price}`;
    productList.appendChild(productItem);
  });
}

// Add product to sale table by barcode
async function addProduct() {
  const barcode = document.getElementById("product-barcode").value;
  const product = await ipcRenderer.invoke("fetch-product-by-barcode", barcode);

  if (product) {
    addItemToTable(product);
    calculateTotal();
  } else {
    alert("Product not found! Please try again.");
  }
}

// Add item row to the table
function addItemToTable(product) {
  const itemsTable = document.getElementById("items-table");
  const row = document.createElement("tr");
  row.innerHTML = `
      <td>${product.ProductName}</td>
      <td>$${product.Price.toFixed(2)}</td>
      <td><input type="number" value="1" min="1" class="quantity" onchange="updateItemTotal(this)"></td>
      <td class="item-total">$${product.Price.toFixed(2)}</td>
      <td><button onclick="removeItem(this)">Remove</button></td>
    `;
  itemsTable.appendChild(row);
  document.getElementById("product-barcode").value = "";
}

// Remove item row and update total
function removeItem(button) {
  const row = button.closest("tr");
  row.remove();
  calculateTotal();
}

// Calculate total, apply discount, and update UI
function calculateTotal() {
  const rows = document.querySelectorAll("#items-table tr");
  let total = 0;

  rows.forEach((row) => {
    const itemTotal = parseFloat(
      row.querySelector(".item-total").textContent.replace("$", "")
    );
    total += itemTotal;
  });

  document.getElementById("total-amount").textContent = total.toFixed(2);

  const discountPercent =
    parseFloat(document.getElementById("discount").value) || 0;
  const discountAmount = total * (discountPercent / 100);
  const discountedTotal = total - discountAmount;
  document.getElementById("discounted-total").textContent =
    discountedTotal.toFixed(2);
}

document.getElementById("discount").addEventListener("input", calculateTotal);

// Update item total and recalculate overall total
function updateItemTotal(quantityInput) {
  const row = quantityInput.closest("tr");
  const price = parseFloat(row.cells[1].textContent.replace("$", ""));
  const quantity = parseInt(quantityInput.value);
  const itemTotal = price * quantity;

  row.querySelector(".item-total").textContent = `$${itemTotal.toFixed(2)}`;
  calculateTotal();
}

// Calculate and display change
function calculateChange() {
  const totalAmount =
    parseFloat(document.getElementById("discounted-total").textContent) ||
    parseFloat(document.getElementById("total-amount").textContent);
  const amountGiven =
    parseFloat(document.getElementById("amount-given").value) || 0;
  const change = amountGiven - totalAmount;

  document.getElementById("change").textContent =
    change < 0 ? "Insufficient payment" : change.toFixed(2);
}

document
  .getElementById("amount-given")
  .addEventListener("input", calculateChange);

// Complete sale and save to database
document.getElementById("complete-sale").onclick = async function () {
  const items = Array.from(document.querySelectorAll("#items-table tr")).map(
    (row) => ({
      name: row.cells[0].textContent,
      price: parseFloat(row.cells[1].textContent.replace("$", "")),
      quantity: parseInt(row.querySelector(".quantity").value),
      total: parseFloat(
        row.querySelector(".item-total").textContent.replace("$", "")
      ),
    })
  );

  const totalAmount = parseFloat(
    document.getElementById("total-amount").textContent
  );
  const amountGiven = parseFloat(document.getElementById("amount-given").value);
  const change = parseFloat(document.getElementById("change").textContent);

  await ipcRenderer.invoke("record-sale", {
    items,
    totalAmount,
    amountGiven,
    change,
  });
  alert("Sale completed!");
};

// Print receipt
document.getElementById("print-bill").onclick = function () {
  const billWindow = window.open("", "Bill", "width=400,height=600");
  billWindow.document.write("<html><head><title>Bill</title></head><body>");
  billWindow.document.write("<h2>Receipt</h2>");
  billWindow.document.write(
    `<div>Total: $${document.getElementById("total-amount").textContent}</div>`
  );
  billWindow.document.write(
    `<div>Amount Given: $${document.getElementById("amount-given").value}</div>`
  );
  billWindow.document.write(
    `<div>Change: $${document.getElementById("change").textContent}</div>`
  );
  billWindow.document.write("</body></html>");
  billWindow.document.close();
  billWindow.print();
};

// Low Stock Alerts
async function showLowStockAlerts() {
  const lowStockItems = await ipcRenderer.invoke("check-low-stock");
  if (lowStockItems.length > 0) {
    alert(
      `Low stock alert! Reorder items: ${lowStockItems
        .map((item) => item.ProductName)
        .join(", ")}`
    );
  }
}

// Load audit logs
async function loadAuditLogs(filter) {
  const logs = await ipcRenderer.invoke("fetch-logs", filter);
  const tableBody = document
    .getElementById("auditLogTable")
    .getElementsByTagName("tbody")[0];
  tableBody.innerHTML = "";

  logs.forEach((log) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${log.LogID}</td>
      <td>${log.UserID}</td>
      <td>${log.ActionType}</td>
      <td>${log.Description}</td>
      <td>${log.Timestamp}</td>
    `;
    tableBody.appendChild(row);
  });
}

// Product Search
async function searchProducts() {
  const keyword = document.getElementById("searchBox").value;
  const results = await ipcRenderer.invoke("search-products", keyword);

  const resultList = document.getElementById("product-list");
  resultList.innerHTML = "";
  results.forEach((product) => {
    const item = document.createElement("div");
    item.textContent = `${product.ProductName} - $${product.Price} - Stock: ${product.QuantityInStock}`;
    resultList.appendChild(item);
  });
}

document.getElementById("searchBox").addEventListener("input", searchProducts);

// Customer Search by Email
async function searchCustomerByEmail(email) {
  const customer = await ipcRenderer.invoke("search-customer", email);
  if (customer) {
    displayCustomerInfo(customer);
  } else {
    alert("Customer not found");
  }
}

document.getElementById("search-customer-btn").addEventListener("click", () => {
  const email = document.getElementById("customer-email-input").value;
  searchCustomerByEmail(email);
});

// Display Customer Information
function displayCustomerInfo(customer) {
  const customerInfo = document.getElementById("customer-info");
  customerInfo.textContent = `Customer: ${customer.FirstName} ${customer.LastName}, Email: ${customer.Email}`;
}

// Customer Loyalty
async function loadCustomerLoyalty(customerID) {
  const loyaltyData = await ipcRenderer.invoke(
    "fetch-customer-loyalty",
    customerID
  );
  document.getElementById(
    "customer-loyalty-tier"
  ).textContent = `Loyalty Tier: ${loyaltyData.LoyaltyTier}`;
}

document
  .getElementById("checkloyaltyBox")
  .addEventListener("input", loadCustomerLoyalty);

async function addStock(productId, quantity, remarks) {
  const result = await ipcRenderer.invoke(
    "add-stock",
    productId,
    quantity,
    remarks
  );
  if (result.success) {
    alert(result.message);
  } else {
    alert(result.message);
  }
}

// Function to reduce stock
async function reduceStock(productId, quantity, remarks) {
  const result = await ipcRenderer.invoke(
    "reduce-stock",
    productId,
    quantity,
    remarks
  );
  if (result.success) {
    alert(result.message);
  } else {
    alert(result.message);
  }
}

// Example usage
document.getElementById("addStockButton").addEventListener("click", () => {
  const productId = parseInt(document.getElementById("productId").value);
  const quantity = parseInt(document.getElementById("quantity").value);
  const remarks = document.getElementById("remarks").value;
  addStock(productId, quantity, remarks);
});

document.getElementById("reduceStockButton").addEventListener("click", () => {
  const productId = parseInt(document.getElementById("productId").value);
  const quantity = parseInt(document.getElementById("quantity").value);
  const remarks = document.getElementById("remarks").value;
  reduceStock(productId, quantity, remarks);
});

async function generatePurchaseOrders() {
  const result = await ipcRenderer.invoke("generate-purchase-orders");
  alert(result.message);
}

// Function to fetch pending purchase orders
async function fetchPendingOrders() {
  const orders = await ipcRenderer.invoke("fetch-pending-orders");
  // Display the orders in your UI (e.g., in a table)
  console.log(orders);
}

// Example usage
document
  .getElementById("generateOrdersButton")
  .addEventListener("click", generatePurchaseOrders);
document
  .getElementById("fetchOrdersButton")
  .addEventListener("click", fetchPendingOrders);

async function addBatch(productId, supplierId, quantity, expiryDate) {
  const result = await ipcRenderer.invoke(
    "add-batch",
    productId,
    supplierId,
    quantity,
    expiryDate
  );
  alert(result.message);
}

// Function to fetch expiring products
async function fetchExpiringProducts(daysBeforeExpiry) {
  const products = await ipcRenderer.invoke(
    "fetch-expiring-products",
    daysBeforeExpiry
  );
  // Display the products in your UI (e.g., in a table)
  console.log(products);
}

// Example usage
document.getElementById("addBatchButton").addEventListener("click", () => {
  const productId = parseInt(document.getElementById("productId").value);
  const supplierId = parseInt(document.getElementById("supplierId").value);
  const quantity = parseInt(document.getElementById("quantity").value);
  const expiryDate = document.getElementById("expiryDate").value;
  addBatch(productId, supplierId, quantity, expiryDate);
});

document.getElementById("fetchExpiringButton").addEventListener("click", () => {
  const daysBeforeExpiry = parseInt(
    document.getElementById("daysBeforeExpiry").value
  );
  fetchExpiringProducts(daysBeforeExpiry);
});

async function logInventoryTransaction(
  productId,
  transactionType,
  quantity,
  remarks
) {
  const result = await ipcRenderer.invoke(
    "log-inventory-transaction",
    productId,
    transactionType,
    quantity,
    remarks
  );
  alert(result.message);
}

// Function to generate the inventory audit report
async function generateInventoryAuditReport() {
  const report = await ipcRenderer.invoke("generate-inventory-audit-report");
  console.log(report);
  // Display the report in your UI (e.g., in a table)
}

// Example usage
document
  .getElementById("logTransactionButton")
  .addEventListener("click", () => {
    const productId = parseInt(
      document.getElementById("transactionProductId").value
    );
    const transactionType = document.getElementById("transactionType").value; // 'Sale', 'Adjustment', etc.
    const quantity = parseInt(
      document.getElementById("transactionQuantity").value
    );
    const remarks = document.getElementById("transactionRemarks").value;
    logInventoryTransaction(productId, transactionType, quantity, remarks);
  });

document
  .getElementById("generateReportButton")
  .addEventListener("click", () => {
    generateInventoryAuditReport();
  });

// Function to forecast sales
async function forecastSales(productId, startDate, endDate, forecastPeriod) {
  const result = await ipcRenderer.invoke(
    "forecast-sales",
    productId,
    startDate,
    endDate,
    forecastPeriod
  );
  console.log("Sales Forecast:", result);
  // Display the result in your UI (e.g., in a chart or table)
}

// Function to forecast stock usage
async function forecastStockUsage(productId, leadTime) {
  const result = await ipcRenderer.invoke(
    "forecast-stock-usage",
    productId,
    leadTime
  );
  console.log("Stock Usage Forecast:", result);
  // Display the result in your UI (e.g., in a table)
}

// Example usage
document.getElementById("forecastSalesButton").addEventListener("click", () => {
  const productId = parseInt(
    document.getElementById("forecastProductId").value
  );
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;
  const forecastPeriod = parseInt(
    document.getElementById("forecastPeriod").value
  );
  forecastSales(productId, startDate, endDate, forecastPeriod);
});

document
  .getElementById("forecastStockUsageButton")
  .addEventListener("click", () => {
    const productId = parseInt(
      document.getElementById("stockUsageProductId").value
    );
    const leadTime = parseInt(document.getElementById("leadTime").value);
    forecastStockUsage(productId, leadTime);
  });

// Function to get inventory overview
async function loadInventoryOverview() {
  const result = await ipcRenderer.invoke("get-inventory-overview");
  console.log("Inventory Overview:", result);
  // Display the result in your UI (e.g., in a table)
}

// Function to get stock aging report
async function loadStockAgingReport() {
  const result = await ipcRenderer.invoke("get-stock-aging-report");
  console.log("Stock Aging Report:", result);
  // Display the result in your UI (e.g., in a table)
}

// Function to get customizable stock report
async function loadCustomStockReport(startDate, endDate, category, supplierId) {
  const result = await ipcRenderer.invoke(
    "custom-stock-report",
    startDate,
    endDate,
    category,
    supplierId
  );
  console.log("Custom Stock Report:", result);
  // Display the result in your UI (e.g., in a table)
}

// Example usage
document
  .getElementById("loadOverviewButton")
  .addEventListener("click", loadInventoryOverview);
document
  .getElementById("loadStockAgingButton")
  .addEventListener("click", loadStockAgingReport);
document
  .getElementById("loadCustomReportButton")
  .addEventListener("click", () => {
    const startDate = document.getElementById("customStartDate").value;
    const endDate = document.getElementById("customEndDate").value;
    const category = document.getElementById("customCategory").value;
    const supplierId = parseInt(
      document.getElementById("customSupplierId").value
    );
    loadCustomStockReport(startDate, endDate, category, supplierId);
  });

async function fetchSalesReport(startDate, endDate) {
  const salesReport = await ipcRenderer.invoke(
    "get-sales-report",
    startDate,
    endDate
  );
  console.log(salesReport);
  // Code to display the report in your UI
}

async function fetchInventoryReport() {
  const inventoryReport = await ipcRenderer.invoke("get-inventory-report");
  console.log(inventoryReport);
  // Code to display the inventory report in your UI
}

async function fetchFinancialReport(startDate, endDate) {
  const financialReport = await ipcRenderer.invoke(
    "get-financial-report",
    startDate,
    endDate
  );
  console.log(financialReport);
  // Code to display the financial report in your UI
}

async function handleReturn(transactionID, productID, quantity, reason) {
  const response = await ipcRenderer.invoke(
    "process-return",
    transactionID,
    productID,
    quantity,
    reason
  );
  alert(response.message); // Alert or display success message
}

async function handleRefund(returnID, refundAmount, method) {
  const response = await ipcRenderer.invoke(
    "process-refund",
    returnID,
    refundAmount,
    method
  );
  alert(response.message); // Alert or display success message
}
