/**
 * WaveEnvelope plugin for creating upper and lower envelope bounds for waveform visualization.
 */

import BasePlugin, { type BasePluginEvents } from '../base-plugin.js'
import { makeDraggable } from '../draggable.js'
import EventEmitter from '../event-emitter.js'
import createElement from '../dom.js'

export type WaveEnvelopePoint = {
  id?: string
  time: number // in seconds
  upperAmplitude: number // -1 to 1
  lowerAmplitude: number // -1 to 1
}

export type WaveEnvelopePluginOptions = {
  points?: WaveEnvelopePoint[]
  upperLineWidth?: number
  lowerLineWidth?: number
  upperLineColor?: string
  lowerLineColor?: string
  fillArea?: boolean
  fillColor?: string
  fillOpacity?: number
  dragPointSize?: number
  dragPointFill?: string
  dragPointStroke?: string
  clipWaveform?: boolean
  autoGenerate?: boolean
  autoGenerateSegments?: number
  autoGenerateSmoothing?: number
  autoGenerateMargin?: number
}

const defaultOptions = {
  points: [] as WaveEnvelopePoint[],
  upperLineWidth: 3,
  lowerLineWidth: 3,
  upperLineColor: 'rgba(255, 0, 0, 0.7)',
  lowerLineColor: 'rgba(0, 255, 0, 0.7)',
  fillArea: true,
  fillColor: 'rgba(128, 128, 128, 0.1)',
  fillOpacity: 0.1,
  dragPointSize: 8,
  dragPointFill: 'rgba(255, 255, 255, 0.9)',
  dragPointStroke: 'rgba(0, 0, 0, 0.5)',
  clipWaveform: true,
  autoGenerate: false,
  autoGenerateSegments: 50,
  autoGenerateSmoothing: 0.1,
  autoGenerateMargin: 0.1,
}

type Options = WaveEnvelopePluginOptions & typeof defaultOptions

export type WaveEnvelopePluginEvents = BasePluginEvents & {
  'points-change': [newPoints: WaveEnvelopePoint[]]
  'envelope-bounds': [time: number, upperBound: number, lowerBound: number]
}

