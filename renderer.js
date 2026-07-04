// ============================================================================
// AUDIO PLAYER ELECTRON - RENDERER PROCESS
// ============================================================================
// This file handles all UI logic, audio playback, playlist management,
// metadata extraction, favorites system, equalizer, and user interactions.
// It runs in the renderer process (the browser window) and communicates
// with the main process via IPC (Inter-Process Communication).
// ============================================================================

// Import Electron IPC module for communication with main process
const { ipcRenderer } = require('electron');
// Import Node.js path module for file path operations
const path = require('path');

// ============================================================================
// GLOBAL VARIABLES - AUDIO CONTEXT AND ELEMENTS
// ============================================================================

// Web Audio API components for audio visualization and processing
let audioContext;      // Web Audio API context - main audio processing environment
let audioElement1;     // First HTML5 Audio element - plays current track
let audioElement2;     // Second HTML5 Audio element - preloads next track for crossfade
let analyser;          // Audio analyser node - provides frequency data for visualization
let source1;           // Media element source - connects audioElement1 to Web Audio API
let source2;           // Media element source - connects audioElement2 to Web Audio API
let gainNode1;         // Gain node - controls volume of first track (for crossfade)
let gainNode2;         // Gain node - controls volume of second track (for crossfade)

// ============================================================================
// GLOBAL VARIABLES - PLAYLIST AND COLLECTIONS
// ============================================================================

let collections = [];   // Array of collection objects - each has 'name' and 'playlist' array
let currentCollectionIndex = -1;  // Index of currently selected collection in collections array
let playlist = [];      // Current playlist - array of track objects from selected collection
let currentTrackIndex = -1;  // Index of currently playing track in playlist array

// ============================================================================
// GLOBAL VARIABLES - PLAYBACK STATE
// ============================================================================

let isPlaying = false;  // Boolean - true if audio is currently playing
let isShuffle = false;  // Boolean - true if shuffle mode is enabled (random track order)
let isRepeat = false;  // Boolean - true if repeat mode is enabled (loop current track)
let currentLanguage = 'es';  // String - current UI language code (es, en, pt, fr, de, it, ru, zh, ja)

// ============================================================================
// GLOBAL VARIABLES - AUDIO RECORDING
// ============================================================================
// CRITICAL: DO NOT MODIFY THESE VARIABLES OR RECORDING LOGIC
// These parameters are essential for the recording feature to work correctly.
// Any changes may break the recording functionality, duration calculation,
// or microphone volume control. The recording system has been carefully
// configured and tested. Modifications are strictly prohibited.

let isRecording = false;  // Boolean - true if audio recording is in progress
let mediaRecorder = null;  // MediaRecorder instance for audio recording
let recordedChunks = [];  // Array to store recorded audio chunks
let audioStream = null;  // Audio stream from microphone or other input device
let microphoneSource = null;  // Audio source node for microphone
let microphoneAnalyser = null;  // Analyser node for microphone visualization
let microphoneGain = null;  // Gain node for microphone volume control
let recordingStartTime = null;  // Timestamp when recording started
let recordingEndTime = null;  // Timestamp when recording stopped

// ============================================================================
// GLOBAL VARIABLES - CROSSFADE SYSTEM
// ============================================================================

let crossfadeDuration = 3;   // Number - crossfade duration in seconds (default 3 seconds)
let isCrossfading = false;   // Boolean - true if crossfade between tracks is in progress

// ============================================================================
// DOM ELEMENT REFERENCES
// ============================================================================
// These variables hold references to HTML DOM elements.
// They are initialized in initDOMElements() when the DOM is ready.
// Using cached references improves performance vs. querying DOM repeatedly.

// Player UI elements - display track information and cover art
let coverArt, trackTitle, trackArtist, trackAlbum, seekSlider, currentTimeEl, totalTimeEl;

// Control buttons - playback controls
let playBtn, pauseBtn, stopBtn, previousBtn, nextBtn, shuffleBtn, repeatBtn, recordBtn;

// Volume and playlist UI elements
let volumeSlider, micVolumeSlider, micVolumeContainer, collectionsEl, playlistEl;
let playlistHeader, collectionsHeader;

// Visualizer canvas for spectrum display
let visualizerCanvas, canvasCtx;

// Action buttons - file operations and metadata
let addFilesBtn, addFolderBtn, editMetadataBtn;

// Language selector dropdown
let languageSelector;

// Context menus - right-click menus for tracks and collections
let contextMenu, collectionContextMenu;

// Conversion modal elements - for audio conversion feature
let conversionModal, progressModal, currentFileName, currentFormat, targetFormat, quality, outputPath, progressFill, progressText;

// Help modal elements
let helpModal, closeHelpModal, helpBtn, helpBtnTop;

// Search elements
let searchInput, searchInfo;

// Favorites list element
let favoritesList;

// Favorite icon element (heart icon below album info)
let favoriteIcon;

// ============================================================================
// FAVORITES SYSTEM
// ============================================================================
// The favorites system allows users to mark tracks as favorites across all collections.
// Favorites are stored by file path (unique identifier) in a Set data structure.
// This enables cross-collection favoriting - same file in different collections shares favorite status.

let favorites = new Set();  // Set of file paths - stores paths of favorited tracks (unique, no duplicates)
let isPlayingFavorites = false;   // Boolean - true when playing only favorites (favorites-only mode)
let favoritesQueue = [];          // Array - playback queue for favorites mode (contains track objects)
let favoritesQueueIndex = -1;     // Number - current position index within favoritesQueue

// ============================================================================
// EQUALIZER SYSTEM
// ============================================================================
// The equalizer uses Web Audio API BiquadFilterNode to adjust frequency bands.
// Five frequency bands are used: 60Hz (bass), 250Hz (low-mids), 1kHz (mids), 4kHz (high-mids), 12kHz (treble).
// Presets provide quick EQ configurations for different music genres.

// Frequency bands for 5-band equalizer (in Hz)
const EQ_FREQUENCIES = [60, 250, 1000, 4000, 12000];

// EQ presets - gain values in dB for each frequency band
// Order: [60Hz, 250Hz, 1kHz, 4kHz, 12kHz]
const EQ_PRESETS = {
    flat:     [0,  0,  0,  0,  0],   // Flat - no EQ adjustment (default)
    pop:      [2,  3,  0,  3,  2],   // Pop - boosted bass and treble for punchy sound
    rock:     [5,  2, -1,  3,  5],   // Rock - strong bass and treble, slight mid cut
    balada:   [4,  3,  2,  1,  0],   // Ballad - warm bass, smooth mids, gentle treble
    acustico: [0,  2,  4,  3,  2]    // Acoustic - enhanced mids for natural sound
};

let eqBands = [];   // Array of BiquadFilterNode objects - one for each frequency band
let currentEQPreset = 'flat';  // String - currently selected EQ preset name

// ============================================================================
// DOM INITIALIZATION
// ============================================================================

// Initialize all DOM element references
// This function queries the DOM for all needed elements and stores references in global variables.
// Called once when the DOM is fully loaded to avoid repeated DOM queries (performance optimization).
function initDOMElements() {
    // Player UI elements - display track information and cover art
    coverArt = document.getElementById('coverArt');
    trackTitle = document.getElementById('trackTitle');
    trackArtist = document.getElementById('trackArtist');
    trackAlbum = document.getElementById('trackAlbum');
    seekSlider = document.getElementById('seekSlider');
    currentTimeEl = document.getElementById('currentTime');
    totalTimeEl = document.getElementById('totalTime');

    // Control buttons - playback controls
    playBtn = document.getElementById('playBtn');
    pauseBtn = document.getElementById('pauseBtn');
    stopBtn = document.getElementById('stopBtn');
    previousBtn = document.getElementById('previousBtn');
    nextBtn = document.getElementById('nextBtn');
    shuffleBtn = document.getElementById('shuffleBtn');
    repeatBtn = document.getElementById('repeatBtn');
    recordBtn = document.getElementById('recordBtn');

    // Volume and playlist UI elements
    volumeSlider = document.getElementById('volumeSlider');
    micVolumeSlider = document.getElementById('micVolumeSlider');
    micVolumeContainer = document.getElementById('micVolumeContainer');
    collectionsEl = document.getElementById('collections');
    playlistEl = document.getElementById('playlist');
    collectionsHeader = document.getElementById('collectionsHeader');
    playlistHeader = document.getElementById('playlistHeader');

    // Visualizer canvas for spectrum display
    visualizerCanvas = document.getElementById('visualizerCanvas');
    if (visualizerCanvas) canvasCtx = visualizerCanvas.getContext('2d');  // Get 2D rendering context

    // Action buttons - file operations and metadata editing
    addFilesBtn = document.getElementById('addFilesBtn');
    addFolderBtn = document.getElementById('addFolderBtn');
    editMetadataBtn = document.getElementById('editMetadataBtn');

    // Collapse button for collections
    const collapseCollectionsBtn = document.getElementById('collapseCollectionsBtn');

    // Ensure addFilesBtn is always enabled
    if (addFilesBtn) {
        addFilesBtn.disabled = false;
        addFilesBtn.style.opacity = '1';
    }
    if (addFolderBtn) {
        addFolderBtn.disabled = false;
        addFolderBtn.style.opacity = '1';
    }

    // Add collapse button listener
    if (collapseCollectionsBtn) {
        collapseCollectionsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleCollectionsCollapse();
        });
    }

    // Add click listener to collections header to toggle collapse
    if (collectionsHeader) {
        collectionsHeader.addEventListener('click', toggleCollectionsCollapse);
    }

    // Add click listener to playlist header to toggle collapse
    if (playlistHeader) {
        playlistHeader.addEventListener('click', togglePlaylistCollapse);
    }

    // Language selector dropdown for UI translation
    languageSelector = document.getElementById('languageSelector');

    // Context menus - right-click menus for tracks and collections
    contextMenu = document.getElementById('contextMenu');
    collectionContextMenu = document.getElementById('collectionContextMenu');

    // Conversion modal elements - for audio conversion feature
    conversionModal = document.getElementById('conversionModal');
    progressModal = document.getElementById('progressModal');
    currentFileName = document.getElementById('currentFileName');
    currentFormat = document.getElementById('currentFormat');
    targetFormat = document.getElementById('targetFormat');
    quality = document.getElementById('quality');
    outputPath = document.getElementById('outputPath');
    progressFill = document.getElementById('progressFill');
    progressText = document.getElementById('progressText');

    // Help modal elements - displays keyboard shortcuts and language selector
    helpModal = document.getElementById('helpModal');
    closeHelpModal = document.getElementById('closeHelpModal');
    helpBtnTop = document.getElementById('helpBtnTop');

    // Search bar elements - for filtering tracks
    searchInput = document.getElementById('searchInput');
    searchInfo = document.getElementById('searchInfo');

    // Favorites list element - displays favorited tracks
    favoritesList = document.getElementById('favoritesList');

    // Favorite icon element - heart icon below album info
    favoriteIcon = document.getElementById('favoriteIcon');

    // Log missing elements for debugging
    // This helps identify if expected DOM elements are missing from HTML
    const missing = [];
    if (!playBtn) missing.push('playBtn');
    if (!pauseBtn) missing.push('pauseBtn');
    if (!stopBtn) missing.push('stopBtn');
    if (!previousBtn) missing.push('previousBtn');
    if (!nextBtn) missing.push('nextBtn');
    if (!addFilesBtn) missing.push('addFilesBtn');
    if (!addFolderBtn) missing.push('addFolderBtn');
    if (!editMetadataBtn) missing.push('editMetadataBtn');
    if (missing.length > 0) console.error('Missing DOM elements:', missing);
}

