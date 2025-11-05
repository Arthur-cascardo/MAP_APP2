console.log('Starting context menu initialization...');
console.log('Looking for map div ID: {{MAP_DIV_ID}}');
console.log('Expected map variable: {{MAP_VAR_NAME}}');

var globalMap = null;
var rightClickCoords = null;
var contextMenuElement = null;
var setupAttempts = 0;
var maxSetupAttempts = 50;

// OPTIMIZATION: Removed visibleMarkersInterval - no more 1-second polling!
// Instead, we update only on map move/zoom events

// Store marker data for visibility checking
var allMarkersData = {{MARKERS_DATA}};

// OPTIMIZATION: Cache for color wheel canvas (drawn once, reused)
var cachedColorWheelCanvas = null;

// Color options for markers
var markerColors = {
    'blue': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
    'red': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    'green': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-green.png',
    'orange': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-orange.png',
    'yellow': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-yellow.png',
    'violet': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-violet.png',
    'grey': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-grey.png',
    'black': 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-black.png'
};

// Predefined color palette for quick selection
var colorPalette = [
    '#ff0000', '#00ff00', '#0000ff', '#ff9900',
    '#ffff00', '#ff00ff', '#00ffff', '#9900ff',
    '#ff6666', '#66ff66', '#6666ff', '#ffcc66',
    '#ccff66', '#66ccff', '#ff66cc', '#cc66ff'
];

// ======================== MAP STATE PRESERVATION ========================
function saveMapState() {
    if (!globalMap) return;

    var center = globalMap.getCenter();
    var zoom = globalMap.getZoom();

    var mapState = {
        lat: center.lat,
        lng: center.lng,
        zoom: zoom,
        timestamp: Date.now()
    };

    // Store in sessionStorage
    try {
        sessionStorage.setItem('mapState', JSON.stringify(mapState));
        console.log('Map state saved:', mapState);
    } catch (e) {
        console.warn('Could not save map state:', e);
    }
}

function restoreMapState() {
    if (!globalMap) return;

    try {
        var savedState = sessionStorage.getItem('mapState');
        if (savedState) {
            var mapState = JSON.parse(savedState);

            // Only restore if the state was saved recently (within 30 seconds)
            if (Date.now() - mapState.timestamp < 30000) {
                console.log('Restoring map state:', mapState);
                globalMap.setView([mapState.lat, mapState.lng], mapState.zoom);
                sessionStorage.removeItem('mapState');
            } else {
                console.log('Map state too old, not restoring');
                sessionStorage.removeItem('mapState');
            }
        }
    } catch (e) {
        console.warn('Could not restore map state:', e);
    }
}

// Helper function to get display colors
function getColorHex(colorName) {
    var colors = {
        'blue': '#0066cc',
        'red': '#cc0000',
        'green': '#00cc00',
        'orange': '#ff8800',
        'yellow': '#ffcc00',
        'violet': '#8800cc',
        'grey': '#808080',
        'black': '#333333'
    };
    return colors[colorName] || '#0066cc';
}

// Helper function to create colored marker icons
function createDefaultColoredMarkerIcon(color) {
   return L.icon({
    iconUrl: "https://raw.githubusercontent.com/Arthur-cascardo/Files/refs/heads/main/pinwithshadow2.png",
    shadowUrl: 'https://raw.githubusercontent.com/Arthur-cascardo/Files/refs/heads/main/240_F_575062297_mNZCb6oLPOpTVIRQuZBSNT1xDsMezbi4%20(1).png',
    iconSize:     [30, 41],
    iconAnchor:   [15, 41],
    popupAnchor:  [0, -35],
    shadowSize:   [41, 41],
    shadowAnchor: [15, 41]
   });
}

// Helper function to convert HSL to Hex
function hslToHex(h, s, l) {
    l /= 100;
    s /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
}

// OPTIMIZATION: Create cached color wheel once, reuse everywhere
function createCachedColorWheel() {
    if (cachedColorWheelCanvas) return cachedColorWheelCanvas;

    var canvas = document.createElement('canvas');
    canvas.width = 150;
    canvas.height = 150;
    var ctx = canvas.getContext('2d');
    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var radius = 65;

    // Draw the color wheel once
    for (let angle = 0; angle < 360; angle++) {
        for (let r = 0; r < radius; r++) {
            const rad = (angle * Math.PI) / 180;
            const x = centerX + r * Math.cos(rad);
            const y = centerY + r * Math.sin(rad);
            const saturation = r / radius;
            const hslColor = `hsl(${angle}, ${saturation * 100}%, 50%)`;
            ctx.fillStyle = hslColor;
            ctx.fillRect(x, y, 1, 1);
        }
    }

    cachedColorWheelCanvas = canvas;
    console.log('Color wheel cached');
    return canvas;
}

// OPTIMIZATION: Use cached canvas instead of redrawing
function drawColorWheel(ctx, centerX, centerY, radius) {
    // This function is now just a wrapper that copies the cached canvas
    var cached = createCachedColorWheel();
    ctx.drawImage(cached, 0, 0);
}

