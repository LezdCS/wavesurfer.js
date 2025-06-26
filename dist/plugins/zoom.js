/**
 * Zoom plugin
 *
 * Zoom in or out on the waveform when scrolling the mouse wheel
 *
 * @author HoodyHuo (https://github.com/HoodyHuo)
 * @author Chris Morbitzer (https://github.com/cmorbitzer)
 * @author Sam Hulick (https://github.com/ffxsam)
 * @autor Gustav Sollenius (https://github.com/gustavsollenius)
 *
 * @example
 * // ... initialising wavesurfer with the plugin
 * var wavesurfer = WaveSurfer.create({
 *   // wavesurfer options ...
 *   plugins: [
 *     ZoomPlugin.create({
 *       // plugin options ...
 *     })
 *   ]
 * });
 */
import { BasePlugin } from '../base-plugin.js';
const defaultOptions = {
    scale: 0.5,
    deltaThreshold: 5,
    exponentialZooming: false,
    iterations: 20,
};
class ZoomPlugin extends BasePlugin {
    options;
    wrapper = undefined;
    container = null;
    accumulatedDelta = 0;
    pointerTime = 0;
    oldX = 0;
    endZoom = 0;
    startZoom = 0;
    constructor(options) {
        super(options || {});
        this.options = Object.assign({}, defaultOptions, options);
    }
    static create(options) {
        return new ZoomPlugin(options);
    }
    onInit() {
        this.wrapper = this.wavesurfer?.getWrapper();
        if (!this.wrapper) {
            return;
        }
        this.container = this.wrapper.parentElement;
        this.container.addEventListener('wheel', this.onWheel);
        if (typeof this.options.maxZoom === 'undefined') {
            this.options.maxZoom = this.container.clientWidth;
        }
        this.endZoom = this.options.maxZoom;
    }
    onWheel = (e) => {
        if (!this.wavesurfer || !this.container || Math.abs(e.deltaX) >= Math.abs(e.deltaY)) {
            return;
        }
        // prevent scrolling the sidebar while zooming
        e.preventDefault();
        // Update the accumulated delta...
        this.accumulatedDelta += -e.deltaY;
        if (this.startZoom === 0 && this.options.exponentialZooming) {
            this.startZoom = this.wavesurfer.getWrapper().clientWidth / this.wavesurfer.getDuration();
        }
        // ...and only scroll once we've hit our threshold
        if (this.options.deltaThreshold === 0 || Math.abs(this.accumulatedDelta) >= this.options.deltaThreshold) {
            const duration = this.wavesurfer.getDuration();
            const oldMinPxPerSec = this.wavesurfer.options.minPxPerSec === 0
                ? this.wavesurfer.getWrapper().scrollWidth / duration
                : this.wavesurfer.options.minPxPerSec;
            const x = e.clientX - this.container.getBoundingClientRect().left;
            const width = this.container.clientWidth;
            const scrollX = this.wavesurfer.getScroll();
            // Update pointerTime only if the pointer position has changed. This prevents the waveform from drifting during fixed zooming.
            if (x !== this.oldX || this.oldX === 0) {
                this.pointerTime = (scrollX + x) / oldMinPxPerSec;
            }
            this.oldX = x;
            const newMinPxPerSec = this.calculateNewZoom(oldMinPxPerSec, this.accumulatedDelta);
            const newLeftSec = (width / newMinPxPerSec) * (x / width);
            if (newMinPxPerSec * duration < width) {
                this.wavesurfer.zoom(width / duration);
                this.container.scrollLeft = 0;
            }
            else {
                this.wavesurfer.zoom(newMinPxPerSec);
                this.container.scrollLeft = (this.pointerTime - newLeftSec) * newMinPxPerSec;
            }
            // Reset the accumulated delta
            this.accumulatedDelta = 0;
        }
    };
    calculateNewZoom = (oldZoom, delta) => {
        let newZoom;
        if (this.options.exponentialZooming) {
            const zoomFactor = delta > 0
                ? Math.pow(this.endZoom / this.startZoom, 1 / (this.options.iterations - 1))
                : Math.pow(this.startZoom / this.endZoom, 1 / (this.options.iterations - 1));
            newZoom = Math.max(0, oldZoom * zoomFactor);
        }
        else {
            // Default linear zooming
            newZoom = Math.max(0, oldZoom + delta * this.options.scale);
        }
        return Math.min(newZoom, this.options.maxZoom);
    };
    destroy() {
        if (this.wrapper) {
            this.wrapper.removeEventListener('wheel', this.onWheel);
        }
        super.destroy();
    }
}
export default ZoomPlugin;
