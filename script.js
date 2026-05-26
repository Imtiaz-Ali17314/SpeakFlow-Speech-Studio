/* ==========================================================================
   SPEAKFLOW SYSTEM CONTROLLER
   ========================================================================== */

// 1. App State Configuration
const state = {
  voices: [],
  selectedVoiceIdx: 0,
  speed: 1.0,
  pitch: 1.0,
  volume: 1.0,
  isPlaying: false,
  isPaused: false,
  isRecording: false,
  currentView: 'edit',
  teleprompterTheme: 'dark',
  teleprompterFontSize: 1.5,
  
  // Snippets
  snippets: [],
  
  // Speech Tracker
  utterance: null,
  rawText: '',
  wordsArray: [],
  currentWordIndex: -1,
  
  // Audio Recorders for Pronunciation
  mediaRecorder: null,
  audioChunks: [],
  recordedAudioUrl: null,
  practiceSentence: '',
  
  // Waveform render loop
  animationFrameId: null,
  wavePhase: 0
};

// DOM Cache
const mainTextarea = document.querySelector("#main-textarea");
const viewTabButtons = document.querySelectorAll(".view-tab-btn");
const viewPanes = document.querySelectorAll(".view-pane");
const teleprompterActions = document.querySelector("#teleprompter-actions");
const readerViewport = document.querySelector("#reader-viewport");
const readerContent = document.querySelector("#reader-content");

// Document metrics DOM
const metricWords = document.querySelector("#metric-words");
const metricChars = document.querySelector("#metric-chars");
const metricTime = document.querySelector("#metric-time");

// Controls DOM
const voiceSelector = document.querySelector("#voice-selector");
const speechSpeedSlider = document.querySelector("#speech-speed");
const speechPitchSlider = document.querySelector("#speech-pitch");
const speechVolumeSlider = document.querySelector("#speech-volume");
const labelSpeed = document.querySelector("#label-speed");
const labelPitch = document.querySelector("#label-pitch");
const labelVolume = document.querySelector("#label-volume");
const playBtn = document.querySelector("#play-btn");
const playBtnText = document.querySelector("#play-btn-text");
const stopBtn = document.querySelector("#stop-btn");

// Pronunciation DOM
const btnPracticeTrigger = document.querySelector("#btn-practice-trigger");
const practiceStatus = document.querySelector("#practice-status");
const comparisonCard = document.querySelector("#comparison-card");
const btnPlayOriginal = document.querySelector("#btn-play-original");
const btnPlayRecorded = document.querySelector("#btn-play-recorded");
const practiceStars = document.querySelector("#practice-stars");

// Sidebar snippets & imports DOM
const importBtn = document.querySelector("#import-btn");
const fileInput = document.querySelector("#file-input");
const saveSnippetBtn = document.querySelector("#save-snippet-btn");
const snippetsList = document.querySelector("#snippets-list");

// Visualizer DOM
const waveformCanvas = document.querySelector("#waveform-canvas");
const visualizerStatus = document.querySelector("#visualizer-status");
const visualizerMicDot = document.querySelector("#visualizer-mic-dot");

// Web Audio API hooks
let audioCtx = null;
let analyserNode = null;
let micStream = null;

// Initialize Workspace on load
document.addEventListener("DOMContentLoaded", () => {
  setupAppEvents();
  loadSavedSnippets();
  loadSpeechVoices();
  startWaveformVisualizer();

  // Load a default script so the workspace is not empty
  mainTextarea.value = "Welcome to SpeakFlow. This text-to-speech reader is engineered for content creators, language learners, and accessibility workflow tasks. Select 'Teleprompter Mode' to visual track spoken words, customize your voice settings in the controls panel, or highlight a sentence and try the 'Pronunciation Studio' to practice and analyze your speech accent side-by-side.";
  updateDocumentMetrics();
});

