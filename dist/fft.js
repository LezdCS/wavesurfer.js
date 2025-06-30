/**
 * FFT (Fast Fourier Transform) implementation
 * Based on https://github.com/corbanbrook/dsp.js
 *
 * Centralized FFT functionality for spectrogram plugins
 */
// @ts-nocheck
export const ERB_A = (1000 * Math.log(10)) / (24.7 * 4.37);
// Frequency scaling functions
export function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
}
export function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}
export function hzToLog(hz) {
    return Math.log10(Math.max(1, hz));
}
export function logToHz(log) {
    return Math.pow(10, log);
}
export function hzToBark(hz) {
    // https://www.mathworks.com/help/audio/ref/hz2bark.html#function_hz2bark_sep_mw_06bea6f7-353b-4479-a58d-ccadb90e44de
    let bark = (26.81 * hz) / (1960 + hz) - 0.53;
    if (bark < 2) {
        bark += 0.15 * (2 - bark);
    }
    if (bark > 20.1) {
        bark += 0.22 * (bark - 20.1);
    }
    return bark;
}
export function barkToHz(bark) {
    // https://www.mathworks.com/help/audio/ref/bark2hz.html#function_bark2hz_sep_mw_bee310ea-48ac-4d95-ae3d-80f3e4149555
    if (bark < 2) {
        bark = (bark - 0.3) / 0.85;
    }
    if (bark > 20.1) {
        bark = (bark + 4.422) / 1.22;
    }
    return 1960 * ((bark + 0.53) / (26.28 - bark));
}
export function hzToErb(hz) {
    // https://www.mathworks.com/help/audio/ref/hz2erb.html#function_hz2erb_sep_mw_06bea6f7-353b-4479-a58d-ccadb90e44de
    return ERB_A * Math.log10(1 + hz * 0.00437);
}
export function erbToHz(erb) {
    // https://it.mathworks.com/help/audio/ref/erb2hz.html?#function_erb2hz_sep_mw_bee310ea-48ac-4d95-ae3d-80f3e4149555
    return (Math.pow(10, erb / ERB_A) - 1) / 0.00437;
}
// Generic scale conversion functions
export function hzToScale(hz, scale) {
    switch (scale) {
        case 'mel':
            return hzToMel(hz);
        case 'logarithmic':
            return hzToLog(hz);
        case 'bark':
            return hzToBark(hz);
        case 'erb':
            return hzToErb(hz);
        default:
            return hz;
    }
}
export function scaleToHz(scale, scaleType) {
    switch (scaleType) {
        case 'mel':
            return melToHz(scale);
        case 'logarithmic':
            return logToHz(scale);
        case 'bark':
            return barkToHz(scale);
        case 'erb':
            return erbToHz(scale);
        default:
            return scale;
    }
}
// Filter bank functions
export function createFilterBank(numFilters, fftSamples, sampleRate, hzToScaleFunc, scaleToHzFunc) {
    const filterMin = hzToScaleFunc(0);
    const filterMax = hzToScaleFunc(sampleRate / 2);
    const filterBank = Array.from({ length: numFilters }, () => Array(fftSamples / 2 + 1).fill(0));
    const scale = sampleRate / fftSamples;
    for (let i = 0; i < numFilters; i++) {
        let hz = scaleToHzFunc(filterMin + (i / numFilters) * (filterMax - filterMin));
        let j = Math.floor(hz / scale);
        let hzLow = j * scale;
        let hzHigh = (j + 1) * scale;
        let r = (hz - hzLow) / (hzHigh - hzLow);
        filterBank[i][j] = 1 - r;
        filterBank[i][j + 1] = r;
    }
    return filterBank;
}
export function createMelFilterBank(numMelFilters, fftSamples, sampleRate) {
    return createFilterBank(numMelFilters, fftSamples, sampleRate, hzToMel, melToHz);
}
export function createLogFilterBank(numLogFilters, fftSamples, sampleRate) {
    return createFilterBank(numLogFilters, fftSamples, sampleRate, hzToLog, logToHz);
}
export function createBarkFilterBank(numBarkFilters, fftSamples, sampleRate) {
    return createFilterBank(numBarkFilters, fftSamples, sampleRate, hzToBark, barkToHz);
}
export function createErbFilterBank(numErbFilters, fftSamples, sampleRate) {
    return createFilterBank(numErbFilters, fftSamples, sampleRate, hzToErb, erbToHz);
}
export function applyFilterBank(fftPoints, filterBank) {
    const numFilters = filterBank.length;
    const logSpectrum = Float32Array.from({ length: numFilters }, () => 0);
    for (let i = 0; i < numFilters; i++) {
        for (let j = 0; j < fftPoints.length; j++) {
            logSpectrum[i] += fftPoints[j] * filterBank[i][j];
        }
    }
    return logSpectrum;
}
// Centralized filter bank creation based on scale type
export function createFilterBankForScale(scale, numFilters, fftSamples, sampleRate) {
    switch (scale) {
        case 'mel':
            return createFilterBank(numFilters, fftSamples, sampleRate, hzToMel, melToHz);
        case 'logarithmic':
            return createFilterBank(numFilters, fftSamples, sampleRate, hzToLog, logToHz);
        case 'bark':
            return createFilterBank(numFilters, fftSamples, sampleRate, hzToBark, barkToHz);
        case 'erb':
            return createFilterBank(numFilters, fftSamples, sampleRate, hzToErb, erbToHz);
        case 'linear':
        default:
            return null; // No filter bank for linear scale
    }
}
/**
 * Calculate FFT - Based on https://github.com/corbanbrook/dsp.js
 */