// ============================================================================
// EVENT LISTENERS INITIALIZATION
// ============================================================================

// Initialize all event listeners for UI interactions
// This function is called after all other functions are defined to avoid reference errors.
// It sets up click handlers, keyboard shortcuts, and other user interactions.
function initEventListeners() {
    console.log('initEventListeners called');
    console.log('playBtn:', playBtn);
    console.log('pauseBtn:', pauseBtn);
    console.log('stopBtn:', stopBtn);

    // Playback control buttons - wrapped in try-catch for error handling
    try {
        playBtn.addEventListener('click', play);  // Play button starts playback
        console.log('playBtn listener added');
    } catch (e) {
        console.error('Error adding playBtn listener:', e);
    }
    try {
        pauseBtn.addEventListener('click', pause);  // Pause button pauses playback
        console.log('pauseBtn listener added');
    } catch (e) {
        console.error('Error adding pauseBtn listener:', e);
    }
    try {
        stopBtn.addEventListener('click', stopPlayback);  // Stop button stops playback and resets
        console.log('stopBtn listener added');
    } catch (e) {
        console.error('Error adding stopBtn listener:', e);
    }
    try {
        previousBtn.addEventListener('click', playPrevious);  // Previous button plays previous track
        console.log('previousBtn listener added');
    } catch (e) {
        console.error('Error adding previousBtn listener:', e);
    }
    try {
        nextBtn.addEventListener('click', playNext);  // Next button plays next track
        console.log('nextBtn listener added');
    } catch (e) {
        console.error('Error adding nextBtn listener:', e);
    }

    // Seek slider - allows user to seek to specific position in track
    seekSlider.addEventListener('input', () => {
        audioElement1.currentTime = seekSlider.value;  // Set current time to slider value
    });

    // Seek slider - scroll wheel to seek
    seekSlider.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;  // Scroll down = seek back, scroll up = seek forward
        const newValue = Math.max(0, Math.min(seekSlider.max, parseFloat(seekSlider.value) + delta));
        seekSlider.value = newValue;
        audioElement1.currentTime = newValue;
    });

    // Volume slider - adjusts playback volume (0-100 range)
    volumeSlider.addEventListener('input', () => {
        const volume = volumeSlider.value / 100;  // Convert 0-100 to 0.0-1.0
        gainNode1.gain.value = volume;  // Set volume for current track
        gainNode2.gain.value = isCrossfading ? volume : 0;  // Set volume for crossfade track
        if (volume > 0 && isMuted) {
            isMuted = false;
            document.getElementById('volumeIconPath').setAttribute('d',
                'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'
            );
            document.getElementById('volumeIcon').style.color = '';
        }
    });

    // Volume slider - scroll wheel to adjust volume
    volumeSlider.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -5 : 5;  // Scroll down = volume down, scroll up = volume up
        const newValue = Math.max(0, Math.min(100, parseInt(volumeSlider.value) + delta));
        volumeSlider.value = newValue;
        const volume = newValue / 100;
        gainNode1.gain.value = volume;
        gainNode2.gain.value = isCrossfading ? volume : 0;
        if (volume > 0 && isMuted) {
            isMuted = false;
            document.getElementById('volumeIconPath').setAttribute('d',
                'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'
            );
            document.getElementById('volumeIcon').style.color = '';
        }
    });

    // Microphone volume slider - adjusts microphone input level during recording
    // CRITICAL: DO NOT MODIFY THIS VOLUME CONTROL LOGIC
    // The microphone volume slider controls the gain node in the recording chain.
    // Both input event (drag) and wheel event (scroll) are implemented for usability.
    // Any changes may break microphone volume control during recording.
    if (micVolumeSlider) {
        micVolumeSlider.addEventListener('input', () => {
            if (microphoneGain) {
                const volume = micVolumeSlider.value / 100;
                microphoneGain.gain.value = volume;
            }
        });

        // Scroll wheel to adjust microphone volume
        micVolumeSlider.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -5 : 5;  // Scroll down = volume down, scroll up = volume up
            const newValue = Math.max(0, Math.min(100, parseInt(micVolumeSlider.value) + delta));
            micVolumeSlider.value = newValue;
            if (microphoneGain) {
                const volume = newValue / 100;
                microphoneGain.gain.value = volume;
            }
        });
    }

    // Volume icon mute/unmute toggle
    document.getElementById('volumeIcon').addEventListener('click', () => {
        if (isMuted) {
            isMuted = false;
            volumeSlider.value = lastVolume;
            const vol = lastVolume / 100;
            gainNode1.gain.value = vol;
            gainNode2.gain.value = isCrossfading ? vol : 0;
            document.getElementById('volumeIconPath').setAttribute('d',
                'M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z'
            );
            document.getElementById('volumeIcon').style.color = '';
        } else {
            isMuted = true;
            lastVolume = parseInt(volumeSlider.value) || 100;
            gainNode1.gain.value = 0;
            gainNode2.gain.value = 0;
            volumeSlider.value = 0;
            document.getElementById('volumeIconPath').setAttribute('d',
                'M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'
            );
            document.getElementById('volumeIcon').style.color = '#888';
        }
    });

    // Click cover art to change it directly
    coverArt.addEventListener('click', async () => {
        if (currentTrackIndex < 0) return;
        const imgPath = await ipcRenderer.invoke('select-image');
        if (!imgPath) return;
        const track = playlist[currentTrackIndex];
        track.coverPath = imgPath;
        track.coverData = null;
        coverArt.innerHTML = `<img src="file://${imgPath}" alt="cover">`;
    });

    // Action buttons
    addFilesBtn.addEventListener('click', addFiles);
    addFolderBtn.addEventListener('click', addFolder);

    // Edit metadata button
    editMetadataBtn.addEventListener('click', () => {
        if (currentTrackIndex < 0) {
            alert('Selecciona una pista primero');
            return;
        }
        showMetadataModal(currentTrackIndex);
    });

    // Language selector
    languageSelector.addEventListener('change', (e) => {
        currentLanguage = e.target.value;
        updateLanguage();
    });

    // Favorite icon click
    if (favoriteIcon) {
        favoriteIcon.addEventListener('click', () => {
            if (currentTrackIndex >= 0) {
                toggleFavorite(currentTrackIndex);  // Use the toggleFavorite function for consistency
            }
        });
    }

    // Help button in top bar
    helpBtnTop.addEventListener('click', () => {
        helpModal.style.display = 'flex';
    });

    // Close help modal
    closeHelpModal.addEventListener('click', () => {
        helpModal.style.display = 'none';
    });

    // Debug: capture all clicks to see what's being clicked
    document.addEventListener('click', (e) => {
        console.log('Click on:', e.target, e.target.id, e.target.className);
    });

    // Debug: capture clicks on controls container
    const controlsContainer = document.querySelector('.controls');
    if (controlsContainer) {
        controlsContainer.addEventListener('click', (e) => {
            console.log('Click on controls container:', e.target, e.target.id, e.target.className);
        });
    }

    // Close help modal when clicking outside
    helpModal.addEventListener('click', (e) => {
        if (e.target === helpModal) {
            helpModal.style.display = 'none';
        }
    });

    // Play favorites button
    const playFavoritesBtn = document.getElementById('playFavoritesBtn');
    if (playFavoritesBtn) {
        playFavoritesBtn.addEventListener('click', () => {
            playFavoritesOnly();
        });
    }

    // Shuffle and repeat buttons
    shuffleBtn.addEventListener('click', () => {
        isShuffle = !isShuffle;
        shuffleBtn.classList.toggle('active', isShuffle);
    });

    repeatBtn.addEventListener('click', () => {
        isRepeat = !isRepeat;
        repeatBtn.classList.toggle('active', isRepeat);
    });

    // Record button - starts/stops audio recording
    if (recordBtn) {
        recordBtn.addEventListener('click', () => {
            if (isPlaying) {
                document.getElementById('recordingAlertModal').style.display = 'flex';
                return;
            }
            toggleRecording();
        });
    }

    // Recording alert modal close button
    const closeRecordingAlert = document.getElementById('closeRecordingAlert');
    if (closeRecordingAlert) {
        closeRecordingAlert.addEventListener('click', () => {
            document.getElementById('recordingAlertModal').style.display = 'none';
        });
    }

    // Context menu handlers
    document.getElementById('contextPlay').addEventListener('click', () => {
        if (contextMenuIndex >= 0) {
            playTrack(contextMenuIndex);
        }
        hideContextMenu();
    });

    document.getElementById('contextEdit').addEventListener('click', () => {
        if (contextMenuIndex >= 0) showMetadataModal(contextMenuIndex);
        hideContextMenu();
    });

    document.getElementById('contextConvert').addEventListener('click', () => {
        if (contextMenuIndex >= 0) {
            showConversionModal(contextMenuIndex);
        }
        hideContextMenu();
    });

    document.getElementById('contextRemove').addEventListener('click', () => {
        if (contextMenuIndex >= 0) {
            collections[currentCollectionIndex].playlist.splice(contextMenuIndex, 1);
            playlist = collections[currentCollectionIndex].playlist;

            if (currentTrackIndex === contextMenuIndex) {
                stopPlayback();
                currentTrackIndex = -1;
            } else if (currentTrackIndex > contextMenuIndex) {
                currentTrackIndex--;
            }
            renderPlaylist();
            renderCollections();
        }
        hideContextMenu();
    });

    // Collection context menu handler
    document.getElementById('collectionContextDelete').addEventListener('click', () => {
        if (collectionContextMenuIndex >= 0) {
            const collectionName = collections[collectionContextMenuIndex].name;
            if (confirm(`¿Estás seguro de que quieres eliminar la colección "${collectionName}"?`)) {
                collections.splice(collectionContextMenuIndex, 1);

                if (collectionContextMenuIndex === currentCollectionIndex) {
                    currentCollectionIndex = -1;
                    playlist = [];
                    currentTrackIndex = -1;
                    stopPlayback();
                    trackTitle.textContent = 'Título: -';
                    trackArtist.textContent = 'Artista: -';
                    trackAlbum.textContent = 'Álbum: -';
                    coverArt.innerHTML = '<div class="no-cover">Sin Carátula</div>';
                } else if (collectionContextMenuIndex < currentCollectionIndex) {
                    currentCollectionIndex--;
                }

                renderCollections();
                renderPlaylist();
            }
        }
        hideCollectionContextMenu();
    });

    // Hide context menus when clicking outside
    document.addEventListener('click', (e) => {
        if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
            hideContextMenu();
        }
        if (collectionContextMenu.style.display === 'block' && !collectionContextMenu.contains(e.target)) {
            hideCollectionContextMenu();
        }
    });

    // Conversion modal handlers
    document.getElementById('closeConversionModal').addEventListener('click', hideConversionModal);
    document.getElementById('cancelConversion').addEventListener('click', hideConversionModal);
    document.getElementById('browseOutputPath').addEventListener('click', async () => {
        const savePath = await ipcRenderer.invoke('select-save-path');
        if (savePath) {
            const format = targetFormat.value;
            const expectedExt = `.${format}`;
            // Ensure the selected path has the correct extension
            if (!savePath.toLowerCase().endsWith(expectedExt)) {
                outputPath.value = savePath.replace(/\.([^.]+)?$/, '') + expectedExt;
            } else {
                outputPath.value = savePath;
            }
        }
    });

    // Update output path extension when format changes
    targetFormat.addEventListener('change', () => {
        const currentPath = outputPath.value;
        if (currentPath) {
            const newPath = currentPath.replace(/\.[^/.]+$/, `.${targetFormat.value}`);
            outputPath.value = newPath;
        }
    });

    // Start audio conversion
    document.getElementById('startConversion').addEventListener('click', async () => {
        if (contextMenuIndex < 0) return;

        const track = playlist[contextMenuIndex];
        const format = targetFormat.value;
        const qual = quality.value;
        let output = outputPath.value.trim();

        if (!output) {
            alert('Por favor selecciona una ruta de salida');
            return;
        }

        // Ensure the output path has the correct extension
        const expectedExt = `.${format}`;
        if (!output.toLowerCase().endsWith(expectedExt)) {
            // Remove any trailing dot or wrong extension, then add correct one
            output = output.replace(/\.([^.]+)?$/, '') + expectedExt;
        }

        hideConversionModal();
        showProgressModal();

        try {
            await convertAudio(track.path, output, format, qual);
            hideProgressModal();
            alert('Conversión completada exitosamente');
        } catch (error) {
            hideProgressModal();
            alert(`Error en la conversión: ${error.message}`);
        }
    });

    // Search input - live search
    searchInput.addEventListener('input', (e) => {
        performSearch(e.target.value);
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Don't intercept space when typing in search input
        if (document.activeElement === searchInput) {
            return;
        }

        if (e.code === 'Space') {
            e.preventDefault();
            if (isPlaying) {
                pause();
            } else {
                play();
            }
        } else if (e.code === 'ArrowRight') {
            playNext();
        } else if (e.code === 'ArrowLeft') {
            playPrevious();
        } else if (e.shiftKey && e.code === 'KeyA') {
            e.preventDefault();
            addFilesBtn.click();
        } else if (e.shiftKey && e.code === 'KeyC') {
            e.preventDefault();
            addFolderBtn.click();
        } else if (e.shiftKey && e.code === 'KeyE') {
            e.preventDefault();
            if (currentTrackIndex >= 0) showMetadataModal(currentTrackIndex);
        } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyI') {
            e.preventDefault();
            // Toggle DevTools via IPC (Ctrl+Shift+I or Cmd+Shift+I)
            const { ipcRenderer } = require('electron');
            ipcRenderer.send('toggle-devtools');
        }
    });

    // Custom window controls (frameless window)
    document.getElementById('winClose').addEventListener('click', () => {
        document.getElementById('confirmExitModal').style.display = 'flex';
    });
    document.getElementById('cancelExitBtn').addEventListener('click', () => {
        document.getElementById('confirmExitModal').style.display = 'none';
    });
    document.getElementById('confirmExitBtn').addEventListener('click', async () => {
        await saveState();
        ipcRenderer.send('window-close');
    });
    document.getElementById('winMinimize').addEventListener('click', () => ipcRenderer.send('window-minimize'));
    document.getElementById('winMaximize').addEventListener('click', () => ipcRenderer.send('window-maximize'));

    ipcRenderer.on('menu-open-help', () => {
        helpModal.style.display = 'flex';
    });

    ipcRenderer.on('menu-add-files', () => {
        addFilesBtn.click();
    });

    ipcRenderer.on('menu-add-folder', () => {
        addFolderBtn.click();
    });

    ipcRenderer.on('menu-play-pause', () => {
        if (isPlaying) pause(); else play();
    });

    ipcRenderer.on('menu-previous', () => { playPrevious(); });
    ipcRenderer.on('menu-next', () => { playNext(); });

    // Handle file passed via command line (double-click on file)
    ipcRenderer.on('play-file', (event, filePath) => {
        console.log('Received file to play:', filePath);
        playFileFromPath(filePath);
    });

    // Maximize / restore - adjust border-radius
    ipcRenderer.on('window-maximized', () => {
        document.body.classList.add('maximized');
        document.documentElement.classList.add('maximized');
        document.getElementById('winMaximize').title = 'Restaurar';
    });
    ipcRenderer.on('window-unmaximized', () => {
        document.body.classList.remove('maximized');
        document.documentElement.classList.remove('maximized');
        document.getElementById('winMaximize').title = 'Maximizar';
    });

    // Metadata modal listeners
    const closeMetadataModal = document.getElementById('closeMetadataModal');
    if (closeMetadataModal) closeMetadataModal.addEventListener('click', hideMetadataModal);
    const cancelMetadata = document.getElementById('cancelMetadata');
    if (cancelMetadata) cancelMetadata.addEventListener('click', hideMetadataModal);
    const metadataPickCover = document.getElementById('metadataPickCover');
    if (metadataPickCover) {
        metadataPickCover.addEventListener('click', async () => {
            const imgPath = await ipcRenderer.invoke('select-image');
            if (!imgPath) return;
            metadataCoverPath = imgPath;
            metadataCoverRemoved = false;
            const preview = document.getElementById('metadataCoverPreview');
            preview.innerHTML = `<img src="file://${imgPath}" alt="cover">`;
        });
    }
    const metadataRemoveCover = document.getElementById('metadataRemoveCover');
    if (metadataRemoveCover) {
        metadataRemoveCover.addEventListener('click', () => {
            metadataCoverPath = null;
            metadataCoverRemoved = true;
            const preview = document.getElementById('metadataCoverPreview');
            preview.textContent = 'Sin carátula';
        });
    }
    const metadataRemoveCoverAll = document.getElementById('metadataRemoveCoverAll');
    if (metadataRemoveCoverAll) {
        metadataRemoveCoverAll.addEventListener('click', () => {
            if (currentCollectionIndex >= 0) {
                collections[currentCollectionIndex].playlist.forEach(t => {
                    t.coverPath = null;
                    t.coverData = null;
                });
                renderPlaylist();  // Update playlist UI
                const preview = document.getElementById('metadataCoverPreview');
                preview.textContent = 'Sin carátula';
                metadataCoverPath = null;
            }
        });
    }
    const saveMetadata = document.getElementById('saveMetadata');
    if (saveMetadata) {
        saveMetadata.addEventListener('click', () => {
            if (metadataEditIndex < 0) return;

            const title  = document.getElementById('metadataTitle').value.trim();
            const artist = document.getElementById('metadataArtist').value.trim();
            const album  = document.getElementById('metadataAlbum').value.trim();
            const applyToAll = document.getElementById('metadataApplyToCollection').checked;

            const track = playlist[metadataEditIndex];
            if (title)  track.title  = title;
            if (artist) track.artist = artist;
            if (album)  track.album  = album;

            if (metadataCoverPath) {
                track.coverPath = metadataCoverPath;
                track.coverData = null;
            } else if (metadataCoverRemoved) {
                track.coverPath = null;
                track.coverData = null;
            }

            if (applyToAll && metadataCoverPath && currentCollectionIndex >= 0) {
                collections[currentCollectionIndex].playlist.forEach(t => {
                    t.coverPath = metadataCoverPath;
                    t.coverData = null;
                });
                renderPlaylist();  // Update playlist UI to show new cover art
            }

            // Update player display if editing current track
            if (metadataEditIndex === currentTrackIndex) {
                trackTitle.textContent  = `Título: ${track.title || '-'}`;
                trackArtist.textContent = `Artista: ${track.artist || '-'}`;
                trackAlbum.textContent  = `Álbum: ${track.album || '-'}`;
                if (track.coverPath) {
                    coverArt.innerHTML = `<img src="file://${track.coverPath}" alt="cover">`;
                } else if (!track.coverData) {
                    coverArt.innerHTML = '<div class="no-cover">Sin Carátula</div>';
                }
            }

            renderPlaylist();
            hideMetadataModal();
        });
    }

    // Equalizer modal listeners
    const closeEqModal = document.getElementById('closeEqModal');
    if (closeEqModal) {
        closeEqModal.addEventListener('click', () => {
            document.getElementById('eqModal').style.display = 'none';
        });
    }
    const eqBtn = document.getElementById('eqBtn');
    if (eqBtn) {
        eqBtn.addEventListener('click', () => {
            const modal = document.getElementById('eqModal');
            modal.style.display = modal.style.display === 'flex' ? 'none' : 'flex';
        });
    }
    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => applyEQPreset(btn.dataset.preset));
    });
    EQ_FREQUENCIES.forEach((_, i) => {
        const slider = document.getElementById(`eq-band-${i}`);
        const valEl  = document.getElementById(`eq-val-${i}`);
        if (!slider) return;
        slider.addEventListener('input', () => {
            const val = parseFloat(slider.value);
            if (eqBands[i]) eqBands[i].gain.value = val;
            if (valEl) valEl.textContent = (val > 0 ? '+' : '') + val;
            // Mark as manual (no preset active)
            document.querySelectorAll('.eq-preset-btn').forEach(b => b.classList.remove('active'));
            currentEQPreset = 'manual';
        });
    });
}

