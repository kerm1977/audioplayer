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

const { app, BrowserWindow, ipcMain, dialog, Menu, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// Global reference to the main window
let mainWindow;

// ============================================================================
// WINDOW CREATION AND LIFECYCLE
// ============================================================================

// Create and configure the main application window
function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1000,        // Initial width
        height: 720,        // Initial height
        minWidth: 960,      // Minimum width - prevents layout deformation
        minHeight: 660,     // Minimum height - prevents layout deformation
        maxWidth: 1600,     // Maximum width
        maxHeight: 1080,    // Maximum height
        title: 'PMOS Music',  // Window title
        frame: false,         // Remove native frame for custom rounded corners
        transparent: true,    // Allow transparency for rounded corners
        webPreferences: {
            nodeIntegration: true,           // Enable Node.js integration in renderer
            contextIsolation: false,         // Disable context isolation (for compatibility)
            enableRemoteModule: true         // Enable remote module
        }
        // icon: path.join(__dirname, 'assets', 'icon.png')  // Application icon - commented out (assets folder missing)
    });

    // Load the HTML file
    mainWindow.loadFile('index.html');

    // Open DevTools for debugging (commented out to prevent immediate close)
    // mainWindow.webContents.openDevTools();

    // Notify renderer when window is maximized/restored
    mainWindow.on('maximize', () => {
        if (mainWindow) mainWindow.webContents.send('window-maximized');
    });
    mainWindow.on('unmaximize', () => {
        if (mainWindow) mainWindow.webContents.send('window-unmaximized');
    });

    // Clean up window reference when closed
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

// Build native application menu
function createMenu() {
    const menuTemplate = [
        {
            label: 'Archivo',
            submenu: [
                {
                    label: 'Agregar Archivos',
                    click: () => { mainWindow.webContents.send('menu-add-files'); }
                },
                {
                    label: 'Agregar Colección',
                    click: () => { mainWindow.webContents.send('menu-add-folder'); }
                },
                { type: 'separator' },
                {
                    label: 'Salir',
                    accelerator: 'CmdOrCtrl+Q',
                    click: () => { app.quit(); }
                }
            ]
        },
        {
            label: 'Reproducción',
            submenu: [
                {
                    label: 'Reproducir / Pausar',
                    click: () => { mainWindow.webContents.send('menu-play-pause'); }
                },
                {
                    label: 'Anterior',
                    click: () => { mainWindow.webContents.send('menu-previous'); }
                },
                {
                    label: 'Siguiente',
                    click: () => { mainWindow.webContents.send('menu-next'); }
                }
            ]
        },
        {
            label: 'Ayuda',
            submenu: [
                {
                    label: 'Acerca de PMOS Music',
                    click: () => { mainWindow.webContents.send('menu-open-help'); }
                },
                { type: 'separator' },
                {
                    label: 'Consola de Desarrollador',
                    accelerator: 'CmdOrCtrl+Shift+I',
                    click: () => {
                        if (mainWindow) {
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

    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
}

// Create window when Electron is ready
app.whenReady().then(() => {
    createWindow();
    createMenu();
});

// Quit when all windows are closed (except on macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// IPC handlers for custom window controls
ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize(); });

let savedBounds = null;
let isManuallyMaximized = false;
ipcMain.on('window-maximize', () => {
    if (!mainWindow) return;
    if (isManuallyMaximized || mainWindow.isMaximized()) {
        isManuallyMaximized = false;
        if (savedBounds) mainWindow.setBounds(savedBounds);
        mainWindow.unmaximize();
        mainWindow.webContents.send('window-unmaximized');
    } else {
        savedBounds = mainWindow.getBounds();
        const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
        mainWindow.setBounds({ x, y, width, height });
        isManuallyMaximized = true;
        mainWindow.webContents.send('window-maximized');
    }
});
ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close(); });

// Toggle DevTools
ipcMain.on('toggle-devtools', () => {
    if (mainWindow) {
        if (mainWindow.webContents.isDevToolsOpened()) {
            mainWindow.webContents.closeDevTools();
        } else {
            mainWindow.webContents.openDevTools();
        }
    }
});

// On macOS, recreate window when dock icon is clicked and no windows are open
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ============================================================================
// IPC HANDLERS - FILE OPERATIONS
// ============================================================================

// Handle file selection dialog (allows multiple files)
ipcMain.handle('select-files', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile', 'multiSelections'],  // Allow multiple file selection
        filters: [
            { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled) {
        return result.filePaths;  // Return array of selected file paths
    }
    return [];
});

// Handle folder selection dialog
ipcMain.handle('select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']  // Directory selection only
    });

    if (!result.canceled) {
        return result.filePaths[0];  // Return selected folder path
    }
    return null;
});