function FFT(bufferSize, sampleRate, windowFunc, alpha) {
    this.bufferSize = bufferSize;
    this.sampleRate = sampleRate;
    this.bandwidth = (2 / bufferSize) * (sampleRate / 2);
    this.sinTable = new Float32Array(bufferSize);
    this.cosTable = new Float32Array(bufferSize);
    this.windowValues = new Float32Array(bufferSize);
    this.reverseTable = new Uint32Array(bufferSize);
    this.peakBand = 0;
    this.peak = 0;
    var i;
    switch (windowFunc) {
        case 'bartlett':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = (2 / (bufferSize - 1)) * ((bufferSize - 1) / 2 - Math.abs(i - (bufferSize - 1) / 2));
            }
            break;
        case 'bartlettHann':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] =
                    0.62 - 0.48 * Math.abs(i / (bufferSize - 1) - 0.5) - 0.38 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1));
            }
            break;
        case 'blackman':
            alpha = alpha || 0.16;
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] =
                    (1 - alpha) / 2 -
                        0.5 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1)) +
                        (alpha / 2) * Math.cos((4 * Math.PI * i) / (bufferSize - 1));
            }
            break;
        case 'cosine':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = Math.cos((Math.PI * i) / (bufferSize - 1) - Math.PI / 2);
            }
            break;
        case 'gauss':
            alpha = alpha || 0.25;
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = Math.pow(Math.E, -0.5 * Math.pow((i - (bufferSize - 1) / 2) / ((alpha * (bufferSize - 1)) / 2), 2));
            }
            break;
        case 'hamming':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = 0.54 - 0.46 * Math.cos((Math.PI * 2 * i) / (bufferSize - 1));
            }
            break;
        case 'hann':
        case undefined:
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = 0.5 * (1 - Math.cos((Math.PI * 2 * i) / (bufferSize - 1)));
            }
            break;
        case 'lanczoz':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] =
                    Math.sin(Math.PI * ((2 * i) / (bufferSize - 1) - 1)) / (Math.PI * ((2 * i) / (bufferSize - 1) - 1));
            }
            break;
        case 'rectangular':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = 1;
            }
            break;
        case 'triangular':
            for (i = 0; i < bufferSize; i++) {
                this.windowValues[i] = (2 / bufferSize) * (bufferSize / 2 - Math.abs(i - (bufferSize - 1) / 2));
            }
            break;
        default:
            throw Error("No such window function '" + windowFunc + "'");
    }
    var limit = 1;
    var bit = bufferSize >> 1;
    var i;
    while (limit < bufferSize) {
        for (i = 0; i < limit; i++) {
            this.reverseTable[i + limit] = this.reverseTable[i] + bit;
        }
        limit = limit << 1;
        bit = bit >> 1;
    }
    for (i = 0; i < bufferSize; i++) {
        this.sinTable[i] = Math.sin(-Math.PI / i);
        this.cosTable[i] = Math.cos(-Math.PI / i);
    }
    this.calculateSpectrum = function (buffer) {
        var bufferSize = this.bufferSize, cosTable = this.cosTable, sinTable = this.sinTable, reverseTable = this.reverseTable, real = new Float32Array(bufferSize), imag = new Float32Array(bufferSize), bSi = 2 / this.bufferSize, sqrt = Math.sqrt, rval, ival, mag, spectrum = new Float32Array(bufferSize / 2);
        var k = Math.floor(Math.log(bufferSize) / Math.LN2);
        if (Math.pow(2, k) !== bufferSize) {
            throw 'Invalid buffer size, must be a power of 2.';
        }
        if (bufferSize !== buffer.length) {
            throw ('Supplied buffer is not the same size as defined FFT. FFT Size: ' +
                bufferSize +
                ' Buffer Size: ' +
                buffer.length);
        }
        var halfSize = 1, phaseShiftStepReal, phaseShiftStepImag, currentPhaseShiftReal, currentPhaseShiftImag, off, tr, ti, tmpReal;
        for (var i = 0; i < bufferSize; i++) {
            real[i] = buffer[reverseTable[i]] * this.windowValues[reverseTable[i]];
            imag[i] = 0;
        }
        while (halfSize < bufferSize) {
            phaseShiftStepReal = cosTable[halfSize];
            phaseShiftStepImag = sinTable[halfSize];
            currentPhaseShiftReal = 1;
            currentPhaseShiftImag = 0;
            for (var fftStep = 0; fftStep < halfSize; fftStep++) {
                var i = fftStep;
                while (i < bufferSize) {
                    off = i + halfSize;
                    tr = currentPhaseShiftReal * real[off] - currentPhaseShiftImag * imag[off];
                    ti = currentPhaseShiftReal * imag[off] + currentPhaseShiftImag * real[off];
                    real[off] = real[i] - tr;
                    imag[off] = imag[i] - ti;
                    real[i] += tr;
                    imag[i] += ti;
                    i += halfSize << 1;
                }
                tmpReal = currentPhaseShiftReal;
                currentPhaseShiftReal = tmpReal * phaseShiftStepReal - currentPhaseShiftImag * phaseShiftStepImag;
                currentPhaseShiftImag = tmpReal * phaseShiftStepImag + currentPhaseShiftImag * phaseShiftStepReal;
            }
            halfSize = halfSize << 1;
        }
        for (var i = 0, N = bufferSize / 2; i < N; i++) {
            rval = real[i];
            ival = imag[i];
            mag = bSi * sqrt(rval * rval + ival * ival);
            if (mag > this.peak) {
                this.peakBand = i;
                this.peak = mag;
            }
            spectrum[i] = mag;
        }
        return spectrum;
    };
}
export default FFT;
