/**
 * Spectrogram with Web Worker Example
 * 
 * This example demonstrates using the web worker option for FFT calculations
 * in the spectrogram plugin, which can improve UI responsiveness by offloading
 * intensive FFT calculations to a background thread.
 */

import WaveSurfer from '../dist/wavesurfer.esm.js'
import SpectrogramPlugin from '../dist/plugins/spectrogram.esm.js'

// Create wavesurfer instance
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: 'rgb(200, 0, 200)',
  progressColor: 'rgb(100, 0, 100)',
})

// Create spectrogram plugin with web worker enabled
const spectrogram = SpectrogramPlugin.create({
  container: '#spectrogram',
  labels: true,
  height: 256,
  splitChannels: true,
  // Enable web worker for FFT calculations (off by default)
  useWebWorker: true,
  // Also available: WASM for main thread calculations (on by default)
  useWasm: true,
  // Window function for FFT
  windowFunc: 'hann',
  // FFT size - larger values give better frequency resolution but slower processing
  fftSamples: 1024,
  // Frequency scale
  scale: 'mel',
  // Color settings
  gainDB: 20,
  rangeDB: 80,
  colorMap: 'roseus'
})

// Register the plugin
wavesurfer.registerPlugin(spectrogram)

// Load audio
wavesurfer.load('./audio/librivox.mp3')

// Show loading progress
spectrogram.on('ready', () => {
  console.log('✅ Spectrogram ready!')
})

// Performance comparison buttons
document.getElementById('worker-on')?.addEventListener('click', () => {
  // Recreate plugin with worker enabled
  wavesurfer.destroy()
  createWaveSurfer(true)
})

document.getElementById('worker-off')?.addEventListener('click', () => {
  // Recreate plugin without worker
  wavesurfer.destroy()
  createWaveSurfer(false)
})

function createWaveSurfer(useWorker) {
  const ws = WaveSurfer.create({
    container: '#waveform',
    waveColor: 'rgb(200, 0, 200)',
    progressColor: 'rgb(100, 0, 100)',
  })

  const spec = SpectrogramPlugin.create({
    container: '#spectrogram',
    labels: true,
    height: 256,
    useWebWorker: useWorker,
    useWasm: true,
    windowFunc: 'hann',
    fftSamples: 1024,
    scale: 'mel',
    gainDB: 20,
    rangeDB: 80,
    colorMap: 'roseus'
  })

  ws.registerPlugin(spec)
  ws.load('./audio/librivox.mp3')

  console.log(`🔧 Spectrogram ${useWorker ? 'WITH' : 'WITHOUT'} web worker`)

  spec.on('ready', () => {
    console.log(`✅ Spectrogram ready (worker: ${useWorker})`)
  })

  return { wavesurfer: ws, spectrogram: spec }
} 