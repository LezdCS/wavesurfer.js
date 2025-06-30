/**
 * FFT (Fast Fourier Transform) implementation
 * Based on https://github.com/corbanbrook/dsp.js
 *
 * Centralized FFT functionality for spectrogram plugins
 */
export declare const ERB_A: number;
export declare function hzToMel(hz: number): number;
export declare function melToHz(mel: number): number;
export declare function hzToLog(hz: number): number;
export declare function logToHz(log: number): number;
export declare function hzToBark(hz: number): number;
export declare function barkToHz(bark: number): number;
export declare function hzToErb(hz: number): number;
export declare function erbToHz(erb: number): number;
export declare function hzToScale(hz: number, scale: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb'): number;
export declare function scaleToHz(scale: number, scaleType: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb'): number;
export declare function createFilterBank(numFilters: number, fftSamples: number, sampleRate: number, hzToScaleFunc: (hz: number) => number, scaleToHzFunc: (scale: number) => number): number[][];
export declare function createMelFilterBank(numMelFilters: number, fftSamples: number, sampleRate: number): number[][];
export declare function createLogFilterBank(numLogFilters: number, fftSamples: number, sampleRate: number): number[][];
export declare function createBarkFilterBank(numBarkFilters: number, fftSamples: number, sampleRate: number): number[][];
export declare function createErbFilterBank(numErbFilters: number, fftSamples: number, sampleRate: number): number[][];
export declare function applyFilterBank(fftPoints: Float32Array, filterBank: number[][]): Float32Array;
export declare function createFilterBankForScale(scale: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb', numFilters: number, fftSamples: number, sampleRate: number): number[][] | null;
/**
 * Calculate FFT - Based on https://github.com/corbanbrook/dsp.js
 */
declare function FFT(bufferSize: number, sampleRate: number, windowFunc: string, alpha: number): void;
export declare class FFT {
    constructor(bufferSize: number, sampleRate: number, windowFunc: string, alpha: number);
    calculateSpectrum(buffer: Float32Array): Float32Array;
}
export { FFT };
export default FFT;
