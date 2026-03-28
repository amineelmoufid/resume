document.addEventListener('DOMContentLoaded', () => {
            const introElement = document.getElementById('intro-text');
            let lineIndex = 0;
            let wordIndex = 0;

            function typeWriter() {
                if (lineIndex < introText.length) {
                    // Find the previous highlight and convert it to plain text
                    const lastHighlight = introElement.querySelector('.typing-highlight');
                    if (lastHighlight) {
                        lastHighlight.outerHTML = lastHighlight.textContent + ' ';
                    }

                    const words = introText[lineIndex].split(' ');
                    if (wordIndex < words.length) {
                        // Add the new word with the highlight
                        introElement.innerHTML += `<span class="typing-highlight">${words[wordIndex]}</span>`;
                        wordIndex++;
                        setTimeout(typeWriter, 150); // Speed between words
                    } else {
                        // Go to the next line
                        introElement.innerHTML += '<br>';
                        lineIndex++;
                        wordIndex = 0;
                        setTimeout(typeWriter, 500); // Pause between lines
                    }
                } else {
                     // Final cleanup: remove the last highlight when done
                    const lastHighlight = introElement.querySelector('.typing-highlight');
                    if (lastHighlight) {
                        lastHighlight.outerHTML = lastHighlight.textContent;
                    }
                }
            }
            typeWriter(); // Start the animation

            const aboutMeAudio = document.getElementById('about-me-audio');
            const experiencesAudio = document.getElementById('experiences-audio');
            const personalityAudio = document.getElementById('personality-audio');
            const skillsAudio = document.getElementById('skills-audio');

            const cabinet = document.getElementById('cabinet');
            const cabinetFront = document.querySelector('.cabinet-front');
            const fileStack = document.getElementById('file-stack');
            const cabinetBody = document.querySelector('.cabinet-body');
            const allFolders = [];
            
            let currentlyOpenFolder = null;
            let currentlyDisplayedModalTarget = null; // New: Track which modal is open
            let modalSlideshowInterval = null;
            const totalSlideshowImages = 83; // Total number of images in the sequence

            let currentActiveAudio = null; // Track which audio is currently associated with a transcript
            let userAudioPreference = null; // null: undecided, true: enabled, false: disabled
            let isGuidedTourActive = false;
            const mainTourSequence = [19, 15, 10, 6, 1]; // The core narrative loop
            const finaleFolderId = 23; // The definitive end
            let currentSessionQueue = []; // Will hold the custom playlist for the current session
            let sessionTourIndex = 0; // Tracks progress in the custom playlist

            const allowedTabIds = [1, 6, 10, 15, 19, 23];

            portfolioData.forEach((file, i) => {
                const folder = document.createElement('div');
                folder.className = 'file-folder';
                folder.dataset.id = file.id;
                folder.style.transitionDelay = `${0.02 * i}s`;
                
                const visualPart = document.createElement('div');
                visualPart.className = 'folder-visuals';
                
                if (allowedTabIds.includes(file.id)) {
                    folder.classList.add('has-prominent-hover');
                    const tab = document.createElement('div');
                    tab.className = 'tab';
                    const randomFactor = Math.random();
                    tab.style.setProperty('--random-factor', randomFactor);
                    tab.textContent = file.tabLabel;
                    visualPart.appendChild(tab);
                }
                
                const contentArea = document.createElement('div');
                contentArea.className = 'folder-content-area';

                folder.appendChild(visualPart);
                folder.appendChild(contentArea);
                fileStack.appendChild(folder);
                allFolders.push(folder);
            });

            function toggleCabinet() {
                if (currentlyOpenFolder) {
                    closeFolder(currentlyOpenFolder);
                }
                cabinet.classList.toggle('is-open');
                cabinetFront.classList.toggle('no-hover');
                document.body.classList.toggle('cabinet-is-open');

                // This will toggle the fade on the background collage in perfect sync
                document.getElementById('background-collage').classList.toggle('is-hidden');

                // Ask for audio consent once
                if (cabinet.classList.contains('is-open') && userAudioPreference === null) {
                    setTimeout(() => {
                        document.getElementById('audio-consent-modal').style.display = 'flex';
                    }, 1000);
                }
            }

            cabinetFront.addEventListener('click', toggleCabinet);

            window.addEventListener('wheel', (event) => {
                if (!cabinet.classList.contains('is-open') && event.deltaY > 0) {
                    toggleCabinet();
                    event.preventDefault();
                }
            });

            // Swipe detection
            let touchStartY = 0;
            cabinetFront.addEventListener('touchstart', (e) => {
                touchStartY = e.touches[0].clientY;
            }, {passive: true});

            cabinetFront.addEventListener('touchend', (e) => {
                let touchEndY = e.changedTouches[0].clientY;
                if (touchStartY - touchEndY > 30) {
                    // Swiped up
                    if (!cabinet.classList.contains('is-open')) {
                        toggleCabinet();
                    }
                }
            }, {passive: true});
            
            function openFolder(folder) {
                // Add this at the beginning of the openFolder function
                // If story mode is active but a playlist hasn't been built yet, this is the first click.
                if (isGuidedTourActive && currentSessionQueue.length === 0) {
                    const startId = parseInt(folder.dataset.id);

                    // Case 1: User starts the tour by clicking the finale folder
                    if (startId === finaleFolderId) {
                        // The queue starts with the finale, then the full main sequence, then the finale again.
                        // This ensures after the first 'Contact' audio, the tour proceeds to the beginning of the narrative.
                        currentSessionQueue = [finaleFolderId, ...mainTourSequence, finaleFolderId];
                        sessionTourIndex = 0;

                    // Case 2: User starts the tour by clicking a folder within the main sequence
                    } else {
                        const startIndex = mainTourSequence.indexOf(startId);
                        if (startIndex !== -1) {
                            // This logic correctly starts the playlist with the clicked folder,
                            // wraps around the sequence, and concludes with the finale.
                            const restOfSequence = mainTourSequence.slice(startIndex);
                            const beginningOfSequence = mainTourSequence.slice(0, startIndex);
                            currentSessionQueue = [...restOfSequence, ...beginningOfSequence, finaleFolderId];
                            sessionTourIndex = 0;
                        } else {
                            // If a non-tour, non-finale folder is clicked, deactivate the tour for this session.
                            isGuidedTourActive = false;
                        }
                    }
                }
                document.body.classList.add('folder-is-expanded-globally');
                
                const folderId = parseInt(folder.dataset.id);
                const folderIndex = allFolders.indexOf(folder);
                const contentArea = folder.querySelector('.folder-content-area');
                
                const desiredTop = (window.innerHeight * 0.1) + 18; 
                
                // When a folder expands, .file-stack height becomes 800px.
                // With 30px padding and 4px borders, the total cabinet height becomes 834px.
                // Flexbox perfectly centers this height within the viewport.
                const finalCabinetTop = (window.innerHeight - 834) / 2;
                
                // The native offset of the folder within the cabinet (static CSS un-transformed heights).
                // 30px (padding-top) + 2px (cabinet border-top) + (20px per folder).
                const folderOffset = 32 + (folderIndex * 20);
                
                // Calculate the exact translateY required to put the folder at desiredTop,
                // without relying on getBoundingClientRect which fails during rapid clicks.
                const cabinetMoveDistance = desiredTop - (finalCabinetTop + folderOffset);
                cabinet.style.transform = `translateY(${cabinetMoveDistance}px)`;

                const fileData = portfolioData.find(item => item.id == folderId);
                if (fileData) {
                    let controlsHTML = `
                        <button class="folder-control-button" id="zoom-out-button" title="Zoom Out">-</button>
                        <button class="folder-control-button" id="zoom-in-button" title="Zoom In">+</button>
                    `;

                    if (folderId === 23) {
                        controlsHTML = `
                        <button class="folder-control-button" title="LinkedIn" data-action="link" data-value="https://www.linkedin.com/in/amine-elmoufid/"><img src='https://img.icons8.com/?size=100&id=uzhJQ5CyNoaH&format=png&color=000000' style='height: 20px'></button>
                        <button class="folder-control-button" title="Instagram" data-action="link" data-value="https://instagram.com/amine_elmoufid"><img src='https://img.icons8.com/?size=100&id=ZOFC5nSr215Y&format=png&color=000000' style='height: 20px'></button>
                        <button class="folder-control-button" title="Email" data-action="copy" data-value="amine.elmoufid.personal@gmail.com" data-link="mailto:amine.elmoufid.personal@gmail.com"><img src='https://img.icons8.com/?size=100&id=63489&format=png&color=000000' style='height: 20px'></button>
                        <button class="folder-control-button" title="Phone / WhatsApp" data-action="copy" data-value="+212675223453" data-link="https://wa.me/212675223453"><img src='https://img.icons8.com/?size=100&id=fAnexogbxI5v&format=png&color=000000' style='height: 20px'></button>
                        <button class="folder-control-button" id="download-button" title="Download Resume" data-action="download" data-value="assets/Resume amine elmoufid.pdf" data-link="https://amine-elmoufid.ink/assets/Resume%20amine%20elmoufid.pdf"><img src='https://img.icons8.com/?size=100&id=23882&format=png&color=000000' style='height: 20px'></button>
                        `;
                    }

                    contentArea.innerHTML = `
                        <div class="folder-header">
                            <h2 class="pulled-folder-title">${fileData.title}</h2>
                            <div class="folder-controls">
                                ${controlsHTML}
                                <button class="folder-control-button close-folder-button" title="Close">×</button>
                            </div>
                        </div>
                        <div class="pulled-folder-text">${fileData.content}</div>
                    `;

                    const pulledText = contentArea.querySelector('.pulled-folder-text');
                    const zoomInButton = contentArea.querySelector('#zoom-in-button');
                    const zoomOutButton = contentArea.querySelector('#zoom-out-button');

                    // Original logic for text zoom
                    if (pulledText && zoomInButton && zoomOutButton) {
                        const changeFontSize = (amount) => {
                            const style = window.getComputedStyle(pulledText, null).getPropertyValue('font-size');
                            let currentSize = parseFloat(style);
                            currentSize += amount;
                            if (currentSize < 8) currentSize = 8;
                            if (currentSize > 32) currentSize = 32;
                            pulledText.style.fontSize = `${currentSize}px`;
                        };

                        zoomInButton.addEventListener('click', (e) => { e.stopPropagation(); changeFontSize(1); });
                        zoomOutButton.addEventListener('click', (e) => { e.stopPropagation(); changeFontSize(-1); });
                    }

                    // Auto-open the modal for the "My Skills" folder (ID 6) ONLY.
                    if (fileData.id == 6) {
                        const firstSkillBox = contentArea.querySelector('.skill-box');
                        if (firstSkillBox) openModalForContent(firstSkillBox);
                    }
                } else {
                    contentArea.innerHTML = `
                        <div class="folder-header">
                            <h2 class="pulled-folder-title">File #${String(folderId).padStart(3, '0')}</h2>
                            <div class="folder-controls">
                                <button class="folder-control-button close-folder-button" title="Close">×</button>
                            </div>
                        </div>
                        <div class="pulled-folder-text">File not found.</div>
                    `;
                }
                contentArea.querySelector('.close-folder-button').addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeFolder(folder);
                });
                
                cabinet.classList.add('folder-is-expanded');
                folder.classList.add('is-expanded');
                currentlyOpenFolder = folder;

                allFolders.forEach((f, index) => {
                    if (index < folderIndex) {
                        f.classList.add('move-up');
                    } else if (index > folderIndex) {
                        f.classList.add('move-down');
                    }
                });

                const audioSections = {
                    '1': { 
                        type: 'structured', 
                        audioElId: 'what-ive-done-audio', 
                        timestamps: whatIveDoneTimestamps,
                        targetElementsSelector: '[data-target]', // Selector for all highlightable elements
                        highlightClass: 'highlight-sentence'  // The CSS class to apply
                    },
                    '6':  { 
                        type: 'structured', 
                        audioElId: 'skills-audio', 
                        timestamps: skillsTimestamps,
                        // We are keeping the sentence-by-sentence logic for this one
                    },
                    '10': { type: 'prose', audioElId: 'personality-audio', timestamps: personalityTimestamps },
                    '15': { type: 'prose', audioElId: 'experiences-audio', timestamps: experiencesTimestamps },
                    '19': { type: 'prose', audioElId: 'about-me-audio', timestamps: aboutMeTimestamps }
                };


                const config = audioSections[folderId];
                if (config) {
                    if (config.type === 'prose') {
                        currentActiveAudio = config.audioEl;
                        const textContainer = contentArea.querySelector('.pulled-folder-text');
                        textContainer.innerHTML = ''; // Clear it first
                        initializeProseTranscript(contentArea, textContainer, config);
                    } else if (config.type === 'structured') {
                        initializeStructuredTranscript(contentArea, config);
                    }
                } else if (isGuidedTourActive && folderId === finaleFolderId) {
                    // This is the finale folder, and it has no audio.
                    // It's the end of the tour. We'll manually trigger the next step after a delay
                    // to allow the user to read the contact info.
                    setTimeout(() => {
                        // This will call advanceGuidedTour, which will close this folder,
                        // see the index is at the end, and perform the final cabinet closing.
                        advanceGuidedTour(); 
                    }, 30000); // 30-second delay.
                }
            }

            function initializeProseTranscript(contentArea, textContainer, config) {
                const audio = document.getElementById(config.audioElId);
                if (!audio) return;

                const audioControlBtn = document.createElement('button');
                audioControlBtn.id = 'audio-control-button';
                contentArea.appendChild(audioControlBtn);

                const parentFolder = contentArea.closest('.file-folder');
                if (parentFolder) {
                    const folderId = parseInt(parentFolder.dataset.id, 10);
                    if (folderId !== 23) {
                        // Shift button left to avoid overlapping folder controls
                        audioControlBtn.style.right = '20px';
                        audioControlBtn.style.top = '24px';

                    }
                }

                // Add this block for autoplay
                if (userAudioPreference === true) {
                    audio.currentTime = 0;
                    audio.play();
                    audioControlBtn.classList.add('is-playing');
                }

                config.timestamps.forEach(item => {
                    const span = document.createElement('span');
                    span.innerHTML = (item.html || item.text) + ' ';
                    span.dataset.start = item.start;
                    span.dataset.end = item.end;
                    textContainer.appendChild(span);
                });

                const timeUpdateHandler = () => syncHighlight(audio.currentTime);
                const endedHandler = () => {
                    syncHighlight(-1);
                    audioControlBtn.classList.remove('is-playing');
                };

                audio.addEventListener('timeupdate', timeUpdateHandler);
                audio.addEventListener('ended', endedHandler);

                // Add this line inside BOTH initializeProseTranscript and initializeStructuredTranscript
                audio.addEventListener('ended', advanceGuidedTour);

                textContainer.addEventListener('click', (event) => {
                    if (event.target.tagName === 'SPAN' && event.target.dataset.start) {
                        audio.currentTime = parseFloat(event.target.dataset.start);
                        audio.play();
                        audioControlBtn.classList.add('is-playing');
                    }
                });

                audioControlBtn.addEventListener('click', () => {
                    if (audio.paused) {
                        audio.play();
                        audioControlBtn.classList.add('is-playing');
                    } else {
                        audio.pause();
                        audioControlBtn.classList.remove('is-playing');
                    }
                });
            }

            function openModalForContent(targetElement) {
                if (!targetElement) return;
                const fullContent = targetElement.dataset.fullContent;
                if (fullContent) {
                    skillModalContent.innerHTML = fullContent;
                    skillModalContent.appendChild(modalCloseButton); // Re-append close button
                    skillModal.style.display = 'flex';
                    skillModal.classList.add('is-visible');
                    currentlyDisplayedModalTarget = targetElement.getAttribute('data-skill') || targetElement.getAttribute('data-concept');
                }
            }

            function syncStructuredHighlight(currentTime, contentArea, config) {
                let activeGroup = null;

                // Find which group of timings is currently active
                for (const group of config.timestamps) {
                    if (group.timings && group.timings.length > 0) {
                        const firstSentence = group.timings[0];
                        const lastSentence = group.timings[group.timings.length - 1];
                        if (currentTime >= firstSentence.start && currentTime <= lastSentence.end) {
                            activeGroup = group;
                            break;
                        }
                    }
                }

                if (activeGroup) {
                    // NEW LOGIC: Check if the active group is for the main content area
                    if (activeGroup.isMainContent) {
                        // Handle highlighting directly in the folder's content area
                        let activeTargetSelector = null;

                        // NEW: Check if the main content group has sentence-level timings
                        if (activeGroup.timings[0].sentenceSelector) {
                            let activeSentenceSelector = null;
                            activeGroup.timings.forEach(item => {
                                if (currentTime >= item.start && currentTime < item.end) {
                                    activeSentenceSelector = item.sentenceSelector;
                                }
                            });
                            const allSentences = contentArea.querySelectorAll('[data-sentence-id]');
                            allSentences.forEach(s => {
                                const shouldHighlight = activeSentenceSelector && s.matches(activeSentenceSelector);
                                s.classList.toggle('highlight-sentence', shouldHighlight);
                            });
                            // Also clear any block-level highlights
                            contentArea.querySelectorAll('[data-target]').forEach(t => t.classList.remove('highlight-sentence'));
                            return; // Exit after handling sentence-level highlights
                        } else {
                            // Original logic for block-level highlights
                            activeGroup.timings.forEach(item => {
                                if (currentTime >= item.start && currentTime < item.end) {
                                    activeTargetSelector = item.targetSelector;
                                }
                            });
                        }
                    
                        const allTargets = contentArea.querySelectorAll('[data-target]');
                        allTargets.forEach(target => {
                            const shouldHighlight = activeTargetSelector && target.matches(activeTargetSelector);
                            target.classList.toggle('highlight-sentence', shouldHighlight);
                        });

                        // Ensure modal is closed
                        if (skillModal.style.display === 'flex') {
                            skillModal.style.display = 'none';
                            skillModal.classList.remove('is-visible');
                            currentlyDisplayedModalTarget = null;
                        }

                    } else {
                        // Handle modal sequencing and highlighting
                        let activeSentence = null;
                        for (const sentence of activeGroup.timings) {
                            if (currentTime >= sentence.start && currentTime <= sentence.end) {
                                activeSentence = sentence;
                                break;
                            }
                        }

                        // If the active sentence has a trigger, use it to open the modal.
                        // This is a workaround for content that is missing the `data-concept` attribute for the standard logic below.
                        if (activeSentence && activeSentence.modalTriggerSelector) {
                            const triggerElement = contentArea.querySelector(activeSentence.modalTriggerSelector);
                            const modalId = activeGroup.targetSelector; // Use group selector as a unique ID.
                            if (triggerElement && currentlyDisplayedModalTarget !== modalId) {
                                openModalForContent(triggerElement);
                                currentlyDisplayedModalTarget = modalId; // Manually set the ID as the element lacks the data attribute.
                            }
                        }

                        const activeTargetSelector = activeGroup.targetSelector;
                        const activeTargetIdentifier = contentArea.querySelector(activeTargetSelector)?.getAttribute('data-concept') || contentArea.querySelector(activeTargetSelector)?.getAttribute('data-skill');

                        // Open the correct modal if it's not already open
                        if (activeTargetIdentifier && activeTargetIdentifier !== currentlyDisplayedModalTarget) {
                            openModalForContent(contentArea.querySelector(activeTargetSelector));
                        }

                        // Highlight sentence inside the modal
                        if (skillModal.style.display === 'flex') {
                            const isSelectorBased = activeGroup && activeGroup.timings.length > 0 && activeGroup.timings[0].sentenceSelector;

                            if (isSelectorBased) {
                                // Handles selector-based highlighting (e.g., What I've Done)
                                let activeSentenceSelector = null;
                                if (activeGroup) {
                                    for (const sentence of activeGroup.timings) {
                                        if (currentTime >= sentence.start && currentTime <= sentence.end) {
                                            activeSentenceSelector = sentence.sentenceSelector;
                                            break;
                                        }
                                    }
                                }
                                const allSentences = skillModalContent.querySelectorAll('[data-sentence-id]');
                                allSentences.forEach(s => {
                                    const shouldHighlight = activeSentenceSelector && s.matches(activeSentenceSelector);
                                    s.classList.toggle('highlight-sentence', shouldHighlight);
                                });
                            } else { 
                                // Handles index-based highlighting (e.g., My Skills)
                                let activeSentenceIndex = -1;
                                if (activeGroup) {
                                    for (let i = 0; i < activeGroup.timings.length; i++) {
                                        if (currentTime >= activeGroup.timings[i].start && currentTime <= activeGroup.timings[i].end) {
                                            activeSentenceIndex = i;
                                            break;
                                        }
                                    }
                                }
                                const listItems = skillModalContent.querySelectorAll('li');
                                listItems.forEach((li, index) => li.classList.toggle('highlight-sentence', index === activeSentenceIndex));
                            }
                        }
                    }
                } else {
                    // No active group, close modal and clear highlights
                    if (skillModal.style.display === 'flex') {
                        skillModal.style.display = 'none';
                        skillModal.classList.remove('is-visible');
                        currentlyDisplayedModalTarget = null;
                    }
                    const allTargets = contentArea.querySelectorAll('[data-target]');
                    allTargets.forEach(target => target.classList.remove('highlight-sentence'));
                    contentArea.querySelectorAll('[data-sentence-id]').forEach(s => s.classList.remove('highlight-sentence'));
                }
            }

            function initializeStructuredTranscript(contentArea, config) {
                const audio = document.getElementById(config.audioElId);
                if (!audio) return;
                currentActiveAudio = audio;
            
                // Create a lookup map for sentence timings for fast access
                const sentenceTimingsMap = new Map();
                config.timestamps.forEach(group => {
                    if (group.timings) {
                        group.timings.forEach(timing => {
                            const sentenceId = timing.sentenceSelector?.match(/data-sentence-id='([^']+)'/)?.[1] || timing.targetSelector?.match(/data-target='([^']+)'/)?.[1];
                            if (sentenceId) sentenceTimingsMap.set(sentenceId, timing);
                        });
                    }
                });

                const button = document.createElement('button');
                button.id = 'audio-control-button';
                contentArea.appendChild(button);
                
                const parentFolder = contentArea.closest('.file-folder');
                if (parentFolder) {
                    const folderId = parseInt(parentFolder.dataset.id, 10);
                    if (folderId !== 23) {
                        // Shift button left to avoid overlapping folder controls
                        button.style.right = '148px';
                    }
                }
                
                // Add this block for autoplay
                if (userAudioPreference === true) {
                    audio.currentTime = 0;
                    audio.play();
                    button.classList.add('is-playing');
                }
                
                button.addEventListener('click', () => {
                    if (audio.paused) {
                        // If starting from the beginning and it's a modal-based folder, open the first modal.
                        if (audio.currentTime === 0 && config.timestamps[0].timings && !config.timestamps[0].isMainContent) {
                            const firstGroup = config.timestamps[0];
                            openModalForContent(contentArea.querySelector(firstGroup.targetSelector));
                        }
                        audio.play();
                        button.classList.add('is-playing');
                    } else {
                        audio.pause();
                        button.classList.remove('is-playing');
                    }
                });
                
                const onTimeUpdate = () => syncStructuredHighlight(audio.currentTime, contentArea, config);
                audio.addEventListener('timeupdate', onTimeUpdate);
                // Add this line inside BOTH initializeProseTranscript and initializeStructuredTranscript
                audio.addEventListener('ended', advanceGuidedTour);

                audio.addEventListener('ended', () => {
                    onTimeUpdate(-1); // Remove highlights
                    button.classList.remove('is-playing');
                    // Close the modal at the end of playback
                    if (skillModal.style.display === 'flex') {
                        skillModal.style.display = 'none';
                        skillModal.classList.remove('is-visible');
                        currentlyDisplayedModalTarget = null;
                    }
                });
            
                // Click-to-play functionality
                contentArea.addEventListener('click', (event) => {
                    // New: Handle clicks on sentences with data-sentence-id for direct playback
                    const sentenceSpan = event.target.closest('span[data-sentence-id]');
                    if (sentenceSpan) {
                        const sentenceId = sentenceSpan.dataset.sentenceId;
                        const timing = sentenceTimingsMap.get(sentenceId);
                        if (timing) {
                            audio.currentTime = timing.start;
                            audio.play();
                            button.classList.add('is-playing');
                            event.stopPropagation(); // Prevent other listeners from firing
                        }
                        return; // Handled
                    }


                    const clickableItem = event.target.closest('.skill-box, .concept-item, [data-target]');
                    if (!clickableItem) return;

                    // Find the group and sentence that was clicked
                    for (const group of config.timestamps) {
                        // Case 1: A modal-triggering group item was clicked
                        if (!group.isMainContent && clickableItem.matches(group.targetSelector)) {
                            if (group.timings && group.timings.length > 0) {
                                openModalForContent(clickableItem);
                                audio.currentTime = group.timings[0].start;
                                if (userAudioPreference === true) {
                                    audio.play();
                                    button.classList.add('is-playing');
                                }
                            }
                            return; // Exit after handling
                        }

                        // Case 2: A sentence in the main content area was clicked
                        if (group.isMainContent && clickableItem.matches('[data-target]')) {
                            const sentence = group.timings.find(t => clickableItem.matches(t.targetSelector));
                            if (sentence) {
                                audio.currentTime = sentence.start;
                                if (userAudioPreference === true) {
                                    audio.play();
                                    button.classList.add('is-playing');
                                }
                            }
                            return; // Exit after handling
                        }
                    }
                });
            
                // ADD a NEW click handler for the modal content itself
                skillModalContent.addEventListener('click', (event) => {
                    if (currentActiveAudio !== audio) return; // Only act on the relevant audio

                    const sentenceEl = event.target.closest('[data-sentence-id]');
                    if (sentenceEl) {
                        const sentenceId = sentenceEl.getAttribute('data-sentence-id');
                        const currentGroup = config.timestamps.find(g => g.targetSelector.includes(currentlyDisplayedModalTarget));
                        if (currentGroup) {
                            const sentenceData = currentGroup.timings.find(t => t.sentenceSelector && t.sentenceSelector.includes(sentenceId));
                            if (sentenceData) {
                                audio.currentTime = sentenceData.start;
                                if(audio.paused && userAudioPreference === true) audio.play();
                            }
                        }
                        return;
                    }

                    // Fallback for index-based li (My Skills)
                    const listItem = event.target.closest('li');
                    if (listItem) {
                        const allListItems = Array.from(skillModalContent.querySelectorAll('li'));
                        const clickedIndex = allListItems.indexOf(listItem);
                        const currentGroup = config.timestamps.find(g => g.targetSelector.includes(currentlyDisplayedModalTarget));

                        if (currentGroup && currentGroup.timings[clickedIndex]) {
                            audio.currentTime = currentGroup.timings[clickedIndex].start;
                            if(audio.paused && userAudioPreference === true) audio.play();
                        }
                    }
                });
            }

           function advanceGuidedTour() {
                if (!isGuidedTourActive || currentSessionQueue.length === 0) return;

                if (currentlyOpenFolder) closeFolder(currentlyOpenFolder);
                
                sessionTourIndex++;

                setTimeout(() => {
                    if (sessionTourIndex >= currentSessionQueue.length) {
                        // Tour is officially over
                        isGuidedTourActive = false;
                        currentSessionQueue = [];
                        
                        // Check if the final folder is open and close it
                        if (currentlyOpenFolder) {
                            closeFolder(currentlyOpenFolder);
                        }
                        
                        // After a very brief delay to let the folder close animation start, close the cabinet
                        setTimeout(() => {
                            if (cabinet.classList.contains('is-open')) {
                                toggleCabinet();
                            }
                        }, 10); // A short 10ms delay is enough

                        return; // Stop further execution
                    }

                    const nextFolderId = currentSessionQueue[sessionTourIndex];
                    const nextFolderElement = document.querySelector(`.file-folder[data-id='${nextFolderId}']`);
                    if (nextFolderElement) openFolder(nextFolderElement);
                }, 750);
            }

            function syncHighlight(currentTime) {
                const sentences = document.querySelectorAll('.pulled-folder-text span');
                sentences.forEach(sentence => {
                    const start = parseFloat(sentence.dataset.start);
                    const end = parseFloat(sentence.dataset.end);
                    if (currentTime >= start && currentTime < end) {
                        sentence.classList.add('highlight-sentence');
                    } else {
                        sentence.classList.remove('highlight-sentence');
                    }
                });
            }

            function closeFolder(folder) {
                document.body.classList.remove('folder-is-expanded-globally');
                
                if (!folder) return;

                cabinet.style.transform = `translateY(0px)`;
                
                cabinet.classList.remove('folder-is-expanded');
                folder.classList.remove('is-expanded');
                currentlyOpenFolder = null;

                allFolders.forEach(f => {
                    f.classList.remove('move-up', 'move-down');
                });

                // Stop all audios
                const allAudioIds = ['about-me-audio', 'experiences-audio', 'personality-audio', 'skills-audio', 'what-ive-done-audio'];
                allAudioIds.forEach(id => {
                    const audio = document.getElementById(id);
                    if (audio) {
                        audio.pause();
                        
                        // Remove listeners FIRST by replacing the element
                        const newAudio = audio.cloneNode(true);
                        audio.parentNode.replaceChild(newAudio, audio);

                        // NOW it's safe to reset the time on the new, listener-free element
                        newAudio.currentTime = 0;
                    }
                });

                skillModal.style.display = 'none';
                skillModal.classList.remove('is-visible');
                currentlyDisplayedModalTarget = null;
                currentActiveAudio = null;
            }

            fileStack.addEventListener('click', (event) => {
                const folder = event.target.closest('.file-folder');
                if (!folder) return;

                const folderId = parseInt(folder.dataset.id);
                if (!allowedTabIds.includes(folderId)) {
                    return; // Ignore click if folder doesn't have a tab
                }

                if (currentlyOpenFolder && currentlyOpenFolder !== folder) {
                    closeFolder(currentlyOpenFolder);
                    setTimeout(() => {
                        openFolder(folder);
                    }, 100);
                } else if (folder.classList.contains('is-expanded') && !event.target.closest('.folder-content-area')) {
                    closeFolder(folder);
                } else if (!folder.classList.contains('is-expanded')) {
                    openFolder(folder);
                }
            });

            document.addEventListener('click', (event) => {
                // Ignore clicks inside the audio consent modal or the new info modal
                // Ignore clicks inside any modal to prevent the folder from closing
                if (event.target.closest('#audio-consent-modal') || event.target.closest('#info-modal') || event.target.closest('#pdf-modal')) {
                    return;
                }

                if (currentlyOpenFolder && !currentlyOpenFolder.contains(event.target)) {
                    closeFolder(currentlyOpenFolder);
                } else if (!cabinet.contains(event.target) && cabinet.classList.contains('is-open') && !currentlyOpenFolder) {
                    toggleCabinet();
                }
            });

            

            cabinetBody.addEventListener('click', (event) => {
                if (event.target === cabinetBody && !currentlyOpenFolder) {
                    toggleCabinet();
                }
            });


            // --- Start of new static modal code ---

