// Phonon Studio - Real-Time Web Audio Streaming and Batch Transcription Client
let currentAudioBlob = null;
let currentFileName = "";
let isRecording = false;

// Audio Context and Streaming state
let micStream = null;
let recordedAudioContext = null;
let scriptProcessor = null;
let liveWs = null;
let isWsReady = false;
let pcmRawBuffers = [];
let finalizedTranscript = "";
let currentPartialText = "";
let recordStartTime = null;
let recordTimerInterval = null;

// Sample Prompts for reading aloud
const SAMPLE_PROMPTS = [
  "Artificial intelligence models are becoming smaller, faster, and more efficient every day.",
  "Good morning everyone, let us begin today's meeting by reviewing the quarterly performance report.",
  "The quick brown fox jumps over the lazy dog and runs across the green field.",
  "He could wait no longer. For a full hour he had paced up and down waiting, but he could wait no longer.",
  "Flight seventy-two is cleared for takeoff on runway two-eight left, wind zero-nine-zero at twelve knots."
];
let currentPromptIndex = 0;

// DOM Elements
const tabUpload = document.getElementById("tabUpload");
const tabRecord = document.getElementById("tabRecord");
const uploadSection = document.getElementById("uploadSection");
const recordSection = document.getElementById("recordSection");
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const recordBtn = document.getElementById("recordBtn");
const recordTimer = document.getElementById("recordTimer");
const recordStatusLabel = document.getElementById("recordStatusLabel");
const liveIndicator = document.getElementById("liveIndicator");
const audioPreviewCard = document.getElementById("audioPreviewCard");
const previewFileName = document.getElementById("previewFileName");
const previewFileMeta = document.getElementById("previewFileMeta");
const clearAudioBtn = document.getElementById("clearAudioBtn");
const audioPlayer = document.getElementById("audioPlayer");
const transcribeBtn = document.getElementById("transcribeBtn");
const transcribeBtnText = document.getElementById("transcribeBtnText");
const btnSpinner = document.getElementById("btnSpinner");
const transcriptBox = document.getElementById("transcriptBox");
const copyBtn = document.getElementById("copyBtn");
const elapsedBadge = document.getElementById("elapsedBadge");
const wordCountBadge = document.getElementById("wordCountBadge");
const backendStatus = document.getElementById("backendStatus");
const actionBar = document.getElementById("actionBar");
const samplePromptText = document.getElementById("samplePromptText");
const shufflePromptBtn = document.getElementById("shufflePromptBtn");
const promptChips = document.getElementById("promptChips");
const exportBtn = document.getElementById("exportBtn");
const clearTranscriptBtn = document.getElementById("clearTranscriptBtn");
const pipelineState = document.getElementById("pipelineState");

// Sample Prompt Handling
function setPrompt(index) {
  currentPromptIndex = index;
  samplePromptText.textContent = `"${SAMPLE_PROMPTS[index]}"`;
  const chips = promptChips.querySelectorAll(".chip-btn");
  chips.forEach((c, idx) => {
    if (idx === index) c.classList.add("active");
    else c.classList.remove("active");
  });
}

promptChips.addEventListener("click", (e) => {
  if (e.target.classList.contains("chip-btn")) {
    const idx = parseInt(e.target.getAttribute("data-index"), 10);
    setPrompt(idx);
  }
});

shufflePromptBtn.addEventListener("click", () => {
  const nextIdx = (currentPromptIndex + 1) % SAMPLE_PROMPTS.length;
  setPrompt(nextIdx);
});

// Tab Switching
tabUpload.addEventListener("click", () => {
  tabUpload.classList.add("active");
  tabRecord.classList.remove("active");
  uploadSection.classList.add("active");
  recordSection.classList.remove("active");
  actionBar.style.display = "flex";
});

tabRecord.addEventListener("click", () => {
  tabRecord.classList.add("active");
  tabUpload.classList.remove("active");
  recordSection.classList.add("active");
  uploadSection.classList.remove("active");
  actionBar.style.display = "none";
});

// Drop Zone and File Selection
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", async (e) => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    await handleFileSelected(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener("change", async (e) => {
  if (e.target.files && e.target.files.length > 0) {
    await handleFileSelected(e.target.files[0]);
  }
});

