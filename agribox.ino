#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClient.h>
#include <SocketIoClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ModbusMaster.h>
#include <DHT.h>
#include <WiFiManager.h>
#include <DFRobotDFPlayerMini.h>

// ========================= CONFIG SERVER =========================
#define SERVER_HOST "nongsmartinsight.com"
#define SERVER_PORT 80

// ========================= DHT22 =========================
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

// ========================= SENSOR PINS =========================
#define MQ135_PIN 34
#define MQ7_PIN   35
#define SOIL_PIN  32
#define SOIL_DRY_VAL 3000
#define SOIL_MOIST_VAL 1000
#define PH_PIN    33
#define PH_OFFSET 0.70

// ========================= DS18B20 =========================
#define ONE_WIRE_BUS 5
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);

// ========================= NPK SENSOR RS485 =========================
HardwareSerial npkSerial(2);   // RX2=16, TX2=17
ModbusMaster node;

// ========================= DFPlayer Mini =========================
HardwareSerial dfSerial(1);
DFRobotDFPlayerMini dfPlayer;
bool dfPlayerOK = false;

// ========================= ACTUATOR PINS =========================
#define PIN_LIGHT  14
#define PIN_PUMP   26
#define PIN_STATUS_LED 27

// ========================= GLOBAL =========================
SocketIoClient socket;
bool socketConnected = false;
String modeESP = "auto";

// ========================= SENSOR DATA =========================
float Temperature = 0, Humidity = 0;
float CO2 = 0, NOx = 0, CO = 0;
float soilTemp = 0;
int soilMoisture = 0;
float pH = 0;

int N_val = 0, P_val = 0, K_val = 0;

// ========================= DFPlayer =========================
volatile bool speakerCmd = false;
volatile bool speakerChanged = false;
unsigned long lastSpeakerCmdMillis = 0;
const unsigned long SPEAKER_DEBOUNCE_MS = 300;

// ========================= WIFI MANAGER =========================
void setupWiFi() {
  WiFiManager wm;
  bool res = wm.autoConnect("ESP32-SMARTFARM", "12345678");

  if (!res) {
    Serial.println("[WiFi] Failed. Restarting...");
    delay(2000);
    ESP.restart();
  }

  Serial.println("[WiFi] Connected!");
  Serial.print("[IP] ");
  Serial.println(WiFi.localIP());
}

// ========================= STATUS LED =========================
void updateStatusLED() {
  digitalWrite(PIN_STATUS_LED, (WiFi.status() != WL_CONNECTED || !socketConnected));
}

