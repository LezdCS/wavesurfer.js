/**
 * The Timeline plugin adds timestamps and notches under the waveform.
 */
import BasePlugin from '../base-plugin.js';
import createElement from '../dom.js';
const defaultOptions = {
    height: 20,
    timeOffset: 0,
    formatTimeCallback: (seconds) => {
        if (seconds / 60 > 1) {
            // calculate minutes and seconds from seconds count
            const minutes = Math.floor(seconds / 60);
            seconds = Math.round(seconds % 60);
            const paddedSeconds = `${seconds < 10 ? '0' : ''}${seconds}`;
            return `${minutes}:${paddedSeconds}`;
        }
        const rounded = Math.round(seconds * 1000) / 1000;
        return `${rounded}`;
    },
};
class TimelinePlugin extends BasePlugin {
    timelineWrapper;
    options;
    constructor(options) {
        super(options || {});
        this.options = Object.assign({}, defaultOptions, options);
        this.timelineWrapper = this.initTimelineWrapper();
    }
    static create(options) {
        return new TimelinePlugin(options);
    }
    /** Called by wavesurfer, don't call manually */
    onInit() {
        if (!this.wavesurfer) {
            throw Error('WaveSurfer is not initialized');
        }
        let container = this.wavesurfer.getWrapper();
        if (this.options.container instanceof HTMLElement) {
            container = this.options.container;
        }
        else if (typeof this.options.container === 'string') {
            const el = document.querySelector(this.options.container);
            if (!el)
                throw Error(`No Timeline container found matching ${this.options.container}`);
            container = el;
        }
        if (this.options.insertPosition) {
            ;
            (container.firstElementChild || container).insertAdjacentElement(this.options.insertPosition, this.timelineWrapper);
        }
        else {
            container.appendChild(this.timelineWrapper);
        }
        this.subscriptions.push(this.wavesurfer.on('redraw', () => this.initTimeline()));
        if (this.wavesurfer?.getDuration() || this.options.duration) {
            this.initTimeline();
        }
    }
    /** Unmount */
    destroy() {
        this.timelineWrapper.remove();
        super.destroy();
    }
    initTimelineWrapper() {
        return createElement('div', { part: 'timeline-wrapper', style: { pointerEvents: 'none' } });
    }
    // Return how many seconds should be between each notch
    defaultTimeInterval(pxPerSec) {
        if (pxPerSec >= 25) {
            return 1;
        }
        else if (pxPerSec * 5 >= 25) {
            return 5;
        }
        else if (pxPerSec * 15 >= 25) {
            return 15;
        }
        return Math.ceil(0.5 / pxPerSec) * 60;
    }
    // Return the cadence of notches that get labels in the primary color.
    defaultPrimaryLabelInterval(pxPerSec) {
        if (pxPerSec >= 25) {
            return 10;
        }
        else if (pxPerSec * 5 >= 25) {
            return 6;
        }
        else if (pxPerSec * 15 >= 25) {
            return 4;
        }
        return 4;
    }
    // Return the cadence of notches that get labels in the secondary color.
    defaultSecondaryLabelInterval(pxPerSec) {
        if (pxPerSec >= 25) {
            return 5;
        }
        else if (pxPerSec * 5 >= 25) {
            return 2;
        }
        else if (pxPerSec * 15 >= 25) {
            return 2;
        }
        return 2;
    }
    virtualAppend(start, container, element) {
        let wasVisible = false;
        const renderIfVisible = (scrollLeft, scrollRight) => {
            if (!this.wavesurfer)
                return;
            const width = element.clientWidth;
            const isVisible = start > scrollLeft && start + width < scrollRight;
            if (isVisible === wasVisible)
                return;
            wasVisible = isVisible;
            if (isVisible) {
                container.appendChild(element);
            }
            else {
                element.remove();
            }
        };
        if (!this.wavesurfer)
            return;
        const scrollLeft = this.wavesurfer.getScroll();
        const scrollRight = scrollLeft + this.wavesurfer.getWidth();
        renderIfVisible(scrollLeft, scrollRight);
        this.subscriptions.push(this.wavesurfer.on('scroll', (_start, _end, scrollLeft, scrollRight) => {
            renderIfVisible(scrollLeft, scrollRight);
        }));
    }
    initTimeline() {
        const duration = this.wavesurfer?.getDuration() ?? this.options.duration ?? 0;
        const pxPerSec = (this.wavesurfer?.getWrapper().scrollWidth || this.timelineWrapper.scrollWidth) / duration;
        const timeInterval = this.options.timeInterval ?? this.defaultTimeInterval(pxPerSec);
        const primaryLabelInterval = this.options.primaryLabelInterval ?? this.defaultPrimaryLabelInterval(pxPerSec);
        const primaryLabelSpacing = this.options.primaryLabelSpacing;
        const secondaryLabelInterval = this.options.secondaryLabelInterval ?? this.defaultSecondaryLabelInterval(pxPerSec);
        const secondaryLabelSpacing = this.options.secondaryLabelSpacing;
        const isTop = this.options.insertPosition === 'beforebegin';
        const timeline = createElement('div', {
            style: {
                height: `${this.options.height}px`,
                overflow: 'hidden',
                fontSize: `${this.options.height / 2}px`,
                whiteSpace: 'nowrap',
                ...(isTop
                    ? {
                        position: 'absolute',
                        top: '0',
                        left: '0',
                        right: '0',
                        zIndex: '2',
                    }
                    : {
                        position: 'relative',
                    }),
            },
        });
        timeline.setAttribute('part', 'timeline');
        if (typeof this.options.style === 'string') {
            timeline.setAttribute('style', timeline.getAttribute('style') + this.options.style);
        }
        else if (typeof this.options.style === 'object') {
            Object.assign(timeline.style, this.options.style);
        }
        const notchEl = createElement('div', {
            style: {
                width: '0',
                height: '50%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: isTop ? 'flex-start' : 'flex-end',
                top: isTop ? '0' : 'auto',
                bottom: isTop ? 'auto' : '0',
                overflow: 'visible',
                borderLeft: '1px solid currentColor',
                opacity: `${this.options.secondaryLabelOpacity ?? 0.25}`,
                position: 'absolute',
                zIndex: '1',
            },
        });
        for (let i = 0, notches = 0; i < duration; i += timeInterval, notches++) {
            const notch = notchEl.cloneNode();
            const isPrimary = Math.round(i * 100) % Math.round(primaryLabelInterval * 100) === 0 ||
                (primaryLabelSpacing && notches % primaryLabelSpacing === 0);
            const isSecondary = Math.round(i * 100) % Math.round(secondaryLabelInterval * 100) === 0 ||
                (secondaryLabelSpacing && notches % secondaryLabelSpacing === 0);
            if (isPrimary || isSecondary) {
                notch.style.height = '100%';
                notch.style.textIndent = '3px';
                notch.textContent = this.options.formatTimeCallback(i);
                if (isPrimary)
                    notch.style.opacity = '1';
            }
            const mode = isPrimary ? 'primary' : isSecondary ? 'secondary' : 'tick';
            notch.setAttribute('part', `timeline-notch timeline-notch-${mode}`);
            const offset = Math.round((i + this.options.timeOffset) * 100) / 100 * pxPerSec;
            notch.style.left = `${offset}px`;
            this.virtualAppend(offset, timeline, notch);
        }
        this.timelineWrapper.innerHTML = '';
        this.timelineWrapper.appendChild(timeline);
        this.emit('ready');
    }
}
export default TimelinePlugin;
