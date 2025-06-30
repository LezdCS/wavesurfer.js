/**
 * Spectrogram plugin
 *
 * Render a spectrogram visualisation of the audio.
 *
 * @author Pavel Denisov (https://github.com/akreal)
 * @see https://github.com/wavesurfer-js/wavesurfer.js/pull/337
 *
 * @example
 * // ... initialising wavesurfer with the plugin
 * var wavesurfer = WaveSurfer.create({
 *   // wavesurfer options ...
 *   plugins: [
 *     SpectrogramPlugin.create({
 *       // plugin options ...
 *     })
 *   ]
 * });
 */

// @ts-nocheck

// Import WASM functionality
import wasmInit, { WasmFFT, WasmFilterBank, db_to_color_indices, initSync } from '../../pkg/wavesurfer_fft.js'

// Import centralized FFT functionality
import FFT, { 
  ERB_A,
  hzToMel,
  melToHz,
  hzToLog,
  logToHz,
  hzToBark,
  barkToHz,
  hzToErb,
  erbToHz,
  hzToScale,
  scaleToHz,
  createFilterBankForScale,
  createMelFilterBank,
  createLogFilterBank,
  createBarkFilterBank,
  createErbFilterBank,
  applyFilterBank
} from '../fft.js'

/**
 * Spectrogram plugin for wavesurfer.
 */
import BasePlugin, { type BasePluginEvents } from '../base-plugin.js'
import createElement from '../dom.js'

export type SpectrogramPluginOptions = {
  /** Selector of element or element in which to render */
  container?: string | HTMLElement
  /** Number of samples to fetch to FFT. Must be a power of 2. */
  fftSamples?: number
  /** Height of the spectrogram view in CSS pixels */
  height?: number
  /** Set to true to display frequency labels. */
  labels?: boolean
  labelsBackground?: string
  labelsColor?: string
  labelsHzColor?: string
  /** Size of the overlapping window. Must be < fftSamples. Auto deduced from canvas size by default. */
  noverlap?: number
  /** The window function to be used. */
  windowFunc?:
    | 'bartlett'
    | 'bartlettHann'
    | 'blackman'
    | 'cosine'
    | 'gauss'
    | 'hamming'
    | 'hann'
    | 'lanczoz'
    | 'rectangular'
    | 'triangular'
  /** Some window functions have this extra value. (Between 0 and 1) */
  alpha?: number
  /** Min frequency to scale spectrogram. */
  frequencyMin?: number
  /** Max frequency to scale spectrogram. Set this to samplerate/2 to draw whole range of spectrogram. */
  frequencyMax?: number
  /** Sample rate of the audio when using pre-computed spectrogram data. Required when using frequenciesDataUrl. */
  sampleRate?: number
  /**
   * Based on: https://manual.audacityteam.org/man/spectrogram_settings.html
   * - Linear: Linear The linear vertical scale goes linearly from 0 kHz to 20 kHz frequency by default.
   * - Logarithmic: This view is the same as the linear view except that the vertical scale is logarithmic.
   * - Mel: The name Mel comes from the word melody to indicate that the scale is based on pitch comparisons. This is the default scale.
   * - Bark: This is a psychoacoustical scale based on subjective measurements of loudness. It is related to, but somewhat less popular than, the Mel scale.
   * - ERB: The Equivalent Rectangular Bandwidth scale or ERB is a measure used in psychoacoustics, which gives an approximation to the bandwidths of the filters in human hearing
   */
  scale?: 'linear' | 'logarithmic' | 'mel' | 'bark' | 'erb'
  /**
   * Increases / decreases the brightness of the display.
   * For small signals where the display is mostly "blue" (dark) you can increase this value to see brighter colors and give more detail.
   * If the display has too much "white", decrease this value.
   * The default is 20dB and corresponds to a -20 dB signal at a particular frequency being displayed as "white". */
  gainDB?: number
  /**
   * Affects the range of signal sizes that will be displayed as colors.
   * The default is 80 dB and means that you will not see anything for signals 80 dB below the value set for "Gain".
   */
  rangeDB?: number
  /**
   * A 256 long array of 4-element arrays. Each entry should contain a float between 0 and 1 and specify r, g, b, and alpha.
   * Each entry should contain a float between 0 and 1 and specify r, g, b, and alpha.
   * - gray: Gray scale.
   * - igray: Inverted gray scale.
   * - roseus: From https://github.com/dofuuz/roseus/blob/main/roseus/cmap/roseus.py
   */
  colorMap?: number[][] | 'gray' | 'igray' | 'roseus'
  /** Render a spectrogram for each channel independently when true. */
  splitChannels?: boolean
  /** URL with pre-computed spectrogram JSON data, the data must be a Uint8Array[][] **/
  frequenciesDataUrl?: string
  /** Maximum width of individual canvas elements in pixels (default: 30000) */
  maxCanvasWidth?: number
  /** Performance mode: 'fast' reduces quality for better performance, 'quality' for better visuals */
  performanceMode?: 'fast' | 'quality'
  /** Use WASM for FFT calculations when available (default: true) */
  useWasm?: boolean
}

export type SpectrogramPluginEvents = BasePluginEvents & {
  ready: []
  click: [relativeX: number]
}

class SpectrogramPlugin extends BasePlugin<SpectrogramPluginEvents, SpectrogramPluginOptions> {
  private static MAX_CANVAS_WIDTH = 30000
  private static MAX_NODES = 10
  
  private frequenciesDataUrl?: string
  private container: HTMLElement
  private wrapper: HTMLElement
  private labelsEl: HTMLCanvasElement
  private canvases: HTMLCanvasElement[] = []
  private canvasContainer: HTMLElement
  private colorMap: SpectrogramPluginOptions['colorMap']
  private fftSamples: SpectrogramPluginOptions['fftSamples']
  private height: SpectrogramPluginOptions['height']
  private noverlap: SpectrogramPluginOptions['noverlap']
  private windowFunc: SpectrogramPluginOptions['windowFunc']
  private alpha: SpectrogramPluginOptions['alpha']
  private frequencyMin: SpectrogramPluginOptions['frequencyMin']
  private frequencyMax: SpectrogramPluginOptions['frequencyMax']
  private gainDB: SpectrogramPluginOptions['gainDB']
  private rangeDB: SpectrogramPluginOptions['rangeDB']
  private scale: SpectrogramPluginOptions['scale']
  private numMelFilters: number
  private numLogFilters: number
  private numBarkFilters: number
  private numErbFilters: number
  
  // WASM FFT support
  private fft: FFT | null = null
  private wasmFFT: WasmFFT | null = null
  private wasmFilterBank: WasmFilterBank | null = null
  private isWasmAvailable: boolean = false
  private useWasm: boolean = true
  
  // Performance optimization properties
  private cachedFrequencies: Uint8Array[][] | null = null
  private cachedResampledData: Uint8Array[][] | null = null
  private cachedBuffer: AudioBuffer | null = null
  private cachedWidth = 0
  private renderTimeout: number | null = null
  private isRendering = false
  private lastZoomLevel = 0
  private renderThrottleMs = 50 // Reduced frequency for better performance
  private zoomThreshold = 0.05 // More sensitive zoom detection
  private drawnCanvases: Record<number, boolean> = {}
  private pendingBitmaps = new Set<Promise<ImageBitmap>>()
  private isScrollable = false
  private scrollUnsubscribe: (() => void) | null = null

