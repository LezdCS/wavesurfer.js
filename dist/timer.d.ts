import EventEmitter from './event-emitter.js';
type TimerEvents = {
    tick: [];
};
declare class Timer extends EventEmitter<TimerEvents> {
    private rafId;
    start(): void;
    stop(): void;
    destroy(): void;
}
export default Timer;
