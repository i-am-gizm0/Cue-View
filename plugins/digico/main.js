exports.config = {
  defaultName: 'DiGiCo',
  connectionType: 'osc-udp',
  defaultPort: 9000,
  mayChangePort: false,
  heartbeatInterval: 9000,
  heartbeatTimeout: 11000,
  searchOptions: {
    type: 'UDPsocket',
    // send "/Console/Name/?" this is what the iPad sends to check connection
    searchBuffer: Buffer.from([
      0x2f, 0x43, 0x6f, 0x6e, 0x73, 0x6f, 0x6c, 0x65, 0x2f, 0x4e, 0x61, 0x6d, 0x65, 0x2f, 0x3f,
    ]),
    devicePort: 9000,
    listenPort: 8000,
    validateResponse(msg, info) {
      console.log(msg);
      console.log(msg.toString());
      return msg.toString().includes('/Console');
    },
  },
};

exports.ready = function ready(_device) {
  const device = _device;
  device.data = new DiGiCo();
  // This is what the DiGiCo iPad app sends on connection
  device.send('/Console/Name/?');
  device.send('/Console/Session/Filename/?');
  device.send('/Console/Channels/?');
  device.send('/Console/Input_Channels/modes/?');
  device.send('/Console/Group_Outputs/modes/?');
  device.send('/Console/Aux_Outputs/modes/?');
  device.send('/Console/Multis/?');

  device.send('/Snapshots/Surface_Snapshot/?');

  device.send('/Snapshots/Current_Snapshot/?');

  device.send('/Input_Channels/?');

  device.send('/Layout/Layout/Banks/?');

  // These are also sent by the iPad app but aren't queries (?) so may potentially write to console?
  // device.send('/Meters/clear');
  // device.send('/Meters/clear');
};
exports.data = function data(_device, oscData) {
  const device = _device;
  this.deviceInfoUpdate(device, 'status', 'ok');

  console.log(oscData);
  setObjectProperty(device.data, oscData.address, oscData.args);
  console.log(device.data);
};

exports.heartbeat = function heartbeat(device) {};

class DiGiCo {
  constructor() {
    this.Console = {};
    this.Input_Channels = {};
    this.Aux_Outputs = {};
    this.Control_Groups = {};
    this.Group_Outputs = {};
    this.Matrix_Outputs = {};
    this.Layout = {};
  }
}

/*
 This function takes somethings like this /Console/Session/Filename with a osc args like ['session.ses'] 
 and turns it into a nested object like. An easy way to set properties converting OSC paths to properties
 {
    Console: {
      Session: {
        Filename: 'session.ses'
      }
    }
 }

*/
function setObjectProperty(_object, path, value) {
  let object = _object;
  const properties = path.split('/');
  properties.shift();
  for (let i = 0; i < properties.length - 1; i++) {
    const property = properties[i];
    if (object[property] === undefined) {
      object[property] = {};
    }
    object = object[property];
  }
  const property = properties[properties.length - 1];
  if (Array.isArray(value)) {
    // if this is an array of length one just set the property to the contents so ['string'] becomes 'string'
    if (value.length === 1) {
      object[property] = value[0];
      return;
    }
  }
  object[property] = value;
}