function findAndSetupMap() {
    setupAttempts++;
    console.log('Setup attempt:', setupAttempts);

    // Method 1: Try to find the map div and get the Leaflet instance from it
    var mapDiv = document.getElementById('{{MAP_DIV_ID}}');
    if (mapDiv && mapDiv._leaflet_map) {
        globalMap = mapDiv._leaflet_map;
        console.log('Found map via div._leaflet_map');
        initializeMapFeatures();
        return;
    }

    // Method 2: Try the global variable approach
    if (typeof window['{{MAP_VAR_NAME}}'] !== 'undefined') {
        globalMap = window['{{MAP_VAR_NAME}}'];
        console.log('Found map via global variable');
        initializeMapFeatures();
        return;
    }

    // Method 3: Search through all global variables for Leaflet maps
    for (var key in window) {
        if (key.startsWith('map_') && window[key] && typeof window[key].on === 'function') {
            try {
                if (window[key].getCenter && typeof window[key].getCenter === 'function') {
                    globalMap = window[key];
                    console.log('Found map via global search:', key);
                    initializeMapFeatures();
                    return;
                }
            } catch (e) {
                console.log('Not a leaflet map:', key);
            }
        }
    }

    // Method 4: Try to find any div with a leaflet-container class
    var leafletContainers = document.querySelectorAll('.leaflet-container');
    if (leafletContainers.length > 0) {
        var container = leafletContainers[0];
        if (container._leaflet_map) {
            globalMap = container._leaflet_map;
            console.log('Found map via leaflet-container class');
            initializeMapFeatures();
            return;
        }
    }

    if (setupAttempts < maxSetupAttempts) {
        setTimeout(findAndSetupMap, 200);
    } else {
        console.error('Could not find Leaflet map after', maxSetupAttempts, 'attempts');
        tryFallbackMapDetection();
    }
}

function tryFallbackMapDetection() {
    for (var prop in window) {
        try {
            if (window[prop] &&
                typeof window[prop] === 'object' &&
                window[prop].hasOwnProperty('_container') &&
                window[prop].hasOwnProperty('_zoom')) {
                globalMap = window[prop];
                console.log('Found map via fallback detection:', prop);
                initializeMapFeatures();
                return;
            }
        } catch (e) {}
    }
    console.error('Absolutely no Leaflet map found');
}

function initializeMapFeatures() {
    if (!globalMap) {
        console.error('Cannot initialize features: no map found');
        return;
    }

    console.log('Initializing map features...');
    setupContextMenu();
    enforceWorldBounds();
    startVisibleMarkersTracking();
    setupSearchBox();

    // Restore map state after all features are initialized
    setTimeout(() => {
        restoreMapState();
    }, 0);

    console.log('Map features initialized successfully');
}

// ======================== ENHANCED COLOR PICKER DIALOG ========================
function showColorPicker(callback) {
    var existing = document.getElementById('colorPicker');
    if (existing) document.body.removeChild(existing);

    var picker = document.createElement('div');
    picker.id = 'colorPicker';
    picker.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000;" onclick="closeColorPicker()">
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); min-width: 450px; font-family: Arial, sans-serif;" onclick="event.stopPropagation()">
                <h3 style="margin: 0 0 20px 0; color: #333; text-align: center;">Escolha a cor</h3>
                <!-- Color Wheel Section -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <canvas id="addColorWheel" width="150" height="150" style="cursor: crosshair; border: 2px solid #ddd; border-radius: 50%; margin-bottom: 15px;"></canvas>
                </div>

                <!-- Selected Color Display -->
                <div style="text-align: center; margin-bottom: 20px;">
                    <div style="display: inline-flex; align-items: center; gap: 10px;">
                        <span style="color: #666;">Selecionada:</span>
                        <div id="addSelectedColorBox" style="width: 30px; height: 30px; border: 2px solid #333; border-radius: 6px; background: ${getColorHex('blue')};"></div>
                        <input type="text" id="addColorHexInput" value="${getColorHex('blue')}" style="padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; width: 70px; font-size: 12px;" readonly>
                    </div>
                </div>

                <!-- Color Palette -->
                <div style="margin-bottom: 20px;">
                    <div style="text-align: center; margin-bottom: 8px;">
                        <span style="color: #666; font-size: 12px;">Paleta de cores:</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;">
                        ${colorPalette.slice(0, 16).map(color => `
                            <div onclick="selectAddPresetColor('${color}')" style="width: 24px; height: 24px; background: ${color}; border: 2px solid #ddd; border-radius: 4px; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'; this.style.borderColor='#333'" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='#ddd'"></div>
                        `).join('')}
                    </div>
                </div>

                <!-- Action Buttons -->
                <div style="text-align: center; display: flex; gap: 10px; justify-content: center;">
                    <button onclick="confirmColorSelection()" style="padding: 12px 20px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Usar essa cor</button>
                    <button onclick="closeColorPicker()" style="padding: 12px 20px; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa; cursor: pointer;">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(picker);
    window.colorPickerCallback = callback;
    window.selectedAddColor = 'blue';
    window.selectedAddColorHex = getColorHex('blue');

    // Initialize color wheel after a short delay to ensure DOM is ready
    setTimeout(() => {
        initializeAddColorWheel();
    }, 100);
}

function initializeAddColorWheel() {
    var canvas = document.getElementById('addColorWheel');
    if (!canvas) return;

    // OPTIMIZATION: Use cached color wheel
    var ctx = canvas.getContext('2d');
    var cachedWheel = createCachedColorWheel();
    ctx.drawImage(cachedWheel, 0, 0);

    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var radius = 65;

    canvas.addEventListener('click', function(event) {
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left - centerX;
        var y = event.clientY - rect.top - centerY;

        var distance = Math.sqrt(x * x + y * y);
        if (distance <= radius) {
            var angle = Math.atan2(y, x);
            var hue = (angle * 180 / Math.PI + 360) % 360;
            var saturation = Math.min(distance / radius, 1);
            var lightness = 0.5;

            var color = hslToHex(hue, saturation * 100, lightness * 100);
            updateAddSelectedColor(color);
        }
    });
}

