/**
 * Windowed Spectrogram plugin - Optimized for very long audio files
 *
 * Only renders frequency data in a sliding window around the current viewport,
 * keeping memory usage constant regardless of audio length.
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js';
export type WindowedSpectrogramPluginOptions = {
    /** Selector of element or element in which to render */
    container?: string | HTMLElement;
    /** Number of samples to fetch to FFT. Must be a power of 2. */
    fftSamples?: number;
    /** Height of the spectrogram view in CSS pixels */
    height?: number;
    /** Set to true to display frequency labels. */
    labels?: boolean;
    labelsBackground?: string;
    labelsColor?: string;
    labelsHzColor?: string;
    /** Size of the overlapping window. Must be < fftSamples. */
    noverlap?: number;
    /** The window function to be used. */
    windowFunc?: 'bartlett' | 'bartlettHann' | 'blackman' | 'cosine' | 'gauss' | 'hamming' | 'hann' | 'lanczoz' | 'rectangular' | 'triangular';
    /** Some window functions have this extra value. (Between 0 and 1) */
    alpha?: number;
    /** Min frequency to scale spectrogram. */
    frequencyMin?: number;
    /** Max frequency to scale spectrogram. */
    frequencyMax?: number;
    /** Sample rate of the audio when using pre-computed spectrogram data. */
    sampleRate?: number;
    /** Frequency scale type */
    scale?: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb';
    /** Gain in dB */
    gainDB?: number;
    /** Range in dB */
    rangeDB?: number;
    /** Color map */
    colorMap?: number[][] | 'gray' | 'igray' | 'roseus';
    /** Render a spectrogram for each channel independently when true. */
    splitChannels?: boolean;
    /** Window size in seconds (how much data to keep in memory) */
    windowSize?: number;
    /** Buffer size in pixels (how much extra to render beyond viewport) */
    bufferSize?: number;
};
export type WindowedSpectrogramPluginEvents = BasePluginEvents & {
    ready: [];
    click: [relativeX: number];
};
declare class WindowedSpectrogramPlugin extends BasePlugin<WindowedSpectrogramPluginEvents, WindowedSpectrogramPluginOptions> {
    private container;
    private wrapper;
    private labelsEl;
    private canvasContainer;
    private colorMap;
    private fftSamples;
    private height;
    private noverlap;
    private windowFunc;
    private alpha;
    private frequencyMin;
    private frequencyMax;
    private gainDB;
    private rangeDB;
    private scale;
    private windowSize;
    private bufferSize;
    private segments;
    private buffer;
    private currentPosition;
    private pixelsPerSecond;
    private isRendering;
    private renderTimeout;
    private fft;
    private numMelFilters;
    private numLogFilters;
    private numBarkFilters;
    private numErbFilters;
    static create(options?: WindowedSpectrogramPluginOptions): WindowedSpectrogramPlugin;
    constructor(options: WindowedSpectrogramPluginOptions);
    private setupColorMap;
    onInit(): void;
    private createWrapper;
    private createCanvas;
    private handleRedraw;
    private updateSegmentPositions;
    private redrawSegmentCanvas;
    private handleScroll;
    private updatePosition;
    private scheduleRender;
    private renderVisibleWindow;
    private generateSegments;
    private calculateFrequencies;
    private renderSegment;
    private renderChannelToCanvas;
    private cleanupOldSegments;
    private clearAllSegments;
    private getFilterBank;
    private hzToMel;
    private melToHz;
    private hzToLog;
    private logToHz;
    private hzToBark;
    private barkToHz;
    private hzToErb;
    private erbToHz;
    private createFilterBank;
    private applyFilterBank;
    private _onWrapperClick;
    private freqType;
    private unitType;
    private hzToScale;
    private scaleToHz;
    private getLabelFrequency;
    private loadLabels;
    render(audioData: AudioBuffer): Promise<void>;
    destroy(): void;
    private getWidth;
    private getWrapperWidth;
    private getPixelsPerSecond;
}
export default WindowedSpectrogramPlugin;