// Create the static modal elements once
const skillModal = document.createElement('div');
skillModal.id = 'skill-modal';
const skillModalContent = document.createElement('div'); skillModalContent.className = 'skill-modal-content';
const skillModalCloseButton = document.createElement('span');
skillModalCloseButton.className = 'skill-modal-close';
skillModalCloseButton.innerHTML = '&times;'; // The 'X' character
skillModal.appendChild(skillModalContent);
skillModalContent.appendChild(skillModalCloseButton);
document.body.appendChild(skillModal);

// Add a click listener for the skill boxes to open the modal
fileStack.addEventListener('click', (event) => {
    const target = event.target.closest('.skill-box, .info-box, .concept-item');
    
    if (target) {
        const fullContent = target.dataset.fullContent;
        if (fullContent) {
            skillModalContent.innerHTML = fullContent; // Main content
            skillModalContent.appendChild(skillModalCloseButton); // Re-append close button
            skillModal.style.display = 'flex';
            skillModal.classList.add('is-visible');

            // Autoplay audio for "What I've Done" concept modals
            if (currentlyOpenFolder && currentlyOpenFolder.dataset.id === '1' && userAudioPreference === true) {
                for (const group of whatIveDoneTimestamps) {
                    if (group.timings && group.timings.length > 0) { const firstTiming = group.timings[0];
                        if (firstTiming.modalTriggerSelector && target.matches(firstTiming.modalTriggerSelector)) { const startTime = firstTiming.start;
                            const audio = document.getElementById('what-ive-done-audio');
                            const audioControlBtn = currentlyOpenFolder.querySelector('#audio-control-button');

                            if (audio && audioControlBtn) {
                                audio.currentTime = startTime;
                                audio.play();
                                audioControlBtn.classList.add('is-playing');
                                event.stopPropagation();
                            }
                            break;
                        }
                    }
                }
            }
        }
    }
});