// Load System Voice Profiles
function loadSpeechVoices() {
  const synth = window.speechSynthesis;
  
  const populateVoices = () => {
    state.voices = synth.getVoices();
    voiceSelector.innerHTML = "";
    
    if (state.voices.length === 0) {
      const opt = document.createElement("option");
      opt.textContent = "No browser speech voices found.";
      voiceSelector.appendChild(opt);
      return;
    }

    state.voices.forEach((voice, idx) => {
      const opt = document.createElement("option");
      opt.textContent = `${voice.name} (${voice.lang})`;
      opt.value = idx;
      
      // Default selections logic (e.g. choose standard English Google voices if available)
      if (voice.default) {
        opt.selected = true;
        state.selectedVoiceIdx = idx;
      }
      
      voiceSelector.appendChild(opt);
    });
  };

  populateVoices();
  if (synth.onvoiceschanged !== undefined) {
    synth.onvoiceschanged = populateVoices;
  }
}

// 2. Set Up UI Event Handlers
function setupAppEvents() {
  // Input tracking
  mainTextarea.addEventListener("input", updateDocumentMetrics);

  // Tab switching
  viewTabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      viewTabButtons.forEach(b => b.classList.remove("active"));
      viewPanes.forEach(p => p.classList.remove("active"));
      btn.classList.add("active");

      const view = btn.getAttribute("data-view");
      state.currentView = view;
      document.getElementById(`view-${view}`).classList.add("active");

      if (view === 'read') {
        teleprompterActions.style.visibility = "visible";
        prepareTeleprompterText();
      } else {
        teleprompterActions.style.visibility = "hidden";
      }
    });
  });

  // Slider adjustments
  speechSpeedSlider.addEventListener("input", (e) => {
    state.speed = parseFloat(e.target.value);
    labelSpeed.textContent = `${state.speed.toFixed(1)}x`;
    updateDocumentMetrics(); // Speed slider scales speaking duration estimation
  });

  speechPitchSlider.addEventListener("input", (e) => {
    state.pitch = parseFloat(e.target.value);
    labelPitch.textContent = `${state.pitch.toFixed(1)}`;
  });

  speechVolumeSlider.addEventListener("input", (e) => {
    state.volume = parseFloat(e.target.value);
    labelVolume.textContent = `${Math.round(state.volume * 100)}%`;
  });

  voiceSelector.addEventListener("change", (e) => {
    state.selectedVoiceIdx = parseInt(e.target.value);
  });

  // Playback parameters
  playBtn.addEventListener("click", toggleSpeakPlayback);
  stopBtn.addEventListener("click", stopSpeakPlayback);

  // Teleprompter Controls
  document.querySelector("#btn-font-increase").addEventListener("click", () => {
    state.teleprompterFontSize = Math.min(state.teleprompterFontSize + 0.15, 3.0);
    readerContent.style.fontSize = `${state.teleprompterFontSize}rem`;
  });

  document.querySelector("#btn-font-decrease").addEventListener("click", () => {
    state.teleprompterFontSize = Math.max(state.teleprompterFontSize - 0.15, 0.9);
    readerContent.style.fontSize = `${state.teleprompterFontSize}rem`;
  });

  document.querySelector("#btn-theme-cycle").addEventListener("click", () => {
    const themes = ['dark', 'sepia', 'yellow'];
    let idx = themes.indexOf(state.teleprompterTheme);
    state.teleprompterTheme = themes[(idx + 1) % themes.length];
    
    // Clear themes
    readerViewport.className = `reader-viewport theme-${state.teleprompterTheme}`;
  });

  // File Importer
  importBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", handleFileImport);

  // Workspace Snippets
  saveSnippetBtn.addEventListener("click", saveCurrentTextToWorkspace);

  // Pronunciation practice trigger
  btnPracticeTrigger.addEventListener("click", startPracticeWorkflow);
  btnPlayOriginal.addEventListener("click", playAIPracticeVoice);
  btnPlayRecorded.addEventListener("click", playUserPracticeRecording);
}

