/*
============================================================================
AUDIO PLAYER ELECTRON - MAIN PROCESS
============================================================================
This is the Electron main process file. It handles:
- Window creation and lifecycle management
- IPC (Inter-Process Communication) handlers for file operations
- Audio conversion using FFmpeg (fluent-ffmpeg)
- Dialog handling for file/folder selection
============================================================================
*/

// Import required Electron modules
const { app, BrowserWindow, ipcMain, dialog, Menu, screen } = require('electron');
// Node.js built-in modules for file system and path operations
const path = require('path');
const fs = require('fs');

// Global reference to the main window object
// This reference is needed to prevent garbage collection of the window
let mainWindow;

// Store file path to play when window is ready
let fileToPlay = null;

// Single instance lock - prevent multiple instances
const gotTheLock = app.requestSingleInstanceLock();
console.log('Single instance lock:', gotTheLock);

// ============================================================================
// WINDOW CREATION AND LIFECYCLE
// ============================================================================

// Create and configure the main application window
// This function sets up the BrowserWindow with all necessary options
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,        // Initial window width in pixels
        height: 720,        // Initial window height in pixels
        minWidth: 960,      // Minimum width to prevent UI layout deformation
        minHeight: 660,     // Minimum height to prevent UI layout deformation
        maxWidth: 1600,     // Maximum width constraint
        maxHeight: 1080,    // Maximum height constraint
        title: 'ARIA Music',  // Window title displayed in title bar
        frame: false,         // Remove native OS frame for custom rounded corners
        transparent: true,    // Enable transparency for custom rounded corner effect
        webPreferences: {
            nodeIntegration: true,           // Allow Node.js APIs in renderer process
            contextIsolation: false,         // Disable context isolation (for legacy compatibility)
            enableRemoteModule: true         // Enable @electron/remote module
        },
        icon: path.join(__dirname, 'assets', 'icon.png')  // Application icon - Papirus music player icon
    });

    // Load the index.html file as the window's content
    mainWindow.loadFile('index.html');

    // Send file to play if one was provided via command line
    if (fileToPlay) {
        mainWindow.webContents.on('did-finish-load', () => {
            mainWindow.webContents.send('play-file', fileToPlay);
        });
    }

    // Open DevTools for debugging (commented out to prevent immediate close)
    // Uncomment the line below to open DevTools automatically on startup
    // mainWindow.webContents.openDevTools();

    // Event listeners for window maximize/unmaximize state changes
    // These notify the renderer process to update UI accordingly
    mainWindow.on('maximize', () => {
        if (mainWindow) mainWindow.webContents.send('window-maximized');
    });
    mainWindow.on('unmaximize', () => {
        if (mainWindow) mainWindow.webContents.send('window-unmaximized');
    });

    // Clean up window reference when window is closed
    // This prevents memory leaks by allowing garbage collection
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Build native application menu with File, Playback, and Help menus
// This menu appears in the OS's menu bar (top on macOS/Linux, window on Windows)
function createMenu() {
    const menuTemplate = [
        {
            label: 'Archivo',  // File menu label
            submenu: [
                {
                    label: 'Agregar Archivos',  // Add Files menu item
                    click: () => { mainWindow.webContents.send('menu-add-files'); }  // Send IPC message to renderer
                },
                {
                    label: 'Agregar Colección',  // Add Collection menu item
                    click: () => { mainWindow.webContents.send('menu-add-folder'); }  // Send IPC message to renderer
                },
                { type: 'separator' },  // Visual separator line
                {
                    label: 'Salir',  // Exit menu item
                    accelerator: 'CmdOrCtrl+Q',  // Keyboard shortcut (Cmd+Q on Mac, Ctrl+Q on others)
                    click: () => { app.quit(); }  // Quit the application
                }
            ]
        },
        {
            label: 'Reproducción',  // Playback menu label
            submenu: [
                {
                    label: 'Reproducir / Pausar',  // Play/Pause menu item
                    click: () => { mainWindow.webContents.send('menu-play-pause'); }  // Send IPC message to renderer
                },
                {
                    label: 'Anterior',  // Previous track menu item
                    click: () => { mainWindow.webContents.send('menu-previous'); }  // Send IPC message to renderer
                },
                {
                    label: 'Siguiente',  // Next track menu item
                    click: () => { mainWindow.webContents.send('menu-next'); }  // Send IPC message to renderer
                }
            ]
        },
        {
            label: 'Ayuda',  // Help menu label
            submenu: [
                {
                    label: 'Acerca de ARIA Music',  // About menu item
                    click: () => { mainWindow.webContents.send('menu-open-help'); }  // Send IPC message to renderer
                },
                { type: 'separator' },  // Visual separator line
                {
                    label: 'Consola de Desarrollador',  // Developer Console menu item
                    accelerator: 'CmdOrCtrl+Shift+I',  // Keyboard shortcut for DevTools
                    click: () => {
                        if (mainWindow) {
                            // Toggle DevTools open/close state
                            if (mainWindow.webContents.isDevToolsOpened()) {
                                mainWindow.webContents.closeDevTools();
                            } else {
                                mainWindow.webContents.openDevTools();
                            }
                        }
                    }
                }
            ]
        }
    ];

    // Build the menu from the template and set it as the application menu
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

// Create window when Electron app is ready
// This is the entry point for window creation
if (!gotTheLock) {
    // Another instance is already running, quit this one
    console.log('Another instance is already running, quitting...');
    app.quit();
} else {
    console.log('This is the primary instance');
    app.whenReady().then(() => {
        console.log('App ready, process.argv:', process.argv);
        // Check if a file was passed as command line argument
        if (process.argv.length > 2) {  // Skip electron executable and app path
            console.log('Command line arguments:', process.argv);
            // Get the file path from command line arguments (must have audio extension at the end)
            const filePath = process.argv.find(arg => {
                // Must end with audio extension and not be a directory
                return arg.match(/\/[^/]+\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i) && fs.existsSync(arg) && !fs.statSync(arg).isDirectory();
            });
            if (filePath) {
                console.log('File to play from command line:', filePath);
                fileToPlay = filePath;
            } else {
                console.log('No valid audio file found in command line arguments');
            }
        }

        createWindow();  // Create the main window
        createMenu();    // Create and set the application menu
    });

    // Handle second instance - when user clicks on another file while app is running
    app.on('second-instance', (event, commandLine, workingDirectory) => {
        console.log('Second instance detected, commandLine:', commandLine);
        // Find the file path from command line arguments (must have audio extension at the end)
        const filePath = commandLine.find(arg => {
            // Must end with audio extension and not be a directory
            return arg.match(/\/[^/]+\.(mp3|wav|ogg|flac|aac|m4a|wma|opus)$/i) && fs.existsSync(arg) && !fs.statSync(arg).isDirectory();
        });
        if (filePath) {
            console.log('Sending file to existing instance:', filePath);
            // Focus the existing window
            if (mainWindow) {
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
                // Send the file to the renderer process
                mainWindow.webContents.send('play-file', filePath);
            }
        }
    });
}

// Quit application when all windows are closed
// Exception: on macOS, keep app running (standard macOS behavior)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {  // Check if not macOS
        app.quit();  // Quit the application
    }
});