// ============================================================================
// AUDIO INITIALIZATION
// ============================================================================

// Initialize audio system
// Sets up Web Audio API context, two audio elements for crossfade, gain nodes, analyser, and event listeners
function initAudio() {
    audioElement1 = new Audio();
    audioElement2 = new Audio();
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();

    // Create media element sources for both audio elements
    source1 = audioContext.createMediaElementSource(audioElement1);
    source2 = audioContext.createMediaElementSource(audioElement2);

    // Create gain nodes for volume control (crossfade)
    gainNode1 = audioContext.createGain();
    gainNode2 = audioContext.createGain();

    // Connect first audio element chain
    source1.connect(gainNode1);
    gainNode1.connect(analyser);

    // Connect second audio element chain
    source2.connect(gainNode2);
    gainNode2.connect(analyser);

    // Create 5-band EQ filter chain and connect after analyser
    eqBands = EQ_FREQUENCIES.map(freq => {
        const filter = audioContext.createBiquadFilter();
        filter.type = 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.4;
        filter.gain.value = 0;
        return filter;
    });
    // Chain: analyser → eq[0] → eq[1] → ... → eq[4] → destination
    analyser.connect(eqBands[0]);
    for (let i = 0; i < eqBands.length - 1; i++) eqBands[i].connect(eqBands[i + 1]);
    eqBands[eqBands.length - 1].connect(audioContext.destination);
    analyser.fftSize = 256;

    // Initially mute second audio element
    gainNode2.gain.value = 0;

    // Event listeners for first audio element (current track)
    audioElement1.addEventListener('timeupdate', updateProgress);
    audioElement1.addEventListener('ended', onTrackEnded);
    audioElement1.addEventListener('loadedmetadata', () => {
        totalTimeEl.textContent = formatTime(audioElement1.duration);
        seekSlider.max = audioElement1.duration;
    });

    // Event listeners for second audio element (next track in crossfade)
    audioElement2.addEventListener('ended', onTrackEnded);
    audioElement2.addEventListener('loadedmetadata', () => {
        // Preload metadata for next track
    });

    setupVisualizer();  // Initialize spectrum visualizer
}

// ============================================================================
// SPECTRUM VISUALIZER
// ============================================================================

