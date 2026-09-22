const SERVICE_UUID = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const CHARACTERISTIC_UUID = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";

const connectButton = document.querySelector("#connectButton");
const statusDot = document.querySelector("#statusDot");
const statusText = document.querySelector("#statusText");
const lastCommand = document.querySelector("#lastCommand");
const speedSlider = document.querySelector("#speedSlider");
const speedValue = document.querySelector("#speedValue");
const controlButtons = [...document.querySelectorAll("[data-command]")];

let device;
let commandCharacteristic;
let activeKeyCommand = null;

const commandNames = {
  F: "前进",
  B: "后退",
  L: "左转",
  R: "右转",
  S: "停止",
};

const keyCommands = {
  ArrowUp: "F",
  KeyW: "F",
  ArrowDown: "B",
  KeyS: "B",
  ArrowLeft: "L",
  KeyA: "L",
  ArrowRight: "R",
  KeyD: "R",
  Space: "S",
};

function setConnectionState(connected, text) {
  statusDot.classList.toggle("connected", connected);
  statusText.textContent = text;
  connectButton.textContent = connected ? "断开连接" : "连接蓝牙";
}

function setControlsEnabled(enabled) {
  controlButtons.forEach((button) => {
    button.disabled = !enabled;
  });
}

function setActiveCommand(command) {
  controlButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.command === command);
  });
}

async function sendMessage(message) {
  if (!commandCharacteristic) {
    lastCommand.textContent = "请先连接蓝牙";
    return;
  }

  const data = new TextEncoder().encode(message);
  await commandCharacteristic.writeValue(data);
}

async function sendCommand(command) {
  try {
    await sendMessage(command);
    lastCommand.textContent = `已发送：${commandNames[command] ?? command}`;
    setActiveCommand(command === "S" ? null : command);
  } catch (error) {
    lastCommand.textContent = `发送失败：${error.message}`;
  }
}

async function sendSpeed(value) {
  speedValue.value = value;
  speedValue.textContent = value;

  try {
    await sendMessage(`V${value}\n`);
    lastCommand.textContent = `速度：${value}`;
  } catch {
    if (commandCharacteristic) {
      lastCommand.textContent = "速度发送失败";
    }
  }
}

function onDisconnected() {
  commandCharacteristic = null;
  setControlsEnabled(false);
  setActiveCommand(null);
  setConnectionState(false, "已断开");
}

async function connectBluetooth() {
  if (!navigator.bluetooth) {
    statusText.textContent = "当前浏览器不支持 Web Bluetooth";
    lastCommand.textContent = "请使用 Chrome 或 Edge，并通过 localhost/HTTPS 打开页面";
    return;
  }

  if (device?.gatt?.connected) {
    device.gatt.disconnect();
    return;
  }

  try {
    setConnectionState(false, "正在选择设备...");

    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID],
    });

    device.addEventListener("gattserverdisconnected", onDisconnected);
    setConnectionState(false, "正在连接...");

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(SERVICE_UUID);
    commandCharacteristic = await service.getCharacteristic(CHARACTERISTIC_UUID);

    setConnectionState(true, `已连接：${device.name || "ESP32-S3"}`);
    setControlsEnabled(true);
    await sendSpeed(speedSlider.value);
    await sendCommand("S");
  } catch (error) {
    commandCharacteristic = null;
    setControlsEnabled(false);
    setConnectionState(false, "连接失败");
    lastCommand.textContent = error.message;
  }
}

connectButton.addEventListener("click", connectBluetooth);

controlButtons.forEach((button) => {
  const command = button.dataset.command;

  button.addEventListener("pointerdown", async (event) => {
    event.preventDefault();
    await sendCommand(command);
  });

  button.addEventListener("pointerup", async () => {
    if (command !== "S") {
      await sendCommand("S");
    }
  });

  button.addEventListener("pointercancel", async () => {
    if (command !== "S") {
      await sendCommand("S");
    }
  });

  button.addEventListener("pointerleave", async (event) => {
    if (event.buttons && command !== "S") {
      await sendCommand("S");
    }
  });
});

speedSlider.addEventListener("input", () => {
  speedValue.textContent = speedSlider.value;
});

speedSlider.addEventListener("change", () => {
  sendSpeed(speedSlider.value);
});

window.addEventListener("keydown", (event) => {
  const command = keyCommands[event.code];
  if (!command || activeKeyCommand === command) {
    return;
  }

  event.preventDefault();
  activeKeyCommand = command;
  sendCommand(command);
});

window.addEventListener("keyup", (event) => {
  const command = keyCommands[event.code];
  if (!command) {
    return;
  }

  event.preventDefault();
  activeKeyCommand = null;
  if (command !== "S") {
    sendCommand("S");
  }
});

setControlsEnabled(false);
