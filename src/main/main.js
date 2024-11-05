const { ipcMain, app, BrowserWindow } = require("electron");
const connectToDatabase = require("./dbConnection");
const sql = require("mssql");

async function createWindow() {
  const win = new BrowserWindow({
    width: 1350,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
    },
  });

  win.loadFile("src/renderer/index.html");

  // Test database connection on start
  await connectToDatabase();
}

app.whenReady().then(createWindow);

// Fetch all products
ipcMain.handle("fetch-products", async () => {
  try {
    const pool = await connectToDatabase();
    const result = await pool.request().query("SELECT * FROM Products");
    pool.close(); // Close connection after query
    return result.recordset;
  } catch (error) {
    console.error("Error fetching products:", error);
    throw error;
  }
});

// Fetch product by barcode
ipcMain.handle("fetch-product-by-barcode", async (event, barcode) => {
  try {
    const pool = await connectToDatabase();
    const result = await pool
      .request()
      .input("Barcode", sql.VarChar, barcode)
      .query("SELECT * FROM Products WHERE Barcode = @Barcode");
    pool.close(); // Close connection after query
    return result.recordset[0];
  } catch (error) {
    console.error("Error fetching product by barcode:", error);
    throw error;
  }
});

// Check low stock
ipcMain.handle("check-low-stock", async () => {
  try {
    const pool = await connectToDatabase();
    const result = await pool.request().execute("CheckLowStock");
    pool.close(); // Close connection after query
    return result.recordset; // Returns products that need restocking
  } catch (error) {
    console.error("Error checking low stock:", error);
    throw error;
  }
});

// Search products by keyword
ipcMain.handle("search-products", async (event, keyword) => {
  try {
    const pool = await connectToDatabase();
    const result = await pool
      .request()
      .input("Keyword", sql.VarChar, keyword)
      .execute("SearchProducts");
    pool.close(); // Close connection after query
    return result.recordset;
  } catch (error) {
    console.error("Error searching products:", error);
    throw error;
  }
});

// Search customer by email
ipcMain.handle("search-customer", async (event, email) => {
  try {
    const pool = await connectToDatabase();
    const result = await pool
      .request()
      .input("Email", sql.NVarChar, email)
      .execute("SearchCustomerByEmail");
    pool.close(); // Close connection after query
    return result.recordset[0] || null; // Return first match or null if not found
  } catch (error) {
    console.error("Error searching customer:", error);
    throw error;
  }
});

// Record a sale and update customer loyalty
ipcMain.handle("record-sale", async (event, saleData) => {
  const { customerID, items, totalAmount, discountAmount, tax, finalAmount } =
    saleData;

  try {
    const pool = await connectToDatabase();
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    try {
      const saleRequest = new sql.Request(transaction);
      saleRequest.input("CustomerID", sql.Int, customerID);
      saleRequest.input("TotalAmount", sql.Decimal(10, 2), totalAmount);
      saleRequest.input("DiscountAmount", sql.Decimal(10, 2), discountAmount);
      saleRequest.input("Tax", sql.Decimal(10, 2), tax);
      saleRequest.input("FinalAmount", sql.Decimal(10, 2), finalAmount);

      const saleResult = await saleRequest.execute("RecordSale");
      const saleID = saleResult.returnValue;

      for (let item of items) {
        const itemRequest = new sql.Request(transaction);
        itemRequest.input("SaleID", sql.Int, saleID);
        itemRequest.input("ProductID", sql.Int, item.productID);
        itemRequest.input("Quantity", sql.Int, item.quantity);
        itemRequest.input("Price", sql.Decimal(10, 2), item.price);
        await itemRequest.query(`
          INSERT INTO SalesItems (SaleID, ProductID, Quantity, Price) 
          VALUES (@SaleID, @ProductID, @Quantity, @Price);
        `);
      }

      const loyaltyRequest = new sql.Request(transaction);
      loyaltyRequest.input("CustomerID", sql.Int, customerID);
      loyaltyRequest.input("AmountSpent", sql.Decimal(10, 2), finalAmount);
      await loyaltyRequest.execute("UpdateCustomerLoyalty");

      await transaction.commit();
      pool.close();
      return { success: true, saleID };
    } catch (error) {
      await transaction.rollback();
      pool.close();
      console.error("Transaction error:", error);
      throw error;
    }
  } catch (error) {
    console.error("Database error:", error);
    throw error;
  }
});

// Fetch customer loyalty
ipcMain.handle("fetch-customer-loyalty", async (event, customerID) => {
  try {
    const pool = await connectToDatabase();
    const result = await pool
      .request()
      .input("CustomerID", sql.Int, customerID)
      .query(
        "SELECT LoyaltyTier FROM Customers WHERE CustomerID = @CustomerID"
      );
    pool.close();
    return result.recordset[0];
  } catch (error) {
    console.error("Error fetching customer loyalty:", error);
    throw error;
  }
});

