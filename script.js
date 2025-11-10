// ===================================
// StyleSnatcher - JavaScript Logic
// Client-side style extraction tool
// ===================================

// DOM Elements
const urlInput = document.getElementById('urlInput');
const snatchBtn = document.getElementById('snatchBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const colorPalette = document.getElementById('colorPalette');
const typography = document.getElementById('typography');
const copyCssBtn = document.getElementById('copyCssBtn');
const copyFeedback = document.getElementById('copyFeedback');

// State
let extractedColors = [];
let extractedFonts = [];

// ===================================
// Event Listeners
// ===================================

snatchBtn.addEventListener('click', handleSnatch);
urlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSnatch();
});

copyCssBtn.addEventListener('click', handleCopyCss);

// ===================================
// Main Functions
// ===================================

async function handleSnatch() {
    const url = urlInput.value.trim();
    
    // Validation
    if (!url) {
        showError('Please enter a website URL');
        return;
    }
    
    if (!isValidUrl(url)) {
        showError('Please enter a valid URL (e.g., https://example.com)');
        return;
    }
    
    // Reset UI and disable button
    hideError();
    hideResults();
    showLoading();
    snatchBtn.disabled = true;
    
    try {
        // Fetch website content
        const html = await fetchSiteContent(url);
        
        // Extract styles
        const styles = await extractStyles(html, url);
        
        // Extract colors and fonts
        extractedColors = extractColors(styles);
        extractedFonts = extractFonts(styles);
        
        // Validate results
        if (extractedColors.length === 0 && extractedFonts.length === 0) {
            showError('No styles found. The website might be blocking access or using inline JavaScript styles.');
            return;
        }
        
        // Display results
        displayResults();
        
    } catch (error) {
        console.error('Error:', error);
        showError('Failed to analyze website. Make sure the URL is correct and publicly accessible.');
    } finally {
        hideLoading();
        snatchBtn.disabled = false;
    }
}

async function fetchSiteContent(url) {
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;
    
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
        throw new Error('Network response was not ok');
    }
    
    const html = await response.text();
    return html;
}