window.selectAddPresetColor = function(color) {
    updateAddSelectedColor(color, false);
};

window.selectColorFromPicker = function(colorName) {
    var hexColor = getColorHex(colorName);
    updateAddSelectedColor(hexColor);
    window.selectedAddColor = colorName;
};

function updateAddSelectedColor(color) {
    window.selectedAddColorHex = color;
    window.selectedAddColor = color;

    var colorBox = document.getElementById('addSelectedColorBox');
    var hexInput = document.getElementById('addColorHexInput');

    if (colorBox) colorBox.style.background = color;
    if (hexInput) hexInput.value = color;
}

window.confirmColorSelection = function() {
    console.log('=== confirmColorSelection called ===');

    var selectedColor = window.selectedAddColorHex || '#0066cc';
    console.log('Selected color:', selectedColor);

    var callback = window.colorPickerCallback;
    var coords = rightClickCoords;

    closeColorPicker();
    console.log('Color picker closed');

    if (callback) {
        console.log('Calling saved callback with color:', selectedColor);
        try {
            callback(selectedColor);
            console.log('Callback executed successfully');
        } catch (error) {
            console.error('Error in callback:', error);
        }
    } else if (coords) {
        console.log('No callback, using rightClickCoords');
        showMarkerDescriptionDialog(coords.lat, coords.lng, selectedColor);
    } else {
        console.error('No callback or coordinates available!');
    }
};

window.selectColor = function(color) {
    selectColorFromPicker(color);
};

window.closeColorPicker = function() {
    var picker = document.getElementById('colorPicker');
    if (picker) document.body.removeChild(picker);
    window.colorPickerCallback = null;
    window.selectedAddColor = null;
    window.selectedAddColorHex = null;
};

// ======================== CONTEXT MENU SETUP ========================
function setupContextMenu() {
    if (!globalMap) {
        console.error('Cannot setup context menu: no map found');
        return;
    }

    console.log('Setting up context menu...');
    if (!contextMenuElement) {
        contextMenuElement = document.createElement('div');
        contextMenuElement.innerHTML = `
            <div id="contextMenu" style="position: absolute; background: white; border: 1px solid #ccc; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.2); padding: 4px 0; z-index: 9999; display: none; min-width: 160px; font-family: Arial, sans-serif;">
                <div onclick="addMarkerWithColorPicker()" style="padding: 10px 16px; cursor: pointer; color: #333; font-size: 14px; border-bottom: 1px solid #f0f0f0;" onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='white'">
                    &#128205; Adicionar viagem aqui
                </div>
                <div onclick="hideContextMenu()" style="padding: 10px 16px; cursor: pointer; color: #333; font-size: 14px;" onmouseover="this.style.backgroundColor='#f8f9fa'" onmouseout="this.style.backgroundColor='white'">
                    &#10060; Cancelar
                </div>
            </div>
        `;
        document.body.appendChild(contextMenuElement);
    }

    var mapContainer = globalMap.getContainer();
    if (mapContainer) {
        mapContainer.addEventListener('contextmenu', function(e) {
            e.preventDefault();
            e.stopPropagation();

            var rect = mapContainer.getBoundingClientRect();
            var x = e.clientX - rect.left;
            var y = e.clientY - rect.top;
            var point = L.point(x, y);
            rightClickCoords = globalMap.containerPointToLatLng(point);

            console.log('Right click at:', rightClickCoords);
            showContextMenu(e.clientX, e.clientY);
        });

        globalMap.on('click', hideContextMenu);
        document.addEventListener('click', function(e) {
            var menu = document.getElementById('contextMenu');
            if (menu && !menu.contains(e.target)) hideContextMenu();
        });

        console.log('Context menu event listeners added');
    } else {
        console.error('Map container not found');
    }
}

function showContextMenu(x, y) {
    var menu = document.getElementById('contextMenu');
    if (menu) {
        var menuWidth = 160;
        var menuHeight = 80;
        x = Math.max(10, Math.min(x, window.innerWidth - menuWidth - 10));
        y = Math.max(10, Math.min(y, window.innerHeight - menuHeight - 10));

        menu.style.left = x + 'px';
        menu.style.top = y + 'px';
        menu.style.display = 'block';
        console.log('Context menu shown at:', x, y);
    }
}

window.hideContextMenu = function() {
    var menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
};

window.addMarkerWithColorPicker = function() {
    console.log('Add marker with color picker clicked');
    hideContextMenu();

    if (!rightClickCoords) {
        console.error('No right click coordinates available');
        alert('Error: No location selected');
        return;
    }

    showColorPicker(function(color) {
        showMarkerDescriptionDialog(rightClickCoords.lat, rightClickCoords.lng, color);
    });
};

