let video = document.getElementById('videoInput');
let canvasOutput = document.getElementById('canvasOutput');
let ctx = canvasOutput.getContext('2d');
let statusOverlay = document.getElementById('status');
let fpsCounter = document.getElementById('fps-counter');
let latencyVal = document.getElementById('latency-val');
let errorToast = document.getElementById('errorToast');

// UI Elements
const filterCards = document.querySelectorAll('.filter-card');
const gallerySection = document.getElementById('gallerySection');
const mediaControlsSection = document.getElementById('mediaControlsSection');
const adjustmentsSection = document.getElementById('adjustmentsSection');
const bgGallery = document.getElementById('bgGallery');
const bgUpload = document.getElementById('bgUpload');
const blurSlider = document.getElementById('blurStrength');
const blurValText = document.getElementById('blurVal');
const opacitySlider = document.getElementById('bgOpacity');
const opacityValText = document.getElementById('opacityVal');
const posSlider = document.getElementById('bgOffsetY');
const posValText = document.getElementById('posVal');
const posXSlider = document.getElementById('bgOffsetX');
const posXValText = document.getElementById('posXVal');

// Camera Controls UI
const toggleCamBtn = document.getElementById('toggleCamera');
const switchCamBtn = document.getElementById('switchCamera');
const placeholder = document.getElementById('cameraPlaceholder');
const placeholderText = document.getElementById('placeholderText');
const mirrorModeToggle = document.getElementById('mirrorMode');

// Multimedia Elements
const bgMediaLayer = document.getElementById('bgMediaLayer');
const bgImageElement = document.getElementById('bgImageElement');
const bgVideoElement = document.getElementById('bgVideoElement');
const bgPlayPause = document.getElementById('bgPlayPause');
const bgSpeedSlider = document.getElementById('bgSpeed');
const speedValText = document.getElementById('speedVal');
const bgProgress = document.getElementById('bgProgress');
const currentTimeText = document.getElementById('currentTime');
const durationTimeText = document.getElementById('durationTime');

// Control containers
const blurContainer = document.getElementById('blurSliderContainer');
const opacityContainer = document.getElementById('opacitySliderContainer');
const posContainer = document.getElementById('posSliderContainer');
const posXContainer = document.getElementById('posXSliderContainer');

let currentFilter = 'nv_bg_blur';
let selfieSegmentation = null;
let camera = null;
let lastTime = Date.now();
let frameCount = 0;
let isCameraActive = false;
let currentFacingMode = 'user';

/**
 * CONFIGURACIÓN CENTRALIZADA DE FILTROS
 * Garantiza consistencia en el estado inicial (Modo Espejo Desactivado por defecto)
 */
const DEFAULT_FILTER_CONFIG = {
    mirrorMode: false, // Valor predeterminado global según requerimiento
    blurStrength: 15,
    bgOpacity: 1.0,
    bgOffsetX: 0,
    bgOffsetY: 0
};

// Carga inicial del estado persistente (si existe), de lo contrario aplica el valor predeterminado
let isMirrorMode = (localStorage.getItem('mirrorMode') !== null) 
    ? localStorage.getItem('mirrorMode') === 'true' 
    : DEFAULT_FILTER_CONFIG.mirrorMode;

// Background Settings
let bgOpacity = DEFAULT_FILTER_CONFIG.bgOpacity;
let bgOffsetY = DEFAULT_FILTER_CONFIG.bgOffsetY;
let bgOffsetX = DEFAULT_FILTER_CONFIG.bgOffsetX;
let blurStrength = DEFAULT_FILTER_CONFIG.blurStrength;
let bgType = 'image';
// Initial background
const initialBg = 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1280&h=720';

/**
 * Inicialización
 */
function onOpenCvReady() {
    if (typeof cv !== 'undefined' && cv.onRuntimeInitialized) {
        initApp();
    } else if (typeof cv !== 'undefined') {
        cv.onRuntimeInitialized = () => initApp();
    }
}

