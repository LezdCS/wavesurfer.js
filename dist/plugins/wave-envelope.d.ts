/**
 * WaveEnvelope plugin for creating upper and lower envelope bounds for waveform visualization.
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js';
export type WaveEnvelopePoint = {
    id?: string;
    time: number;
    upperAmplitude: number;
    lowerAmplitude: number;
};
export type WaveEnvelopePluginOptions = {
    points?: WaveEnvelopePoint[];
    upperLineWidth?: number;
    lowerLineWidth?: number;
    upperLineColor?: string;
    lowerLineColor?: string;
    fillArea?: boolean;
    fillColor?: string;
    fillOpacity?: number;
    dragPointSize?: number;
    dragPointFill?: string;
    dragPointStroke?: string;
    clipWaveform?: boolean;
    autoGenerate?: boolean;
    autoGenerateSegments?: number;
    autoGenerateSmoothing?: number;
    autoGenerateMargin?: number;
};
declare const defaultOptions: {
    points: WaveEnvelopePoint[];
    upperLineWidth: number;
    lowerLineWidth: number;
    upperLineColor: string;
    lowerLineColor: string;
    fillArea: boolean;
    fillColor: string;
    fillOpacity: number;
    dragPointSize: number;
    dragPointFill: string;
    dragPointStroke: string;
    clipWaveform: boolean;
    autoGenerate: boolean;
    autoGenerateSegments: number;
    autoGenerateSmoothing: number;
    autoGenerateMargin: number;
};
type Options = WaveEnvelopePluginOptions & typeof defaultOptions;
export type WaveEnvelopePluginEvents = BasePluginEvents & {
    'points-change': [newPoints: WaveEnvelopePoint[]];
    'envelope-bounds': [time: number, upperBound: number, lowerBound: number];
};
declare class WaveEnvelopePlugin extends BasePlugin<WaveEnvelopePluginEvents, WaveEnvelopePluginOptions> {
    protected options: Options;
    private dualPolyline;
    private points;
    private throttleTimeout;
    constructor(options: WaveEnvelopePluginOptions);
    static create(options: WaveEnvelopePluginOptions): WaveEnvelopePlugin;
    addPoint(point: WaveEnvelopePoint): void;
    removePoint(point: WaveEnvelopePoint): void;
    getPoints(): WaveEnvelopePoint[];
    setPoints(newPoints: WaveEnvelopePoint[]): void;
    getEnvelopeBoundsAtTime(time: number): {
        upper: number;
        lower: number;
    };
    /**
     * Generate envelope points automatically based on the audio data
     */
    generateEnvelopeFromAudio(replace?: boolean): WaveEnvelopePoint[];
    /**
     * Analyze audio data and generate envelope points
     */
    private analyzeAudioData;
    /**
     * Apply smoothing to envelope points using a simple moving average
     */
    private smoothEnvelopePoints;
    /**
     * Generate envelope using RMS (Root Mean Square) analysis for smoother results
     */
    generateRMSEnvelope(windowSize?: number, replace?: boolean): WaveEnvelopePoint[];
    destroy(): void;
    onInit(): void;
    private emitPoints;
    private initDualPolyline;
    private addPolyPoint;
}
export default WaveEnvelopePlugin;
