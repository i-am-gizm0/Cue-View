const _ = require('lodash');
const fs = require('fs');
const path = require('path');

exports.config = {
  defaultName: 'QLab',
  connectionType: 'osc',
  defaultPort: 53000,
  mayChangePort: true,
  heartbeatInterval: 100,
  heartbeatTimeout: 5000,
  searchOptions: {
    type: 'Bonjour',
    bonjourName: 'qlab',
  },
  fields: [
    {
      key: 'passcode',
      label: 'Pass',
      type: 'textinput',
      value: '',
      action(device) {
        device.send('/workspaces');
      },
    },
  ],
};

const valuesForKeysString =
  '["uniqueID","number","name","listName","isBroken","isRunning","isLoaded","isFlagged",' +
  '"type","children","preWait","postWait","duration","colorName","continueMode",' +
  '"mode","parent","cartRows","cartColumns","cartPosition","displayName","preWaitElapsed",' +
  '"actionElapsed","postWaitElapsed","isPaused","currentCueTarget","isRunning","armed"]';

exports.ready = function ready(_device) {
  const device = _device;
  device.send(`/version`);
  device.send('/workspaces');
  device.data.workspaces = {};
  device.data.cueKeys = {};
  device.data.somethingPlaying = false;

  device.templates = {
    cue: _.template(fs.readFileSync(path.join(__dirname, `cue.ejs`))),
    tile: _.template(fs.readFileSync(path.join(__dirname, `tile.ejs`))),
    cart: _.template(fs.readFileSync(path.join(__dirname, `cart.ejs`))),
    cuelist: _.template(fs.readFileSync(path.join(__dirname, `cuelist.ejs`))),
  };
};

exports.data = function data(_device, oscData) {
  const device = _device;
  // console.log(oscData);

  const msgAddr = oscData.address.split('/');
  msgAddr.shift();

  if (oscData.address === '/reply/workspaces') {
    const json = JSON.parse(oscData.args[0]).data;

    for (let i = 0; i < json.length; i++) {
      device.data.workspaces[json[i].uniqueID] = {
        version: json[i].version,
        displayName: json[i].displayName,
        port: json[i].port,
        udpReplyPort: json[i].udpReplyPort,
        cueLists: [],
        selected: [],
      };
      device.send(`/workspace/${json[i].uniqueID}/connect`, device.fields.passcode);
    }
    this.deviceInfoUpdate(device, 'status', 'ok');
  } else if (/reply\/workspace\/.*\/connect/.test(oscData.address)) {
    const json = JSON.parse(oscData.args[0]).data;
    if (json === 'badpass') {
      device.data.permission = 'denied';
    } else {
      device.data.permission = 'ok';
      device.send(`/workspace/${msgAddr[2]}/cueLists`);
      device.send(`/workspace/${msgAddr[2]}/updates`, [{ type: 'i', value: 1 }]);
    }
  } else if (/reply\/workspace\/.*\/cueLists/.test(oscData.address)) {
    const json = JSON.parse(oscData.args[0]).data;
    device.data.workspaces[msgAddr[2]].cueLists = json;
    device.data.somethingPlaying = false;
    processCueList(device.data.workspaces[msgAddr[2]].cueLists, Object.keys(device.data.cueKeys), device, []);
    device.draw();
  } else if (/reply\/cue_id\/.*\/valuesForKeys/.test(oscData.address)) {
    const json = JSON.parse(oscData.args[0]);
    const keyValues = json.data;
    const cue = device.data.cueKeys[msgAddr[2]];

    if (cue === undefined) {
      // this cue is new!
      console.log('HERE');
      // device.send(`/workspace/${json.workspace_id}/cueLists`);
      // device.draw();
    } else {
      // console.log(keyValues.number);
      cue.uniqueID = keyValues.uniqueID;
      cue.number = keyValues.number;
      cue.listName = keyValues.listName;
      cue.isBroken = keyValues.isBroken;
      cue.isRunning = keyValues.isRunning;
      cue.isLoaded = keyValues.isLoaded;
      cue.isFlagged = keyValues.isFlagged;
      cue.type = keyValues.type;
      cue.cues = keyValues.children;
      cue.preWait = keyValues.preWait;
      cue.postWait = keyValues.postWait;
      cue.duration = keyValues.duration;
      cue.colorName = keyValues.colorName;
      cue.continueMode = keyValues.continueMode;
      cue.mode = keyValues.mode;
      cue.parent = keyValues.parent;
      cue.cartRows = keyValues.cartRows;
      cue.cartColumns = keyValues.cartColumns;
      cue.cartPosition = keyValues.cartPosition;
      cue.displayName = keyValues.displayName;
      cue.preWaitElapsed = keyValues.preWaitElapsed;
      cue.actionElapsed = keyValues.actionElapsed;
      cue.postWaitElapsed = keyValues.postWaitElapsed;
      cue.isPaused = keyValues.isPaused;
      cue.currentCueTarget = keyValues.currentCueTarget;
      cue.armed = keyValues.armed;

      if (keyValues.isRunning) {
        device.data.somethingPlaying = true;
      }

      let testCue = device.data.cueKeys[msgAddr[2]];
      let nestedGroupModes;

      if (cue.type === 'Group') {
        nestedGroupModes = [testCue.mode];
      } else if (cue.parent !== '[root group of cue lists]') {
        nestedGroupModes = [device.data.cueKeys[cue.parent].mode];
      }

      while (testCue.parent !== '[root group of cue lists]') {
        testCue = device.data.cueKeys[testCue.parent];
        if (testCue === undefined) {
          break;
        }

        nestedGroupModes.unshift(testCue.mode);
        cue.nestedGroupModes = nestedGroupModes;
      }
      if (cue.type === 'Cue List' || cue.type === 'Group') {
        device.data.cueKeys[msgAddr[2]].cueInWorkspace.cues = [...keyValues.children];
      }
      if (cue.type !== 'Cue List') {
        device.update('updateCueRow', { cue, workspace: device.data.workspaces[json.workspace_id] });
      }
    }
    // console.log(cue);
  } else if (/reply\/cue_id\/active\/.*Elapsed/.test(oscData.address)) {
    const json = JSON.parse(oscData.args[0]);
    const addrParts = json.address.split('/');
    const cueID = addrParts[4];
    const keyName = addrParts[5];
    device.data.cueKeys[cueID][keyName] = json.data;
    device.data.somethingPlaying = true;
    device.draw();
  } else if (/reply\/workspace\/.*\/selectedCues/.test(oscData.address)) {
    const json = JSON.parse(oscData.args[0]);
    const workspace = device.data.workspaces[msgAddr[2]];
    workspace.selected = [];
    for (let i = 0; i < json.data.length; i++) {
      workspace.selected.push(json.data[i].uniqueID);
    }
    device.update('updatePlaybackAndSelected', { workspace: device.data.workspaces[json.workspace_id] });
  } else if (/update\/workspace\/.*\/cue_id\/.*/.test(oscData.address)) {
    if (device.data.cueKeys[msgAddr[4]] && device.data.cueKeys[msgAddr[4]].type === 'Group') {
      device.send(`/workspace/${msgAddr[2]}/cueLists`);
    } else {
      device.send(`/cue_id/${msgAddr[4]}/valuesForKeys`, [{ type: 's', value: valuesForKeysString }]);
    }
  } else if (/update\/workspace\/.*\/cueList\/.*\/playbackPosition/.test(oscData.address)) {
    const workspace = device.data.workspaces[msgAddr[2]];
    // const cue = workspace.cues[oscData.args[0]];
    workspace.playbackPosition = oscData.args[0];
    // device.draw();
    device.update('updatePlaybackAndSelected', { workspace: device.data.workspaces[msgAddr[2]] });
  } else if (/update\/workspace\/.*\/dashboard/.test(oscData.address)) {
    device.send(`/workspace/${msgAddr[2]}/selectedCues`);
    device.send(`/cue_id/active/preWaitElapsed`);
  }
};