// ============================================================================
// IPC HANDLERS - CUSTOM WINDOW CONTROLS
// ============================================================================

// IPC handler for window minimize action
// Called when user clicks the minimize button in custom title bar
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });

// IPC handlers for fullscreen cover modal
ipcMain.on('enter-fullscreen', () => { if (mainWindow) mainWindow.setFullScreen(true); });
ipcMain.on('exit-fullscreen', () => { if (mainWindow) mainWindow.setFullScreen(false); });

// Variables for custom maximize/restore functionality
let savedBounds = null;        // Store window bounds before maximizing
let isManuallyMaximized = false; // Track if window is in custom maximized state

// IPC handler for window maximize/restore toggle
// Implements custom maximize that saves bounds and restores them
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;  // Safety check
    
    // If already maximized (manually or natively), restore to saved bounds
    if (isManuallyMaximized || mainWindow.isMaximized()) {
        isManuallyMaximized = false;  // Reset custom maximize flag
        if (savedBounds) mainWindow.setBounds(savedBounds);  // Restore saved position/size
        mainWindow.unmaximize();  // Unmaximize the window
        mainWindow.webContents.send('window-unmaximized');  // Notify renderer
    } else {
        // Save current bounds before maximizing
        savedBounds = mainWindow.getBounds();
        // Get primary display work area (excluding taskbar/dock)
        const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
        // Set window to fill the work area
        mainWindow.setBounds({ x, y, width, height });
        isManuallyMaximized = true;  // Set custom maximize flag
        mainWindow.webContents.send('window-maximized');  // Notify renderer
    }
});

