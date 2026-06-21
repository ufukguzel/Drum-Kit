const SOUND_MAP = {
  w: { name: "Tom 1", file: "sounds/tom-1.mp3" },
  a: { name: "Tom 3", file: "sounds/tom-3.mp3" },
  s: { name: "Tom 2", file: "sounds/tom-2.mp3" },
  d: { name: "Tom 4", file: "sounds/tom-4.mp3" },
  j: { name: "Snare", file: "sounds/snare.mp3" },
  k: { name: "Kick", file: "sounds/kick-bass.mp3" },
  l: { name: "Crash", file: "sounds/crash.mp3" }
};

const KIT_PRESETS = {
  rock: {
    label: "Rock",
    masterGain: 1,
    rates: { w: 1, a: 0.98, s: 1.01, d: 0.99, j: 1, k: 1, l: 1.03 },
    keyGain: { k: 1.1, l: 1.05 }
  },
  jazz: {
    label: "Jazz",
    masterGain: 0.85,
    rates: { w: 1.08, a: 1.05, s: 1.1, d: 1.06, j: 0.97, k: 0.92, l: 1.12 },
    keyGain: { j: 0.9, k: 0.8, l: 0.95 }
  },
  electro: {
    label: "Electro",
    masterGain: 0.92,
    rates: { w: 0.94, a: 0.92, s: 0.95, d: 0.93, j: 0.9, k: 0.86, l: 0.88 },
    keyGain: { k: 1.15, l: 1.08 },
    synthLayer: true
  }
};

const GROOVE_PATTERNS = {
  rock: {
    label: "Rock Beat",
    steps: [
      ["k", "l"], [], ["l"], [], ["j", "l"], [], ["l"], [],
      ["k", "l"], [], ["l"], ["a"], ["j", "l"], [], ["l"], ["s"]
    ]
  },
  funk: {
    label: "Funk Beat",
    steps: [
      ["k", "l"], [], ["k"], ["l"], ["j"], ["l"], ["k"], [],
      ["k", "l"], ["a"], ["j"], ["l"], ["k"], [], ["j", "l"], ["d"]
    ]
  },
  halftime: {
    label: "Half-Time Beat",
    steps: [
      ["k", "l"], [], [], ["l"], [], ["a"], [], [],
      ["k", "l"], [], [], ["l"], ["j"], ["s"], [], ["d"]
    ]
  }
};

const drumButtons = Array.from(document.querySelectorAll(".drum"));
const appContainer = document.querySelector(".app");
const appStatus = document.getElementById("app-status");
const lastHit = document.getElementById("last-hit");
const hitCount = document.getElementById("hit-count");
const tempo = document.getElementById("tempo");
const activeKit = document.getElementById("active-kit");
const loopLength = document.getElementById("loop-length");
const recordedNotes = document.getElementById("recorded-notes");

const powerToggle = document.getElementById("power-toggle");
const volumeControl = document.getElementById("volume-control");
const volumeValue = document.getElementById("volume-value");
const kitSelector = document.getElementById("kit-selector");
const metronomeToggle = document.getElementById("metronome-toggle");
const metronomeBpm = document.getElementById("metronome-bpm");
const metronomeValue = document.getElementById("metronome-value");
const grooveSelector = document.getElementById("groove-selector");
const autoGrooveBpm = document.getElementById("auto-groove-bpm");

const recordBtn = document.getElementById("record-btn");
const stopRecordBtn = document.getElementById("stop-record-btn");
const playLoopBtn = document.getElementById("play-loop-btn");
const stopLoopBtn = document.getElementById("stop-loop-btn");
const clearLoopBtn = document.getElementById("clear-loop-btn");
const startGrooveBtn = document.getElementById("start-groove-btn");
const stopGrooveBtn = document.getElementById("stop-groove-btn");
const drumSet = document.getElementById("drum-set");

