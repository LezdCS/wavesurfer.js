/* tslint:disable */
/* eslint-disable */
export function db_to_color_indices(spectrum: Float32Array, gain_db: number, range_db: number): Uint8Array;
export class WasmFFT {
  free(): void;
  constructor(size: number, window_type: string, alpha?: number | null);
  calculate_spectrum(input: Float32Array): Float32Array;
  readonly size: number;
}
export class WasmFilterBank {
  free(): void;
  constructor(num_filters: number, fft_size: number, sample_rate: number, scale_type: string);
  apply(spectrum: Float32Array): Float32Array;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_wasmfft_free: (a: number, b: number) => void;
  readonly wasmfft_new: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly wasmfft_calculate_spectrum: (a: number, b: number, c: number) => [number, number, number, number];
  readonly wasmfft_size: (a: number) => number;
  readonly __wbg_wasmfilterbank_free: (a: number, b: number) => void;
  readonly wasmfilterbank_new: (a: number, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly wasmfilterbank_apply: (a: number, b: number, c: number) => [number, number, number, number];
  readonly db_to_color_indices: (a: number, b: number, c: number, d: number) => [number, number];
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __wbindgen_export_3: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
