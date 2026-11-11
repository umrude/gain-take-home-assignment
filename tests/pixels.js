/**
 * Reads real rendered pixels, so visual requirements (Figure 1's strip, shadow, outline,
 * notched corners, focus ring) are checked on what the browser actually drew rather
 * than on our CSS values.
 */
const { PNG } = require('pngjs');

/**
 * Screenshot of an element plus a margin around it (to see outlines drawn outside it).
 * Returns at(x, y): the pixel at (x, y) relative to the element's top-left corner.
 */
async function pixelsAround(page, locator, margin = 12) {
  const box = await locator.boundingBox();
  const clip = { x: box.x - margin, y: box.y - margin, width: box.width + margin * 2, height: box.height + margin * 2 };
  const png = PNG.sync.read(await page.screenshot({ clip, animations: 'disabled', caret: 'hide' }));
  const at = (x, y) => {
    const px = Math.round(x + margin);
    const py = Math.round(y + margin);
    const i = (py * png.width + px) * 4;
    return { r: png.data[i], g: png.data[i + 1], b: png.data[i + 2] };
  };
  return { at, width: box.width, height: box.height };
}

// Perceived brightness, 0 (black) to 255 (white)
const lum = ({ r, g, b }) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
// Colour distance (0 = identical)
const dist = (a, b) => Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
// Saturation-ish: how far the channels are apart (0 = grey)
const chroma = ({ r, g, b }) => Math.max(r, g, b) - Math.min(r, g, b);
const isBlue = ({ r, g, b }) => b > r + 40 && b > g + 20;
const isGreen = ({ r, g, b }) => g > r + 30 && g > b + 30;

module.exports = { pixelsAround, lum, dist, chroma, isBlue, isGreen };
