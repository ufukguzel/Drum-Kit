const SOUND_MAP = {
  w: { name: "Tom 1", file: "sounds/tom-1.mp3" },
  a: { name: "Tom 3", file: "sounds/tom-3.mp3" },
  s: { name: "Tom 2", file: "sounds/tom-2.mp3" },
  d: { name: "Tom 4", file: "sounds/tom-4.mp3" },
  j: { name: "Snare", file: "sounds/snare.mp3" },
  k: { name: "Kick", file: "sounds/kick-bass.mp3" },
  l: { name: "Crash", file: "sounds/crash.mp3" }
};

const drumButtons = Array.from(document.querySelectorAll(".drum"));
const appStatus = document.getElementById("app-status");
const lastHit = document.getElementById("last-hit");
const hitCount = document.getElementById("hit-count");
const tempo = document.getElementById("tempo");
const powerToggle = document.getElementById("power-toggle");
const volumeControl = document.getElementById("volume-control");
const volumeValue = document.getElementById("volume-value");
const drumSet = document.getElementById("drum-set");

const state = {
  powerOn: true,
  totalHits: 0,
  lastHitAt: null,
  hitIntervals: [],
  statusTimeout: null
};

const audioBank = {};

Object.keys(SOUND_MAP).forEach((key) => {
  const audio = new Audio(SOUND_MAP[key].file);
  audio.preload = "auto";
  audio.load();
  audioBank[key] = audio;
});

function setStatus(text, mode) {
  appStatus.textContent = text;
  appStatus.className = `status ${mode}`;
}

function syncPadPowerState() {
  drumButtons.forEach((button) => {
    button.classList.toggle("off", !state.powerOn);
  });
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

function playSound(key) {
  const baseAudio = audioBank[key];
  if (!baseAudio) {
    return;
  }

  const playback = baseAudio.cloneNode();
  playback.volume = Number(volumeControl.value) / 100;
  playback.play().catch(() => {
    setStatus("Ses başlatılamadı", "error");
  });
}

function registerHit(key) {
  state.totalHits += 1;
  hitCount.textContent = String(state.totalHits);
  lastHit.textContent = SOUND_MAP[key].name;
  updateTempo(performance.now());
}

function returnReadyState() {
  if (state.statusTimeout) {
    clearTimeout(state.statusTimeout);
  }

  state.statusTimeout = setTimeout(() => {
    if (state.powerOn) {
      setStatus("Hazır", "ready");
    } else {
      setStatus("Sessiz Prova", "muted");
    }
  }, 450);
}

function triggerPad(key) {
  const normalizedKey = key.toLowerCase();
  if (!SOUND_MAP[normalizedKey]) {
    return;
  }

  animateDrum(normalizedKey);

  if (!state.powerOn) {
    setStatus("Sessiz Prova", "muted");
    returnReadyState();
    return;
  }

  playSound(normalizedKey);
  registerHit(normalizedKey);
  setStatus("Çalıyor", "playing");
  returnReadyState();
}

drumButtons.forEach((button) => {
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

  event.preventDefault();
  triggerPad(key);
});

powerToggle.addEventListener("change", () => {
  state.powerOn = powerToggle.checked;
  syncPadPowerState();
  setStatus(state.powerOn ? "Hazır" : "Sessiz Prova", state.powerOn ? "ready" : "muted");
});

volumeControl.addEventListener("input", () => {
  volumeValue.textContent = `${volumeControl.value}%`;
});

syncPadPowerState();
setStatus("Hazır", "ready");