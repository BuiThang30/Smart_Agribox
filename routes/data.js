// routes/data.js
const express = require("express");
const router = express.Router();
const { db } = require("../db");

// 1) Lấy 10 bản ghi mới nhất, trả về từ cũ -> mới
router.get("/history", (req, res) => {
  db.all(
    "SELECT * FROM (SELECT * FROM EnvironmentalData ORDER BY timestamp DESC LIMIT 10) sub ORDER BY timestamp ASC",
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    }
  );
});



// 2) Lấy bản ghi mới nhất
router.get("/latest", (req, res) => {
  db.get(
    "SELECT * FROM EnvironmentalData ORDER BY timestamp DESC LIMIT 1",
    [],
    (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(row || null);
    }
  );
});


module.exports = router;
