'use strict';

// const noble = require('noble')
const noble = require('noble-winrt');
// const noble = require('cmsn-noble');
// const noble = require('@abandonware/noble');

const bleno = require('bleno');
// const bleno = require('@abandonware/bleno');

const ADD_DEVICE_NAME_COPY = false;
var DEVICE_NAME;

function BaseUUID(X) {
  // https://stackoverflow.com/questions/4059147/check-if-a-variable-is-a-string-in-javascript
  console.assert(typeof X === 'string' || X instanceof String);
  console.assert(X.length == 4);
  return `0000${X}00001000800000805f9b34fb`.toLowerCase();
}

function removeDashes(uuidDash) {
  return uuidDash.replace(/-/g, '');
}

function isBaseUUIDDash(X) {
  return X.match(/^0000[0-9a-f]{4}-0000-1000-8000-00805f9b34fb$/i);
}

// Central Part

if (process.argv.length <= 2) {
  console.error(`Usage: node ${process.argv[1]} [MAC]`);
  process.exit(1);
}

const TARGET_MAC = process.argv[2];

// https://ihateregex.io/expr/mac-address/
if (!TARGET_MAC.match(/^[a-fA-F0-9]{2}(:[a-fA-F0-9]{2}){5}$/)) {
  console.error('Illegal MAC Address');
  process.exit(1);
}

const DEBUG = process.argv.length > 3;

if (!DEBUG) {
  console.debug = () => { };
}

noble.on('warning', (message) => {
  console.debug(`[onwarning] ${message}`);
});

noble.on('stateChange', (state) => {
  if (state === 'poweredOn') {
    process.stdout.write(`Scanning Peripheral ${TARGET_MAC} `);
    noble.startScanning();
  } else {
    noble.stopScanning();
  }
})

noble.on('discover', (peripheral) => {
  process.stdout.write('.');

  // Filter by MAC Address
  if (peripheral.address !== TARGET_MAC.toLowerCase()) {
    return;
  }

  // Filter by LocalName (Not Recommended)
  // if (peripheral.advertisement.localName !== 'LocalName') {
  //   return;
  // }

  // Filter by Known Service UUID
  // if (peripheral.advertisement.serviceUuids.indexOf('Known UUID') == -1) {
  //   return;
  // }

  noble.stopScanning();

  console.log();
  console.log('Peripheral Discovered');

  console.log('Connecting to Peripheral');

  connectAndDiscover(peripheral);
});

function connectAndDiscover(peripheral) {
  peripheral.connect((error) => {
    if (error) {
      console.error('error on connect');
      console.error(error);
      return;
    }

    var name = peripheral.advertisement.localName;
    if (name === '') {
      name = '[UNNAMED]';
    }

    DEVICE_NAME = name;
    if (ADD_DEVICE_NAME_COPY) {
      DEVICE_NAME += ' - copy';
    }

    console.log(`Connected to Peripheral '${name}' rssi:${peripheral.rssi}`);

    console.log();
    console.log('Discovering All Services And Characteristics');

    peripheral.discoverAllServicesAndCharacteristics(
      onAllServicesAndCharacteristicsDiscovered
    );
  })

  peripheral.on('disconnect', () => {
    console.debug('Peripheral Disconnected');
    console.error('Terminated');
    process.exit(1);
  });
}

function onAllServicesAndCharacteristicsDiscovered(
  error,
  services,
  characteristics,
) {
  console.debug('onAllServicesAndCharacteristicsDiscovered');
  if (error) {
    console.error('error on onAllServicesAndCharacteristicsDiscovered');
    console.error(error);
    return;
  }

  console.log(`${services.length} service(s) discovered`);
  services.forEach(service => {
    console.debug(service.uuid);
  });
  console.debug();

  console.log(`${characteristics.length} characteristic(s) discovered`);
  characteristics.forEach(characteristic => {
    console.debug(characteristic.uuid, characteristic.properties);
  });
  console.log();

  characteristics.forEach(characteristic => {
    // 2A00:Device Name
    if (removeDashes(characteristic.uuid) === '2A00'.toLowerCase() || removeDashes(characteristic.uuid) === BaseUUID('2A00')) {
      characteristic.read((error, data) => {
        if (error) {
          console.error('error on read');
          console.error(error);
        }
        console.log(`COPIED DEVICE NAME: '${data.toString()}'`);
        process.env.BLENO_DEVICE_NAME = data.toString();
      });
    }
  });

  act_as_device(services, characteristics);
}

// Peripheral Part

const BlenoPrimaryService = bleno.PrimaryService;
const Characteristic = bleno.Characteristic;

class CopiedService extends BlenoPrimaryService {
  constructor(name, uuid, characteristics) {
    super({
      name: name,
      uuid: uuid,
      characteristics: characteristics,
    });
  }
}

