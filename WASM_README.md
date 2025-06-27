# WASM-Accelerated FFT for Wavesurfer.js

This implementation adds optional Rust/WebAssembly acceleration to the windowed spectrogram plugin for significantly improved performance.

## 🚀 Performance Benefits

- **Lower CPU usage** and more consistent performance
- **No garbage collection pauses** during intensive calculations
- **SIMD optimizations** when available

## 🔧 Building WASM Module

### Prerequisites

1. **Install Rust**: https://rustup.rs/
2. **Install wasm-pack**:
   ```bash
   curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
   ```

### Build Commands

```bash
# Build only WASM
npm run build:wasm

# Build everything (JavaScript + WASM)
npm run build:all
```

### Build Output

The WASM module will be generated in `dist/wasm/`:
- `wavesurfer_fft.js` - JavaScript bindings
- `wavesurfer_fft_bg.wasm` - WebAssembly module
- `wavesurfer_fft.d.ts` - TypeScript definitions

## 📦 Usage

The WASM acceleration is **completely optional** and transparent:

```javascript
import WindowedSpectrogram from 'wavesurfer.js/dist/plugins/spectrogram-windowed.esm.js'

const spectrogram = WindowedSpectrogram.create({
  useWebWorker: true, // Enable worker (required for WASM)
  // ... other options
})

// Check if WASM is available
const wasmAvailable = await spectrogram.checkWasmAvailability()
console.log('WASM acceleration:', wasmAvailable ? 'enabled' : 'not available')
```

## 🛡️ Fallback Behavior

The plugin is designed to work seamlessly whether WASM is available or not:

1. **WASM Available**: Uses Rust implementation for maximum performance
2. **WASM Not Available**: Falls back to JavaScript implementation
3. **WASM Fails**: Automatically switches to JavaScript with warning

## 🏗️ Architecture

### Rust Side (`src/lib.rs`)

- **WasmFFT**: High-performance FFT implementation using `rustfft`
- **WasmFilterBank**: Optimized frequency scaling (mel, bark, erb, etc.)
- **Window Functions**: All standard window functions (Hann, Hamming, etc.)
- **dB Conversion**: Fast magnitude to color index conversion

### JavaScript Side

- **Worker Integration**: WASM runs in web worker for non-blocking operation  
- **Automatic Detection**: Tries to load WASM, falls back if unavailable
- **Performance Monitoring**: Tracks processing times for comparison

## 📊 Performance Comparison

TODO

## 🧪 Testing

### Development Testing

```bash
# Start development server
npm run serve

# Open the WASM example
open http://localhost:9090/examples/spectrogram-wasm.js
```

### Performance Testing

The `spectrogram-wasm.js` example includes real-time performance monitoring that shows:
- WASM availability status
- Processing time comparison
- Automatic fallback behavior

## 🔍 Debugging

### Common Issues

1. **WASM not loading**: Check browser console for import errors
2. **Worker fails**: Ensure `useWebWorker: true` is set
3. **Build fails**: Verify Rust and wasm-pack are installed

### Debug Mode

Set `console.log` in the worker to see detailed WASM loading status:

```javascript
// Worker will log:
// "🦀 WASM FFT module loaded successfully!" - Success
// "WASM FFT not available, using JavaScript fallback" - Fallback
```

## 📝 Browser Compatibility

### WASM Support
- ✅ Chrome 57+
- ✅ Firefox 52+  
- ✅ Safari 11+
- ✅ Edge 16+

### Worker Support
- ✅ All modern browsers
- ✅ ES6 modules in workers (Chrome 80+, Firefox 114+)

## 🔒 Security Considerations

- WASM module is built from source and included in distribution
- No external WASM dependencies at runtime
- Worker runs in sandboxed environment
- Graceful fallback ensures functionality even if WASM is blocked

## 🤝 Contributing

### Rust Development

```bash
# Test Rust code
cargo test

# Check for common issues
cargo clippy

# Format code
cargo fmt
```

### JavaScript Integration

- Worker code is embedded in the plugin for distribution
- Changes to Rust require rebuilding WASM
- Test both WASM and fallback paths

## 📄 License

WASM components follow the same BSD-3-Clause license as the main project. 