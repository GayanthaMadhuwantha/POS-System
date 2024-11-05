const sql = require("mssql");

const dbConfig = {
  database: "POS_System_DB",
  server: "DESKTOP-VF6EQU4\\SQLEXPRESS",
  options: {
    encrypt: false,
    trustServerCertificate: false,
  },
  pool: {
    idleTimeoutMillis: 30000, // Add idle timeout settings
    max: 10, // max connections
  },
  connectionTimeout: 30000, // Increase the connection timeout to 30 seconds
  driver: "msnodesqlv8",
};

async function connectToDatabase() {
  try {
    const pool = await sql.connect(dbConfig);
    console.log("Connected to the database");
    return pool;
  } catch (err) {
    console.error("Database connection failed", err);
  }
}

module.exports = connectToDatabase;