// IPC handler for window close action
// Called when user clicks the close button in custom title bar
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

// IPC handler for toggling Developer Tools
// Allows renderer process to open/close DevTools via IPC
ipcMain.on('toggle-devtools', () => {
    if (mainWindow) {
        // Toggle DevTools open/close state
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
        } else {
            mainWindow.webContents.openDevTools();
        }
    }
});

// macOS-specific behavior: recreate window when dock icon is clicked
// On macOS, apps typically stay running even when all windows are closed
// This handler recreates the window if user clicks the dock icon
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {  // Check if no windows exist
        createWindow();  // Create a new window
    }
});

// ============================================================================
// IPC HANDLERS - FILE OPERATIONS
// ============================================================================

// IPC handler for file selection dialog
// Allows user to select multiple audio files
// Returns: Array of selected file paths (empty array if canceled)
ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],  // Allow file selection and multiple files
        filters: [
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'] },  // Audio file filter
            { name: 'All Files', extensions: ['*'] }  // All files filter
        ]
    });

    if (!result.canceled) {  // If user didn't cancel the dialog
        return result.filePaths;  // Return array of selected file paths
    }
    return [];  // Return empty array if canceled
});

// IPC handler for folder selection dialog
// Allows user to select a folder/directory
// Returns: Selected folder path (null if canceled)
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']  // Directory selection only
    });

    if (!result.canceled) {  // If user didn't cancel the dialog
        return result.filePaths[0];  // Return selected folder path
    }
    return null;  // Return null if canceled
});

// ============================================================================
// IPC HANDLERS - APP STATE PERSISTENCE
// ============================================================================

// Path to the state file for persisting app data
// Stored in userData directory (platform-specific app data folder)
const STATE_FILE = path.join(app.getPath('userData'), 'player-state.json');

// IPC handler for loading saved app state
// Returns: Parsed state object (null if file doesn't exist or error occurs)
ipcMain.handle('load-state', () => {
    try {
        if (fs.existsSync(STATE_FILE)) {  // Check if state file exists
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));  // Read and parse state file
        }
    } catch (e) {  // Catch any errors (file corruption, permission issues, etc.)
        console.error('Error loading state:', e);
    }
    return null;  // Return null if file doesn't exist or error occurred
});

// IPC handler for saving app state
// Parameters: state object to save
// Returns: void (success/failure is silent)
ipcMain.handle('save-state', (event, state) => {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));  // Write state to file with pretty formatting
    } catch (e) {  // Catch any errors (disk full, permission issues, etc.)
        console.error('Error saving state:', e);
    }
});

// ============================================================================
// IPC HANDLERS - IMAGE SELECTION
// ============================================================================

// IPC handler for image selection dialog
// Used for selecting custom cover art images
// Returns: Selected image file path (null if canceled)
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],  // Single file selection
        filters: [
            { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] },  // Image file filter
            { name: 'All Files', extensions: ['*'] }  // All files filter
        ]
    });

    if (!result.canceled) {  // If user didn't cancel the dialog
        return result.filePaths[0];  // Return selected image path
    }
    return null;  // Return null if canceled
});

// ============================================================================
// IPC HANDLERS - FILE LOCATION
// ============================================================================

// IPC handler for opening file location in file manager
// Opens the folder containing the file and selects the file
ipcMain.on('open-file-location', (event, filePath) => {
    if (fs.existsSync(filePath)) {
        const { shell } = require('electron');
        shell.showItemInFolder(filePath);
    }
});

// IPC handler for getting file statistics
// Returns: Object with bitrate, sampleRate, and size
ipcMain.handle('get-file-stats', async (event, filePath) => {
    try {
        const stats = fs.statSync(filePath);
        const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
        
        // Try to get audio metadata using ffprobe if available
        let bitrate = '-';
        let sampleRate = '-';
        
        try {
            const { execSync } = require('child_process');
            const output = execSync(`ffprobe -v error -show_entries format=bit_rate,stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`, { encoding: 'utf8' });
            const lines = output.trim().split('\n');
            if (lines.length >= 2) {
                bitrate = Math.round(parseInt(lines[0]) / 1000) + ' kbps';
                sampleRate = lines[1] + ' Hz';
            }
        } catch (e) {
            console.log('ffprobe not available or error:', e.message);
        }
        
        return {
            size: sizeMB + ' MB',
            bitrate: bitrate,
            sampleRate: sampleRate
        };
    } catch (error) {
        console.error('Error getting file stats:', error);
        return null;
    }
});