function showMarkerDescriptionDialog(lat, lng, color, defaultText) {
    var existing = document.getElementById('markerDescDialog');
    if (existing) document.body.removeChild(existing);

    var inputValue = defaultText ? defaultText.replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';
    var placeholderText = defaultText ? '' : 'Ex: Viagem para Paris, Final de semana na praia...';

    var dialog = document.createElement('div');
    dialog.id = 'markerDescDialog';
    dialog.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;" id="markerDescBackdrop">
            <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); max-width: 500px; width: 90%; font-family: Arial, sans-serif;" onclick="event.stopPropagation()">
                <h3 style="margin: 0 0 20px 0; color: #333; text-align: center;">&#128205; Nova Viagem</h3>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #555; font-weight: bold;">Descrição da viagem:</label>
                    <input type="text" id="markerDescInput" value="${inputValue}" placeholder="${placeholderText}" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 14px; font-family: Arial, sans-serif;">
                </div>

                <div style="margin-bottom: 25px; text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 10px; background: #f8f9fa; padding: 10px 15px; border-radius: 8px;">
                        <span style="color: #666; font-size: 13px;">Cor escolhida:</span>
                        <div style="width: 24px; height: 24px; border: 2px solid #333; border-radius: 6px; background: ${color};"></div>
                    </div>
                </div>

                <div style="text-align: center; display: flex; gap: 10px; justify-content: center;">
                    <button id="confirmMarkerBtn" style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px;">Adicionar Viagem</button>
                    <button id="cancelMarkerBtn" style="padding: 12px 24px; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa; cursor: pointer; font-size: 14px;">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    window.pendingMarkerData = { lat: lat, lng: lng, color: color };

    document.getElementById('markerDescBackdrop').addEventListener('click', closeMarkerDescDialog);
    document.getElementById('cancelMarkerBtn').addEventListener('click', closeMarkerDescDialog);
    document.getElementById('confirmMarkerBtn').addEventListener('click', function() {
        var input = document.getElementById('markerDescInput');
        var text = input ? input.value.trim() : '';

        if (!text) {
            alert('Por favor, insira uma descrição para a viagem');
            if (input) input.focus();
            return;
        }

        console.log('Adding marker at:', window.pendingMarkerData.lat, window.pendingMarkerData.lng, 'with color:', window.pendingMarkerData.color);
        addMarker(window.pendingMarkerData.lat, window.pendingMarkerData.lng, text, window.pendingMarkerData.color);
        closeMarkerDescDialog();
    });

    setTimeout(() => {
        var input = document.getElementById('markerDescInput');
        if (input) {
            input.focus();
            if (defaultText) {
                input.select();
            }
            input.addEventListener('keypress', function(e) {
                if (e.key === 'Enter') {
                    document.getElementById('confirmMarkerBtn').click();
                }
            });
        }
    }, 100);
}

window.confirmMarkerDescription = function(lat, lng, color) {
    console.log('confirmMarkerDescription called with:', { lat, lng, color });

    var input = document.getElementById('markerDescInput');
    var text = input ? input.value.trim() : '';

    if (!text) {
        alert('Por favor, insira uma descrição para a viagem');
        if (input) input.focus();
        return;
    }

    console.log('Adding marker at:', lat, lng, 'with color:', color);
    addMarker(lat, lng, text, color);
    closeMarkerDescDialog();
};

window.closeMarkerDescDialog = function() {
    var dialog = document.getElementById('markerDescDialog');
    if (dialog) document.body.removeChild(dialog);
};

// ======================== MARKER OPERATIONS ========================
function addMarker(lat, lon, text, color) {
    console.log('Attempting to add marker:', { lat, lon, text, color });

    // Show loading immediately
    showLoading('Adicionando viagem...');

    saveMapState();

    fetch('/add_marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            lat: lat,
            lon: lon,
            popup_text: text,
            color: color || '#ffffff'
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        console.log('Add marker response:', data);

        if (data.status === 'success') {
            // Change loading message before reload
            showLoading('Viagem adicionada! Atualizando mapa...');

            // Small delay so user sees success message
            setTimeout(function() {
                location.reload();
            }, 500);
        } else {
            hideLoading();
            sessionStorage.removeItem('mapState');
            alert('Erro: ' + (data.message || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Error adding marker:', error);
        hideLoading();
        sessionStorage.removeItem('mapState');
        alert('Falha ao adicionar viagem: ' + error.message);
    });
}

window.editMarkerPrompt = function(markerId) {
    console.log('Editing marker:', markerId);

    // Show loading while fetching marker data
    showLoading('Carregando dados da viagem...');

    fetch('/get_marker/' + markerId)
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch marker');
        }
        return response.json();
    })
    .then(data => {
        hideLoading();

        if (data.status === 'success') {
            showEditDialog(markerId, data.marker.popup_text, data.marker.color || 'blue');
        } else {
            alert('Erro ao carregar dados: ' + (data.message || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Error getting marker data:', error);
        hideLoading();
        alert('Falha ao carregar dados da viagem');
    });
};

function showEditDialog(markerId, currentText, currentColor) {
    var existing = document.getElementById('editDialog');
    if (existing) document.body.removeChild(existing);

    var displayColor = currentColor.startsWith('#') ? currentColor : getColorHex(currentColor);

    var dialog = document.createElement('div');
    dialog.id = 'editDialog';
    dialog.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000;" onclick="closeEditDialog()">
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); min-width: 450px; font-family: Arial, sans-serif;" onclick="event.stopPropagation()">
                <h3 style="margin: 0 0 20px 0; color: #333;">Editar viagem</h3>

                <label style="display: block; margin-bottom: 5px; color: #555; font-weight: bold;">Descrição:</label>
                <input type="text" id="editText" value="${currentText.replace(/"/g, '&quot;')}" style="width: 100%; padding: 10px; margin-bottom: 20px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; font-size: 14px;">

                <label style="display: block; margin-bottom: 10px; color: #555; font-weight: bold;">Cor:</label>

                <div style="margin-bottom: 15px; display: flex; align-items: center; gap: 10px;">
                    <span style="color: #666;">Atual:</span>
                    <div id="currentEditColorBox" style="width: 30px; height: 30px; border: 2px solid #333; border-radius: 6px; background: ${displayColor};"></div>
                    <span style="color: #666;">${currentColor}</span>
                </div>

                <div style="text-align: center; margin-bottom: 15px;">
                    <canvas id="editColorWheel" width="150" height="150" style="cursor: crosshair; border: 2px solid #ddd; border-radius: 50%;"></canvas>
                </div>

                <div style="text-align: center; margin-bottom: 15px;">
                    <div style="display: inline-flex; align-items: center; gap: 10px;">
                        <span style="color: #666;">Nova:</span>
                        <div id="editSelectedColorBox" style="width: 30px; height: 30px; border: 2px solid #333; border-radius: 6px; background: ${displayColor};"></div>
                        <input type="text" id="editColorHexInput" value="${displayColor}" style="padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; width: 70px; font-size: 12px;" readonly>
                    </div>
                </div>

                <div style="margin-bottom: 20px;">
                    <div style="text-align: center; margin-bottom: 8px;">
                        <span style="color: #666; font-size: 12px;">Paleta:</span>
                    </div>
                    <div style="display: grid; grid-template-columns: repeat(8, 1fr); gap: 4px;">
                        ${colorPalette.slice(0, 16).map(color => `
                            <div onclick="selectEditPresetColor('${color}')" style="width: 24px; height: 24px; background: ${color}; border: 2px solid #ddd; border-radius: 4px; cursor: pointer; transition: transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'; this.style.borderColor='#333'" onmouseout="this.style.transform='scale(1)'; this.style.borderColor='#ddd'"></div>
                        `).join('')}
                    </div>
                </div>

                <div style="text-align: center; display: flex; gap: 10px; justify-content: center;">
                    <button onclick="saveEdit('${markerId}')" style="padding: 12px 20px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">Salvar</button>
                    <button onclick="closeEditDialog()" style="padding: 12px 20px; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa; cursor: pointer;">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
    window.selectedEditColor = currentColor;
    window.selectedEditColorHex = displayColor;

    setTimeout(() => {
        var input = document.getElementById('editText');
        if (input) {
            input.focus();
            input.select();
        }
        initializeEditColorWheel();
    }, 100);
}

