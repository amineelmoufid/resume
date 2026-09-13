// --- DOM Elements ---
const recordToggleButton = document.getElementById('recordToggleButton');
const outputDiv = document.getElementById('output');
const statusDiv = document.getElementById('status');
const ttsContainer = document.getElementById('ttsContainer');
const ttsActionButton = document.getElementById('ttsActionButton');
const signInButton = document.getElementById('signInButton');
const copyButton = document.getElementById('copyButton');

// --- Constants & Configuration ---
// DANGER: Do NOT expose your API key in client-side code.
// This is for demonstration purposes only. In a real application,
// this request should be sent from a server-side backend.
const API_KEY_PLACEHOLDER = "YOUR_GEMINI_API_KEY";
const apiKeys = [
    "AIzaSyAymbB23KPZLnkNbyq6QdNj142qveCq-vs", // Primary
    "AIzaSyAcJ2ZHlmjzuNwbkah8uy9dPvOm-DCGUeI", // Secondary
    "AIzaSyAyXSdRlIvZUZNzuQnkxEYo-NVoM3JdqAU"  // Tertiary
];
const MODEL_NAME = "gemini-2.5-pro";
const AUDIO_MIME_TYPE = 'audio/webm';

// --- State ---
let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let currentApiKeyIndex = 0;

// --- UI State Management ---
function setUIState(state) {
    // Reset classes on elements that change
    statusDiv.className = '';
    recordToggleButton.classList.remove('is-recording', 'is-processing');
    ttsActionButton.disabled = true; // Disable by default
    ttsContainer.classList.remove('auth-needed'); // Also reset auth UI on state changes
    copyButton.style.display = 'none'; // Hide by default

    switch (state) {
        case 'idle':
            recordToggleButton.disabled = false;
            recordToggleButton.setAttribute('aria-label', 'Start Recording');
            statusDiv.textContent = 'Click the button to start recording.';
            outputDiv.classList.remove('visible');
            break;
        case 'recording':
            recordToggleButton.disabled = false; // Clickable to stop
            recordToggleButton.classList.add('is-recording');
            recordToggleButton.setAttribute('aria-label', 'Stop Recording');
            statusDiv.textContent = "Recording... Click the button to stop.";
            outputDiv.textContent = ""; // Clear previous results
            outputDiv.classList.remove('visible');
            break;
        case 'processing':
            recordToggleButton.disabled = true;
            recordToggleButton.classList.add('is-processing');
            recordToggleButton.setAttribute('aria-label', 'Processing');
            statusDiv.textContent = `Processing audio with ${MODEL_NAME}...`;
            break;
        case 'success':
            recordToggleButton.disabled = false;
            recordToggleButton.setAttribute('aria-label', 'Start Recording');
            statusDiv.textContent = "Done. Click to record again.";
            outputDiv.classList.add('visible');
            ttsActionButton.disabled = false; // Enable when there's text
            copyButton.style.display = 'block'; // Show on success
            break;
        case 'error':
            recordToggleButton.disabled = false;
            recordToggleButton.setAttribute('aria-label', 'Start Recording');
            statusDiv.className = 'error';
            // Specific error message is set by the caller
            outputDiv.classList.add('visible');
            break;
    }
}

// --- Event Listeners ---
recordToggleButton.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

ttsActionButton.addEventListener('click', performTTS);

signInButton.addEventListener('click', async () => {
    statusDiv.textContent = 'Please complete authentication in the popup window...';
    statusDiv.className = '';

    const width = 600;
    const height = 700;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);

    const authUrl = 'https://puter.com/?embedded_in_popup=true&request_auth=true';
    const authPopup = window.open(authUrl, 'puterAuth', `width=${width},height=${height},popup=true,top=${top},left=${left}`);

    await new Promise(resolve => {
        const poller = setInterval(() => {
            if (!authPopup || authPopup.closed) {
                clearInterval(poller);
                resolve();
            }
        }, 500);
    });

    // When popup is closed, hide the auth prompt and re-trigger the TTS action
    ttsContainer.classList.remove('auth-needed');
    // A small delay to allow the UI to update before starting the process again
    setTimeout(() => {
        performTTS();
    }, 100);
});