// Process Selected File (Auto-converts MP3/M4A/etc. to 16kHz WAV in-browser)
async function handleFileSelected(file) {
  const ext = file.name.split(".").pop().toLowerCase();
  
  if (["mp3", "m4a", "aac", "webm"].includes(ext)) {
    pipelineState.textContent = "Converting...";
    transcriptBox.innerHTML = '<span class="placeholder-text">Converting audio in browser (MP3 -> 16kHz WAV)...</span>';
    try {
      const arrayBuffer = await file.arrayBuffer();
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const tempCtx = new AudioCtx();
      const audioBuffer = await tempCtx.decodeAudioData(arrayBuffer);
      
      const channelData = audioBuffer.getChannelData(0);
      const resampled = resampleAudio(channelData, audioBuffer.sampleRate, 16000);
      const wavBlob = encodeWAV(resampled, 16000);
      
      const newName = file.name.replace(/\.[^/.]+$/, "") + ".wav";
      const meta = `${(resampled.length / 16000).toFixed(1)}s · ${(wavBlob.size / 1024 / 1024).toFixed(2)} MB (16kHz WAV)`;
      setAudioSource(wavBlob, newName, meta);
      pipelineState.textContent = "Ready to Transcribe";
      transcriptBox.innerHTML = '<p class="placeholder-text">Audio loaded. Click "Transcribe File" to run GPU inference.</p>';
      await tempCtx.close();
      return;
    } catch (err) {
      console.warn("In-browser conversion error, falling back to original file:", err);
    }
  }

  setAudioSource(file, file.name, (file.size / (1024 * 1024)).toFixed(2) + " MB");
  pipelineState.textContent = "File Ready";
}

function setAudioSource(blob, name, metaText) {
  currentAudioBlob = blob;
  currentFileName = name;
  previewFileName.textContent = name;
  previewFileMeta.textContent = metaText;
  audioPlayer.src = URL.createObjectURL(blob);
  audioPreviewCard.style.display = "flex";
  transcribeBtn.disabled = false;
}

clearAudioBtn.addEventListener("click", () => {
  currentAudioBlob = null;
  currentFileName = "";
  audioPlayer.src = "";
  fileInput.value = "";
  audioPreviewCard.style.display = "none";
  transcribeBtn.disabled = true;
  pipelineState.textContent = "Idle";
});

// ==========================================
// LIVE STREAMING VIA WEBSOCKET (Float32 PCM)
// ==========================================
recordBtn.addEventListener("click", async () => {
  if (!isRecording) {
    await startLiveRecording();
  } else {
    await stopLiveRecording();
  }
});

