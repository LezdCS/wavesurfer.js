/**
 * Spectrogram plugin with performance optimizations for large files
 *
 * This example shows how to use the spectrogram plugin with performance
 * optimizations enabled to handle large audio files without lag during zoom.
 */

import WaveSurfer from 'wavesurfer.js'
import SpectrogramPlugin from 'wavesurfer.js/dist/plugins/spectrogram.esm.js'

// Create an instance of WaveSurfer
const wavesurfer = WaveSurfer.create({
  container: '#waveform',
  waveColor: 'rgb(200, 0, 200)',
  progressColor: 'rgb(100, 0, 100)',
  url: '/examples/audio/audio.wav',
  minPxPerSec: 100,
})

// Initialize the Spectrogram plugin with performance optimizations
const spectrogram = SpectrogramPlugin.create({
  labels: true,
  height: 200,
  // Performance mode is enabled by default for better zoom performance
  performanceMode: true,
  // You can disable it if you prefer the original behavior
  // performanceMode: false,
})

wavesurfer.registerPlugin(spectrogram)

// Performance monitoring
let renderCount = 0
let lastRenderTime = Date.now()

spectrogram.on('ready', () => {
  renderCount++
  const now = Date.now()
  const renderTime = now - lastRenderTime
  console.log(`Spectrogram render #${renderCount} took ${renderTime}ms`)
  lastRenderTime = now
})

// Zoom controls
const zoomSlider = document.querySelector('#zoom')
const zoomValue = document.querySelector('#zoom-value')
const clearCacheBtn = document.querySelector('#clear-cache')

if (zoomSlider) {
  zoomSlider.addEventListener('input', (e) => {
    const minPxPerSec = e.target.valueAsNumber
    zoomValue.textContent = minPxPerSec
    wavesurfer.zoom(minPxPerSec)
  })
}

if (clearCacheBtn) {
  clearCacheBtn.addEventListener('click', () => {
    spectrogram.clearCache()
    console.log('Spectrogram cache cleared')
  })
}

// Show performance stats
wavesurfer.on('zoom', (minPxPerSec) => {
  console.log(`Zoomed to ${minPxPerSec}px/s`)
})

/*
<html>
  <div>
    <label>
      Zoom: <input type="range" id="zoom" min="10" max="1000" value="100" />
      <span id="zoom-value">100</span> px/s
    </label>
    <button id="clear-cache">Clear Cache</button>
  </div>
  
  <div id="waveform"></div>
  
  <p>
    📖 This example demonstrates performance optimizations for the spectrogram plugin.
    The plugin now caches frequency data and throttles rendering to improve zoom performance
    on large files. Open the console to see performance metrics.
  </p>
  
  <h3>Performance Features:</h3>
  <ul>
    <li><strong>Frequency Caching:</strong> FFT calculations are cached and reused</li>
    <li><strong>Render Throttling:</strong> Rendering is throttled to ~60fps</li>
    <li><strong>Smart Resampling:</strong> Optimized resampling algorithms</li>
    <li><strong>Zoom Threshold:</strong> Small zoom changes use cached data</li>
  </ul>
</html>
*/ 