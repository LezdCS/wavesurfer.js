/**
 * Web Worker for Windowed Spectrogram Plugin
 * Handles FFT calculations for frequency analysis
 */

import FFT from '../fft'

// Global FFT instance (reused for performance)
let fft: any = null

const ERB_A = (1000 * Math.log(10)) / (24.7 * 4.37)
// Frequency scaling functions
function hzToMel(hz: number) { return 2595 * Math.log10(1 + hz / 700) }
function melToHz(mel: number) { return 700 * (Math.pow(10, mel / 2595) - 1) }
function hzToLog(hz: number) { return Math.log10(Math.max(1, hz)) }
function logToHz(log: number) { return Math.pow(10, log) }
function hzToBark(hz: number) {
  let bark = (26.81 * hz) / (1960 + hz) - 0.53
  if (bark < 2) bark += 0.15 * (2 - bark)
  if (bark > 20.1) bark += 0.22 * (bark - 20.1)
  return bark
}
function barkToHz(bark: number) {
  if (bark < 2) bark = (bark - 0.3) / 0.85
  if (bark > 20.1) bark = (bark + 4.422) / 1.22
  return 1960 * ((bark + 0.53) / (26.28 - bark))
}
function hzToErb(hz: number) { return ERB_A * Math.log10(1 + hz * 0.00437) }
function erbToHz(erb: number) { return (Math.pow(10, erb / ERB_A) - 1) / 0.00437 }

function createFilterBank(
  numFilters: number,
  fftSamples: number,
  sampleRate: number,
  hzToScale: (hz: number) => number,
  scaleToHz: (scale: number) => number,
): number[][] {
  const filterMin = hzToScale(0)
  const filterMax = hzToScale(sampleRate / 2)
  const filterBank = Array.from({ length: numFilters }, () => Array(fftSamples / 2 + 1).fill(0))
  const scale = sampleRate / fftSamples
  
  for (let i = 0; i < numFilters; i++) {
    let hz = scaleToHz(filterMin + (i / numFilters) * (filterMax - filterMin))
    let j = Math.floor(hz / scale)
    let hzLow = j * scale
    let hzHigh = (j + 1) * scale
    let r = (hz - hzLow) / (hzHigh - hzLow)
    filterBank[i][j] = 1 - r
    filterBank[i][j + 1] = r
  }
  return filterBank
}

function applyFilterBank(fftPoints: Float32Array, filterBank: number[][]): Float32Array {
  const numFilters = filterBank.length
  const logSpectrum = Float32Array.from({ length: numFilters }, () => 0)
  for (let i = 0; i < numFilters; i++) {
    for (let j = 0; j < fftPoints.length; j++) {
      logSpectrum[i] += fftPoints[j] * filterBank[i][j]
    }
  }
  return logSpectrum
}

// Worker message handler
self.onmessage = function(e) {
  const { type, id, audioData, options } = e.data
  
  if (type === 'calculateFrequencies') {
    try {
      const result = calculateFrequencies(audioData, options)
      self.postMessage({
        type: 'frequenciesResult',
        id: id,
        result: result
      })
    } catch (error) {
      self.postMessage({
        type: 'frequenciesResult',
        id: id,
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }
}

/**
 * Calculate frequency data for audio channels
 * @param {Float32Array[]} audioChannels - Audio channel data
 * @param {Object} options - Processing options
 * @returns {Uint8Array[][]} Frequency data per channel
 */
function calculateFrequencies(audioChannels: Float32Array[], options: any): Uint8Array[][] {
  const {
    startTime, endTime, sampleRate, fftSamples, windowFunc, alpha,
    noverlap, scale, gainDB, rangeDB, splitChannels
  } = options

  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.floor(endTime * sampleRate)
  const channels = splitChannels ? audioChannels.length : 1

  // Initialize FFT (reuse if possible for performance)
  if (!fft || fft.bufferSize !== fftSamples) {
    fft = new (FFT as any)(fftSamples, sampleRate, windowFunc, alpha)
  }

  // Create filter bank based on scale (same logic as main thread)
  let filterBank: number[][] | null = null
  const numFilters = fftSamples / 2 // Same as main thread
  
  switch (scale) {
    case 'mel':
      filterBank = createFilterBank(numFilters, fftSamples, sampleRate, hzToMel, melToHz)
      break
    case 'logarithmic':
      filterBank = createFilterBank(numFilters, fftSamples, sampleRate, hzToLog, logToHz)
      break
    case 'bark':
      filterBank = createFilterBank(numFilters, fftSamples, sampleRate, hzToBark, barkToHz)
      break
    case 'erb':
      filterBank = createFilterBank(numFilters, fftSamples, sampleRate, hzToErb, erbToHz)
      break
    case 'linear':
    default:
      // No filter bank for linear scale
      filterBank = null
      break
  }

  // Calculate hop size
  let actualNoverlap = noverlap || Math.max(0, Math.round(fftSamples * 0.5))
  const maxOverlap = fftSamples * 0.5
  actualNoverlap = Math.min(actualNoverlap, maxOverlap)
  const minHopSize = Math.max(64, fftSamples * 0.25)
  const hopSize = Math.max(minHopSize, fftSamples - actualNoverlap)

  const frequencies: Uint8Array[][] = []

  for (let c = 0; c < channels; c++) {
    const channelData = audioChannels[c]
    const channelFreq: Uint8Array[] = []

    for (let sample = startSample; sample + fftSamples < endSample; sample += hopSize) {
      const segment = channelData.slice(sample, sample + fftSamples)
      let spectrum = fft.calculateSpectrum(segment)
      
      // Apply filter bank if specified (same as main thread)
      if (filterBank) {
        spectrum = applyFilterBank(spectrum, filterBank)
      }

      // Convert to uint8 color indices
      const freqBins = new Uint8Array(spectrum.length)
      const gainPlusRange = gainDB + rangeDB
      
      for (let j = 0; j < spectrum.length; j++) {
        const magnitude = spectrum[j] > 1e-12 ? spectrum[j] : 1e-12
        const valueDB = 20 * Math.log10(magnitude)
        
        if (valueDB < -gainPlusRange) {
          freqBins[j] = 0
        } else if (valueDB > -gainDB) {
          freqBins[j] = 255
        } else {
          freqBins[j] = Math.round(((valueDB + gainDB) / rangeDB) * 255)
        }
      }
      channelFreq.push(freqBins)
    }
    frequencies.push(channelFreq)
  }

  return frequencies
} 