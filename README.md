# BLERelay
Relay BLE (Bluetooth Low Energy) Transmission.

# Requirements
Two BLE Devices (Built-in BLE device can be used)

# How to use
Setup noble and bleno.

In my environment, noble-winrt (https://github.com/Timeular/noble-winrt) and original bleno (https://github.com/noble/bleno) worked. (Windows 10 21H1 19043.1165, Built-in Bluetooth Adapter, ELECOM LBT-UAN05C1 WinUSB[Zadig])

Adjust Drivers and Modules to your environment.

Change source code `require` section appropriately.

Pair to the peripheral BEFORE run.

Specify peripheral MAC address.

`node ble_relay.js 01:23:45:67:89:AB`

Advice: This technology is unstable. You may try it several times.