// Setup and run the audio spectrum visualizer
// Uses Web Audio API analyser to get frequency data and draw bars on canvas
function setupVisualizer() {
    visualizerCanvas.width = visualizerCanvas.offsetWidth;
    visualizerCanvas.height = visualizerCanvas.offsetHeight;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    function draw() {
        requestAnimationFrame(draw);  // Request next frame

        // Use microphone analyser when recording, otherwise use playback analyser
        const currentAnalyser = isRecording && microphoneAnalyser ? microphoneAnalyser : analyser;
        currentAnalyser.getByteFrequencyData(dataArray);  // Get frequency data (0-255)

        // Clear canvas with background color
        canvasCtx.fillStyle = '#1a1a1a';
        canvasCtx.fillRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);

        // Calculate bar width
        const barWidth = (visualizerCanvas.width / bufferLength) * 2.5;
        let barHeight;
        let x = 0;

        // Draw each frequency bar
        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 255 * visualizerCanvas.height;

            // Create gradient from orange to lighter orange
            const gradient = canvasCtx.createLinearGradient(0, visualizerCanvas.height - barHeight, 0, visualizerCanvas.height);
            gradient.addColorStop(0, '#ff6b35');  // Primary orange color
            gradient.addColorStop(1, '#ff8555');  // Lighter orange

            canvasCtx.fillStyle = gradient;
            canvasCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth, barHeight);

            x += barWidth + 1;  // Move to next bar position
        }
    }

    draw();  // Start animation loop
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

