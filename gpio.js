// Dateiname: gpio.js

const rpio = require('rpio');
const Gpio = require('onoff').Gpio;

class RaspberryPi {
  constructor(rfidPin, servoPin) {
    this.rfidPin = rfidPin;
    this.servo = new Gpio(servoPin, 'out');
  }

  listenForRFID(allowedKeys, onAccessGranted, onAccessDenied) {
    rpio.open(this.rfidPin, rpio.INPUT);
    let key = '';
    rpio.poll(this.rfidPin, (pin) => {
      const value = rpio.read(pin);
      key += value;
      if (key.length === 10) { // assuming keys are 10 digits long
        if (allowedKeys.includes(key)) {
          onAccessGranted();
        } else {
          onAccessDenied();
        }
        key = '';
      }
    });
  }

  openDoor() {
    this.servo.writeSync(1);
    setTimeout(() => this.servo.writeSync(0), 1000); // close after 1 second
  }

  cleanup() {
    this.servo.unexport();
    rpio.close(this.rfidPin);
  }
}

module.exports = RaspberryPi;