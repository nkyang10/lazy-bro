// Build script — verifies required files and packages the extension as .zip.
// Run: node build.js
// Output: dist/lazy-bro.zip

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Core files required for the extension to load.
// NOTE: sidebar.* files removed — the popup is now the sole UI.
// system-prompt.md is loaded dynamically at runtime.
const REQUIRED_FILES = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'api-service.js',
  'config.js',
  'settings-panel.js',
  'content-script.js',
  'system-prompt.js',
  'system-prompt.md',
  'history.js'
];

const REQUIRED_ICONS = [
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png'
];

function verifyFiles() {
  const missing = [];

  for (const file of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(__dirname, file))) {
      missing.push(file);
    }
  }

  for (const icon of REQUIRED_ICONS) {
    if (!fs.existsSync(path.join(__dirname, icon))) {
      missing.push(icon);
    }
  }

  if (missing.length > 0) {
    console.error('Missing required files:', missing.join(', '));
    process.exit(1);
  }

  console.log('All required files present.');
}

function createBuildDir() {
  const buildDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(buildDir)) {
    fs.mkdirSync(buildDir, { recursive: true });
  }
  return buildDir;
}

function build() {
  console.log('Starting extension build...');

  verifyFiles();

  const buildDir = createBuildDir();
  const outputPath = path.join(buildDir, 'lazy-bro.zip');

  const output = fs.createWriteStream(outputPath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  output.on('close', () => {
    console.log(`Build complete: ${archive.pointer()} bytes written to ${outputPath}`);
  });

  archive.on('error', (err) => {
    throw err;
  });

  archive.pipe(output);

  // Package everything except dev/build artifacts.
  archive.glob('**/*', {
    cwd: __dirname,
    skip: ['node_modules/**', 'dist/**', '.maestro/**', 'build.js', 'package.json', 'package-lock.json', 'manifest-comments.md']
  });

  archive.finalize();
}

build();