// Format seconds to MM:SS format
function formatTime(seconds) {
    if (isNaN(seconds) || !isFinite(seconds)) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Update progress bar and time display during playback
function updateProgress() {
    const currentTime = audioElement1.currentTime;
    seekSlider.value = currentTime;  // Update slider position
    currentTimeEl.textContent = formatTime(currentTime);  // Update time text

    // Temporarily disabled crossfade to test autoplay
    // Check if we should start crossfade (near end of track)
    // if (!isCrossfading && !isRepeat && currentTrackIndex < playlist.length - 1) {
    //     const timeRemaining = audioElement1.duration - currentTime;
    //     if (timeRemaining <= crossfadeDuration && timeRemaining > 0) {
    //         startCrossfade();
    //     }
    // }
}

// Handle track end event
// If repeat is on, replay current track. Otherwise play next or stop.
function onTrackEnded() {
    console.log('onTrackEnded called, isCrossfading:', isCrossfading, 'isPlayingFavorites:', isPlayingFavorites);

    if (isCrossfading) {
        isCrossfading = false;
    }

    if (isRepeat) {
        audioElement1.currentTime = 0;
        audioElement1.play();
    } else if (isPlayingFavorites) {
        // Navigate within favorites queue
        const next = favoritesQueueIndex + 1;
        if (next < favoritesQueue.length) {
            playFromFavoritesQueue(next);
        } else {
            isPlayingFavorites = false;
            stopPlayback();
        }
    } else if (currentTrackIndex < playlist.length - 1) {
        playNext();
    } else {
        stopPlayback();
    }
}

// ============================================================================
// CROSSFADE FUNCTIONALITY
// ============================================================================

// Start crossfade between current and next track
// Fades out current track while fading in next track
function startCrossfade() {
    if (isCrossfading || currentTrackIndex >= playlist.length - 1) return;

    isCrossfading = true;
    const nextIndex = getNextTrackIndex();
    const nextTrack = playlist[nextIndex];

    // Load next track into second audio element
    audioElement2.src = `file://${nextTrack.path}`;
    audioElement2.volume = 0;  // Start muted
    audioElement2.play();

    // Use Web Audio API for smooth crossfade
    const startTime = audioContext.currentTime;
    const fadeDuration = crossfadeDuration;

    // Fade out current track (gainNode1)
    gainNode1.gain.setValueAtTime(1, startTime);
    gainNode1.gain.linearRampToValueAtTime(0, startTime + fadeDuration);

    // Fade in next track (gainNode2)
    gainNode2.gain.setValueAtTime(0, startTime);
    gainNode2.gain.linearRampToValueAtTime(1, startTime + fadeDuration);

    // After crossfade completes, swap audio elements
    setTimeout(() => {
        // Update current track index
        currentTrackIndex = nextIndex;

        // Swap audio elements (now audioElement2 becomes the "current")
        const tempAudio = audioElement1;
        audioElement1 = audioElement2;
        audioElement2 = tempAudio;

        // Swap gain nodes
        const tempGain = gainNode1;
        gainNode1 = gainNode2;
        gainNode2 = tempGain;

        // Reset gain nodes for next crossfade
        gainNode1.gain.value = 1;
        gainNode2.gain.value = 0;

        // Reset crossfading flag
        isCrossfading = false;

        // Update UI
        updateTrackInfo(nextTrack);
        updatePlaylistHighlight();
        loadMetadata(nextTrack.path);

        // Reset audioElement2 for next use
        audioElement2.pause();
        audioElement2.currentTime = 0;
    }, fadeDuration * 1000);
}

// Get the index of the next track (considering shuffle mode)
function getNextTrackIndex() {
    if (isShuffle) {
        // Random track different from current
        let nextIndex;
        do {
            nextIndex = Math.floor(Math.random() * playlist.length);
        } while (nextIndex === currentTrackIndex && playlist.length > 1);
        return nextIndex;
    } else {
        // Next track in sequence
        return currentTrackIndex + 1;
    }
}

// ============================================================================
// PLAYBACK CONTROL FUNCTIONS
// ============================================================================

// Play a track directly from the favorites queue by queue index
function playFromFavoritesQueue(queueIndex) {
    if (queueIndex < 0 || queueIndex >= favoritesQueue.length) return;
    favoritesQueueIndex = queueIndex;
    const track = favoritesQueue[queueIndex];

    isCrossfading = false;
    audioElement1.pause();
    audioElement2.pause();
    audioElement1.currentTime = 0;
    audioElement2.currentTime = 0;
    gainNode1.gain.value = 1;
    gainNode2.gain.value = 0;

    audioElement1.src = `file://${track.path}`;
    audioElement1.play();
    isPlaying = true;
    updatePlayPauseButtons();
    updateTrackInfo(track);
    loadMetadata(track.path);
}

// ============================================================================
// PLAYBACK FUNCTIONS
// ============================================================================

// Play a specific track by index in the current playlist
// This is the main function for starting playback of a track
// Parameters:
//   - index: Integer index of the track in the playlist array
function playTrack(index) {
    console.log('playTrack() called with index:', index, 'playlist.length:', playlist.length);
    if (index < 0 || index >= playlist.length) {
        console.log('playTrack() returning: invalid index');
        return;  // Exit if index is out of bounds
    }

    // Clicking a track manually exits favorites mode
    // This ensures manual track selection takes precedence over favorites queue
    isPlayingFavorites = false;
    favoritesQueue = [];
    favoritesQueueIndex = -1;

    // Cancel any ongoing crossfade to prevent audio conflicts
    isCrossfading = false;

    currentTrackIndex = index;  // Set current track index
    const track = playlist[index];  // Get track object

    console.log('playTrack() loading track:', track.path);
    // Stop both audio elements to prevent overlapping audio
    audioElement1.pause();
    audioElement2.pause();
    audioElement1.currentTime = 0;  // Reset playback position
    audioElement2.currentTime = 0;

    // Reset gain nodes to default values
    gainNode1.gain.value = 1;  // Full volume for main track
    gainNode2.gain.value = 0;  // Muted for crossfade track

    audioElement1.src = `file://${track.path}`;  // Set audio source to file path

    // Resume AudioContext if suspended (required by modern browsers)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    audioElement1.play();                        // Start playback
    isPlaying = true;                            // Update playing state

    // If this is a recording with stored duration, use it for seek slider
    if (track.recordingDuration) {
        setTimeout(() => {
            seekSlider.max = track.recordingDuration;
            totalTimeEl.textContent = formatTime(track.recordingDuration);
        }, 100);
    }

    updatePlayPauseButtons();    // Update button visibility (show pause, hide play)
    updateTrackInfo(track);      // Display track information (title, artist, album)
    updatePlaylistHighlight();   // Highlight current track in playlist UI

    loadMetadata(track.path);    // Extract and display metadata from audio file
}

// Update track information display (title, artist, album, favorite status)
// This function updates the UI to show information about the currently playing track
// Parameters:
//   - track: Object containing track information (title, artist, album, path)
function updateTrackInfo(track) {
    const t = translations[currentLanguage];  // Get translations for current language
    // Update track title, artist, and album with fallback to 'Desconocido' (Unknown)
    trackTitle.textContent = `${t.title_label}: ${track.title || 'Desconocido'}`;
    trackArtist.textContent = `${t.artist_label}: ${track.artist || 'Desconocido'}`;
    trackAlbum.textContent = `${t.album_label}: ${track.album || 'Desconocido'}`;

    // Update favorite icon color based on favorite status
    // Orange (#ff6b35) if favorited, gray (#666) if not
    if (favoriteIcon) {
        const isFavorite = favorites.has(track.path);  // Check if track is in favorites set
        const heartIcon = isFavorite ?
            '<svg class="heart-icon" viewBox="0 0 24 24" width="20" height="20" fill="#ff6b35"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' :
            '<svg class="heart-icon" viewBox="0 0 24 24" width="20" height="20" fill="#666"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';
        favoriteIcon.innerHTML = heartIcon;  // Update the icon SVG
    }
}

// ============================================================================
// METADATA EXTRACTION
// ============================================================================

// Load metadata from audio file using IPC to main process
// This function extracts title, artist, album, and embedded cover art from audio files
// Currently simplified to use filename as title (full metadata extraction disabled)
// Parameters:
//   - filePath: String path to the audio file
async function loadMetadata(filePath) {
    try {
        // Temporarily disabled - use filename as title instead of reading metadata
        // Full metadata extraction would use music-metadata library or FFmpeg via IPC
        const fileName = path.basename(filePath);  // Get filename from full path
        const title = fileName.replace(/\.[^/.]+$/, '');  // Remove file extension

        const t = translations[currentLanguage];  // Get translations for current language
        // Update UI with filename-based metadata
        trackTitle.textContent = `${t.title_label}: ${title}`;
        trackArtist.textContent = `${t.artist_label}: Desconocido`;  // Unknown artist
        trackAlbum.textContent = `${t.album_label}: Desconocido`;  // Unknown album

        // Update playlist item with filename-based metadata
        // This ensures the playlist displays the extracted information
        if (playlist[currentTrackIndex]) {
            playlist[currentTrackIndex].title = title;
            playlist[currentTrackIndex].artist = 'Desconocido';
            playlist[currentTrackIndex].album = 'Desconocido';
            renderPlaylist();  // Re-render playlist to show updated metadata
        }
    } catch (error) {
        console.error('Error loading metadata:', error);  // Log any errors
    }
}

// Download cover art from iTunes API
// Searches iTunes for artist+album and retrieves high-res artwork
async function downloadCoverArt(artist, album) {
    if (!artist && !album) return;
    
    try {
        const searchTerm = `${artist} ${album}`;
        const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&limit=1`);
        const data = await response.json();
        
        if (data.results && data.results.length > 0) {
            let artworkUrl = data.results[0].artworkUrl100;
            artworkUrl = artworkUrl.replace('100x100', '600x600');  // Get higher resolution
            coverArt.innerHTML = `<img src="${artworkUrl}" alt="Cover">`;
        }
    } catch (error) {
        console.error('Error downloading cover:', error);
    }
}

// ============================================================================
// UI UPDATE FUNCTIONS
// ============================================================================

// Toggle play/pause button visibility based on playback state
function updatePlayPauseButtons() {
    if (isPlaying) {
        playBtn.style.display = 'none';
        pauseBtn.style.display = 'flex';
    } else {
        playBtn.style.display = 'flex';
        pauseBtn.style.display = 'none';
    }
}

// Highlight the currently playing track in the playlist
function updatePlaylistHighlight() {
    const items = playlistEl.querySelectorAll('.playlist-item');
    items.forEach((item, index) => {
        if (index === currentTrackIndex) {
            item.classList.add('active');  // Add orange background to current track
        } else {
            item.classList.remove('active');
        }
    });
}

// ============================================================================
// PLAYBACK CONTROLS
// ============================================================================

// Resume playback or play first track if none selected
function play() {
    console.log('play() called');
    if (!audioElement1) {
        console.error('audioElement1 not initialized');
        return;
    }

    // Resume AudioContext if suspended (required by modern browsers)
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    if (currentTrackIndex >= 0) {
        audioElement1.play();           // Resume current track
        isPlaying = true;
        updatePlayPauseButtons();
    } else if (playlist.length > 0) {
        playTrack(0);  // Play first track
    }
}

// Pause playback
function pause() {
    console.log('pause() called');
    if (!audioElement1) {
        console.error('audioElement1 not initialized');
        return;
    }
    audioElement1.pause();
    isPlaying = false;
    updatePlayPauseButtons();
}

// Stop playback and reset to beginning
function stopPlayback() {
    console.log('stopPlayback() called');
    if (!audioElement1 || !audioElement2) {
        console.error('audio elements not initialized');
        return;
    }
    audioElement1.pause();
    audioElement2.pause();
    audioElement1.currentTime = 0;  // Reset to start
    audioElement2.currentTime = 0;
    isPlaying = false;
    isCrossfading = false;
    updatePlayPauseButtons();
}

// Play next track (random if shuffle is on)
function playNext() {
    if (isPlayingFavorites) {
        const next = isShuffle
            ? Math.floor(Math.random() * favoritesQueue.length)
            : favoritesQueueIndex + 1 < favoritesQueue.length ? favoritesQueueIndex + 1 : 0;
        playFromFavoritesQueue(next);
        return;
    }
    if (playlist.length === 0) return;
    let nextIndex;
    if (isShuffle) {
        nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
        nextIndex = currentTrackIndex + 1;
        if (nextIndex >= playlist.length) nextIndex = 0;
    }
    playTrack(nextIndex);
}

// Play previous track
function playPrevious() {
    if (isPlayingFavorites) {
        const prev = favoritesQueueIndex - 1 >= 0 ? favoritesQueueIndex - 1 : 0;
        playFromFavoritesQueue(prev);
        return;
    }
    if (playlist.length === 0) return;

    let prevIndex = currentTrackIndex - 1;
    if (prevIndex < 0) {
        prevIndex = 0;
    }

    playTrack(prevIndex);
}

// ============================================================================
// PLAYLIST MANAGEMENT
// ============================================================================

// Render the collections list
// Each item shows: folder icon, collection name, and track count
function renderCollections() {
    if (collections.length === 0) {
        collectionsEl.innerHTML = `<div class="empty-playlist">No hay colecciones</div>`;
    } else {
        collectionsEl.innerHTML = '';
        collections.forEach((collection, index) => {
            const item = document.createElement('div');
            item.className = 'collection-item';
            if (index === currentCollectionIndex) {
                item.classList.add('active');  // Highlight selected collection
            }

            item.innerHTML = `
                <span class="collection-item-icon"><svg viewBox="0 0 24 24" width="16" height="16" fill="#ff6b35"><path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg></span>
                <span class="collection-item-name">${collection.name}</span>
                <span class="collection-item-count">${collection.playlist.length} pistas</span>
            `;

            item.addEventListener('click', () => selectCollection(index));  // Click to select
            item.addEventListener('contextmenu', (e) => showCollectionContextMenu(e, index));  // Right-click menu
            collectionsEl.appendChild(item);
        });
    }

    // Both buttons should always be enabled now (addFiles creates collection automatically if needed)
    if (addFilesBtn) addFilesBtn.disabled = false;
    if (addFilesBtn) addFilesBtn.style.opacity = '1';
    if (addFolderBtn) addFolderBtn.disabled = false;
    if (addFolderBtn) addFolderBtn.style.opacity = '1';
}

// Select a collection and load its playlist
function selectCollection(index) {
    currentCollectionIndex = index;
    playlist = collections[index].playlist;

    if (!isPlayingFavorites) {
        currentTrackIndex = -1;  // Reset track index when switching collections
        // Clear player info only when not playing favorites
        trackTitle.textContent = 'Título: -';
        trackArtist.textContent = 'Artista: -';
        trackAlbum.textContent = 'Álbum: -';
        coverArt.innerHTML = '<div class="no-cover">Sin Carátula</div>';
    }

    renderCollections();  // Update collection highlight
    renderPlaylist();    // Load collection's playlist
}

// Render the playlist with all tracks
// Each item shows: favorite heart icon, track title, and duration
function renderPlaylist() {
    if (playlist.length === 0) {
        playlistEl.innerHTML = `<div class="empty-playlist">${currentCollectionIndex >= 0 ? 'No hay pistas en esta colección' : 'Selecciona una colección'}</div>`;
        updateCounters();
        return;
    }

    playlistEl.innerHTML = '';
    playlist.forEach((track, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item';
        if (index === currentTrackIndex) {
            item.classList.add('active');  // Highlight current track
        }

        // Determine heart icon color based on favorite status
        const isFavorite = favorites.has(track.path);
        const heartIcon = isFavorite ?
            '<svg class="heart-icon" viewBox="0 0 24 24" width="16" height="16" fill="#ff6b35"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' :
            '<svg class="heart-icon" viewBox="0 0 24 24" width="16" height="16" fill="#666"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

        item.innerHTML = `
            <span class="playlist-item-number">${index + 1}</span>
            <span class="playlist-item-favorite" data-index="${index}">${heartIcon}</span>
            <span class="playlist-item-title">${track.title || track.fileName}</span>
            <span class="playlist-item-duration">${track.duration || ''}</span>
        `;

        // Handle click: toggle favorite if heart clicked, play track otherwise
        item.addEventListener('click', (e) => {
            console.log('Playlist item clicked, index:', index, 'target:', e.target);
            const favoriteSpan = e.target.closest('.playlist-item-favorite');
            if (favoriteSpan) {
                console.log('Heart icon clicked, toggling favorite');
                toggleFavorite(index);
            } else {
                console.log('Track clicked, calling playTrack');
                playTrack(index);
            }
        });
        item.addEventListener('contextmenu', (e) => showContextMenu(e, index));  // Right-click menu
        playlistEl.appendChild(item);
    });
    updateCounters();
}

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

// Perform live search across all collections and tracks
// Searches by: track name, artist, album, collection name, and duration
function performSearch(query) {
    if (!query || query.trim() === '') {
        // Clear search - restore original view
        if (currentCollectionIndex >= 0) {
            playlist = collections[currentCollectionIndex].playlist;
        } else {
            playlist = [];
        }
        renderPlaylist();
        searchInfo.textContent = '';
        return;
    }

    const lowerQuery = query.toLowerCase().trim();
    const results = [];

    // Search across all collections
    collections.forEach((collection, collectionIndex) => {
        // Check if collection name matches
        const collectionMatches = collection.name.toLowerCase().includes(lowerQuery);

        collection.playlist.forEach((track, trackIndex) => {
            // Check if track matches any criteria
            const titleMatches = (track.title || track.fileName || '').toLowerCase().includes(lowerQuery);
            const artistMatches = (track.artist || '').toLowerCase().includes(lowerQuery);
            const albumMatches = (track.album || '').toLowerCase().includes(lowerQuery);
            const durationMatches = (track.duration || '').includes(lowerQuery);

            if (collectionMatches || titleMatches || artistMatches || albumMatches || durationMatches) {
                results.push({
                    track: track,
                    collectionIndex: collectionIndex,
                    trackIndex: trackIndex,
                    collectionName: collection.name
                });
            }
        });
    });

    // Display search results
    renderSearchResults(results, query);
}

// ============================================================================
// SEARCH FUNCTIONALITY
// ============================================================================

// Render search results in the playlist
// This function displays matching tracks from all collections in the playlist UI
// Parameters:
//   - results: Array of search result objects (each contains track, collection info)
//   - query: String search query that was used
function renderSearchResults(results, query) {
    const t = translations[currentLanguage] || translations.es;  // Get translations, fallback to Spanish
    if (results.length === 0) {
        // Display message if no results found
        playlistEl.innerHTML = `<div class="empty-playlist">${t.searchNoResults} "${query}"</div>`;
        searchInfo.textContent = `0 ${t.searchResults}`;
        return;
    }

    searchInfo.textContent = `${results.length} ${t.searchResults}`;  // Display result count

    playlistEl.innerHTML = '';  // Clear playlist
    results.forEach((result, index) => {
        const item = document.createElement('div');
        item.className = 'playlist-item search-result';

        // Determine heart icon color based on favorite status
        // Orange (#ff6b35) if favorited, gray (#666) if not
        const isFavorite = favorites.has(result.track.path);
        const heartIcon = isFavorite ?
            '<svg class="heart-icon" viewBox="0 0 24 24" width="16" height="16" fill="#ff6b35"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>' :
            '<svg class="heart-icon" viewBox="0 0 24 24" width="16" height="16" fill="#666"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

        // Build playlist item HTML with heart icon, title, collection name, and duration
        item.innerHTML = `
            <span class="playlist-item-favorite" data-index="${result.trackIndex}">${heartIcon}</span>
            <span class="playlist-item-title">${result.track.title || result.track.fileName}</span>
            <span class="playlist-item-collection">${result.collectionName}</span>
            <span class="playlist-item-duration">${result.track.duration || ''}</span>
        `;

        // Handle click: toggle favorite if heart clicked, play track otherwise
        item.addEventListener('click', (e) => {
            const favoriteSpan = e.target.closest('.playlist-item-favorite');
            if (favoriteSpan) {
                // User clicked the heart icon - toggle favorite status
                toggleFavoritePath(result.track.path);
            } else {
                // User clicked the track - switch to its collection and play it
                selectCollection(result.collectionIndex);
                playTrack(result.trackIndex);
            }
        });

        playlistEl.appendChild(item);  // Add item to playlist
    });
}

// Toggle favorite by track index in current playlist
// This is a wrapper function that gets the track from the playlist and toggles its favorite status
// Parameters:
//   - index: Integer index of the track in the current playlist
function toggleFavorite(index) {
    const track = playlist[index];
    if (!track) return;  // Exit if track doesn't exist
    toggleFavoritePath(track.path);  // Toggle using file path (unique identifier)
}

// Toggle favorite status by file path (works cross-collection)
// This is the core favorites function - uses file path as unique identifier
// This allows the same file in different collections to share favorite status
// Parameters:
//   - path: String file path of the track
// ============================================================================
// CRITICAL: DO NOT MODIFY THIS FUNCTION - FAVORITES SYSTEM IS WORKING CORRECTLY
// Any modification to this function will break the favorites functionality
// ============================================================================
function toggleFavoritePath(path) {
    if (favorites.has(path)) {
        favorites.delete(path);  // Remove from favorites if already present
    } else {
        favorites.add(path);  // Add to favorites if not present
    }
    renderPlaylist();     // Re-render playlist to update heart icon colors
    renderFavorites();    // Re-render favorites list to show updated state
    // Update the heart icon in the player header to reflect new favorite status
    if (currentTrackIndex >= 0 && playlist[currentTrackIndex]) {
        updateTrackInfo(playlist[currentTrackIndex]);
    }
}

// Render the favorites list panel
// This function displays all favorited tracks from all collections in the favorites panel
// Each item shows the track number, title, and collection name
function renderFavorites() {
    if (!favoritesList) return;  // Exit if favorites list element doesn't exist
    if (favorites.size === 0) {
        // Display message if no favorites exist
        favoritesList.innerHTML = '<div class="empty-favorites">No hay favoritos</div>';
    } else {
        favoritesList.innerHTML = '';  // Clear favorites list
        let favNumber = 0;  // Counter for favorite numbering
        // Collect all favorited tracks across all collections
        // Use a Set to avoid duplicates based on file path
        const seenPaths = new Set();
        collections.forEach((collection, collectionIndex) => {
            collection.playlist.forEach((track, trackIndex) => {
                if (!favorites.has(track.path)) return;
                if (seenPaths.has(track.path)) return;  // Skip duplicates
                seenPaths.add(track.path);
                favNumber++;
                const item = document.createElement('div');
                item.className = 'favorite-item';
                // Highlight if this is the currently playing track
                const currentTrack = playlist[currentTrackIndex];
                if (currentTrack && currentTrack.path === track.path) {
                    item.classList.add('playing');
                }
                item.innerHTML = `
                    <span class="favorite-item-number">${favNumber}</span>
                    <span class="favorite-item-title">${track.title || track.fileName}</span>
                    <span class="favorite-item-collection">${collection.name}</span>
                `;
                item.addEventListener('click', () => {
                    selectCollection(collectionIndex);
                    playTrack(trackIndex);
                    renderFavorites(); // update playing highlight
                });
                favoritesList.appendChild(item);
            });
        });
    }
    updateCounters();
}

// Update counters for favorites and playlist
function updateCounters() {
    const favCountEl = document.getElementById('favoritesCount');
    const playlistCountEl = document.getElementById('playlistCount');
    if (favCountEl) favCountEl.textContent = favorites.size;
    if (playlistCountEl) playlistCountEl.textContent = playlist.length;
}

// Toggle collections collapse/expand
function toggleCollectionsCollapse() {
    const collectionsEl = document.getElementById('collections');
    const collapseBtn = document.getElementById('collapseCollectionsBtn');
    if (collectionsEl && collapseBtn) {
        collectionsEl.classList.toggle('collapsed');
        collapseBtn.classList.toggle('collapsed');
    }
}

// Toggle playlist collapse/expand
function togglePlaylistCollapse() {
    const playlistEl = document.getElementById('playlist');
    if (playlistEl) {
        playlistEl.classList.toggle('collapsed');
    }
}

// Toggle audio recording on/off
// CRITICAL: DO NOT MODIFY THIS FUNCTION OR ITS LOGIC
// This function handles the complete recording workflow including:
// - Microphone access and stream initialization
// - Audio context setup with separate microphone context
// - MediaRecorder configuration with gain node for volume control
// - Recording start/stop with timestamp tracking
// - Playback control button disable/enable
// - Microphone volume slider show/hide
// - File saving and collection management
// - Duration calculation using timestamps
// Any modifications may break the recording feature completely.
async function toggleRecording() {
    if (!isRecording) {
        // Start recording
        try {
            // Request access to audio input devices (microphone, webcam, mixer, USB, jack)
            audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });

            // Connect microphone to audio context for visualization
            // Use a separate audio context for microphone to avoid interference with playback
            const microphoneContext = new (window.AudioContext || window.webkitAudioContext)();
            microphoneSource = microphoneContext.createMediaStreamSource(audioStream);
            microphoneGain = microphoneContext.createGain();
            microphoneAnalyser = microphoneContext.createAnalyser();
            microphoneAnalyser.fftSize = 256;

            // Connect source -> gain -> analyser
            microphoneSource.connect(microphoneGain);
            microphoneGain.connect(microphoneAnalyser);

            // Also connect gain to destination for recording with volume control
            // Create a destination node for recording
            const destination = microphoneContext.createMediaStreamDestination();
            microphoneGain.connect(destination);

            // Use the stream from destination for recording (with volume control)
            const recordingStream = destination.stream;
            mediaRecorder = new MediaRecorder(recordingStream);
            recordedChunks = [];

            // Handle data available event
            mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    recordedChunks.push(event.data);
                }
            };

            // Handle recording stop event
            mediaRecorder.onstop = async () => {
                // Disconnect microphone from audio context
                if (microphoneSource) {
                    microphoneSource.disconnect();
                    microphoneSource = null;
                }
                if (microphoneAnalyser) {
                    microphoneAnalyser.disconnect();
                    microphoneAnalyser = null;
                }

                // Create blob from recorded chunks
                const blob = new Blob(recordedChunks, { type: 'audio/webm' });

                // Generate filename with timestamp
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
                const filename = `grabacion-${timestamp}.webm`;

                // Convert blob to base64 for IPC transfer
                const arrayBuffer = await blob.arrayBuffer();
                const base64Data = Buffer.from(arrayBuffer).toString('base64');

                // Request save dialog via IPC
                const result = await ipcRenderer.invoke('save-recording', filename, base64Data);

                if (result.success) {
                    console.log('Recording saved to:', result.filePath);

                    // CRITICAL: DO NOT MODIFY THIS COLLECTION MANAGEMENT LOGIC
                    // This code ensures recordings are saved to "Mis Grabaciones" collection.
                    // Duration is calculated from timestamps to avoid WebM metadata issues.
                    // recordingDurationSeconds is stored for seek slider compatibility.
                    // Any changes may break collection management or duration display.

                    // Use the actual saved file path to get the real filename
                    const savedFileName = result.filePath.split('/').pop();

                    // Create or find "Mis Grabaciones" collection
                    let recordingsCollectionIndex = collections.findIndex(c => c.name === 'Mis Grabaciones');
                    if (recordingsCollectionIndex === -1) {
                        collections.push({
                            name: 'Mis Grabaciones',
                            playlist: []
                        });
                        recordingsCollectionIndex = collections.length - 1;
                    }

                    // Get duration for recorded file using recording time
                    let duration = '00:00';
                    let recordingDurationSeconds = 0;
                    if (recordingStartTime && recordingEndTime) {
                        recordingDurationSeconds = (recordingEndTime - recordingStartTime) / 1000;
                        duration = formatTime(recordingDurationSeconds);
                        console.log('Recording duration from timestamps:', duration, 'seconds:', recordingDurationSeconds);
                    } else {
                        console.log('Recording timestamps not available, duration will be 00:00');
                    }

                    // Add recording to collection
                    const track = {
                        path: result.filePath,
                        fileName: savedFileName,
                        title: savedFileName.replace(/\.[^/.]+$/, ''),
                        artist: '',
                        album: '',
                        duration: duration,
                        recordingDuration: recordingDurationSeconds  // Store actual duration in seconds for seek slider
                    };
                    collections[recordingsCollectionIndex].playlist.push(track);

                    // Render collections and switch to recordings collection
                    renderCollections();
                    selectCollection(recordingsCollectionIndex);
                } else {
                    console.error('Error saving recording:', result.error);
                }

                // Stop all audio tracks
                if (audioStream) {
                    audioStream.getTracks().forEach(track => track.stop());
                }
            };

            // Start recording
            mediaRecorder.start();
            isRecording = true;
            recordBtn.classList.add('recording');

            // Record start time for duration calculation
            recordingStartTime = Date.now();

            // Disable playback control buttons during recording
            if (playBtn) playBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = true;
            if (previousBtn) previousBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            if (shuffleBtn) shuffleBtn.disabled = true;
            if (repeatBtn) repeatBtn.disabled = true;

            // Show microphone volume slider
            if (micVolumeContainer) micVolumeContainer.style.display = 'flex';

            console.log('Recording started');

        } catch (err) {
            console.error('Error starting recording:', err);
            alert('Error al iniciar la grabación. Asegúrate de tener un dispositivo de audio conectado.');
        }
    } else {
        // Stop recording
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            // Record end time for duration calculation
            recordingEndTime = Date.now();

            mediaRecorder.stop();
            isRecording = false;
            recordBtn.classList.remove('recording');

            // Re-enable playback control buttons after recording
            if (playBtn) playBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;
            if (previousBtn) previousBtn.disabled = false;
            if (nextBtn) nextBtn.disabled = false;
            if (shuffleBtn) shuffleBtn.disabled = false;
            if (repeatBtn) repeatBtn.disabled = false;

            // Hide microphone volume slider
            if (micVolumeContainer) micVolumeContainer.style.display = 'none';

            console.log('Recording stopped');
        }
    }
}

// Play a file from its file path (when opened via double-click on file)
// This function adds the file to the current collection and plays it
async function playFileFromPath(filePath) {
    console.log('playFileFromPath called with:', filePath);

    const fileName = filePath.split('/').pop();
    const path = require('path');

    // Get duration for audio file
    const tempAudio = new Audio(`file://${filePath}`);
    await new Promise((resolve) => {
        tempAudio.addEventListener('loadedmetadata', () => {
            console.log('Metadata loaded for:', filePath);
            resolve();
        });
        tempAudio.addEventListener('error', (e) => {
            console.error('Error loading metadata:', e);
            resolve();
        });
    });
    const duration = tempAudio.duration && !isNaN(tempAudio.duration) ? formatTime(tempAudio.duration) : '';
    console.log('Duration:', duration);

    // Create track object
    const track = {
        path: filePath,
        fileName: fileName,
        title: fileName.replace(/\.[^/.]+$/, ''),
        artist: '',
        album: '',
        duration: duration
    };

    // If no collections exist, create one
    if (collections.length === 0) {
        collections.push({
            name: 'Archivos Individuales',
            playlist: []
        });
        currentCollectionIndex = 0;
        playlist = collections[0].playlist;
        console.log('Created first collection');
    }

    // Check if file already exists in current collection
    const existingFile = playlist.find(t => t.path === filePath);
    if (existingFile) {
        console.log('File already exists in current collection, just playing it');
        const trackIndex = playlist.findIndex(t => t.path === filePath);
        renderCollections();
        renderPlaylist();
        playTrack(trackIndex);
        return;
    }

    // Add file to current collection
    playlist.push(track);
    console.log('Added file to current collection, new playlist length:', playlist.length);

    // Find the track index and play it
    const trackIndex = playlist.findIndex(t => t.path === filePath);
    console.log('Track index:', trackIndex);
    if (trackIndex >= 0) {
        renderCollections();
        renderPlaylist();
        console.log('Calling playTrack with index:', trackIndex);
        playTrack(trackIndex);
    } else {
        console.error('Track not found in playlist');
    }
}

// Build a temporary playlist of only favorited tracks and start playback
function playFavoritesOnly() {
    if (favorites.size === 0) {
        alert('No hay favoritos para reproducir');
        return;
    }

    // Collect all favorited tracks across all collections
    // Use a Set to avoid duplicates based on file path
    const favTracksMap = new Map();
    collections.forEach(collection => {
        collection.playlist.forEach(track => {
            if (favorites.has(track.path) && !favTracksMap.has(track.path)) {
                favTracksMap.set(track.path, track);
            }
        });
    });
    const favTracks = Array.from(favTracksMap.values());

    if (favTracks.length === 0) return;

    // Set up favorites queue (separate from display playlist)
    favoritesQueue = favTracks;
    favoritesQueueIndex = 0;
    isPlayingFavorites = true;

    // Show favorites in the playlist panel
    playlist = favTracks;
    renderPlaylist();

    // Play first favorite directly via queue
    playFromFavoritesQueue(0);
}

// Add individual audio files to current collection
// Opens file dialog via IPC and processes each file to get duration
async function addFiles() {
    // If no collections exist, create one automatically
    if (collections.length === 0) {
        collections.push({
            name: 'Archivos Individuales',
            playlist: []
        });
        currentCollectionIndex = 0;
        playlist = collections[0].playlist;
    }

    const filePaths = await ipcRenderer.invoke('select-files');  // Open file dialog

    for (const filePath of filePaths) {
        const fileName = filePath.split('/').pop();

        // Get duration by loading audio metadata
        const tempAudio = new Audio(`file://${filePath}`);
        await new Promise((resolve) => {
            tempAudio.addEventListener('loadedmetadata', () => resolve());
            tempAudio.addEventListener('error', () => resolve());
        });
        const duration = tempAudio.duration && !isNaN(tempAudio.duration) ? formatTime(tempAudio.duration) : '';

        // Add to current collection's playlist
        collections[currentCollectionIndex].playlist.push({
            path: filePath,
            fileName: fileName,
            title: fileName,
            artist: '',
            album: '',
            duration: duration
        });
    }

    // Update current playlist and re-render
    playlist = collections[currentCollectionIndex].playlist;
    renderPlaylist();
    renderCollections();
}

// Add entire folder as a new collection
// Recursively walks through folder and subfolders to find audio files
async function addFolder() {
    const folderPath = await ipcRenderer.invoke('select-folder');  // Open folder dialog
    if (!folderPath) return;

    const fs = require('fs');
    const path = require('path');
    const folderName = path.basename(folderPath);

    // Create new collection
    const newCollection = {
        name: folderName,
        playlist: []
    };

    // Recursive function to walk through directories
    async function walkDir(dir) {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);
            if (stat.isDirectory()) {
                await walkDir(filePath);  // Recurse into subdirectory
            } else if (file.match(/\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i)) {
                // Get duration for audio file
                const tempAudio = new Audio(`file://${filePath}`);
                await new Promise((resolve) => {
                    tempAudio.addEventListener('loadedmetadata', () => resolve());
                    tempAudio.addEventListener('error', () => resolve());
                });
                const duration = tempAudio.duration && !isNaN(tempAudio.duration) ? formatTime(tempAudio.duration) : '';

                newCollection.playlist.push({
                    path: filePath,
                    fileName: file,
                    title: file,
                    artist: '',
                    album: '',
                    duration: duration
                });
            }
        }
    }

    await walkDir(folderPath);

    // Add collection to list
    collections.push(newCollection);

    // Select the new collection
    currentCollectionIndex = collections.length - 1;
    playlist = newCollection.playlist;

    renderCollections();
    renderPlaylist();
}

