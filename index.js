const express = require("express");
const path = require("path");
const fs = require("fs");
const bodyParser = require("body-parser");
const socketapi = require("./socketapi");

const dataRouter = require("./routes/data");

const app = express();
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

app.use("/api/data", dataRouter);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "home.html"));
});

app.get("/:page", (req, res) => {
  const page = req.params.page;
  const filePath = path.join(__dirname, "public", `${page}.html`);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      res.status(404).send("Page not found");
    } else {
      res.sendFile(filePath);
    }
  });
});


app.get("/api/status", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

const io = socketapi.initSocket(server);