class CopiedCharacteristic extends Characteristic {
  constructor(characteristic) {
    super({
      uuid: characteristic.uuid,
      properties: characteristic.properties,
      onReadRequest: (offset, callback) => {
        console.debug(`CopiedCharacteristic - ${characteristic.uuid} - onReadRequest`);
        console.assert(offset == 0);
        console.assert(characteristic.properties.indexOf('read') != -1);
        const result = Characteristic.RESULT_SUCCESS;
        characteristic.read((error, data) => {
          if (error) {
            console.error('error on read');
            console.error(error);
            return;
          }
          console.log(`read: ${data.toString('hex')} (${data.toString()})`);
          callback(result, data);
        });
      },
      onWriteRequest: (data, offset, withoutResponse, callback) => {
        console.debug(`CopiedCharacteristic - ${characteristic.uuid} - onWriteRequest`);
        console.log(`${characteristic.uuid}\twrite\t${data.toString('hex')}`); // (${data.toString()})
        console.assert(offset == 0);
        console.assert(characteristic.properties.indexOf('write') != -1);

        characteristic.write(data, withoutResponse, (error) => {
          if (error) {
            console.error('error on write')
            console.error(error)
            return;
          }
          console.debug('written')
          const result = Characteristic.RESULT_SUCCESS;
          callback(result);
        });
      },
      onSubscribe: (maxValueSize, updateValueCallback) => {
        console.debug(`CopiedCharacteristic - ${characteristic.uuid} - onSubscribe`);
        console.debug(`maxValueSize ${maxValueSize}`);
        console.log(`${characteristic.uuid}\tsubscribe`);
        console.assert(characteristic.properties.indexOf('notify') != -1 || characteristic.properties.indexOf('indicate') != -1);

        characteristic.subscribe((error) => {
          if (error) {
            console.error('error on subscribe');
            console.error(error);
            return;
          }

          console.debug('[subscribe callback]');
        });

        characteristic.on('data', (data, isNotification) => {
          if (isNotification) {
            console.log(`${characteristic.uuid}\tondata\t${data.toString('hex')}`)
            updateValueCallback(data);
          }
        });
      },
      onUnsubscribe: () => {
        console.debug(`CopiedCharacteristic - ${characteristic.uuid} - onUnsubscribe`);
        characteristic.unsubscribe((error) => {
          if (error) {
            console.error('error on onUnsubscribe');
            console.error(error);
            return;
          }
        });
        characteristic.removeAllListeners();
      },
      onNotify: () => {
        console.debug(`CopiedCharacteristic - ${characteristic.uuid} - onNotify`);
        characteristic.notify(true, (error) => {
          if (error) {
            console.debug(`notify ${error}`);
          }
        });
      },
      onIndicate: () => {
        console.debug(`CopiedCharacteristic - ${characteristic.uuid} - onIndicate`);
        // characteristic.notify(true);
      },
    });
  }
}

function act_as_device(services, characteristics) {
  console.debug('act_as_device');

  var ADVERTISING_SERVICE_UUIDS = [];

  services.forEach(service => {
    if (!isBaseUUIDDash(service.uuid)) {
      ADVERTISING_SERVICE_UUIDS.push(service.uuid);
    }
  });

  console.debug('ADVERTISING_SERVICE_UUIDS', ADVERTISING_SERVICE_UUIDS);

  // console.debug('first uuid', services[0].characteristics[0].uuid);

  bleno.on('stateChange', (state) => {
    console.debug(`on -> stateChange: ${state}`);
    if (state === 'poweredOn') {
      bleno.startAdvertising(DEVICE_NAME, ADVERTISING_SERVICE_UUIDS);
    } else {
      bleno.stopAdvertising();
    }
  });

  bleno.on('advertisingStart', (error) => {
    console.debug('on -> advertisingStart');

    if (error) {
      console.error('error on advertisingStart');
      console.error(error);
      return;
    }

    var c_services = [];

    services.forEach(service => {
      var c_characteristics = [];
      service.characteristics.forEach(characteristic => {
        console.debug(`characteristic.properties ${characteristic.properties}`);

        const c_characteristic = new CopiedCharacteristic(characteristic);

        c_characteristics.push(c_characteristic);
      });

      const c_service = new CopiedService(
        service.name,
        service.uuid,
        c_characteristics,
      );
      c_services.push(c_service);
    });

    bleno.setServices(c_services);

    console.log();
    console.log(`Copied Peripheral Working as '${DEVICE_NAME}' on ${bleno.address}`);
    console.log();
    console.log('UUID\tEvent\t[data]');

    // debug section
    characteristics.forEach(characteristic => {
      if (!isBaseUUIDDash(characteristic.uuid)) {
        characteristic.setMaxListeners(100);
        characteristic.on('write', () => {
          console.debug('[onwrite]');
        });
        characteristic.on('data', (data, isNotification) => {
          console.debug(`[ondata] ${data.toString('hex')} ${isNotification}`);
        });
        // characteristic.on('notify', (state) => {
        //   console.debug(`[onnotify] ${state}`)
        // });
      }
    });
  });
}

// DEVICE_NAME = 'DEVICE_NAME'
// act_as_device([{ uuid: '1234', characteristics: [{ uuid: '5678' }] }], [])
// act_as_device([
//   { uuid: '00001800-0000-1000-8000-00805f9b34fb',characteristics: [{ uuid:'0123'}]},
//   { uuid: '00001801-0000-1000-8000-00805f9b34fb',characteristics: [{ uuid:'4567'}]},
//   { uuid: '233e8100-3a1b-1c59-9bee-180373dd03a1',characteristics: [{ uuid:'89ab'}]},
//   { uuid: '0000180a-0000-1000-8000-00805f9b34fb',characteristics: [{ uuid:'cdef'}]},
// ])