// ============================================================================
// LANGUAGE TRANSLATION
// ============================================================================

// Update all UI text elements to the selected language
// Updates: page title, track info, buttons, modals, context menu, tooltips
function updateLanguage() {
    try {
        const t = translations[currentLanguage];

        // Update page title
        document.title = t.title;

        // Update cover art placeholder text
        if (coverArt) {
            const noCover = coverArt.querySelector('.no-cover');
            if (noCover) {
                noCover.textContent = t.noCover;
            }
        }

        // Update track info labels (title, artist, album)
        if (trackTitle) trackTitle.textContent = `${t.title_label}: ${playlist[currentTrackIndex]?.title || '-'}`;
        if (trackArtist) trackArtist.textContent = `${t.artist_label}: ${playlist[currentTrackIndex]?.artist || '-'}`;
        if (trackAlbum) trackAlbum.textContent = `${t.album_label}: ${playlist[currentTrackIndex]?.album || '-'}`;

        // Update action button text
        if (addFilesBtn) addFilesBtn.textContent = t.addFiles;
        if (addFolderBtn) addFolderBtn.textContent = t.addFolder;
        if (editMetadataBtn) editMetadataBtn.textContent = t.editMetadata;

        // Update collections header
        if (collectionsHeader) collectionsHeader.textContent = t.collections;

        // Update empty collections message
        if (collectionsEl) {
            const emptyCollections = collectionsEl.querySelector('.empty-playlist');
            if (emptyCollections) {
                emptyCollections.textContent = t.emptyCollections;
            }
        }

        // Update empty playlist message
        if (playlistEl) {
            const emptyPlaylist = playlistEl.querySelector('.empty-playlist');
            if (emptyPlaylist) {
                emptyPlaylist.textContent = t.emptyPlaylist;
            }
        }

        // Update search placeholder
        if (searchInput) {
            searchInput.placeholder = t.searchPlaceholder;
        }

        // Update button tooltips
        if (previousBtn) previousBtn.title = t.previous;
        if (playBtn) playBtn.title = t.play;
        if (pauseBtn) pauseBtn.title = t.pause;
        if (stopBtn) stopBtn.title = t.stop;
        if (nextBtn) nextBtn.title = t.next;

        // Update playlist header (Lista de Reproducción)
        if (playlistHeader) {
            playlistHeader.textContent = t.playlistHeader;
        }

        // Update favorites header
        const favoritesHeaderEl = document.getElementById('favoritesHeader');
        if (favoritesHeaderEl) favoritesHeaderEl.textContent = t.favoritesHeader;

        // Update empty favorites message
        const emptyFavorites = document.querySelector('.empty-favorites');
        if (emptyFavorites) emptyFavorites.textContent = t.emptyFavorites;

        // Update exit modal
        const exitTitle = document.querySelector('#confirmExitModal h2');
        if (exitTitle) exitTitle.textContent = t.exitTitle;
        const exitMessage = document.querySelector('#confirmExitModal p');
        if (exitMessage) exitMessage.textContent = t.exitMessage;
        const exitCancel = document.getElementById('cancelExitBtn');
        if (exitCancel) exitCancel.textContent = t.exitCancel;
        const exitConfirm = document.getElementById('confirmExitBtn');
        if (exitConfirm) exitConfirm.textContent = t.exitConfirm;

        // Update equalizer modal
        const eqTitle = document.querySelector('#eqModal h2');
        if (eqTitle) eqTitle.textContent = t.equalizerTitle;
        document.querySelectorAll('.eq-preset-btn').forEach(btn => {
            const preset = btn.dataset.preset;
            if (preset === 'flat') btn.textContent = t.eqPresetFlat;
            else if (preset === 'pop') btn.textContent = t.eqPresetPop;
            else if (preset === 'rock') btn.textContent = t.eqPresetRock;
            else if (preset === 'ballad') btn.textContent = t.eqPresetBallad;
            else if (preset === 'acoustic') btn.textContent = t.eqPresetAcoustic;
        });

        // Update metadata modal
        const metaTitle = document.querySelector('#metadataModal h2');
        if (metaTitle) metaTitle.textContent = t.metadataTitle;
        const metaTrackLabel = document.querySelector('label[for="metadataTitle"]');
        if (metaTrackLabel) metaTrackLabel.textContent = t.metadataTrackName;
        const metaArtistLabel = document.querySelector('label[for="metadataArtist"]');
        if (metaArtistLabel) metaArtistLabel.textContent = t.metadataArtist;
        const metaAlbumLabel = document.querySelector('label[for="metadataAlbum"]');
        if (metaAlbumLabel) metaAlbumLabel.textContent = t.metadataAlbum;
        const metaPickCover = document.getElementById('metadataPickCover');
        if (metaPickCover) metaPickCover.textContent = t.metadataPickCover;
        const metaRemoveCover = document.getElementById('metadataRemoveCover');
        if (metaRemoveCover) metaRemoveCover.textContent = t.metadataRemoveCover;
        const metaApplyToCollection = document.querySelector('.metadata-collection-cover');
        if (metaApplyToCollection && metaApplyToCollection.childNodes[0]) {
            metaApplyToCollection.childNodes[0].textContent = t.metadataApplyToCollection;
        }
        const metaSave = document.getElementById('saveMetadata');
        if (metaSave) metaSave.textContent = t.metadataSave;
        const metaCancel = document.getElementById('cancelMetadata');
        if (metaCancel) metaCancel.textContent = t.metadataCancel;
        const metaNoCover = document.getElementById('metadataCoverPreview');
        if (metaNoCover && (metaNoCover.textContent.includes('Sin') || metaNoCover.textContent.includes('No'))) {
            metaNoCover.textContent = t.metadataNoCover;
        }

        // Update help modal content
        if (helpModal) {
            const helpModalTitle = helpModal.querySelector('h2');
            if (helpModalTitle) {
                helpModalTitle.textContent = t.helpTitle;
            }
            const helpLanguageLabel = helpModal.querySelector('label[for="languageSelector"]');
            if (helpLanguageLabel) {
                helpLanguageLabel.textContent = t.languageLabel;
            }
            const helpInfoTitle = helpModal.querySelector('.help-info h3');
            if (helpInfoTitle) {
                helpInfoTitle.textContent = t.helpInfoTitle;
            }
            const helpInfoDesc = helpModal.querySelector('.help-info p');
            if (helpInfoDesc) {
                helpInfoDesc.textContent = t.helpInfoDesc;
            }
            const helpShortcuts = helpModal.querySelectorAll('.help-info p');
            if (helpShortcuts.length > 1) {
                helpShortcuts[1].innerHTML = `<strong>${t.helpShortcuts}</strong>`;
            }
            const helpShortcutsList = helpModal.querySelectorAll('.help-info li');
            if (helpShortcutsList.length >= 7) {
                helpShortcutsList[0].textContent = t.shortcutSpace;
                helpShortcutsList[1].textContent = t.shortcutRight;
                helpShortcutsList[2].textContent = t.shortcutLeft;
                helpShortcutsList[3].textContent = t.shortcutF12;
                helpShortcutsList[4].textContent = t.shortcutShiftA;
                helpShortcutsList[5].textContent = t.shortcutShiftC;
                helpShortcutsList[6].textContent = t.shortcutShiftE;
            }
        }

        // Update Learn More text
        if (helpModal) {
            const learnMore = helpModal.querySelector('.learn-more a');
            if (learnMore) {
                learnMore.textContent = t.learnMore;
            }
        }

        // Update context menu items
        const contextPlay = document.getElementById('contextPlay');
        if (contextPlay) contextPlay.textContent = t.contextPlay;
        const contextEdit = document.getElementById('contextEdit');
        if (contextEdit) contextEdit.textContent = t.contextEdit;
        const contextConvert = document.getElementById('contextConvert');
        if (contextConvert) contextConvert.textContent = t.contextConvert;
        const contextRemove = document.getElementById('contextRemove');
        if (contextRemove) contextRemove.textContent = t.contextRemove;
        const collectionContextDelete = document.getElementById('collectionContextDelete');
        if (collectionContextDelete) collectionContextDelete.textContent = t.contextDeleteCollection;

        // Update conversion modal labels
        if (conversionModal) {
            const conversionModalTitle = conversionModal.querySelector('h2');
            if (conversionModalTitle) {
                conversionModalTitle.textContent = t.conversionTitle;
            }
            const conversionLabels = conversionModal.querySelectorAll('.form-group label');
            if (conversionLabels.length >= 5) {
                conversionLabels[0].textContent = t.currentFile;
                conversionLabels[1].textContent = t.currentFormat;
                conversionLabels[2].textContent = t.convertTo;
                conversionLabels[3].textContent = t.quality;
                conversionLabels[4].textContent = t.saveTo;
            }
        }
        if (quality) {
            const qualityOptions = quality.querySelectorAll('option');
            if (qualityOptions.length >= 4) {
                qualityOptions[0].textContent = t.qualityHigh;
                qualityOptions[1].textContent = t.qualityMedium;
                qualityOptions[2].textContent = t.qualityLow;
                qualityOptions[3].textContent = t.qualityWeb;
            }
        }
        const cancelBtn = document.getElementById('cancelConversion');
        if (cancelBtn) {
            cancelBtn.textContent = t.cancel;
        }
        const convertBtn = document.getElementById('startConversion');
        if (convertBtn) {
            convertBtn.textContent = t.convert;
        }
        if (progressModal) {
            const progressModalTitle = progressModal.querySelector('h2');
            if (progressModalTitle) {
                progressModalTitle.textContent = t.converting;
            }
        }
    } catch (error) {
        console.error('Error updating language:', error);
    }
}

