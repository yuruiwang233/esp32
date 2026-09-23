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

/* ============================================================
 * 手柄遥控（新增功能，不改动上方手机遥控原有逻辑）
 *
 * 协议新增 D 命令：D<左轮速度>,<右轮速度>\n
 *   每轮速度范围 -255..255（正=前进，负=后退，0=停止）
 *
 * 控制映射：
 *   左摇杆（优先，完全操控）：Y 轴推深 = 油门（上=前进 下=后退），X 轴 = 差速转向；
 *       左摇杆生效期间 LT 油门自动取消。
 *   否则：LT 线性扳机 = 油门（仅前进），右摇杆 X 位移 = 差速转向（直接用位移，不做角度换算）。
 *   差速：左轮 = 油门*(1+转向)，右轮 = 油门*(1-转向)，限幅 [-1,1]。
 * ============================================================ */
const PAD_DEADZONE = 0.13;
const PAD_MAX = 255;
const PAD_BTN_NAMES = [
  ["A", 0],
  ["B", 1],
  ["X", 2],
  ["Y", 3],
  ["LB", 4],
  ["RB", 5],
  ["L3", 10],
  ["R3", 11],
];

const modeButtons = [...document.querySelectorAll(".mode-btn")];
const phoneView = document.querySelector("#phoneView");
const padView = document.querySelector("#padView");
const padDot = document.querySelector("#padDot");
const padStatusText = document.querySelector("#padStatusText");
const padInfo = document.querySelector("#padInfo");
const padSource = document.querySelector("#padSource");
const padLeftWheel = document.querySelector("#padLeftWheel");
const padRightWheel = document.querySelector("#padRightWheel");
const padLTFill = document.querySelector("#padLT-fill");
const padLTVal = document.querySelector("#padLT-val");

const padSticks = {
  L: {
    accent: "#0f766e",
    stroke: "#0d9488",
    dot: document.querySelector("#padL-dot"),
    ray: document.querySelector("#padL-ray"),
    arc: document.querySelector("#padL-arc"),
    angle: document.querySelector("#padL-angle"),
    mag: document.querySelector("#padL-mag"),
    x: document.querySelector("#padL-x"),
    y: document.querySelector("#padL-y"),
  },
  R: {
    accent: "#1d4ed8",
    stroke: "#3b82f6",
    dot: document.querySelector("#padR-dot"),
    ray: document.querySelector("#padR-ray"),
    arc: document.querySelector("#padR-arc"),
    angle: document.querySelector("#padR-angle"),
    mag: document.querySelector("#padR-mag"),
    x: document.querySelector("#padR-x"),
    y: document.querySelector("#padR-y"),
  },
};

const padChips = PAD_BTN_NAMES.map(([name, idx]) => {
  const el = document.createElement("span");
  el.className = "chip";
  el.textContent = name;
  document.querySelector("#padButtons").appendChild(el);
  return { idx, el };
});

let currentMode = "phone";
let padLoopId = null;
let lastPadMsg = null;
let padCharSeen = false;
let lastPadSentAt = 0;

function switchMode(mode) {
  if (mode === currentMode) return;
  currentMode = mode;
  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });
  phoneView.hidden = mode !== "phone";
  padView.hidden = mode !== "pad";

  if (mode === "pad") {
    lastPadMsg = null;
    padLoopId = requestAnimationFrame(padTick);
  } else {
    if (padLoopId) cancelAnimationFrame(padLoopId);
    padLoopId = null;
    // 切回手机模式时立即停车
    if (commandCharacteristic) sendCommand("S");
  }
}

modeButtons.forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});

// 手柄模式下屏蔽手机遥控的键盘指令，避免两个模式互相干扰
window.addEventListener(
  "keydown",
  (event) => {
    if (currentMode === "pad") event.stopImmediatePropagation();
  },
  true,
);
window.addEventListener(
  "keyup",
  (event) => {
    if (currentMode === "pad") event.stopImmediatePropagation();
  },
  true,
);

function clampPad(value, lo, hi) {
  return Math.max(lo, Math.min(hi, value));
}

/* 读取线性扳机：USB 连接时数值在 axes 上；蓝牙连接时 axes 恒为 0，数值只从对应按钮的 .value 上报。
   取两者较大值，两种连接方式都能读到。标准映射：axes[4]/buttons[6]=LT，axes[5]/buttons[7]=RT */
function triggerValue(gp, axisIdx, btnIdx) {
  const axis = gp.axes[axisIdx] ?? 0;
  const btn = gp.buttons[btnIdx] ? gp.buttons[btnIdx].value : 0;
  return clampPad(Math.max(axis, btn), 0, 1);
}

