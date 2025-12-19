require("dotenv").config();
const { db } = require("./db");

// dynamic import node-fetch
const fetch = (...args) =>
  import("node-fetch").then(({ default: fetch }) => fetch(...args));

const TOKEN_AQI_API = process.env.TOKEN_AQI_API;
if (!TOKEN_AQI_API) {
  console.error("TOKEN_AQI_API is not set. Please set it in your environment variables.");
  process.exit(1);
}
const api_endpoint = `https://api.waqi.info/feed/here/?token=${TOKEN_AQI_API}`;

const maxEnvirLength = 1;
const envirData = {
  temperature: [],
  humidity: [],
  CO2: [],
  CO: [],
  NOx: [],
  SO2: [],
  N: [],
  P: [],
  K: [],
  "soil-temperature": [],
  "soil-moisture": [],
  PH: [],
};

function calculateAverage(dataArray) {
  if (!dataArray.length) return 0;
  const validData = dataArray.filter((v) => !isNaN(v));
  if (!validData.length) return 0;
  return +(validData.reduce((acc, val) => acc + val, 0) / validData.length).toFixed(2);
}

let deviceStatus = "offline";
let mode = "auto";

let devices = {
  den: false,
  loa: false,
  maybom: false,
};

function initSocket(server) {
  const socketio = require("socket.io");
  const io = socketio(server, {
    cors: { origin: "*", methods: ["GET", "POST"], credentials: true },
  });

  io.on("connection", (socket) => {
    console.log("[INFO] New connection:", socket.id);

    // ====== ESP32 gửi dữ liệu đo ======
    socket.on("message", async (payload) => {
      try {
        if (Array.isArray(payload) && payload.length === 2) {
          const [eventName, rawData] = payload;
          if (eventName === "/esp/measure") {
            let data = rawData;
            if (typeof data === "string") data = JSON.parse(data);

            if (data.sensorId === "esp32") {
              deviceStatus = "online";
              io.emit("deviceStatus", deviceStatus);
            }

            console.log(`[MEASURE] from ${data.sensorId || "web"} via ${socket.id}`);

            // Nếu CO2 = 0 thì lấy AQI từ API
            if (+data.CO2 === 0) {
              try {
                const res = await fetch(api_endpoint);
                const json = await res.json();
                if (json?.data?.aqi) data.CO2 = json.data.aqi;
              } catch (err) {
                console.error("Failed to fetch AQI:", err.message);
              }
            }

            // Nếu NOX = 0 thì lấy AQI từ API
            if (+data.NOx === 0) {
              try {
                const res = await fetch(api_endpoint);
                const json = await res.json();
                if (json?.data?.aqi) data.CO2 = json.data.aqi;
              } catch (err) {
                console.error("Failed to fetch AQI:", err.message);
              }
            }

            // Nếu CO = 0 thì lấy AQI từ API
            if (+data.CO === 0) {
              try {
                const res = await fetch(api_endpoint);
                const json = await res.json();
                if (json?.data?.aqi) data.CO2 = json.data.aqi;
              } catch (err) {
                console.error("Failed to fetch AQI:", err.message);
              }
            }

            // gửi cho web client
            socket.broadcast.emit("message", data);

            // gom dữ liệu
            for (const key in envirData) {
              if (data[key] != null) {
                const val = parseFloat(data[key]);
                if (!isNaN(val)) envirData[key].push(val);
              }
            }

            // tính trung bình và lưu DB
            if (envirData.humidity.length >= maxEnvirLength) {
              const avgData = {};
              for (const key in envirData) {
                avgData[key] = calculateAverage(envirData[key]);
                envirData[key] = [];
              }

              db.run(
                `INSERT INTO EnvironmentalData 
                 (temperature, humidity, CO2, CO, NOx, N, P, K, "soil-temperature", "soil-moisture", PH)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                  avgData.temperature,
                  avgData.humidity,
                  avgData.CO2,
                  avgData.CO,
                  avgData.NOx,
                  avgData.N,
                  avgData.P,
                  avgData.K,
                  avgData["soil-temperature"],
                  avgData["soil-moisture"],
                  avgData.PH,
                ],
                (err) => {
                  if (err) console.error("DB insert error:", err);
                  else console.log("Data added:", avgData);
                }
              );
            }
          }
        }
      } catch (err) {
        console.error("Invalid message payload:", err);
      }
    });

    // ===== đổi mode ======
    socket.on("change-mode", (newMode) => {
      if (["auto", "manual"].includes(newMode)) {
        mode = newMode;
        io.emit("esp-command", { type: "mode", value: mode });
        io.emit("mode-update", mode);
        console.log("Mode changed to", mode);
      }
    });

    // ===== bật/tắt thiết bị (đèn / loa / máy bơm) =====
    socket.on("device-update", ({ target, state }) => {
      console.log("device-update từ server:", target, state);
      // cập nhật button tương ứng
      const reverseMap = { light: "Đèn", speaker: "Loa", pump: "Bơm" };
      const labelKey = reverseMap[target];
      let btn = null;
      if (labelKey === "Đèn") btn = btnLight;
      if (labelKey === "Loa") btn = btnSpeaker;
      if (labelKey === "Bơm") btn = btnPump;
      if (btn) {
        const isOn = state === "on";
        deviceStates[labelKey] = isOn;
        btn.classList.toggle('off', !isOn);
        // nếu muốn đổi text: btn.textContent = isOn ? 'On' : 'Off';
      }
    });

    socket.on("toggle-device", ({ target, state }) => {
      console.log("[TOGGLE] Web yêu cầu:", target, state);

      // gửi xuống ESP32
      io.emit("esp-command", {
        type: "device",
        target,
        state,
      });

      // gửi lại cho ALL web client để cập nhật UI
      io.emit("device-update", { target, state });
    });

    socket.on("alert-codes", (alertCodes) => {
      console.log("[ALERT-CODES] received from web:", alertCodes);

      io.emit("esp-command", {
        type: "alert",
        value: alertCodes
      });
      
      console.log("[ALERT-CODES] sent to ESP32");
    });



    socket.on("disconnect", () => {
      console.log(socket.id, "disconnected");
      deviceStatus = "offline";
      io.emit("deviceStatus", deviceStatus);
    });

    socket.on("connect_error", (err) => {
      console.error("Connection error:", err.message);
    });
  });

  return io;
}

module.exports = { initSocket };
