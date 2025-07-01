#!/bin/bash

# Build the WASM module
echo "Building WASM module..."
# Install wasm-pack if not available
if ! command -v wasm-pack &> /dev/null; then
    echo "Installing wasm-pack..."
    curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
fi

# Install wasm-opt if not available (part of binaryen)
if ! command -v wasm-opt &> /dev/null; then
    echo "Installing wasm-opt (binaryen)..."
    if command -v brew &> /dev/null; then
        brew install binaryen
    elif command -v apt-get &> /dev/null; then
        sudo apt-get update && sudo apt-get install -y binaryen
    elif command -v yum &> /dev/null; then
        sudo yum install -y binaryen
    else
        echo "Please install binaryen (wasm-opt) manually: https://github.com/WebAssembly/binaryen"
        exit 1
    fi
fi

# Build the WASM module
wasm-pack build --target web --out-dir pkg --scope wavesurfer --release

# Optimize WASM file size with wasm-opt
echo "Optimizing WASM file size..."
wasm-opt -Oz -o pkg/wavesurfer_fft_bg.wasm pkg/wavesurfer_fft_bg.wasm

echo "WASM build complete!"
echo "Files generated in pkg/"

# Copy WASM files to dist directory for development server
echo "Copying WASM files to dist directory..."
mkdir -p dist/plugins
cp pkg/wavesurfer_fft_bg.wasm dist/plugins/
cp pkg/wavesurfer_fft.js dist/plugins/
cp pkg/wavesurfer_fft.d.ts dist/plugins/
echo "WASM files copied to dist/plugins/" 