// ========================= HANDLE COMMAND =========================
void handleEspCommand(const char* payload) {
  Serial.println("========== ESP RECEIVED COMMAND ==========");
  Serial.println(payload);

  DynamicJsonDocument doc(512);
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.print("[ERROR] JSON parse failed: ");
    Serial.println(err.c_str());
    return;
  }

  String type = doc["type"] | "";
  String target = doc["target"] | "";
  String state = doc["state"] | "";
  String value = doc["value"] | "";

  // ==================== CHANGE MODE ====================
  if (type == "mode") {
    modeESP = value;
    Serial.println("[MODE] Changed to: " + modeESP);

    // Nếu manual -> tắt hết thiết bị
    if (modeESP == "manual") {
      digitalWrite(PIN_LIGHT, LOW);
      digitalWrite(PIN_PUMP, LOW);
      
      if (dfPlayerOK) dfPlayer.stop();

      Serial.println("[MANUAL] All devices OFF");
    }
  }

  // ==================== DEVICE CONTROL ====================
  if (type == "device") {
    bool isOn = (state == "on");

    // Chỉ cho phép control khi AUTO
    if (modeESP != "auto") {
      Serial.println("[DEVICE] Ignored because mode = MANUAL");
      return;
    }

    if (target == "light") {
      digitalWrite(PIN_LIGHT, isOn);
      Serial.printf("[DEVICE] light = %s\n", isOn ? "ON" : "OFF");
    }

    if (target == "pump") {
      digitalWrite(PIN_PUMP, isOn);
      Serial.printf("[DEVICE] pump = %s\n", isOn ? "ON" : "OFF");
    }

    // Speaker vẫn cho phép dùng trong manual để test nhạc
    if (target == "speaker") {
      unsigned long now = millis();
      if (now - lastSpeakerCmdMillis < SPEAKER_DEBOUNCE_MS) {
        Serial.println("[SPEAKER] Command ignored (debounce)");
      } else {
        lastSpeakerCmdMillis = now;
        speakerCmd = isOn;
        speakerChanged = true;
        Serial.printf("[CMD] Speaker request queued = %s\n", isOn ? "ON" : "OFF");
      }
    }
  }

  // ==================== ALERT CONTROL ====================
  if (type == "alert") {
    // Chỉ chạy khi AUTO
    if (modeESP != "auto") {
      Serial.println("[ALERT] Ignored because mode = MANUAL");
      return;
    }

    JsonObject valueObj = doc["value"].as<JsonObject>();
    int humidityAlert = valueObj["humidity"] | 0;
    int soilMoistureAlert = valueObj["soilMoisture"] | 0;
    Serial.printf("[ALERT] Humidity=%d, SoilMoisture=%d\n", humidityAlert, soilMoistureAlert);

    if (humidityAlert >= 1 || soilMoistureAlert >= 1) {
      digitalWrite(PIN_PUMP, HIGH);
      Serial.println("[PUMP] ON (alert)");
    } else {
      digitalWrite(PIN_PUMP, LOW);
      Serial.println("[PUMP] OFF (alert)");
    }
  }
}

// ========================= SOCKET.IO =========================
void setupSocket() {
  socket.on("connect", [](const char*, size_t) {
    Serial.println("[Socket.IO] Connected");
    socketConnected = true;
  });

  socket.on("disconnect", [](const char*, size_t) {
    Serial.println("[Socket.IO] Disconnected");
    socketConnected = false;
  });

  socket.on("esp-command", [](const char* payload, size_t) {
    handleEspCommand(payload);
  });

  socket.begin(SERVER_HOST, SERVER_PORT);
}


// ========================= SENSOR READ =========================

// ========================= DHT22 =========================
void receive_dht() {
  Humidity = dht.readHumidity();
  Temperature = dht.readTemperature();
}

// ========================= MQ135 =========================
void read_mq135() {
  int adc = analogRead(MQ135_PIN);
  float vout = adc * (3.3 / 4095.0);
  float rs = 10000.0 * (3.3 - vout) / vout;
  float ratio = rs / 330.0;

  CO2 = pow((ratio / 605.18), (1.0 / -3.937)) + 400;
  NOx = pow((ratio / 50.0), (1.0 / -1.5));
}

// ========================= MQ7 =========================
void read_mq7() {
  CO = map(analogRead(MQ7_PIN), 0, 4095, 0, 300);
}

// ========================= SOIL MOISTURE =========================
void read_soil_moisture() {
  int v = analogRead(SOIL_PIN);
  soilMoisture = map(v, SOIL_DRY_VAL, SOIL_MOIST_VAL, 0, 100);
  soilMoisture = constrain(soilMoisture, 0, 100);
}

// ========================= DS18B20 =========================
void read_ds18b20() {
  ds18b20.requestTemperatures();
  soilTemp = ds18b20.getTempCByIndex(0);
}

// ========================= NPK =========================
void read_npk() {
  uint8_t result;

  // ==== Read N ====
  result = node.readHoldingRegisters(0x001E, 1);
  if (result == node.ku8MBSuccess) {
    N_val = node.getResponseBuffer(0);
  } else {
    N_val = -1;
  }
  delay(80);

  // ==== Read P ====
  result = node.readHoldingRegisters(0x001F, 1);
  if (result == node.ku8MBSuccess) {
    P_val = node.getResponseBuffer(0);
  } else {
    P_val = -1;
  }
  delay(80);

  // ==== Read K ====
  result = node.readHoldingRegisters(0x0020, 1);
  if (result == node.ku8MBSuccess) {
    K_val = node.getResponseBuffer(0);
  } else {
    K_val = -1;
  }
  delay(80);
}