const state = {
  powerOn: true,
  totalHits: 0,
  currentKit: "rock",
  lastHitAt: null,
  hitIntervals: [],
  statusTimeout: null,
  isRecording: false,
  isLooping: false,
  recordingStartAt: 0,
  recordedEvents: [],
  loopLengthMs: 0,
  loopTimeouts: [],
  metronomeTimer: null,
  metronomeBeat: 0,
  audioContext: null,
  isAutoGroove: false,
  autoGrooveTimer: null,
  autoGrooveStep: 0
};

const audioBank = {};

Object.keys(SOUND_MAP).forEach((key) => {
  const audio = new Audio(SOUND_MAP[key].file);
  audio.preload = "auto";
  audio.load();
  audioBank[key] = audio;
});

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(text, mode) {
  appStatus.textContent = text;
  appStatus.className = `status ${mode}`;
}

function normalizeBpm(rawValue) {
  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return 100;
  }
  return clamp(Math.round(parsedValue), 60, 220);
}

function syncBpmControls(rawValue) {
  const bpm = normalizeBpm(rawValue);
  metronomeBpm.value = String(bpm);
  metronomeValue.textContent = String(bpm);
  autoGrooveBpm.value = String(bpm);

  if (state.metronomeTimer) {
    stopMetronome();
    startMetronome();
  }

  if (state.isAutoGroove) {
    restartAutoGroove();
  }

  return bpm;
}

function updatePassiveStatus() {
  if (!state.powerOn) {
    setStatus("Sessiz Prova", "muted");
    return;
  }

  if (state.isRecording) {
    setStatus("Kayıt Alınıyor", "recording");
    return;
  }

  if (state.isLooping) {
    setStatus("Loop Çalıyor", "playing");
    return;
  }

  if (state.isAutoGroove) {
    setStatus("Hazır Ritim Çalıyor", "playing");
    return;
  }

  setStatus("Hazır", "ready");
}

function returnReadyState() {
  if (state.statusTimeout) {
    clearTimeout(state.statusTimeout);
  }

  state.statusTimeout = setTimeout(() => {
    updatePassiveStatus();
  }, 380);
}

function syncPadPowerState() {
  drumButtons.forEach((button) => {
    button.classList.toggle("off", !state.powerOn);
  });
}

function ensureAudioContext() {
  if (!window.AudioContext && !window.webkitAudioContext) {
    return null;
  }

  if (!state.audioContext) {
    const ContextCtor = window.AudioContext || window.webkitAudioContext;
    state.audioContext = new ContextCtor();
  }

  if (state.audioContext.state === "suspended") {
    state.audioContext.resume().catch(() => {
      setStatus("Ses motoru başlatılamadı", "error");
    });
  }

  return state.audioContext;
}

function updateTempo(now) {
  if (!state.lastHitAt) {
    state.lastHitAt = now;
    tempo.textContent = "-- BPM";
    return;
  }

  const interval = now - state.lastHitAt;
  state.lastHitAt = now;

  if (interval < 2000) {
    state.hitIntervals.push(interval);
    if (state.hitIntervals.length > 8) {
      state.hitIntervals.shift();
    }
  } else {
    state.hitIntervals = [];
  }

  if (state.hitIntervals.length >= 2) {
    const sum = state.hitIntervals.reduce((total, item) => total + item, 0);
    const average = sum / state.hitIntervals.length;
    const bpm = Math.round(60000 / average);
    tempo.textContent = `${bpm} BPM`;
  } else {
    tempo.textContent = "-- BPM";
  }
}

function animateDrum(key) {
  const activeButton = document.querySelector(`.${key}`);
  if (!activeButton) {
    return;
  }

  activeButton.classList.remove("pressed", "hit");
  void activeButton.offsetWidth;
  activeButton.classList.add("pressed", "hit");

  setTimeout(() => {
    activeButton.classList.remove("pressed");
  }, 120);

  setTimeout(() => {
    activeButton.classList.remove("hit");
  }, 220);

  drumSet.classList.remove("rumble");
  void drumSet.offsetWidth;
  drumSet.classList.add("rumble");
}