// Record audit log
ipcMain.handle("log-action", async (event, logData) => {
  const { userID, actionType, description } = logData;
  try {
    const pool = await connectToDatabase();
    await pool
      .request()
      .input("UserID", sql.Int, userID)
      .input("ActionType", sql.NVarChar(50), actionType)
      .input("Description", sql.NVarChar(255), description)
      .execute("sp_InsertAuditLog");
    pool.close();
    console.log("Audit log recorded successfully.");
  } catch (error) {
    console.error("Error recording audit log:", error);
    throw error;
  }
});

// Fetch audit logs
ipcMain.handle("fetch-logs", async (event, filter) => {
  try {
    const pool = await connectToDatabase();
    const request = pool.request();

    if (filter && filter.actionType) {
      request.input("ActionType", sql.NVarChar(50), filter.actionType);
      const result = await request.query(
        "SELECT * FROM AuditLog WHERE ActionType = @ActionType"
      );
      pool.close();
      return result.recordset;
    } else {
      const result = await request.query("SELECT * FROM AuditLog");
      pool.close();
      return result.recordset;
    }
  } catch (error) {
    console.error("Error fetching audit logs:", error);
    throw error;
  }
});

ipcMain.handle("add-stock", async (event, productId, quantity, remarks) => {
  try {
    const pool = await connectToDatabase();
    const request = pool.request();
    request.input("ProductID", sql.Int, productId);
    request.input("Quantity", sql.Int, quantity);
    request.input("Remarks", sql.NVarChar, remarks);
    await request.execute("AddStock");
    return { success: true, message: "Stock added successfully." };
  } catch (error) {
    console.error("AddStock error:", error);
    return { success: false, message: "Error adding stock." };
  }
});

// Handle stock reduction
ipcMain.handle("reduce-stock", async (event, productId, quantity, remarks) => {
  try {
    const pool = await connectToDatabase();
    const request = pool.request();
    request.input("ProductID", sql.Int, productId);
    request.input("Quantity", sql.Int, quantity);
    request.input("Remarks", sql.NVarChar, remarks);
    await request.execute("ReduceStock");
    return { success: true, message: "Stock reduced successfully." };
  } catch (error) {
    console.error("ReduceStock error:", error);
    return { success: false, message: "Error reducing stock." };
  }
});

ipcMain.handle("generate-purchase-orders", async (event) => {
  try {
    const pool = await connectToDatabase();
    const request = pool.request();
    await request.execute("GeneratePurchaseOrders");
    return {
      success: true,
      message: "Purchase orders generated successfully.",
    };
  } catch (error) {
    console.error("GeneratePurchaseOrders error:", error);
    return { success: false, message: "Error generating purchase orders." };
  }
});

// Handle fetching pending purchase orders
ipcMain.handle("fetch-pending-orders", async (event) => {
  try {
    const pool = await connectToDatabase();
    const request = pool.request();
    const result = await request.query("SELECT * FROM PendingPurchaseOrders");
    return result.recordset;
  } catch (error) {
    console.error("FetchPendingOrders error:", error);
    return [];
  }
});

ipcMain.handle(
  "add-batch",
  async (event, productId, supplierId, quantity, expiryDate) => {
    try {
      const request = new sql.Request(dbConnection);
      request.input("ProductID", sql.Int, productId);
      request.input("SupplierID", sql.Int, supplierId);
      request.input("Quantity", sql.Int, quantity);
      request.input("ExpiryDate", sql.Date, expiryDate);
      await request.execute("AddBatch");
      return { success: true, message: "Batch added successfully." };
    } catch (error) {
      console.error("AddBatch error:", error);
      return { success: false, message: "Error adding batch." };
    }
  }
);

// Handle fetching expiring products
ipcMain.handle("fetch-expiring-products", async (event, daysBeforeExpiry) => {
  try {
    const request = new sql.Request(dbConnection);
    request.input("DaysBeforeExpiry", sql.Int, daysBeforeExpiry);
    const result = await request.execute("GetExpiringProducts");
    return result.recordset;
  } catch (error) {
    console.error("FetchExpiringProducts error:", error);
    return [];
  }
});

ipcMain.handle(
  "log-inventory-transaction",
  async (event, productId, transactionType, quantity, remarks) => {
    try {
      const request = new sql.Request(dbConnection);
      request.input("ProductID", sql.Int, productId);
      request.input("TransactionType", sql.VarChar(50), transactionType);
      request.input("Quantity", sql.Int, quantity);
      request.input("Remarks", sql.NVarChar(255), remarks);
      await request.execute("LogInventoryTransaction");
      return { success: true, message: "Transaction logged successfully." };
    } catch (error) {
      console.error("LogInventoryTransaction error:", error);
      return { success: false, message: "Error logging transaction." };
    }
  }
);