  static create(options?: SpectrogramPluginOptions) {
    return new SpectrogramPlugin(options || {})
  }

  constructor(options: SpectrogramPluginOptions) {
    super(options)

    this.frequenciesDataUrl = options.frequenciesDataUrl

    // Validate that sampleRate is provided when using frequenciesDataUrl
    if (this.frequenciesDataUrl && !options.sampleRate) {
      throw new Error('sampleRate option is required when using frequenciesDataUrl')
    }

    this.container =
      'string' == typeof options.container ? document.querySelector(options.container) : options.container

    // WASM option (enabled by default)
    this.useWasm = options.useWasm !== false

    if (options.colorMap && typeof options.colorMap !== 'string') {
      if (options.colorMap.length < 256) {
        throw new Error('Colormap must contain 256 elements')
      }
      for (let i = 0; i < options.colorMap.length; i++) {
        const cmEntry = options.colorMap[i]
        if (cmEntry.length !== 4) {
          throw new Error('ColorMap entries must contain 4 values')
        }
      }
      this.colorMap = options.colorMap
    } else {
      this.colorMap = options.colorMap || 'roseus'
      switch (this.colorMap) {
        case 'gray':
          this.colorMap = []
          for (let i = 0; i < 256; i++) {
            const val = (255 - i) / 256
            this.colorMap.push([val, val, val, 1])
          }
          break
        case 'igray':
          this.colorMap = []
          for (let i = 0; i < 256; i++) {
            const val = i / 256
            this.colorMap.push([val, val, val, 1])
          }
          break
        case 'roseus':
          this.colorMap = [[0.004528, 0.004341, 0.004307, 1],[0.005625, 0.006156, 0.006010, 1],[0.006628, 0.008293, 0.008161, 1],[0.007551, 0.010738, 0.010790, 1],[0.008382, 0.013482, 0.013941, 1],[0.009111, 0.016520, 0.017662, 1],[0.009727, 0.019846, 0.022009, 1],[0.010223, 0.023452, 0.027035, 1],[0.010593, 0.027331, 0.032799, 1],[0.010833, 0.031475, 0.039361, 1],[0.010941, 0.035875, 0.046415, 1],[0.010918, 0.040520, 0.053597, 1],[0.010768, 0.045158, 0.060914, 1],[0.010492, 0.049708, 0.068367, 1],[0.010098, 0.054171, 0.075954, 1],[0.009594, 0.058549, 0.083672, 1],[0.008989, 0.062840, 0.091521, 1],[0.008297, 0.067046, 0.099499, 1],[0.007530, 0.071165, 0.107603, 1],[0.006704, 0.075196, 0.115830, 1],[0.005838, 0.079140, 0.124178, 1],[0.004949, 0.082994, 0.132643, 1],[0.004062, 0.086758, 0.141223, 1],[0.003198, 0.090430, 0.149913, 1],[0.002382, 0.094010, 0.158711, 1],[0.001643, 0.097494, 0.167612, 1],[0.001009, 0.100883, 0.176612, 1],[0.000514, 0.104174, 0.185704, 1],[0.000187, 0.107366, 0.194886, 1],[0.000066, 0.110457, 0.204151, 1],[0.000186, 0.113445, 0.213496, 1],[0.000587, 0.116329, 0.222914, 1],[0.001309, 0.119106, 0.232397, 1],[0.002394, 0.121776, 0.241942, 1],[0.003886, 0.124336, 0.251542, 1],[0.005831, 0.126784, 0.261189, 1],[0.008276, 0.129120, 0.270876, 1],[0.011268, 0.131342, 0.280598, 1],[0.014859, 0.133447, 0.290345, 1],[0.019100, 0.135435, 0.300111, 1],[0.024043, 0.137305, 0.309888, 1],[0.029742, 0.139054, 0.319669, 1],[0.036252, 0.140683, 0.329441, 1],[0.043507, 0.142189, 0.339203, 1],[0.050922, 0.143571, 0.348942, 1],[0.058432, 0.144831, 0.358649, 1],[0.066041, 0.145965, 0.368319, 1],[0.073744, 0.146974, 0.377938, 1],[0.081541, 0.147858, 0.387501, 1],[0.089431, 0.148616, 0.396998, 1],[0.097411, 0.149248, 0.406419, 1],[0.105479, 0.149754, 0.415755, 1],[0.113634, 0.150134, 0.424998, 1],[0.121873, 0.150389, 0.434139, 1],[0.130192, 0.150521, 0.443167, 1],[0.138591, 0.150528, 0.452075, 1],[0.147065, 0.150413, 0.460852, 1],[0.155614, 0.150175, 0.469493, 1],[0.164232, 0.149818, 0.477985, 1],[0.172917, 0.149343, 0.486322, 1],[0.181666, 0.148751, 0.494494, 1],[0.190476, 0.148046, 0.502493, 1],[0.199344, 0.147229, 0.510313, 1],[0.208267, 0.146302, 0.517944, 1],[0.217242, 0.145267, 0.525380, 1],[0.226264, 0.144131, 0.532613, 1],[0.235331, 0.142894, 0.539635, 1],[0.244440, 0.141559, 0.546442, 1],[0.253587, 0.140131, 0.553026, 1],[0.262769, 0.138615, 0.559381, 1],[0.271981, 0.137016, 0.565500, 1],[0.281222, 0.135335, 0.571381, 1],[0.290487, 0.133581, 0.577017, 1],[0.299774, 0.131757, 0.582404, 1],[0.309080, 0.129867, 0.587538, 1],[0.318399, 0.127920, 0.592415, 1],[0.327730, 0.125921, 0.597032, 1],[0.337069, 0.123877, 0.601385, 1],[0.346413, 0.121793, 0.605474, 1],[0.355758, 0.119678, 0.609295, 1],[0.365102, 0.117540, 0.612846, 1],[0.374443, 0.115386, 0.616127, 1],[0.383774, 0.113226, 0.619138, 1],[0.393096, 0.111066, 0.621876, 1],[0.402404, 0.108918, 0.624343, 1],[0.411694, 0.106794, 0.626540, 1],[0.420967, 0.104698, 0.628466, 1],[0.430217, 0.102645, 0.630123, 1],[0.439442, 0.100647, 0.631513, 1],[0.448637, 0.098717, 0.632638, 1],[0.457805, 0.096861, 0.633499, 1],[0.466940, 0.095095, 0.634100, 1],[0.476040, 0.093433, 0.634443, 1],[0.485102, 0.091885, 0.634532, 1],[0.494125, 0.090466, 0.634370, 1],[0.503104, 0.089190, 0.633962, 1],[0.512041, 0.088067, 0.633311, 1],[0.520931, 0.087108, 0.632420, 1],[0.529773, 0.086329, 0.631297, 1],[0.538564, 0.085738, 0.629944, 1],[0.547302, 0.085346, 0.628367, 1],[0.555986, 0.085162, 0.626572, 1],[0.564615, 0.085190, 0.624563, 1],[0.573187, 0.085439, 0.622345, 1],[0.581698, 0.085913, 0.619926, 1],[0.590149, 0.086615, 0.617311, 1],[0.598538, 0.087543, 0.614503, 1],[0.606862, 0.088700, 0.611511, 1],[0.615120, 0.090084, 0.608343, 1],[0.623312, 0.091690, 0.605001, 1],[0.631438, 0.093511, 0.601489, 1],[0.639492, 0.095546, 0.597821, 1],[0.647476, 0.097787, 0.593999, 1],[0.655389, 0.100226, 0.590028, 1],[0.663230, 0.102856, 0.585914, 1],[0.670995, 0.105669, 0.581667, 1],[0.678686, 0.108658, 0.577291, 1],[0.686302, 0.111813, 0.572790, 1],[0.693840, 0.115129, 0.568175, 1],[0.701300, 0.118597, 0.563449, 1],[0.708682, 0.122209, 0.558616, 1],[0.715984, 0.125959, 0.553687, 1],[0.723206, 0.129840, 0.548666, 1],[0.730346, 0.133846, 0.543558, 1],[0.737406, 0.137970, 0.538366, 1],[0.744382, 0.142209, 0.533101, 1],[0.751274, 0.146556, 0.527767, 1],[0.758082, 0.151008, 0.522369, 1],[0.764805, 0.155559, 0.516912, 1],[0.771443, 0.160206, 0.511402, 1],[0.777995, 0.164946, 0.505845, 1],[0.784459, 0.169774, 0.500246, 1],[0.790836, 0.174689, 0.494607, 1],[0.797125, 0.179688, 0.488935, 1],[0.803325, 0.184767, 0.483238, 1],[0.809435, 0.189925, 0.477518, 1],[0.815455, 0.195160, 0.471781, 1],[0.821384, 0.200471, 0.466028, 1],[0.827222, 0.205854, 0.460267, 1],[0.832968, 0.211308, 0.454505, 1],[0.838621, 0.216834, 0.448738, 1],[0.844181, 0.222428, 0.442979, 1],[0.849647, 0.228090, 0.437230, 1],[0.855019, 0.233819, 0.431491, 1],[0.860295, 0.239613, 0.425771, 1],[0.865475, 0.245471, 0.420074, 1],[0.870558, 0.251393, 0.414403, 1],[0.875545, 0.257380, 0.408759, 1],[0.880433, 0.263427, 0.403152, 1],[0.885223, 0.269535, 0.397585, 1],[0.889913, 0.275705, 0.392058, 1],[0.894503, 0.281934, 0.386578, 1],[0.898993, 0.288222, 0.381152, 1],[0.903381, 0.294569, 0.375781, 1],[0.907667, 0.300974, 0.370469, 1],[0.911849, 0.307435, 0.365223, 1],[0.915928, 0.313953, 0.360048, 1],[0.919902, 0.320527, 0.354948, 1],[0.923771, 0.327155, 0.349928, 1],[0.927533, 0.333838, 0.344994, 1],[0.931188, 0.340576, 0.340149, 1],[0.934736, 0.347366, 0.335403, 1],[0.938175, 0.354207, 0.330762, 1],[0.941504, 0.361101, 0.326229, 1],[0.944723, 0.368045, 0.321814, 1],[0.947831, 0.375039, 0.317523, 1],[0.950826, 0.382083, 0.313364, 1],[0.953709, 0.389175, 0.309345, 1],[0.956478, 0.396314, 0.305477, 1],[0.959133, 0.403499, 0.301766, 1],[0.961671, 0.410731, 0.298221, 1],[0.964093, 0.418008, 0.294853, 1],[0.966399, 0.425327, 0.291676, 1],[0.968586, 0.432690, 0.288696, 1],[0.970654, 0.440095, 0.285926, 1],[0.972603, 0.447540, 0.283380, 1],[0.974431, 0.455025, 0.281067, 1],[0.976139, 0.462547, 0.279003, 1],[0.977725, 0.470107, 0.277198, 1],[0.979188, 0.477703, 0.275666, 1],[0.980529, 0.485332, 0.274422, 1],[0.981747, 0.492995, 0.273476, 1],[0.982840, 0.500690, 0.272842, 1],[0.983808, 0.508415, 0.272532, 1],[0.984653, 0.516168, 0.272560, 1],[0.985373, 0.523948, 0.272937, 1],[0.985966, 0.531754, 0.273673, 1],[0.986436, 0.539582, 0.274779, 1],[0.986780, 0.547434, 0.276264, 1],[0.986998, 0.555305, 0.278135, 1],[0.987091, 0.563195, 0.280401, 1],[0.987061, 0.571100, 0.283066, 1],[0.986907, 0.579019, 0.286137, 1],[0.986629, 0.586950, 0.289615, 1],[0.986229, 0.594891, 0.293503, 1],[0.985709, 0.602839, 0.297802, 1],[0.985069, 0.610792, 0.302512, 1],[0.984310, 0.618748, 0.307632, 1],[0.983435, 0.626704, 0.313159, 1],[0.982445, 0.634657, 0.319089, 1],[0.981341, 0.642606, 0.325420, 1],[0.980130, 0.650546, 0.332144, 1],[0.978812, 0.658475, 0.339257, 1],[0.977392, 0.666391, 0.346753, 1],[0.975870, 0.674290, 0.354625, 1],[0.974252, 0.682170, 0.362865, 1],[0.972545, 0.690026, 0.371466, 1],[0.970750, 0.697856, 0.380419, 1],[0.968873, 0.705658, 0.389718, 1],[0.966921, 0.713426, 0.399353, 1],[0.964901, 0.721157, 0.409313, 1],[0.962815, 0.728851, 0.419594, 1],[0.960677, 0.736500, 0.430181, 1],[0.958490, 0.744103, 0.441070, 1],[0.956263, 0.751656, 0.452248, 1],[0.954009, 0.759153, 0.463702, 1],[0.951732, 0.766595, 0.475429, 1],[0.949445, 0.773974, 0.487414, 1],[0.947158, 0.781289, 0.499647, 1],[0.944885, 0.788535, 0.512116, 1],[0.942634, 0.795709, 0.524811, 1],[0.940423, 0.802807, 0.537717, 1],[0.938261, 0.809825, 0.550825, 1],[0.936163, 0.816760, 0.564121, 1],[0.934146, 0.823608, 0.577591, 1],[0.932224, 0.830366, 0.591220, 1],[0.930412, 0.837031, 0.604997, 1],[0.928727, 0.843599, 0.618904, 1],[0.927187, 0.850066, 0.632926, 1],[0.925809, 0.856432, 0.647047, 1],[0.924610, 0.862691, 0.661249, 1],[0.923607, 0.868843, 0.675517, 1],[0.922820, 0.874884, 0.689832, 1],[0.922265, 0.880812, 0.704174, 1],[0.921962, 0.886626, 0.718523, 1],[0.921930, 0.892323, 0.732859, 1],[0.922183, 0.897903, 0.747163, 1],[0.922741, 0.903364, 0.761410, 1],[0.923620, 0.908706, 0.775580, 1],[0.924837, 0.913928, 0.789648, 1],[0.926405, 0.919031, 0.803590, 1],[0.928340, 0.924015, 0.817381, 1],[0.930655, 0.928881, 0.830995, 1],[0.933360, 0.933631, 0.844405, 1],[0.936466, 0.938267, 0.857583, 1],[0.939982, 0.942791, 0.870499, 1],[0.943914, 0.947207, 0.883122, 1],[0.948267, 0.951519, 0.895421, 1],[0.953044, 0.955732, 0.907359, 1],[0.958246, 0.959852, 0.918901, 1],[0.963869, 0.963887, 0.930004, 1],[0.969909, 0.967845, 0.940623, 1],[0.976355, 0.971737, 0.950704, 1],[0.983195, 0.975580, 0.960181, 1],[0.990402, 0.979395, 0.968966, 1],[0.997930, 0.983217, 0.976920, 1]]
          break
        default:
          throw Error("No such colormap '" + this.colorMap + "'")
      }
    }
    this.fftSamples = options.fftSamples || 512
    this.height = options.height || 200
    this.noverlap = options.noverlap || null // Will be calculated later based on canvas size
    this.windowFunc = options.windowFunc || 'hann'
    this.alpha = options.alpha

    // Getting file's original samplerate is difficult(#1248).
    // So set 12kHz default to render like wavesurfer.js 5.x.
    this.frequencyMin = options.frequencyMin || 0
    this.frequencyMax = options.frequencyMax || 0

    this.gainDB = options.gainDB ?? 20
    this.rangeDB = options.rangeDB ?? 80
    this.scale = options.scale || 'mel'

    // Other values will currently cause a misalignment between labels and the spectrogram
    this.numMelFilters = this.fftSamples / 2
    this.numLogFilters = this.fftSamples / 2
    this.numBarkFilters = this.fftSamples / 2
    this.numErbFilters = this.fftSamples / 2

    // Override the default max canvas width if provided
    if (options.maxCanvasWidth) {
      SpectrogramPlugin.MAX_CANVAS_WIDTH = options.maxCanvasWidth
    }

    // Adjust performance settings only for fast mode
    if (options.performanceMode === 'fast') {
      this.renderThrottleMs = 100 // Slower updates for better performance
      this.zoomThreshold = 0.2 // Less sensitive zoom detection
      // Only reduce FFT resolution if not explicitly set
      if (!options.fftSamples) {
        this.fftSamples = 256 // Lower resolution for performance
      }
    } else {
      // Quality mode - use good defaults
      this.renderThrottleMs = 50
      this.zoomThreshold = 0.05
    }

    this.createWrapper()
    this.createCanvas()
  }