// ============================================================================
// IPC HANDLERS - SAVE DIALOG
// ============================================================================

// IPC handler for save dialog (for audio conversion output)
// Allows user to choose where to save converted audio files
// Returns: Selected save file path (null if canceled)
ipcMain.handle('select-save-path', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [
            { name: 'Audio Files', extensions: ['wav', 'aiff', 'flac', 'm4a', 'mp3', 'aac', 'ogg'] },  // Audio file filter
            { name: 'All Files', extensions: ['*'] }  // All files filter
        ]
    });

    if (!result.canceled) {  // If user didn't cancel the dialog
        return result.filePath;  // Return selected save path
    }
    return null;  // Return null if canceled
});

// IPC handler for saving audio recording
// CRITICAL: DO NOT MODIFY THIS IPC HANDLER
// This handler saves recorded audio files to disk using the file dialog.
// Parameters: filename (suggested filename), base64Data (audio data in base64)
// Returns: Object with success flag and filePath or error
// Any changes may break the file saving functionality.
ipcMain.handle('save-recording', async (event, filename, base64Data) => {
    try {
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Guardar Grabación',
            defaultPath: filename,
            filters: [
                { name: 'Audio WebM', extensions: ['webm'] },
                { name: 'Todos los archivos', extensions: ['*'] }
            ]
        });

        if (!result.canceled && result.filePath) {
            // Convert base64 back to buffer and save
            const buffer = Buffer.from(base64Data, 'base64');
            fs.writeFileSync(result.filePath, buffer);
            return { success: true, filePath: result.filePath };
        }

        return { success: false, error: 'User canceled' };
    } catch (err) {
        console.error('Error saving recording:', err);
        return { success: false, error: err.message };
    }
});

// IPC handler for getting audio duration using FFmpeg
// Parameters: filePath (path to audio file)
// Returns: Object with duration in seconds, bitrate, and sample rate
ipcMain.handle('get-audio-duration', async (event, filePath) => {
    try {
        const ffmpeg = require('fluent-ffmpeg');
        console.log('Getting duration for file:', filePath);
        return new Promise((resolve, reject) => {
            ffmpeg(filePath)
                .ffprobe((err, metadata) => {
                    if (err) {
                        console.error('FFprobe error:', err);
                        reject(err);
                    } else {
                        console.log('FFprobe metadata:', JSON.stringify(metadata.format, null, 2));
                        const duration = metadata.format.duration;
                        const bitrate = metadata.format.bit_rate ? Math.round(metadata.format.bit_rate / 1000) : null;
                        const sampleRate = metadata.streams && metadata.streams[0] ? metadata.streams[0].sample_rate : null;
                        console.log('Duration from FFprobe:', duration);
                        console.log('Bitrate from FFprobe:', bitrate);
                        console.log('Sample rate from FFprobe:', sampleRate);
                        resolve({ duration: duration, bitrate: bitrate, sampleRate: sampleRate });
                    }
                });
        });
    } catch (err) {
        console.error('Error getting audio duration:', err);
        return { duration: null, bitrate: null, sampleRate: null };
    }
});

// ============================================================================
// AUDIO CONVERSION HANDLER (FFmpeg)
// ============================================================================

