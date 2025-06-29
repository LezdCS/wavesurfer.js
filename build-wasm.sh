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

echo "WASM build complete!"
echo "Files generated in pkg/"

# Copy WASM files to dist directory for development server
echo "Copying WASM files to dist directory..."
mkdir -p dist/plugins
cp pkg/wavesurfer_fft_bg.wasm dist/plugins/
cp pkg/wavesurfer_fft.js dist/plugins/
cp pkg/wavesurfer_fft.d.ts dist/plugins/
echo "WASM files copied to dist/plugins/" 