# ARIA Music Player

Un reproductor de audio universal estilo AIMP, desarrollado con Electron para multiplataforma.

---

## 📋 Información del Proyecto

### Creador
**La Tribu De Los Libres**  
Costa Rica

### Desarrollador
**Kenneth Ruiz**  
Email: lthikingcr@gmail.com

### Licencia
**Código Abierto** - Para toda la comunidad

---

## 🏗️ Estructura del Proyecto

```
audioplayer/
├── main.js              # Proceso principal de Electron
├── renderer.js          # Proceso de renderizado (UI)
├── index.html           # Estructura HTML de la interfaz
├── styles.css           # Estilos CSS de la interfaz
├── translations.js      # Sistema de internacionalización (i18n)
├── package.json         # Configuración del proyecto y dependencias
└── README.md            # Documentación del proyecto
```

---

## 💻 Tecnologías y Lenguajes

### Lenguajes de Programación
- **JavaScript** - Lógica principal de la aplicación
- **HTML5** - Estructura de la interfaz de usuario
- **CSS3** - Estilos y diseño visual

### Frameworks y Librerías
- **Electron v28.0.0** - Framework para aplicaciones de escritorio
- **@ffmpeg/ffmpeg v0.12.10** - Conversión de audio
- **@ffmpeg/util v0.12.1** - Utilidades para FFmpeg
- **fluent-ffmpeg v2.1.2** - Wrapper de FFmpeg
- **music-metadata v8.1.4** - Extracción de metadatos de audio
- **music-metadata-browser v2.2.6** - Metadatos en navegador
- **sharp v0.35.3** - Procesamiento de imágenes

### Herramientas de Construcción
- **electron-builder v24.13.3** - Empaquetado de la aplicación

---

## 🎨 Diseño y Funcionalidad

### Características Principales

#### 1. Reproducción de Audio
- Soporte para múltiples formatos de audio (MP3, WAV, FLAC, OGG, AAC, etc.)
- Controles de reproducción: Play, Pause, Stop, Previous, Next
- Shuffle (aleatorio) y Repeat (repetir)
- Visualizador de espectro de audio en tiempo real
- Crossfade entre pistas

#### 2. Gestión de Colecciones
- Sistema multi-colección para organizar música
- Creación y eliminación de colecciones
- Edición de nombres de colecciones
- Contador de pistas por colección

#### 3. Sistema de Favoritos
- Marcar pistas como favoritos con icono de corazón
- Lista de favoritos independiente
- Reproducción exclusiva de favoritos
- Sincronización automática con la lista principal

#### 4. Ecualizador de 5 Bandas
- Bandas de frecuencia: 60Hz, 250Hz, 1kHz, 4kHz, 12kHz
- Presets predefinidos: Plano, Pop, Rock, Balada, Acústico
- Modos: Default, Custom, Pre-programado
- Guardar configuraciones personalizadas

#### 5. Conversión de Audio
- Conversión entre múltiples formatos
- Calidad ajustable (Alta 320kbps, Media 192kbps, Baja 128kbps, Web 96kbps)
- Selección de ruta de salida personalizada
- Progreso de conversión en tiempo real

#### 6. Edición de Metadatos
- Edición de título, artista, álbum
- Extracción automática de portadas de álbum
- Vista de información detallada de pistas

#### 7. Compartir
- Opciones para compartir pistas vía diferentes plataformas
- Email, Facebook, KDE Connect, WhatsApp, Signal

#### 8. Interfaz de Usuario
- Diseño moderno y responsivo
- Modo claro/oscuro
- Visualización de portadas de álbum
- Pantalla completa de portada
- Atajos de teclado configurables

---

## 🌍 Internacionalización (i18n)

La aplicación soporta 9 idiomas:

1. **Español (es)** - Idioma predeterminado
2. **English (en)**
3. **Português (pt)**
4. **Français (fr)**
5. **Deutsch (de)**
6. **Italiano (it)**
7. **Русский (ru)**
8. **中文 (zh)**
9. **日本語 (ja)**