  onInit() {
    // Recreate DOM elements if they were destroyed
    if (!this.wrapper) {
      this.createWrapper()
    }
    if (!this.canvasContainer) {
      this.createCanvas()
    }

    // Initialize WASM if enabled
    if (this.useWasm) {
      this.initializeWasm()
    }

    // Always get fresh container reference to avoid stale references
    this.container = this.wavesurfer.getWrapper()
    this.container.appendChild(this.wrapper)

    if (this.wavesurfer.options.fillParent) {
      Object.assign(this.wrapper.style, {
        width: '100%',
        overflowX: 'hidden',
        overflowY: 'hidden',
      })
    }
    this.subscriptions.push(this.wavesurfer.on('redraw', () => this.throttledRender()))
  
    // Trigger initial render after re-initialization
    // This ensures the spectrogram appears even if no redraw event is fired
    if (this.wavesurfer.getDecodedData()) {
      // Use setTimeout to ensure DOM is fully ready
      setTimeout(() => {
        this.throttledRender()
      }, 0)
    }
  }

  private initializeWasm() {
    try {
      // Try synchronous initialization first (works when WASM is inlined)
      // Fallback to async initialization
      wasmInit()
        .then((wasmModule) => {
          console.log('✅ WASM module initialized for spectrogram plugin:', wasmModule)
          this.isWasmAvailable = true
        })
        .catch((error) => {
          console.warn('❌ Async WASM init failed:', error.message)
          console.log('Will use JavaScript fallback for FFT calculations')
          this.isWasmAvailable = false
        })
    } catch (error) {
      console.warn('❌ WASM FFT not available, using JavaScript fallback:', error.message)
      this.isWasmAvailable = false
    }
  }