// IPC handler for audio conversion requests from renderer process
// This handler runs in the main process to avoid blocking the UI renderer
// Parameters:
//   - inputPath: Path to the source audio file
//   - outputPath: Path where the converted file should be saved
//   - format: Target audio format (mp3, aac, ogg, flac, wav, aiff, alac)
//   - quality: Quality setting (high, medium, low, web)
// Returns: Promise that resolves on success, rejects on error
ipcMain.handle('convert-audio', async (event, inputPath, outputPath, format, quality) => {
    const ffmpeg = require('fluent-ffmpeg');  // FFmpeg wrapper for Node.js
    const path = require('path');  // Path operations
    const fs = require('fs');  // File system operations

    console.log('Conversion request:', { inputPath, outputPath, format, quality });

    return new Promise((resolve, reject) => {
        // Validate that input file exists
        if (!inputPath || !fs.existsSync(inputPath)) {
            reject(new Error('Archivo de entrada no existe o ruta inválida'));
            return;
        }

        // Validate that output path is specified
        if (!outputPath) {
            reject(new Error('Ruta de salida no especificada'));
            return;
        }

        // Ensure output directory exists, create if needed
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            try {
                fs.mkdirSync(outputDir, { recursive: true });  // Create directory recursively
                console.log('Created output directory:', outputDir);
            } catch (err) {
                reject(new Error(`No se puede crear directorio de salida: ${err.message}`));
                return;
            }
        }

        // Check write permissions on output directory
        try {
            fs.accessSync(outputDir, fs.constants.W_OK);  // Test write access
        } catch (err) {
            reject(new Error('No hay permisos de escritura en el directorio de salida'));
            return;
        }

        // Convert to absolute paths for FFmpeg (relative paths can cause issues)
        const absoluteInputPath = path.resolve(inputPath);
        const absoluteOutputPath = path.resolve(outputPath);

        console.log('Absolute paths:', { input: absoluteInputPath, output: absoluteOutputPath });

        // Initialize FFmpeg command with input file
        let command = ffmpeg(absoluteInputPath);

        // Quality settings mapping (bitrate for lossy formats)
// Higher bitrate = better quality but larger file size
        const qualitySettings = {
            high: '320k',     // High quality - 320 kbps (near CD quality)
            medium: '192k',   // Medium quality - 192 kbps (standard quality, default)
            low: '128k',      // Low quality - 128 kbps (smaller file size)
            web: '96k'        // Web optimized - 96 kbps (smallest size, for web streaming)
        };

        // Get bitrate for selected quality (default to medium if invalid)
        const bitrate = qualitySettings[quality] || '192k';

        // Configure FFmpeg based on target format
        // Each format uses specific codec and settings
        switch (format) {
            case 'mp3':
                // MP3 format using LAME encoder
                command = command.audioCodec('libmp3lame').audioBitrate(bitrate);
                break;
            case 'aac':
                // AAC format (Advanced Audio Coding)
                command = command.audioCodec('aac').audioBitrate(bitrate);
                break;
            case 'ogg':
                // OGG Vorbis format (open source)
                command = command.audioCodec('libvorbis').audioBitrate(bitrate);
                break;
            case 'flac':
                // FLAC format (lossless compression, no bitrate needed)
                command = command.audioCodec('flac');
                break;
            case 'wav':
                // WAV format (uncompressed PCM)
                command = command.audioCodec('pcm_s16le');
                break;
            case 'aiff':
                // AIFF format (uncompressed, big-endian PCM)
                command = command.audioCodec('pcm_s16be').format('aiff');
                break;
            case 'alac':
                // ALAC format (Apple Lossless Audio Codec)
                command = command.audioCodec('alac').format('ipod');
                break;
        }

        // Set up FFmpeg event handlers for progress tracking and error handling
        command
            .on('start', (commandLine) => {
                // FFmpeg process started
                console.log('FFmpeg command:', commandLine);
                mainWindow.webContents.send('conversion-started');  // Notify renderer that conversion started
            })
            .on('progress', (progress) => {
                // Conversion progress update (fires periodically)
                const percent = Math.round(progress.percent || 0);  // Round percentage to integer
                mainWindow.webContents.send('conversion-progress', percent);  // Send progress to renderer
            })
            .on('end', () => {
                // Conversion completed successfully
                console.log('Conversion completed');
                mainWindow.webContents.send('conversion-complete');  // Notify renderer of completion
                resolve();  // Resolve the promise
            })
            .on('error', (err, stdout, stderr) => {
                // Conversion failed
                console.error('FFmpeg error:', err);
                console.error('FFmpeg stderr:', stderr);
                console.error('FFmpeg stdout:', stdout);
                mainWindow.webContents.send('conversion-error', err.message);  // Notify renderer of error
                reject(new Error(`Error en conversión: ${err.message}`));  // Reject the promise
            })
            .save(absoluteOutputPath);  // Start the conversion and save to output path
    });
});

// ============================================================================
// IPC HANDLERS - SYSTEM SHARE
// ============================================================================

