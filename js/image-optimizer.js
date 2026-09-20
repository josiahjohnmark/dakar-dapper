/* ==========================================================================
   IMAGE-OPTIMIZER.JS — shrink photos in the browser before they are uploaded
   --------------------------------------------------------------------------
   A photo straight off a phone is typically 3–8 MB and 4000px wide. Nothing on
   the site displays wider than about 1200px, so uploading the original wastes
   the owner's time, the customer's data bundle and the storage quota.

   This resizes and re-encodes to WebP entirely on the device, before a single
   byte goes to the server. A 6 MB photo usually lands between 80 and 200 KB.
   ========================================================================== */

const IMG_OPT = {
  maxWidth: 1200,      // widest the storefront ever renders a product image
  maxHeight: 1600,
  quality: 0.82,       // visually lossless for photography at this size
  thumbWidth: 400,     // grid cards and cart rows
  thumbQuality: 0.78
};

/* Does this browser encode WebP from a canvas? Safari < 14 does not. */
let _webpSupport = null;
function canEncodeWebp() {
  if (_webpSupport !== null) return _webpSupport;
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 1;
    _webpSupport = c.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    _webpSupport = false;
  }
  return _webpSupport;
}

/* Decode the file, honouring EXIF rotation so portrait phone photos are not
   silently turned on their side. */
async function decodeImage(file) {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      /* Firefox throws on some progressive JPEGs — fall through. */
    }
  }
  return await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read that image.")); };
    img.src = url;
  });
}

function fitWithin(w, h, maxW, maxH) {
  const scale = Math.min(maxW / w, maxH / h, 1);
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/* Halving repeatedly then drawing the last step gives noticeably cleaner edges
   than one big downscale, which aliases badly on fabric texture and type. */
function drawScaled(source, targetW, targetH) {
  let curW = source.width;
  let curH = source.height;
  let canvas = document.createElement("canvas");
  let ctx;

  canvas.width = curW;
  canvas.height = curH;
  ctx = canvas.getContext("2d");
  ctx.drawImage(source, 0, 0);

  while (curW / 2 > targetW) {
    const nextW = Math.max(targetW, Math.round(curW / 2));
    const nextH = Math.max(targetH, Math.round(curH / 2));
    const step = document.createElement("canvas");
    step.width = nextW;
    step.height = nextH;
    const sctx = step.getContext("2d");
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(canvas, 0, 0, nextW, nextH);
    canvas = step;
    curW = nextW;
    curH = nextH;
  }

  const out = document.createElement("canvas");
  out.width = targetW;
  out.height = targetH;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  // A white base stops transparent PNGs turning black once flattened to WebP.
  octx.fillStyle = "#ffffff";
  octx.fillRect(0, 0, targetW, targetH);
  octx.drawImage(canvas, 0, 0, targetW, targetH);
  return out;
}

function canvasToBlob(canvas, type, quality) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality));
}

/**
 * Compress a user-selected image.
 * Returns { blob, thumbBlob, ext, mime, width, height, before, after, saved }.
 */
async function optimizeImage(file, opts = {}) {
  const cfg = { ...IMG_OPT, ...opts };
  const before = file.size;

  const bitmap = await decodeImage(file);
  const size = fitWithin(bitmap.width, bitmap.height, cfg.maxWidth, cfg.maxHeight);

  const useWebp = canEncodeWebp();
  const mime = useWebp ? "image/webp" : "image/jpeg";
  const ext = useWebp ? "webp" : "jpg";

  const full = drawScaled(bitmap, size.w, size.h);
  let blob = await canvasToBlob(full, mime, cfg.quality);

  const thumbSize = fitWithin(size.w, size.h, cfg.thumbWidth, cfg.thumbWidth * 2);
  const thumb = drawScaled(bitmap, thumbSize.w, thumbSize.h);
  const thumbBlob = await canvasToBlob(thumb, mime, cfg.thumbQuality);

  if (bitmap.close) bitmap.close();

  // If the original was already small and better compressed, keep it.
  if (blob && blob.size >= before && /^image\/(jpeg|webp)$/.test(file.type)) {
    blob = file;
  }

  return {
    blob,
    thumbBlob,
    ext: blob === file ? (file.name.split(".").pop() || "jpg").toLowerCase() : ext,
    mime: blob === file ? file.type : mime,
    width: size.w,
    height: size.h,
    before,
    after: blob.size,
    saved: Math.max(0, Math.round((1 - blob.size / before) * 100))
  };
}

function formatBytes(n) {
  if (n >= 1048576) return (n / 1048576).toFixed(1) + " MB";
  if (n >= 1024) return Math.round(n / 1024) + " KB";
  return n + " B";
}
