const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');


const dbFile = path.join(__dirname, 'database.db');
const db = new sqlite3.Database(dbFile, (err) => {
  if (err) {
    console.error('Could not connect to database', err);
  } else {
    console.log('Connected to SQLite database');
  }
});

// ----------------------------
// Tạo bảng EnvironmentalData
// ----------------------------
db.run(`
CREATE TABLE IF NOT EXISTS EnvironmentalData (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  temperature REAL,
  humidity REAL,
  CO2 REAL,
  CO REAL,
  NOx REAL,
  N REAL,
  P REAL,
  K REAL,
  "soil-temperature" REAL,
  "soil-moisture" REAL,
  PH REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
)
`, (err) => {
  if (err) console.error('Error creating EnvironmentalData table', err);
  else console.log('EnvironmentalData table ready');
});

// Export
module.exports = { db };
