/**
 * Regions are visual overlays on the waveform that can be used to mark segments of audio.
 * Regions can be clicked on, dragged and resized.
 * You can set the color and content of each region, as well as their HTML content.
 */
import BasePlugin from '../base-plugin.js';
import { makeDraggable } from '../draggable.js';
import EventEmitter from '../event-emitter.js';
import createElement from '../dom.js';
class SingleRegion extends EventEmitter {
    totalDuration;
    numberOfChannels;
    element;
    id;
    start;
    end;
    drag;
    resize;
    resizeStart;
    resizeEnd;
    color;
    content;
    minLength = 0;
    maxLength = Infinity;
    channelIdx;
    contentEditable = false;
    subscriptions = [];
    constructor(params, totalDuration, numberOfChannels = 0) {
        super();
        this.totalDuration = totalDuration;
        this.numberOfChannels = numberOfChannels;
        this.subscriptions = [];
        this.id = params.id || `region-${Math.random().toString(32).slice(2)}`;
        this.start = this.clampPosition(params.start);
        this.end = this.clampPosition(params.end ?? params.start);
        this.drag = params.drag ?? true;
        this.resize = params.resize ?? true;
        this.resizeStart = params.resizeStart ?? true;
        this.resizeEnd = params.resizeEnd ?? true;
        this.color = params.color ?? 'rgba(0, 0, 0, 0.1)';
        this.minLength = params.minLength ?? this.minLength;
        this.maxLength = params.maxLength ?? this.maxLength;
        this.channelIdx = params.channelIdx ?? -1;
        this.contentEditable = params.contentEditable ?? this.contentEditable;
        this.element = this.initElement();
        this.setContent(params.content);
        this.setPart();
        this.renderPosition();
        this.initMouseEvents();
    }
    clampPosition(time) {
        return Math.max(0, Math.min(this.totalDuration, time));
    }
    setPart() {
        const isMarker = this.start === this.end;
        this.element.setAttribute('part', `${isMarker ? 'marker' : 'region'} ${this.id}`);
    }
    addResizeHandles(element) {
        const handleStyle = {
            position: 'absolute',
            zIndex: '2',
            width: '6px',
            height: '100%',
            top: '0',
            cursor: 'ew-resize',
            wordBreak: 'keep-all',
        };
        const leftHandle = createElement('div', {
            part: 'region-handle region-handle-left',
            style: {
                ...handleStyle,
                left: '0',
                borderLeft: '2px solid rgba(0, 0, 0, 0.5)',
                borderRadius: '2px 0 0 2px',
            },
        }, element);
        const rightHandle = createElement('div', {
            part: 'region-handle region-handle-right',
            style: {
                ...handleStyle,
                right: '0',
                borderRight: '2px solid rgba(0, 0, 0, 0.5)',
                borderRadius: '0 2px 2px 0',
            },
        }, element);
        // Resize
        const resizeThreshold = 1;
        this.subscriptions.push(makeDraggable(leftHandle, (dx) => this.onResize(dx, 'start'), () => null, () => this.onEndResizing(), resizeThreshold), makeDraggable(rightHandle, (dx) => this.onResize(dx, 'end'), () => null, () => this.onEndResizing(), resizeThreshold));
    }
    removeResizeHandles(element) {
        const leftHandle = element.querySelector('[part*="region-handle-left"]');
        const rightHandle = element.querySelector('[part*="region-handle-right"]');
        if (leftHandle) {
            element.removeChild(leftHandle);
        }
        if (rightHandle) {
            element.removeChild(rightHandle);
        }
    }
    initElement() {
        const isMarker = this.start === this.end;
        let elementTop = 0;
        let elementHeight = 100;
        if (this.channelIdx >= 0 && this.channelIdx < this.numberOfChannels) {
            elementHeight = 100 / this.numberOfChannels;
            elementTop = elementHeight * this.channelIdx;
        }
        const element = createElement('div', {
            style: {
                position: 'absolute',
                top: `${elementTop}%`,
                height: `${elementHeight}%`,
                backgroundColor: isMarker ? 'none' : this.color,
                borderLeft: isMarker ? '2px solid ' + this.color : 'none',
                borderRadius: '2px',
                boxSizing: 'border-box',
                transition: 'background-color 0.2s ease',
                cursor: this.drag ? 'grab' : 'default',
                pointerEvents: 'all',
            },
        });
        // Add resize handles
        if (!isMarker && this.resize) {
            this.addResizeHandles(element);
        }
        return element;
    }
    renderPosition() {
        const start = this.start / this.totalDuration;
        const end = (this.totalDuration - this.end) / this.totalDuration;
        this.element.style.left = `${start * 100}%`;
        this.element.style.right = `${end * 100}%`;
    }
    toggleCursor(toggle) {
        if (!this.drag || !this.element?.style)
            return;
        this.element.style.cursor = toggle ? 'grabbing' : 'grab';
    }
    initMouseEvents() {
        const { element } = this;
        if (!element)
            return;
        element.addEventListener('click', (e) => this.emit('click', e));
        element.addEventListener('mouseenter', (e) => this.emit('over', e));
        element.addEventListener('mouseleave', (e) => this.emit('leave', e));
        element.addEventListener('dblclick', (e) => this.emit('dblclick', e));
        element.addEventListener('pointerdown', () => this.toggleCursor(true));
        element.addEventListener('pointerup', () => this.toggleCursor(false));
        // Drag
        this.subscriptions.push(makeDraggable(element, (dx) => this.onMove(dx), () => this.toggleCursor(true), () => {
            this.toggleCursor(false);
            if (this.drag)
                this.emit('update-end');
        }));
        if (this.contentEditable && this.content) {
            this.content.addEventListener('click', (e) => this.onContentClick(e));
            this.content.addEventListener('blur', () => this.onContentBlur());
        }
    }
    _onUpdate(dx, side) {
        if (!this.element.parentElement)
            return;
        const { width } = this.element.parentElement.getBoundingClientRect();
        const deltaSeconds = (dx / width) * this.totalDuration;
        const newStart = !side || side === 'start' ? this.start + deltaSeconds : this.start;
        const newEnd = !side || side === 'end' ? this.end + deltaSeconds : this.end;
        const length = newEnd - newStart;
        if (newStart >= 0 &&
            newEnd <= this.totalDuration &&
            newStart <= newEnd &&
            length >= this.minLength &&
            length <= this.maxLength) {
            this.start = newStart;
            this.end = newEnd;
            this.renderPosition();
            this.emit('update', side);
        }
    }
    onMove(dx) {
        if (!this.drag)
            return;
        this._onUpdate(dx);
    }
    onResize(dx, side) {
        if (!this.resize)
            return;
        if (!this.resizeStart && side === 'start')
            return;
        if (!this.resizeEnd && side === 'end')
            return;
        this._onUpdate(dx, side);
    }
    onEndResizing() {
        if (!this.resize)
            return;
        this.emit('update-end');
    }
    onContentClick(event) {
        event.stopPropagation();
        const contentContainer = event.target;
        contentContainer.focus();
        this.emit('click', event);
    }
    onContentBlur() {
        this.emit('update-end');
    }
    _setTotalDuration(totalDuration) {
        this.totalDuration = totalDuration;
        this.renderPosition();
    }
    /** Play the region from the start, pass `true` to stop at region end */
    play(stopAtEnd) {
        this.emit('play', stopAtEnd && this.end !== this.start ? this.end : undefined);
    }
    /** Get Content as html or string */
    getContent(asHTML = false) {
        if (asHTML) {
            return this.content || undefined;
        }
        if (this.element instanceof HTMLElement) {
            return this.content?.innerHTML || undefined;
        }
        return '';
    }
    /** Set the HTML content of the region */
    setContent(content) {
        this.content?.remove();
        if (!content) {
            this.content = undefined;
            return;
        }
        if (typeof content === 'string') {
            const isMarker = this.start === this.end;
            this.content = createElement('div', {
                style: {
                    padding: `0.2em ${isMarker ? 0.2 : 0.4}em`,
                    display: 'inline-block',
                },
                textContent: content,
            });
        }
        else {
            this.content = content;
        }
        if (this.contentEditable) {
            this.content.contentEditable = 'true';
        }
        this.content.setAttribute('part', 'region-content');
        this.element.appendChild(this.content);
        this.emit('content-changed');
    }
    /** Update the region's options */
    setOptions(options) {
        if (options.color) {
            this.color = options.color;
            this.element.style.backgroundColor = this.color;
        }
        if (options.drag !== undefined) {
            this.drag = options.drag;
            this.element.style.cursor = this.drag ? 'grab' : 'default';
        }
        if (options.start !== undefined || options.end !== undefined) {
            const isMarker = this.start === this.end;
            this.start = this.clampPosition(options.start ?? this.start);
            this.end = this.clampPosition(options.end ?? (isMarker ? this.start : this.end));
            this.renderPosition();
            this.setPart();
        }
        if (options.content) {
            this.setContent(options.content);
        }
        if (options.id) {
            this.id = options.id;
            this.setPart();
        }
        if (options.resize !== undefined && options.resize !== this.resize) {
            const isMarker = this.start === this.end;
            this.resize = options.resize;
            if (this.resize && !isMarker) {
                this.addResizeHandles(this.element);
            }
            else {
                this.removeResizeHandles(this.element);
            }
        }
        if (options.resizeStart !== undefined) {
            this.resizeStart = options.resizeStart;
        }
        if (options.resizeEnd !== undefined) {
            this.resizeEnd = options.resizeEnd;
        }
    }
    /** Remove the region */
    remove() {
        this.emit('remove');
        this.subscriptions.forEach((unsubscribe) => unsubscribe());
        this.element.remove();
        // This violates the type but we want to clean up the DOM reference
        // w/o having to have a nullable type of the element
        this.element = null;
    }
}
class RegionsPlugin extends BasePlugin {
    regions = [];
    regionsContainer;
    /** Create an instance of RegionsPlugin */
    constructor(options) {
        super(options);
        this.regionsContainer = this.initRegionsContainer();
    }
    /** Create an instance of RegionsPlugin */
    static create(options) {
        return new RegionsPlugin(options);
    }
    /** Called by wavesurfer, don't call manually */
    onInit() {
        if (!this.wavesurfer) {
            throw Error('WaveSurfer is not initialized');
        }
        this.wavesurfer.getWrapper().appendChild(this.regionsContainer);
        let activeRegions = [];
        this.subscriptions.push(this.wavesurfer.on('timeupdate', (currentTime) => {
            // Detect when regions are being played
            const playedRegions = this.regions.filter((region) => region.start <= currentTime &&
                (region.end === region.start ? region.start + 0.05 : region.end) >= currentTime);
            // Trigger region-in when activeRegions doesn't include a played regions
            playedRegions.forEach((region) => {
                if (!activeRegions.includes(region)) {
                    this.emit('region-in', region);
                }
            });
            // Trigger region-out when activeRegions include a un-played regions
            activeRegions.forEach((region) => {
                if (!playedRegions.includes(region)) {
                    this.emit('region-out', region);
                }
            });
            // Update activeRegions only played regions
            activeRegions = playedRegions;
        }));
    }
    initRegionsContainer() {
        return createElement('div', {
            style: {
                position: 'absolute',
                top: '0',
                left: '0',
                width: '100%',
                height: '100%',
                zIndex: '5',
                pointerEvents: 'none',
            },
        });
    }
    /** Get all created regions */
    getRegions() {
        return this.regions;
    }
    avoidOverlapping(region) {
        if (!region.content)
            return;
        setTimeout(() => {
            // Check that the label doesn't overlap with other labels
            // If it does, push it down until it doesn't
            const div = region.content;
            const box = div.getBoundingClientRect();
            const overlap = this.regions
                .map((reg) => {
                if (reg === region || !reg.content)
                    return 0;
                const otherBox = reg.content.getBoundingClientRect();
                if (box.left < otherBox.left + otherBox.width && otherBox.left < box.left + box.width) {
                    return otherBox.height;
                }
                return 0;
            })
                .reduce((sum, val) => sum + val, 0);
            div.style.marginTop = `${overlap}px`;
        }, 10);
    }
    adjustScroll(region) {
        const scrollContainer = this.wavesurfer?.getWrapper()?.parentElement;
        if (!scrollContainer)
            return;
        const { clientWidth, scrollWidth } = scrollContainer;
        if (scrollWidth <= clientWidth)
            return;
        const scrollBbox = scrollContainer.getBoundingClientRect();
        const bbox = region.element.getBoundingClientRect();
        const left = bbox.left - scrollBbox.left;
        const right = bbox.right - scrollBbox.left;
        if (left < 0) {
            scrollContainer.scrollLeft += left;
        }
        else if (right > clientWidth) {
            scrollContainer.scrollLeft += right - clientWidth;
        }
    }
    virtualAppend(region, container, element) {
        const renderIfVisible = () => {
            if (!this.wavesurfer)
                return;
            const clientWidth = this.wavesurfer.getWidth();
            const scrollLeft = this.wavesurfer.getScroll();
            const scrollWidth = container.clientWidth;
            const duration = this.wavesurfer.getDuration();
            const start = Math.round((region.start / duration) * scrollWidth);
            const width = Math.round(((region.end - region.start) / duration) * scrollWidth) || 1;
            // Check if the region is between the scrollLeft and scrollLeft + clientWidth
            const isVisible = start + width > scrollLeft && start < scrollLeft + clientWidth;
            if (isVisible && !element.parentElement) {
                container.appendChild(element);
            }
            else if (!isVisible && element.parentElement) {
                element.remove();
            }
        };
        setTimeout(() => {
            if (!this.wavesurfer)
                return;
            renderIfVisible();
            const unsubscribe = this.wavesurfer.on('scroll', renderIfVisible);
            this.subscriptions.push(region.once('remove', unsubscribe), unsubscribe);
        }, 0);
    }
    saveRegion(region) {
        this.virtualAppend(region, this.regionsContainer, region.element);
        this.avoidOverlapping(region);
        this.regions.push(region);
        const regionSubscriptions = [
            region.on('update', (side) => {
                // Undefined side indicates that we are dragging not resizing
                if (!side) {
                    this.adjustScroll(region);
                }
                this.emit('region-update', region, side);
            }),
            region.on('update-end', () => {
                this.avoidOverlapping(region);
                this.emit('region-updated', region);
            }),
            region.on('play', (end) => {
                this.wavesurfer?.play(region.start, end);
            }),
            region.on('click', (e) => {
                this.emit('region-clicked', region, e);
            }),
            region.on('dblclick', (e) => {
                this.emit('region-double-clicked', region, e);
            }),
            region.on('content-changed', () => {
                this.emit('region-content-changed', region);
            }),
            // Remove the region from the list when it's removed
            region.once('remove', () => {
                regionSubscriptions.forEach((unsubscribe) => unsubscribe());
                this.regions = this.regions.filter((reg) => reg !== region);
                this.emit('region-removed', region);
            }),
        ];
        this.subscriptions.push(...regionSubscriptions);
        this.emit('region-created', region);
    }
    /** Create a region with given parameters */
    addRegion(options) {
        if (!this.wavesurfer) {
            throw Error('WaveSurfer is not initialized');
        }
        const duration = this.wavesurfer.getDuration();
        const numberOfChannels = this.wavesurfer?.getDecodedData()?.numberOfChannels;
        const region = new SingleRegion(options, duration, numberOfChannels);
        this.emit('region-initialized', region);
        if (!duration) {
            this.subscriptions.push(this.wavesurfer.once('ready', (duration) => {
                region._setTotalDuration(duration);
                this.saveRegion(region);
            }));
        }
        else {
            this.saveRegion(region);
        }
        return region;
    }
    /**
     * Enable creation of regions by dragging on an empty space on the waveform.
     * Returns a function to disable the drag selection.
     */
    enableDragSelection(options, threshold = 3) {
        const wrapper = this.wavesurfer?.getWrapper();
        if (!wrapper || !(wrapper instanceof HTMLElement))
            return () => undefined;
        const initialSize = 5;
        let region = null;
        let startX = 0;
        return makeDraggable(wrapper, 
        // On drag move
        (dx, _dy, x) => {
            if (region) {
                // Update the end position of the region
                // If we're dragging to the left, we need to update the start instead
                region._onUpdate(dx, x > startX ? 'end' : 'start');
            }
        }, 
        // On drag start
        (x) => {
            startX = x;
            if (!this.wavesurfer)
                return;
            const duration = this.wavesurfer.getDuration();
            const numberOfChannels = this.wavesurfer?.getDecodedData()?.numberOfChannels;
            const { width } = this.wavesurfer.getWrapper().getBoundingClientRect();
            // Calculate the start time of the region
            const start = (x / width) * duration;
            // Give the region a small initial size
            const end = ((x + initialSize) / width) * duration;
            // Create a region but don't save it until the drag ends
            region = new SingleRegion({
                ...options,
                start,
                end,
            }, duration, numberOfChannels);
            this.emit('region-initialized', region);
            // Just add it to the DOM for now
            this.regionsContainer.appendChild(region.element);
        }, 
        // On drag end
        () => {
            if (region) {
                this.saveRegion(region);
                region = null;
            }
        }, threshold);
    }
    /** Remove all regions */
    clearRegions() {
        const regions = this.regions.slice();
        regions.forEach((region) => region.remove());
        this.regions = [];
    }
    /** Destroy the plugin and clean up */
    destroy() {
        this.clearRegions();
        super.destroy();
        this.regionsContainer.remove();
    }
}
export default RegionsPlugin;