async function startLiveRecording() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });

    isRecording = true;
    isWsReady = false;
    pcmRawBuffers = [];
    finalizedTranscript = "";
    currentPartialText = "";

    recordBtn.classList.add("recording");
    recordBtn.textContent = "STOP";
    liveIndicator.style.display = "flex";
    recordStatusLabel.textContent = "Connecting...";
    pipelineState.textContent = "Connecting";
    transcriptBox.innerHTML = '<span class="placeholder-text">Connecting to WebSocket...</span>';
    elapsedBadge.style.display = "none";
    copyBtn.disabled = true;

    // Connect WebSocket directly to Phonon streaming port 8000 (forcing IPv4)
    const wsProto = location.protocol === "https:" ? "wss:" : "ws:";
    const host = location.hostname;
    const wsHost = (!host || host === "localhost" || host === "::1") ? "127.0.0.1" : host;
    const wsUrl = `${wsProto}//${wsHost}:8000/v1/audio/stream?api_key=phonon-local`;
    
    liveWs = new WebSocket(wsUrl);
    liveWs.binaryType = "arraybuffer";

    liveWs.onopen = () => {
      // Send session init frame: 16kHz float32
      liveWs.send(JSON.stringify({ sample_rate: 16000, format: "pcm_f32le" }));
      isWsReady = true;
      recordStatusLabel.textContent = "Live dictation active";
      pipelineState.textContent = "Streaming Live";
      transcriptBox.innerHTML = '<span class="placeholder-text">Listening... Read the prompt aloud or speak freely...</span>';
    };

    liveWs.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "partial") {
          currentPartialText = msg.text;
          renderLiveTranscript();
        } else if (msg.type === "final") {
          finalizedTranscript += (finalizedTranscript ? " " : "") + msg.text;
          currentPartialText = "";
          renderLiveTranscript();
        } else if (msg.type === "done") {
          if (msg.text) finalizedTranscript = msg.text;
          currentPartialText = "";
          renderLiveTranscript();
          pipelineState.textContent = "Done";
        } else if (msg.type === "error") {
          console.error("Phonon WebSocket error:", msg.message);
          transcriptBox.innerHTML = `<span style="color: var(--danger)">Error: ${msg.message}</span>`;
          pipelineState.textContent = "Error";
        }
      } catch (err) {
        console.error("WS message parse error:", err);
      }
    };

    liveWs.onerror = (e) => {
      console.error("WebSocket connection error:", e);
      recordStatusLabel.textContent = "Connection error";
      pipelineState.textContent = "Connection Error";
    };

    liveWs.onclose = () => {
      isWsReady = false;
    };

    // Web Audio setup for streaming raw PCM 16kHz
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    recordedAudioContext = new AudioContextClass();
    if (recordedAudioContext.state === "suspended") {
      await recordedAudioContext.resume();
    }

    const source = recordedAudioContext.createMediaStreamSource(micStream);
    const nativeSampleRate = recordedAudioContext.sampleRate;

    // Buffer size 4096 gives ~85ms chunks at 48kHz
    scriptProcessor = recordedAudioContext.createScriptProcessor(4096, 1, 1);
    scriptProcessor.onaudioprocess = (e) => {
      if (!isRecording) return;
      const input = e.inputBuffer.getChannelData(0);
      
      // Save for WAV audio preview playback later
      pcmRawBuffers.push(new Float32Array(input));

      // Resample to 16 kHz Float32
      const resampled = resampleAudio(input, nativeSampleRate, 16000);

      // Stream Float32Array binary directly to Phonon CUDA server
      if (liveWs && liveWs.readyState === WebSocket.OPEN && isWsReady) {
        liveWs.send(resampled.buffer);
      }
    };

    source.connect(scriptProcessor);
    scriptProcessor.connect(recordedAudioContext.destination);

    // Timer
    recordStartTime = Date.now();
    recordTimer.textContent = "00:00";
    recordTimerInterval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartTime) / 1000);
      const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
      const secs = String(elapsed % 60).padStart(2, "0");
      recordTimer.textContent = `${mins}:${secs}`;
    }, 500);

  } catch (err) {
    console.error("Microphone initialization error:", err);
    alert("Microphone access failed: " + err.message);
    stopLiveRecording();
  }
}

function renderLiveTranscript() {
  let html = "";
  if (finalizedTranscript) {
    html += `<span>${escapeHtml(finalizedTranscript)}</span>`;
  }
  if (currentPartialText) {
    html += ` <span class="partial-text">${escapeHtml(currentPartialText)}</span>`;
  }
  if (!html) {
    html = '<span class="placeholder-text">Listening... Speak now...</span>';
  }
  transcriptBox.innerHTML = html;
  
  const textCombined = ((finalizedTranscript || "") + " " + (currentPartialText || "")).trim();
  const words = textCombined ? textCombined.split(/\s+/).length : 0;
  wordCountBadge.textContent = `${words} words`;

  copyBtn.disabled = !finalizedTranscript && !currentPartialText;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

async function stopLiveRecording() {
  if (!isRecording) return;
  isRecording = false;
  clearInterval(recordTimerInterval);
  recordBtn.classList.remove("recording");
  recordBtn.textContent = "REC";
  liveIndicator.style.display = "none";
  recordStatusLabel.textContent = "Dictation finished";
  pipelineState.textContent = "Completed";

  // End WebSocket stream
  if (liveWs) {
    if (liveWs.readyState === WebSocket.OPEN) {
      liveWs.send(JSON.stringify({ type: "end" }));
      setTimeout(() => {
        try { liveWs.close(); } catch (e) {}
      }, 500);
    }
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  const sampleRate = recordedAudioContext ? recordedAudioContext.sampleRate : 44100;
  if (recordedAudioContext) {
    await recordedAudioContext.close();
    recordedAudioContext = null;
  }

  // Create preview WAV
  if (pcmRawBuffers.length > 0) {
    let totalLength = 0;
    for (const b of pcmRawBuffers) totalLength += b.length;
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const b of pcmRawBuffers) {
      merged.set(b, offset);
      offset += b.length;
    }
    const downsampled = resampleAudio(merged, sampleRate, 16000);
    const wavBlob = encodeWAV(downsampled, 16000);
    const durationSec = (downsampled.length / 16000).toFixed(1);
    const filename = `recording_${new Date().toISOString().slice(11, 19).replace(/:/g, "-")}.wav`;
    setAudioSource(wavBlob, filename, `${durationSec}s · Live Audio`);
  }
}

// Resampling helper
function resampleAudio(audioBuffer, fromSampleRate, toSampleRate) {
  if (fromSampleRate === toSampleRate) return audioBuffer;
  const ratio = fromSampleRate / toSampleRate;
  const newLength = Math.round(audioBuffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    const originIdx = i * ratio;
    const idxFloor = Math.floor(originIdx);
    const idxCeil = Math.min(audioBuffer.length - 1, idxFloor + 1);
    const weight = originIdx - idxFloor;
    result[i] = audioBuffer[idxFloor] * (1 - weight) + audioBuffer[idxCeil] * weight;
  }
  return result;
}

// WAV Encoder helper (16-bit PCM Mono)
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let index = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(index, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    index += 2;
  }

  return new Blob([view], { type: "audio/wav" });
}