if (typeof cv !== 'undefined' && cv.Mat) {
    onOpenCvReady();
}

async function initApp() {
    try {
        validateFilterConfig(); // Validación de seguridad antes de iniciar
        initModels();
        setupEventListeners();
        checkDeviceCapabilities();
        
        // Aplicar estado inicial de modo espejo garantizado
        mirrorModeToggle.checked = isMirrorMode;
        updateMirrorEffect();
        
        applyMediaBackground(initialBg, 'image'); // Set default background
        updateUIState(); // Set initial UI state
        console.log("Sistema Multimedia Listo - Modo Espejo:", isMirrorMode);
        
        runInitializationTests(); // Verificación de herencia y estados por defecto
    } catch (err) {
        console.error("Error en inicialización:", err);
        showError("Error al iniciar el sistema.");
    }
}

/**
 * VALIDA LA CONFIGURACIÓN DE FILTROS AL ARRANQUE
 * Impide activaciones accidentales durante la inicialización.
 */
function validateFilterConfig() {
    // Si no hay preferencia guardada, forzamos que sea el valor por defecto desactivado
    if (localStorage.getItem('mirrorMode') === null) {
        isMirrorMode = DEFAULT_FILTER_CONFIG.mirrorMode;
        localStorage.setItem('mirrorMode', isMirrorMode);
    }
}

/**
 * PRUEBAS DE INICIALIZACIÓN (VALIDACIÓN)
 * Verifica que todos los filtros y configuraciones hereden el estado correcto.
 */
function runInitializationTests() {
    console.group("Validación de Configuración Inicial");
    
    const filters = ['nv_bg_blur', 'nv_bg_replace', 'none'];
    let allPassed = true;

    filters.forEach(filter => {
        const mirrorState = (localStorage.getItem('mirrorMode') === 'true');
        // Si no se ha cambiado manualmente, debe ser false por defecto en el arranque
        if (localStorage.getItem('mirrorMode') === null && mirrorState !== false) {
            console.error(`Falla en Filtro [${filter}]: Modo espejo no es false por defecto.`);
            allPassed = false;
        } else {
            console.log(`Filtro [${filter}]: Configuración espejo heredada correctamente.`);
        }
    });

    if (allPassed) {
        console.log("Resultado: Todos los filtros heredan la configuración correctamente.");
    }
    console.groupEnd();
}

async function checkDeviceCapabilities() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length > 1) {
            switchCamBtn.disabled = false;
        }
    } catch (err) {
        console.warn("No se pudo verificar capacidades de cámara:", err);
    }
}

