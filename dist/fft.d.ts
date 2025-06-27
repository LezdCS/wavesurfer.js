/**
 * FFT (Fast Fourier Transform) implementation
 * Based on https://github.com/corbanbrook/dsp.js
 *
 * Centralized FFT functionality for spectrogram plugins
 */
export declare const ERB_A: number;
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