/* 更新单个摇杆角度圆盘（角度约定：右 0° 上 90° 左 180° 下 270°） */
function updatePadStick(stick, xRaw, yRaw) {
  const x = clampPad(xRaw, -1, 1);
  const y = clampPad(yRaw, -1, 1);
  const mag = Math.min(1, Math.hypot(x, y));
  const inDead = mag <= PAD_DEADZONE;
  let deg = 0;
  if (mag > 0.0005) {
    deg = (Math.atan2(-y, x) * 180) / Math.PI;
    if (deg < 0) deg += 360;
  }

  const cx = 120;
  const cy = 120;
  const R = 92;
  stick.dot.setAttribute("cx", cx + x * R);
  stick.dot.setAttribute("cy", cy + y * R);
  stick.dot.setAttribute("fill", inDead ? "#b6c2cf" : stick.accent);
  stick.dot.setAttribute("stroke", inDead ? "#cbd5e1" : stick.stroke);

  const a = (deg * Math.PI) / 180;
  const ex = cx + R * Math.cos(a);
  const ey = cy - R * Math.sin(a);
  stick.ray.setAttribute("x2", ex.toFixed(2));
  stick.ray.setAttribute("y2", ey.toFixed(2));
  const large = deg > 180 ? 1 : 0;
  stick.arc.setAttribute(
    "d",
    `M ${cx + R} ${cy} A ${R} ${R} 0 ${large} 0 ${ex.toFixed(2)} ${ey.toFixed(2)}`,
  );
  stick.ray.style.opacity = inDead ? 0.3 : 0.85;
  stick.arc.style.opacity = !inDead && mag > 0.02 ? 0.25 : 0;

  stick.angle.textContent = `${deg.toFixed(1)}°`;
  stick.mag.textContent = `${Math.round(mag * 100)}%`;
  stick.x.textContent = x.toFixed(2);
  stick.y.textContent = y.toFixed(2);
}

/* 手柄输入 → 双轮差速 */
function computePadDrive(gp) {
  const lx = gp.axes[0] || 0;
  const ly = gp.axes[1] || 0;
  const rx = gp.axes[2] || 0;
  const lt = triggerValue(gp, 4, 6);
  const lMag = Math.hypot(lx, ly);

  let throttle = 0;
  let steer = 0;
  let source = "none";

  if (lMag > PAD_DEADZONE) {
    // 左摇杆完全操控：Y=油门（上正下负），X=差速
    throttle = clampPad(-ly, -1, 1);
    steer = clampPad(lx, -1, 1);
    source = "left";
  } else if (lt > 0.03 || Math.abs(rx) > PAD_DEADZONE) {
    // LT 油门 + 右摇杆转向（直接用 X 位移作转速差）
    throttle = lt;
    steer = clampPad(rx, -1, 1);
    source = "lt-right";
  }

  const left = clampPad(throttle * (1 + steer), -1, 1);
  const right = clampPad(throttle * (1 - steer), -1, 1);

  return {
    lw: Math.round(left * PAD_MAX),
    rw: Math.round(right * PAD_MAX),
    throttle,
    steer,
    source,
  };
}

/* 值有变化才发送，且限制发送频率，避免 BLE 写队列积压 */
function sendDrive(left, right) {
  if (!commandCharacteristic) return;
  const now = performance.now();
  if (now - lastPadSentAt < 25) return;
  const msg = `D${left},${right}\n`;
  if (msg === lastPadMsg) return;
  lastPadMsg = msg;
  lastPadSentAt = now;
  sendMessage(msg).catch(() => {});
}

function resetPadWidgets() {
  updatePadStick(padSticks.L, 0, 0);
  updatePadStick(padSticks.R, 0, 0);
  padLTFill.style.width = "0%";
  padLTVal.textContent = "0.00";
  padChips.forEach((chip) => chip.el.classList.remove("on"));
  padLeftWheel.textContent = "0";
  padRightWheel.textContent = "0";
}

function padTick() {
  let gp = null;
  if (navigator.getGamepads) {
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p && p.connected) {
        gp = p;
        break;
      }
    }
  }

  // 重新连接 BLE 后强制重发一次当前状态
  if (commandCharacteristic && !padCharSeen) {
    padCharSeen = true;
    lastPadMsg = null;
  }
  if (!commandCharacteristic) padCharSeen = false;

  if (!gp) {
    padDot.classList.remove("on");
    padStatusText.textContent = "未检测到手柄";
    padInfo.textContent = "连接手柄后按任意键激活（需 Chrome / Edge 前台）";
    padSource.textContent = "无输入";
    padSource.classList.remove("live");
    resetPadWidgets();
    if (commandCharacteristic) sendDrive(0, 0);
  } else {
    padDot.classList.add("on");
    padStatusText.textContent = `已连接：${gp.id}`;
    padInfo.textContent = `mapping: ${gp.mapping || "none"} · index ${gp.index}`;

    updatePadStick(padSticks.L, gp.axes[0] || 0, gp.axes[1] || 0);
    updatePadStick(padSticks.R, gp.axes[2] || 0, gp.axes[3] || 0);

    const lt = triggerValue(gp, 4, 6);
    padLTFill.style.width = `${(lt * 100).toFixed(1)}%`;
    padLTVal.textContent = lt.toFixed(2);

    padChips.forEach((chip) => {
      const button = gp.buttons[chip.idx];
      chip.el.classList.toggle("on", !!(button && button.pressed));
    });

    const drive = computePadDrive(gp);
    padSource.textContent =
      drive.source === "left"
        ? "左摇杆操控中"
        : drive.source === "lt-right"
          ? "LT + 右摇杆操控中"
          : "无输入";
    padSource.classList.toggle("live", drive.source !== "none");
    padLeftWheel.textContent = drive.lw;
    padRightWheel.textContent = drive.rw;

    if (commandCharacteristic) sendDrive(drive.lw, drive.rw);
  }

  padLoopId = requestAnimationFrame(padTick);
}

// 支持 URL 带 #pad 直接进入手柄模式
if (location.hash === "#pad") {
  switchMode("pad");
}
