/**
 * Web Worker for Windowed Spectrogram Plugin
 * Handles FFT calculations for frequency analysis
 */

// FFT Implementation - Based on https://github.com/corbanbrook/dsp.js
class FFT {
  bufferSize: number
  sampleRate: number
  bandwidth: number
  sinTable: Float32Array
  cosTable: Float32Array
  windowValues: Float32Array
  reverseTable: Uint32Array
  peakBand: number
  peak: number

  constructor(bufferSize: number, sampleRate: number, windowFunc: string, alpha: number) {
    this.bufferSize = bufferSize
    this.sampleRate = sampleRate
    this.bandwidth = (2 / bufferSize) * (sampleRate / 2)

    this.sinTable = new Float32Array(bufferSize)
    this.cosTable = new Float32Array(bufferSize)
    this.windowValues = new Float32Array(bufferSize)
    this.reverseTable = new Uint32Array(bufferSize)

    this.peakBand = 0
    this.peak = 0

    var i
    switch (windowFunc) {
      case 'bartlett':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = (2 / (bufferSize - 1)) * ((bufferSize - 1) / 2 - Math.abs(i - (bufferSize - 1) / 2))
        }
        break
      case 'bartlettHann':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] =
            0.62 - 0.48 * Math.abs(i / (bufferSize - 1) - 0.5) - 0.38 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1))
        }
        break
      case 'blackman':
        alpha = alpha || 0.16
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] =
            (1 - alpha) / 2 -
            0.5 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1)) +
            (alpha / 2) * Math.cos((4 * Math.PI * i) / (bufferSize - 1))
        }
        break
      case 'cosine':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = Math.cos((Math.PI * i) / (bufferSize - 1) - Math.PI / 2)
        }
        break
      case 'gauss':
        alpha = alpha || 0.25
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = Math.pow(
            Math.E,
            -0.5 * Math.pow((i - (bufferSize - 1) / 2) / ((alpha * (bufferSize - 1)) / 2), 2),
          )
        }
        break
      case 'hamming':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = 0.54 - 0.46 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1))
        }
        break
      case 'hann':
      case undefined:
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = 0.5 * (1 - Math.cos((Math.PI * 2 * i) / (bufferSize - 1)))
        }
        break
      case 'lanczoz':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] =
            Math.sin(Math.PI * ((2 * i) / (bufferSize - 1) - 1)) / (Math.PI * ((2 * i) / (bufferSize - 1) - 1))
        }
        break
      case 'rectangular':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = 1
        }
        break
      case 'triangular':
        for (i = 0; i < bufferSize; i++) {
          this.windowValues[i] = (2 / bufferSize) * (bufferSize / 2 - Math.abs(i - (bufferSize - 1) / 2))
        }
        break
      default:
        throw Error("No such window function '" + windowFunc + "'")
    }

    var limit = 1
    var bit = bufferSize >> 1
    var i

    while (limit < bufferSize) {
      for (i = 0; i < limit; i++) {
        this.reverseTable[i + limit] = this.reverseTable[i] + bit
      }

      limit = limit << 1
      bit = bit >> 1
    }

    for (i = 0; i < bufferSize; i++) {
      this.sinTable[i] = Math.sin(-Math.PI / i)
      this.cosTable[i] = Math.cos(-Math.PI / i)
    }
  }

  calculateSpectrum(buffer: Float32Array): Float32Array {
    var bufferSize = this.bufferSize,
      cosTable = this.cosTable,
      sinTable = this.sinTable,
      reverseTable = this.reverseTable,
      real = new Float32Array(bufferSize),
      imag = new Float32Array(bufferSize),
      bSi = 2 / this.bufferSize,
      sqrt = Math.sqrt,
      rval,
      ival,
      mag,
      spectrum = new Float32Array(bufferSize / 2)

    var k = Math.floor(Math.log(bufferSize) / Math.LN2)

    if (Math.pow(2, k) !== bufferSize) {
      throw 'Invalid buffer size, must be a power of 2.'
    }
    if (bufferSize !== buffer.length) {
      throw (
        'Supplied buffer is not the same size as defined FFT. FFT Size: ' +
        bufferSize +
        ' Buffer Size: ' +
        buffer.length
      )
    }

    var halfSize = 1,
      phaseShiftStepReal,
      phaseShiftStepImag,
      currentPhaseShiftReal,
      currentPhaseShiftImag,
      off,
      tr,
      ti,
      tmpReal

    for (var i = 0; i < bufferSize; i++) {
      real[i] = buffer[reverseTable[i]] * this.windowValues[reverseTable[i]]
      imag[i] = 0
    }

    while (halfSize < bufferSize) {
      phaseShiftStepReal = cosTable[halfSize]
      phaseShiftStepImag = sinTable[halfSize]

      currentPhaseShiftReal = 1
      currentPhaseShiftImag = 0

      for (var fftStep = 0; fftStep < halfSize; fftStep++) {
        var i = fftStep

        while (i < bufferSize) {
          off = i + halfSize
          tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off]
          ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off]

          real[off] = real[i] - tr
          imag[off] = imag[i] - ti
          real[i] += tr
          imag[i] += ti

          i += halfSize << 1
        }

        tmpReal = currentPhaseShiftReal
        currentPhaseShiftReal = tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag
        currentPhaseShiftImag = tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal
      }

      halfSize = halfSize << 1
    }

    for (var i = 0, N = bufferSize / 2; i < N; i++) {
      rval = real[i]
      ival = imag[i]
      mag = bSi * sqrt(rval * rval + ival * ival)

      if (mag > this.peak) {
        this.peakBand = i
        this.peak = mag
      }
      spectrum[i] = mag
    }
    return spectrum
  }
}

// Global FFT instance (reused for performance)
let fft: FFT | null = null

const ERB_A = (1000 * Math.log(10)) / (24.7 * 4.37)
// Frequency scaling functions
function hzToMel(hz: number): number { return 2595 * Math.log10(1 + hz / 700) }
function melToHz(mel: number): number { return 700 * (Math.pow(10, mel / 2595) - 1) }
function hzToLog(hz: number): number { return Math.log10(Math.max(1, hz)) }
function logToHz(log: number): number { return Math.pow(10, log) }
function hzToBark(hz: number): number {
  let bark = (26.81 * hz) / (1960 + hz) - 0.53
  if (bark < 2) bark += 0.15 * (2 - bark)
  if (bark > 20.1) bark += 0.22 * (bark - 20.1)
  return bark
}
function barkToHz(bark: number): number {
  if (bark < 2) bark = (bark - 0.3) / 0.85
  if (bark > 20.1) bark = (bark + 4.422) / 1.22
  return 1960 * ((bark + 0.53) / (26.28 - bark))
}
function hzToErb(hz: number): number { return ERB_A * Math.log10(1 + hz * 0.00437) }
function erbToHz(erb: number): number { return (Math.pow(10, erb / ERB_A) - 1) / 0.00437 }

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
    fft = new FFT(fftSamples, sampleRate, windowFunc, alpha)
  }

  // Create filter bank based on scale (same logic as main thread)
  let filterBank = null
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

  const frequencies = []

  for (let c = 0; c < channels; c++) {
    const channelData = audioChannels[c]
    const channelFreq = []

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