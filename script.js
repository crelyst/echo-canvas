// script.js — EchoCanvas core functionality with persistence (localStorage)
(() => {
  const canvas = document.getElementById('echoCanvas');
  const ctx = canvas.getContext('2d');

  // UI elements
  const pitchRange = document.getElementById('pitchRange');
  const volumeRange = document.getElementById('volumeRange');
  const decayRange = document.getElementById('decayRange');
  const clearBtn = document.getElementById('clearBtn');
  const randomBtn = document.getElementById('randomBtn');
  const savePresetBtn = document.getElementById('savePreset');
  const presetNameInput = document.getElementById('presetName');
  const presetsList = document.getElementById('presetsList');

  // Setup audio
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audioCtx = new AudioCtx();
  const masterGain = audioCtx.createGain();
  masterGain.gain.value = parseFloat(volumeRange.value);
  masterGain.connect(audioCtx.destination);

  // state
  let echoes = [];
  const LS_KEY = 'echoCanvas.presets';
  let presets = loadPresetsFromStorage();

  // responsive canvas
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.floor(rect.width * ratio);
    canvas.height = Math.floor(rect.height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  window.addEventListener('resize', resize);
  setTimeout(resize, 50);

  // util random
  const rand = (a,b) => Math.random()*(b-a)+a;
  const hsvToRgb = (h,s,v) => {
    let f = (n,k=(n+h/60)%6) => v - v*s*Math.max(Math.min(k,4-k,1),0);
    return `rgb(${Math.round(f(5)*255)},${Math.round(f(3)*255)},${Math.round(f(1)*255)})`;
  };

  // create a tone for an echo
  function playTone(freq, dur=0.6) {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.value = masterGain.gain.value;
    o.connect(g);
    g.connect(masterGain);

    const now = audioCtx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + dur);
    o.start(now);
    o.stop(now + dur + 0.05);
  }

  // spawn echo at x,y
  function spawnEcho(x,y,opts={}) {
    const base = parseFloat(pitchRange.value) || 440;
    const freq = base * (1 + (y / canvas.clientHeight - 0.5) * 0.8);
    const hue = opts.hue ?? Math.floor(rand(0,360));
    const maxR = opts.radius ?? rand(40,220);
    const life = opts.life ?? parseFloat(decayRange.value);
    const created = performance.now();

    echoes.push({x,y,hue,r:maxR,life,created});
    playTone(freq, Math.min(2, life * 0.9));
  }

  // drawing loop
  function draw(now) {
    const t = performance.now();
    // subtle background wash
    ctx.fillStyle = 'rgba(6,10,18,0.15)';
    ctx.fillRect(0,0,canvas.width,canvas.height);

    // update echoes
    echoes = echoes.filter(e => {
      const age = (t - e.created)/1000;
      if (age > e.life) return false;
      const progress = age / e.life;
      const radius = e.r * (0.6 + progress*1.6);
      const alpha = Math.max(0, 1 - progress);
      ctx.beginPath();
      ctx.lineWidth = Math.max(1, 8 * (1 - progress));
      ctx.strokeStyle = hsvToRgb(e.hue, 0.8, 1).replace('rgb(', 'rgba(').replace(')', `,${alpha})`);
      ctx.arc(e.x, e.y, radius, 0, Math.PI*2);
      ctx.stroke();
      return true;
    });

    requestAnimationFrame(draw);
  }

  // pointer helpers
  function getPointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const px = (e.touches ? e.touches[0] : e).clientX - rect.left;
    const py = (e.touches ? e.touches[0] : e).clientY - rect.top;
    return {x: px, y: py};
  }

  // events
  canvas.addEventListener('pointerdown', e => {
    const {x,y} = getPointerPos(e);
    const hue = Math.floor(rand(0,360));
    spawnEcho(x, y, {hue});
  });

  clearBtn.addEventListener('click', () => {
    echoes = [];
    ctx.clearRect(0,0,canvas.width,canvas.height);
  });

  randomBtn.addEventListener('click', () => {
    for (let i=0;i<8;i++){
      const x = rand(20, canvas.clientWidth-20);
      const y = rand(20, canvas.clientHeight-20);
      const hue = Math.floor(rand(0,360));
      spawnEcho(x,y,{hue, radius: rand(60,240), life: rand(0.6,1.8)});
    }
  });

  pitchRange.addEventListener('input', ()=> {
    const el = pitchRange.nextElementSibling || pitchRange.parentElement.querySelector('.muted');
    if (el) el.textContent = `${Math.round(pitchRange.value)}Hz`;
  });
  volumeRange.addEventListener('input', ()=> {
    masterGain.gain.value = parseFloat(volumeRange.value);
    const el = volumeRange.nextElementSibling || volumeRange.parentElement.querySelector('.muted');
    if (el) el.textContent = `${Math.round(volumeRange.value*100)}%`;
  });
  decayRange.addEventListener('input', ()=> {
    const el = decayRange.nextElementSibling || decayRange.parentElement.querySelector('.muted');
    if (el) el.textContent = `${parseFloat(decayRange.value).toFixed(2)}s`;
  });

  // persistence helpers
  function loadPresetsFromStorage() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch(e) {
      console.warn('Failed to read presets', e);
      return {};
    }
  }
  function savePresetsToStorage() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(presets));
    } catch(e) {
      console.warn('Failed to save presets', e);
    }
  }

  // create and apply preset
  function makeCurrentPreset() {
    return {
      name: presetNameInput.value || `Preset ${Object.keys(presets).length+1}`,
      pitch: parseFloat(pitchRange.value),
      volume: parseFloat(volumeRange.value),
      decay: parseFloat(decayRange.value)
    };
  }
  function applyPreset(p) {
    pitchRange.value = p.pitch;
    volumeRange.value = p.volume;
    decayRange.value = p.decay;
    // update UI labels
    pitchRange.dispatchEvent(new Event('input'));
    volumeRange.dispatchEvent(new Event('input'));
    decayRange.dispatchEvent(new Event('input'));
    // create a little visual hint: spawn a warm echo in center with hue derived from name hash
    const h = Array.from(p.name).reduce((s,c)=>s + c.charCodeAt(0), 0) % 360;
    spawnEcho(canvas.clientWidth/2, canvas.clientHeight/2, {hue: h, radius: 120, life: Math.max(0.6, p.decay)});
  }

  savePresetBtn.addEventListener('click', () => {
    const preset = makeCurrentPreset();
    presets[preset.name] = preset;
    savePresetsToStorage();
    renderPresets();
    presetNameInput.value = '';
  });

  function deletePreset(name) {
    delete presets[name];
    savePresetsToStorage();
    renderPresets();
  }

  function renderPresets() {
    presetsList.innerHTML = '';
    const keys = Object.keys(presets);
    if (!keys.length) {
      presetsList.innerHTML = '<div class="muted">No presets yet</div>';
      return;
    }
    keys.forEach(name => {
      const p = presets[name];
      const item = document.createElement('div');
      item.className = 'preset-item';
      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.alignItems = 'center';
      left.style.gap = '8px';
      const sw = document.createElement('div');
      sw.className = 'color-sample';
      // small color hint from name
      sw.style.background = hsvToRgb(Array.from(name).reduce((s,c)=>s+c.charCodeAt(0),0)%360,0.7,0.9);
      const title = document.createElement('div');
      title.style.fontSize = '13px';
      title.textContent = name;
      left.appendChild(sw);
      left.appendChild(title);

      const right = document.createElement('div');
      right.style.display = 'flex';
      right.style.gap = '6px';
      const applyBtn = document.createElement('button');
      applyBtn.className = 'small';
      applyBtn.textContent = 'Apply';
      applyBtn.addEventListener('click', ()=> applyPreset(p));
      const delBtn = document.createElement('button');
      delBtn.className = 'small ghost';
      delBtn.textContent = 'Del';
      delBtn.addEventListener('click', ()=> {
        if (confirm(`Delete preset "${name}"?`)) deletePreset(name);
      });

      right.appendChild(applyBtn);
      right.appendChild(delBtn);

      item.appendChild(left);
      item.appendChild(right);
      presetsList.appendChild(item);
    });
  }

  // initial:
  resize();
  requestAnimationFrame(draw);
  renderPresets();

  // expose a small debug API (safe)
  window.EchoCanvas = {spawnEcho, echoes, audioCtx, getPresets: () => ({...presets})};
})();
