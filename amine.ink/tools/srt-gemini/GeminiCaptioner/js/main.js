(function () {
  "use strict";

  const STORAGE_KEYS = {
    apiKey: "geminiCaptioner.apiKey",
    textDirection: "geminiCaptioner.textDirection"
  };

  let apiKey = "AIzaSyDcjE8ku11RVMsb-91VQCpFQ4JQTKYV1-4";
  const MAX_FILE_BYTES = 18 * 1024 * 1024; // Gemini inline attachments limit
  const STATUS = {
    idle: "Ready",
    uploading: "Preparing audio...",
    talking: "Talking to Gemini...",
    done: "Completed",
    error: "Error"
  };

    const MODEL_ALIASES = {
    "models/gemini-2.5-flash-latest": "models/gemini-2.5-flash",
    "models/gemini-2.5-pro-latest": "models/gemini-2.5-pro",
    "models/gemini-1.5-pro-latest": "models/gemini-2.5-pro",
    "models/gemini-1.5-flash-latest": "models/gemini-2.5-flash",
    "models/gemini-1.5-pro": "models/gemini-2.5-pro",
    "models/gemini-1.5-flash": "models/gemini-2.5-flash",
    "models/gemini-flash-lite-latest": "models/gemini-flash-lite-latest"
  };

  const wordGuidance = {
    single:
      "Keep each caption to exactly one word when natural pauses allow it. Split words only when absolutely necessary.",
    short:
      "Keep captions concise at around 2-4 words each. Split longer sentences into multiple captions to stay readable and in sync.",
    medium:
      "Aim for roughly 4-8 words per caption, breaking at natural phrase boundaries while preserving timing accuracy.",
    sentence:
      "Use full sentences per caption whenever possible, keeping millisecond timing aligned with natural pauses."
  };

  const lineGuidance = {
    "1":
      "Render each caption as a single line. Do not insert manual line breaks or exceed one line per subtitle block.",
    "2":
      "Allow up to two lines per caption. Use line breaks to balance line length and keep the caption easy to read.",
    "3":
      "Permit up to three lines per caption. Insert line breaks only when they improve legibility without changing speech order."
  };

  const scriptGuidance = {
    latin:
      "Write all languages using Latin characters. For Arabic or Darija speech, provide a natural Latin transliteration (example: 'kanbghik bzf habibi').",
    arabic:
      "Write the entire transcription in Arabic script. For non-Arabic speech, transcribe phonetically in Arabic when it remains understandable.",
    both:
      "Use the native script for each language: Arabic or Darija in Arabic script, English and French in Latin script. Preserve code-switching in place."
  };

  function buildTranscriptionPrompt(wordsKey, linesKey, scriptKey) {
    return `
You are an expert multilingual and dialect-aware transcriptionist.
Your task is to produce a professional-quality SubRip (.srt) in the format: (HH:MM:SS,mmm) subtitle file with millisecond-level accuracy.

Transcription requirements:
- Detect and accurately represent all spoken languages, dialects, and accents (including Moroccan Darija).
- Preserve foreign words and borrowings in their authentic written form.
- ${wordGuidance[wordsKey]}
- ${lineGuidance[linesKey]}
- ${scriptGuidance[scriptKey]}
- Include punctuation (exceptions: period) and capitalization exactly as spoken.
- Maintain natural sentence flow; never summarize, translate, or omit content.
- Ensure proper sequential caption numbering and no overlapping time ranges.
- Output only valid .srt content with no additional commentary.
- make sure Always write it in the format: "1
HH:MM:SS,mmm --> HH:MM:SS,mmm
text"
Goal:
Create a clean, linguistically faithful, and fully synchronized subtitle file.
`.trim();
  }

  function buildForeignWordCorrectionPrompt() {
    return `
You are an expert multilingual linguist and subtitle editor.
Review the provided SubRip (.srt) file and detect any French, English, or Spanish words that are written in Arabic script or phonetic Arabic spelling, then restore them to their correct Latin spelling.

Correction instructions:
- Only modify words that are clearly foreign (French, English, or Spanish) but written in Arabic script.
- Replace each detected foreign word with its correct Latin spelling.
- Keep Arabic words in Arabic script.
- Do not translate or paraphrase; only correct the script of borrowed words.
- Preserve sentence structure, punctuation, numbering, and timestamps exactly as in the input.
- Output only the corrected .srt content with no commentary.
- remove all periods ( . ) in the script 
`.trim();
  }

  function buildTranslationPrompt(language) {
    return `
You are a professional subtitle translator.
Translate the supplied SubRip (.srt) captions into ${language}, preserving numbering, timestamps, and caption grouping exactly.
Keep the timing untouched, retain line breaks within each caption, and output only valid .srt content with no explanations.
`.trim();
  }

  class CSInterfaceLite {
    constructor() {
      this.hostEnvironment = window.__adobe_cep__
        ? JSON.parse(window.__adobe_cep__.getHostEnvironment())
        : null;
    }

    evalScript(script, callback) {
      if (!window.__adobe_cep__) {
        console.warn("ExtendScript bridge is not available.");
        if (callback) callback("Bridge unavailable");
        return;
      }
      window.__adobe_cep__.evalScript(script, callback);
    }

    getSystemPath(pathType) {
      if (!window.__adobe_cep__) {
        return null;
      }
      return window.__adobe_cep__.getSystemPath(pathType);
    }
  }

  const elements = {
    dropzone: document.getElementById("dropzone"),
    dropLabel: document.getElementById("dropLabel"),
    audioInput: document.getElementById("audioInput"),
    audioPreview: document.getElementById("audioPreview"),
    audioMeta: document.getElementById("audioMeta"),
    audioPlayer: document.getElementById("audioPlayer"),
    wordsPerCaption: document.getElementById("wordsPerCaption"),
    linesPerCaption: document.getElementById("linesPerCaption"),
    scriptChoice: document.getElementById("scriptChoice"),
    modelChoice: document.getElementById("modelChoice"),
    transcribeBtn: document.getElementById("transcribeBtn"),
    enhanceBtn: document.getElementById("enhanceBtn"),
    translateBtn: document.getElementById("translateBtn"),
    translationLanguage: document.getElementById("translationLanguage"),
    downloadBtn: document.getElementById("downloadBtn"),
    pushPremiereBtn: document.getElementById("pushPremiereBtn"),
    updateApiKeyBtn: document.getElementById("updateApiKeyBtn"),
    ltrBtn: document.getElementById("ltrBtn"),
    rtlBtn: document.getElementById("rtlBtn"),
    apiKeyModal: document.getElementById("apiKeyModal"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    apiKeySaveBtn: document.getElementById("apiKeySaveBtn"),
    apiKeyCancelBtn: document.getElementById("apiKeyCancelBtn"),
    statusBar: document.getElementById("statusBar"),
    hostInfo: document.getElementById("hostInfo"),
    tabs: document.querySelectorAll(".view-tabs button"),
    viewSRT: document.getElementById("viewSRT"),
    viewText: document.getElementById("viewText"),
    viewEditor: document.getElementById("viewEditor"),
    srtOutput: document.getElementById("srtOutput"),
    plainTextView: document.getElementById("plainTextView"),
    captionTable: document.getElementById("captionTable"),
    normalizeSrtBtn: document.getElementById("normalizeSrtBtn")
  };

  const cs = new CSInterfaceLite();

  let currentAudioFile = null;
  let currentAudioBase64 = null;
  let currentSRT = "";
  let parsedCaptions = [];
  let highlightTimer = null;
  let audioContext = null;
  let audioBuffer = null;
  let waveformData = null;
  let waveformStepDuration = 0;
  const autoNormalizeState = { running: false, lastAttempt: "" };
  const AUTO_NORMALIZE_PATTERN = /-->\s*/;
  let currentTextDirection = "ltr";
  const cutState = { active: false, index: -1 };
  const CUT_MIN_GAP = 0.05;

  init();

  function init() {
    wireEvents();
    loadPreferences();
    updateFeatureAvailability();
    updateStatus(STATUS.idle);
    if (cs.hostEnvironment) {
      const appName = cs.hostEnvironment.appName || "Premiere Pro";
      const appVersion = cs.hostEnvironment.appVersion || "";
      elements.hostInfo.textContent = `${appName} ${appVersion}`;
    }
  }

  function wireEvents() {
    elements.dropzone.addEventListener("dragover", evt => {
      evt.preventDefault();
      elements.dropzone.classList.add("hover");
    });
    elements.dropzone.addEventListener("dragleave", () => elements.dropzone.classList.remove("hover"));
    elements.dropzone.addEventListener("drop", handleFileDrop);
    elements.audioInput.addEventListener("change", handleFileBrowse);
    elements.transcribeBtn.addEventListener("click", handleTranscribe);
    elements.enhanceBtn.addEventListener("click", handleEnhance);
    elements.translateBtn.addEventListener("click", handleTranslate);
    elements.normalizeSrtBtn.addEventListener("click", () => handleNormalizeSrt(false));
    elements.downloadBtn.addEventListener("click", handleDownload);
    elements.pushPremiereBtn.addEventListener("click", handlePushToPremiere);
    const closeGapsBtn = document.getElementById("closeGapsBtn");
    if (closeGapsBtn) closeGapsBtn.addEventListener("click", handleCloseGaps);
    if (elements.updateApiKeyBtn) elements.updateApiKeyBtn.addEventListener("click", handleUpdateApiKey);
    if (elements.ltrBtn) elements.ltrBtn.addEventListener("click", () => handleSetTextDirection("ltr"));
    if (elements.rtlBtn) elements.rtlBtn.addEventListener("click", () => handleSetTextDirection("rtl"));
    if (elements.apiKeySaveBtn) elements.apiKeySaveBtn.addEventListener("click", handleSaveApiKey);
    if (elements.apiKeyCancelBtn) elements.apiKeyCancelBtn.addEventListener("click", closeApiKeyModal);
    if (elements.apiKeyModal) elements.apiKeyModal.addEventListener("click", handleApiKeyModalClick);
    if (elements.apiKeyInput) elements.apiKeyInput.addEventListener("keydown", handleApiKeyInputKeydown);
    elements.srtOutput.addEventListener("input", () => {
      currentSRT = elements.srtOutput.value;
      parsedCaptions = parseSRT(currentSRT);
      renderPlainText();
      renderEditor();
    });
    elements.tabs.forEach(tab => tab.addEventListener("click", handleTabChange));
    elements.audioPlayer.addEventListener("timeupdate", syncHighlights);
    elements.audioPlayer.addEventListener("ended", clearHighlights);
    elements.plainTextView.addEventListener("click", handlePlainTextClick);
    elements.captionTable.addEventListener("click", handleCaptionTableClick);
    elements.modelChoice.addEventListener("change", updateFeatureAvailability);
    window.addEventListener("resize", updateAllWaveforms);
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", handleGlobalKeydown);
    }
  }

  function loadPreferences() {
    const storedKey = safeGetPreference(STORAGE_KEYS.apiKey);
    if (storedKey) {
      apiKey = storedKey;
    }

    const storedDir = safeGetPreference(STORAGE_KEYS.textDirection);
    if (storedDir === "rtl" || storedDir === "ltr") {
      currentTextDirection = storedDir;
    }
    applyTextDirection(currentTextDirection);
  }

  function safeGetPreference(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key) || "";
      }
    } catch (err) {
      console.warn("Unable to access localStorage:", err);
    }
    return "";
  }

  function persistPreference(key, value) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        if (value === undefined || value === null) {
          window.localStorage.removeItem(key);
        } else {
          window.localStorage.setItem(key, value);
        }
      }
    } catch (err) {
      console.warn("Unable to store preference:", err);
    }
  }

  function getCurrentAudioTime() {
    if (elements.audioPlayer && typeof elements.audioPlayer.currentTime === "number") {
      return elements.audioPlayer.currentTime;
    }
    return null;
  }

  function getApiKey() {
    return apiKey ? apiKey.trim() : "";
  }

  function openApiKeyModal() {
    if (!elements.apiKeyModal || !elements.apiKeyInput) {
      return;
    }
    elements.apiKeyInput.value = getApiKey();
    elements.apiKeyModal.classList.remove("hidden");
    setTimeout(() => {
      if (elements.apiKeyInput) {
        elements.apiKeyInput.focus();
        elements.apiKeyInput.select();
      }
    }, 0);
  }

  function closeApiKeyModal() {
    if (!elements.apiKeyModal) {
      return;
    }
    elements.apiKeyModal.classList.add("hidden");
  }

  function isApiKeyModalOpen() {
    return Boolean(elements.apiKeyModal && !elements.apiKeyModal.classList.contains("hidden"));
  }

  function handleUpdateApiKey() {
    openApiKeyModal();
  }

  function handleSaveApiKey() {
    if (!elements.apiKeyInput) {
      return;
    }
    const trimmed = elements.apiKeyInput.value.trim();
    if (!trimmed) {
      showError("API key cannot be empty.");
      return;
    }
    apiKey = trimmed;
    persistPreference(STORAGE_KEYS.apiKey, trimmed);
    updateStatus("API key updated.");
    closeApiKeyModal();
  }

  function handleApiKeyModalClick(evt) {
    if (!elements.apiKeyModal) {
      return;
    }
    if (evt.target === elements.apiKeyModal) {
      closeApiKeyModal();
    }
  }

  function handleApiKeyInputKeydown(evt) {
    if (!isApiKeyModalOpen()) {
      return;
    }
    if (evt.key === "Enter") {
      evt.preventDefault();
      handleSaveApiKey();
    } else if (evt.key === "Escape") {
      evt.preventDefault();
      closeApiKeyModal();
    }
  }

  function handleGlobalKeydown(evt) {
    if (evt.key === "Escape" && isApiKeyModalOpen()) {
      evt.preventDefault();
      closeApiKeyModal();
    } else if (evt.key === "Escape" && cutState.active) {
      evt.preventDefault();
      exitCutMode();
    }
  }

  function applyTextDirection(dir) {
    currentTextDirection = dir;
    getDirectionTargets().forEach(node => {
      node.dir = dir;
      node.style.direction = dir;
    });
    if (elements.translationLanguage) {
      elements.translationLanguage.dir = "ltr";
    }
    if (elements.apiKeyInput) {
      elements.apiKeyInput.dir = "ltr";
    }
    if (elements.ltrBtn) {
      elements.ltrBtn.classList.toggle("active", dir === "ltr");
    }
    if (elements.rtlBtn) {
      elements.rtlBtn.classList.toggle("active", dir === "rtl");
    }
  }

  function handleSetTextDirection(dir) {
    if (dir !== "ltr" && dir !== "rtl") {
      return;
    }
    if (currentTextDirection === dir) {
      return;
    }
    applyTextDirection(dir);
    persistPreference(STORAGE_KEYS.textDirection, dir);
    renderPlainText();
    renderEditor();
  }

  function getDirectionTargets() {
    const targets = [];
    if (elements.viewSRT) targets.push(elements.viewSRT);
    if (elements.viewText) targets.push(elements.viewText);
    if (elements.viewEditor) targets.push(elements.viewEditor);
    if (elements.srtOutput) targets.push(elements.srtOutput);
    if (elements.plainTextView) targets.push(elements.plainTextView);
    if (elements.captionTable) targets.push(elements.captionTable);
    return targets;
  }

  function handleCloseGaps() {
    if (!parsedCaptions.length) {
      showError("Generate or load captions before closing gaps.");
      return;
    }
    let warnings = 0;
    parsedCaptions.forEach(block => {
      if (block) block.__gapWarning = false;
    });
    for (let i = 0; i < parsedCaptions.length - 1; i++) {
      const current = parsedCaptions[i];
      const next = parsedCaptions[i + 1];
      if (!current || !next) {
        continue;
      }
      const currentStart = toSeconds(current.start);
      let nextStart = toSeconds(next.start);
      if (!Number.isFinite(nextStart)) {
        nextStart = currentStart;
      }
      if (nextStart < currentStart) {
        current.__gapWarning = true;
        next.__gapWarning = true;
        warnings++;
        continue;
      }
      const safeEnd = Math.max(currentStart + CUT_MIN_GAP, nextStart);
      current.end = fromSeconds(safeEnd);
    }
    refreshSRTFromBlocks();
    renderPlainText();
    renderEditor();
    if (warnings > 0) {
      updateStatus(`Closed gaps with ${warnings} warning(s). Check highlighted captions.`);
    } else {
      updateStatus("Closed caption gaps successfully.");
    }
  }

  async function handleFileBrowse(evt) {
    if (!evt.target.files || !evt.target.files.length) return;
    await loadAudioFile(evt.target.files[0]);
  }

  async function handleFileDrop(evt) {
    evt.preventDefault();
    elements.dropzone.classList.remove("hover");
    if (!evt.dataTransfer.files || !evt.dataTransfer.files.length) return;
    await loadAudioFile(evt.dataTransfer.files[0]);
  }

  async function loadAudioFile(file) {
    if (file.size > MAX_FILE_BYTES) {
      showError(`File is ${(file.size / (1024 * 1024)).toFixed(1)} MB. Gemini inline uploads must stay under ${(MAX_FILE_BYTES / (1024 * 1024)).toFixed(0)} MB.`);
      return;
    }
    if (cutState.active) {
      exitCutMode(false);
    }

    currentAudioFile = file;
    updateStatus(`${STATUS.uploading} (${file.name})`);
    elements.audioPreview.classList.remove("hidden");
    elements.audioPlayer.src = URL.createObjectURL(file);
    elements.audioMeta.textContent = `${file.name} - ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    elements.dropLabel.textContent = "Audio loaded";
    try {
      const arrayBuffer = await file.arrayBuffer();
      currentAudioBase64 = await fileToBase64(arrayBuffer);
      await prepareWaveform(arrayBuffer.slice(0));
    } catch (err) {
      console.warn("Unable to process audio for waveform preview:", err);
      if (!currentAudioBase64) {
        currentAudioBase64 = await fileToBase64(file);
      }
    } finally {
      updateStatus(STATUS.idle);
    }
  }

  async function handleTranscribe() {
    if (!currentAudioFile || !currentAudioBase64) {
      showError("Load an audio file before transcribing.");
      return;
    }

    const prompt = buildTranscriptionPrompt(
      elements.wordsPerCaption.value,
      elements.linesPerCaption.value,
      elements.scriptChoice.value
    );
    const model = elements.modelChoice.value;

    try {
      updateStatus(`${STATUS.talking} (transcribing---)`);
      toggleLoading(true);
      const responseText = await callGemini(model, [
        { text: prompt },
        {
          inline_data: {
            mime_type: currentAudioFile.type || "audio/mpeg",
            data: currentAudioBase64
          }
        }
      ]);

      currentSRT = responseText.trim();
      elements.srtOutput.value = currentSRT;
      parsedCaptions = parseSRT(currentSRT);
      renderPlainText();
      renderEditor();
      updateStatus(STATUS.done);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      toggleLoading(false);
    }
  }
  function buildSrtNormalizationPrompt() {
    return `
You are a strict SubRip (.srt) formatter.
Given an input .srt, output the same file but ensure ALL time ranges use the canonical HH:MM:SS,mmm format (two-digit hours/minutes/seconds, three-digit milliseconds, comma separator).

Rules:
- Do not modify caption order, numbering, timing values (except formatting), or text.
- Preserve all caption text and line breaks as-is.
- If milliseconds are missing, add ",000".
- If a dot is used as decimal, convert to "," and pad to three digits.
- If hours/minutes/seconds are 1 digit, pad to 2.
- Output only valid .srt, with blank line between cues.
"1
HH:MM:SS,mmm --> HH:MM:SS,mmm
text"
`.trim();
  }

          async function handleNormalizeSrt(autoTriggered = false) {
    if (!currentSRT) {
      if (!autoTriggered) {
        showError("Generate or paste an SRT before fixing format.");
      }
      return;
    }

    const prompt = buildSrtNormalizationPrompt();
    const model = "models/gemini-flash-lite-latest";

    try {
      updateStatus(
        autoTriggered ? `${STATUS.talking} (auto-fixing time format...)` : `${STATUS.talking} (normalizing format...)`
      );
      toggleLoading(true);
      const responseText = await callGemini(model, [
        { text: prompt },
        { text: currentSRT }
      ]);

      currentSRT = responseText.trim();
      elements.srtOutput.value = currentSRT;
      parsedCaptions = parseSRT(currentSRT);
      renderPlainText();
      renderEditor();
      updateStatus(STATUS.done);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      toggleLoading(false);
      autoNormalizeState.running = false;
    }
  }
async function handleEnhance() {
    if (!requireProModel("Enhance Latin Words")) {
      return;
    }
    if (!currentSRT) {
      showError("Generate or paste an SRT before enhancing.");
      return;
    }

    const prompt = buildForeignWordCorrectionPrompt();
    const model = elements.modelChoice.value;

    try {
      updateStatus(`${STATUS.talking} (enhancing---)`);
      toggleLoading(true);
      const responseText = await callGemini(model, [
        { text: prompt },
        { text: currentSRT }
      ]);

      currentSRT = responseText.trim();
      elements.srtOutput.value = currentSRT;
      parsedCaptions = parseSRT(currentSRT);
      renderPlainText();
      renderEditor();
      updateStatus(STATUS.done);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      toggleLoading(false);
    }
  }

  async function handleTranslate() {
    if (!requireProModel("Translation")) {
      return;
    }
    if (!currentSRT) {
      showError("Generate or paste an SRT before translating.");
      return;
    }
    const target = elements.translationLanguage.value.trim();
    if (!target) {
      showError("Enter a target language (e.g. English, Francais).");
      return;
    }

    const prompt = buildTranslationPrompt(target);
    const model = elements.modelChoice.value;

    try {
      updateStatus(`${STATUS.talking} (translating to ${target})`);
      toggleLoading(true);
      const responseText = await callGemini(model, [
        { text: prompt },
        { text: currentSRT }
      ]);

      currentSRT = responseText.trim();
      elements.srtOutput.value = currentSRT;
      parsedCaptions = parseSRT(currentSRT);
      renderPlainText();
      renderEditor();
      updateStatus(STATUS.done);
    } catch (err) {
      showError(err.message || String(err));
    } finally {
      toggleLoading(false);
    }
  }

  function handleDownload() {
    if (!currentSRT) {
      showError("Nothing to download yet.");
      return;
    }
    if (cs.hostEnvironment) {
      updateStatus("Saving captions...");
      const serialized = JSON.stringify(currentSRT);
      const script = `saveSRTToDisk(${serialized})`;
      cs.evalScript(script, result => {
        if (!result) {
          showError("Unable to save subtitles via Premiere.");
          return;
        }
        if (result === "CANCELED") {
          updateStatus("Save canceled.");
          return;
        }
        if (result.startsWith && result.startsWith("JSX Error")) {
          showError(result);
          return;
        }
        updateStatus(`Saved captions to ${result}`);
      });
      return;
    }
    const blob = new Blob([currentSRT], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const baseName = currentAudioFile ? currentAudioFile.name.replace(/\.[^/.]+$/, "") : "gemini-captions";
    a.href = url;
    a.download = `${baseName}.srt`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function handlePushToPremiere() {
    if (!currentSRT) {
      showError("Generate or paste captions before pushing to Premiere.");
      return;
    }
    const serialized = JSON.stringify(currentSRT);
    const script = `pushSRTToTimeline(${serialized})`;
    updateStatus("Sending captions to Premiere...");
    cs.evalScript(script, result => {
      if (!result || result === "OK") {
        updateStatus("Captions imported to timeline.");
      } else {
        showError(result);
      }
    });
  }

  function handleTabChange(evt) {
    const view = evt.target.dataset.view;
    elements.tabs.forEach(tab => tab.classList.toggle("active", tab === evt.target));
    elements.viewSRT.classList.toggle("hidden", view !== "srt");
    elements.viewText.classList.toggle("hidden", view !== "text");
    elements.viewEditor.classList.toggle("hidden", view !== "editor");
    if (view === "editor") {
      renderEditor();
      requestAnimationFrame(updateAllWaveforms);
    } else if (cutState.active) {
      exitCutMode(false);
    }
  }

  function handlePlainTextClick(evt) {
    const line = evt.target.closest(".caption-line");
    if (!line) {
      return;
    }
    const index = parseInt(line.dataset.captionIndex || "", 10);
    if (Number.isNaN(index) || !parsedCaptions[index]) {
      return;
    }
    const block = parsedCaptions[index];
    let startOverride;
    const wordIndexAttr = evt.target.dataset ? evt.target.dataset.wordIndex : undefined;
    if (wordIndexAttr !== undefined) {
      const wordIndex = parseInt(wordIndexAttr, 10);
      const words = line.querySelectorAll("span");
      const wordCount = words.length;
      if (!Number.isNaN(wordIndex) && wordCount > 0) {
        const blockStart = toSeconds(block.start);
        const blockEnd = Math.max(blockStart, toSeconds(block.end));
        const duration = Math.max(blockEnd - blockStart, 0);
        if (duration > 0) {
          const ratio = Math.min(Math.max(wordIndex / wordCount, 0), 0.999);
          startOverride = blockStart + ratio * duration;
        }
      }
    }
    playCaption(block, startOverride);
  }

  function handleCaptionTableClick(evt) {
    const splitButton = evt.target.closest(".split-button");
    if (splitButton) {
      const index = parseInt(splitButton.dataset.captionIndex || "", 10);
      if (!Number.isNaN(index)) {
        handleSplitCaption(index);
      }
      return;
    }
    const mergeButton = evt.target.closest(".merge-button");
    if (mergeButton) {
      const beforeIndex = parseInt(mergeButton.dataset.mergeBefore || "", 10);
      if (Number.isNaN(beforeIndex)) {
        return;
      }
      mergeCaptionsAt(beforeIndex - 1);
      return;
    }
  }

  function mergeCaptionsAt(baseIndex) {
    if (autoNormalizeState.running) {
      return;
    }
    if (cutState.active) {
      exitCutMode(false);
    }
    if (parsedCaptions.length < 2) {
      return;
    }
    if (baseIndex < 0 || baseIndex >= parsedCaptions.length - 1) {
      return;
    }
    const first = parsedCaptions[baseIndex];
    const second = parsedCaptions[baseIndex + 1];
    if (!first || !second) {
      return;
    }

    const firstText = first.text ? first.text.trimEnd() : "";
    const secondText = second.text ? second.text.trim() : "";
    const separator = firstText && secondText ? "\n" : "";
    first.end = normalizeTimestamp(second.end, first.end);
    first.text = `${firstText}${separator}${secondText}`.trim();

    parsedCaptions.splice(baseIndex + 1, 1);
    refreshSRTFromBlocks();
    renderEditor();
    updateStatus(`Merged captions ${baseIndex + 1} & ${baseIndex + 2}.`);
  }

  function handleSplitCaption(index) {
    if (autoNormalizeState.running) {
      showError("Finish current processing before cutting captions.");
      return;
    }
    if (cutState.active && cutState.index === index) {
      exitCutMode();
      return;
    }
    enterCutMode(index);
  }

  function performSplitAt(index, targetTime) {
    const block = parsedCaptions[index];
    if (!block) {
      return;
    }
    const start = toSeconds(block.start);
    const end = Math.max(start, toSeconds(block.end));
    const duration = Math.max(end - start, 0);
    if (duration <= CUT_MIN_GAP * 2) {
      showError("Caption too short to split.");
      return;
    }
    if (!Number.isFinite(targetTime)) {
      showError("Choose a location within the waveform to split.");
      return;
    }
    if (targetTime <= start + CUT_MIN_GAP || targetTime >= end - CUT_MIN_GAP) {
      showError("Click inside the caption to cut it.");
      return;
    }

    const words = block.text.split(/\s+/).filter(Boolean);
    if (words.length < 2) {
      showError("Add more words before splitting this caption.");
      return;
    }

    const ratio = (targetTime - start) / duration;
    let splitWordIndex = Math.round(words.length * ratio);
    splitWordIndex = Math.max(1, Math.min(words.length - 1, splitWordIndex));
    let firstText = words.slice(0, splitWordIndex).join(" ").trim();
    let secondText = words.slice(splitWordIndex).join(" ").trim();
    if (!firstText || !secondText) {
      splitWordIndex = Math.floor(words.length / 2);
      splitWordIndex = Math.max(1, Math.min(words.length - 1, splitWordIndex));
      firstText = words.slice(0, splitWordIndex).join(" ").trim();
      secondText = words.slice(splitWordIndex).join(" ").trim();
    }
    if (!firstText || !secondText) {
      showError("Unable to split caption text evenly.");
      return;
    }

    const splitStamp = fromSeconds(targetTime);
    const originalEnd = block.end;

    block.end = normalizeTimestamp(splitStamp, block.end);
    block.text = firstText;

    const rightBlock = {
      index: "",
      start: normalizeTimestamp(splitStamp, block.start),
      end: originalEnd,
      text: secondText
    };

    parsedCaptions.splice(index + 1, 0, rightBlock);
    exitCutMode(false);
    refreshSRTFromBlocks();
    renderEditor();
    updateStatus(`Split caption ${index + 1} at ${splitStamp}.`);
  }

  function enterCutMode(index) {
    if (autoNormalizeState.running) {
      showError("Finish current processing before cutting captions.");
      return;
    }
    if (cutState.active && cutState.index === index) {
      return;
    }
    exitCutMode(false);
    cutState.active = true;
    cutState.index = index;
    const row =
      elements.captionTable?.querySelector(`.caption-row[data-caption-index="${index}"]`) || null;
    if (row) {
      row.classList.add("cutting");
      const waveCell = row.querySelector(".wave-cell");
      if (waveCell) {
        waveCell.classList.add("cut-target");
        ensureWaveCutPreview(waveCell);
      }
    }
    updateStatus(`Cut mode: click the waveform to split caption ${index + 1} (Esc to cancel).`);
  }

  function exitCutMode(updateMessage = true) {
    if (!cutState.active) {
      return;
    }
    cutState.active = false;
    cutState.index = -1;
    if (elements.captionTable) {
      elements.captionTable
        .querySelectorAll(".caption-row.cutting")
        .forEach(row => row.classList.remove("cutting"));
      elements.captionTable
        .querySelectorAll(".wave-cell.cut-target")
        .forEach(cell => cell.classList.remove("cut-target"));
    }
    clearWaveCutPreviews();
    if (updateMessage) {
      updateStatus("Cut canceled.");
    }
  }

  function ensureWavePlayhead(container) {
    let line = container.querySelector(".wave-playhead");
    if (!line) {
      line = document.createElement("div");
      line.className = "wave-playhead";
      container.appendChild(line);
    }
    return line;
  }

  function updateWavePlayhead(container, block, currentTime) {
    const line = ensureWavePlayhead(container);
    if (currentTime == null) {
      line.classList.remove("active");
      return;
    }
    const start = toSeconds(block.start);
    const end = Math.max(start, toSeconds(block.end));
    const duration = Math.max(end - start, 0);
    if (duration <= 0 || currentTime < start || currentTime > end) {
      line.classList.remove("active");
      return;
    }
    const ratio = (currentTime - start) / duration;
    line.style.left = `${(ratio * 100).toFixed(4)}%`;
    line.classList.add("active");
  }

  function clearWavePlayheads() {
    if (!elements.captionTable) {
      return;
    }
    elements.captionTable.querySelectorAll(".wave-playhead").forEach(line => line.classList.remove("active"));
  }

  function ensureWaveCutPreview(container) {
    let line = container.querySelector(".wave-cut-preview");
    if (!line) {
      line = document.createElement("div");
      line.className = "wave-cut-preview";
      container.appendChild(line);
    }
    return line;
  }

  function updateWaveCutPreview(container, ratio) {
    const line = ensureWaveCutPreview(container);
    line.style.left = `${(ratio * 100).toFixed(4)}%`;
    line.classList.add("active");
  }

  function hideWaveCutPreview(container) {
    const line = container.querySelector(".wave-cut-preview");
    if (line) {
      line.classList.remove("active");
    }
  }

  function clearWaveCutPreviews() {
    if (!elements.captionTable) {
      return;
    }
    elements.captionTable
      .querySelectorAll(".wave-cut-preview")
      .forEach(line => line.classList.remove("active"));
  }

  function toggleLoading(active) {
    elements.transcribeBtn.disabled = active;
    elements.enhanceBtn.disabled = active;
    elements.translateBtn.disabled = active;
    elements.downloadBtn.disabled = active;
    elements.pushPremiereBtn.disabled = active;
    if (elements.normalizeSrtBtn) elements.normalizeSrtBtn.disabled = active;
  }

  function normalizeModelId(model) {
    if (!model) {
      return "models/gemini-2.5-flash";
    }
    const trimmed = model.trim();
    if (MODEL_ALIASES[trimmed]) {
      return MODEL_ALIASES[trimmed];
    }
    if (trimmed.endsWith("-latest")) {
      return trimmed.replace(/-latest$/, "");
    }
    return trimmed;
  }

  async function callGemini(model, parts) {
    const apiKeyToUse = getApiKey();
    if (!apiKeyToUse) {
      throw new Error("Set your Gemini API key first (use the API Key button).");
    }
    const resolvedModel = normalizeModelId(model);
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/${resolvedModel}:generateContent?key=${apiKeyToUse}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts
          }
        ],
        generationConfig: {
          temperature: 0.1,
          topP: 0.95,
          maxOutputTokens: 8192
        }
      })
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => ({}));
      const baseMessage = errorPayload.error?.message || `Gemini API ${response.statusText}`;
      if (response.status === 404) {
        throw new Error(`${baseMessage}. Verify that model "${resolvedModel}" is available; Gemini 2.5 Flash is recommended.`);
      }
      throw new Error(baseMessage);
    }

    const payload = await response.json();
    const { text, meta } = extractCandidateText(payload.candidates);
    if (!text) {
      const promptBlock = payload.promptFeedback?.blockReason;
      const finishReason = meta?.finishReason;
      const flaggedCategories = (meta?.safetyRatings || [])
        .filter(rating => rating.probability === "HIGH" || rating.probability === "VERY_HIGH")
        .map(rating => rating.category)
        .join(", ");
      let reason = "";
      if (promptBlock) {
        reason = `Blocked by Gemini policy (${promptBlock}).`;
      } else if (finishReason && finishReason !== "STOP") {
        reason = `Finish reason: ${finishReason}.`;
      } else if (flaggedCategories) {
        reason = `Flagged categories: ${flaggedCategories}.`;
      }
      throw new Error(`Gemini returned an empty response${reason ? ` - ${reason}` : "."}`);
    }
    return text;
  }

  function extractCandidateText(candidates) {
    if (!Array.isArray(candidates) || !candidates.length) {
      return { text: "", meta: null };
    }
    for (const candidate of candidates) {
      const raw = (candidate?.content?.parts || [])
        .map(part => part.text || "")
        .join("")
        .trim();
      if (raw) {
        return { text: raw, meta: candidate };
      }
    }
    return { text: "", meta: candidates[0] };
  }

  function updateStatus(message) {
    elements.statusBar.textContent = message;
  }

  function showError(message) {
    console.error(message);
    updateStatus(`${STATUS.error}: ${message}`);
  }

  async function fileToBase64(fileOrBuffer) {
    const arrayBuffer = fileOrBuffer instanceof ArrayBuffer ? fileOrBuffer : await fileOrBuffer.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const slice = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, slice);
    }
    return btoa(binary);
  }

  const TIME_LINE_REGEX = /(\d{1,2}:\d{2}:\d{2}(?:[,.]\d{1,3})?)\s*-->\s*(\d{1,2}:\d{2}:\d{2}(?:[,.]\d{1,3})?)/;

  function parseSRT(srt) {
    const blocks = [];
    if (!srt) {
      return blocks;
    }

    const normalizedInput = srt.replace(/\r\n/g, "\n").replace(/\uFEFF/g, "");
    const lines = normalizedInput.split("\n");
    let lineIndex = 0;

    while (lineIndex < lines.length) {
      // skip leading blank lines
      while (lineIndex < lines.length && !lines[lineIndex].trim()) {
        lineIndex++;
      }
      if (lineIndex >= lines.length) {
        break;
      }

      let indexLine = "";
      let timelineMatch = null;

      const possibleIndexLine = lines[lineIndex].trim();
      if (/^\d+$/.test(possibleIndexLine)) {
        indexLine = possibleIndexLine;
        lineIndex++;
      } else {
        indexLine = `${blocks.length + 1}`;
      }

      while (lineIndex < lines.length && !timelineMatch) {
        const candidate = lines[lineIndex].trim();
        if (!candidate) {
          lineIndex++;
          continue;
        }
        const match = candidate.match(TIME_LINE_REGEX);
        if (match) {
          timelineMatch = match;
          lineIndex++;
          break;
        }
        // If we never consumed a numeric index, re-use this line as timeline if possible.
        if (!/^\d+$/.test(candidate)) {
          const inlineMatch = candidate.match(TIME_LINE_REGEX);
          if (inlineMatch) {
            timelineMatch = inlineMatch;
            lineIndex++;
            break;
          }
        }
        // If we see another number followed by timeline later, rewind this as next caption.
        if (/^\d+$/.test(candidate) && lineIndex + 1 < lines.length && lines[lineIndex + 1].trim().match(TIME_LINE_REGEX)) {
          // This line belongs to the next caption; step out.
          break;
        }
        // Not a timeline, skip to next line.
        lineIndex++;
      }

      if (!timelineMatch) {
        continue;
      }

      const start = normalizeTimecode(timelineMatch[1]);
      const end = normalizeTimecode(timelineMatch[2], start);

      const textLines = [];
      while (lineIndex < lines.length) {
        const rawLine = lines[lineIndex];
        const trimmed = rawLine.trim();
        if (!trimmed) {
          lineIndex++;
          break;
        }
        if (trimmed.match(TIME_LINE_REGEX)) {
          break;
        }
        if (/^\d+$/.test(trimmed) && lineIndex + 1 < lines.length && lines[lineIndex + 1].trim().match(TIME_LINE_REGEX)) {
          break;
        }
        textLines.push(rawLine.replace(/^\uFEFF/, ""));
        lineIndex++;
      }

      const text = textLines.join("\n").trim();
      if (!text) {
        continue;
      }

      blocks.push({
        index: indexLine || `${blocks.length + 1}`,
        start,
        end,
        text
      });
    }

    return blocks;
  }

  function serializeSRT(blocks) {
    return blocks
      .map((block, i) => `${i + 1}\n${block.start} --> ${block.end}\n${block.text.trim()}`)
      .join("\n\n");
  }

  function playCaption(block, startOverride) {
    if (!block || !elements.audioPlayer || !elements.audioPlayer.src) {
      return;
    }

    const blockStart = toSeconds(block.start);
    const blockEnd = Math.max(blockStart, toSeconds(block.end));
    if (!Number.isFinite(blockStart) || !Number.isFinite(blockEnd)) {
      return;
    }

    const startTime =
      typeof startOverride === "number"
        ? Math.min(Math.max(startOverride, blockStart), blockEnd)
        : blockStart;

    try {
      elements.audioPlayer.currentTime = startTime;
    } catch (timeErr) {
      console.warn("Unable to seek audio element:", timeErr);
      return;
    }

    try {
      const playPromise = elements.audioPlayer.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {});
      }
    } catch (playErr) {
      console.warn("Unable to start audio playback:", playErr);
      return;
    }

    syncHighlights();
    clearTimeout(highlightTimer);
    const remaining = Math.max(blockEnd - startTime, 0);
    if (remaining > 0.05) {
      highlightTimer = setTimeout(() => {
        elements.audioPlayer.pause();
      }, remaining * 1000);
    }
  }

  function isProModelSelected() {
    return elements.modelChoice.value === "models/gemini-2.5-pro";
  }

  function updateFeatureAvailability() {
    const proEnabled = isProModelSelected();
    const message = "Select Gemini 2.5 Pro to enable this feature.";
    elements.enhanceBtn.disabled = !proEnabled;
    elements.translateBtn.disabled = !proEnabled;
    if (elements.translationLanguage) {
      elements.translationLanguage.disabled = !proEnabled;
      elements.translationLanguage.title = proEnabled ? "" : message;
    }
    elements.enhanceBtn.title = proEnabled ? "" : message;
    elements.translateBtn.title = proEnabled ? "" : message;
  }

  function requireProModel(featureName) {
    if (isProModelSelected()) {
      return true;
    }
    showError(`${featureName} requires the Gemini 2.5 Pro model.`);
    return false;
  }

  function maybeTriggerAutoNormalize() {
    if (parsedCaptions.length) {
      autoNormalizeState.lastAttempt = "";
      return;
    }
    if (!currentSRT || elements.viewEditor.classList.contains("hidden")) {
      return;
    }
    const trimmed = currentSRT.trim();
    if (!trimmed || !AUTO_NORMALIZE_PATTERN.test(trimmed)) {
      return;
    }
    if (autoNormalizeState.running || autoNormalizeState.lastAttempt === trimmed) {
      return;
    }
    autoNormalizeState.running = true;
    autoNormalizeState.lastAttempt = trimmed;
    setTimeout(() => handleNormalizeSrt(true), 0);
  }

  function renderPlainText() {
    elements.plainTextView.innerHTML = "";
    parsedCaptions.forEach((block, idx) => {
      const container = document.createElement("div");
      container.className = "caption-line";
      container.dataset.captionIndex = idx.toString();
       container.dir = currentTextDirection;
      const words = block.text.split(/\s+/);
      words.forEach((word, wordIndex) => {
        const span = document.createElement("span");
        span.textContent = word + (wordIndex === words.length - 1 ? "" : " ");
        span.dataset.wordIndex = wordIndex.toString();
        container.appendChild(span);
      });
      elements.plainTextView.appendChild(container);
    });
  }

  function renderEditor() {
    elements.captionTable.innerHTML = "";
    if (!parsedCaptions.length) {
      maybeTriggerAutoNormalize();
      return;
    }
    autoNormalizeState.lastAttempt = "";
    autoNormalizeState.running = false;
    let warnings = 0;

    parsedCaptions.forEach((block, idx) => {
      if (idx > 0) {
        const mergeRow = document.createElement("div");
        mergeRow.className = "merge-control";
        mergeRow.dir = currentTextDirection;
        const mergeButton = document.createElement("button");
        mergeButton.type = "button";
        mergeButton.className = "merge-button";
        mergeButton.dataset.mergeBefore = idx.toString();
        mergeButton.title = `Merge captions ${idx} and ${idx + 1}`;
        mergeButton.textContent = "Merge";
        mergeRow.appendChild(mergeButton);
        elements.captionTable.appendChild(mergeRow);
      }

      const row = document.createElement("div");
      row.className = "caption-row";
      row.dataset.captionIndex = idx.toString();
      row.dir = currentTextDirection;

      const indexCell = document.createElement("span");
      indexCell.textContent = idx + 1;

      const startSeconds = toSeconds(block.start);
      const endSeconds = Math.max(startSeconds, toSeconds(block.end));
      const prevBlock = idx > 0 ? parsedCaptions[idx - 1] : null;
      const prevEndSeconds = prevBlock ? toSeconds(prevBlock.end) : null;
      const startWarning =
        prevBlock &&
        Number.isFinite(startSeconds) &&
        Number.isFinite(prevEndSeconds) &&
        startSeconds < prevEndSeconds;

      const waveCell = document.createElement("div");
      waveCell.className = "wave-cell";
      waveCell.dataset.captionIndex = idx.toString();
      const isCutting = cutState.active && cutState.index === idx;
      const nextBlock = idx < parsedCaptions.length - 1 ? parsedCaptions[idx + 1] : null;
      const currentEndSeconds = endSeconds;
      const nextStartSeconds = nextBlock ? toSeconds(nextBlock.start) : null;
      const overlaps =
        nextBlock &&
        Number.isFinite(currentEndSeconds) &&
        Number.isFinite(nextStartSeconds) &&
        nextStartSeconds < currentEndSeconds;
      const hasWarning = Boolean(block.__gapWarning) || overlaps || startWarning;
      if (hasWarning) warnings++;
      row.classList.toggle("cutting", isCutting);
      row.classList.toggle("warning", hasWarning);
      if (isCutting) {
        waveCell.classList.add("cut-target");
        ensureWaveCutPreview(waveCell);
      }

      const updateWaveform = () => renderWaveformCanvas(waveCell, block);

      const startCell = document.createElement("div");
      startCell.className = "time-cell";
      const startInput = document.createElement("input");
      startInput.type = "text";
      startInput.value = block.start;
      startInput.classList.toggle("warning", startWarning);
      startInput.addEventListener("change", () => {
        block.start = normalizeTimestamp(startInput.value, block.start);
        startInput.value = block.start; // re-normalize display
        refreshSRTFromBlocks();
        updateWaveform();
      });
      const startNudgeEarlyBtn = document.createElement("button");
      startNudgeEarlyBtn.className = "time-nudge";
      startNudgeEarlyBtn.textContent = "-";
      startNudgeEarlyBtn.title = "Nudge start time earlier by 50ms";
      startNudgeEarlyBtn.addEventListener("click", () => {
        block.start = fromSeconds(toSeconds(block.start) - 0.05);
        startInput.value = block.start;
        refreshSRTFromBlocks();
        updateWaveform();
      });
      const startNudgeLateBtn = document.createElement("button");
      startNudgeLateBtn.className = "time-nudge";
      startNudgeLateBtn.textContent = "+";
      startNudgeLateBtn.title = "Nudge start time later by 50ms";
      startNudgeLateBtn.addEventListener("click", () => {
        block.start = fromSeconds(toSeconds(block.start) + 0.05);
        startInput.value = block.start;
        refreshSRTFromBlocks();
        updateWaveform();
      });
      startCell.appendChild(startNudgeEarlyBtn);
      startCell.appendChild(startInput);
      startCell.appendChild(startNudgeLateBtn);

      const endCell = document.createElement("div");
      endCell.className = "time-cell";
      const endInput = document.createElement("input");
      endInput.type = "text";
      endInput.value = block.end;
      endInput.classList.toggle("warning", hasWarning);
      endInput.addEventListener("change", () => {
        block.end = normalizeTimestamp(endInput.value, block.end);
        endInput.value = block.end; // re-normalize display
        refreshSRTFromBlocks();
        updateWaveform();
      });
      const endNudgeEarlyBtn = document.createElement("button");
      endNudgeEarlyBtn.className = "time-nudge";
      endNudgeEarlyBtn.textContent = "-";
      endNudgeEarlyBtn.title = "Nudge end time earlier by 50ms";
      endNudgeEarlyBtn.addEventListener("click", () => {
        block.end = fromSeconds(toSeconds(block.end) - 0.05);
        endInput.value = block.end;
        refreshSRTFromBlocks();
        updateWaveform();
      });
      const endNudgeLateBtn = document.createElement("button");
      endNudgeLateBtn.className = "time-nudge";
      endNudgeLateBtn.textContent = "+";
      endNudgeLateBtn.title = "Nudge end time later by 50ms";
      endNudgeLateBtn.addEventListener("click", () => {
        block.end = fromSeconds(toSeconds(block.end) + 0.05);
        endInput.value = block.end;
        refreshSRTFromBlocks();
        updateWaveform();
      });
      endCell.appendChild(endNudgeEarlyBtn);
      endCell.appendChild(endInput);
      endCell.appendChild(endNudgeLateBtn);

      const textArea = document.createElement("textarea");
      textArea.value = block.text;
      textArea.rows = 2;
      textArea.dir = currentTextDirection;
      textArea.addEventListener("input", () => {
        block.text = textArea.value;
        refreshSRTFromBlocks(false);
      });

      const controlsCell = document.createElement("div");
      controlsCell.className = "row-controls";
      const splitButton = document.createElement("button");
      splitButton.type = "button";
      splitButton.className = "split-button";
      splitButton.dataset.captionIndex = idx.toString();
      splitButton.textContent = "Split";
      splitButton.title = "Split this caption at the playhead (or midpoint)";

      const playButton = document.createElement("button");
      playButton.type = "button";
      playButton.className = "play-button";
      playButton.textContent = "Play";
      playButton.addEventListener("click", () => playCaption(block));

      controlsCell.appendChild(splitButton);
      controlsCell.appendChild(playButton);

      row.appendChild(indexCell);
      row.appendChild(startCell);
      row.appendChild(endCell);
      row.appendChild(waveCell);
      row.appendChild(textArea);
      row.appendChild(controlsCell);

      elements.captionTable.appendChild(row);
      updateWaveform();
    });

    if (warnings > 0) {
      updateStatus(`Warning: ${warnings} caption(s) overlap; adjust start times before closing gaps.`);
    }
  }

  function refreshSRTFromBlocks(rebuildPlain = true) {
    currentSRT = serializeSRT(parsedCaptions);
    elements.srtOutput.value = currentSRT;
    if (rebuildPlain) {
      renderPlainText();
    }
    updateAllWaveforms();
  }

  function updateAllWaveforms() {
    if (!elements.captionTable || !elements.captionTable.children.length) {
      return;
    }
    const globalWindow = typeof window !== "undefined" ? window : null;
    const schedule =
      globalWindow && typeof globalWindow.requestAnimationFrame === "function"
        ? callback => globalWindow.requestAnimationFrame(callback)
        : callback => setTimeout(callback, 16);
    schedule(() => {
      elements.captionTable.querySelectorAll(".caption-row").forEach(row => {
        const index = parseInt(row.dataset.captionIndex || "", 10);
        if (Number.isNaN(index) || !parsedCaptions[index]) {
          return;
        }
        const container = row.querySelector(".wave-cell");
        if (container) {
          renderWaveformCanvas(container, parsedCaptions[index]);
        }
      });
    });
  }

  async function prepareWaveform(arrayBuffer) {
    audioBuffer = null;
    waveformData = null;
    waveformStepDuration = 0;

    const globalWindow = typeof window !== "undefined" ? window : null;
    const AudioContextCtor =
      globalWindow && (globalWindow.AudioContext || globalWindow.webkitAudioContext)
        ? globalWindow.AudioContext || globalWindow.webkitAudioContext
        : null;
    if (!AudioContextCtor || !arrayBuffer) {
      updateAllWaveforms();
      return;
    }

    try {
      if (!audioContext) {
        audioContext = new AudioContextCtor();
      }

      if (audioContext.state === "suspended") {
        try {
          await audioContext.resume();
        } catch (resumeError) {
          console.warn("Unable to resume audio context:", resumeError);
        }
      }

      const decodedBuffer = await decodeAudioBuffer(arrayBuffer);
      audioBuffer = decodedBuffer;
      waveformData = buildWaveformData(decodedBuffer);
      waveformStepDuration = waveformData.length ? decodedBuffer.duration / waveformData.length : 0;
    } catch (err) {
      console.warn("Failed to decode audio for waveform preview:", err);
      audioBuffer = null;
      waveformData = null;
      waveformStepDuration = 0;
    } finally {
      updateAllWaveforms();
    }
  }

  function decodeAudioBuffer(arrayBuffer) {
    return new Promise((resolve, reject) => {
      if (!audioContext) {
        reject(new Error("Audio context is not initialized"));
        return;
      }
      audioContext.decodeAudioData(
        arrayBuffer,
        buffer => resolve(buffer),
        error => reject(error || new Error("decodeAudioData failed"))
      );
    });
  }

  function buildWaveformData(buffer) {
    const sampleCount = buffer.length;
    const channelCount = buffer.numberOfChannels;
    if (!sampleCount || !channelCount) {
      return new Float32Array();
    }

    const duration = Math.max(buffer.duration, 0.001);
    const targetPoints = Math.min(5000, Math.max(200, Math.ceil(duration * 200)));
    const samplesPerPoint = Math.max(1, Math.floor(sampleCount / targetPoints));
    const pointCount = Math.ceil(sampleCount / samplesPerPoint);
    const peaks = new Float32Array(pointCount);
    const channelData = [];

    for (let channel = 0; channel < channelCount; channel++) {
      channelData.push(buffer.getChannelData(channel));
    }

    for (let point = 0; point < pointCount; point++) {
      const start = point * samplesPerPoint;
      const end = Math.min(sampleCount, start + samplesPerPoint);
      let peak = 0;
      for (let sampleIndex = start; sampleIndex < end; sampleIndex++) {
        let value = 0;
        for (let channel = 0; channel < channelCount; channel++) {
          value += Math.abs(channelData[channel][sampleIndex]);
        }
        value /= channelCount;
        if (value > peak) {
          peak = value;
        }
      }
      peaks[point] = peak;
    }

    return peaks;
  }

  function renderWaveformCanvas(container, block) {
    if (!container) {
      return;
    }

    const startSeconds = toSeconds(block.start);
    const endSeconds = Math.max(startSeconds, toSeconds(block.end));
    const totalDuration = Math.max(endSeconds - startSeconds, 0.001);

    if (!audioBuffer || !waveformData || !waveformData.length || !waveformStepDuration) {
      container.classList.remove("interactive");
      container.onclick = null;
      container.innerHTML = "";
      const placeholder = document.createElement("span");
      placeholder.className = "wave-placeholder";
      placeholder.textContent = currentAudioFile ? "Waveform loading..." : "Load audio";
      container.appendChild(placeholder);
      return;
    }

    container.classList.add("interactive");

    let canvas = container.querySelector("canvas");
    if (!canvas) {
      container.innerHTML = "";
      canvas = document.createElement("canvas");
      canvas.className = "wave-canvas";
      container.appendChild(canvas);
    }

    const globalWindow = typeof window !== "undefined" ? window : null;
    const schedule =
      globalWindow && typeof globalWindow.requestAnimationFrame === "function"
        ? callback => globalWindow.requestAnimationFrame(callback)
        : callback => setTimeout(callback, 16);

    const draw = () => {
      const dpr =
        globalWindow && typeof globalWindow.devicePixelRatio === "number"
          ? globalWindow.devicePixelRatio
          : 1;
      const width = Math.max(120, container.clientWidth || 220);
      const baseHeight = Math.max(44, container.clientHeight || 56);
      const renderHeight = Math.floor(baseHeight * 1.6);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(renderHeight * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${baseHeight}px`;
      drawWaveformSegment(canvas, startSeconds, endSeconds, dpr);
      updateWavePlayhead(container, block, getCurrentAudioTime());
    };

    if (container.clientWidth === 0) {
      schedule(draw);
    } else {
      draw();
    }

    const blockIndex = parseInt(container.dataset.captionIndex || "", 10);

    const extractInteraction = event => {
      const targetCanvas = container.querySelector("canvas");
      if (!targetCanvas) {
        return null;
      }
      const rect = targetCanvas.getBoundingClientRect();
      if (!rect.width) {
        return null;
      }
      const rawRatio = (event.clientX - rect.left) / rect.width;
      const ratio = Math.min(Math.max(rawRatio, 0), 1);
      const targetTime = Math.min(
        Math.max(startSeconds + ratio * totalDuration, startSeconds),
        endSeconds
      );
      return { ratio, targetTime };
    };

    container.onclick = event => {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
      if (typeof event.stopPropagation === "function") {
        event.stopPropagation();
      }
      const info = extractInteraction(event);
      if (!info) {
        return;
      }
      if (cutState.active && cutState.index === blockIndex) {
        performSplitAt(blockIndex, info.targetTime);
        return;
      }
      if (!elements.audioPlayer || !elements.audioPlayer.src) {
        return;
      }
      playCaption(block, info.targetTime);
    };

    container.onmousemove = event => {
      if (!(cutState.active && cutState.index === blockIndex)) {
        hideWaveCutPreview(container);
        return;
      }
      const info = extractInteraction(event);
      if (!info) {
        hideWaveCutPreview(container);
        return;
      }
      updateWaveCutPreview(container, info.ratio);
    };

    container.onmouseleave = () => {
      hideWaveCutPreview(container);
    };
  }

  function drawWaveformSegment(canvas, startSeconds, endSeconds, pixelRatio = 1) {
    if (!canvas || !waveformData || !waveformData.length || !waveformStepDuration || !audioBuffer) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const baseline = height / 2;
    const clampedStart = Math.max(0, Math.min(startSeconds, audioBuffer.duration));
    const clampedEnd = Math.max(clampedStart + 0.001, Math.min(endSeconds, audioBuffer.duration));

    const startIndex = Math.max(0, Math.floor(clampedStart / waveformStepDuration));
    const endIndex = Math.min(waveformData.length - 1, Math.ceil(clampedEnd / waveformStepDuration));
    const segmentLength = Math.max(1, endIndex - startIndex);
    const samplesPerPixel = segmentLength / Math.max(1, width);

    ctx.fillStyle = "rgba(77, 141, 255, 0.72)";
    for (let x = 0; x < width; x++) {
      const rangeStart = startIndex + Math.floor(x * samplesPerPixel);
      const rangeEnd = Math.min(waveformData.length - 1, rangeStart + Math.max(1, Math.ceil(samplesPerPixel)));
      let peak = 0;
      for (let i = rangeStart; i <= rangeEnd; i++) {
        const value = waveformData[i];
        if (value > peak) {
          peak = value;
        }
      }
      const amplitude = peak * (height / 2);
      ctx.fillRect(x, baseline - amplitude, 1, Math.max(1, amplitude * 2));
    }

    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    ctx.lineWidth = pixelRatio;
    ctx.beginPath();
    ctx.moveTo(0, baseline);
    ctx.lineTo(width, baseline);
    ctx.stroke();
  }

  function normalizeTimecode(raw, fallback) {
    const seconds = parseTimecodeToSeconds(raw);
    if (seconds == null) {
      if (typeof fallback === "string" && fallback.trim()) {
        return fallback;
      }
      return "00:00:00,000";
    }
    return fromSeconds(seconds);
  }

  function parseTimecodeToSeconds(raw) {
    if (raw === null || raw === undefined) {
      return null;
    }

    if (typeof raw === "number" && Number.isFinite(raw)) {
      return raw;
    }

    const trimmed = String(raw).trim();
    if (!trimmed) {
      return null;
    }

    if (/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
      return parseFloat(trimmed);
    }

    const normalized = trimmed.replace(/,/g, "."); // allow comma or dot separator
    const parts = normalized.split(":");

    if (parts.length === 3) {
      const hours = parseInt(parts[0], 10);
      const minutes = parseInt(parts[1], 10);
      const seconds = parseFloat(parts[2]);
      if ([hours, minutes, seconds].some(Number.isNaN)) {
        return null;
      }
      return hours * 3600 + minutes * 60 + seconds;
    }

    if (parts.length === 2) {
      const minutes = parseInt(parts[0], 10);
      const seconds = parseFloat(parts[1]);
      if ([minutes, seconds].some(Number.isNaN)) {
        return null;
      }
      return minutes * 60 + seconds;
    }

    return null;
  }

  function normalizeTimestamp(input, fallback) {
    if (input === undefined || input === null || (typeof input === "string" && !input.trim())) {
      return fallback;
    }
    return normalizeTimecode(input, fallback);
  }

  function toSeconds(timestamp) {
    const value = parseTimecodeToSeconds(timestamp);
    return value == null ? 0 : value;
  }

  function fromSeconds(seconds) {
    if (!Number.isFinite(seconds)) {
      return "00:00:00,000";
    }
    const totalMilliseconds = Math.round(seconds * 1000);
    const normalizedMilliseconds = ((totalMilliseconds % 1000) + 1000) % 1000;
    const totalSeconds = Math.floor(totalMilliseconds / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${pad(h)}:${pad(m)}:${pad(s)},${pad(normalizedMilliseconds, 3)}`;
  }

  function pad(value, length = 2) {
    return value.toString().padStart(length, "0");
  }

  function syncHighlights() {
    const time = elements.audioPlayer.currentTime;
    parsedCaptions.forEach((block, idx) => {
      const start = toSeconds(block.start);
      const end = toSeconds(block.end);
      const isActive = time >= start && time <= end;
      const plainLine = elements.plainTextView.querySelector(`.caption-line[data-caption-index="${idx}"]`);
      const editorRow = elements.captionTable.querySelector(`.caption-row[data-caption-index="${idx}"]`);
      if (plainLine) {
        plainLine.classList.toggle("active", isActive);
        if (isActive) {
          const duration = Math.max(end - start, 0.1);
          const ratio = (time - start) / duration;
          const wordCount = plainLine.children.length;
          const activeIndex = Math.min(wordCount - 1, Math.floor(ratio * wordCount));
          Array.from(plainLine.children).forEach((child, i) => {
            child.classList.toggle("word-active", i === activeIndex);
          });
        } else {
          Array.from(plainLine.children).forEach(child => child.classList.remove("word-active"));
        }
      }
      if (editorRow) {
        editorRow.classList.toggle("active", isActive);
      }
      if (elements.captionTable) {
        const waveCell = elements.captionTable.querySelector(`.wave-cell[data-caption-index="${idx}"]`);
        if (waveCell) {
          updateWavePlayhead(waveCell, block, time);
        }
      }
    });
  }

  function clearHighlights() {
    elements.plainTextView.querySelectorAll(".caption-line").forEach(line => {
      line.classList.remove("active");
      line.querySelectorAll(".word-active").forEach(word => word.classList.remove("word-active"));
    });
    elements.captionTable.querySelectorAll(".caption-row.active").forEach(row => row.classList.remove("active"));
    clearWavePlayheads();
    clearWaveCutPreviews();
  }
})();