// ==========================================
// FILE BATCH TRANSCRIBE
// ==========================================
transcribeBtn.addEventListener("click", async () => {
  if (!currentAudioBlob) return;

  setLoading(true);
  pipelineState.textContent = "Running Inference";
  transcriptBox.innerHTML = '<span class="placeholder-text">Transcribing audio on GPU...</span>';
  copyBtn.disabled = true;
  elapsedBadge.style.display = "none";

  const startTime = performance.now();
  const formData = new FormData();
  formData.append("file", currentAudioBlob, currentFileName || "audio.wav");

  try {
    const res = await fetch("/api/transcribe", {
      method: "POST",
      body: formData,
    });

    const elapsedSec = ((performance.now() - startTime) / 1000).toFixed(2);

    if (!res.ok) {
      const errText = await res.text();
      let msg = errText;
      try {
        const parsed = JSON.parse(errText);
        msg = parsed.error || parsed.message || errText;
      } catch (e) {}
      throw new Error(`HTTP ${res.status}: ${msg}`);
    }

    const data = await res.json();
    finalizedTranscript = data.text || "";
    currentPartialText = "";
    renderLiveTranscript();

    elapsedBadge.textContent = `${elapsedSec}s`;
    elapsedBadge.style.display = "inline-block";
    pipelineState.textContent = `Completed (${elapsedSec}s)`;
    copyBtn.disabled = false;
  } catch (err) {
    transcriptBox.innerHTML = `<span style="color: var(--danger)">Error: ${err.message}</span>`;
    pipelineState.textContent = "Error";
  } finally {
    setLoading(false);
  }
});

function setLoading(loading) {
  transcribeBtn.disabled = loading;
  if (loading) {
    btnSpinner.style.display = "inline-block";
    transcribeBtnText.textContent = "Processing...";
  } else {
    btnSpinner.style.display = "none";
    transcribeBtnText.textContent = "Transcribe File";
  }
}

// Action Buttons: Copy, Export, Clear
copyBtn.addEventListener("click", () => {
  const text = transcriptBox.innerText || transcriptBox.textContent;
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    const originalText = copyBtn.textContent;
    copyBtn.textContent = "COPIED";
    setTimeout(() => {
      copyBtn.textContent = originalText;
    }, 1500);
  });
});

clearTranscriptBtn.addEventListener("click", () => {
  finalizedTranscript = "";
  currentPartialText = "";
  transcriptBox.innerHTML = '<p class="placeholder-text">Audio transcript will appear here in real time as you speak...</p>';
  wordCountBadge.textContent = "0 words";
  elapsedBadge.style.display = "none";
  copyBtn.disabled = true;
  pipelineState.textContent = "Idle";
});

exportBtn.addEventListener("click", () => {
  const text = transcriptBox.innerText || transcriptBox.textContent;
  if (!text || text.includes("Audio transcript will appear here")) return;
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `transcript_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
  a.click();
});

// Periodic Backend Health Check
async function checkBackendHealth() {
  try {
    const res = await fetch("/api/health");
    if (res.ok) {
      const data = await res.json();
      backendStatus.className = "status-badge online";
      backendStatus.querySelector(".status-text").textContent = "GPU READY";
    } else {
      throw new Error();
    }
  } catch (e) {
    backendStatus.className = "status-badge offline";
    backendStatus.querySelector(".status-text").textContent = "OFFLINE (8000)";
  }
}

checkBackendHealth();
setInterval(checkBackendHealth, 5000);