function processCueList(list, knownCueIDs, _device, _nestedIndex) {
  const nestedIndex = _nestedIndex;
  const device = _device;

  for (let i = 0; i < list.length; i++) {
    const cue = list[i];
    nestedIndex[nestedIndex.length - 1] = list.length - i - 1;

    // if (!knownCueIDs.includes(cue.uniqueID)) {
    device.send(`/cue_id/${cue.uniqueID}/valuesForKeys`, [{ type: 's', value: valuesForKeysString }]);
    // }

    if (cue.cues.length > 0) {
      const nest2 = [..._nestedIndex];
      nest2.push(cue.cues.length);
      processCueList(cue.cues, knownCueIDs, device, nest2);
      for (let j = 0; j < nestedIndex.length; j++) {
        nestedIndex[j]++;
      }
    }

    if (!knownCueIDs.includes(cue.uniqueID)) {
      device.data.cueKeys[cue.uniqueID] = {
        nestedGroupPosition: [...nestedIndex],
      };
    } else {
      device.data.cueKeys[cue.uniqueID].nestedGroupPosition = [...nestedIndex];
    }

    device.data.cueKeys[cue.uniqueID].cueInWorkspace = list[i];
  }
}

exports.update = function update(device, doc, updateType, data) {
  if (updateType === 'updateCueRow') {
    const $elem = doc.getElementById(data.cue.uniqueID);
    $elem.outerHTML = device.templates.cue({ allCues: device.data.cueKeys, cue: data.cue, workspace: data.workspace });
  } else if (updateType === 'updatePlaybackAndSelected') {
    Array.from(doc.querySelectorAll('.selected')).forEach(($el) => {
      $el.classList.remove('selected');
    });
    Array.from(doc.querySelectorAll('.playback-position')).forEach(($el) => {
      $el.classList.remove('playback-position');
    });
    for (let i = 0; i < data.workspace.selected.length; i++) {
      const $elem = doc.getElementById(data.workspace.selected[i]);
      $elem.classList.add('selected');
    }
    if (data.workspace.playbackPosition) {
      const $elem = doc.getElementById(data.workspace.playbackPosition);
      $elem.classList.add('playback-position');
    }
  }
};

let ticks = 0;
exports.heartbeat = function heartbeat(device) {
  ticks++;
  if (ticks % 10 === 0) {
    device.send(`/thump`);
  }
  if (device.data.somethingPlaying) {
    device.send(`/cue_id/active/preWaitElapsed`);
    device.send(`/cue_id/active/postWaitElapsed`);
    device.send(`/cue_id/active/actionElapsed`);
  }
};