copyButton.addEventListener('click', async () => {
    const fullText = outputDiv.textContent;
    if (!fullText.trim()) return;

    const parts = fullText.split('The correct form:');
    const textToCopy = (parts.length > 1) ? parts[1].trim() : fullText.trim();

    if (!textToCopy) return;

    try {
        await navigator.clipboard.writeText(textToCopy);

        const originalText = copyButton.textContent;
        copyButton.textContent = 'Copied!';
        copyButton.classList.add('copied');

        setTimeout(() => {
            copyButton.textContent = originalText;
            copyButton.classList.remove('copied');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy text: ', err);
        statusDiv.textContent = 'Failed to copy text.';
        statusDiv.className = 'error';
    }
});

async function performTTS() {
    const fullText = outputDiv.textContent;
    if (!fullText.trim()) {
        return;
    }

    const parts = fullText.split('The correct form:');
    // If the split was successful, use the corrected text. Otherwise, fall back to the full text.
    const textToRead = (parts.length > 1) ? parts[1].trim() : fullText.trim();

    // Do not proceed if the final text to read is empty
    if (!textToRead) {
        return;
    }

    const originalButtonText = ttsActionButton.textContent;
    ttsActionButton.disabled = true;
    ttsActionButton.textContent = 'Generating audio...';
    statusDiv.textContent = ''; // Clear previous status messages
    statusDiv.className = '';

    const maxRetries = 6;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const audio = await puter.ai.txt2speech(textToRead, { engine: 'generative' });
            audio.play();

            // Re-enable the button only after the audio has finished playing
            audio.addEventListener('ended', () => {
                ttsActionButton.disabled = false;
                ttsActionButton.textContent = originalButtonText;
            });

            // Success, so we exit the function
            return;
        } catch (error) {
            console.error(`Puter.ai TTS Error (Attempt ${attempt}/${maxRetries}):`, error);

            // Check if the error is an authentication error
            if (error && error.code === 'auth_required') {
                statusDiv.textContent = 'Authentication is required to use this feature.';
                statusDiv.className = 'error';
                ttsContainer.classList.add('auth-needed');
                ttsActionButton.textContent = originalButtonText; // Restore text
                ttsActionButton.disabled = false; // Re-enable button visually, though it's hidden
                return; // Exit function, wait for user to click "Sign In"
            } else if (attempt < maxRetries) {
                statusDiv.textContent = `Audio generation failed. Retrying... Attempt ${attempt + 1}/${maxRetries}`;
                statusDiv.className = 'error';

                // Exponential backoff delay (1s, 2s, 4s, ...)
                const delay = 1000 * Math.pow(2, attempt - 1);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    // If the loop completes, all retries have failed.
    statusDiv.textContent = "Failed to generate audio. Please try again later.";
    statusDiv.className = 'error';
    ttsActionButton.disabled = false;
    ttsActionButton.textContent = originalButtonText;
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream, { mimeType: AUDIO_MIME_TYPE });

        isRecording = true;
        setUIState('recording');

        mediaRecorder.start();
        audioChunks = [];

        mediaRecorder.addEventListener('dataavailable', event => {
            audioChunks.push(event.data);
        });

        mediaRecorder.addEventListener('stop', async () => {
            const audioBlob = new Blob(audioChunks, { type: AUDIO_MIME_TYPE });
            await sendToGemini(audioBlob);
            // Stop all media tracks to turn off the microphone indicator
            stream.getTracks().forEach(track => track.stop());
        });
    } catch (err) {
        console.error("Error accessing microphone:", err);
        statusDiv.textContent = "Error: Could not access microphone. Please grant permission.";
        setUIState('error');
    }
}

function stopRecording() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isRecording = false;
        setUIState('processing');
    }
}

function sendToGemini(audioBlob) {
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
        const base64Audio = reader.result.split(',')[1];
        
        const prompt = `always write the transcription and the translation to english, and rewrite with the correct form in correct english.
example:
Transcription:
ما أريده هو اوفر فيو عبارة عن جمل قصيرة تتحدث عني وكل تفاصيل عني في جمل قصيرة.

Translation:
What I want is an overview in the form of short sentences that talk about me, and all the details about me in short sentences.

The correct form:
I'm looking for a brief overview about myself, presented in a series of short sentences.`;

        const requestBody = {
            "contents": [
                {
                    "parts": [
                        { "text": prompt },
                        {
                            "inline_data": {
                                "mime_type": AUDIO_MIME_TYPE,
                                "data": base64Audio
                            }
                        }
                    ]
                }
            ]
        };

        const maxTotalAttempts = 6; // 2 full rotations of the 3 keys
        for (let attempt = 1; attempt <= maxTotalAttempts; attempt++) {
            try {
                const currentKey = apiKeys[currentApiKeyIndex];
                const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${currentKey}`;

                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                });

                const data = await response.json();

                if (!response.ok) {
                    const errorMessage = data.error?.message || "An unknown API error occurred.";
                    throw new Error(`API Error: ${errorMessage}`);
                }

                if (data.candidates && data.candidates.length > 0 && data.candidates[0].content) {
                    const content = data.candidates[0].content.parts[0].text;
                    outputDiv.textContent = content;
                    setUIState('success');
                    return; // Success, exit the function
                } else {
                    let message = "No valid content from API. Audio might be silent or unprocessable.";
                    if (data.candidates && data.candidates[0].finishReason) {
                        message += ` (Reason: ${data.candidates[0].finishReason})`;
                    }
                    throw new Error(message);
                }
            } catch (error) {
                console.error(`Attempt ${attempt} with key index ${currentApiKeyIndex} failed:`, error);
                
                // Rotate to the next API key for the next attempt
                currentApiKeyIndex = (currentApiKeyIndex + 1) % apiKeys.length;

                if (attempt < maxTotalAttempts) {
                    statusDiv.textContent = `Service issue detected. Retrying... (${attempt}/${maxTotalAttempts})`;
                }
            }
        }

        // If the loop completes, all attempts have failed across all keys.
        const finalErrorMessage = "The service is currently unavailable after multiple attempts. Please try again later.";
        outputDiv.textContent = finalErrorMessage;
        statusDiv.textContent = "Processing failed.";
        setUIState('error');
    };
}

// --- Initialization ---
function initialize() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
        statusDiv.textContent = "Error: Your browser does not support the required audio recording APIs.";
        setUIState('error');
        recordToggleButton.disabled = true; // Permanently disable
        return;
    }

    if (!apiKeys || apiKeys.length === 0 || apiKeys.some(key => key === API_KEY_PLACEHOLDER || !key.startsWith("AIza"))) {
        statusDiv.innerHTML = `<strong>Error:</strong> Please configure valid API keys in the script.`;
        setUIState('error');
        recordToggleButton.disabled = true; // Permanently disable
    } else {
        setUIState('idle');
    }
}

initialize();