// Save/load app state
const STATE_FILE = path.join(app.getPath('userData'), 'player-state.json');
ipcMain.handle('load-state', () => {
    try {
        if (fs.existsSync(STATE_FILE)) return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    } catch (e) {}
    return null;
});
ipcMain.handle('save-state', (event, state) => {
    try { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); } catch (e) {}
});

// Handle image selection dialog (for custom cover art)
ipcMain.handle('select-image', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [
            { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled) {
        return result.filePaths[0];
    }
    return null;
});

// Handle save dialog for audio conversion output
ipcMain.handle('select-save-path', async () => {
    const result = await dialog.showSaveDialog(mainWindow, {
        filters: [
            { name: 'Audio Files', extensions: ['wav', 'aiff', 'flac', 'm4a', 'mp3', 'aac', 'ogg'] },
            { name: 'All Files', extensions: ['*'] }
        ]
    });

    if (!result.canceled) {
        return result.filePath;  // Return selected save path
    }
    return null;
});

// ============================================================================
// AUDIO CONVERSION HANDLER (FFmpeg)
// ============================================================================

// Handle audio conversion requests from renderer process
// Runs in main process to avoid blocking the UI
ipcMain.handle('convert-audio', async (event, inputPath, outputPath, format, quality) => {
    const ffmpeg = require('fluent-ffmpeg');
    const path = require('path');
    const fs = require('fs');

    console.log('Conversion request:', { inputPath, outputPath, format, quality });

    return new Promise((resolve, reject) => {
        // Validate input file exists
        if (!inputPath || !fs.existsSync(inputPath)) {
            reject(new Error('Archivo de entrada no existe o ruta inválida'));
            return;
        }

        // Validate output path is specified
        if (!outputPath) {
            reject(new Error('Ruta de salida no especificada'));
            return;
        }

        // Ensure output directory exists, create if needed
        const outputDir = path.dirname(outputPath);
        if (!fs.existsSync(outputDir)) {
            try {
                fs.mkdirSync(outputDir, { recursive: true });
                console.log('Created output directory:', outputDir);
            } catch (err) {
                reject(new Error(`No se puede crear directorio de salida: ${err.message}`));
                return;
            }
        }

        // Check write permissions on output directory
        try {
            fs.accessSync(outputDir, fs.constants.W_OK);
        } catch (err) {
            reject(new Error('No hay permisos de escritura en el directorio de salida'));
            return;
        }

        // Convert to absolute paths for FFmpeg
        const absoluteInputPath = path.resolve(inputPath);
        const absoluteOutputPath = path.resolve(outputPath);

        console.log('Absolute paths:', { input: absoluteInputPath, output: absoluteOutputPath });

        let command = ffmpeg(absoluteInputPath);

        // Quality settings (bitrate for lossy formats)
        const qualitySettings = {
            high: '320k',     // High quality - 320 kbps
            medium: '192k',   // Medium quality - 192 kbps (default)
            low: '128k',      // Low quality - 128 kbps
            web: '96k'        // Web optimized - 96 kbps
        };

        const bitrate = qualitySettings[quality] || '192k';

        // Configure FFmpeg based on target format
        switch (format) {
            case 'mp3':
                command = command.audioCodec('libmp3lame').audioBitrate(bitrate);
                break;
            case 'aac':
                command = command.audioCodec('aac').audioBitrate(bitrate);
                break;
            case 'ogg':
                command = command.audioCodec('libvorbis').audioBitrate(bitrate);
                break;
            case 'flac':
                command = command.audioCodec('flac');  // Lossless, no bitrate needed
                break;
            case 'wav':
                command = command.audioCodec('pcm_s16le');  // Uncompressed PCM
                break;
            case 'aiff':
                command = command.audioCodec('pcm_s16be').format('aiff');  // AIFF format
                break;
            case 'alac':
                command = command.audioCodec('alac').format('ipod');  // Apple Lossless
                break;
        }

        // Set up FFmpeg event handlers for progress tracking
        command
            .on('start', (commandLine) => {
                console.log('FFmpeg command:', commandLine);
                mainWindow.webContents.send('conversion-started');  // Notify renderer
            })
            .on('progress', (progress) => {
                const percent = Math.round(progress.percent || 0);
                mainWindow.webContents.send('conversion-progress', percent);  // Send progress to renderer
            })
            .on('end', () => {
                console.log('Conversion completed');
                mainWindow.webContents.send('conversion-complete');  // Notify renderer of completion
                resolve();
            })
            .on('error', (err, stdout, stderr) => {
                console.error('FFmpeg error:', err);
                console.error('FFmpeg stderr:', stderr);
                console.error('FFmpeg stdout:', stdout);
                mainWindow.webContents.send('conversion-error', err.message);  // Notify renderer of error
                reject(new Error(`Error en conversión: ${err.message}`));
            })
            .save(absoluteOutputPath);  // Start conversion
    });
});