// Add a click listener to close the modal
skillModalCloseButton.addEventListener('click', (event) => {
    if (currentActiveAudio && !currentActiveAudio.paused) {
        currentActiveAudio.pause();
        if (currentlyOpenFolder) {
            const audioControlBtn = currentlyOpenFolder.querySelector('#audio-control-button');
            if (audioControlBtn) {
                audioControlBtn.classList.remove('is-playing');
            }
        }
    }
    skillModal.classList.remove('is-visible');
    skillModal.style.display = 'none';
    event.stopPropagation(); // Prevent click from falling through to content underneath
});

// Also close the modal if the user clicks the overlay background
skillModal.addEventListener('click', (event) => {
    if (event.target === skillModal) {
        if (currentActiveAudio && !currentActiveAudio.paused) {
            currentActiveAudio.pause();
            if (currentlyOpenFolder) {
                const audioControlBtn = currentlyOpenFolder.querySelector('#audio-control-button');
                if (audioControlBtn) {
                    audioControlBtn.classList.remove('is-playing');
                }
            }
        }
        skillModal.classList.remove('is-visible');
        skillModal.style.display = 'none';
        event.stopPropagation();
    }
});

// Unified listener for the modal content area
skillModalContent.addEventListener('click', (event) => {
    // Prevent clicks inside the content area from closing the modal
    event.stopPropagation();
    // Handle the accordion functionality
    const trigger = event.target.closest('.accordion-trigger');
    if (trigger) {
        const panel = trigger.nextElementSibling;
        trigger.classList.toggle('is-active');
        if (panel.style.maxHeight) {
            panel.style.maxHeight = null;
        } else {
            panel.style.maxHeight = panel.scrollHeight + 'px';
        }
    }
});

