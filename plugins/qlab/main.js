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
  '"actionElapsed","postWaitElapsed","isPaused","currentCueTarget","isRunning","armed","notes"]';

exports.ready = function ready(_device) {
  const device = _device;
  device.send(`/version`);
  device.send('/workspaces');
  device.data.workspaces = {};
  device.data.cueKeys = {};
  device.data.version = '';
  device.data.lastElapsedMessage = 0;
  device.data.ticks = 0;

  device.templates = {
    cue: _.template(fs.readFileSync(path.join(__dirname, `cue.ejs`))),
    tile: _.template(fs.readFileSync(path.join(__dirname, `tile.ejs`))),
    cart: _.template(fs.readFileSync(path.join(__dirname, `cart.ejs`))),
    cuelist: _.template(fs.readFileSync(path.join(__dirname, `cuelist.ejs`))),
  };
};

exports.data = function data(_device, oscData) {
  const device = _device;

  const msgAddr = oscData.address.split('/');
  msgAddr.shift();

  let json = [];
  try {
    json = JSON.parse(oscData.args[0]);
  } catch (err) {
    // a handful of messages don't respond with JSON
  }

  if (Object.keys(json).length > 0) {
    if (json.status === 'denied') {
      if (device.data.workspaces[json.workspace_id]) {
        device.data.workspaces[json.workspace_id].permission = 'denied';
      }
      return;
    }
    if (json.status === 'error') {
      device.send('/workspaces');
      return;
    }
  }

  if (oscData.address === '/reply/workspaces') {
    for (let i = 0; i < json.data.length; i++) {
      device.data.workspaces[json.data[i].uniqueID] = {
        version: json.data[i].version,
        displayName: json.data[i].displayName,
        port: json.data[i].port,
        udpReplyPort: json.data[i].udpReplyPort,
        cueLists: [],
        selected: [],
      };
      device.data.version = json.data[i].version;
      device.data.workspaces[json.data[i].uniqueID].permission = 'ok';
      device.send(`/workspace/${json.data[i].uniqueID}/connect`, device.fields.passcode);
    }
    this.deviceInfoUpdate(device, 'status', 'ok');
  } else if (/reply\/workspace\/.*\/connect/.test(oscData.address)) {
    if (json.data === 'badpass') {
      device.data.workspaces[json.workspace_id].permission = 'badpass';
    } else {
      device.data.workspaces[json.workspace_id].permission = 'ok';
      device.send(`/workspace/${msgAddr[2]}/cueLists`);
      device.send(`/workspace/${msgAddr[2]}/updates`, [{ type: 'i', value: 1 }]);
    }
  } else if (/reply\/workspace\/.*\/cueLists/.test(oscData.address)) {
    device.data.workspaces[msgAddr[2]].cueLists = json.data;
    processCueList(device.data.workspaces[msgAddr[2]].cueLists, Object.keys(device.data.cueKeys), device, []);
    device.draw();
  } else if (/reply\/cue_id\/.*\/valuesForKeys/.test(oscData.address)) {
    const keyValues = json.data;
    let cue = device.data.cueKeys[msgAddr[2]];

    if (cue === undefined) {
      device.data.cueKeys[msgAddr[2]] = {};
      cue = device.data.cueKeys[msgAddr[2]];
    }
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
    cue.notes = keyValues.notes;

    if (keyValues.isRunning) {
      device.data.lastElapsedMessage = device.data.ticks;
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
    if (cue.type === 'Cue List' || cue.type === 'Group' || cue.type === 'Cart') {
      if (device.data.cueKeys[msgAddr[2]].cueInWorkspace) {
        device.data.cueKeys[msgAddr[2]].cueInWorkspace.cues = [...keyValues.children];
      }
    }
    if (cue.type !== 'Cue List' && cue.type !== 'Cart') {
      device.update('updateCueRow', { cue, workspace: device.data.workspaces[json.workspace_id] });
    }
    if (cue.type === 'Cart') {
      device.draw();
    }
  } else if (/reply\/cue_id\/(.*)\/(.*)Elapsed/.test(oscData.address)) {
    const workspace = device.data.workspaces[json.workspace_id];
    let cueID;
    let keyName;
    device.data.lastElapsedMessage = device.data.ticks;

    if (workspace?.version.startsWith('5.')) {
      const addrParts = json.address.split('/');
      cueID = addrParts[4];
      keyName = addrParts[5];
    } else {
      const addrParts = json.address.split('/');
      cueID = addrParts[2];
      keyName = addrParts[3];
    }

    device.data.cueKeys[cueID][keyName] = json.data;

    device.update('updateCueRow', { cue: device.data.cueKeys[cueID], workspace });
  } else if (/reply\/workspace\/.*\/selectedCues/.test(oscData.address)) {
    const workspace = device.data.workspaces[msgAddr[2]];
    if (!workspace) {
      return;
    }
    workspace.selected = [];
    for (let i = 0; i < json.data.length; i++) {
      workspace.selected.push(json.data[i].uniqueID);
    }
    device.update('updatePlaybackAndSelected', { workspace: device.data.workspaces[json.workspace_id] });
  } else if (/reply\/(workspace\/.*\/)?cue_id\/(.*)\/children/.test(oscData.address)) {
    // qlab 4 leaves off the workspace/<workspace_id> portion of the address this regex handles that
    const addressMatch = oscData.address.match(/reply\/(workspace\/.*\/)?cue_id\/(.*)\/children/);
    // trying to use .cueInWorkspace to reference the related cue in data.workspaces
    device.data.cueKeys[addressMatch[2]].cueInWorkspace.cues = [...json.data];
    console.log(device.data.cueKeys[addressMatch[2]].cueInWorkspace.cues);

    device.draw();
  } else if (/update\/workspace\/.*\/cue_id\/.*/.test(oscData.address)) {
    if (device.data.cueKeys[msgAddr[4]] && device.data.cueKeys[msgAddr[4]].type === 'Group') {
      device.send(`/workspace/${msgAddr[2]}/cue_id/${msgAddr[4]}/children/`);
    } else if (device.data.cueKeys[msgAddr[4]] && device.data.cueKeys[msgAddr[4]].type === 'Cue List') {
      device.send(`/workspace/${msgAddr[2]}/cueLists`);
    } else if (device.data.cueKeys[msgAddr[4]] && device.data.cueKeys[msgAddr[4]].type === 'Cart') {
      device.send(`/workspace/${msgAddr[2]}/cueLists`);
    } else {
      device.send(`/cue_id/${msgAddr[4]}/valuesForKeys`, [{ type: 's', value: valuesForKeysString }]);
    }
  } else if (/update\/workspace\/.*\/cueList\/.*\/playbackPosition/.test(oscData.address)) {
    const workspace = device.data.workspaces[msgAddr[2]];
    if (workspace) {
      workspace.playbackPosition = oscData.args[0];
      device.update('updatePlaybackAndSelected', { workspace: device.data.workspaces[msgAddr[2]] });
    }
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

    if (!knownCueIDs.includes(cue.uniqueID)) {
      device.send(`/cue_id/${cue.uniqueID}/valuesForKeys`, [{ type: 's', value: valuesForKeysString }]);
    }

    if (cue.cues?.length > 0) {
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

    // working theory is that list[i] is a new object rather pointing to the object within data.workspaces
    device.data.cueKeys[cue.uniqueID].cueInWorkspace = list[i];
  }
}

exports.update = function update(device, _doc, updateType, data) {
  const doc = _doc;
  if (updateType === 'updateCueRow') {
    const $elem = doc.getElementById(data.cue.uniqueID);
    if ($elem) {
      if (device.data.cueKeys[data.cue.parent].type === 'Cart') {
        $elem.outerHTML = device.templates.tile({
          allCues: device.data.cueKeys,
          cue: data.cue,
          workspace: data.workspace,
        });
      } else {
        $elem.outerHTML = device.templates.cue({
          allCues: device.data.cueKeys,
          cue: data.cue,
          workspace: data.workspace,
        });
      }
    }
  } else if (updateType === 'updatePlaybackAndSelected') {
    Array.from(doc.querySelectorAll('.selected')).forEach(($el) => {
      $el.classList.remove('selected');
    });
    Array.from(doc.querySelectorAll('.playback-position')).forEach(($el) => {
      $el.classList.remove('playback-position');
    });

    for (let i = 0; i < data.workspace.selected.length; i++) {
      const $elem = doc.getElementById(data.workspace.selected[i]);
      if ($elem) {
        $elem.classList.add('selected');
      }
    }

    const $playheadInfo = doc.getElementById('playhead-information');
    const $playheadName = doc.getElementById('playhead-name');
    const $playheadNotes = doc.getElementById('playhead-notes');

    if (data.workspace.playbackPosition) {
      const $cueRow = doc.getElementById(data.workspace.playbackPosition);
      if ($cueRow) {
        $cueRow.classList.add('playback-position');
        $cueRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }

      const cue = device.data.cueKeys[data.workspace.playbackPosition];
      if (cue) {
        $playheadName.setAttribute('class', `playhead-name cartColor-${cue.colorName} playhead-disarmed`);
        $playheadInfo.classList.add('playhead-active');
        if (cue.number) {
          $playheadName.innerHTML = `${cue.number} &bull; ${cue.displayName}`;
        } else {
          $playheadName.innerHTML = cue.displayName;
        }
        if (cue.notes) {
          $playheadNotes.innerHTML = cue.notes;
        } else {
          $playheadNotes.innerHTML = '<span style="color:#5C5C5C">Notes</span>';
        }
        if (!cue.armed) {
          $playheadName.classList.add('playhead-disarmed');
        } else {
          $playheadName.classList.remove('playhead-disarmed');
        }
      }
    } else {
      $playheadName.setAttribute('class', `playhead-name`);
      $playheadName.innerHTML = '<span style="color:#747574">[no cue on standby]</span>';
      $playheadNotes.innerHTML = '';
      $playheadInfo.classList.remove('playhead-active');
    }
  }
};

exports.heartbeat = function heartbeat(device) {
  device.data.ticks++;
  if (device.data.ticks % 10 === 0) {
    device.send(`/thump`);
  }
  if (device.data.ticks - device.data.lastElapsedMessage < 5) {
    device.send(`/cue_id/active/preWaitElapsed`);
    device.send(`/cue_id/active/postWaitElapsed`);
    device.send(`/cue_id/active/actionElapsed`);
  }
};