class DualPolyline extends EventEmitter<{
  'point-move': [point: WaveEnvelopePoint, relativeX: number, upperY: number, lowerY: number]
  'point-dragout': [point: WaveEnvelopePoint]
  'point-create': [relativeX: number, upperY: number, lowerY: number]
}> {
  public svg: SVGSVGElement
  private options: Options
  private upperPolyPoints: Map<WaveEnvelopePoint, { polyPoint: SVGPoint; circle: SVGEllipseElement }>
  private lowerPolyPoints: Map<WaveEnvelopePoint, { polyPoint: SVGPoint; circle: SVGEllipseElement }>
  private subscriptions: (() => void)[] = []
  private wrapper: HTMLElement

  constructor(options: Options, wrapper: HTMLElement) {
    super()
    this.options = options
    this.upperPolyPoints = new Map()
    this.lowerPolyPoints = new Map()
    this.wrapper = wrapper

    const width = wrapper.clientWidth
    const height = this.getWaveformChannelHeight()
    
    // Create SVG element
    this.svg = createElement('svg', {
      xmlns: 'http://www.w3.org/2000/svg',
      width: '100%',
      height: `${height}px`,
      viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: 'none',
      style: {
        position: 'absolute',
        left: '0',
        top: '0px',
        zIndex: '6',
        pointerEvents: 'none',
      },
      part: 'wave-envelope',
    }, wrapper) as SVGSVGElement

    this.createPolylines()
    this.setupEventListeners()
  }

  public getWaveformChannelHeight(): number {
    const firstChannel = document.getElementById('wavesurfer-waveform-channel-0')
    if (firstChannel) {
      const heightAttr = firstChannel.getAttribute('data-waveform-height')
      if (heightAttr) return parseInt(heightAttr, 10)
      return firstChannel.offsetHeight
    }
    
    const waveformChannel = this.wrapper.querySelector('.wavesurfer-waveform-channel') as HTMLElement
    if (waveformChannel) {
      const heightAttr = waveformChannel.getAttribute('data-waveform-height')
      if (heightAttr) return parseInt(heightAttr, 10)
      return waveformChannel.offsetHeight
    }
    
    return 128
  }

  private createPolylines() {
    const { svg, options } = this
    const width = this.wrapper.clientWidth
    const height = this.getWaveformChannelHeight()
    const halfHeight = height / 2

    // Fill area between envelopes
    if (options.fillArea) {
      createElement('path', {
        xmlns: 'http://www.w3.org/2000/svg',
        fill: options.fillColor,
        'fill-opacity': options.fillOpacity.toString(),
        stroke: 'none',
        part: 'envelope-fill',
      }, svg)
    }

    // Upper envelope polyline
    createElement('polyline', {
      xmlns: 'http://www.w3.org/2000/svg',
      points: `0,${halfHeight - halfHeight * 0.5} ${width},${halfHeight - halfHeight * 0.5}`,
      stroke: options.upperLineColor,
      'stroke-width': options.upperLineWidth.toString(),
      fill: 'none',
      part: 'upper-polyline',
      style: { pointerEvents: 'stroke' },
    }, svg)

    // Lower envelope polyline  
    createElement('polyline', {
      xmlns: 'http://www.w3.org/2000/svg',
      points: `0,${halfHeight + halfHeight * 0.5} ${width},${halfHeight + halfHeight * 0.5}`,
      stroke: options.lowerLineColor,
      'stroke-width': options.lowerLineWidth.toString(),
      fill: 'none',
      part: 'lower-polyline',
      style: { pointerEvents: 'stroke' },
    }, svg)
  }

  private setupEventListeners() {
    const { svg } = this

    // Double click to add point
    svg.addEventListener('dblclick', (e) => {
      const rect = svg.getBoundingClientRect()
      const relX = (e.clientX - rect.left) / rect.width
      const relY = (e.clientY - rect.top) / rect.height
      const upperY = Math.max(0, relY - 0.1)
      const lowerY = Math.min(1, relY + 0.1)
      this.emit('point-create', relX, upperY, lowerY)
    })
  }

  addPolyPoint(relX: number, upperRelY: number, lowerRelY: number, refPoint: WaveEnvelopePoint) {
    const { svg } = this
    const width = this.wrapper.clientWidth
    const height = this.getWaveformChannelHeight()

    const x = relX * width
    const upperY = upperRelY * height
    const lowerY = lowerRelY * height

    // Create upper point
    const upperPoint = svg.createSVGPoint()
    upperPoint.x = x
    upperPoint.y = upperY

    const upperCircle = this.createCircle(x, upperY, true)
    const upperPolyline = svg.querySelector('[part="upper-polyline"]') as SVGPolylineElement
    const upperPoints = upperPolyline.points
    const upperIndex = this.findInsertIndex(upperPoints, x)
    upperPoints.insertItemBefore(upperPoint, upperIndex)

    // Create lower point
    const lowerPoint = svg.createSVGPoint()
    lowerPoint.x = x
    lowerPoint.y = lowerY

    const lowerCircle = this.createCircle(x, lowerY, false)
    const lowerPolyline = svg.querySelector('[part="lower-polyline"]') as SVGPolylineElement
    const lowerPoints = lowerPolyline.points
    const lowerIndex = this.findInsertIndex(lowerPoints, x)
    lowerPoints.insertItemBefore(lowerPoint, lowerIndex)

    this.upperPolyPoints.set(refPoint, { polyPoint: upperPoint, circle: upperCircle })
    this.lowerPolyPoints.set(refPoint, { polyPoint: lowerPoint, circle: lowerCircle })

    this.makeDraggable(upperCircle, refPoint, true)
    this.makeDraggable(lowerCircle, refPoint, false)
    this.updateFillArea()
  }

  private findInsertIndex(points: SVGPointList, x: number): number {
    const pointsArray = Array.from(points)
    const index = pointsArray.findIndex((point) => point.x >= x)
    return index === -1 ? points.numberOfItems : Math.max(index, 1)
  }

  private createCircle(x: number, y: number, isUpper: boolean): SVGEllipseElement {
    const size = this.options.dragPointSize
    const radius = size / 2
    return createElement('ellipse', {
      xmlns: 'http://www.w3.org/2000/svg',
      cx: x.toString(),
      cy: y.toString(),
      rx: radius.toString(),
      ry: radius.toString(),
      fill: this.options.dragPointFill,
      stroke: this.options.dragPointStroke,
      'stroke-width': '2',
      style: {
        cursor: 'grab',
        pointerEvents: 'all',
        position: 'relative',
        zIndex: '5',
      },
      part: isUpper ? 'upper-envelope-circle' : 'lower-envelope-circle',
    }, this.svg) as SVGEllipseElement
  }

  private makeDraggable(circle: SVGEllipseElement, refPoint: WaveEnvelopePoint, isUpper: boolean) {
    const pointData = isUpper ? this.upperPolyPoints.get(refPoint) : this.lowerPolyPoints.get(refPoint)
    if (!pointData) return

    const { polyPoint } = pointData
    const height = this.getWaveformChannelHeight()
    const width = this.wrapper.clientWidth

    this.subscriptions.push(
      makeDraggable(
        circle as unknown as HTMLElement,
        (dx, dy) => {
          const newX = Math.max(0, Math.min(width, polyPoint.x + dx))
          const newY = Math.max(0, Math.min(height, polyPoint.y + dy))

          polyPoint.x = newX
          polyPoint.y = newY
          circle.setAttribute('cx', newX.toString())
          circle.setAttribute('cy', newY.toString())

          // Update corresponding point X position
          const otherData = isUpper ? 
            this.lowerPolyPoints.get(refPoint) : 
            this.upperPolyPoints.get(refPoint)
          
          if (otherData) {
            otherData.polyPoint.x = newX
            otherData.circle.setAttribute('cx', newX.toString())
          }

          // Update reference point
          const halfHeight = height / 2
          refPoint.time = (newX / width) * (this.getAudioDuration() || 1)
          
          if (isUpper) {
            refPoint.upperAmplitude = (halfHeight - newY) / halfHeight
          } else {
            refPoint.lowerAmplitude = (halfHeight - newY) / halfHeight
          }

          const upperData = this.upperPolyPoints.get(refPoint)
          const lowerData = this.lowerPolyPoints.get(refPoint)
          const upperY = upperData ? upperData.polyPoint.y / height : 0
          const lowerY = lowerData ? lowerData.polyPoint.y / height : 1

          this.emit('point-move', refPoint, newX / width, upperY, lowerY)
          this.updateFillArea()
        },
        () => (circle.style.cursor = 'grabbing'),
        () => (circle.style.cursor = 'grab'),
      )
    )
  }

  private getAudioDuration(): number {
    // This will be set by the parent plugin
    return 1
  }

  private updateFillArea() {
    if (!this.options.fillArea) return
    
    const fillPath = this.svg.querySelector('[part="envelope-fill"]') as SVGPathElement
    if (!fillPath) return
    
    const upperPolyline = this.svg.querySelector('[part="upper-polyline"]') as SVGPolylineElement
    const lowerPolyline = this.svg.querySelector('[part="lower-polyline"]') as SVGPolylineElement
    
    if (!upperPolyline || !lowerPolyline) return
    
    const upperPoints = Array.from(upperPolyline.points)
    const lowerPoints = Array.from(lowerPolyline.points).reverse()
    
    let pathData = `M ${upperPoints[0]?.x || 0} ${upperPoints[0]?.y || 0}`
    
    upperPoints.forEach((point, index) => {
      if (index > 0) pathData += ` L ${point.x} ${point.y}`
    })
    
    lowerPoints.forEach((point) => {
      pathData += ` L ${point.x} ${point.y}`
    })
    
    pathData += ' Z'
    fillPath.setAttribute('d', pathData)
  }

  getEnvelopeBoundsAtTime(time: number, points: WaveEnvelopePoint[]): { upper: number, lower: number } {
    if (points.length === 0) return { upper: 1, lower: -1 }

    const nextPoint = points.find((point) => point.time > time)
    const prevPoint = points.findLast((point) => point.time <= time)

    if (!prevPoint) return { upper: 1, lower: -1 }
    if (!nextPoint) return { upper: prevPoint.upperAmplitude, lower: prevPoint.lowerAmplitude }

    const timeDiff = nextPoint.time - prevPoint.time
    const ratio = (time - prevPoint.time) / timeDiff

    const upperBound = prevPoint.upperAmplitude + (nextPoint.upperAmplitude - prevPoint.upperAmplitude) * ratio
    const lowerBound = prevPoint.lowerAmplitude + (nextPoint.lowerAmplitude - prevPoint.lowerAmplitude) * ratio

    return { upper: upperBound, lower: lowerBound }
  }

  removePolyPoint(point: WaveEnvelopePoint) {
    const upperItem = this.upperPolyPoints.get(point)
    const lowerItem = this.lowerPolyPoints.get(point)
    
    if (upperItem) {
      const upperPolyline = this.svg.querySelector('[part="upper-polyline"]') as SVGPolylineElement
      const points = upperPolyline.points
      const index = this.findPointIndex(points, upperItem.polyPoint)
      if (index >= 0) points.removeItem(index)
      upperItem.circle.remove()
      this.upperPolyPoints.delete(point)
    }
    
    if (lowerItem) {
      const lowerPolyline = this.svg.querySelector('[part="lower-polyline"]') as SVGPolylineElement
      const points = lowerPolyline.points
      const index = this.findPointIndex(points, lowerItem.polyPoint)
      if (index >= 0) points.removeItem(index)
      lowerItem.circle.remove()
      this.lowerPolyPoints.delete(point)
    }
    
    this.updateFillArea()
  }

  private findPointIndex(points: SVGPointList, targetPoint: SVGPoint): number {
    return Array.from(points).findIndex((p) => p.x === targetPoint.x && p.y === targetPoint.y)
  }

  destroy() {
    this.subscriptions.forEach((unsubscribe) => unsubscribe())
    this.upperPolyPoints.clear()
    this.lowerPolyPoints.clear()
    this.svg.remove()
  }
}

