import EventEmitter from './event-emitter.js';
class Timer extends EventEmitter {
    constructor() {
        super(...arguments);
        this.rafId = null;
    }
    start() {
        if (this.rafId !== null)
            return; // Already running
        const tick = () => {
            this.emit('tick');
            this.rafId = requestAnimationFrame(tick);
        };
        this.rafId = requestAnimationFrame(tick);
    }
    stop() {
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }
    destroy() {
        this.stop();
        this.unAll();
    }
}
export default Timer;
