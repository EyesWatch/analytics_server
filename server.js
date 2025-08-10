// Simple analytics server for QuantFrame
//
// This Express application exposes a handful of HTTP endpoints that mirror a
// subset of the QuantFrame API.  Instead of calling the hosted service at
// api.quantframe.app, the app reads directly from your local SQLite
// database (quantframeV2.sqlite) and computes aggregate statistics for
// transactions.  The data model used here is an approximation of the
// underlying tables – you may need to adjust the SQL queries to match your
// actual schema.
//
// Endpoints provided:
//   GET /stats/users  -> returns profit/revenue metrics grouped by user
//   GET /stats/rivens -> returns profit/revenue metrics grouped by riven item
//
// To run the server: `npm install` then `npm start`.  By default it listens
// on port 3000.  You can change the port by setting the PORT environment
// variable.  After the server is running, modify the QuantFrame Tauri
// backend (`src-tauri/src/qf_client/client.rs`) to point the `endpoint_dev`
// (or `endpoint`) to `http://localhost:3000/` so that analytics requests
// hit this server instead of the hosted API.

import express from 'express';
import Database from 'better-sqlite3';

const app = express();
const PORT = process.env.PORT || 3000;

// Path to your QuantFrame SQLite database.  In a standard installation
// QuantFrame stores the DB in the app data directory under the name
// `quantframeV2.sqlite`.  You may need to adjust this path based on your
// installation.  The server opens the database in read‑only mode.
const DB_PATH = process.env.QUANTFRAME_DB_PATH ||
  `${process.env.HOME || process.env.USERPROFILE}/AppData/Local/dev.kenya.quantframe/quantframeV2.sqlite`;

let db;
try {
  db = new Database(DB_PATH, { readonly: true });
  console.log(`Connected to QuantFrame database at ${DB_PATH}`);
} catch (e) {
  console.error(`Failed to open database: ${e.message}`);
  process.exit(1);
}

/**
 * Fetches all transactions from the database.
 *
 * This function assumes there is a table named `transactions` with
 * at least the following columns:
 *   - id (INTEGER)
 *   - ingame_name (TEXT)   : the name of the user associated with the transaction
 *   - item_type (TEXT)     : e.g. "riven" or "item"
 *   - item_name (TEXT)     : the human readable item name
 *   - transaction_type (TEXT) : either "purchase" or "sale"
 *   - price (INTEGER)      : the platinum value of the transaction
 *   - quantity (INTEGER)   : the number of items traded
 *   - created_at (TEXT)    : ISO timestamp of the transaction
 *
 * If your schema differs, adjust the SELECT statement accordingly.  The
 * result is returned as an array of plain JavaScript objects.
 */
function getAllTransactions() {
  const stmt = db.prepare(
    `SELECT id, ingame_name, item_type, item_name, transaction_type, price, quantity, created_at
     FROM transactions`
  );
  return stmt.all().map(row => ({
    ...row,
    price: Number(row.price),
    quantity: Number(row.quantity),
    created_at: new Date(row.created_at)
  }));
}

/**
 * Computes aggregate metrics grouped by a user (ingame_name).
 *
 * Returns an array of objects sorted by descending profit.  Each object
 * contains profit, revenue, expense, number_of_trades, purchases, sales,
 * profit_margin, and the username.
 */
function getUserStatistics() {
  const txs = getAllTransactions();
  const groups = new Map();
  for (const tx of txs) {
    const key = tx.ingame_name || 'Unknown';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  const result = [];
  for (const [user, list] of groups.entries()) {
    let revenue = 0;
    let expense = 0;
    let purchases = 0;
    let sales = 0;
    for (const tx of list) {
      if (tx.transaction_type === 'sale') {
        revenue += tx.price;
        sales += tx.quantity;
      } else if (tx.transaction_type === 'purchase') {
        expense += tx.price;
        purchases += tx.quantity;
      }
    }
    const profit = revenue - expense;
    const profit_margin = revenue === 0 ? 0 : profit / revenue;
    result.push({
      user,
      profit,
      revenue,
      expense,
      number_of_trades: list.length,
      purchases,
      sales,
      profit_margin
    });
  }
  result.sort((a, b) => b.profit - a.profit);
  return result;
}

/**
 * Computes aggregate metrics grouped by riven name.
 *
 * Similar to getUserStatistics but uses the `item_name` field for
 * grouping.  Only transactions where item_type === 'riven' are used.
 */
function getRivenStatistics() {
  const txs = getAllTransactions().filter(tx => tx.item_type === 'riven');
  const groups = new Map();
  for (const tx of txs) {
    const key = tx.item_name;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tx);
  }
  const result = [];
  for (const [riven, list] of groups.entries()) {
    let revenue = 0;
    let expense = 0;
    let purchases = 0;
    let sales = 0;
    for (const tx of list) {
      if (tx.transaction_type === 'sale') {
        revenue += tx.price;
        sales += tx.quantity;
      } else if (tx.transaction_type === 'purchase') {
        expense += tx.price;
        purchases += tx.quantity;
      }
    }
    const profit = revenue - expense;
    const profit_margin = revenue === 0 ? 0 : profit / revenue;
    result.push({
      riven,
      profit,
      revenue,
      expense,
      number_of_trades: list.length,
      purchases,
      sales,
      profit_margin
    });
  }
  result.sort((a, b) => b.profit - a.profit);
  return result;
}

// GET /stats/users -> JSON array of user statistics
app.get('/stats/users', (req, res) => {
  try {
    const data = getUserStatistics();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /stats/rivens -> JSON array of riven statistics
app.get('/stats/rivens', (req, res) => {
  try {
    const data = getRivenStatistics();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`Analytics server listening on http://localhost:${PORT}`);
});