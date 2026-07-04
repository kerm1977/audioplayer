const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// Read the SVG file
const svgBuffer = fs.readFileSync(path.join(__dirname, 'assets', 'icon.svg'));

// Icon sizes required for Linux
const sizes = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024];

// Generate icons for each size
sizes.forEach(size => {
    sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(path.join(__dirname, 'build', 'icons', `${size}x${size}.png`))
        .then(() => {
            console.log(`Generated ${size}x${size}.png`);
        })
        .catch(err => {
            console.error(`Error generating ${size}x${size}.png:`, err);
        });
});

console.log('Icon generation started...');
