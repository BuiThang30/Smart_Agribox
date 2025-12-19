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
    SO2:createChart("chartSO2", "SO2 (ppm)", "rgba(255, 86, 182, 1)", 0, 20),
    N: createChart("chartN", "Nitrogen (mg/kg)", "rgba(75,192,192,1)", 0, 1000),
    P: createChart("chartP", "Phosphorus (mg/kg)", "rgba(153,102,255,1)", 0, 1000),
    K: createChart("chartK", "Potassium (mg/kg)", "rgba(255,159,64,1)", 0, 1000),
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
    document.getElementById("so2Value").textContent = data.SO2 + " PPM";
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
  // ====== THRESHOLD FORMAT ======
  // {
  //   min,
  //   max,
  //   text,
  //   color,
  //   code,          // 0 1 2 3
  //   recommendation
  // }

  // ===================== PLANT DATA =====================
  // ===================== PLANT THRESHOLDS (THEO FILE WORD) =====================
  const PLANT_THRESHOLDS = {
    vegetable: {

      // ===================== NẢY MẦM – CÂY CON =====================
      seedling: {
        "soil-temperature": [
          { min: -Infinity, max: 15, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Che phủ giữ ấm đất; tránh tưới nước lạnh để đảm bảo nảy mầm đồng đều" },
          { min: 15, max: 20, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi nhiệt độ; điều chỉnh thời điểm tưới vào ban ngày" },
          { min: 20, max: 25, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì điều kiện hiện tại; giám sát định kỳ" },
          { min: 25, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Che lưới giảm nhiệt; tưới nhẹ để hạ nhiệt vùng rễ" }
        ],

        "soil-moisture": [
          { min: -Infinity, max: 55, text: "Khô hạn", color: "#ff3860", code: 3, recommendation: "Tưới bổ sung ngay để đảm bảo tỷ lệ nảy mầm" },
          { min: 55, max: 70, text: "Thiếu ẩm", color: "#ffdd57", code: 1, recommendation: "Tăng tần suất tưới để đạt độ ẩm tối ưu" },
          { min: 70, max: 80, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì chế độ tưới hiện tại" },
          { min: 80, max: Infinity, text: "Quá ẩm", color: "#b71c1c", code: 2, recommendation: "Giảm tưới; tăng thoát nước để tránh thối rễ" }
        ],

        N: [
          { min: -Infinity, max: 5, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Bổ sung đạm dễ tiêu để phục hồi sinh trưởng ban đầu" },
          { min: 5, max: 10, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh tăng nhẹ lượng đạm" },
          { min: 10, max: 20, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì chế độ cung cấp đạm hiện tại" },
          { min: 20, max: 30, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm lượng đạm để tránh sinh trưởng quá mức" },
          { min: 30, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón đạm và điều chỉnh dinh dưỡng" }
        ],

        P: [
          { min: -Infinity, max: 10, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Bổ sung lân để kích thích phát triển rễ" },
          { min: 10, max: 20, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh tăng nhẹ lân" },
          { min: 20, max: 40, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì mức lân hiện tại" },
          { min: 40, max: 50, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm lân để tránh tích lũy" },
          { min: 50, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón lân và cải tạo đất" }
        ],

        K: [
          { min: -Infinity, max: 5, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Bổ sung kali để tăng sức chống chịu" },
          { min: 5, max: 10, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh tăng kali" },
          { min: 10, max: 20, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì mức kali hiện tại" },
          { min: 20, max: 30, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm kali để tránh mất cân đối" },
          { min: 30, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón kali" }
        ],

        temperature: [
          { min: -Infinity, max: 15, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Che chắn, giữ ấm để đảm bảo sinh trưởng ban đầu" },
          { min: 15, max: 20, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi và điều chỉnh điều kiện vi khí hậu" },
          { min: 20, max: 25, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì điều kiện thuận lợi cho sinh trưởng" },
          { min: 25, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Thông gió, che lưới để giảm stress nhiệt" }
        ],

        humidity: [
          { min: -Infinity, max: 65, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Tăng độ ẩm không khí để hạn chế mất nước qua lá" },
          { min: 65, max: 75, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi và điều chỉnh độ ẩm phù hợp" },
          { min: 75, max: 85, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì điều kiện hiện tại" },
          { min: 85, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Giảm ẩm để hạn chế nấm bệnh" }
        ]
      },

      // ===================== SINH TRƯỞNG THÂN – LÁ =====================
      vegetative: {
        "soil-temperature": [
          { min: -Infinity, max: 18, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Che phủ đất nhằm hạn chế ức chế sinh trưởng lá" },
          { min: 18, max: 22, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi; điều chỉnh chế độ tưới phù hợp" },
          { min: 22, max: 30, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Điều kiện thuận lợi cho sinh trưởng thân – lá" },
          { min: 30, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Giảm nhiệt bằng che phủ và tưới làm mát đất" }
        ],

        "soil-moisture": [
          { min: -Infinity, max: 50, text: "Khô hạn", color: "#ff3860", code: 3, recommendation: "Tưới kịp thời nhằm tránh giảm sinh trưởng lá" },
          { min: 50, max: 65, text: "Thiếu ẩm", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh lượng và thời gian tưới" },
          { min: 65, max: 75, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Điều kiện phù hợp cho phát triển sinh khối" },
          { min: 75, max: Infinity, text: "Quá ẩm", color: "#b71c1c", code: 2, recommendation: "Hạn chế tưới; cải thiện thoát nước" }
        ],

        N: [
          { min: -Infinity, max: 20, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Bổ sung đạm nhằm đảm bảo phát triển thân lá" },
          { min: 20, max: 30, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh tăng đạm để đạt mức tối ưu" },
          { min: 30, max: 50, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì cung cấp đạm phù hợp" },
          { min: 50, max: 60, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm đạm để tránh mất cân đối" },
          { min: 60, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón đạm, giảm tồn dư nitrate" }
        ],

        P: [
          { min: -Infinity, max: 20, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Bổ sung lân nhằm tăng hiệu quả sinh trưởng" },
          { min: 20, max: 30, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh lân về mức tối ưu" },
          { min: 30, max: 50, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì chế độ bón lân" },
          { min: 50, max: 60, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm lân để tránh ức chế vi lượng" },
          { min: 60, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón lân, cải tạo đất" }
        ],

        K: [
          { min: -Infinity, max: 20, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Bổ sung kali để tăng chất lượng thân lá" },
          { min: 20, max: 30, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh tăng kali" },
          { min: 30, max: 50, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì mức kali tối ưu" },
          { min: 50, max: 60, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm kali để tránh rối loạn hấp thu" },
          { min: 60, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón kali" }
        ],

        temperature: [
          { min: -Infinity, max: 18, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Che chắn nhằm hạn chế ức chế sinh trưởng" },
          { min: 18, max: 22, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi và điều chỉnh thông gió" },
          { min: 22, max: 28, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Điều kiện tối ưu cho sinh khối" },
          { min: 28, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Giảm nhiệt bằng thông gió hoặc che lưới" }
        ],

        humidity: [
          { min: -Infinity, max: 60, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Tăng độ ẩm để tránh héo" },
          { min: 60, max: 70, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh vi khí hậu" },
          { min: 70, max: 80, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Điều kiện thuận lợi" },
          { min: 80, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Tăng thông gió hạn chế bệnh hại" }
        ]
      },

      // ===================== THU HOẠCH =====================
      harvest: {
        "soil-temperature": [
          { min: -Infinity, max: 15, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Giữ ấm đất để tránh giảm chất lượng lá" },
          { min: 15, max: 18, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi sát; điều chỉnh che phủ" },
          { min: 18, max: 25, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì để đảm bảo năng suất" },
          { min: 25, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Giảm nhiệt để hạn chế già hóa sớm" }
        ],

        "soil-moisture": [
          { min: -Infinity, max: 45, text: "Khô hạn", color: "#ff3860", code: 3, recommendation: "Tưới bổ sung có kiểm soát" },
          { min: 45, max: 60, text: "Thiếu ẩm", color: "#ffdd57", code: 1, recommendation: "Điều chỉnh tưới giữ độ tươi lá" },
          { min: 60, max: 70, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì chất lượng thương phẩm" },
          { min: 70, max: Infinity, text: "Quá ẩm", color: "#b71c1c", code: 2, recommendation: "Giảm tưới để hạn chế bệnh" }
        ],

        N: [
          { min: -Infinity, max: 10, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Điều chỉnh dinh dưỡng đảm bảo chất lượng" },
          { min: 10, max: 20, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Bổ sung nhẹ đạm nếu cần" },
          { min: 20, max: 30, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì mức đạm an toàn" },
          { min: 30, max: 40, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm đạm để hạn chế tồn dư" },
          { min: 40, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón đạm, giãn thời gian thu hoạch" }
        ],

        P: [
          { min: -Infinity, max: 15, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Điều chỉnh dinh dưỡng ổn định chất lượng" },
          { min: 15, max: 25, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Bổ sung nhẹ lân" },
          { min: 25, max: 40, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì mức lân phù hợp" },
          { min: 40, max: 50, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm lân để hạn chế tồn dư" },
          { min: 50, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón lân" }
        ],

        K: [
          { min: -Infinity, max: 20, text: "Rất thấp", color: "#ff3860", code: 3, recommendation: "Điều chỉnh kali đảm bảo chất lượng" },
          { min: 20, max: 30, text: "Thấp", color: "#ffdd57", code: 1, recommendation: "Bổ sung nhẹ kali" },
          { min: 30, max: 45, text: "Tối ưu", color: "#48c774", code: 0, recommendation: "Duy trì mức kali phù hợp" },
          { min: 45, max: 55, text: "Cao", color: "#ff9f43", code: 2, recommendation: "Giảm kali để tránh dư thừa" },
          { min: 55, max: Infinity, text: "Rất cao", color: "#b71c1c", code: 4, recommendation: "Ngừng bón kali" }
        ],

        temperature: [
          { min: -Infinity, max: 15, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Giữ ấm nhằm duy trì chất lượng lá" },
          { min: 15, max: 18, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi sát để tránh giảm chất lượng" },
          { min: 18, max: 25, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì điều kiện thuận lợi" },
          { min: 25, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Giảm nhiệt để hạn chế già hóa sớm" }
        ],

        humidity: [
          { min: -Infinity, max: 55, text: "Quá thấp", color: "#ff3860", code: 3, recommendation: "Tăng ẩm để duy trì độ tươi" },
          { min: 55, max: 65, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi sát độ ẩm" },
          { min: 65, max: 75, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì chất lượng thương phẩm" },
          { min: 75, max: Infinity, text: "Quá cao", color: "#b71c1c", code: 2, recommendation: "Giảm ẩm để hạn chế nấm bệnh" }
        ]
      }
    }
  };

  // ====== CÁC CHẤT DÙNG CHUNG MỌI GIAI ĐOẠN ======
  // ===================== COMMON THRESHOLDS =====================
  const COMMON_THRESHOLDS = {
    PH: [
      { min: -Infinity, max: 5.5, text: "Thấp", color: "#ff3860", code: 3, recommendation: "Điều chỉnh pH nước bằng biện pháp trung hòa" },
      { min: 5.5, max: 6.0, text: "Chưa tối ưu", color: "#ffdd57", code: 1, recommendation: "Theo dõi và điều chỉnh nhẹ" },
      { min: 6.0, max: 6.8, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Duy trì nguồn nước tưới hiện tại" },
      { min: 6.8, max: Infinity, text: "Cao", color: "#b71c1c", code: 2, recommendation: "Xử lý giảm pH nước tưới" }
    ],

    CO2: [
      { min: -Infinity, max: 350, text: "Thấp bất thường", color: "#ff3860", code: 3, recommendation: "Kiểm tra vị trí cảm biến; đánh giá vi khí hậu" },
      { min: 350, max: 450, text: "Bình thường", color: "#48c774", code: 0, recommendation: "Điều kiện khí quyển ổn định" },
      { min: 450, max: 800, text: "Cao bất thường", color: "#ff9f43", code: 2, recommendation: "Theo dõi nguồn phát thải cục bộ" },
      { min: 800, max: Infinity, text: "Ô nhiễm cục bộ", color: "#b71c1c", code: 3, recommendation: "Không thu hoạch trong thời gian ô nhiễm" }
    ],

    CO: [
      { min: 0, max: 1, text: "An toàn", color: "#48c774", code: 0, recommendation: "Điều kiện bình thường; tiếp tục giám sát" },
      { min: 1, max: 5, text: "Cảnh báo", color: "#ffdd57", code: 1, recommendation: "Theo dõi nguồn phát thải" },
      { min: 5, max: 9, text: "Nguy hiểm", color: "#ff9f43", code: 2, recommendation: "Không thu hoạch; hạn chế tiếp xúc" },
      { min: 9, max: Infinity, text: "Rất nguy hiểm", color: "#b71c1c", code: 3, recommendation: "Dừng thu hoạch; cảnh báo môi trường" }
    ],

    SO2: [
      { min: 0, max: 0.05, text: "An toàn", color: "#48c774", code: 0, recommendation: "Duy trì giám sát định kỳ" },
      { min: 0.05, max: 0.1, text: "Cảnh báo", color: "#ffdd57", code: 1, recommendation: "Theo dõi biểu hiện cháy mép lá" },
      { min: 0.1, max: 0.3, text: "Nguy hiểm", color: "#ff9f43", code: 2, recommendation: "Không thu hoạch; che chắn tạm thời" },
      { min: 0.3, max: Infinity, text: "Rất nguy hiểm", color: "#b71c1c", code: 3, recommendation: "Dừng sản xuất; báo cáo ô nhiễm" }
    ],

    NOx: [
      { min: 0, max: 0.04, text: "An toàn", color: "#48c774", code: 0, recommendation: "Điều kiện không khí bình thường" },
      { min: 0.04, max: 0.1, text: "Cảnh báo", color: "#ffdd57", code: 1, recommendation: "Theo dõi stress lá" },
      { min: 0.1, max: 0.2, text: "Nguy hiểm", color: "#ff9f43", code: 2, recommendation: "Không thu hoạch; hạn chế canh tác" },
      { min: 0.2, max: Infinity, text: "Rất nguy hiểm", color: "#b71c1c", code: 3, recommendation: "Dừng thu hoạch; cảnh báo môi trường" }
    ]
  };


  // ===================== CORE FUNCTIONS =====================
  function evaluateThreshold(value, rules) {
    return rules.find(r => value >= r.min && value < r.max) || null;
  }

  function getSensorRule(sensor, plant, stage) {
    if (COMMON_THRESHOLDS[sensor]) return COMMON_THRESHOLDS[sensor];
    return PLANT_THRESHOLDS[plant]?.[stage]?.[sensor] || null;
  }

  // ===================== UPDATE WARNINGS =====================
  function updateWarnings(data) {
    const plant = plantTypeSelect.value;
    const stage = growthStageSelect.value;

    Object.keys(data).forEach(sensor => {
      const rules = getSensorRule(sensor, plant, stage);
      if (!rules) return;

      const result = evaluateThreshold(data[sensor], rules);
      if (!result) return;

      const el = document.querySelector(`#status${capitalizeId(sensor)}`);
      const box = el?.closest(".warning");

      if (el) el.textContent = result.text;
      if (box) box.style.backgroundColor = result.color;
    });
  }

  // ===================== SEND CODE TO ESP =====================
  function sendAlertCodesToESP(data) {
    const plant = plantTypeSelect.value;
    const stage = growthStageSelect.value;
    const codes = {};

    Object.keys(data).forEach(sensor => {
      const rules = getSensorRule(sensor, plant, stage);
      if (!rules) return;

      const result = evaluateThreshold(data[sensor], rules);
      codes[sensor] = result ? result.code : -1;
    });

    socket.emit("alert-codes", codes);
    console.log("ESP ALERT:", codes);
  }

  // ===================== RECOMMENDATION =====================
  const SENSOR_NAME_VI = {
    temperature: "Nhiệt độ không khí",
    humidity: "Độ ẩm không khí",
    "soil-temperature": "Nhiệt độ đất",
    "soil-moisture": "Độ ẩm đất",
    N: "Đạm (N)",
    P: "Lân (P)",
    K: "Kali (K)",
    PH: "pH nước",
    CO2: "CO₂",
    CO: "CO",
    NOx: "NOx",
    SO2: "SO₂"
  };

  function generateRecommendation(data) {
    const plant = plantTypeSelect.value;
    const stage = growthStageSelect.value;
    let msgs = [];

    Object.keys(data).forEach(sensor => {
      const rules = getSensorRule(sensor, plant, stage);
      if (!rules) return;

      const result = evaluateThreshold(data[sensor], rules);
      if (!result || result.code === 0) return;

      const sensorName = SENSOR_NAME_VI[sensor] || sensor;
      msgs.push(`${sensorName}: ${result.recommendation}`);
    });

    return msgs.length
      ? msgs.join(", ")
      : "Tất cả thông số đang ở mức an toàn và tối ưu.";
  }

  // ===================== HOOK UI =====================
  let lastSensorData = null;

  const oldUpdateChartsAndUI = updateChartsAndUI;
  updateChartsAndUI = function (data) {
    oldUpdateChartsAndUI(data);
    lastSensorData = data;
    updateWarnings(data);
    sendAlertCodesToESP(data);
    if (recommendText) recommendText.textContent = generateRecommendation(data);
  };

  plantTypeSelect.addEventListener("change", () => lastSensorData && updateWarnings(lastSensorData));
  growthStageSelect.addEventListener("change", () => lastSensorData && updateWarnings(lastSensorData));

  // ===================== ID MAP =====================
  function capitalizeId(id) {
    const map = {
      temperature: "Temp",
      humidity: "Humidity",
      CO2: "CO2",
      CO: "CO",
      NOx: "NOx",
      SO2: "SO2",
      "soil-temperature": "SoilTemp",
      "soil-moisture": "SoilMoisture",
      PH: "PH"
    };
    return map[id] || id.charAt(0).toUpperCase() + id.slice(1);
  }

});
