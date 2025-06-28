/**
 * Web Worker for Windowed Spectrogram Plugin
 * Handles FFT calculations for frequency analysis
 */
declare class FFT {
    bufferSize: number;
    sampleRate: number;
    bandwidth: number;
    sinTable: Float32Array;
    cosTable: Float32Array;
    windowValues: Float32Array;
    reverseTable: Uint32Array;
    peakBand: number;
    peak: number;
    constructor(bufferSize: number, sampleRate: number, windowFunc?: string, alpha?: number);
    calculateSpectrum(buffer: Float32Array): Float32Array;
}
declare let fft: FFT | null;
declare const ERB_A: number;
declare function hzToMel(hz: number): number;
declare function melToHz(mel: number): number;
declare function hzToLog(hz: number): number;
declare function logToHz(log: number): number;
declare function hzToBark(hz: number): number;
declare function barkToHz(bark: number): number;
declare function hzToErb(hz: number): number;
declare function erbToHz(erb: number): number;
declare function createFilterBank(numFilters: number, fftSamples: number, sampleRate: number, hzToScale: (hz: number) => number, scaleToHz: (scale: number) => number): number[][];
declare function applyFilterBank(fftPoints: Float32Array, filterBank: number[][]): Float32Array;
interface WorkerMessage {
    type: string;
    id: string;
    audioData: Float32Array[];
    options: {
        startTime: number;
        endTime: number;
        sampleRate: number;
        fftSamples: number;
        windowFunc: string;
        alpha?: number;
        noverlap: number;
        scale: string;
        gainDB: number;
        rangeDB: number;
        splitChannels: boolean;
    };
}
interface WorkerResponse {
    type: string;
    id: string;
    result?: Uint8Array[][];
    error?: string;
}
/**
 * Calculate frequency data for audio channels
 */
declare function calculateFrequencies(audioChannels: Float32Array[], options: WorkerMessage['options']): Uint8Array[][];