// ============================================================================
// CONTEXT MENU
// ============================================================================

// Show context menu at mouse position
// Adjusts position to keep menu within viewport bounds
function showContextMenu(e, index) {
    e.preventDefault();
    contextMenuIndex = index;

    const track = playlist[index];
    const extension = track.path.split('.').pop().toLowerCase();

    contextMenu.style.display = 'block';

    // Calculate position to keep menu within viewport
    const menuWidth = contextMenu.offsetWidth || 150;
    const menuHeight = contextMenu.offsetHeight || 120;

    let left = e.pageX;
    let top = e.pageY;

    // Check if menu would go off the right edge
    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }

    // Check if menu would go off the bottom edge
    if (top + menuHeight > window.innerHeight) {
        top = window.innerHeight - menuHeight - 10;
    }

    contextMenu.style.left = `${left}px`;
    contextMenu.style.top = `${top}px`;
}

// Hide context menu
function hideContextMenu() {
    contextMenu.style.display = 'none';
}

// Hide collection context menu
function hideCollectionContextMenu() {
    collectionContextMenu.style.display = 'none';
}

// Show collection context menu at mouse position
function showCollectionContextMenu(e, index) {
    e.preventDefault();
    collectionContextMenuIndex = index;

    collectionContextMenu.style.display = 'block';

    // Calculate position to keep menu within viewport
    const menuWidth = collectionContextMenu.offsetWidth || 150;
    const menuHeight = collectionContextMenu.offsetHeight || 40;

    let left = e.pageX;
    let top = e.pageY;

    // Check if menu would go off the right edge
    if (left + menuWidth > window.innerWidth) {
        left = window.innerWidth - menuWidth - 10;
    }

    // Check if menu would go off the bottom edge
    if (top + menuHeight > window.innerHeight) {
        top = window.innerHeight - menuHeight - 10;
    }

    collectionContextMenu.style.left = `${left}px`;
    collectionContextMenu.style.top = `${top}px`;
}

