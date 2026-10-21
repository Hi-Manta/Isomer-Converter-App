/**
 * imageConverter.js
 * Handles image format conversions:
 *   HEIC → JPG / PNG / WebP
 *   JPG / PNG / WebP / BMP / GIF / TIFF → any raster format
 */

// Supported image conversions map: source ext → [allowed targets]
export const IMAGE_CONVERSIONS = {
  heic:  ['jpg', 'png', 'webp'],
  heif:  ['jpg', 'png', 'webp'],
  jpg:   ['png', 'webp', 'bmp', 'gif'],
  jpeg:  ['png', 'webp', 'bmp', 'gif'],
  png:   ['jpg', 'webp', 'bmp', 'gif'],
  webp:  ['jpg', 'png', 'bmp'],
  bmp:   ['jpg', 'png', 'webp'],
  gif:   ['jpg', 'png', 'webp'],
  tiff:  ['jpg', 'png', 'webp'],
  tif:   ['jpg', 'png', 'webp'],
  avif:  ['jpg', 'png', 'webp'],
  svg:   ['png', 'jpg', 'webp'],
};

const MIME = {
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
  png:  'image/png',
  webp: 'image/webp',
  bmp:  'image/bmp',
  gif:  'image/gif',
};

/**
 * Convert an image File to the target format.
 * @param {File} file - The source image file
 * @param {string} targetFmt - Target extension (e.g. 'jpg')
 * @param {number} quality - 0–1 for lossy formats
 * @param {function} onProgress - callback(0-100)
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function convertImage(file, targetFmt, quality = 0.92, onProgress = () => {}) {
  const ext = file.name.split('.').pop().toLowerCase();
  onProgress(10);

  let sourceBlob = file;

  // — HEIC/HEIF: use heic2any lib (loaded globally from CDN)
  if (ext === 'heic' || ext === 'heif') {
    if (typeof heic2any === 'undefined') {
      throw new Error('heic2any library not loaded. Please check your connection.');
    }
    onProgress(30);
    const outputType = targetFmt === 'jpg' ? 'image/jpeg' : `image/${targetFmt}`;
    sourceBlob = await heic2any({
      blob: file,
      toType: outputType,
      quality: quality,
    });
    if (Array.isArray(sourceBlob)) sourceBlob = sourceBlob[0];
    onProgress(90);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return { blob: sourceBlob, filename: `${baseName}.${targetFmt}` };
  }

  // — SVG: draw on canvas
  if (ext === 'svg') {
    onProgress(30);
    const url = URL.createObjectURL(file);
    const result = await svgToCanvas(url, targetFmt, quality);
    URL.revokeObjectURL(url);
    onProgress(90);
    const baseName = file.name.replace(/\.[^.]+$/, '');
    return { blob: result, filename: `${baseName}.${targetFmt}` };
  }

  // — Standard raster: draw through <img> → <canvas>
  onProgress(30);
  const url = URL.createObjectURL(file);
  const blob = await rasterConvert(url, targetFmt, quality, ext);
  URL.revokeObjectURL(url);
  onProgress(90);
  const baseName = file.name.replace(/\.[^.]+$/, '');
  return { blob, filename: `${baseName}.${targetFmt}` };
}

function rasterConvert(url, targetFmt, quality, srcExt) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');

      // White background for JPG/BMP (no transparency)
      if (targetFmt === 'jpg' || targetFmt === 'jpeg' || targetFmt === 'bmp') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0);

      const mime = MIME[targetFmt] || `image/${targetFmt}`;
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
        mime,
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image. The file may be corrupted or unsupported.'));
    img.src = url;
  });
}

function svgToCanvas(url, targetFmt, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const W = img.width || 1024;
      const H = img.height || 1024;
      const canvas = document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (targetFmt === 'jpg' || targetFmt === 'bmp') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, W, H);
      }
      ctx.drawImage(img, 0, 0, W, H);
      const mime = MIME[targetFmt] || `image/${targetFmt}`;
      canvas.toBlob(
        (b) => b ? resolve(b) : reject(new Error('Canvas toBlob failed')),
        mime,
        quality
      );
    };
    img.onerror = () => reject(new Error('SVG load error'));
    img.src = url;
  });
}