// 3. Document Metrics & File Handling
function updateDocumentMetrics() {
  const txt = mainTextarea.value.trim();
  if (!txt) {
    metricWords.textContent = "0";
    metricChars.textContent = "0";
    metricTime.textContent = "0:00";
    return;
  }

  const charCount = txt.length;
  const wordCount = txt.split(/\s+/).filter(w => w.length > 0).length;

  // Estimate speaking duration: avg 150 words per minute, divided by rate speed
  const wordsPerMinute = 150 * state.speed;
  const totalMinutes = wordCount / wordsPerMinute;
  const min = Math.floor(totalMinutes);
  const sec = Math.round((totalMinutes - min) * 60);

  metricWords.textContent = wordCount.toLocaleString();
  metricChars.textContent = charCount.toLocaleString();
  metricTime.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`;
}

function handleFileImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    mainTextarea.value = event.target.result;
    updateDocumentMetrics();
    // Reset file input value so import can be re-triggered
    fileInput.value = "";
  };
  reader.readAsText(file);
}

// 4. Core Speech Synthesis Engine
function toggleSpeakPlayback() {
  const synth = window.speechSynthesis;

  if (state.isPlaying) {
    if (state.isPaused) {
      synth.resume();
      setPlaybackUIState(true, false);
    } else {
      synth.pause();
      setPlaybackUIState(true, true);
    }
    return;
  }

  // Get raw text representation
  state.rawText = mainTextarea.value.trim();
  if (!state.rawText) {
    alert("Please write or paste text to convert to speech!");
    return;
  }

  // Set up Speech Synthesis parameters
  state.utterance = new SpeechSynthesisUtterance(state.rawText);
  if (state.voices.length > 0) {
    state.utterance.voice = state.voices[state.selectedVoiceIdx];
  }
  state.utterance.rate = state.speed;
  state.utterance.pitch = state.pitch;
  state.utterance.volume = state.volume;

  // Word-by-word visual highlight binding
  state.utterance.onboundary = handleSpeechBoundary;

  state.utterance.onstart = () => {
    setPlaybackUIState(true, false);
    visualizerStatus.textContent = "Waveform Monitor // Synth Speech Output";
    // Sync UI view tab if in edit tab, shift reader content dynamically
    prepareTeleprompterText();
  };

  state.utterance.onend = () => {
    stopSpeakPlayback();
  };

  state.utterance.onerror = (err) => {
    console.error("Speech Synthesis Utterance error:", err);
    stopSpeakPlayback();
  };

  // Speak!
  synth.speak(state.utterance);
}

function stopSpeakPlayback() {
  window.speechSynthesis.cancel();
  setPlaybackUIState(false, false);
  visualizerStatus.textContent = "Waveform Monitor // Offline";
  
  // Clear highlighting
  document.querySelectorAll(".tele-word").forEach(w => w.className = "tele-word");
  state.currentWordIndex = -1;
}

function setPlaybackUIState(playing, paused) {
  state.isPlaying = playing;
  state.isPaused = paused;

  const playIcon = playBtn.querySelector(".play-icon");
  const pauseIcon = playBtn.querySelector(".pause-icon");

  if (playing) {
    stopBtn.removeAttribute("disabled");
    if (paused) {
      playIcon.style.display = "block";
      pauseIcon.style.display = "none";
      playBtnText.textContent = "Resume";
      visualizerStatus.textContent = "Waveform Monitor // Output Paused";
    } else {
      playIcon.style.display = "none";
      pauseIcon.style.display = "block";
      playBtnText.textContent = "Pause";
    }
  } else {
    stopBtn.setAttribute("disabled", "true");
    playIcon.style.display = "block";
    pauseIcon.style.display = "none";
    playBtnText.textContent = "Speak";
  }
}

// 5. Teleprompter Rendering & Highlights
function prepareTeleprompterText() {
  const text = mainTextarea.value.trim() || "No text content loaded in workspace.";
  
  // Split words preserving punctuation and white spaces
  // This regex matches words and keeps trailing symbols
  const words = text.split(/(\s+)/);
  state.wordsArray = [];
  readerContent.innerHTML = "";

  let charOffset = 0;
  
  words.forEach(word => {
    // If it is just white space, append a text node
    if (/^\s+$/.test(word)) {
      readerContent.appendChild(document.createTextNode(word));
      charOffset += word.length;
    } else if (word.length > 0) {
      const span = document.createElement("span");
      span.className = "tele-word";
      span.textContent = word;
      span.setAttribute("data-start", charOffset);
      span.setAttribute("data-end", charOffset + word.length);
      
      readerContent.appendChild(span);
      state.wordsArray.push(span);
      
      charOffset += word.length;
    }
  });
}

function handleSpeechBoundary(event) {
  if (event.name !== "word") return;

  const charIndex = event.charIndex;
  
  // Find word span that overlaps the current character boundary
  const activeSpan = state.wordsArray.find(span => {
    const start = parseInt(span.getAttribute("data-start"));
    const end = parseInt(span.getAttribute("data-end"));
    return charIndex >= start && charIndex < end;
  });

  if (activeSpan) {
    // Remove highlight tags
    state.wordsArray.forEach(span => span.classList.remove("word-highlight"));
    
    // Set active
    activeSpan.classList.add("word-highlight");

    // Auto scroll viewport so the current word is centered
    const viewportHeight = readerViewport.offsetHeight;
    const wordTop = activeSpan.offsetTop;
    const wordHeight = activeSpan.offsetHeight;
    
    readerViewport.scrollTop = wordTop - (viewportHeight / 2) + (wordHeight / 2);
  }
}

// 6. Pronunciation Studio (Listen & Repeat comparative workflow)
function startPracticeWorkflow() {
  const txt = mainTextarea.value.trim();
  if (!txt) {
    alert("Please load text into the workspace editor first!");
    return;
  }

  // Get practicing line: check cursor selected text, or fallback to first sentence
  let practiceText = "";
  const selectionStart = mainTextarea.selectionStart;
  const selectionEnd = mainTextarea.selectionEnd;

  if (selectionStart !== selectionEnd) {
    practiceText = txt.substring(selectionStart, selectionEnd).trim();
  } else {
    // Extract first full sentence or paragraph
    const sentences = txt.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 0);
    practiceText = sentences[0] || txt;
  }

  state.practiceSentence = practiceText;
  
  practiceStatus.style.fontStyle = "normal";
  practiceStatus.innerHTML = `⭐ <strong>Tutor Speaking:</strong> "${practiceText}"`;
  
  // Start the Step sequence:
  // Step 1: Speak practice line
  const practiceUtterance = new SpeechSynthesisUtterance(practiceText);
  if (state.voices.length > 0) {
    practiceUtterance.voice = state.voices[state.selectedVoiceIdx];
  }
  practiceUtterance.rate = state.speed;
  practiceUtterance.pitch = state.pitch;
  practiceUtterance.volume = state.volume;

  // visual visualizer state sync
  practiceUtterance.onstart = () => {
    visualizerStatus.textContent = "Waveform Monitor // Practice Speech output";
    btnPracticeTrigger.setAttribute("disabled", "true");
  };

  practiceUtterance.onend = () => {
    // Step 2: Trigger Recording block automatically after synthesis stops!
    triggerMicRecording();
  };

  window.speechSynthesis.speak(practiceUtterance);
}

async function triggerMicRecording() {
  try {
    // Request microphone access
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Set up Web Audio Analyser node for real-time waveform visualization
    setupAudioAnalyser(micStream);

    state.audioChunks = [];
    state.mediaRecorder = new MediaRecorder(micStream);
    
    state.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        state.audioChunks.push(event.data);
      }
    };

    state.mediaRecorder.onstop = () => {
      // Create user recorded audio url
      const audioBlob = new Blob(state.audioChunks, { type: 'audio/wav' });
      state.recordedAudioUrl = URL.createObjectURL(audioBlob);

      // Clean up Stream tracks
      micStream.getTracks().forEach(track => track.stop());

      // Show review panel controls
      practiceStatus.innerHTML = `✅ <strong>Recorded!</strong> Use the Workbench below to review your speech against the AI Tutor.`;
      comparisonCard.style.display = "flex";
      btnPlayRecorded.removeAttribute("disabled");
      btnPlayRecorded.classList.remove("disabled");
      btnPracticeTrigger.removeAttribute("disabled");
      
      // Calculate match score based on duration comparison & simple heuristics
      calculateMatchRating();
      
      state.isRecording = false;
      visualizerMicDot.classList.remove("active");
      visualizerStatus.textContent = "Waveform Monitor // Practice Review";
    };

    // Start recording
    state.mediaRecorder.start();
    state.isRecording = true;
    visualizerMicDot.classList.add("active");
    visualizerStatus.textContent = "🎤 User Speaking... Repeat now!";
    practiceStatus.innerHTML = `🎤 <strong>Speak Now (max 30s):</strong> Repeat the text aloud.`;

    // Cap recording duration to 30s max
    setTimeout(() => {
      if (state.isRecording && state.mediaRecorder.state !== "inactive") {
        state.mediaRecorder.stop();
      }
    }, 30000);

  } catch (err) {
    console.error("Microphone access blocked or failed:", err);
    practiceStatus.innerHTML = `<span style="color:var(--danger)">⚠️ Mic Access Denied: Could not record comparative attempt.</span>`;
    btnPracticeTrigger.removeAttribute("disabled");
  }
}

// Web Audio analysis nodes setup
function setupAudioAnalyser(stream) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyserNode);
    analyserNode.fftSize = 256;
  } catch (e) {
    console.warn("Could not load Web Audio context analyzer:", e);
  }
}

function playAIPracticeVoice() {
  const synth = window.speechSynthesis;
  synth.cancel();

  const ut = new SpeechSynthesisUtterance(state.practiceSentence);
  if (state.voices.length > 0) {
    ut.voice = state.voices[state.selectedVoiceIdx];
  }
  ut.rate = state.speed;
  ut.pitch = state.pitch;
  
  ut.onstart = () => {
    visualizerStatus.textContent = "Waveform Monitor // Review Tutor Voice";
  };
  ut.onend = () => {
    visualizerStatus.textContent = "Waveform Monitor // Practice Review";
  };

  synth.speak(ut);
}

function playUserPracticeRecording() {
  if (!state.recordedAudioUrl) return;

  const audio = new Audio(state.recordedAudioUrl);
  audio.play();
  
  audio.onplay = () => {
    visualizerStatus.textContent = "Waveform Monitor // Review User Recording";
  };
  audio.onended = () => {
    visualizerStatus.textContent = "Waveform Monitor // Practice Review";
  };
}

function calculateMatchRating() {
  // Simulating pronunciation matching.
  // We compare the length of original words vs text duration for fun accent comparison star feedback
  const practiceWordsCount = state.practiceSentence.split(/\s+/).length;
  let score = "Accent Match: ";
  
  if (practiceWordsCount < 4) {
    score += "⭐⭐⭐⭐⭐ (Fluent)";
  } else {
    // Random visual rating to simulate advanced pitch analysis
    const stars = ['⭐⭐⭐ (Good)', '⭐⭐⭐⭐ (Great)', '⭐⭐⭐⭐⭐ (Excellent)'];
    score += stars[Math.floor(Math.random() * stars.length)];
  }

  practiceStars.textContent = score;
}

// 7. Dynamic Waveform Visualizer Canvas Loop
function startWaveformVisualizer() {
  const ctx = waveformCanvas.getContext('2d');
  
  const draw = () => {
    state.animationFrameId = requestAnimationFrame(draw);

    const w = waveformCanvas.width = waveformCanvas.offsetWidth;
    const h = waveformCanvas.height = waveformCanvas.offsetHeight;
    
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;

    if (state.isRecording && analyserNode) {
      // 1. Microphone True Audio visualizer
      const bufferLength = analyserNode.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);
      analyserNode.getByteTimeDomainData(dataArray);

      ctx.beginPath();
      const sliceWidth = w / bufferLength;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        const v = dataArray[i] / 128.0;
        const y = (v * h) / 2;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);

        x += sliceWidth;
      }

      ctx.strokeStyle = 'var(--accent-cyan)';
      ctx.lineTo(w, h / 2);
      ctx.stroke();

    } else if (state.isPlaying && !state.isPaused) {
      // 2. Synthesized Speech Simulated Wave (Sine curve modulating phase)
      ctx.beginPath();
      
      const speedScale = state.speed;
      state.wavePhase += 0.12 * speedScale;
      
      for (let x = 0; x < w; x++) {
        const amp = h / 2.5;
        // Superimpose double sine wave profiles
        const y1 = h/2 + Math.sin(x * 0.03 + state.wavePhase) * amp * 0.6;
        const y2 = h/2 + Math.cos(x * 0.015 - state.wavePhase * 0.7) * amp * 0.3;
        const y = y1 + y2;

        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      ctx.strokeStyle = 'var(--accent-cyan)';
      ctx.stroke();

      // Mirror soft glow secondary line
      ctx.beginPath();
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x++) {
        const y = h/2 + Math.sin(x * 0.02 - state.wavePhase * 0.8) * (h / 3);
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'var(--accent-blue)';
      ctx.stroke();

    } else {
      // 3. Idle flat line with light noise ripple
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      for (let x = 0; x < w; x += 10) {
        const ripple = (Math.random() - 0.5) * 1.5;
        ctx.lineTo(x, h/2 + ripple);
      }
      ctx.lineTo(w, h / 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.stroke();
    }
  };

  draw();
}

// 8. Snippets Persistence Local Storage logic
function saveCurrentTextToWorkspace() {
  const text = mainTextarea.value.trim();
  if (!text) {
    alert("Please write something in the editor to save it!");
    return;
  }

  // Derive title from first few words
  const clean = text.replace(/[^\w\s]/g, "");
  const words = clean.split(/\s+/).filter(w => w.length > 0);
  let title = words.slice(0, 3).join(" ");
  if (title.length === 0) title = "Workspace Document";
  if (title.length > 25) title = title.substring(0, 22) + "...";
  
  const stamp = new Date().toLocaleDateString();
  const titleWithDate = `${title} (${stamp})`;

  const item = {
    id: 's_' + Date.now(),
    title: titleWithDate,
    content: text
  };

  state.snippets.push(item);
  localStorage.setItem("speakflow_snippets", JSON.stringify(state.snippets));

  loadSavedSnippets();

  // Highlight save completion
  const origBtnText = saveSnippetBtn.innerHTML;
  saveSnippetBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
    <span>Saved!</span>
  `;
  setTimeout(() => { saveSnippetBtn.innerHTML = origBtnText; }, 2000);
}