// ========================= pH =========================
void read_ph() {
  int buf[10];
  unsigned long sum = 0;

  for (int i = 0; i < 10; i++) {
    buf[i] = analogRead(PH_PIN);
    delay(5);
  }

  for (int i = 0; i < 9; i++)
    for (int j = i + 1; j < 10; j++)
      if (buf[i] > buf[j]) std::swap(buf[i], buf[j]);

  for (int i = 2; i < 8; i++) sum += buf[i];

  float voltage = (float)sum * 3.3 / 4095 / 6;
  pH = 2.0 * voltage + PH_OFFSET;
}

// ========================= SEND TO SERVER =========================
void sendSensorData() {
  if (!socketConnected) return;

  DynamicJsonDocument doc(512);
  JsonArray arr = doc.to<JsonArray>();

  arr.add("/esp/measure");   // FORMAT GIỐNG CODE TEST

  JsonObject d = arr.createNestedObject();
  d["sensorId"] = "esp32";

  // ===== DHT22 =====
  d["temperature"] = isnan(Temperature) ? -1 : Temperature;
  d["humidity"]    = isnan(Humidity)    ? -1 : Humidity;

  // ===== MQ135 / MQ7 =====
  d["CO2"] = isnan(CO2) ? -1 : CO2;
  d["CO"]  = isnan(CO)  ? -1 : CO;
  d["NOx"] = isnan(NOx) ? -1 : NOx;

  // ===== Soil Temperature (DS18B20) =====
  if (soilTemp == -127 || isnan(soilTemp))
    d["soil-temperature"] = -1;
  else
    d["soil-temperature"] = soilTemp;

  // ===== Soil Moisture =====
  d["soil-moisture"] = soilMoisture;

  // ===== NPK =====
  d["N"] = N_val;   // nếu lỗi thì N_val = -1 sẵn rồi
  d["P"] = P_val;
  d["K"] = K_val;

  // ===== PH =====
  d["PH"] = isnan(pH) ? -1 : pH;

  // ===== MODE =====
  d["mode"] = modeESP;

  // ===== SEND =====
  String out;
  serializeJson(doc, out);

  socket.emit("message", out.c_str());
  Serial.println("[SEND] " + out);
}

// ========================= SETUP =========================
void setup() {
  Serial.begin(115200);
  delay(200);

  dht.begin();
  ds18b20.begin();

  npkSerial.begin(9600, SERIAL_8N1, 16, 17);
  node.begin(1, npkSerial);

  pinMode(PIN_LIGHT, OUTPUT);
  pinMode(PIN_PUMP, OUTPUT);
  pinMode(PIN_STATUS_LED, OUTPUT);

  dfSerial.begin(9600, SERIAL_8N1, 21, 22);
  if (dfPlayer.begin(dfSerial)) {
    dfPlayer.volume(30);
    dfPlayerOK = true;
  }

  setupWiFi();
  setupSocket();

  Serial.println("=== ESP32 READY ===");
}

// ========================= LOOP =========================
unsigned long lastRead = 0;
unsigned long lastSend = 0;

void loop() {
  unsigned long now = millis();

  // ===== READ SENSORS =====
  if (now - lastRead > 5000) {
    receive_dht();
    read_mq135();
    read_mq7();
    read_soil_moisture();
    read_ds18b20();
    read_ph();
    read_npk();
    lastRead = now;
  }

  // ===== DFPlayer =====
  if (speakerChanged) {
    speakerChanged = false;
    if (dfPlayerOK) {
      if (speakerCmd) dfPlayer.play(1);
      else dfPlayer.stop();
    }
  }

  // ===== SEND DATA =====
  if (now - lastSend > 10000) {
    sendSensorData();
    lastSend = now;
  }

  updateStatusLED();
  socket.loop();
}