function initializeEditColorWheel() {
    var canvas = document.getElementById('editColorWheel');
    if (!canvas) return;

    // OPTIMIZATION: Use cached color wheel
    var ctx = canvas.getContext('2d');
    var cachedWheel = createCachedColorWheel();
    ctx.drawImage(cachedWheel, 0, 0);

    var centerX = canvas.width / 2;
    var centerY = canvas.height / 2;
    var radius = 65;

    canvas.addEventListener('click', function(event) {
        var rect = canvas.getBoundingClientRect();
        var x = event.clientX - rect.left - centerX;
        var y = event.clientY - rect.top - centerY;

        var distance = Math.sqrt(x * x + y * y);
        if (distance <= radius) {
            var angle = Math.atan2(y, x);
            var hue = (angle * 180 / Math.PI + 360) % 360;
            var saturation = Math.min(distance / radius, 1);
            var lightness = 0.5;

            var color = hslToHex(hue, saturation * 100, lightness * 100);
            updateEditSelectedColor(color);
        }
    });
}

window.selectEditPresetColor = function(color) {
    updateEditSelectedColor(color);
};

function updateEditSelectedColor(color) {
    window.selectedEditColorHex = color;
    window.selectedEditColor = color;

    var colorBox = document.getElementById('editSelectedColorBox');
    var hexInput = document.getElementById('editColorHexInput');

    if (colorBox) colorBox.style.background = color;
    if (hexInput) hexInput.value = color;
}

window.saveEdit = function(markerId) {
    var text = document.getElementById('editText').value.trim();
    if (!text) {
        alert('Please enter a description');
        return;
    }

    var colorToSave = window.selectedEditColorHex || '#0066cc';

    // Show loading and close dialog
    closeEditDialog();
    showLoading('Salvando alterações...');

    saveMapState();

    fetch('/edit_marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            marker_id: markerId,
            popup_text: text,
            color: colorToSave
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // Change loading message before reload
            showLoading('Viagem atualizada! Recarregando...');

            setTimeout(function() {
                location.reload();
            }, 500);
        } else {
            hideLoading();
            sessionStorage.removeItem('mapState');
            alert('Erro: ' + (data.message || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Error updating marker:', error);
        hideLoading();
        sessionStorage.removeItem('mapState');
        alert('Falha ao atualizar viagem');
    });
};

window.closeEditDialog = function() {
    var dialog = document.getElementById('editDialog');
    if (dialog) document.body.removeChild(dialog);
    window.selectedEditColor = null;
    window.selectedEditColorHex = null;
};

window.deleteMarker = function(markerId) {
    if (!confirm("Tem certeza que deseja deletar esta viagem?")) {
        return;
    }

    // Show loading immediately after confirmation
    showLoading('Deletando viagem...');

    saveMapState();

    fetch('/delete_marker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marker_id: markerId })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // Change loading message before reload
            showLoading('Viagem deletada! Atualizando mapa...');

            setTimeout(function() {
                location.reload();
            }, 500);
        } else {
            hideLoading();
            sessionStorage.removeItem('mapState');
            alert('Erro: ' + (data.message || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Error deleting marker:', error);
        hideLoading();
        sessionStorage.removeItem('mapState');
        alert('Falha ao deletar viagem');
    });
};

// ======================== SEARCH BOX ========================
function setupSearchBox() {
    if (!globalMap) return;
    if (document.getElementById('locationSearchContainer')) return;

    var searchContainer = document.createElement('div');
    searchContainer.id = 'locationSearchContainer';
    searchContainer.innerHTML = `
        <div style="position: fixed; bottom: 10px; left: 10px; background: rgba(255,255,255,0.95); border: 2px solid #333; border-radius: 8px; padding: 10px; box-shadow: 0 4px 8px rgba(0,0,0,0.2); font-family: Arial, sans-serif; min-width: 300px; z-index: 1000;">
            <h4 style="margin: 0 0 8px 0; color: #333; font-size: 14px;">&#128269; Pesquisar localidade</h4>
            <div style="display: flex; gap: 5px; margin-bottom: 8px;">
                <input type="text" id="locationSearch" placeholder="Cidade, endereço ou local..." style="flex: 1; padding: 6px; border: 1px solid #ccc; border-radius: 4px; font-size: 12px;">
                <button onclick="searchLocation()" style="padding: 6px 10px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px;">Procurar</button>
            </div>
            <div id="searchResults" style="font-size: 11px; color: #666; min-height: 16px;"></div>
        </div>
    `;

    document.body.appendChild(searchContainer);
    document.getElementById('locationSearch').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') searchLocation();
    });
}