const randomId = () => Math.random().toString(36).slice(2)

class WaveEnvelopePlugin extends BasePlugin<WaveEnvelopePluginEvents, WaveEnvelopePluginOptions> {
  protected options: Options
  private dualPolyline: DualPolyline | null = null
  private points: WaveEnvelopePoint[]
  private throttleTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(options: WaveEnvelopePluginOptions) {
    super(options)
    this.points = options.points || []
    this.options = Object.assign({}, defaultOptions, options)
  }

  public static create(options: WaveEnvelopePluginOptions) {
    return new WaveEnvelopePlugin(options)
  }

  public addPoint(point: WaveEnvelopePoint) {
    if (!point.id) point.id = randomId()

    const index = this.points.findLastIndex((p) => p.time < point.time)
    this.points.splice(index + 1, 0, point)
    this.emitPoints()

    const duration = this.wavesurfer?.getDuration()
    if (duration && this.dualPolyline) {
      this.addPolyPoint(point, duration)
    }
  }

  public removePoint(point: WaveEnvelopePoint) {
    const index = this.points.indexOf(point)
    if (index > -1) {
      this.points.splice(index, 1)
      this.dualPolyline?.removePolyPoint(point)
      this.emitPoints()
    }
  }

  public getPoints(): WaveEnvelopePoint[] {
    return this.points
  }