// --- End of new static modal code ---

// --- Start of Unified Tooltip Logic ---
document.addEventListener('mouseover', (event) => {
    const target = event.target.closest('.skill-list li, .concept-item, .info-box, .skill-box');
    if (target) {
        const description = target.dataset.description || target.dataset.fullContent;
        if (description) {
            let content = description;
            if (target.matches('.skill-list li')) {
                content = `<strong>${target.textContent}</strong>: ${description}`;
            }
            skillTooltip.innerHTML = content;
            skillTooltip.style.display = 'block';
        }
    } else {
        // If we are not hovering a valid target, hide the tooltip
        const isOverTooltip = event.target.closest('#skill-tooltip');
        if (!isOverTooltip) {
             skillTooltip.style.display = 'none';
        }
    }
});

document.addEventListener('mousemove', (event) => {
    if (skillTooltip.style.display === 'block') {
        const offsetX = 15;
        const offsetY = 15;
        skillTooltip.style.left = `${event.pageX + offsetX}px`;
        skillTooltip.style.top = `${event.pageY + offsetY}px`;
    }
});
// --- End of Unified Tooltip Logic ---

            // --- Start of Info Modal for Contact Buttons ---
            const infoModal = document.getElementById('info-modal');
            const infoModalTitle = document.getElementById('info-modal-title');
            const infoModalText = document.getElementById('info-modal-text');
            const infoModalActions = document.getElementById('info-modal-actions');
            const infoModalClose = document.getElementById('info-modal-close');

            // Use event delegation to listen for clicks on the contact buttons
            document.addEventListener('click', (event) => {
                const contactButton = event.target.closest('button[data-action]');
                if (!contactButton) return;

                event.preventDefault(); // Prevent any default button behavior

                const action = contactButton.dataset.action;
                const value = contactButton.dataset.value;
                const link = contactButton.dataset.link;

                infoModalText.textContent = value;
                infoModalActions.innerHTML = ''; // Clear previous buttons

                if (action === 'link') {
                    infoModalTitle.textContent = 'Open Link';
                    const openButton = document.createElement('button');
                    openButton.textContent = 'Open in New Tab';
                    openButton.onclick = () => window.open(value, '_blank');
                    infoModalActions.appendChild(openButton);

                } else if (action === 'copy') {
                    const isEmail = value.includes('@');
                    infoModalTitle.textContent = isEmail ? 'Email' : 'Phone / WhatsApp';

                    // If there's a link, create an "Open" button
                    if (link) {
                        const openButton = document.createElement('button');
                        openButton.textContent = isEmail ? 'Send Email' : 'Open WhatsApp';
                        openButton.onclick = () => window.open(link, '_blank');
                        infoModalActions.appendChild(openButton);
                    }

                    // Always create the "Copy" button
                    const copyButton = document.createElement('button');
                    const copyText = `Copy ${isEmail ? 'Email' : 'Phone Number'}`;
                    copyButton.textContent = copyText;
                    copyButton.onclick = () => {
                        navigator.clipboard.writeText(value).then(() => {
                            copyButton.textContent = 'Copied!';
                            setTimeout(() => { copyButton.textContent = copyText; }, 2000);
                        });
                    };
                    infoModalActions.appendChild(copyButton);
                } else if (action === 'download') {
                    infoModalTitle.textContent = 'Download Resume';
                    infoModalText.textContent = link;

                    // Create Open Button
                    const openButton = document.createElement('button');
                    openButton.textContent = 'Open / Expand';
                    openButton.onclick = () => {
                        const pdfModal = document.getElementById('pdf-modal');
                        const pdfIframe = document.getElementById('pdf-modal-iframe');
                        if (pdfModal) {
                            pdfModal.style.display = 'flex';
                        }
                        if (pdfIframe) {
                            // Reset zoom
                            pdfIframe.style.transform = 'scale(1)';
                            pdfIframe.style.transformOrigin = 'top left';
                        }
                        closeInfoModal();
                    };
                    infoModalActions.appendChild(openButton);

                    // Create Download Button
                    const downloadButton = document.createElement('button');
                    downloadButton.textContent = 'Download File';
                    downloadButton.onclick = () => {
                        const a = document.createElement('a');
                        a.href = value; // data-value has the local path
                        a.download = 'Amine_Elmoufid_Resume.pdf'; // Set a nice filename
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    };
                    infoModalActions.appendChild(downloadButton);

                    // Create Copy Link Button
                    const copyLinkButton = document.createElement('button');
                    copyLinkButton.textContent = 'Copy Link';
                    copyLinkButton.onclick = () => {
                        navigator.clipboard.writeText(link).then(() => { // data-link has the public URL
                            copyLinkButton.textContent = 'Copied!';
                            setTimeout(() => { copyLinkButton.textContent = 'Copy Link'; }, 2000);
                        });
                    };
                    infoModalActions.appendChild(copyLinkButton);
                }
                infoModal.style.display = 'flex';
            });

            // Logic to close the info modal
            function closeInfoModal() {
                infoModal.style.display = 'none';
            }
            infoModalClose.addEventListener('click', closeInfoModal);
            infoModal.addEventListener('click', (event) => {
                if (event.target === infoModal) {
                    closeInfoModal();
                }
            });
            // --- End of Info Modal for Contact Buttons ---

            // --- Start of Audio Consent Modal ---
            const audioConsentModal = document.createElement('div');
            audioConsentModal.id = 'audio-consent-modal';
            audioConsentModal.innerHTML = `
                <div class="audio-consent-content">
                    <p><img src='https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/amine.ink/assets/imgs/read_aload.png' style='height: 30px';><br>Enable automatic audio narration?  </p>
                    <div class="audio-consent-buttons">
                        <button id="confirm-audio-yes"><b>Yes</b></button>
                        <button id="confirm-audio-no">No</button>
                    </div>
                </div>
            `;
            document.body.appendChild(audioConsentModal);

            const confirmYes = document.getElementById('confirm-audio-yes');
            const confirmNo = document.getElementById('confirm-audio-no');

            confirmYes.addEventListener('click', () => {
                userAudioPreference = true;
                isGuidedTourActive = true; // Enable story mode
                document.getElementById('audio-consent-modal').style.display = 'none';
            });

            confirmNo.addEventListener('click', () => {
                userAudioPreference = false;
                isGuidedTourActive = false;
                audioConsentModal.style.display = 'none';
            });
            // --- End of Audio Consent Modal ---

    // --- FINAL COLLAGE WATERFALL LOGIC ---

    const collageContainer = document.getElementById('background-collage');
    const allCollageImages = []; // An array to hold the created image elements

    // STEP 1: Immediately create all 83 images and add them to the page.
    // They will be invisible due to the CSS, but this allows the browser to start downloading them.
    for (let i = 1; i <= 83; i++) {
        const img = document.createElement('img');
        img.src = `https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/amine.ink/assets/imgs/(${i})-min.jpg`;
        img.className = 'collage-image clickable-image';

        // Apply your random positioning and rotation
        const randomTop = Math.random() * 90;
        const randomLeft = Math.random() * 90;
        const randomRotate = (Math.random() * 30) - 15;
        img.style.top = `${randomTop}vh`;
        img.style.left = `${randomLeft}vw`;
        img.style.transform = `rotate(${randomRotate}deg)`;

        // Store the image element and add it to the DOM
        allCollageImages.push(img);
        collageContainer.appendChild(img);
    }

    // STEP 2: After the initial 1-second delay, start the sequential reveal process.
    setTimeout(() => {
        let revealIndex = 0; // A counter for which image to reveal next
        
        // This function reveals one image and then schedules the next one
        function revealNextImage() {
            // Check if there are still images left to reveal
            if (revealIndex < allCollageImages.length) {
                // Add the .is-visible class to the current image to trigger its fade-in
                allCollageImages[revealIndex].classList.add('is-visible');
                revealIndex++;
                
                // Set a short delay (e.g., 100ms) before revealing the next image
                setTimeout(revealNextImage, 100); 
            }
        }

        // Kick off the very first reveal, starting the cascade
        revealNextImage();

    }, 1000); // The 1-second (10,000 milliseconds) initial delay

    // --- END OF FINAL COLLAGE LOGIC ---

    const pdfModal = document.getElementById('pdf-modal');
    const pdfModalClose = document.getElementById('pdf-modal-close');
    const pdfIframe = document.getElementById('pdf-modal-iframe');
    const zoomInBtn = document.getElementById('pdf-zoom-in');
    const zoomOutBtn = document.getElementById('pdf-zoom-out');
    let currentPdfZoom = 1.0;

    function openPdfModal() {
        pdfModal.style.display = 'flex';
        currentPdfZoom = 1.0; // Reset zoom every time
        pdfIframe.style.transform = 'scale(1)';
        pdfIframe.style.transformOrigin = 'top left';
    }
    // Event listener to CLOSE the modal
    pdfModalClose.addEventListener('click', () => {
        pdfModal.style.display = 'none';
    });


    // Add this listener for the PDF modal background click
    pdfModal.addEventListener('click', (event) => {
        // This is the crucial check: only close the modal if the click
        // was directly on the semi-transparent background itself.
        if (event.target === pdfModal) {
            
            // Hide the modal
            pdfModal.style.display = 'none';

            // --- CRITICAL FIX ---
            // This stops the click from bubbling up and being "heard"
            // by the listener that closes the main folder.
            event.stopPropagation();
        }
    });

    // This is the code for your EMBEDDED slideshow (the small one)
    // It can run independently.
    let embeddedSlideshowIndex = 1;
    const embeddedSlideshowElement = document.getElementById('slideshow');
    if (embeddedSlideshowElement) {
        setInterval(() => {
            embeddedSlideshowIndex = (embeddedSlideshowIndex % totalSlideshowImages) + 1;
            embeddedSlideshowElement.src = `https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/amine.ink/assets/imgs/(${embeddedSlideshowIndex}).jpg`;
        }, 500);
    }


    // This is your main click listener that OPENS the modal.
    // We will make it smarter.
    document.body.addEventListener('click', (event) => {
        // Check if a clickable image was clicked
        if (event.target.classList.contains('clickable-image')) {

            const imageModal = document.getElementById('image-modal');
            const modalImage = document.getElementById('modal-image-content');

            // --- CRITICAL: Cleanup ---
            // Always stop any previous slideshow before starting a new one.
            if (modalSlideshowInterval) {
                clearInterval(modalSlideshowInterval);
            }

            // Set the initial image in the modal to whatever was clicked.
            modalImage.src = event.target.src;

            // --- SMART LOGIC ---
            // Now, check if the CLICKED image was the special slideshow.
            if (event.target.id === 'slideshow') {
                
                // Get the current number from the image file name to start in sync
                let currentImageIndex = parseInt(event.target.src.match(/\((\d+)\)/)[1]);

                // Start a NEW interval timer specifically for the MODAL
                modalSlideshowInterval = setInterval(() => {
                    currentImageIndex = (currentImageIndex % totalSlideshowImages) + 1; // Correct loop logic
                    modalImage.src = `https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/amine.ink/assets/imgs/(${currentImageIndex}).jpg`;
                }, 1500); // 500ms to match the original speed
            }
            
            // Finaly, show the modal.
            imageModal.style.display = 'flex';
        }
    });


    // This is your MODAL CLOSE button listener.
    // It MUST also stop the slideshow.
    const modalCloseButton = document.getElementById('modal-close-button'); // Make sure your button has this ID
    modalCloseButton.addEventListener('click', (event) => {
        const imageModal = document.getElementById('image-modal');
        
        // --- CRITICAL: Cleanup ---
        // If a slideshow is running in the modal, stop it to prevent memory leaks.
        if (modalSlideshowInterval) {
            clearInterval(modalSlideshowInterval);
            modalSlideshowInterval = null;
        }

        imageModal.style.display = 'none';

        // --- CRITICAL FIX ---
        // This stops the click from traveling any further and closing the folder.
        event.stopPropagation(); 
    });

    const imageModal = document.getElementById('image-modal');
    const modalImage = document.getElementById('modal-image-content');

    // Listener 1: Handles clicks on the background overlay
    imageModal.addEventListener('click', (event) => {
        // Only close if the click is on the background itself, not its children
        if (event.target === imageModal) {
            
            // Cleanup: Stop the slideshow if it's running
            if (modalSlideshowInterval) {
                clearInterval(modalSlideshowInterval);
                modalSlideshowInterval = null;
            }

            // Hide the modal
            imageModal.style.display = 'none';

            // --- CRITICAL FIX #1 ---
            // Stop the event here so it doesn't travel further and close the folder.
            event.stopPropagation(); 
        }
    });

    // Listener 2: Handles clicks on the image inside the modal
    modalImage.addEventListener('click', (event) => {
        // --- CRITICAL FIX #2 ---
        // This listener's ONLY job is to stop the click from bubbling up
        // to the background listener. This makes the image "unclickable"
        // in the sense that it won't close the modal.
        event.stopPropagation();
    });

    // Check for #resume hash on page load
    if (window.location.hash === '#resume') {
        // If the cabinet is closed, open it first.
        if (!cabinet.classList.contains('is-open')) {
            toggleCabinet();
        }
        // Wait for the cabinet to open before showing the modal.
        setTimeout(openPdfModal, 800);
    }
});
let i = 1;
setInterval(() => {
  document.getElementById('slideshow').src = `https://pub-ad0cab8325564e91b51bba350c9b9425.r2.dev/resume/amine.ink/assets/imgs/(${i = (i % 83) + 2}).jpg`;
}, 500);