window.searchLocation = function() {
    var query = document.getElementById('locationSearch').value.trim();
    var results = document.getElementById('searchResults');

    if (!query) {
        results.innerHTML = '<span style="color: red;">Digite um lugar</span>';
        return;
    }

    // Show inline loading in search results
    results.innerHTML = '<span style="color: #007bff;">🔍 Procurando...</span>';

    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=3`)
    .then(response => {
        if (!response.ok) {
            throw new Error('Search failed');
        }
        return response.json();
    })
    .then(data => {
        if (data && data.length > 0) {
            var result = data[0];
            var lat = parseFloat(result.lat);
            var lon = parseFloat(result.lon);

            globalMap.setView([lat, lon], 12);

            if (window.searchMarker) {
                globalMap.removeLayer(window.searchMarker);
            }

            window.searchMarker = L.marker([lat, lon], {
                icon: createDefaultColoredMarkerIcon()
            }).addTo(globalMap);

            var displayName = result.display_name.split(',')[0].replace(/'/g, "\\'");

            window.searchMarker.bindPopup(`
                <div>
                    <h4>Resultado da Busca</h4>
                    <p><strong>${result.display_name}</strong></p>
                    <button onclick="addSearchMarkerWithColor(${lat}, ${lon}, '${displayName}')" style="background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-top: 5px;">
                        Adicionar como viagem
                    </button>
                </div>
            `).openPopup();

            results.innerHTML = `<span style="color: green;">✓ Encontrado: ${result.display_name.substring(0, 40)}...</span>`;
        } else {
            results.innerHTML = '<span style="color: red;">✗ Sem resultados</span>';
        }
    })
    .catch(error => {
        console.error('Search error:', error);
        results.innerHTML = '<span style="color: red;">✗ Erro na busca</span>';
    });
};

window.addSearchMarkerWithColor = function(lat, lon, name) {
    console.log('addSearchMarkerWithColor called with:', { lat, lon, name });

    if (window.searchMarker) {
        window.searchMarker.closePopup();
    }

    showColorPicker(function(color) {
        console.log('Color selected:', color);
        console.log('About to show description dialog with lat:', lat, 'lon:', lon);

        showMarkerDescriptionDialog(lat, lon, color, name);

        if (window.searchMarker) {
            globalMap.removeLayer(window.searchMarker);
            window.searchMarker = null;
        }
    });
};

// ======================== MEMORY FUNCTIONS ========================
window.addMemoryPrompt = function(markerId) {
    showMemoryInputDialog(markerId);
};

function showMemoryInputDialog(markerId) {
    var existing = document.getElementById('memoryInputDialog');
    if (existing) document.body.removeChild(existing);

    var dialog = document.createElement('div');
    dialog.id = 'memoryInputDialog';
    dialog.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 10000; display: flex; align-items: center; justify-content: center;" onclick="closeMemoryInputDialog()">
            <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); max-width: 550px; width: 90%; font-family: Arial, sans-serif;" onclick="event.stopPropagation()">
                <h3 style="margin: 0 0 20px 0; color: #333; text-align: center;">&#128173; Adicionar Lembrança</h3>

                <div style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 8px; color: #555; font-weight: bold;">Compartilhe sua lembrança:</label>
                    <p style="font-size: 12px; color: #666; margin: 5px 0 15px 0;">Você pode adicionar um texto ou um link para foto/vídeo</p>
                    <textarea id="memoryTextInput" placeholder="Ex: Foi uma viagem incrível! Conhecemos lugares maravilhosos...&#10;&#10;Ou cole um link: https://photos.app.goo.gl/..." style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; box-sizing: border-box; font-size: 14px; font-family: Arial, sans-serif; min-height: 120px; resize: vertical;"></textarea>
                </div>

                <div style="background: #f0f7ff; padding: 12px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #007bff;">
                    <p style="margin: 0; font-size: 12px; color: #555;">
                        <strong>&#128161; Dica:</strong> Links de fotos (Google Photos, Dropbox, etc.) ficam mais fáceis de acessar depois!
                    </p>
                </div>

                <div style="text-align: center; display: flex; gap: 10px; justify-content: center;">
                    <button onclick="confirmMemoryInput('${markerId}')" style="padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; font-size: 14px;">Salvar Lembrança</button>
                    <button onclick="closeMemoryInputDialog()" style="padding: 12px 24px; border: 1px solid #ddd; border-radius: 8px; background: #f8f9fa; cursor: pointer; font-size: 14px;">Cancelar</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);

    setTimeout(() => {
        var input = document.getElementById('memoryTextInput');
        if (input) {
            input.focus();
        }
    }, 100);
}

window.confirmMemoryInput = function(markerId) {
    var input = document.getElementById('memoryTextInput');
    var memory = input ? input.value.trim() : '';

    if (!memory) {
        alert('Por favor, insira uma lembrança antes de salvar');
        if (input) input.focus();
        return;
    }

    // Close dialog and show loading
    closeMemoryInputDialog();
    showLoading('Salvando lembrança...');

    saveMapState();

    fetch('/add_memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            marker_id: markerId,
            memory_text: memory
        })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        return response.json();
    })
    .then(data => {
        if (data.status === 'success') {
            // Change loading message before reload
            showLoading('Lembrança salva! Atualizando...');

            setTimeout(function() {
                location.reload();
            }, 500);
        } else {
            hideLoading();
            sessionStorage.removeItem('mapState');
            alert('Erro: ' + (data.message || 'Erro desconhecido'));
        }
    })
    .catch(error => {
        console.error('Erro ao adicionar memória:', error);
        hideLoading();
        sessionStorage.removeItem('mapState');
        alert('Erro ao adicionar lembrança');
    });
};

window.closeMemoryInputDialog = function() {
    var dialog = document.getElementById('memoryInputDialog');
    if (dialog) document.body.removeChild(dialog);
};

// ======================== UPDATED MEMORY VIEW FUNCTION ========================
window.viewMemory = function(markerId) {
    console.log('Viewing memory for marker:', markerId);

    // Show loading while preparing memory view
    showLoading('Preparando lembrança...');

    fetch('/api/pause_arduino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: true })
    })
    .then(response => response.json())
    .then(pauseData => {
        console.log('Arduino paused:', pauseData);

        // Update loading message
        showLoading('Carregando lembrança...');

        return fetch('/get_memory/' + markerId);
    })
    .then(response => {
        if (!response.ok) {
            throw new Error('Failed to fetch memory');
        }
        return response.json();
    })
    .then(data => {
        hideLoading();

        if (data.status === 'success') {
            var memory = data.memory;
            setTimeout(function() {
                showMemoryDialog(memory, markerId);
            }, 100);
            console.log('Memory trigger sent - wave effect starting');
        } else {
            resumeArduino();
            alert('Não foram encontradas lembranças');
        }
    })
    .catch(error => {
        console.error('Erro ao relembrar:', error);
        hideLoading();
        resumeArduino();
        alert('Erro ao carregar lembrança');
    });
};

function resumeArduino() {
    console.log('Resuming Arduino communication...');

    fetch('/api/pause_arduino', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: false })
    })
    .then(response => response.json())
    .then(data => {
        console.log('Arduino resumed:', data);

        // Multiple updates to ensure at least one succeeds
        updateVisibleMarkers();

        setTimeout(function() {
            updateVisibleMarkers();
        }, 200);

        setTimeout(function() {
            updateVisibleMarkers();
            console.log('LEDs should be restored now');
        }, 500);
    })
    .catch(error => {
        console.error('Error resuming Arduino:', error);
    });
}

function showMemoryDialog(memory, markerId) {
    var existing = document.getElementById('memoryDialog');
    if (existing) document.body.removeChild(existing);

    var isUrl = memory.startsWith('http://') || memory.startsWith('https://');

    var dialog = document.createElement('div');
    dialog.id = 'memoryDialog';
    dialog.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 10000; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; padding: 30px; border-radius: 15px; box-shadow: 0 8px 32px rgba(0,0,0,0.3); max-width: 600px; width: 90%; font-family: Arial, sans-serif;">
                <h3 style="margin: 0 0 20px 0; color: #333; text-align: center;">&#128205 Lembrança</h3>

                ${isUrl ? `
                    <div style="margin-bottom: 20px; text-align: center;">
                        <p style="color: #666; margin-bottom: 15px;">Click no link para relembrar...</p>
                        <a href="${memory}" target="_blank" style="color: #007bff; word-break: break-all; font-size: 14px;">${memory}</a>
                    </div>
                    <div style="text-align: center;">
                        <button onclick="window.open('${memory}', '_blank')" style="padding: 12px 24px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; margin-right: 10px;">
                            Abrir link
                        </button>
                        <button onclick="closeMemoryDialog()" style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                            OK
                        </button>
                    </div>
                ` : `
                    <div style="margin-bottom: 20px;">
                        <p style="color: #333; line-height: 1.6; white-space: pre-wrap; max-height: 400px; overflow-y: auto; padding: 15px; background: #f8f9fa; border-radius: 8px;">${memory}</p>
                    </div>
                    <div style="text-align: center;">
                        <button onclick="closeMemoryDialog()" style="padding: 12px 24px; background: #28a745; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold;">
                            OK
                        </button>
                    </div>
                `}
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
}

window.closeMemoryDialog = function() {
    var dialog = document.getElementById('memoryDialog');
    if (dialog) {
        document.body.removeChild(dialog);
    }
    resumeArduino();
};

// ======================== MAP BOUNDS & TRACKING ========================
function enforceWorldBounds() {
    if (!globalMap) return;

    try {
        var bounds = L.latLngBounds(L.latLng(-85, -180), L.latLng(85, 180));
        globalMap.setMaxBounds(bounds);
        globalMap.options.maxBoundsViscosity = 1.0;
        globalMap.options.worldCopyJump = false;
        globalMap.options.noWrap = true;
        globalMap.options.minZoom = 2;
        globalMap.options.maxZoom = 18;
    } catch (error) {
        console.error('Error setting map bounds:', error);
    }
}

// OPTIMIZATION: Debounce function to prevent excessive updates
function debounce(func, wait) {
    var timeout;
    return function executedFunction() {
        var context = this;
        var args = arguments;
        var later = function() {
            timeout = null;
            func.apply(context, args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// OPTIMIZATION: Only update when map actually moves/zooms (no more 1-second interval!)
function startVisibleMarkersTracking() {
    if (!globalMap) return;

    try {
        // Initial update
        updateVisibleMarkers();

        // OPTIMIZATION: Debounced update - only fires 500ms after user stops moving map
        var debouncedUpdate = debounce(updateVisibleMarkers, 200);

        // REMOVED: setInterval(updateVisibleMarkers, 1000);
        // Now only updates on actual map events
        globalMap.on('moveend', debouncedUpdate);
        globalMap.on('zoomend', debouncedUpdate);

        console.log('Visible markers tracking: EVENT-DRIVEN (no polling!)');
    } catch (error) {
        console.error('Error starting visible markers tracking:', error);
    }
}

function updateVisibleMarkers() {
    if (!globalMap || !allMarkersData) return;

    try {
        var bounds = globalMap.getBounds();
        var visible = [];

        for (var id in allMarkersData) {
            var marker = allMarkersData[id];
            if (bounds.contains(L.latLng(marker.lat, marker.lon))) {
                visible.push({
                    id: id,
                    name: marker.name,
                    lat: marker.lat,
                    lon: marker.lon
                });
            }
        }

        fetch('/visible_markers', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ visible_markers: visible })
        }).catch(error => {
            console.log('Visible markers update failed:', error);
        });
    } catch (error) {
        console.error('Visible markers error:', error);
    }
}

window.getVisibleMarkers = function() {
    if (!globalMap || !allMarkersData) return [];

    try {
        var bounds = globalMap.getBounds();
        var visible = [];

        for (var id in allMarkersData) {
            var marker = allMarkersData[id];
            if (bounds.contains(L.latLng(marker.lat, marker.lon))) {
                visible.push(marker);
            }
        }

        return visible;
    } catch (error) {
        console.error('Error getting visible markers:', error);
        return [];
    }
};

// ======================== WINDOW CLEANUP (LED OFF) ========================
var tabIsVisible = true;

function cleanupLEDs() {
    console.log('Turning off LEDs...');

    fetch('/visible_markers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visible_markers: [] }),
        keepalive: true
    }).then(function() {
        console.log('Empty markers list sent - LEDs should turn off');
    }).catch(function(error) {
        console.error('Error sending empty markers:', error);
    });
}

window.addEventListener('beforeunload', function(event) {
    console.log('Window closing');
    tabIsVisible = false;
    if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify({})], { type: 'application/json' });
        navigator.sendBeacon('/api/cleanup_leds', blob);
    } else {
        fetch('/api/cleanup_leds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            keepalive: true
        });
    }
});

document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') {
        console.log('Tab hidden - turning off LEDs and pausing updates');
        tabIsVisible = false;
        cleanupLEDs();
    } else {
        console.log('Tab visible - resuming updates and restoring LEDs');
        tabIsVisible = true;
        setTimeout(function() {
            if (typeof updateVisibleMarkers === 'function') {
                updateVisibleMarkers();
                console.log('Visible markers update triggered');
            }
        }, 200);
    }
});

window.addEventListener('pagehide', function(event) {
    console.log('Page hide');
    tabIsVisible = false;
    if (navigator.sendBeacon) {
        var blob = new Blob([JSON.stringify({})], { type: 'application/json' });
        navigator.sendBeacon('/api/cleanup_leds', blob);
    }
});

console.log('LED cleanup handlers registered (window close + tab switching with pause)');

// ======================== LOADING INDICATOR SYSTEM ========================

function createLoadingOverlay() {
    if (document.getElementById('loadingOverlay')) return;

    var overlay = document.createElement('div');
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.6); z-index: 99999; display: none; align-items: center; justify-content: center;">
            <div style="background: white; padding: 30px 40px; border-radius: 15px; box-shadow: 0 10px 40px rgba(0,0,0,0.3); text-align: center; font-family: Arial, sans-serif;">
                <div class="spinner" style="margin: 0 auto 15px; width: 50px; height: 50px; border: 5px solid #f3f3f3; border-top: 5px solid #007bff; border-radius: 50%; animation: spin 1s linear infinite;"></div>
                <div id="loadingText" style="color: #333; font-size: 16px; font-weight: 500;">Carregando...</div>
            </div>
        </div>
        <style>
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
        </style>
    `;
    document.body.appendChild(overlay);
}

function showLoading(message) {
    createLoadingOverlay();
    var overlay = document.getElementById('loadingOverlay');
    var text = document.getElementById('loadingText');

    if (message) text.textContent = message;
    overlay.style.display = 'flex';
    console.log('Loading:', message || 'Processing...');
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    console.log('Loading complete');
}

// Initialize loading overlay when page loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createLoadingOverlay);
} else {
    createLoadingOverlay();
}

// ======================== INITIALIZATION ========================
function initializeScript() {
    console.log('Initializing script...');

    if (typeof L === 'undefined') {
        console.log('Leaflet not loaded yet, waiting...');
        setTimeout(initializeScript, 500);
        return;
    }

    setTimeout(findAndSetupMap, 1000);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeScript);
} else {
    initializeScript();
}