  public setPoints(newPoints: WaveEnvelopePoint[]) {
    this.points.slice().forEach((point) => this.removePoint(point))
    newPoints.forEach((point) => this.addPoint(point))
  }

  public getEnvelopeBoundsAtTime(time: number): { upper: number, lower: number } {
    return this.dualPolyline?.getEnvelopeBoundsAtTime(time, this.points) || { upper: 1, lower: -1 }
  }

  /**
   * Generate envelope points automatically based on the audio data
   */
  public generateEnvelopeFromAudio(replace: boolean = true): WaveEnvelopePoint[] {
    if (!this.wavesurfer) {
      throw new Error('WaveSurfer is not initialized')
    }

    // Get audio data from the renderer
    const audioData = (this.wavesurfer as any).renderer?.audioData
    if (!audioData) {
      throw new Error('No audio data available. Make sure audio is loaded first.')
    }

    const generatedPoints = this.analyzeAudioData(audioData)
    
    if (replace) {
      this.setPoints(generatedPoints)
    }
    
    return generatedPoints
  }

  /**
   * Analyze audio data and generate envelope points
   */
  private analyzeAudioData(audioData: AudioBuffer): WaveEnvelopePoint[] {
    const duration = audioData.duration
    const sampleRate = audioData.sampleRate
    const numberOfChannels = audioData.numberOfChannels
    const segmentCount = this.options.autoGenerateSegments
    const segmentDuration = duration / segmentCount
    const samplesPerSegment = Math.floor(sampleRate * segmentDuration)
    
    const points: WaveEnvelopePoint[] = []
    
    // Analyze each time segment
    for (let i = 0; i < segmentCount; i++) {
      const startTime = i * segmentDuration
      const startSample = Math.floor(i * samplesPerSegment)
      const endSample = Math.min(startSample + samplesPerSegment, audioData.length)
      
      let maxPositive = 0
      let maxNegative = 0
      
      // Analyze all channels and find peak amplitudes
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioData.getChannelData(channel)
        
        for (let sample = startSample; sample < endSample; sample++) {
          const value = channelData[sample]
          if (value > maxPositive) maxPositive = value
          if (value < maxNegative) maxNegative = value
        }
      }
      
      // Add margin to the envelope bounds
      const margin = this.options.autoGenerateMargin
      const upperAmplitude = Math.min(1, maxPositive + margin)
      const lowerAmplitude = Math.max(-1, maxNegative - margin)
      
      points.push({
        time: startTime,
        upperAmplitude,
        lowerAmplitude,
      })
    }
    
