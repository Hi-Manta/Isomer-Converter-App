/**
 * videoConverter.js
 * Handles video & audio conversions via FFmpeg.wasm
 */

export const VIDEO_CONVERSIONS = {
    mov: ['mp4', 'webm', 'avi', 'mkv', 'gif'],
    avi: ['mp4', 'webm', 'mkv', 'mov'],
    mkv: ['mp4', 'webm', 'avi', 'mov'],
    webm: ['mp4', 'avi', 'mkv', 'mov'],
    flv: ['mp4', 'webm', 'avi'],
    wmv: ['mp4', 'webm', 'avi'],
    m4v: ['mp4', 'webm', 'avi'],
    '3gp': ['mp4', 'webm'],
    ts: ['mp4', 'webm'],
    mts: ['mp4', 'webm'],
    mp4: ['webm', 'avi', 'mkv', 'mov', 'gif'],
};

export const AUDIO_CONVERSIONS = {
    mp3: ['wav', 'ogg', 'aac', 'flac', 'm4a'],
    wav: ['mp3', 'ogg', 'aac', 'flac', 'm4a'],
    ogg: ['mp3', 'wav', 'aac', 'flac'],
    aac: ['mp3', 'wav', 'ogg', 'flac'],
    flac: ['mp3', 'wav', 'ogg', 'aac'],
    m4a: ['mp3', 'wav', 'ogg', 'flac'],
    wma: ['mp3', 'wav', 'ogg'],
    opus: ['mp3', 'wav', 'ogg'],
    aiff: ['mp3', 'wav', 'ogg', 'flac'],
};

let ffmpegInstance = null;
let ffmpegLoaded = false;
let ffmpegLoading = false;

const { FFmpeg } = FFmpegWASM;
const { fetchFile, toBlobURL } = FFmpegUtil;

/**
 * Load FFmpeg.wasm. Safe to call multiple times — loads only once.
 * @param {function} onStatus - callback(string)
 */
export async function loadFFmpeg(onStatus = () => { }) {
    if (ffmpegLoaded) return ffmpegInstance;
    if (ffmpegLoading) {
        // Wait for in-progress load
        while (ffmpegLoading) await new Promise(r => setTimeout(r, 200));
        return ffmpegInstance;
    }

    ffmpegLoading = true;
    onStatus('Downloading FFmpeg engine (first time only) …');

    try {
        ffmpegInstance = new FFmpeg();

        ffmpegInstance.on('log', ({ message }) => {
            // optional: can surface this for debug
        });

        const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
        await ffmpegInstance.load({
            coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
            wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
        });

        ffmpegLoaded = true;
        ffmpegLoading = false;
        onStatus('FFmpeg ready.');
        return ffmpegInstance;
    } catch (e) {
        ffmpegLoading = false;
        throw new Error(`Failed to load FFmpeg: ${e.message}`);
    }
}

export function isFFmpegLoaded() { return ffmpegLoaded; }

/**
 * Convert a video or audio File.
 * @param {File} file - Source file
 * @param {string} targetFmt - e.g. 'mp4'
 * @param {number} quality - 0–100 CRF (lower = better quality, larger file)
 * @param {function} onProgress - callback(0–100)
 * @param {function} onStatus - callback(string)
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function convertMedia(file, targetFmt, quality = 23, onProgress = () => { }, onStatus = () => { }) {
    const ffmpeg = await loadFFmpeg(onStatus);
    onProgress(5);
    onStatus('Loading file …');

    const inputName = `input.${file.name.split('.').pop().toLowerCase()}`;
    const outputName = `output.${targetFmt}`;

    await ffmpeg.writeFile(inputName, await fetchFile(file));
    onProgress(20);
    onStatus('Converting …');

    // Build FFmpeg args based on target format
    const args = buildArgs(inputName, outputName, targetFmt, quality);

    // Progress listener
    ffmpeg.on('progress', ({ progress }) => {
        // progress is 0–1, map to 20–90
        const pct = 20 + Math.round(progress * 70);
        onProgress(Math.min(pct, 90));
    });

    await ffmpeg.exec(args);
    onProgress(92);
    onStatus('Packaging output …');

    const data = await ffmpeg.readFile(outputName);
    const blob = new Blob([data.buffer], { type: getMimeForExt(targetFmt) });

    // Clean up
    try { await ffmpeg.deleteFile(inputName); } catch (_) { }
    try { await ffmpeg.deleteFile(outputName); } catch (_) { }

    onProgress(100);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return { blob, filename: `${baseName}.${targetFmt}` };
}

function buildArgs(input, output, targetFmt, quality) {
    const q = Math.round((100 - quality) * 0.51); // map 0-100 to crf ~0-51, invert so 100 = high quality
    const crf = Math.max(0, Math.min(51, q));

    switch (targetFmt) {
        case 'mp4':
            return ['-i', input, '-c:v', 'libx264', '-crf', String(crf), '-preset', 'fast', '-c:a', 'aac', '-movflags', '+faststart', output];
        case 'webm':
            return ['-i', input, '-c:v', 'libvpx-vp9', '-crf', String(crf), '-b:v', '0', '-c:a', 'libopus', output];
        case 'avi':
            return ['-i', input, '-c:v', 'mpeg4', '-q:v', String(Math.max(1, Math.round(crf / 4))), '-c:a', 'mp3', output];
        case 'mkv':
            return ['-i', input, '-c:v', 'libx264', '-crf', String(crf), '-c:a', 'aac', output];
        case 'mov':
            return ['-i', input, '-c:v', 'libx264', '-crf', String(crf), '-c:a', 'aac', output];
        case 'gif':
            return ['-i', input, '-vf', 'fps=15,scale=480:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse', '-loop', '0', output];
        case 'mp3':
            return ['-i', input, '-c:a', 'libmp3lame', '-q:a', String(Math.max(0, Math.round(crf / 6))), output];
        case 'wav':
            return ['-i', input, '-c:a', 'pcm_s16le', output];
        case 'ogg':
            return ['-i', input, '-c:a', 'libvorbis', '-q:a', String(Math.max(1, Math.round(10 - crf / 6))), output];
        case 'aac':
            return ['-i', input, '-c:a', 'aac', '-b:a', '192k', output];
        case 'flac':
            return ['-i', input, '-c:a', 'flac', output];
        case 'm4a':
            return ['-i', input, '-c:a', 'aac', '-b:a', '256k', output];
        default:
            return ['-i', input, output];
    }
}

function getMimeForExt(ext) {
    const map = {
        mp4: 'video/mp4', webm: 'video/webm', avi: 'video/avi',
        mkv: 'video/x-matroska', mov: 'video/quicktime', gif: 'image/gif',
        mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
        aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4',
    };
    return map[ext] || 'application/octet-stream';
}
