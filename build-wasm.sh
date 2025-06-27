#!/bin/bash

# Build the WASM module
echo "Building WASM module..."

# Install wasm-pack if not available
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Build the WASM module
wasm-pack build --target web --out-dir pkg --scope wavesurfer --release

# Copy the generated files to the dist directory
mkdir -p dist/wasm
cp pkg/wavesurfer_fft.js dist/wasm/
cp pkg/wavesurfer_fft_bg.wasm dist/wasm/
cp pkg/wavesurfer_fft.d.ts dist/wasm/

echo "WASM build complete!"
echo "Files generated in dist/wasm/" 