// ============================================================================
// METADATA MODAL
// ============================================================================

let metadataModal, metadataEditIndex = -1, metadataCoverPath = null, metadataCoverRemoved = false;

function showMetadataModal(index) {
    metadataEditIndex = index;
    const track = playlist[index];
    metadataCoverPath = track.coverPath || null;
    metadataCoverRemoved = false;

    document.getElementById('metadataTitle').value = track.title || '';
    document.getElementById('metadataArtist').value = track.artist || '';
    document.getElementById('metadataAlbum').value = track.album || '';
    document.getElementById('metadataApplyToCollection').checked = false;

    const preview = document.getElementById('metadataCoverPreview');
    if (metadataCoverPath) {
        preview.innerHTML = `<img src="file://${metadataCoverPath}" alt="cover">`;
    } else if (track.coverData) {
        preview.innerHTML = `<img src="${track.coverData}" alt="cover">`;
        metadataCoverPath = null;
    } else {
        preview.textContent = 'Sin carátula';
    }

    metadataModal = document.getElementById('metadataModal');
    metadataModal.style.display = 'flex';
}

function hideMetadataModal() {
    if (metadataModal) metadataModal.style.display = 'none';
}

// ============================================================================
// EQUALIZER MODAL
// ============================================================================

function applyEQPreset(presetName) {
    const gains = EQ_PRESETS[presetName] || EQ_PRESETS.flat;
    currentEQPreset = presetName;
    gains.forEach((gain, i) => {
        if (eqBands[i]) eqBands[i].gain.value = gain;
        const slider = document.getElementById(`eq-band-${i}`);
        const valEl  = document.getElementById(`eq-val-${i}`);
        if (slider) slider.value = gain;
        if (valEl)  valEl.textContent = (gain > 0 ? '+' : '') + gain;
    });
    document.querySelectorAll('.eq-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === presetName);
    });
}

// ============================================================================
// CONVERSION MODAL
// ============================================================================

// Show conversion modal with track information
// Displays current file, format, and allows selecting output format and quality
function showConversionModal(index) {
    const track = playlist[index];
    const extension = track.path.split('.').pop().toLowerCase();

    currentFileName.textContent = track.fileName;
    currentFormat.textContent = extension.toUpperCase();

    // Set default output path (same directory, new extension)
    const defaultPath = track.path.replace(/\.[^/.]+$/, `.${targetFormat.value}`);
    outputPath.value = defaultPath;

    conversionModal.style.display = 'flex';
}

// Hide conversion modal
function hideConversionModal() {
    conversionModal.style.display = 'none';
}

// ============================================================================
// PROGRESS MODAL
// ============================================================================

// Show progress modal with empty progress bar
function showProgressModal() {
    progressModal.style.display = 'flex';
    progressFill.style.width = '0%';
    progressText.textContent = '0%';
}

// Hide progress modal
function hideProgressModal() {
    progressModal.style.display = 'none';
}

// ============================================================================
// AUDIO CONVERSION (IPC)
// ============================================================================

// Invoke audio conversion in main process via IPC
// Conversion runs in main process to avoid blocking UI
async function convertAudio(inputPath, outputPath, format, quality) {
    try {
        await ipcRenderer.invoke('convert-audio', inputPath, outputPath, format, quality);
    } catch (error) {
        throw error;
    }
}

// Listen for conversion progress updates from main process
ipcRenderer.on('conversion-started', () => {
    showProgressModal();
});

ipcRenderer.on('conversion-progress', (event, percent) => {
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `${percent}%`;
});

ipcRenderer.on('conversion-complete', () => {
    hideProgressModal();
    alert('Conversión completada exitosamente');
});

ipcRenderer.on('conversion-error', (event, errorMessage) => {
    hideProgressModal();
    alert(`Error en la conversión: ${errorMessage}`);
});

// ============================================================================
// STATE PERSISTENCE
// ============================================================================

async function saveState() {
    const state = {
        collections: collections.map(col => ({
            name: col.name,
            playlist: col.playlist.map(t => ({
                path: t.path,
                fileName: t.fileName,
                title: t.title,
                artist: t.artist,
                album: t.album,
                duration: t.duration,
                coverPath: t.coverPath || null,
                recordingDuration: t.recordingDuration || null  // Preserve recording duration for WebM files
            }))
        })),
        favorites: [...favorites],
        currentCollectionIndex,
        currentTrackIndex,
        isPlaying,
        currentTime: audioElement1 ? audioElement1.currentTime : 0,
        volume: volumeSlider ? parseInt(volumeSlider.value) : 100,
        eqPreset: currentEQPreset,
        eqGains: eqBands.map(b => b.gain.value)
    };
    await ipcRenderer.invoke('save-state', state);
}

async function loadState() {
    const state = await ipcRenderer.invoke('load-state');
    if (!state) return;

    // Restore collections
    if (Array.isArray(state.collections)) {
        collections = state.collections.map(col => ({
            name: col.name,
            playlist: (col.playlist || []).map(t => ({
                ...t,
                recordingDuration: t.recordingDuration || null  // Restore recording duration for WebM files
            }))
        }));
        renderCollections();
    }

    // Restore favorites
    if (Array.isArray(state.favorites)) {
        favorites = new Set(state.favorites);
    }

    // Restore current collection
    if (state.currentCollectionIndex >= 0 && state.currentCollectionIndex < collections.length) {
        currentCollectionIndex = state.currentCollectionIndex;
        playlist = collections[currentCollectionIndex].playlist;
        renderPlaylist();
        renderCollections();
        const items = document.querySelectorAll('.collection-item');
        if (items[currentCollectionIndex]) items[currentCollectionIndex].classList.add('active');
    }

    // Restore current track index and playback state
    if (state.currentTrackIndex >= 0 && state.currentTrackIndex < playlist.length) {
        currentTrackIndex = state.currentTrackIndex;
        const track = playlist[currentTrackIndex];

        // Load the track
        audioElement1.src = `file://${track.path}`;

        // Restore playback position
        if (state.currentTime > 0) {
            audioElement1.currentTime = state.currentTime;
        }

        // Resume playback if it was playing
        if (state.isPlaying) {
            if (audioContext.state === 'suspended') {
                audioContext.resume();
            }
            audioElement1.play();
            isPlaying = true;
            updatePlayPauseButtons();
            updateTrackInfo(track);
            updatePlaylistHighlight();
        } else {
            isPlaying = false;
            updatePlayPauseButtons();
            updateTrackInfo(track);
            updatePlaylistHighlight();
        }
    }

    // Restore volume
    if (volumeSlider && state.volume != null) {
        volumeSlider.value = state.volume;
        const vol = state.volume / 100;
        if (gainNode1) gainNode1.gain.value = vol;
        if (gainNode2) gainNode2.gain.value = 0;
    }

    // Restore EQ
    if (Array.isArray(state.eqGains) && eqBands.length > 0) {
        state.eqGains.forEach((gain, i) => {
            if (eqBands[i]) eqBands[i].gain.value = gain;
            const slider = document.getElementById(`eq-band-${i}`);
            const valEl  = document.getElementById(`eq-val-${i}`);
            if (slider) slider.value = gain;
            if (valEl) valEl.textContent = (gain > 0 ? '+' : '') + gain;
        });
        if (state.eqPreset) {
            currentEQPreset = state.eqPreset;
            document.querySelectorAll('.eq-preset-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.preset === state.eqPreset);
            });
        }
    }
}

// isMuted and lastVolume declared at module level, handler attached in initEventListeners
let isMuted = false;
let lastVolume = 100;

// ============================================================================
// INITIALIZATION
// ============================================================================

// Initialize audio system and event listeners when DOM is ready
window.addEventListener('load', () => {
    console.log('window load');
    try {
        initDOMElements();  // Initialize DOM element references first
        console.log('initDOMElements done');
    } catch (e) {
        console.error('initDOMElements error:', e);
    }
    try {
        initAudio();        // Then initialize audio system
        console.log('initAudio done');
    } catch (e) {
        console.error('initAudio error:', e);
    }
    try {
        initEventListeners();  // Initialize event listeners
        console.log('initEventListeners done');
    } catch (e) {
        console.error('initEventListeners error:', e);
    }
    try {
        loadState();        // Restore persisted state
        console.log('loadState done');
    } catch (e) {
        console.error('loadState error:', e);
    }
    console.log('All initialization done');
});
