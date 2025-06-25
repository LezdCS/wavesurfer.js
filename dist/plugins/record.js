/**
 * Record audio from the microphone with a real-time waveform preview
 */
import BasePlugin from '../base-plugin.js';
import Timer from '../timer.js';
const DEFAULT_BITS_PER_SECOND = 128000;
const DEFAULT_SCROLLING_WAVEFORM_WINDOW = 5;
const FPS = 100;
const MIME_TYPES = ['audio/webm', 'audio/wav', 'audio/mpeg', 'audio/mp4', 'audio/mp3'];
const findSupportedMimeType = () => MIME_TYPES.find((mimeType) => MediaRecorder.isTypeSupported(mimeType));
class RecordPlugin extends BasePlugin {
    stream = null;
    mediaRecorder = null;
    dataWindow = null;
    isWaveformPaused = false;
    originalOptions;
    timer;
    lastStartTime = 0;
    lastDuration = 0;
    duration = 0;
    /** Create an instance of the Record plugin */
    constructor(options) {
        super({
            ...options,
            audioBitsPerSecond: options.audioBitsPerSecond ?? DEFAULT_BITS_PER_SECOND,
            scrollingWaveform: options.scrollingWaveform ?? false,
            scrollingWaveformWindow: options.scrollingWaveformWindow ?? DEFAULT_SCROLLING_WAVEFORM_WINDOW,
            continuousWaveform: options.continuousWaveform ?? false,
            renderRecordedAudio: options.renderRecordedAudio ?? true,
            mediaRecorderTimeslice: options.mediaRecorderTimeslice ?? undefined,
        });
        this.timer = new Timer();
        this.subscriptions.push(this.timer.on('tick', () => {
            const currentTime = performance.now() - this.lastStartTime;
            this.duration = this.isPaused() ? this.duration : this.lastDuration + currentTime;
            this.emit('record-progress', this.duration);
        }));
    }
    /** Create an instance of the Record plugin */
    static create(options) {
        return new RecordPlugin(options || {});
    }
    renderMicStream(stream) {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        source.connect(analyser);
        if (this.options.continuousWaveform) {
            analyser.fftSize = 32;
        }
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Float32Array(bufferLength);
        let sampleIdx = 0;
        if (this.wavesurfer) {
            this.originalOptions ??= {
                ...this.wavesurfer.options,
            };
            this.wavesurfer.options.interact = false;
            if (this.options.scrollingWaveform) {
                this.wavesurfer.options.cursorWidth = 0;
            }
        }
        const drawWaveform = () => {
            if (this.isWaveformPaused)
                return;
            analyser.getFloatTimeDomainData(dataArray);
            if (this.options.scrollingWaveform) {
                // Scrolling waveform
                const windowSize = Math.floor((this.options.scrollingWaveformWindow || 0) * audioContext.sampleRate);
                const newLength = Math.min(windowSize, this.dataWindow ? this.dataWindow.length + bufferLength : bufferLength);
                const tempArray = new Float32Array(windowSize); // Always make it the size of the window, filling with zeros by default
                if (this.dataWindow) {
                    const startIdx = Math.max(0, windowSize - this.dataWindow.length);
                    tempArray.set(this.dataWindow.slice(-newLength + bufferLength), startIdx);
                }
                tempArray.set(dataArray, windowSize - bufferLength);
                this.dataWindow = tempArray;
            }
            else if (this.options.continuousWaveform) {
                // Continuous waveform
                if (!this.dataWindow) {
                    const size = this.options.continuousWaveformDuration
                        ? Math.round(this.options.continuousWaveformDuration * FPS)
                        : (this.wavesurfer?.getWidth() ?? 0) * window.devicePixelRatio;
                    this.dataWindow = new Float32Array(size);
                }
                let maxValue = 0;
                for (let i = 0; i < bufferLength; i++) {
                    const value = Math.abs(dataArray[i]);
                    if (value > maxValue) {
                        maxValue = value;
                    }
                }
                if (sampleIdx + 1 > this.dataWindow.length) {
                    const tempArray = new Float32Array(this.dataWindow.length * 2);
                    tempArray.set(this.dataWindow, 0);
                    this.dataWindow = tempArray;
                }
                this.dataWindow[sampleIdx] = maxValue;
                sampleIdx++;
            }
            else {
                this.dataWindow = dataArray;
            }
            // Render the waveform
            if (this.wavesurfer) {
                const totalDuration = (this.dataWindow?.length ?? 0) / FPS;
                this.wavesurfer
                    .load('', [this.dataWindow], this.options.scrollingWaveform ? this.options.scrollingWaveformWindow : totalDuration)
                    .then(() => {
                    if (this.wavesurfer && this.options.continuousWaveform) {
                        this.wavesurfer.setTime(this.getDuration() / 1000);
                        if (!this.wavesurfer.options.minPxPerSec) {
                            this.wavesurfer.setOptions({
                                minPxPerSec: this.wavesurfer.getWidth() / this.wavesurfer.getDuration(),
                            });
                        }
                    }
                })
                    .catch((err) => {
                    console.error('Error rendering real-time recording data:', err);
                });
            }
        };
        const intervalId = setInterval(drawWaveform, 1000 / FPS);
        return {
            onDestroy: () => {
                clearInterval(intervalId);
                source?.disconnect();
                audioContext?.close();
            },
            onEnd: () => {
                this.isWaveformPaused = true;
                clearInterval(intervalId);
                this.stopMic();
            },
        };
    }
    /** Request access to the microphone and start monitoring incoming audio */
    async startMic(options) {
        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                audio: options ?? true,
            });
        }
        catch (err) {
            throw new Error('Error accessing the microphone: ' + err.message);
        }
        const { onDestroy, onEnd } = this.renderMicStream(stream);
        this.subscriptions.push(this.once('destroy', onDestroy));
        this.subscriptions.push(this.once('record-end', onEnd));
        this.stream = stream;
        return stream;
    }
    /** Stop monitoring incoming audio */
    stopMic() {
        if (!this.stream)
            return;
        this.stream.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.mediaRecorder = null;
    }
    /** Start recording audio from the microphone */
    async startRecording(options) {
        const stream = this.stream || (await this.startMic(options));
        this.dataWindow = null;
        const mediaRecorder = this.mediaRecorder ||
            new MediaRecorder(stream, {
                mimeType: this.options.mimeType || findSupportedMimeType(),
                audioBitsPerSecond: this.options.audioBitsPerSecond,
            });
        this.mediaRecorder = mediaRecorder;
        this.stopRecording();
        const recordedChunks = [];
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
            this.emit('record-data-available', event.data);
        };
        const emitWithBlob = (ev) => {
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
            this.emit(ev, blob);
            if (this.options.renderRecordedAudio) {
                this.applyOriginalOptionsIfNeeded();
                this.wavesurfer?.load(URL.createObjectURL(blob));
            }
        };
        mediaRecorder.onpause = () => emitWithBlob('record-pause');
        mediaRecorder.onstop = () => emitWithBlob('record-end');
        mediaRecorder.start(this.options.mediaRecorderTimeslice);
        this.lastStartTime = performance.now();
        this.lastDuration = 0;
        this.duration = 0;
        this.isWaveformPaused = false;
        this.timer.start();
        this.emit('record-start');
    }
    /** Get the duration of the recording */
    getDuration() {
        return this.duration;
    }
    /** Check if the audio is being recorded */
    isRecording() {
        return this.mediaRecorder?.state === 'recording';
    }
    isPaused() {
        return this.mediaRecorder?.state === 'paused';
    }
    isActive() {
        return this.mediaRecorder?.state !== 'inactive';
    }
    /** Stop the recording */
    stopRecording() {
        if (this.isActive()) {
            this.mediaRecorder?.stop();
            this.timer.stop();
        }
    }
    /** Pause the recording */
    pauseRecording() {
        if (this.isRecording()) {
            this.isWaveformPaused = true;
            this.mediaRecorder?.requestData();
            this.mediaRecorder?.pause();
            this.timer.stop();
            this.lastDuration = this.duration;
        }
    }
    /** Resume the recording */
    resumeRecording() {
        if (this.isPaused()) {
            this.isWaveformPaused = false;
            this.mediaRecorder?.resume();
            this.timer.start();
            this.lastStartTime = performance.now();
            this.emit('record-resume');
        }
    }
    /** Get a list of available audio devices
     * You can use this to get the device ID of the microphone to use with the startMic and startRecording methods
     * Will return an empty array if the browser doesn't support the MediaDevices API or if the user has not granted access to the microphone
     * You can ask for permission to the microphone by calling startMic
     */
    static async getAvailableAudioDevices() {
        return navigator.mediaDevices
            .enumerateDevices()
            .then((devices) => devices.filter((device) => device.kind === 'audioinput'));
    }
    /** Destroy the plugin */
    destroy() {
        this.applyOriginalOptionsIfNeeded();
        super.destroy();
        this.stopRecording();
        this.stopMic();
    }
    applyOriginalOptionsIfNeeded() {
        if (this.wavesurfer && this.originalOptions) {
            this.wavesurfer.setOptions(this.originalOptions);
            delete this.originalOptions;
        }
    }
}
export default RecordPlugin;
