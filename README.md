# ESP32-S3 BLE 小车遥控

这个项目包含一个 Web Bluetooth 前端和一个 Arduino ESP32-S3 示例程序，用 BLE 控制两个 TT 电机。

## 指令协议

- `F`：前进，左右轮同时正转
- `B`：后退，左右轮同时反转
- `L`：左转，左轮停止，右轮正转
- `R`：右转，右轮停止，左轮正转
- `S`：停止
- `V180\n`：设置 PWM 速度，范围 `0` 到 `255`

## Arduino 使用

1. 打开 `esp32s3_ble_car/esp32s3_ble_car.ino`。
2. 当前代码已按 TB6612FNG 接线配置：
   - AIN1 -> ESP32-S3 GPIO1
   - AIN2 -> ESP32-S3 GPIO2
   - PWMA -> ESP32-S3 GPIO4
   - BIN1 -> ESP32-S3 GPIO12
   - BIN2 -> ESP32-S3 GPIO13
   - PWMB -> ESP32-S3 GPIO6
   - STBY 需要接 3.3V；如果接到了某个 GPIO，请修改代码里的 `TB6612_STBY`
3. Arduino IDE 选择 ESP32-S3 开发板。
4. 安装并使用 ESP32 Arduino Core，编译上传。
5. 串口监视器波特率设置为 `115200`。

示例按双 H 桥驱动写法处理，适用于 L298N、TB6612 等常见模块。若某个轮子方向相反，交换对应电机的 `IN1` 和 `IN2`，或在代码中调换该电机的方向。

## 前端使用

Web Bluetooth 需要安全上下文。请通过 `localhost` 或 HTTPS 打开页面，不要直接双击打开 HTML 文件。

可在项目目录运行：

```bash
python -m http.server 8000
```

然后用 Chrome 或 Edge 打开：

```text
http://localhost:8000
```

点击“连接蓝牙”，选择名为 `ESP32S3-CAR` 的设备，即可通过按钮、方向键或 WASD 控制小车。