// Handle generating inventory audit report
ipcMain.handle("generate-inventory-audit-report", async () => {
  try {
    const request = new sql.Request(dbConnection);
    const result = await request.execute("GenerateInventoryAuditReport");
    return result.recordset;
  } catch (error) {
    console.error("GenerateInventoryAuditReport error:", error);
    return [];
  }
});

ipcMain.handle(
  "forecast-sales",
  async (event, productId, startDate, endDate, forecastPeriod) => {
    try {
      const request = new sql.Request(dbConnection);
      request.input("ProductID", sql.Int, productId);
      request.input("StartDate", sql.DateTime, startDate);
      request.input("EndDate", sql.DateTime, endDate);
      request.input("ForecastPeriod", sql.Int, forecastPeriod);

      const result = await request.execute("ForecastSales");
      return result.recordset;
    } catch (error) {
      console.error("ForecastSales error:", error);
      return [];
    }
  }
);

// Handle stock usage forecasting
ipcMain.handle("forecast-stock-usage", async (event, productId, leadTime) => {
  try {
    const request = new sql.Request(dbConnection);
    request.input("ProductID", sql.Int, productId);
    request.input("LeadTime", sql.Int, leadTime);

    const result = await request.execute("ForecastStockUsage");
    return result.recordset;
  } catch (error) {
    console.error("ForecastStockUsage error:", error);
    return [];
  }
});

ipcMain.handle("get-inventory-overview", async () => {
  try {
    const request = new sql.Request(dbConnection);
    const result = await request.query("SELECT * FROM InventoryOverview");
    return result.recordset;
  } catch (error) {
    console.error("get-inventory-overview error:", error);
    return [];
  }
});

// Handle stock aging report
ipcMain.handle("get-stock-aging-report", async () => {
  try {
    const request = new sql.Request(dbConnection);
    const result = await request.execute("StockAgingReport");
    return result.recordset;
  } catch (error) {
    console.error("get-stock-aging-report error:", error);
    return [];
  }
});

// Handle customizable stock report
ipcMain.handle(
  "custom-stock-report",
  async (event, startDate, endDate, category, supplierId) => {
    try {
      const request = new sql.Request(dbConnection);
      request.input("StartDate", sql.DateTime, startDate);
      request.input("EndDate", sql.DateTime, endDate);
      request.input("Category", sql.NVarChar, category);
      request.input("SupplierID", sql.Int, supplierId);

      const result = await request.execute("CustomStockReport");
      return result.recordset;
    } catch (error) {
      console.error("custom-stock-report error:", error);
      return [];
    }
  }
);

ipcMain.handle("get-sales-report", async (event, startDate, endDate) => {
  try {
    const pool = await sql.connect(yourSqlConfig);
    const result = await pool
      .request()
      .input("StartDate", sql.DateTime, startDate)
      .input("EndDate", sql.DateTime, endDate)
      .execute("GetSalesReport");

    return result.recordset; // Return the report data
  } catch (error) {
    console.error("Error getting sales report:", error);
    throw error;
  }
});

ipcMain.handle("get-inventory-report", async () => {
  try {
    const pool = await sql.connect(yourSqlConfig);
    const result = await pool.request().execute("GetInventoryReport");

    return result.recordset; // Return the inventory report data
  } catch (error) {
    console.error("Error getting inventory report:", error);
    throw error;
  }
});

ipcMain.handle("get-financial-report", async (event, startDate, endDate) => {
  try {
    const pool = await sql.connect(yourSqlConfig);
    const result = await pool
      .request()
      .input("StartDate", sql.DateTime, startDate)
      .input("EndDate", sql.DateTime, endDate)
      .execute("GetFinancialReport");

    return result.recordset; // Return the financial report data
  } catch (error) {
    console.error("Error getting financial report:", error);
    throw error;
  }
});

ipcMain.handle(
  "process-return",
  async (event, transactionID, productID, quantity, reason) => {
    try {
      const pool = await sql.connect(yourSqlConfig);
      await pool
        .request()
        .input("TransactionID", sql.Int, transactionID)
        .input("ProductID", sql.Int, productID)
        .input("Quantity", sql.Int, quantity)
        .input("Reason", sql.NVarChar, reason)
        .execute("ProcessReturn");

      return { success: true, message: "Return processed successfully." };
    } catch (error) {
      console.error("Error processing return:", error);
      throw error;
    }
  }
);

ipcMain.handle(
  "process-refund",
  async (event, returnID, refundAmount, method) => {
    try {
      const pool = await sql.connect(yourSqlConfig);
      await pool
        .request()
        .input("ReturnID", sql.Int, returnID)
        .input("RefundAmount", sql.Decimal(18, 2), refundAmount)
        .input("Method", sql.NVarChar, method)
        .execute("ProcessRefund");

      return { success: true, message: "Refund processed successfully." };
    } catch (error) {
      console.error("Error processing refund:", error);
      throw error;
    }
  }
);
