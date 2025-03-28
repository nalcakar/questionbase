const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres:1234@localhost:5432/translate",
  ssl: process.env.DATABASE_URL?.includes("neon") ? { rejectUnauthorized: false } : false,
});

module.exports = pool;