  public destroy() {
    this.unAll()
    
    // Clean up any direct event listeners (if they exist)
    if (this.wavesurfer) {
      // Note: _onReady and _onRender methods may not exist, but the original code had these
      // We should be cautious and only call un if the methods exist
      if (typeof this._onReady === 'function') {
        this.wavesurfer.un('ready', this._onReady)
      }
      if (typeof this._onRender === 'function') {
        this.wavesurfer.un('redraw', this._onRender)
      }
    }
    
    // Clean up performance optimization resources
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout)
      this.renderTimeout = null
    }
    
    // Clean up scroll listener
    if (this.scrollUnsubscribe) {
      this.scrollUnsubscribe()
      this.scrollUnsubscribe = null
    }
    
    // Cancel pending bitmap operations
    this.pendingBitmaps.clear()
    
    this.cachedFrequencies = null
    this.cachedResampledData = null
    this.cachedBuffer = null
    
    // Clean up WASM FFT
    if (this.wasmFFT) {
      try {
        this.wasmFFT.free()
        console.log('🧹 WASM FFT memory cleaned up')
      } catch (error) {
        console.warn('Failed to clean up WASM FFT:', error)
      }
      this.wasmFFT = null
    }

    // Clean up WASM filter bank
    if (this.wasmFilterBank) {
      try {
        this.wasmFilterBank.free()
        console.log('🧹 WASM FilterBank memory cleaned up')
      } catch (error) {
        console.warn('Failed to clean up WASM FilterBank:', error)
      }
      this.wasmFilterBank = null
    }
    
    // Clean up DOM elements properly
    this.clearCanvases()
    if (this.canvasContainer) {
      this.canvasContainer.remove()
      this.canvasContainer = null
    }
    if (this.wrapper) {
      this.wrapper.remove()
      this.wrapper = null
    }
    if (this.labelsEl) {
      // Properly remove labels canvas from DOM before nullifying reference
      this.labelsEl.remove()
      this.labelsEl = null
    }
    
    // Reset state for potential re-initialization
    this.container = null
    this.isRendering = false
    this.lastZoomLevel = 0
    this.fft = null
    this.wasmFFT = null
    this.wasmFilterBank = null
    this.isWasmAvailable = false
    this.wavesurfer = null
    this.util = null
    this.options = null
    
    super.destroy()
  }

  public async loadFrequenciesData(url: string | URL) {
    const resp = await fetch(url)
    if (!resp.ok) {
      throw new Error('Unable to fetch frequencies data')
    }
    const data = await resp.json()
    this.drawSpectrogram(data)
  }

  /** Clear cached frequency data to force recalculation */
  public clearCache() {
    this.cachedFrequencies = null
    this.cachedResampledData = null
    this.cachedBuffer = null
    this.cachedWidth = 0
    this.lastZoomLevel = 0
    
    // Clear WASM FFT instances to force re-initialization
    if (this.wasmFFT) {
      try {
        this.wasmFFT.free()
      } catch (error) {
        console.warn('Failed to free WASM FFT during cache clear:', error)
      }
      this.wasmFFT = null
    }
    
    if (this.wasmFilterBank) {
      try {
        this.wasmFilterBank.free()
      } catch (error) {
        console.warn('Failed to free WASM FilterBank during cache clear:', error)
      }
      this.wasmFilterBank = null
    }
    
    // Clear JS FFT instance
    this.fft = null
  }

  private createWrapper() {
    this.wrapper = createElement('div', {
      style: {
        display: 'block',
        position: 'relative',
        userSelect: 'none',
      },
    })

    // if labels are active
    if (this.options.labels) {
      this.labelsEl = createElement(
        'canvas',
        {
          part: 'spec-labels',
          style: {
            position: 'absolute',
            zIndex: 9,
            width: '55px',
            height: '100%',
          },
        },
        this.wrapper,
      )
    }

    // Remove any existing event listener before adding new one
    this.wrapper.removeEventListener('click', this._onWrapperClick)
    this.wrapper.addEventListener('click', this._onWrapperClick)
  }

  private createCanvas() {
    this.canvasContainer = createElement(
      'div',
      {
        style: {
          position: 'absolute',
          left: 0,
          top: 0,
          width: '100%',
          height: '100%',
          zIndex: 4,
        },
      },
      this.wrapper,
    )
  }

  private createSingleCanvas(width: number, height: number, offset: number): HTMLCanvasElement {
    const canvas = createElement('canvas', {
      style: {
        position: 'absolute',
        left: `${Math.round(offset)}px`,
        top: '0',
        width: `${width}px`,
        height: `${height}px`,
        zIndex: 4,
      },
    })
    
    canvas.width = Math.round(width)
    canvas.height = Math.round(height)
    
    this.canvasContainer.appendChild(canvas)
    return canvas
  }

  private clearCanvases() {
    this.canvases.forEach(canvas => canvas.remove())
    this.canvases = []
    this.drawnCanvases = {}
  }

  private clearExcessCanvases() {
    // Clear canvases to avoid too many DOM nodes
    if (Object.keys(this.drawnCanvases).length > SpectrogramPlugin.MAX_NODES) {
      this.clearCanvases()
    }
  }

  private throttledRender() {
    // Clear any pending render
    if (this.renderTimeout) {
      clearTimeout(this.renderTimeout)
    }
    
    // Skip if already rendering
    if (this.isRendering) {
      return
    }
    
    // Check if zoom level changed significantly
    const currentZoom = this.wavesurfer?.options.minPxPerSec || 0
    const zoomDiff = Math.abs(currentZoom - this.lastZoomLevel) / Math.max(currentZoom, this.lastZoomLevel, 1)
    
    if (zoomDiff < this.zoomThreshold && this.cachedFrequencies) {
      // Small zoom change - just re-render with cached data
      this.renderTimeout = window.setTimeout(() => {
        this.fastRender()
      }, this.renderThrottleMs)
    } else {
      // Significant zoom change - full re-render
      this.renderTimeout = window.setTimeout(() => {
        this.render()
      }, this.renderThrottleMs)
    }
  }

  private render() {
    if (this.isRendering) return
    this.isRendering = true
    
    try {
      if (this.frequenciesDataUrl) {
        this.loadFrequenciesData(this.frequenciesDataUrl)
      } else {
        const decodedData = this.wavesurfer?.getDecodedData()
        if (decodedData) {
          // Check if we can use cached frequencies
          if (this.cachedBuffer === decodedData && this.cachedFrequencies) {
            this.drawSpectrogram(this.cachedFrequencies)
          } else {
            // Calculate new frequencies and cache them
            const frequencies = this.getFrequencies(decodedData)
            this.cachedFrequencies = frequencies
            this.cachedBuffer = decodedData
            this.drawSpectrogram(frequencies)
          }
        }
      }
      this.lastZoomLevel = this.wavesurfer?.options.minPxPerSec || 0
    } finally {
      this.isRendering = false
    }
  }
  
  private fastRender() {
    if (this.isRendering || !this.cachedFrequencies) return
    this.isRendering = true
    
    try {
      // Use cached frequencies for fast re-render
      this.drawSpectrogram(this.cachedFrequencies)
      this.lastZoomLevel = this.wavesurfer?.options.minPxPerSec || 0
    } finally {
      this.isRendering = false
    }
  }

    private drawSpectrogram(frequenciesData: Uint8Array[][]): void {
    if (!isNaN(frequenciesData[0][0])) {
      // data is 1ch [sample, freq] format
      // to [channel, sample, freq] format
      frequenciesData = [frequenciesData]
    }

    // Clear existing canvases
    this.clearCanvases()

    // Set the height to fit all channels
    const totalHeight = this.height * frequenciesData.length
    this.wrapper.style.height = totalHeight + 'px'

    const totalWidth = this.getWidth()
    const maxCanvasWidth = Math.min(SpectrogramPlugin.MAX_CANVAS_WIDTH, totalWidth)
    
    // Nothing to render
    if (totalWidth === 0 || totalHeight === 0) return

    // Calculate number of canvases needed
    const numCanvases = Math.ceil(totalWidth / maxCanvasWidth)

    // Smart resampling based on zoom level
    let resampledData: Uint8Array[][]
    const originalDataWidth = frequenciesData[0]?.length || 0
    const needsResampling = totalWidth !== originalDataWidth
    
    if (!needsResampling) {
      // At high zoom levels, use original data directly - much faster!
      resampledData = frequenciesData
    } else if (this.cachedResampledData && this.cachedWidth === totalWidth) {
      // Use cached resampled data
      resampledData = this.cachedResampledData
    } else {
      // Only resample when actually needed
      resampledData = this.efficientResample(frequenciesData, totalWidth)
      this.cachedResampledData = resampledData
      this.cachedWidth = totalWidth
    }

    // Maximum frequency represented in `frequenciesData`
    // Use buffer.sampleRate if available (from getFrequencies), otherwise use the provided sampleRate
    const freqFrom = this.buffer?.sampleRate ? this.buffer.sampleRate / 2 : (this.options.sampleRate || 0) / 2

    // Minimum and maximum frequency we want to draw
    const freqMin = this.frequencyMin
    const freqMax = this.frequencyMax

    // Draw background if needed
    const shouldDrawBackground = freqMax > freqFrom
    const bgColor = shouldDrawBackground ? this.colorMap[this.colorMap.length - 1] : null

    // Function to draw a single canvas
    const drawCanvas = (canvasIndex: number) => {
      if (canvasIndex < 0 || canvasIndex >= numCanvases) return
      if (this.drawnCanvases[canvasIndex]) return
      
      this.drawnCanvases[canvasIndex] = true

      const offset = canvasIndex * maxCanvasWidth
      const canvasWidth = Math.min(maxCanvasWidth, totalWidth - offset)

      if (canvasWidth <= 0) return

      const canvas = this.createSingleCanvas(canvasWidth, totalHeight, offset)
      this.canvases.push(canvas)
      const ctx = canvas.getContext('2d')

      if (!ctx) return

      // Draw background if needed
      if (shouldDrawBackground && bgColor) {
        ctx.fillStyle = `rgba(${bgColor[0] * 255}, ${bgColor[1] * 255}, ${bgColor[2] * 255}, ${bgColor[3]})`
        ctx.fillRect(0, 0, canvasWidth, totalHeight)
      }

      // Render each channel for this canvas segment  
      for (let c = 0; c < resampledData.length; c++) {
        this.drawSpectrogramSegment(
          resampledData[c],
          ctx,
          canvasWidth,
          this.height,
          c * this.height,
          offset,
          totalWidth,
          freqFrom,
          freqMin,
          freqMax,
        )
      }
    }

    // Store rendering parameters for lazy loading
    this.isScrollable = totalWidth > this.getWrapperWidth()

    // Clear previous scroll listener
    if (this.scrollUnsubscribe) {
      this.scrollUnsubscribe()
      this.scrollUnsubscribe = null
    }

    if (!this.isScrollable || numCanvases <= 3) {
      // Draw all canvases if not scrollable or few canvases
      for (let i = 0; i < numCanvases; i++) {
        drawCanvas(i)
      }
    } else {
      // Implement lazy rendering with scroll listener
      const renderVisibleCanvases = () => {
        const wrapper = this.wavesurfer?.getWrapper()
        if (!wrapper) return

        const scrollLeft = wrapper.scrollLeft || 0
        const containerWidth = wrapper.clientWidth || 0
        
        // Calculate visible range with some buffer
        const bufferRatio = 0.5 // Render 50% extra on each side
        const visibleStart = Math.max(0, scrollLeft - containerWidth * bufferRatio)
        const visibleEnd = Math.min(totalWidth, scrollLeft + containerWidth * (1 + bufferRatio))
        
        const startCanvasIndex = Math.floor((visibleStart / totalWidth) * numCanvases)
        const endCanvasIndex = Math.min(Math.ceil((visibleEnd / totalWidth) * numCanvases), numCanvases - 1)

        // Clear excess canvases if we have too many
        if (Object.keys(this.drawnCanvases).length > SpectrogramPlugin.MAX_NODES) {
          this.clearExcessCanvases()
        }

        // Draw visible canvases
        for (let i = startCanvasIndex; i <= endCanvasIndex; i++) {
          drawCanvas(i)
        }
      }

      // Initial render of visible canvases
      renderVisibleCanvases()

      // Set up scroll listener for lazy loading
      let scrollTimeout: number | null = null
      const onScroll = () => {
        if (scrollTimeout) clearTimeout(scrollTimeout)
        scrollTimeout = window.setTimeout(renderVisibleCanvases, 16) // 60fps
      }

      const wrapper = this.wavesurfer?.getWrapper()
      if (wrapper) {
        wrapper.addEventListener('scroll', onScroll, { passive: true })
        this.scrollUnsubscribe = () => {
          wrapper.removeEventListener('scroll', onScroll)
          if (scrollTimeout) clearTimeout(scrollTimeout)
        }
      }
    }

    if (this.options.labels) {
      this.loadLabels(
        this.options.labelsBackground,
        '12px',
        '12px',
        '',
        this.options.labelsColor,
        this.options.labelsHzColor || this.options.labelsColor,
        'center',
        '#specLabels',
        frequenciesData.length,
      )
    }

    this.emit('ready')
  }

    private drawSpectrogramSegment(
    resampledPixels: Uint8Array[],
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    height: number,
    yOffset: number,
    xOffset: number,
    totalWidth: number,
    freqFrom: number,
    freqMin: number,
    freqMax: number,
  ): void {
    // Data is already resampled for the total width
    const bitmapHeight = resampledPixels[0].length

    // Calculate which portion of the resampled data corresponds to this canvas
    const startIndex = Math.floor((xOffset / totalWidth) * resampledPixels.length)
    const endIndex = Math.min(Math.ceil(((xOffset + canvasWidth) / totalWidth) * resampledPixels.length), resampledPixels.length)
    const segmentPixels = resampledPixels.slice(startIndex, endIndex)

    if (segmentPixels.length === 0) return

    // Create ImageData for this segment
    const segmentWidth = segmentPixels.length
    const imageData = new ImageData(segmentWidth, bitmapHeight)
    const data = imageData.data

    // Choose rendering method based on performance mode
    const isPerformanceMode = this.options.performanceMode === 'fast'
    
    if (isPerformanceMode && bitmapHeight > 1024) {
      // For performance mode with very high frequency resolution, use reduced vertical resolution
      this.fillImageDataFast(data, segmentPixels, segmentWidth, bitmapHeight)
    } else {
      // Standard quality rendering (default behavior)
      this.fillImageDataQuality(data, segmentPixels, segmentWidth, bitmapHeight)
    }

    // Calculate frequency scaling
    const rMin = hzToScale(freqMin, this.scale) / hzToScale(freqFrom, this.scale)
    const rMax = hzToScale(freqMax, this.scale) / hzToScale(freqFrom, this.scale)
    const rMax1 = Math.min(1, rMax)

    // Create and draw the bitmap - manage async properly
    const bitmapPromise = createImageBitmap(
      imageData,
      0,
      Math.round(bitmapHeight * (1 - rMax1)),
      segmentWidth,
      Math.round(bitmapHeight * (rMax1 - rMin)),
    )

    // Track pending bitmap for cleanup
    this.pendingBitmaps.add(bitmapPromise)
    
    bitmapPromise.then((bitmap) => {
      // Remove from pending set
      this.pendingBitmaps.delete(bitmapPromise)
      
      // Check if canvas is still valid before drawing
      if (ctx.canvas.parentNode) {
        const drawHeight = (height * rMax1) / rMax
        const drawY = yOffset + height * (1 - rMax1 / rMax)
        
        ctx.drawImage(bitmap, 0, drawY, canvasWidth, drawHeight)
        
        // Clean up bitmap to free memory
        if ('close' in bitmap) {
          bitmap.close()
        }
      }
    }).catch((error) => {
      // Clean up on error
      this.pendingBitmaps.delete(bitmapPromise)
      console.warn('Failed to create bitmap for spectrogram:', error)
    })
  }



  private getWidth() {
    return this.wavesurfer.getWrapper().offsetWidth
  }

  private getWrapperWidth() {
    return this.wavesurfer?.getWrapper()?.clientWidth || 0
  }

  private getFrequencies(buffer: AudioBuffer): Uint8Array[][] {
    const fftSamples = this.fftSamples
    const channels =
      (this.options.splitChannels ?? this.wavesurfer?.options.splitChannels) ? buffer.numberOfChannels : 1

    this.frequencyMax = this.frequencyMax || buffer.sampleRate / 2

    if (!buffer) return

    this.buffer = buffer

    // This may differ from file samplerate. Browser resamples audio.
    const sampleRate = buffer.sampleRate
    const frequencies: Uint8Array[][] = []

    let noverlap = this.noverlap
    if (!noverlap) {
      const totalWidth = this.getWidth()
      const uniqueSamplesPerPx = buffer.length / totalWidth
      noverlap = Math.max(0, Math.round(fftSamples - uniqueSamplesPerPx))
    }

    // Initialize FFT (WASM or JavaScript)
    this.initializeFFT(sampleRate)

    // Prepare filter bank
    let filterBank: number[][] | null = null
    let useWasmFilterBank = false

    if (this.scale !== 'linear') {
      if (this.isWasmAvailable && this.wasmFFT && !this.wasmFilterBank) {
        try {
          this.wasmFilterBank = new WasmFilterBank(
            this.fftSamples / 2, // numFilters
            this.fftSamples, // fftSize
            sampleRate, // sampleRate
            this.scale, // scaleType
          )
          useWasmFilterBank = true
          console.log('✅ WASM FilterBank initialized')
        } catch (error) {
          console.warn('⚠️ Failed to create WASM FilterBank, using JS fallback:', error)
          useWasmFilterBank = false
        }
      }

      if (!useWasmFilterBank) {
        // Use JavaScript filter bank with centralized function
        const numFilters = this.fftSamples / 2
        filterBank = createFilterBankForScale(this.scale, numFilters, this.fftSamples, sampleRate)
      }
    }

    const fftStartTime = performance.now()
    let totalFFTs = 0

    for (let c = 0; c < channels; c++) {
      // for each channel
      const channelData = buffer.getChannelData(c)
      const channelFreq: Uint8Array[] = []
      let currentOffset = 0

      while (currentOffset + fftSamples < channelData.length) {
        const segment = channelData.slice(currentOffset, currentOffset + fftSamples)
        let spectrum: Float32Array

        // Use WASM FFT if available, otherwise use JavaScript FFT
        if (this.isWasmAvailable && this.wasmFFT) {
          spectrum = this.wasmFFT.calculate_spectrum(segment)

          // Apply WASM filter bank if available
          if (useWasmFilterBank && this.wasmFilterBank) {
            spectrum = this.wasmFilterBank.apply(spectrum)
          }
        } else if (this.fft) {
          spectrum = this.fft.calculateSpectrum(segment)

          // Apply JS filter bank if needed
          if (filterBank) {
            spectrum = applyFilterBank(spectrum, filterBank)
          }
        } else {
          console.error('No FFT available!')
          return []
        }

        totalFFTs++

        // Convert to uint8 color indices
        let array: Uint8Array

        if (this.isWasmAvailable && this.wasmFFT) {
          // Use WASM color conversion function when WASM FFT is active
          try {
            array = db_to_color_indices(spectrum, this.gainDB || 20, this.rangeDB || 80)
          } catch (error) {
            console.warn('WASM color conversion failed, using JS fallback:', error)
            // Fallback to JS conversion
            array = this.convertSpectrumToColors(spectrum)
          }
        } else {
          // Use JS color conversion
          array = this.convertSpectrumToColors(spectrum)
        }

        channelFreq.push(array)
        // channelFreq: [sample, freq]

        currentOffset += fftSamples - noverlap
      }
      frequencies.push(channelFreq)
      // frequencies: [channel, sample, freq]
    }

    const fftEndTime = performance.now()
    const fftType = this.isWasmAvailable && this.wasmFFT ? 'WASM' : 'JS'
    console.log(
      `🔧 Spectrogram ${fftType} FFT calculation: ${totalFFTs} FFTs in ${(fftEndTime - fftStartTime).toFixed(1)}ms`,
    )

    return frequencies
  }

  private initializeFFT(sampleRate: number) {
    // Initialize WASM FFT if available and not already initialized
    if (this.useWasm && this.isWasmAvailable && !this.wasmFFT) {
      try {
        this.wasmFFT = new WasmFFT(this.fftSamples, this.windowFunc || 'hann', this.alpha)
        console.log('✅ WASM FFT initialized for spectrogram plugin')
      } catch (error) {
        console.warn('⚠️ Failed to create WASM FFT, falling back to JS:', error)
        this.isWasmAvailable = false
      }
    }

    // Initialize JS FFT if WASM is not being used or not available
    if (!this.isWasmAvailable && !this.fft) {
      this.fft = new FFT(this.fftSamples, sampleRate, this.windowFunc, this.alpha)
    }
  }

  private convertSpectrumToColors(spectrum: Float32Array): Uint8Array {
    const array = new Uint8Array(spectrum.length)
    const gainPlusRange = this.gainDB + this.rangeDB

    for (let j = 0; j < spectrum.length; j++) {
      // Based on: https://manual.audacityteam.org/man/spectrogram_view.html
      const magnitude = spectrum[j] > 1e-12 ? spectrum[j] : 1e-12
      const valueDB = 20 * Math.log10(magnitude)
      if (valueDB < -gainPlusRange) {
        array[j] = 0
      } else if (valueDB > -this.gainDB) {
        array[j] = 255
      } else {
        array[j] = Math.round(((valueDB + this.gainDB) / this.rangeDB) * 255)
      }
    }

    return array
  }

  private freqType(freq) {
    return freq >= 1000 ? (freq / 1000).toFixed(1) : Math.round(freq)
  }

  private unitType(freq) {
    return freq >= 1000 ? 'kHz' : 'Hz'
  }

  private getLabelFrequency(index: number, labelIndex: number) {
    const scaleMin = hzToScale(this.frequencyMin, this.scale)
    const scaleMax = hzToScale(this.frequencyMax, this.scale)
    return scaleToHz(scaleMin + (index / labelIndex) * (scaleMax - scaleMin), this.scale)
  }

  private loadLabels(
    bgFill,
    fontSizeFreq,
    fontSizeUnit,
    fontType,
    textColorFreq,
    textColorUnit,
    textAlign,
    container,
    channels,
  ) {
    const frequenciesHeight = this.height
    bgFill = bgFill || 'rgba(68,68,68,0)'
    fontSizeFreq = fontSizeFreq || '12px'
    fontSizeUnit = fontSizeUnit || '12px'
    fontType = fontType || 'Helvetica'
    textColorFreq = textColorFreq || '#fff'
    textColorUnit = textColorUnit || '#fff'
    textAlign = textAlign || 'center'
    container = container || '#specLabels'
    const bgWidth = 55
    const getMaxY = frequenciesHeight || 512
    const labelIndex = 5 * (getMaxY / 256)
    const freqStart = this.frequencyMin
    const step = (this.frequencyMax - freqStart) / labelIndex

    // prepare canvas element for labels
    const ctx = this.labelsEl.getContext('2d')
    const dispScale = window.devicePixelRatio
    this.labelsEl.height = this.height * channels * dispScale
    this.labelsEl.width = bgWidth * dispScale
    ctx.scale(dispScale, dispScale)

    if (!ctx) {
      return
    }

    for (let c = 0; c < channels; c++) {
      // for each channel
      // fill background
      ctx.fillStyle = bgFill
      ctx.fillRect(0, c * getMaxY, bgWidth, (1 + c) * getMaxY)
      ctx.fill()
      let i

      // render labels
      for (i = 0; i <= labelIndex; i++) {
        ctx.textAlign = textAlign
        ctx.textBaseline = 'middle'

        const freq = this.getLabelFrequency(i, labelIndex)
        const label = this.freqType(freq)
        const units = this.unitType(freq)
        const x = 16
        let y = (1 + c) * getMaxY - (i / labelIndex) * getMaxY

        // Make sure label remains in view
        y = Math.min(Math.max(y, c * getMaxY + 10), (1 + c) * getMaxY - 10)

        // unit label
        ctx.fillStyle = textColorUnit
        ctx.font = fontSizeUnit + ' ' + fontType
        ctx.fillText(units, x + 24, y)
        // freq label
        ctx.fillStyle = textColorFreq
        ctx.font = fontSizeFreq + ' ' + fontType
        ctx.fillText(label, x, y)
      }
    }
  }

  private _onWrapperClick = (e: MouseEvent) => {
    const rect = this.wrapper.getBoundingClientRect()
    const relativeX = e.clientX - rect.left
    const relativeWidth = rect.width
    const relativePosition = relativeX / relativeWidth
    this.emit('click', relativePosition)
  }

  private efficientResample(frequenciesData: Uint8Array[][], targetWidth: number): Uint8Array[][] {
    return frequenciesData.map(channelFreq => this.resampleChannel(channelFreq, targetWidth))
  }

  private resampleChannel(oldMatrix: Uint8Array[], targetWidth: number): Uint8Array[] {
    const oldColumns = oldMatrix.length
    const freqBins = oldMatrix[0]?.length || 0
    
    // Fast path for no resampling needed
    if (oldColumns === targetWidth || targetWidth === 0) {
      return oldMatrix
    }
    
    const ratio = oldColumns / targetWidth
    const isPerformanceMode = this.options.performanceMode === 'fast'
    
    // Use aggressive optimization only in performance mode with extreme ratios
    if (isPerformanceMode && ratio > 8) {
      return this.fastDownsample(oldMatrix, targetWidth, freqBins)
    }
    
    // Standard resampling for good quality
    const newMatrix = new Array(targetWidth)
    
    if (ratio >= 1) {
      // Downsampling with proper averaging
      for (let i = 0; i < targetWidth; i++) {
        const start = Math.floor(i * ratio)
        const end = Math.min(Math.ceil((i + 1) * ratio), oldColumns)
        const count = end - start
        
        // Always create new column to avoid reference issues
        const column = new Uint8Array(freqBins)
        if (count === 1) {
          // Single source column - copy data
          column.set(oldMatrix[start])
        } else {
          // Average multiple source columns
          for (let k = 0; k < freqBins; k++) {
            let sum = 0
            for (let j = start; j < end; j++) {
              sum += oldMatrix[j][k]
            }
            column[k] = Math.round(sum / count)
          }
        }
        newMatrix[i] = column
      }
    } else {
      // Upsampling with linear interpolation for quality
      for (let i = 0; i < targetWidth; i++) {
        const srcIndex = i * ratio
        const leftIndex = Math.floor(srcIndex)
        const rightIndex = Math.min(leftIndex + 1, oldColumns - 1)
        const weight = srcIndex - leftIndex
        
        const column = new Uint8Array(freqBins)
        
        if (weight === 0 || leftIndex === rightIndex || isPerformanceMode) {
          // Exact match, at boundary, or performance mode - use nearest neighbor
          column.set(oldMatrix[leftIndex])
        } else {
          // Linear interpolation for better quality
          const leftColumn = oldMatrix[leftIndex]
          const rightColumn = oldMatrix[rightIndex]
          const invWeight = 1 - weight
          for (let k = 0; k < freqBins; k++) {
            column[k] = Math.round(leftColumn[k] * invWeight + rightColumn[k] * weight)
          }
        }
        newMatrix[i] = column
      }
    }

    return newMatrix
  }

  private fastDownsample(oldMatrix: Uint8Array[], targetWidth: number, freqBins: number): Uint8Array[] {
    // For extreme downsampling, use stride-based sampling with some averaging
    const ratio = oldMatrix.length / targetWidth
    const newMatrix = new Array(targetWidth)
    
    for (let i = 0; i < targetWidth; i++) {
      const start = Math.floor(i * ratio)
      const end = Math.min(Math.floor((i + 1) * ratio), oldMatrix.length)
      const sampleCount = Math.min(4, end - start) // Limit averaging to reduce computation
      
      const column = new Uint8Array(freqBins)
      
      if (sampleCount === 1) {
        // Single sample
        column.set(oldMatrix[start])
      } else {
        // Average a few samples for better quality
        for (let k = 0; k < freqBins; k++) {
          let sum = 0
          for (let j = start; j < start + sampleCount; j++) {
            sum += oldMatrix[j][k]
          }
          column[k] = Math.round(sum / sampleCount)
        }
      }
      
      newMatrix[i] = column
    }
    
    return newMatrix
  }

  private fillImageDataQuality(data: Uint8ClampedArray, segmentPixels: Uint8Array[], segmentWidth: number, bitmapHeight: number): void {
    // High quality rendering - process all pixels
    const colorMap = this.colorMap
    for (let i = 0; i < segmentWidth; i++) {
      const column = segmentPixels[i]
      for (let j = 0; j < bitmapHeight; j++) {
        const colorIndex = column[j]
        const color = colorMap[colorIndex]
        const pixelIndex = ((bitmapHeight - j - 1) * segmentWidth + i) * 4
        
        // Write RGBA values
        data[pixelIndex] = color[0] * 255
        data[pixelIndex + 1] = color[1] * 255
        data[pixelIndex + 2] = color[2] * 255
        data[pixelIndex + 3] = color[3] * 255
      }
    }
  }

  private fillImageDataFast(data: Uint8ClampedArray, segmentPixels: Uint8Array[], segmentWidth: number, bitmapHeight: number): void {
    // Fast rendering - skip every other row for better performance
    const colorMap = this.colorMap
    const step = Math.max(1, Math.floor(bitmapHeight / 256)) // Adaptive step size
    
    for (let i = 0; i < segmentWidth; i++) {
      const column = segmentPixels[i]
      for (let j = 0; j < bitmapHeight; j += step) {
        const colorIndex = column[j]
        const color = colorMap[colorIndex]
        
        // Fill multiple rows with the same data for smoothing
        for (let k = 0; k < step && j + k < bitmapHeight; k++) {
          const pixelIndex = ((bitmapHeight - j - k - 1) * segmentWidth + i) * 4
          data[pixelIndex] = color[0] * 255
          data[pixelIndex + 1] = color[1] * 255
          data[pixelIndex + 2] = color[2] * 255
          data[pixelIndex + 3] = color[3] * 255
        }
      }
    }
  }

  private resample(oldMatrix: Uint8Array[]): Uint8Array[] {
    // Legacy method - kept for compatibility
    return this.resampleChannel(oldMatrix, this.getWidth())
  }
}

export default SpectrogramPlugin
