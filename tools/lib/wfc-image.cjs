/** Read native SVG element channels and encode grayscale/material reference PNGs. */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { DOMParser } = require('@xmldom/xmldom');
const { PNG } = require('pngjs');
const NS = 'https://talus.dev/ns/world';

function readElementImage(file) {
    const document = new DOMParser().parseFromString(fs.readFileSync(file, 'utf8'), 'image/svg+xml');
    const node = [...document.getElementsByTagNameNS('http://www.w3.org/2000/svg', 'image')]
        .find(node => node.getAttributeNS(NS, 'channel') === 'element');
    assert(node, 'Missing element image in ' + file);
    const uri = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    assert(uri.startsWith('data:image/png;base64,'), 'Element image must be an embedded PNG');
    const image = PNG.sync.read(Buffer.from(uri.split(',')[1], 'base64'));
    const pixels = Buffer.alloc(image.width * image.height);
    for (let i = 0; i < pixels.length; i++) {
        const [r, g, b, a] = image.data.subarray(i * 4, i * 4 + 4);
        assert(r === g && g === b && a === 255, 'Element PNG must contain opaque grayscale indices');
        pixels[i] = r;
    }
    const palette = new Map([...document.getElementsByTagNameNS(NS, 'element')]
        .map(node => [Number(node.getAttribute('index')), { name: node.getAttribute('name'), color: node.getAttribute('color') }]));
    return { width: image.width, height: image.height, pixels, palette };
}

function crop(image, x, y, width, height) {
    assert(x >= 0 && y >= 0 && x + width <= image.width && y + height <= image.height, 'Crop exceeds image bounds');
    const pixels = Buffer.alloc(width * height);
    for (let row = 0; row < height; row++) image.pixels.copy(pixels, row * width, (y + row) * image.width + x, (y + row) * image.width + x + width);
    return pixels;
}

function pngData(width, height, pixels, palette) {
    let data = pixels, colorType = 0;
    if (palette) {
        colorType = 2;
        data = Buffer.alloc(width * height * 3);
        const colors = new Map([[0, Buffer.from([21, 27, 48])], ...[...palette].map(([id, entry]) => [id, Buffer.from(entry.color.slice(1), 'hex')])]);
        for (let i = 0; i < pixels.length; i++) colors.get(pixels[i]).copy(data, i * 3);
    }
    return PNG.sync.write({ width, height, data }, { colorType, inputColorType: colorType }).toString('base64');
}

module.exports = { readElementImage, crop, pngData };
