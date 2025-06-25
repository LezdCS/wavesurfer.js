/**
 * Web Worker for Windowed Spectrogram Plugin
 * Handles FFT calculations for frequency analysis
 */

// Basic FFT implementation for worker
function FFT(bufferSize, sampleRate, windowFunc, alpha) {
  this.bufferSize = bufferSize
  this.sampleRate = sampleRate
  this.sinTable = new Float32Array(bufferSize)
  this.cosTable = new Float32Array(bufferSize)
  this.windowValues = new Float32Array(bufferSize)
  this.reverseTable = new Uint32Array(bufferSize)
  this.peakBand = 0
  this.peak = 0

  // Initialize window function
  let i
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

  // Initialize bit-reversal table
  let limit = 1
  let bit = bufferSize >> 1
  while (limit < bufferSize) {
    for (let i = 0; i < limit; i++) {
      this.reverseTable[i + limit] = this.reverseTable[i] + bit
    }
    limit = limit << 1
    bit = bit >> 1
  }

  // Initialize trigonometric tables (matches spectrogram.ts exactly)
  for (i = 0; i < bufferSize; i++) {
    this.sinTable[i] = Math.sin(-Math.PI / i)
    this.cosTable[i] = Math.cos(-Math.PI / i)
  }

  this.calculateSpectrum = function(buffer) {
    const bufferSize = this.bufferSize
    const cosTable = this.cosTable
    const sinTable = this.sinTable
    const reverseTable = this.reverseTable
    const real = new Float32Array(bufferSize)
    const imag = new Float32Array(bufferSize)
    const bSi = 2 / this.bufferSize
    const sqrt = Math.sqrt
    const spectrum = new Float32Array(bufferSize / 2)

    const k = Math.floor(Math.log(bufferSize) / Math.LN2)
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

    // Apply window and bit reversal
    for (let i = 0; i < bufferSize; i++) {
      real[i] = buffer[reverseTable[i]] * this.windowValues[reverseTable[i]]
      imag[i] = 0
    }

    // FFT computation
    let halfSize = 1
    while (halfSize < bufferSize) {
      const phaseShiftStepReal = cosTable[halfSize]
      const phaseShiftStepImag = sinTable[halfSize]
      let currentPhaseShiftReal = 1
      let currentPhaseShiftImag = 0

      for (let fftStep = 0; fftStep < halfSize; fftStep++) {
        let i = fftStep
        while (i < bufferSize) {
          const off = i + halfSize
          const tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off]
          const ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off]

          real[off] = real[i] - tr
          imag[off] = imag[i] - ti
          real[i] += tr
          imag[i] += ti

          i += halfSize << 1
        }

        const tmpReal = currentPhaseShiftReal
        currentPhaseShiftReal = tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag
        currentPhaseShiftImag = tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal
      }
      halfSize = halfSize << 1
    }

    // Calculate magnitude spectrum
    for (let i = 0, N = bufferSize / 2; i < N; i++) {
      const rval = real[i]
      const ival = imag[i]
      const mag = bSi * sqrt(rval * rval + ival * ival)

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
let fft = null

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
        error: error.message
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
function calculateFrequencies(audioChannels, options) {
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
      const spectrum = fft.calculateSpectrum(segment)

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