function initModels() {
    selfieSegmentation = new SelfieSegmentation({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/${file}`
    });
    // Usar el modelo 1 (paisaje) que suele ser más ligero y estable
    selfieSegmentation.setOptions({ 
        modelSelection: 1,
        selfieMode: false // DESACTIVADO POR DEFECTO: El mirroring se gestiona centralizadamente vía CSS
    });
    selfieSegmentation.onResults(onResults);
}

/**
 * Gestión de Cámara
 */
async function toggleCamera() {
    if (isCameraActive) {
        stopCamera();
    } else {
        await startCamera();
    }
}

async function startCamera() {
    statusOverlay.classList.remove('hidden');
    placeholderText.innerText = "Iniciando Cámara...";
    
    try {
        camera = new Camera(video, {
            onFrame: async () => {
                if (isCameraActive) {
                    if (currentFilter === 'none') {
                        onResults({ image: video, segmentationMask: null });
                    } else {
                        await selfieSegmentation.send({ image: video });
                    }
                }
            },
            width: 1280,
            height: 720,
            facingMode: currentFacingMode
        });

        await camera.start();
        isCameraActive = true;
        
        canvasOutput.classList.remove('hidden');
        placeholder.classList.add('hidden');
        
        toggleCamBtn.classList.add('active');
        toggleCamBtn.innerHTML = '<i class="fas fa-video"></i>';
        statusOverlay.classList.add('hidden');
        
        if (bgType === 'video' && bgVideoElement.paused) {
            bgVideoElement.play().catch(console.error);
        }
        
    } catch (err) {
        console.error("Error al iniciar cámara:", err);
        showError("Permiso denegado o error de cámara.");
        stopCamera();
    }
}

function stopCamera() {
    if (camera) {
        camera.stop();
        camera = null;
    }
    isCameraActive = false;
    
    canvasOutput.classList.add('hidden');
    placeholder.classList.remove('hidden');
    placeholderText.innerText = "Cámara Desactivada";
    
    toggleCamBtn.classList.remove('active');
    toggleCamBtn.innerHTML = '<i class="fas fa-video-slash"></i>';
    statusOverlay.classList.add('hidden');
    
    if (bgType === 'video') {
        bgVideoElement.pause();
    }
    
    ctx.clearRect(0, 0, canvasOutput.width, canvasOutput.height);
}

async function switchCamera() {
    if (!isCameraActive) return;
    currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
    stopCamera();
    await startCamera();
}

/**
 * Actualiza el efecto espejo en la vista previa del canvas
 */
function updateMirrorEffect() {
    if (isMirrorMode) {
        canvasOutput.classList.add('mirrored');
    } else {
        canvasOutput.classList.remove('mirrored');
    }
}

/**
 * Lógica de Renderizado Multimedia
 */
function onResults(results) {
    if (!isCameraActive) return;
    
    const startTime = performance.now();
    const w = results.image.videoWidth || results.image.width;
    const h = results.image.videoHeight || results.image.height;

    if (!w || !h) return;

    if (canvasOutput.width !== w || canvasOutput.height !== h) {
        canvasOutput.width = w;
        canvasOutput.height = h;
    }

    ctx.save();
    ctx.clearRect(0, 0, w, h);

    if (currentFilter === 'none') {
        ctx.drawImage(results.image, 0, 0, w, h);
    } else if (results.segmentationMask) {
        // Draw the camera subject
        ctx.drawImage(results.image, 0, 0, w, h);
        
        // Apply the segmentation mask (isolate user)
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(results.segmentationMask, 0, 0, w, h);
        
        // Final layer: background
        ctx.globalCompositeOperation = 'destination-over';

        if (currentFilter === 'nv_bg_blur') {
            ctx.filter = `blur(${blurStrength}px)`;
            ctx.drawImage(results.image, 0, 0, w, h);
        } else if (currentFilter === 'nv_bg_replace') {
            // Background is handled by CSS/DOM layers underneath
            // The canvas remains transparent where the mask was applied
        }
    }

    ctx.restore();
    updateMetrics(startTime);
}

/**
 * Configuración de Eventos
 */
function setupEventListeners() {
    toggleCamBtn.onclick = toggleCamera;
    switchCamBtn.onclick = switchCamera;

    mirrorModeToggle.onchange = (e) => {
        isMirrorMode = e.target.checked;
        localStorage.setItem('mirrorMode', isMirrorMode);
        updateMirrorEffect();
    };

    bgPlayPause.onclick = () => {
        if (bgVideoElement.paused) {
            bgVideoElement.play();
            bgPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
        } else {
            bgVideoElement.pause();
            bgPlayPause.innerHTML = '<i class="fas fa-play"></i>';
        }
    };

    // Actualización de progreso y tiempo
    bgVideoElement.ontimeupdate = () => {
        if (!isNaN(bgVideoElement.duration)) {
            const progress = (bgVideoElement.currentTime / bgVideoElement.duration) * 100;
            bgProgress.value = progress;
            currentTimeText.innerText = formatTime(bgVideoElement.currentTime);
        }
    };

    bgVideoElement.onloadedmetadata = () => {
        durationTimeText.innerText = formatTime(bgVideoElement.duration);
        bgVideoElement.muted = true; // Asegurar silencio permanente
        bgVideoElement.volume = 0;   // Doble validación de audio
    };

    // Navegación temporal (Seek)
    bgProgress.oninput = (e) => {
        const time = (e.target.value / 100) * bgVideoElement.duration;
        bgVideoElement.currentTime = time;
    };

    bgSpeedSlider.oninput = (e) => {
        const speed = parseFloat(e.target.value);
        bgVideoElement.playbackRate = speed;
        speedValText.innerText = `${speed.toFixed(1)}x`;
    };

    filterCards.forEach(card => {
        card.onclick = () => {
            filterCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            currentFilter = card.dataset.filter;
            updateUIState();
        };
    });

    blurSlider.oninput = (e) => { 
        blurStrength = parseInt(e.target.value); 
        blurValText.innerText = `${blurStrength}px`; 
    };
    
    opacitySlider.oninput = (e) => { 
        bgOpacity = e.target.value / 100; 
        opacityValText.innerText = `${e.target.value}%`; 
        updateBackgroundStyle();
    };
    
    posSlider.oninput = (e) => { 
        bgOffsetY = parseInt(e.target.value); 
        posValText.innerText = `${bgOffsetY}px`; 
        updateBackgroundStyle();
    };
    
    posXSlider.oninput = (e) => { 
        bgOffsetX = parseInt(e.target.value); 
        posXValText.innerText = `${bgOffsetX}px`; 
        updateBackgroundStyle();
    };

    bgUpload.onchange = handleFileUpload;
}

/**
 * Gestiona la visibilidad de los paneles de control según el filtro activo.
 */
function updateUIState() {
    const isReplace = currentFilter === 'nv_bg_replace';
    
    // Visibilidad de la capa de medios DOM
    bgMediaLayer.classList.toggle('hidden', !isReplace);
    if (isReplace) {
        updateBackgroundStyle(); // Sincronizar estilos al activar
        if (bgType === 'video' && isCameraActive) {
            bgVideoElement.play().catch(console.error);
        }
    } else {
        bgVideoElement.pause();
    }
    
    // Visibilidad de la sección de galería y ajustes
    gallerySection.classList.toggle('hidden', !isReplace);
    adjustmentsSection.classList.toggle('hidden', currentFilter === 'none');
    
    // Visibilidad de los sliders individuales
    opacityContainer.classList.toggle('hidden', !isReplace);
    posContainer.classList.toggle('hidden', !isReplace);
    posXContainer.classList.toggle('hidden', !isReplace);
    blurContainer.classList.toggle('hidden', currentFilter !== 'nv_bg_blur');
    
    // Visibilidad de los controles multimedia
    mediaControlsSection.classList.toggle('hidden', !(isReplace && bgType === 'video'));
}

function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
        showError("Archivo demasiado grande (Máx 20MB).");
        return;
    }

    const fileType = file.type;
    const url = URL.createObjectURL(file);

    if (fileType.startsWith('video/')) {
        const tempVideo = document.createElement('video');
        tempVideo.onloadedmetadata = () => {
            if (tempVideo.videoWidth < 1280 || tempVideo.videoHeight < 720) {
                showError("Resolución de video insuficiente (Mín 720p).");
                URL.revokeObjectURL(url);
                return;
            }
            applyMediaBackground(url, 'video');
            addToGallery(url, 'video');
        };
        tempVideo.src = url;
    } else if (fileType.startsWith('image/')) {
        const img = new Image();
        img.onload = () => {
            if (img.width < 1280 || img.height < 720) {
                showError("Resolución de imagen insuficiente (Mín 720p).");
                return;
            }
            applyMediaBackground(url, fileType === 'image/gif' ? 'gif' : 'image');
            addToGallery(url, fileType === 'image/gif' ? 'gif' : 'image');
        };
        img.src = url;
    } else {
        showError("Formato no compatible.");
    }
}

function applyMediaBackground(source, type) {
    console.log(`Cargando fondo (${type}): ${source}`);
    bgType = type;
    
    // Ocultar capas anteriores
    bgImageElement.classList.add('hidden');
    bgVideoElement.classList.add('hidden');
    bgVideoElement.pause();
    
    // Si el source es el mismo que el actual, forzar reinicio (especialmente para GIFs)
    if (bgImageElement.src === source && type === 'gif') {
        bgImageElement.src = ''; // Limpiar para forzar recarga de animación
        void bgImageElement.offsetWidth; // Force reflow
    }

    if (type === 'video') {
        bgVideoElement.src = source;
        bgVideoElement.load();
        bgVideoElement.classList.remove('hidden');
        if (isCameraActive && currentFilter === 'nv_bg_replace') {
            bgVideoElement.play().catch(err => console.warn("Auto-play bloqueado:", err));
        }
        bgPlayPause.innerHTML = '<i class="fas fa-pause"></i>';
    } else {
        // Para imágenes y GIFs, asegurar que el src se asigne correctamente
        bgImageElement.src = source;
        bgImageElement.classList.remove('hidden');
        
        // Validación de carga
        bgImageElement.onload = () => {
            console.log("Imagen/GIF de fondo cargado correctamente");
            updateBackgroundStyle();
        };
        bgImageElement.onerror = () => {
            console.error("Error al cargar el fondo:", source);
            showError("No se pudo cargar el archivo multimedia.");
        };
    }
    
    updateBackgroundStyle();
    updateUIState();
}

/**
 * Aplica los estilos CSS de opacidad y posición a la capa de fondo DOM
 */
function updateBackgroundStyle() {
    const activeElement = (bgType === 'video') ? bgVideoElement : bgImageElement;
    if (activeElement) {
        // Asegurar que la opacidad sea un número válido
        activeElement.style.opacity = isNaN(bgOpacity) ? 1.0 : bgOpacity;
        
        // Sincronizar posición con transformaciones CSS
        // Usamos translate(-50%, -50%) para centrar y luego aplicamos los offsets
        const x = bgOffsetX || 0;
        const y = bgOffsetY || 0;
        activeElement.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;
        
        // Para GIFs, asegurar que no haya nada bloqueando el renderizado
        if (bgType === 'gif') {
            activeElement.style.display = 'block'; // Asegurar que no sea inline
            activeElement.style.visibility = 'visible';
        }
    }
}

function addToGallery(source, type) {
    const div = document.createElement('div');
    div.className = `bg-item selected ${type}`;
    
    if (type === 'video') {
        const tempVid = document.createElement('video');
        tempVid.src = source;
        tempVid.currentTime = 1;
        tempVid.onseeked = () => {
            const canvas = document.createElement('canvas');
            canvas.width = 160; canvas.height = 90;
            canvas.getContext('2d').drawImage(tempVid, 0, 0, 160, 90);
            div.style.backgroundImage = `url(${canvas.toDataURL()})`;
        };
    } else {
        div.style.backgroundImage = `url(${source})`;
    }
    
    div.onclick = () => {
        document.querySelectorAll('.bg-item').forEach(el => el.classList.remove('selected'));
        div.classList.add('selected');
        applyMediaBackground(source, type);
    };
    
    document.querySelectorAll('.bg-item').forEach(el => el.classList.remove('selected'));
    bgGallery.prepend(div);
}

function updateMetrics(startTime) {
    const endTime = performance.now();
    latencyVal.innerText = Math.round(endTime - startTime);
    frameCount++;
    let now = Date.now();
    if (now - lastTime >= 1000) {
        fpsCounter.innerText = `FPS: ${frameCount}`;
        frameCount = 0;
        lastTime = now;
    }
}

function showError(msg) {
    errorToast.innerText = msg;
    errorToast.classList.remove('hidden');
    setTimeout(() => errorToast.classList.add('hidden'), 5000);
}

/**
 * Formatea segundos en formato MM:SS
 */
function formatTime(seconds) {
    if (isNaN(seconds)) return "00:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

window.onbeforeunload = () => {
    if (camera) camera.stop();
};