    // Add final point at the end
    points.push({
      time: duration,
      upperAmplitude: points[points.length - 1]?.upperAmplitude || 0.5,
      lowerAmplitude: points[points.length - 1]?.lowerAmplitude || -0.5,
    })
    
    // Apply smoothing if requested
    if (this.options.autoGenerateSmoothing > 0) {
      return this.smoothEnvelopePoints(points)
    }
    
    return points
  }

  /**
   * Apply smoothing to envelope points using a simple moving average
   */
  private smoothEnvelopePoints(points: WaveEnvelopePoint[]): WaveEnvelopePoint[] {
    const smoothingFactor = this.options.autoGenerateSmoothing
    const smoothedPoints: WaveEnvelopePoint[] = []
    
    for (let i = 0; i < points.length; i++) {
      const point = points[i]
      
      if (i === 0 || i === points.length - 1) {
        // Keep first and last points unchanged
        smoothedPoints.push({ ...point })
        continue
      }
      
      // Calculate weighted average with neighboring points
      const prevPoint = points[i - 1]
      const nextPoint = points[i + 1]
      
      const upperAmplitude = 
        point.upperAmplitude * (1 - smoothingFactor) +
        (prevPoint.upperAmplitude + nextPoint.upperAmplitude) * smoothingFactor / 2
      
      const lowerAmplitude = 
        point.lowerAmplitude * (1 - smoothingFactor) +
        (prevPoint.lowerAmplitude + nextPoint.lowerAmplitude) * smoothingFactor / 2
      
      smoothedPoints.push({
        ...point,
        upperAmplitude: Math.max(-1, Math.min(1, upperAmplitude)),
        lowerAmplitude: Math.max(-1, Math.min(1, lowerAmplitude)),
      })
    }
    
    return smoothedPoints
  }

  /**
   * Generate envelope using RMS (Root Mean Square) analysis for smoother results
   */
  public generateRMSEnvelope(windowSize: number = 0.1, replace: boolean = true): WaveEnvelopePoint[] {
    if (!this.wavesurfer) {
      throw new Error('WaveSurfer is not initialized')
    }

    const audioData = (this.wavesurfer as any).renderer?.audioData
    if (!audioData) {
      throw new Error('No audio data available')
    }

    const duration = audioData.duration
    const sampleRate = audioData.sampleRate
    const numberOfChannels = audioData.numberOfChannels
    const windowSamples = Math.floor(sampleRate * windowSize)
    const hopSize = Math.floor(windowSamples / 2) // 50% overlap
    const points: WaveEnvelopePoint[] = []
    
    for (let startSample = 0; startSample < audioData.length - windowSamples; startSample += hopSize) {
      const endSample = Math.min(startSample + windowSamples, audioData.length)
      const time = startSample / sampleRate
      
      let rmsSum = 0
      let peakPositive = 0
      let peakNegative = 0
      let sampleCount = 0
      
      // Calculate RMS and peak values for this window
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const channelData = audioData.getChannelData(channel)
        
        for (let sample = startSample; sample < endSample; sample++) {
          const value = channelData[sample]
          rmsSum += value * value
          sampleCount++
          
          if (value > peakPositive) peakPositive = value
          if (value < peakNegative) peakNegative = value
        }
      }
      
      const rms = Math.sqrt(rmsSum / sampleCount)
      const margin = this.options.autoGenerateMargin
      
      // Use RMS for a smoother envelope, but ensure it doesn't exceed peaks
      const upperAmplitude = Math.min(1, Math.min(peakPositive + margin, rms * 2))
      const lowerAmplitude = Math.max(-1, Math.max(peakNegative - margin, -rms * 2))
      
      points.push({
        time,
        upperAmplitude,
        lowerAmplitude,
      })
    }
    
    // Ensure we have a point at the end
    if (points.length > 0 && points[points.length - 1].time < duration) {
      const lastPoint = points[points.length - 1]
      points.push({
        time: duration,
        upperAmplitude: lastPoint.upperAmplitude,
        lowerAmplitude: lastPoint.lowerAmplitude,
      })
    }
    
    if (replace) {
      this.setPoints(points)
    }
    
    return points
  }

  public destroy() {
    this.dualPolyline?.destroy()
    super.destroy()
  }

  onInit() {
    if (!this.wavesurfer) {
      throw Error('WaveSurfer is not initialized')
    }

    this.subscriptions.push(
      this.wavesurfer.on('decode', (duration) => {
        this.initDualPolyline()
        
        // Auto-generate envelope from audio if enabled and no points exist
        if (this.options.autoGenerate && this.points.length === 0) {
          try {
            this.generateEnvelopeFromAudio(true)
          } catch (error) {
            console.warn('Failed to auto-generate envelope:', error)
          }
        } else {
          this.points.forEach((point) => this.addPolyPoint(point, duration))
        }
      }),

      this.wavesurfer.on('redraw', () => {
        this.initDualPolyline()
        this.points.forEach((point) => {
          const duration = this.wavesurfer?.getDuration()
          if (duration) this.addPolyPoint(point, duration)
        })
      }),

      this.wavesurfer.on('timeupdate', (time) => {
        const bounds = this.getEnvelopeBoundsAtTime(time)
        this.emit('envelope-bounds', time, bounds.upper, bounds.lower)
      }),
    )
  }

  private emitPoints() {
    if (this.throttleTimeout) {
      clearTimeout(this.throttleTimeout)
    }
    this.throttleTimeout = setTimeout(() => {
      this.emit('points-change', this.points)
    }, 200)
  }

  private initDualPolyline() {
    if (this.dualPolyline) this.dualPolyline.destroy()
    if (!this.wavesurfer) return

    const wrapper = this.wavesurfer.getWrapper()
    this.dualPolyline = new DualPolyline(this.options, wrapper)

    this.subscriptions.push(
      this.dualPolyline.on('point-move', (point, relativeX, upperY, lowerY) => {
        const duration = this.wavesurfer?.getDuration() || 0
        point.time = relativeX * duration
        
        const height = this.dualPolyline?.getWaveformChannelHeight() || 128
        const halfHeight = height / 2
        
        point.upperAmplitude = (halfHeight - (upperY * height)) / halfHeight
        point.lowerAmplitude = (halfHeight - (lowerY * height)) / halfHeight

        this.emitPoints()
      }),

      this.dualPolyline.on('point-dragout', (point) => {
        this.removePoint(point)
      }),

      this.dualPolyline.on('point-create', (relativeX, upperY, lowerY) => {
        const duration = this.wavesurfer?.getDuration() || 0
        const audioTime = relativeX * duration
        
        const height = this.dualPolyline?.getWaveformChannelHeight() || 128
        const halfHeight = height / 2
        
        this.addPoint({
          time: audioTime,
          upperAmplitude: (halfHeight - (upperY * height)) / halfHeight,
          lowerAmplitude: (halfHeight - (lowerY * height)) / halfHeight,
        })
      }),
    )
  }

  private addPolyPoint(point: WaveEnvelopePoint, duration: number) {
    if (!this.dualPolyline) return
    
    const relativeX = point.time / duration
    const height = this.dualPolyline.getWaveformChannelHeight()
    const halfHeight = height / 2
    
    const upperRelY = (halfHeight - (point.upperAmplitude * halfHeight)) / height
    const lowerRelY = (halfHeight - (point.lowerAmplitude * halfHeight)) / height
    
    this.dualPolyline.addPolyPoint(relativeX, upperRelY, lowerRelY, point)
  }
}

export default WaveEnvelopePlugin 