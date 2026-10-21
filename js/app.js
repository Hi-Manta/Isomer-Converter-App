/**
 * app.js - Main application controller
 */
import { IMAGE_CONVERSIONS, convertImage } from './imageConverter.js';
import { VIDEO_CONVERSIONS, AUDIO_CONVERSIONS, convertMedia, loadFFmpeg, isFFmpegLoaded } from './videoConverter.js';

// ── State ────────────────────────────────────────────────────
let currentFile = null;
let currentTab = 'image'; // 'image' | 'video' | 'audio'
let selectedFormat = null;
let resultURL = null;

// ── DOM refs ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const fileInput = $('fileInput');
const dropZone = $('dropZone');
const converterSection = $('converterSection');
const fileName = $('fileName');
const fileMeta = $('fileMeta');
const fileIconWrap = $('fileIconWrap');
const removeFileBtn = $('removeFileBtn');
const formatGrid = $('formatGrid');
const qualitySection = $('qualitySection');
const qualitySlider = $('qualitySlider');
const qualityVal = $('qualityVal');
const convertBtn = $('convertBtn');
const progressWrap = $('progressWrap');
const progressFill = $('progressFill');
const progressPct = $('progressPct');
const progressStatus = $('progressStatus');
const resultCard = $('resultCard');
const resultMeta = $('resultMeta');
const downloadBtn = $('downloadBtn');
const errorCard = $('errorCard');
const errorMsg = $('errorMsg');
const ffmpegBanner = $('ffmpegBanner');
const ffmpegBannerText = $('ffmpegBannerText');
const typeTabs = document.querySelectorAll('.type-tab');
const supportedFmts = $('supportedFmts');

// ── Format definitions ────────────────────────────────────────
const ALL_CONVERSIONS = {
    image: IMAGE_CONVERSIONS,
    video: VIDEO_CONVERSIONS,
    audio: AUDIO_CONVERSIONS,
};

const FORMAT_ICONS = {
    image: '🖼️', video: '🎬', audio: '🎵',
    jpg: '📷', jpeg: '📷', png: '🖼️', webp: '🌐', gif: '🎞️',
    bmp: '🖼️', svg: '📊', tiff: '📷', heic: '📱', heif: '📱',
    mp4: '🎬', mov: '🎬', avi: '📼', mkv: '📦', webm: '🌐',
    flv: '📺', wmv: '📺', m4v: '📱', '3gp': '📱',
    mp3: '🎵', wav: '🎵', ogg: '🎵', aac: '🎵', flac: '🎵', m4a: '🎵',
};

const CARD_COLORS = {
    image: '#6366f1', video: '#8b5cf6', audio: '#06b6d4',
};

// ── Tab switching ─────────────────────────────────────────────
typeTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        currentTab = tab.dataset.type;
        typeTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        updateSupportedFormats();
        if (currentFile) {
            const ext = currentFile.name.split('.').pop().toLowerCase();
            const map = ALL_CONVERSIONS[currentTab];
            if (!map[ext]) clearFile();
            else populateFormatGrid(ext);
        }
    });
});

function updateSupportedFormats() {
    const map = ALL_CONVERSIONS[currentTab];
    const exts = Object.keys(map);
    supportedFmts.innerHTML = exts.map(e =>
        `<span class="format-chip">${e.toUpperCase()}</span>`
    ).join('');
}
updateSupportedFormats();

// ── Drag & Drop ───────────────────────────────────────────────
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

// ── File handling ─────────────────────────────────────────────
function handleFile(file) {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    const map = ALL_CONVERSIONS[currentTab];

    // Auto-switch tab if possible
    if (!map[ext]) {
        let found = false;
        for (const [type, m] of Object.entries(ALL_CONVERSIONS)) {
            if (m[ext]) {
                currentTab = type;
                typeTabs.forEach(t => {
                    t.classList.toggle('active', t.dataset.type === type);
                });
                updateSupportedFormats();
                found = true;
                break;
            }
        }
        if (!found) {
            showError(`".${ext}" files are not supported. Please try a different file.`);
            return;
        }
    }

    currentFile = file;
    selectedFormat = null;
    clearResult();
    clearError();

    // Show file info
    fileName.textContent = file.name;
    fileMeta.textContent = `${formatSize(file.size)} · ${ext.toUpperCase()}`;
    fileIconWrap.textContent = FORMAT_ICONS[ext] || (currentTab === 'video' ? '🎬' : currentTab === 'audio' ? '🎵' : '🖼️');
    fileIconWrap.style.background = `linear-gradient(135deg, ${CARD_COLORS[currentTab]}33, ${CARD_COLORS[currentTab]}11)`;

    dropZone.classList.add('hidden');
    converterSection.classList.remove('hidden');

    populateFormatGrid(ext);

    // Show quality slider for media; hide for lossless targets
    qualitySection.classList.remove('hidden');
}

