document.addEventListener('DOMContentLoaded', () => {
  const socket = io();

  // ===================== SLIDER =====================
  const slides = document.querySelectorAll('.slide-item');
  if (slides.length > 0) {
    let current = 0;
    slides[0].classList.add('active');
    setInterval(() => {
      slides.forEach(slide => slide.classList.remove('active'));
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, 3000);
  }

  // ===================== MENU =====================
  const menuToggle = document.getElementById("mobile-menu");
  const navLinks = document.querySelector(".nav-links");

  menuToggle.addEventListener("click", () => {
    navLinks.classList.toggle("open");
  });

  // Tự đóng khi chọn một mục
  document.querySelectorAll(".nav-links a").forEach((item) => {
    item.addEventListener("click", () => {
      navLinks.classList.remove("open");
    });
  });


  // ===================== CONTROL (MANUAL / AUTO) =====================
  const modeSwitch = document.getElementById('modeSwitch');
  const modeLabel = document.getElementById('modeLabel');
  const controlBox = document.getElementById('controlBox');
  const btnLight = document.getElementById('btnLight');
  const btnSpeaker = document.getElementById('btnSpeaker');
  const btnPump = document.getElementById('btnPump');

  let manualMode = false;
  const deviceStates = { light: false, speaker: false, pump: false };

  if (modeSwitch && modeLabel && controlBox) {
    modeSwitch.addEventListener('change', () => {
      manualMode = modeSwitch.checked;
      modeLabel.textContent = manualMode ? "Điều khiển" : "Tự động";
      controlBox.classList.toggle('disabled', !manualMode);

      if (socket.connected) {
        socket.emit("change-mode", manualMode ? "manual" : "auto");
      }
    });
  }

  // ===== nhận sự kiện bật/tắt thiết bị =====
  socket.on("device-update", ({ target, state }) => {
    console.log("[UPDATE UI]", target, state);

    deviceStates[target] = (state === "on");

    if (target === "light") {
        btnLight.classList.toggle("off", state !== "on");
    }
    if (target === "speaker") {
        btnSpeaker.classList.toggle("off", state !== "on");
    }
    if (target === "pump") {
        btnPump.classList.toggle("off", state !== "on");
    }
});



  function toggleDevice(button, key, label) {
    if (!manualMode) {
      console.log("⚠️ Cannot toggle in AUTO mode.");
      return;
    }
    deviceStates[key] = !deviceStates[key];
    button.classList.toggle('off', !deviceStates[key]);
    button.textContent = `${label}`;

    // --- MAPPING từ key hiển thị sang target server ---
    const map = { "Đèn bắt côn trùng": "light", "Loa": "speaker", "Bơm": "pump" };
    const target = map[key] || key; // nếu bạn đã dùng english keys thì vẫn ok

    // chuyển boolean -> "on"/"off"
    const stateStr = deviceStates[key] ? "on" : "off";

    if (socket && socket.connected) {
      // gửi event mà server đang lắng nghe
      socket.emit("toggle-device", { target, state: stateStr });
      console.log("Gửi:", target, stateStr);
    } else {
      console.log("Socket not connected");
    }
  }

  if (btnLight && btnSpeaker && btnPump) {
    btnLight.addEventListener('click', () => toggleDevice(btnLight, "Đèn bắt côn trùng", "Đèn bắt côn trùng"));
    btnSpeaker.addEventListener('click', () => toggleDevice(btnSpeaker, "Loa", "Loa"));
    btnPump.addEventListener('click', () => toggleDevice(btnPump, "Bơm", "Bơm"));
  }

  // ===================== SIDEBAR + BOXES =====================
  const sidebarLinks = document.querySelectorAll(".sidebar .menu a");
  const parameterSection = document.getElementById("parameter");
  const boxes = document.querySelectorAll(".parameter .box");
  const toggleViewBtn = document.getElementById("toggleViewBtn");

  let singleView = true;

  function showBoxById(id) {
    boxes.forEach(box => {
      const title = box.querySelector("h3.title");
      if (singleView) {
        box.classList.remove("active");
        if (title && title.id === id) box.classList.add("active");
      } else if (title && title.id === id) {
        title.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  sidebarLinks.forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const id = link.getAttribute("href").substring(1);
      showBoxById(id);
    });
  });

  if (toggleViewBtn) {
    toggleViewBtn.addEventListener("click", () => {
      singleView = !singleView;
      parameterSection.classList.toggle("single-view", singleView);
      const text = toggleViewBtn.querySelector(".text");
      const icon = toggleViewBtn.querySelector(".icon");
      if (singleView) {
        text.textContent = "Xem thêm";
        icon.textContent = "▼";
        boxes.forEach(b => b.classList.remove("active"));
        boxes[0].classList.add("active");
      } else {
        text.textContent = "Ẩn bớt";
        icon.textContent = "▲";
      }
    });
  }

  parameterSection?.classList.add("single-view");
  boxes[0]?.classList.add("active");

  // ===================== RECOMMENDATION SYSTEM =====================
  const plantTypeSelect = document.getElementById("plantType");
  const growthStageSelect = document.getElementById("growthStage");
  const recommendText = document.getElementById("recommendText");

  socket.on("sensor-data", data => updateChartsAndUI(data));

  // --- Chart helper ---
  function createChart(canvasId, label, color, min, max) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    return new Chart(ctx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label,
          data: [],
          borderColor: color,
          backgroundColor: color.replace('1)', '0.2)'),
          fill: true,
          tension: 0.3,
          pointRadius: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { y: { min, max } }
      }
    });
  }

  // --- Format UTC+0 → UTC+7 ---
  function formatTimeUTC7(utcString) {
    const d = new Date(utcString);
    d.setHours(d.getHours() + 7);

    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    const time = d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });

    return `${day}, ${time}`;
  }

  // --- Create charts ---
  const charts = {
    temperature: createChart("chartTemp", "Temperature (°C)", "rgba(255,99,132,1)", 0, 50),
    humidity: createChart("chartHumidity", "Humidity (%)", "rgba(54,162,235,1)", 0, 100),
    CO2: createChart("chartCO2", "CO₂ (ppm)", "rgba(255,206,86,1)", 0, 2000),
    CO: createChart("chartCO", "CO (ppm)", "rgba(156, 255, 86, 1)", 0, 200),
    NOx:createChart("chartNOx", "NOx (ppm)", "rgba(216, 255, 86, 1)", 0, 20),
    N: createChart("chartN", "Nitrogen (mg/kg)", "rgba(75,192,192,1)", 0, 1000),
    P: createChart("chartP", "Phosphate (mg/kg)", "rgba(153,102,255,1)", 0, 1000),
    K: createChart("chartK", "Potash (mg/kg)", "rgba(255,159,64,1)", 0, 1000),
    "soil-temperature": createChart("chartSoilTemp", "Soil Temperature (°C)", "rgba(255,99,71,1)", 0, 50),
    "soil-moisture": createChart("chartSoilMoisture", "Soil Moisture (%)", "rgba(60,179,113,1)", 0, 100),
    PH: createChart("chartPH", "Water pH", "rgba(0,128,255,1)", 4, 9),
  };

  let lastTimestamp = null;

  // --- Load lịch sử ---
  async function loadHistory() {
    try {
      const res = await fetch("/api/data/history");
      const rows = await res.json();
      rows.reverse().forEach(r => {
        const time = formatTimeUTC7(r.timestamp);
        for (let key in charts) {
          if (charts[key]) {
            charts[key].data.labels.push(time);
            charts[key].data.datasets[0].data.push(r[key]);
          }
        }
      });
      for (let key in charts) charts[key]?.update();
      if (rows.length) lastTimestamp = rows[rows.length - 1].timestamp;
    } catch (err) {
      console.error("History load error:", err);
    }
  }

  // --- Hàm cập nhật realtime ---
  async function fetchLatest() {
    try {
      const res = await fetch("/api/data/latest");
      const data = await res.json();
      if (!data) return;

      // Nếu dữ liệu mới hơn thì mới cập nhật
      if (data.timestamp !== lastTimestamp) {
        console.log("New data received:", data.timestamp);
        updateChartsAndUI(data);
        lastTimestamp = data.timestamp;
      } else {
        // console.log("⏸ No new data, skip update.");
      }
    } catch (err) {
      console.error("Fetch latest error:", err);
    }
  }

  // --- Hàm cập nhật UI + biểu đồ ---  
  function updateChartsAndUI(data) {
    if (!data) return;

    const time = formatTimeUTC7(data.timestamp);
    document.getElementById("tempValue").textContent = data.temperature + " °C";
    document.getElementById("humValue").textContent = data.humidity + " %";
    document.getElementById("co2Value").textContent = data.CO2 + " PPM";
    document.getElementById("coValue").textContent = data.CO + " PPM";
    document.getElementById("noxValue").textContent = data.NOx + " PPM";
    document.getElementById("NValue").textContent = data.N + " mg/Kg";
    document.getElementById("PValue").textContent = data.P + " mg/Kg";
    document.getElementById("KValue").textContent = data.K + " mg/Kg";
    document.getElementById("soilTempValue").textContent = data["soil-temperature"] + " °C";
    document.getElementById("soilMoistureValue").textContent = data["soil-moisture"] + " %";
    document.getElementById("PHValue").textContent = data.PH + " pH";

    for (let key in charts) {
      if (charts[key]) {
        charts[key].data.labels.push(time);
        charts[key].data.datasets[0].data.push(data[key]);
        if (charts[key].data.labels.length > 10) {
          charts[key].data.labels.shift();
          charts[key].data.datasets[0].data.shift();
        }
        charts[key].update();
      }
    }
  }
  loadHistory();
  setInterval(fetchLatest, 5000);

  // ===================== RECOMMENDATION + ALERT SYSTEM =====================
  // Bộ dữ liệu chuẩn cho từng cây trồng theo giai đoạn
  const PLANT_THRESHOLDS = {
    rice: {
      seedling:    { temperature: [20, 32], humidity: [70, 90], CO2: [350, 1000], CO: [0, 30], NOx: [0, 1], N: [80, 200], P: [40, 100], K: [50, 120], "soil-temperature": [25, 32], "soil-moisture": [60, 80], PH: [5.5, 7.5] },
      vegetative:  { temperature: [20, 34], humidity: [65, 85], CO2: [350, 1200], CO: [0, 30], NOx: [0, 1], N: [100, 250], P: [50, 120], K: [70, 150], "soil-temperature": [26, 34], "soil-moisture": [55, 75], PH: [5.5, 7.5] },
      flowering:   { temperature: [20, 33], humidity: [60, 80], CO2: [400, 1300], CO: [0, 30], NOx: [0, 1], N: [80, 200], P: [60, 130], K: [80, 160], "soil-temperature": [25, 33], "soil-moisture": [55, 75], PH: [5.5, 7.5] },
      fruiting:    { temperature: [20, 32], humidity: [60, 80], CO2: [400, 1200], CO: [0, 30], NOx: [0, 1], N: [70, 180], P: [50, 120], K: [100, 180], "soil-temperature": [24, 32], "soil-moisture": [50, 70], PH: [5.5, 7.5] },
      harvest:     { temperature: [20, 30], humidity: [55, 75], CO2: [350, 1000], CO: [0, 30], NOx: [0, 1], N: [50, 150], P: [40, 100], K: [80, 160], "soil-temperature": [22, 30], "soil-moisture": [45, 65], PH: [5.5, 7.5] },
    },
    apple: {
      seedling:    { temperature: [15, 25], humidity: [65, 85], CO2: [350, 1000], CO: [0, 30], NOx: [0, 1], N: [60, 150], P: [30, 80], K: [40, 100], "soil-temperature": [15, 25], "soil-moisture": [55, 75], PH: [5.5, 7.5] },
      vegetative:  { temperature: [18, 28], humidity: [60, 80], CO2: [350, 1200], CO: [0, 30], NOx: [0, 1], N: [70, 160], P: [40, 90], K: [60, 120], "soil-temperature": [18, 28], "soil-moisture": [55, 75], PH: [5.5, 7.5] },
      flowering:   { temperature: [20, 30], humidity: [55, 75], CO2: [400, 1300], CO: [0, 30], NOx: [0, 1], N: [50, 140], P: [60, 120], K: [70, 150], "soil-temperature": [20, 30], "soil-moisture": [50, 70], PH: [5.5, 7.5] },
      fruiting:    { temperature: [20, 32], humidity: [50, 70], CO2: [400, 1400], CO: [0, 30], NOx: [0, 1], N: [60, 150], P: [70, 130], K: [80, 160], "soil-temperature": [22, 32], "soil-moisture": [45, 65], PH: [5.5, 7.5] },
      harvest:     { temperature: [20, 28], humidity: [50, 70], CO2: [350, 1200], CO: [0, 30], NOx: [0, 1], N: [40, 120], P: [50, 100], K: [70, 150], "soil-temperature": [20, 28], "soil-moisture": [45, 65], PH: [5.5, 7.5] },
    },
    industrial: {
      seedling:    { temperature: [20, 34], humidity: [60, 85], CO2: [350, 1000], CO: [0, 30], NOx: [0, 1], N: [70, 200], P: [40, 100], K: [60, 120], "soil-temperature": [24, 34], "soil-moisture": [55, 80], PH: [5.5, 7.5] },
      vegetative:  { temperature: [20, 36], humidity: [55, 80], CO2: [350, 1200], CO: [0, 30], NOx: [0, 1], N: [100, 250], P: [60, 130], K: [80, 150], "soil-temperature": [25, 35], "soil-moisture": [50, 75], PH: [5.5, 7.5] },
      flowering:   { temperature: [20, 34], humidity: [55, 75], CO2: [400, 1300], CO: [0, 30], NOx: [0, 1], N: [90, 200], P: [70, 140], K: [100, 180], "soil-temperature": [24, 34], "soil-moisture": [50, 70], PH: [5.5, 7.5] },
      fruiting:    { temperature: [20, 32], humidity: [55, 75], CO2: [400, 1200], CO: [0, 30], NOx: [0, 1], N: [70, 180], P: [60, 120], K: [90, 160], "soil-temperature": [22, 32], "soil-moisture": [45, 65], PH: [5.5, 7.5] },
      harvest:     { temperature: [20, 30], humidity: [50, 70], CO2: [350, 1000], CO: [0, 30], NOx: [0, 1], N: [60, 150], P: [50, 110], K: [80, 140], "soil-temperature": [22, 30], "soil-moisture": [40, 60], PH: [5.5, 7.5] },
    }
  };

  // Hàm kiểm tra cảnh báo theo từng cảm biến
  function getAlertLevel(value, [min, max]) {
    if (value >= min && value <= max) return { level: "Bình thường", color: "#48c774" };
    const range = max - min;
    const tolerance = range * 0.15;
    if (value < min - tolerance || value > max + tolerance)
      return { level: "Nguy cấp", color: "#ff3860" };
    return { level: "Nguy hiểm", color: "#f0ad4e" };
  }

  function alertLevelToNumber(level) {
    switch (level) {
      case "Bình thường": return 0;
      case "Nguy hiểm": return 1;
      case "Nguy cấp": return 2;
      default: return -1;
    }
  }

  function generateAlertCodes(sensorData, plant, stage) {
    const thresholds = PLANT_THRESHOLDS[plant][stage];
    const alertCodes = {};

    Object.keys(thresholds).forEach(key => {
      const ranges = thresholds[key];
      const value = sensorData[key];

      if (value == null) {
        alertCodes[key] = -1;
        return;
      }

      const res = getAlertLevel(value, ranges);
      alertCodes[key] = alertLevelToNumber(res.level);
    });

    return alertCodes;
  }

  function sendAlertCodesToESP(sensorData) {
    const plant = plantTypeSelect.value;
    const stage = growthStageSelect.value;

    const alertCodes = generateAlertCodes(sensorData, plant, stage);
    socket.emit("alert-codes", alertCodes);

    console.log("Gửi sang ESP:", {
      type: "alert",
      value: alertCodes
    });
  }

  // Cập nhật cảnh báo từng cảm biến
  function updateWarnings(data) {
    const plant = plantTypeSelect.value;
    const stage = growthStageSelect.value;
    const thresholds = PLANT_THRESHOLDS[plant][stage];
    if (!thresholds) return;

    Object.keys(thresholds).forEach(key => {
      const value = data[key];
      if (value == null) return;
      const warnEl = document.querySelector(`#status${capitalizeId(key)}`);
      const warningBox = warnEl?.closest(".warning");
      const { level, color } = getAlertLevel(value, thresholds[key]);
      if (warnEl) {
        warnEl.textContent = level;
        if (warningBox) warningBox.style.backgroundColor = color;
      }
    });
  }

  // Hàm viết hoa chữ cái đầu id (chuyển chart id → DOM id)
  function capitalizeId(id) {
    switch (id) {
      case "temperature": return "Temp";
      case "humidity": return "Humidity";
      case "CO2": return "CO2";
      case "CO": return "CO";
      case "NOx": return "NOx";
      case "N": return "N";
      case "P": return "P";
      case "K": return "K";
      case "soil-temperature": return "SoilTemp";
      case "soil-moisture": return "SoilMoisture";
      case "PH": return "PH";
      default:
        return id.charAt(0).toUpperCase() + id.slice(1);
    }
  }

  let lastSensorData = null;

  const oldUpdateChartsAndUI = updateChartsAndUI;
  updateChartsAndUI = function (data) {
    oldUpdateChartsAndUI(data);
    lastSensorData = data;
    updateWarnings(data);
    sendAlertCodesToESP(data);
  };

  plantTypeSelect.addEventListener("change", () => {
    if (lastSensorData) updateWarnings(lastSensorData);
  });
  growthStageSelect.addEventListener("change", () => {
    if (lastSensorData) updateWarnings(lastSensorData);
  });

  // ===================== RECOMMENDATION ENGINE =====================
  function generateRecommendation(data) {
    const plant = plantTypeSelect.value;
    const stage = growthStageSelect.value;
    const thresholds = PLANT_THRESHOLDS[plant]?.[stage];
    if (!thresholds) return "Đang chờ dữ liệu cảm biến...";

    let messages = [];
    let normal = [];

    Object.keys(thresholds).forEach(key => {
      const value = data[key];
      if (value == null) return;
      const [min, max] = thresholds[key];
      const { level } = getAlertLevel(value, thresholds[key]);

      const direction =
        value < min ? "thấp" :
        value > max ? "cao" : "bình thường";

      switch (key) {
        case "temperature":
          if (level === "Nguy cấp")
            messages.push(`Nhiệt độ không khí đang quá ${direction}. Cần điều chỉnh quạt thông gió hoặc hệ thống sưởi ngay.`);
          else if (level === "Nguy hiểm")
            messages.push(`Nhiệt độ không khí hơi ${direction}, nên điều chỉnh nhẹ.`);
          else normal.push("nhiệt độ không khí");
          break;

        case "humidity":
          if (level === "Nguy cấp")
            messages.push(`Độ ẩm không khí quá ${direction}. Kiểm tra hệ thống phun sương hoặc hút ẩm.`);
          else if (level === "Nguy hiểm")
            messages.push(`Độ ẩm hơi ${direction}, cần điều chỉnh.`);
          else normal.push("độ ẩm không khí");
          break;

        case "CO2":
          if (level === "Nguy cấp")
            messages.push(`Nồng độ CO₂ quá ${direction}. Cần điều chỉnh thông gió hoặc hệ thống bơm CO₂.`);
          else if (level === "Nguy hiểm")
            messages.push(`Nồng độ CO₂ hơi ${direction}, nên kiểm tra hệ thống lưu thông không khí.`);
          else normal.push("nồng độ CO₂");
          break;

        case "CO":
          if (level === "Nguy cấp")
            messages.push(`Nồng độ CO quá ${direction}. Cần điều chỉnh thông gió hoặc hệ thống bơm CO.`);
          else if (level === "Nguy hiểm")
            messages.push(`Nồng độ CO hơi ${direction}, nên kiểm tra hệ thống lưu thông không khí.`);
          else normal.push("nồng độ CO");
          break;

        case "NOx":
          if (level === "Nguy cấp")
            messages.push(`Nồng độ NOx quá ${direction}. Cần điều chỉnh thông gió hoặc hệ thống bơm NOx.`);
          else if (level === "Nguy hiểm")
            messages.push(`Nồng độ NOx hơi ${direction}, nên kiểm tra hệ thống lưu thông không khí.`);
          else normal.push("nồng độ NOx");
          break;

        case "N":
          if (level === "Nguy cấp" && direction === "cao")
            messages.push("Hàm lượng đạm (N) quá cao — ngừng bón phân đạm ngay.");
          else if (level === "Nguy cấp" && direction === "thấp")
            messages.push("Hàm lượng đạm (N) quá thấp — cần bổ sung phân đạm sớm.");
          else if (level === "Nguy hiểm" && direction === "cao")
            messages.push("Đạm hơi cao, nên giảm lượng phân N.");
          else if (level === "Nguy hiểm" && direction === "thấp")
            messages.push("Đạm hơi thấp, nên bón thêm một ít phân N.");
          else normal.push("đạm (N)");
          break;

        case "P":
          if (level === "Nguy cấp" && direction === "cao")
            messages.push("Lân (P) quá cao — ngừng bón phân chứa P.");
          else if (level === "Nguy cấp" && direction === "thấp")
            messages.push("Lân (P) quá thấp — cần bón thêm phân lân.");
          else if (level === "Nguy hiểm" && direction === "cao")
            messages.push("Lân hơi cao, giảm lượng phân P.");
          else if (level === "Nguy hiểm" && direction === "thấp")
            messages.push("Lân hơi thấp, nên bổ sung nhẹ.");
          else normal.push("lân (P)");
          break;

        case "K":
          if (level === "Nguy cấp" && direction === "cao")
            messages.push("Kali (K) quá cao — ngừng bón phân chứa K ngay.");
          else if (level === "Nguy cấp" && direction === "thấp")
            messages.push("Kali (K) quá thấp — cần bón thêm phân kali.");
          else if (level === "Nguy hiểm" && direction === "cao")
            messages.push("Kali hơi cao, nên giảm lượng phân K.");
          else if (level === "Nguy hiểm" && direction === "thấp")
            messages.push("Kali hơi thấp, có thể bổ sung thêm một ít.");
          else normal.push("kali (K)");
          break;

        case "soil-temperature":
          if (level === "Nguy cấp")
            messages.push(`Nhiệt độ đất quá ${direction}, ảnh hưởng đến hoạt động của rễ.`);
          else if (level === "Nguy hiểm")
            messages.push(`Nhiệt độ đất hơi ${direction}, cần điều chỉnh nhẹ.`);
          else normal.push("nhiệt độ đất");
          break;

        case "soil-moisture":
          if (level === "Nguy cấp" && direction === "cao")
            messages.push("Đất bị úng nước — dừng tưới ngay và kiểm tra thoát nước.");
          else if (level === "Nguy cấp" && direction === "thấp")
            messages.push("Đất quá khô — cần tưới nước ngay.");
          else if (level === "Nguy hiểm" && direction === "cao")
            messages.push("Độ ẩm đất hơi cao, giảm lượng tưới.");
          else if (level === "Nguy hiểm" && direction === "thấp")
            messages.push("Độ ẩm đất hơi thấp, nên tưới thêm ít nước.");
          else normal.push("độ ẩm đất");
          break;

        case "PH":
          if (level === "Nguy cấp" && direction === "cao")
            messages.push("Độ pH nước quá cao (kiềm) — nên dùng dung dịch axit yếu hoặc pha loãng.");
          else if (level === "Nguy cấp" && direction === "thấp")
            messages.push("Độ pH nước quá thấp (axit) — nên dùng vôi hoặc dung dịch trung hòa.");
          else if (level === "Nguy hiểm" && direction === "cao")
            messages.push("pH nước hơi cao, cần theo dõi thường xuyên.");
          else if (level === "Nguy hiểm" && direction === "thấp")
            messages.push("pH nước hơi thấp, nên kiểm tra định kỳ.");
          else normal.push("độ pH nước");
          break;
      }
    });

    let finalText = "";
    if (messages.length === 0) {
      finalText = "Tất cả thông số đều nằm trong ngưỡng tối ưu. Tiếp tục theo dõi thường xuyên!";
    } else {
      finalText = messages.join(" ");
      if (normal.length > 0) finalText += ` Các thông số bình thường: ${normal.join(", ")}.`;
    }

    return finalText;
  }


  // Gắn recommendation vào hệ thống cảnh báo
  const originalUpdateWarnings = updateWarnings;
  updateWarnings = function (data) {
    originalUpdateWarnings(data);
    const rec = generateRecommendation(data);
    if (recommendText) recommendText.textContent = rec;
  };

  // Tự cập nhật recommendation khi đổi cây hoặc giai đoạn
  plantTypeSelect.addEventListener("change", () => {
    if (lastSensorData) updateWarnings(lastSensorData);
  });
  growthStageSelect.addEventListener("change", () => {
    if (lastSensorData) updateWarnings(lastSensorData);
  });

});