async function extractStyles(html, baseUrl) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    let allStyles = '';
    
    // Extract inline styles from <style> tags
    const styleTags = doc.querySelectorAll('style');
    for (const tag of styleTags) {
        allStyles += tag.textContent + '\n';
    }
    
    // Extract linked stylesheets (limited to avoid too many requests)
    const linkTags = Array.from(doc.querySelectorAll('link[rel="stylesheet"]')).slice(0, 5);
    
    for (const link of linkTags) {
        try {
            const href = link.getAttribute('href');
            if (href) {
                const cssUrl = new URL(href, baseUrl).href;
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(cssUrl)}`;
                const response = await fetch(proxyUrl);
                if (response.ok) {
                    const css = await response.text();
                    allStyles += css + '\n';
                }
            }
        } catch (e) {
            console.warn('Failed to fetch stylesheet:', e);
        }
    }
    
    // Also extract inline styles from elements
    const elementsWithStyle = doc.querySelectorAll('[style]');
    for (const el of elementsWithStyle) {
        allStyles += el.getAttribute('style') + ';';
    }
    
    return allStyles;
}

function extractColors(cssText) {
    const colorMap = new Map();
    
    // Regex patterns for different color formats
    const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})\b/g;
    const rgbPattern = /rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/g;
    const hslPattern = /hsla?\s*\(\s*([\d.]+)\s*,\s*([\d.]+)%\s*,\s*([\d.]+)%/g;
    
    // Extract hex colors
    let match;
    while ((match = hexPattern.exec(cssText)) !== null) {
        const hex = normalizeHex(match[0]);
        colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
    }
    
    // Extract RGB colors and convert to hex
    while ((match = rgbPattern.exec(cssText)) !== null) {
        const r = Number.parseInt(match[1], 10);
        const g = Number.parseInt(match[2], 10);
        const b = Number.parseInt(match[3], 10);
        if (isValidRgbValue(r) && isValidRgbValue(g) && isValidRgbValue(b)) {
            const hex = rgbToHex(r, g, b);
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
    }
    
    // Extract HSL colors and convert to hex
    while ((match = hslPattern.exec(cssText)) !== null) {
        const h = Number.parseFloat(match[1]);
        const s = Number.parseFloat(match[2]);
        const l = Number.parseFloat(match[3]);
        if (isValidHslValue(h, s, l)) {
            const hex = hslToHex(h, s, l);
            colorMap.set(hex, (colorMap.get(hex) || 0) + 1);
        }
    }
    
    // Filter out common unwanted colors (white, black, transparent equivalents)
    const filteredColors = Array.from(colorMap.entries())
        .filter(([color]) => !isCommonColor(color))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([color]) => color);
    
    return filteredColors.length > 0 ? filteredColors : ['#2563eb', '#0891b2', '#059669'];
}

function extractFonts(cssText) {
    const fontMap = new Map();
    
    // Regex to find font-family declarations
    const fontFamilyPattern = /font-family\s*:\s*([^;{}]+)/gi;
    
    let match;
    while ((match = fontFamilyPattern.exec(cssText)) !== null) {
        const fontStack = match[1].trim();
        const fonts = parseFontStack(fontStack);
        
        for (const font of fonts) {
            if (font && !isGenericFont(font)) {
                fontMap.set(font, (fontMap.get(font) || 0) + 1);
            }
        }
    }
    
    // Sort by frequency and get top fonts
    const sortedFonts = Array.from(fontMap.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([font]) => font);
    
    return sortedFonts.length > 0 ? sortedFonts : ['Inter', 'Roboto', 'Arial'];
}

function displayResults() {
    // Clear previous results
    colorPalette.innerHTML = '';
    typography.innerHTML = '';
    
    // Display colors
    for (const color of extractedColors) {
        const swatch = createColorSwatch(color);
        colorPalette.appendChild(swatch);
    }
    
    // Display fonts
    for (let index = 0; index < extractedFonts.length; index++) {
        const font = extractedFonts[index];
        const fontItem = createFontItem(font, index);
        typography.appendChild(fontItem);
    }
    
    // Show results section
    showResults();
}

function createColorSwatch(color) {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch';
    swatch.style.backgroundColor = color;
    swatch.setAttribute('role', 'button');
    swatch.setAttribute('tabindex', '0');
    swatch.setAttribute('aria-label', `Copy color ${color}`);
    
    const code = document.createElement('div');
    code.className = 'color-code';
    code.textContent = color.toUpperCase();
    
    swatch.appendChild(code);
    
    // Click to copy
    const copyColor = () => {
        copyToClipboard(color);
        showCopyFeedback(`Copied ${color}!`);
    };
    
    swatch.addEventListener('click', copyColor);
    swatch.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            copyColor();
        }
    });
    
    return swatch;
}

function createFontItem(font, index) {
    const item = document.createElement('div');
    item.className = 'font-item';
    
    const name = document.createElement('div');
    name.className = 'font-name';
    
    let prefix = '';
    if (index === 0) {
        prefix = 'Primary: ';
    } else if (index === 1) {
        prefix = 'Secondary: ';
    }
    name.textContent = `${prefix}${font}`;
    
    const sample = document.createElement('div');
    sample.className = 'font-sample';
    sample.style.fontFamily = `${font}, sans-serif`;
    sample.textContent = 'The quick brown fox jumps over the lazy dog.';
    
    item.appendChild(name);
    item.appendChild(sample);
    
    return item;
}

async function handleCopyCss() {
    copyCssBtn.disabled = true;
    const cssVariables = generateCssVariables();
    await copyToClipboard(cssVariables);
    showCopyFeedback('CSS Variables copied to clipboard!');
    setTimeout(() => {
        copyCssBtn.disabled = false;
    }, 2000);
}

function generateCssVariables() {
    let css = ':root {\n';
    css += '  /* Color Palette */\n';
    
    for (let index = 0; index < extractedColors.length; index++) {
        const color = extractedColors[index];
        let varName;
        if (index === 0) {
            varName = 'primary';
        } else if (index === 1) {
            varName = 'secondary';
        } else if (index === 2) {
            varName = 'accent';
        } else {
            varName = `color-${index + 1}`;
        }
        css += `  --${varName}-color: ${color};\n`;
    }
    
    css += '\n  /* Typography */\n';
    for (let index = 0; index < extractedFonts.length; index++) {
        const font = extractedFonts[index];
        let varName;
        if (index === 0) {
            varName = 'primary';
        } else if (index === 1) {
            varName = 'secondary';
        } else {
            varName = `font-${index + 1}`;
        }
        css += `  --font-${varName}: ${font}, sans-serif;\n`;
    }
    
    css += '}\n';
    return css;
}

// ===================================
// Helper Functions
// ===================================

function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (error) {
        // Invalid URL format - log for debugging
        console.debug('Invalid URL format:', error.message);
        return false;
    }
}

function normalizeHex(hex) {
    // Convert 3-digit hex to 6-digit
    if (hex.length === 4) {
        return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex.toLowerCase();
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => {
        const hex = x.toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }).join('');
}

function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs((h / 60) % 2 - 1));
    const m = l - c / 2;
    
    let r = 0;
    let g = 0;
    let b = 0;
    
    if (h >= 0 && h < 60) {
        r = c;
        g = x;
    } else if (h >= 60 && h < 120) {
        r = x;
        g = c;
    } else if (h >= 120 && h < 180) {
        g = c;
        b = x;
    } else if (h >= 180 && h < 240) {
        g = x;
        b = c;
    } else if (h >= 240 && h < 300) {
        r = x;
        b = c;
    } else if (h >= 300 && h < 360) {
        r = c;
        b = x;
    }
    
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return rgbToHex(r, g, b);
}

function isCommonColor(hex) {
    const common = ['#ffffff', '#fff', '#000000', '#000', '#transparent', '#fefefe', '#010101'];
    return common.includes(hex.toLowerCase());
}

function isValidRgbValue(value) {
    return value >= 0 && value <= 255;
}

function isValidHslValue(h, s, l) {
    return h >= 0 && h <= 360 && s >= 0 && s <= 100 && l >= 0 && l <= 100;
}

function parseFontStack(fontStack) {
    return fontStack
        .split(',')
        .map(font => font.trim().replaceAll(/['"]/g, ''))
        .filter(font => font.length > 0);
}

function isGenericFont(font) {
    const generic = ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'];
    return generic.includes(font.toLowerCase());
}

async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
    } catch (err) {
        console.error('Failed to copy:', err);
    }
}

function showCopyFeedback(message) {
    copyFeedback.textContent = message;
    copyFeedback.classList.remove('hidden');
    setTimeout(() => {
        copyFeedback.classList.add('hidden');
    }, 2000);
}

// UI State Management
function showLoading() {
    loadingIndicator.classList.remove('hidden');
}

function hideLoading() {
    loadingIndicator.classList.add('hidden');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
}

function hideError() {
    errorMessage.classList.add('hidden');
}

function showResults() {
    resultsSection.classList.remove('hidden');
}

function hideResults() {
    resultsSection.classList.add('hidden');
}