function populateFormatGrid(ext) {
    const targets = ALL_CONVERSIONS[currentTab][ext] || [];
    formatGrid.innerHTML = targets.map(fmt => `
    <button class="format-btn" data-fmt="${fmt}" id="fmt-${fmt}">
      ${fmt.toUpperCase()}
    </button>
  `).join('');

    formatGrid.querySelectorAll('.format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            formatGrid.querySelectorAll('.format-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            selectedFormat = btn.dataset.fmt;
            convertBtn.disabled = false;
            clearResult();
            clearError();

            // Hide quality slider for lossless formats
            const lossless = ['png', 'bmp', 'wav', 'flac', 'gif'];
            qualitySection.classList.toggle('hidden', lossless.includes(selectedFormat));
        });
    });

    convertBtn.disabled = true;
}

function clearFile() {
    currentFile = null;
    selectedFormat = null;
    fileInput.value = '';
    dropZone.classList.remove('hidden');
    converterSection.classList.add('hidden');
    clearResult();
    clearError();
    if (resultURL) { URL.revokeObjectURL(resultURL); resultURL = null; }
}

removeFileBtn.addEventListener('click', clearFile);

// ── Quality slider ────────────────────────────────────────────
qualitySlider.addEventListener('input', () => {
    qualityVal.textContent = qualitySlider.value + '%';
    qualitySlider.style.setProperty('--val', qualitySlider.value + '%');
});
qualitySlider.style.setProperty('--val', qualitySlider.value + '%');

// ── Convert ───────────────────────────────────────────────────
convertBtn.addEventListener('click', async () => {
    if (!currentFile || !selectedFormat) return;

    clearResult();
    clearError();
    convertBtn.disabled = true;
    progressWrap.classList.remove('hidden');
    setProgress(0, 'Starting …');

    const quality = parseInt(qualitySlider.value) / 100;
    const type = currentTab;
    const t0 = performance.now();

    try {
        let result;
        if (type === 'image') {
            result = await convertImage(currentFile, selectedFormat, quality, pct => setProgress(pct));
        } else {
            // Show FFmpeg banner if not yet loaded
            if (!isFFmpegLoaded()) {
                ffmpegBanner.classList.remove('hidden');
                ffmpegBannerText.textContent = 'Loading FFmpeg engine (first time, ~30 MB) …';
            }
            result = await convertMedia(
                currentFile, selectedFormat,
                parseInt(qualitySlider.value),
                pct => setProgress(pct),
                msg => { progressStatus.textContent = msg; ffmpegBannerText.textContent = msg; }
            );
            ffmpegBanner.classList.add('hidden');
        }

        const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
        setProgress(100, 'Done!');

        if (resultURL) URL.revokeObjectURL(resultURL);
        resultURL = URL.createObjectURL(result.blob);

        resultMeta.innerHTML = `
      <div class="stats-row">
        <div class="stat-chip"><div class="val">${formatSize(result.blob.size)}</div><div class="lbl">Output size</div></div>
        <div class="stat-chip"><div class="val">${formatSize(currentFile.size)}</div><div class="lbl">Original</div></div>
        <div class="stat-chip"><div class="val">${elapsed}s</div><div class="lbl">Time</div></div>
        <div class="stat-chip"><div class="val">${compressionRatio(currentFile.size, result.blob.size)}</div><div class="lbl">Ratio</div></div>
      </div>`;

        downloadBtn.href = resultURL;
        downloadBtn.download = result.filename;
        downloadBtn.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/>
      </svg>
      Download ${result.filename}`;

        resultCard.classList.remove('hidden');
    } catch (err) {
        ffmpegBanner.classList.add('hidden');
        showError(err.message || 'An unexpected error occurred during conversion.');
        console.error(err);
    } finally {
        convertBtn.disabled = false;
    }
});

// ── Helpers ───────────────────────────────────────────────────
function setProgress(pct, status) {
    progressFill.style.width = pct + '%';
    progressPct.textContent = pct + '%';
    if (status) progressStatus.textContent = status;
}

function clearResult() {
    resultCard.classList.add('hidden');
    progressWrap.classList.add('hidden');
    setProgress(0, '');
}

function clearError() {
    errorCard.classList.add('hidden');
}

function showError(msg) {
    errorMsg.textContent = msg;
    errorCard.classList.remove('hidden');
    progressWrap.classList.add('hidden');
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function compressionRatio(original, output) {
    if (!original) return '—';
    const ratio = output / original;
    if (ratio < 1) return `-${((1 - ratio) * 100).toFixed(0)}%`;
    return `+${((ratio - 1) * 100).toFixed(0)}%`;
}