// IPC handler for sharing via system dialog
// Parameters: text (text to share)
// Returns: Object with success flag
ipcMain.handle('share-via-system', async (event, text) => {
    try {
        const { exec } = require('child_process');
        const util = require('util');
        const execPromise = util.promisify(exec);
        const os = require('os');
        const platform = os.platform();

        if (platform === 'linux') {
            // Try different methods for Linux
            // Method 1: Try using xdg-open with a mailto link (most universal)
            try {
                const subject = encodeURIComponent('Compartir desde ARIA Music');
                const body = encodeURIComponent(text);
                await execPromise(`xdg-open "mailto:?subject=${subject}&body=${body}"`);
                return { success: true };
            } catch (e) {
                // Method 2: Try zenity for a simple dialog
                try {
                    await execPromise(`zenity --info --text="${text}" --title="Compartir"`);
                    return { success: true };
                } catch (e2) {
                    // Method 3: Try kdialog for KDE
                    try {
                        await execPromise(`kdialog --msgbox "${text}" --title="Compartir"`);
                        return { success: true };
                    } catch (e3) {
                        return { success: false, error: 'No se encontró método de compartir en el sistema. Instala xdg-utils, zenity o kdialog.' };
                    }
                }
            }
        } else if (platform === 'darwin') {
            // macOS - use open command
            try {
                const subject = encodeURIComponent('Compartir desde ARIA Music');
                const body = encodeURIComponent(text);
                await execPromise(`open "mailto:?subject=${subject}&body=${body}"`);
                return { success: true };
            } catch (e) {
                return { success: false, error: 'No se pudo abrir el cliente de correo en macOS.' };
            }
        } else if (platform === 'win32') {
            // Windows - use start command
            try {
                const subject = encodeURIComponent('Compartir desde ARIA Music');
                const body = encodeURIComponent(text);
                await execPromise(`start "" "mailto:?subject=${subject}&body=${body}"`);
                return { success: true };
            } catch (e) {
                return { success: false, error: 'No se pudo abrir el cliente de correo en Windows.' };
            }
        } else {
            return { success: false, error: 'Plataforma no soportada para compartir.' };
        }
    } catch (error) {
        console.error('System share error:', error);
        return { success: false, error: error.message };
    }
});

// ============================================================================
// BACKUP EXPORT/IMPORT
// ============================================================================

// IPC handler for exporting collections backup
// Parameters: collections (array of collection objects)
// Returns: Object with success flag and error message if failed
ipcMain.handle('export-backup', async (event, collections) => {
    try {
        const dialog = require('electron').dialog;
        const fs = require('fs');
        const path = require('path');

        // Show save dialog for backup file
        const result = await dialog.showSaveDialog(mainWindow, {
            title: 'Exportar Backup de Colecciones',
            defaultPath: 'ARIA-Music-Backup.json',
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePath) {
            return { success: false, error: 'Dialog canceled' };
        }

        // Prepare backup data with collections and their tracks
        const backupData = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            collections: collections.map(collection => ({
                name: collection.name,
                playlist: collection.playlist.map(track => ({
                    path: track.path,
                    fileName: track.fileName,
                    title: track.title,
                    artist: track.artist,
                    album: track.album,
                    duration: track.duration,
                    coverPath: track.coverPath,
                    coverData: track.coverData
                }))
            }))
        };

        // Write backup file
        fs.writeFileSync(result.filePath, JSON.stringify(backupData, null, 2));

        return { success: true, filePath: result.filePath };
    } catch (error) {
        console.error('Backup export error:', error);
        return { success: false, error: error.message };
    }
});

// IPC handler for importing collections backup
// Returns: Object with success flag and collections data
ipcMain.handle('import-backup', async () => {
    try {
        const dialog = require('electron').dialog;
        const fs = require('fs');

        // Show open dialog for backup file
        const result = await dialog.showOpenDialog(mainWindow, {
            title: 'Importar Backup de Colecciones',
            properties: ['openFile'],
            filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        });

        if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
            return { success: false, error: 'Dialog canceled' };
        }

        const filePath = result.filePaths[0];

        // Read and parse backup file
        const backupData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Validate backup structure
        if (!backupData.collections || !Array.isArray(backupData.collections)) {
            return { success: false, error: 'Invalid backup file structure' };
        }

        return { success: true, collections: backupData.collections };
    } catch (error) {
        console.error('Backup import error:', error);
        return { success: false, error: error.message };
    }
});