### Sistema de Traducción
- Archivo centralizado `translations.js` con todas las traducciones
- Cambio dinámico de idioma sin reiniciar la aplicación
- Atributos `data-i18n` en HTML para marcado de elementos traducibles
- Función `updateLanguage()` en `renderer.js` para aplicar traducciones

---

## 📦 Fragmentación y Arquitectura

### Arquitectura de Electron

#### Proceso Principal (Main Process)
- **Archivo**: `main.js`
- **Responsabilidades**:
  - Gestión de ventanas
  - Manejo de eventos del sistema
  - Comunicación IPC con el proceso de renderizado
  - Operaciones de sistema de archivos

#### Proceso de Renderizado (Renderer Process)
- **Archivo**: `renderer.js`
- **Responsabilidades**:
  - Lógica de la interfaz de usuario
  - Manipulación del DOM
  - Eventos de usuario
  - Reproducción de audio (Web Audio API)
  - Visualización de espectro

#### Comunicación IPC
- `invoke/handle` para llamadas síncronas
- `send/on` para eventos asíncronos
- Canales de comunicación para operaciones de archivo y audio

---

## 🚀 Instalación y Ejecución

### Requisitos Previos
- Node.js (v16 o superior)
- npm (gestor de paquetes de Node)

### Instalación
```bash
# Clonar el repositorio
git clone https://github.com/kerm1977/audioplayer.git
cd audioplayer

# Instalar dependencias
npm install
```

### Ejecución en Modo Desarrollo
```bash
npm start
```

### Construcción para Producción
```bash
# Construir para Linux (DEB)
npm run build:deb

# Construir para Linux (AppImage)
npm run build:appimage

# Construir para Linux (RPM)
npm run build:rpm

# Construir para todas las plataformas
npm run build
```

---

## 📝 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `npm start` | Ejecutar la aplicación en modo desarrollo |
| `npm run dev` | Ejecutar con flags de desarrollo |
| `npm run build` | Construir para todas las plataformas |
| `npm run build:deb` | Construir paquete DEB para Linux |
| `npm run build:appimage` | Construir AppImage para Linux |
| `npm run build:rpm` | Construir paquete RPM para Linux |

---

## 🎯 Funcionalidades Técnicas

### Sistema de Audio
- **Web Audio API** - Reproducción y procesamiento de audio
- **FFT (Fast Fourier Transform)** - Análisis de espectro
- **GainNodes** - Control de ganancia por banda de frecuencia

### Gestión de Estado
- **localStorage** - Persistencia de configuraciones
- **Estado guardado**:
  - Volumen
  - Ecualizador (presets y ganancias)
  - Modo de ecualizador
  - Estado de colapso de headers
  - Lista de colecciones
  - Favoritos

### Sistema de Archivos
- **Electron API** - Acceso a sistema de archivos
- **Dialog API** - Selección de archivos y directorios
- **Path API** - Manipulación de rutas

---

## 🔧 Configuración

### Configuración de Electron Builder
```json
{
  "appId": "com.audioplayer.app",
  "productName": "AudioPlayer",
  "directories": {
    "output": "dist"
  },
  "linux": {
    "target": ["deb", "AppImage", "rpm"],
    "category": "Audio"
  }
}
```

---

## 📄 Licencia

Este proyecto es **Código Abierto** y está disponible para toda la comunidad.

---

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:
1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

---

## 📧 Contacto

Para cualquier consulta o sugerencia:
- **Email**: lthikingcr@gmail.com
- **GitHub**: https://github.com/kerm1977/audioplayer

---

## 🙏 Agradecimientos

Desarrollado con ❤️ por **La Tribu De Los Libres** desde **Costa Rica** para toda la comunidad de amantes de la música.

---

**Versión**: 1.0.0  
**Última actualización**: 2026