function playElectroLayer(key, gainLevel) {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const toneMap = {
    w: 220,
    a: 246.94,
    s: 261.63,
    d: 293.66,
    j: 329.63,
    k: 110,
    l: 392
  };

  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(toneMap[key] || 220, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16 * gainLevel, now + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playSound(key, kitName) {
  const baseAudio = audioBank[key];
  const kit = KIT_PRESETS[kitName] || KIT_PRESETS.rock;
  if (!baseAudio) {
    return;
  }

  const playback = baseAudio.cloneNode();
  const masterVolume = Number(volumeControl.value) / 100;
  const perKeyGain = kit.keyGain[key] || 1;

  playback.playbackRate = kit.rates[key] || 1;
  playback.volume = clamp(masterVolume * kit.masterGain * perKeyGain, 0, 1);
  playback.play().catch(() => {
    setStatus("Ses başlatılamadı", "error");
  });

  if (kit.synthLayer && state.powerOn) {
    playElectroLayer(key, clamp(masterVolume, 0.25, 1));
  }
}

function registerHit(key, kitName) {
  state.totalHits += 1;
  hitCount.textContent = String(state.totalHits);
  lastHit.textContent = `${SOUND_MAP[key].name} (${KIT_PRESETS[kitName].label})`;
  updateTempo(performance.now());
}

function shouldRunMetronome() {
  return metronomeToggle.checked && state.powerOn;
}

function playMetronomeTick(accent) {
  const context = ensureAudioContext();
  if (!context) {
    return;
  }

  const now = context.currentTime;
  const osc = context.createOscillator();
  const gain = context.createGain();
  const baseLevel = Number(volumeControl.value) / 100;

  osc.type = "triangle";
  osc.frequency.setValueAtTime(accent ? 1300 : 960, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime((accent ? 0.18 : 0.12) * baseLevel, now + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

  osc.connect(gain);
  gain.connect(context.destination);
  osc.start(now);
  osc.stop(now + 0.05);
}

function startMetronome() {
  if (!shouldRunMetronome() || state.metronomeTimer) {
    return;
  }

  const beatMs = 60000 / Number(metronomeBpm.value);
  state.metronomeBeat = 0;
  playMetronomeTick(true);
  state.metronomeTimer = window.setInterval(() => {
    state.metronomeBeat = (state.metronomeBeat + 1) % 4;
    playMetronomeTick(state.metronomeBeat === 0);
  }, beatMs);
}

function stopMetronome() {
  if (!state.metronomeTimer) {
    return;
  }

  window.clearInterval(state.metronomeTimer);
  state.metronomeTimer = null;
}

function getAutoGrooveStepMs() {
  return (60000 / normalizeBpm(autoGrooveBpm.value)) / 4;
}

function playAutoGrooveStep() {
  if (!state.isAutoGroove) {
    return;
  }

  const pattern = GROOVE_PATTERNS[grooveSelector.value] || GROOVE_PATTERNS.rock;
  const stepNotes = pattern.steps[state.autoGrooveStep % pattern.steps.length] || [];

  stepNotes.forEach((noteKey) => {
    triggerPad(noteKey, { fromAuto: true });
  });

  state.autoGrooveStep += 1;
}

function restartAutoGroove() {
  if (!state.isAutoGroove) {
    return;
  }

  if (state.autoGrooveTimer) {
    window.clearInterval(state.autoGrooveTimer);
  }

  state.autoGrooveTimer = window.setInterval(() => {
    playAutoGrooveStep();
  }, getAutoGrooveStepMs());
}

function stopAutoGroove() {
  if (state.autoGrooveTimer) {
    window.clearInterval(state.autoGrooveTimer);
    state.autoGrooveTimer = null;
  }

  if (!state.isAutoGroove) {
    return;
  }

  state.isAutoGroove = false;
  startGrooveBtn.classList.remove("active");
  updatePassiveStatus();
}

function startAutoGroove() {
  if (!state.powerOn) {
    setStatus("Power kapalıyken hazır ritim çalmaz", "error");
    returnReadyState();
    return;
  }

  stopRecording();
  stopLoopPlayback();
  stopAutoGroove();

  syncBpmControls(autoGrooveBpm.value);
  state.isAutoGroove = true;
  state.autoGrooveStep = 0;
  startGrooveBtn.classList.add("active");
  setStatus("Hazır Ritim Çalıyor", "playing");

  playAutoGrooveStep();
  restartAutoGroove();

  if (shouldRunMetronome()) {
    startMetronome();
  }
}

function refreshLoopStats() {
  recordedNotes.textContent = String(state.recordedEvents.length);
  if (!state.loopLengthMs) {
    loopLength.textContent = "--";
    return;
  }

  loopLength.textContent = `${(state.loopLengthMs / 1000).toFixed(2)} sn`;
}

function clearLoopTimers() {
  state.loopTimeouts.forEach((timerId) => window.clearTimeout(timerId));
  state.loopTimeouts = [];
}

function addRecordedEvent(key, kitName) {
  const offset = performance.now() - state.recordingStartAt;
  state.recordedEvents.push({
    key,
    kit: kitName,
    offset
  });
  refreshLoopStats();
}

function finalizeLoopLength() {
  if (!state.recordedEvents.length) {
    state.loopLengthMs = 0;
    refreshLoopStats();
    return;
  }

  const beatMs = 60000 / Number(metronomeBpm.value);
  const lastOffset = state.recordedEvents[state.recordedEvents.length - 1].offset;
  const targetLength = lastOffset + beatMs;
  state.loopLengthMs = Math.max(beatMs, Math.ceil(targetLength / beatMs) * beatMs);
  refreshLoopStats();
}

function stopRecording() {
  if (!state.isRecording) {
    return;
  }

  state.isRecording = false;
  recordBtn.classList.remove("active");
  finalizeLoopLength();
  updatePassiveStatus();
}

function startRecording() {
  if (!state.powerOn) {
    setStatus("Power kapalıyken kayıt başlatılamaz", "error");
    returnReadyState();
    return;
  }

  stopAutoGroove();
  stopLoopPlayback();
  state.recordedEvents = [];
  state.loopLengthMs = 0;
  refreshLoopStats();
  state.recordingStartAt = performance.now();
  state.isRecording = true;
  recordBtn.classList.add("active");
  setStatus("Kayıt Alınıyor", "recording");

  if (shouldRunMetronome()) {
    startMetronome();
  }
}

function loopCycle() {
  if (!state.isLooping || !state.loopLengthMs) {
    return;
  }

  state.recordedEvents.forEach((event) => {
    const timerId = window.setTimeout(() => {
      triggerPad(event.key, { fromLoop: true, forcedKit: event.kit });
    }, event.offset);
    state.loopTimeouts.push(timerId);
  });

  const nextCycleId = window.setTimeout(() => {
    loopCycle();
  }, state.loopLengthMs);
  state.loopTimeouts.push(nextCycleId);
}

function startLoopPlayback() {
  if (!state.recordedEvents.length) {
    setStatus("Önce kayıt al", "error");
    returnReadyState();
    return;
  }

  stopAutoGroove();

  if (!state.loopLengthMs) {
    finalizeLoopLength();
  }

  if (state.isRecording) {
    stopRecording();
  }

  if (state.isLooping) {
    return;
  }

  state.isLooping = true;
  playLoopBtn.classList.add("active");
  loopCycle();
  setStatus("Loop Çalıyor", "playing");

  if (shouldRunMetronome()) {
    startMetronome();
  }
}

function stopLoopPlayback() {
  if (!state.isLooping) {
    clearLoopTimers();
    return;
  }

  state.isLooping = false;
  playLoopBtn.classList.remove("active");
  clearLoopTimers();
  updatePassiveStatus();
}

function clearRecording() {
  stopRecording();
  stopLoopPlayback();
  state.recordedEvents = [];
  state.loopLengthMs = 0;
  refreshLoopStats();
  setStatus("Kayıt Temizlendi", "ready");
  returnReadyState();
}

function applyKitSelection(kitName) {
  state.currentKit = kitName;
  activeKit.textContent = KIT_PRESETS[kitName].label;
  appContainer.dataset.kit = kitName;
}

function triggerPad(key, options = {}) {
  const normalizedKey = key.toLowerCase();
  if (!SOUND_MAP[normalizedKey]) {
    return;
  }

  const kitName = options.forcedKit || state.currentKit;
  animateDrum(normalizedKey);

  if (!state.powerOn) {
    setStatus("Sessiz Prova", "muted");
    returnReadyState();
    return;
  }

  playSound(normalizedKey, kitName);
  registerHit(normalizedKey, kitName);

  if (state.isRecording && !options.fromLoop && !options.fromAuto) {
    addRecordedEvent(normalizedKey, kitName);
    setStatus("Kayıt Alınıyor", "recording");
    return;
  }

  if (!state.isLooping && !state.isAutoGroove) {
    setStatus("Çalıyor", "playing");
    returnReadyState();
  }
}

drumButtons.forEach((button) => {
  button.addEventListener("pointerdown", () => {
    ensureAudioContext();
  }, { passive: true });

  button.addEventListener("click", () => {
    triggerPad(button.dataset.key);
  });
});

document.addEventListener("keydown", (event) => {
  if (event.repeat) {
    return;
  }

  const key = event.key.toLowerCase();
  if (!SOUND_MAP[key]) {
    return;
  }

  ensureAudioContext();
  event.preventDefault();
  triggerPad(key);
});

powerToggle.addEventListener("change", () => {
  state.powerOn = powerToggle.checked;
  syncPadPowerState();

  if (!state.powerOn) {
    stopAutoGroove();
    stopLoopPlayback();
    stopRecording();
    stopMetronome();
  } else if (shouldRunMetronome()) {
    startMetronome();
  }

  updatePassiveStatus();
});

volumeControl.addEventListener("input", () => {
  volumeValue.textContent = `${volumeControl.value}%`;
});

kitSelector.addEventListener("change", () => {
  applyKitSelection(kitSelector.value);
});

metronomeToggle.addEventListener("change", () => {
  ensureAudioContext();
  if (shouldRunMetronome()) {
    startMetronome();
  } else {
    stopMetronome();
  }
});

metronomeBpm.addEventListener("input", () => {
  syncBpmControls(metronomeBpm.value);
});

recordBtn.addEventListener("click", () => {
  ensureAudioContext();
  startRecording();
});

stopRecordBtn.addEventListener("click", () => {
  stopRecording();
  updatePassiveStatus();
});

playLoopBtn.addEventListener("click", () => {
  ensureAudioContext();
  startLoopPlayback();
});

stopLoopBtn.addEventListener("click", () => {
  stopLoopPlayback();
});

clearLoopBtn.addEventListener("click", () => {
  clearRecording();
});

grooveSelector.addEventListener("change", () => {
  if (state.isAutoGroove) {
    state.autoGrooveStep = 0;
  }
});

autoGrooveBpm.addEventListener("input", () => {
  syncBpmControls(autoGrooveBpm.value);
});

startGrooveBtn.addEventListener("click", () => {
  ensureAudioContext();
  startAutoGroove();
});

stopGrooveBtn.addEventListener("click", () => {
  stopAutoGroove();
});

syncPadPowerState();
applyKitSelection(state.currentKit);
refreshLoopStats();
volumeValue.textContent = `${volumeControl.value}%`;
syncBpmControls(metronomeBpm.value);
updatePassiveStatus();