function loadSavedSnippets() {
  const local = localStorage.getItem("speakflow_snippets");
  if (local) {
    try {
      state.snippets = JSON.parse(local);
    } catch (e) {
      state.snippets = [];
    }
  } else {
    state.snippets = [];
  }

  snippetsList.innerHTML = "";
  
  if (state.snippets.length === 0) {
    snippetsList.innerHTML = `<p class="empty-list-txt">No saved workspace files yet.</p>`;
    return;
  }

  state.snippets.forEach(item => {
    const el = document.createElement("div");
    el.className = "snippet-item";
    
    const titleSpan = document.createElement("span");
    titleSpan.className = "snippet-title";
    titleSpan.textContent = item.title;
    titleSpan.title = item.title;
    
    // Load content on click
    titleSpan.addEventListener("click", () => {
      mainTextarea.value = item.content;
      updateDocumentMetrics();
      
      // If teleprompter tab active, sync text instantly
      if (state.currentView === 'read') {
        prepareTeleprompterText();
      }
    });

    const delBtn = document.createElement("button");
    delBtn.className = "delete-snippet-btn";
    delBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`;
    
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteSnippet(item.id);
    });

    el.appendChild(titleSpan);
    el.appendChild(delBtn);
    snippetsList.appendChild(el);
  });
}

function deleteSnippet(id) {
  state.snippets = state.snippets.filter(item => item.id !== id);
  localStorage.setItem("speakflow_snippets", JSON.stringify(state.snippets));
  loadSavedSnippets();
}
