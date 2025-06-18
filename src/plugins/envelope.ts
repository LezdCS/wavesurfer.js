/**
 * Envelope is a visual UI for controlling the audio volume and add fade-in and fade-out effects.
 */

import BasePlugin, { type BasePluginEvents } from '../base-plugin.js'
import { makeDraggable } from '../draggable.js'
import EventEmitter from '../event-emitter.js'
import createElement from '../dom.js'

export type EnvelopePoint = {
  id?: string
  time: number // in seconds
  volume: number // 0 to 1
}

export type EnvelopePluginOptions = {
  points?: EnvelopePoint[]
  volume?: number
  lineWidth?: string
  lineColor?: string
  dragLine?: boolean
  dragPointSize?: number
  dragPointFill?: string
  dragPointStroke?: string
}

const defaultOptions = {
  points: [] as EnvelopePoint[],
  lineWidth: 4,
  lineColor: 'rgba(0, 0, 255, 0.5)',
  dragPointSize: 10,
  dragPointFill: 'rgba(255, 255, 255, 0.8)',
  dragPointStroke: 'rgba(255, 255, 255, 0.8)',
}

type Options = EnvelopePluginOptions & typeof defaultOptions

export type EnvelopePluginEvents = BasePluginEvents & {
  'points-change': [newPoints: EnvelopePoint[]]
  'volume-change': [volume: number]
}

class Polyline extends EventEmitter<{
  'point-move': [point: EnvelopePoint, relativeX: number, relativeY: number]
  'point-dragout': [point: EnvelopePoint]
  'point-create': [relativeX: number, relativeY: number]
  'line-move': [relativeY: number]
}> {
  private svg: SVGSVGElement
  private options: Options
  private polyPoints: Map<
    EnvelopePoint,
    {
      polyPoint: SVGPoint
      circle: SVGEllipseElement
    }
  >
  private subscriptions: (() => void)[] = []
  private wrapper: HTMLElement
  private updateThrottleTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(options: Options, wrapper: HTMLElement) {
    super()

    this.subscriptions = []
    this.options = options
    this.polyPoints = new Map()
    this.wrapper = wrapper

    const width = wrapper.clientWidth
    const height = this.getAvailableHeight(wrapper)

    // Calculate offset from top to position envelope below spectrogram
    const spectrogramOffset = this.getSpectrogramOffset(wrapper)
    
    // SVG element
    const svg = createElement(
      'svg',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        width: '100%',
        height: `${height}px`,
        viewBox: `0 0 ${width} ${height}`,
        preserveAspectRatio: 'none',
        style: {
          position: 'absolute',
          left: '0',
          top: `${spectrogramOffset}px`,
          zIndex: '3',
        },
        part: 'envelope',
      },
      wrapper,
    ) as SVGSVGElement

    this.svg = svg

    // A polyline representing the envelope
    const polyline = createElement(
      'polyline',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        points: `0,${height} ${width},${height}`,
        stroke: options.lineColor,
        'stroke-width': options.lineWidth,
        fill: 'none',
        part: 'polyline',
        style: options.dragLine
          ? {
              cursor: 'row-resize',
              pointerEvents: 'stroke',
            }
          : {},
      },
      svg,
    ) as SVGPolylineElement

    // Make the polyline draggable along the Y axis
    if (options.dragLine) {
      this.subscriptions.push(
        makeDraggable(polyline as unknown as HTMLElement, (_, dy) => {
          const { height } = svg.viewBox.baseVal
          const { points } = polyline
          for (let i = 1; i < points.numberOfItems - 1; i++) {
            const point = points.getItem(i)
            point.y = Math.min(height, Math.max(0, point.y + dy))
          }
          const circles = svg.querySelectorAll('ellipse')
          Array.from(circles).forEach((circle) => {
            const newY = Math.min(height, Math.max(0, Number(circle.getAttribute('cy')) + dy))
            circle.setAttribute('cy', newY.toString())
          })

          this.emit('line-move', dy / height)
        }),
      )
    }

    // Listen to double click to add a new point
    svg.addEventListener('dblclick', (e) => {
      const rect = svg.getBoundingClientRect()
      const x = e.clientX - rect.left
      const y = e.clientY - rect.top
      this.emit('point-create', x / rect.width, y / rect.height)
    })

    // Long press on touch devices
    {
      let pressTimer: number

      const clearTimer = () => clearTimeout(pressTimer)

      svg.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
          pressTimer = window.setTimeout(() => {
            e.preventDefault()
            const rect = svg.getBoundingClientRect()
            const x = e.touches[0].clientX - rect.left
            const y = e.touches[0].clientY - rect.top
            this.emit('point-create', x / rect.width, y / rect.height)
          }, 500)
        } else {
          clearTimer()
        }
      })

      svg.addEventListener('touchmove', clearTimer)

      svg.addEventListener('touchend', clearTimer)
    }
  }

  // New method to get available height excluding spectrogram area
  private getAvailableHeight(wrapper: HTMLElement): number {
    const fullHeight = wrapper.clientHeight
    
    // Look for spectrogram wrapper (div with canvas child that has high z-index)
    const spectrogramWrappers = wrapper.querySelectorAll('div')
    let spectrogramHeight = 0
    
    spectrogramWrappers.forEach((div) => {
      const canvas = div.querySelector('canvas')
      if (canvas && canvas.style.zIndex === '4' && canvas.style.position === 'absolute') {
        const divRect = div.getBoundingClientRect()
        spectrogramHeight += divRect.height
      }
    })
    
    // Also check for spec-labels specifically
    const specLabels = wrapper.querySelectorAll('[part="spec-labels"]')
    if (specLabels.length > 0 && spectrogramHeight === 0) {
      // If we found spec labels but no canvas wrapper, estimate height
      spectrogramHeight = 200 // Default spectrogram height
    }
    
    // Return remaining height for envelope, ensuring minimum height
    return Math.max(fullHeight - spectrogramHeight, 50)
  }

  // New method to get vertical offset to position envelope below spectrogram
  private getSpectrogramOffset(wrapper: HTMLElement): number {
    // Look for spectrogram wrapper (div with canvas child that has high z-index)
    const spectrogramWrappers = wrapper.querySelectorAll('div')
    let maxBottom = 0
    
    spectrogramWrappers.forEach((div) => {
      const canvas = div.querySelector('canvas')
      if (canvas && canvas.style.zIndex === '4' && canvas.style.position === 'absolute') {
        const divRect = div.getBoundingClientRect()
        const wrapperRect = wrapper.getBoundingClientRect()
        const relativeBottom = divRect.bottom - wrapperRect.top
        maxBottom = Math.max(maxBottom, relativeBottom)
      }
    })
    
    // Also check for spec-labels specifically
    const specLabels = wrapper.querySelectorAll('[part="spec-labels"]')
    if (specLabels.length > 0 && maxBottom === 0) {
      // If we found spec labels but no canvas wrapper, estimate offset
      maxBottom = 200 // Default spectrogram height
    }
    
    return maxBottom
  }

  // New method to get current viewport info for zoom compatibility
  private getViewportInfo(wavesurfer: any) {
    if (!wavesurfer) return null
    
    const duration = wavesurfer.getDuration() || 0
    const scrollTime = wavesurfer.getScroll() / (wavesurfer.options.minPxPerSec || 1)
    const viewportWidth = this.wrapper.clientWidth
    const viewportDuration = viewportWidth / (wavesurfer.options.minPxPerSec || 1)
    
    return {
      startTime: scrollTime,
      endTime: Math.min(duration, scrollTime + viewportDuration),
      duration: viewportDuration,
      totalDuration: duration,
      minPxPerSec: wavesurfer.options.minPxPerSec || 1
    }
  }

  // New method to update SVG viewBox based on zoom and scroll
  updateViewBox(wavesurfer: any) {
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout)
    }
    
    this.updateThrottleTimeout = setTimeout(() => {
      const viewport = this.getViewportInfo(wavesurfer)
      if (!viewport) return

      const { svg } = this
      const currentWidth = this.wrapper.clientWidth
      const currentHeight = this.getAvailableHeight(this.wrapper)
      const spectrogramOffset = this.getSpectrogramOffset(this.wrapper)
      
      // Update viewBox to current dimensions
      svg.setAttribute('viewBox', `0 0 ${currentWidth} ${currentHeight}`)
      // Update SVG position to stay below spectrogram
      svg.style.top = `${spectrogramOffset}px`
      svg.style.height = `${currentHeight}px`
      
      // Update polyline base points (start and end)
      const polyline = svg.querySelector('polyline') as SVGPolylineElement
      if (polyline) {
        const points = polyline.points
        if (points.numberOfItems >= 2) {
          // Update first point (start)
          const firstPoint = points.getItem(0)
          firstPoint.x = 0
          firstPoint.y = currentHeight
          
          // Update last point (end) only if there are no user points in between
          const lastPoint = points.getItem(points.numberOfItems - 1)
          lastPoint.x = currentWidth
          lastPoint.y = currentHeight
        }
      }
      
      this.updatePointsForViewport(wavesurfer)
    }, 16) // ~60fps throttling
  }

  // New method to update point positions based on current viewport
  private updatePointsForViewport(wavesurfer: any) {
    const viewport = this.getViewportInfo(wavesurfer)
    if (!viewport) return

    const { svg } = this
    const currentWidth = this.wrapper.clientWidth
    const currentHeight = this.getAvailableHeight(this.wrapper)
    
    this.polyPoints.forEach(({ polyPoint, circle }, envelopePoint) => {
      // Convert audio time to viewport relative position
      const relativeTime = (envelopePoint.time - viewport.startTime) / viewport.duration
      
      // Only update if point is within viewport
      if (relativeTime >= 0 && relativeTime <= 1) {
        const x = relativeTime * currentWidth
        const y = currentHeight - (envelopePoint.volume * currentHeight)
        
        polyPoint.x = x
        polyPoint.y = y
        circle.setAttribute('cx', x.toString())
        circle.setAttribute('cy', y.toString())
        
        // Show the circle
        circle.style.display = 'block'
      } else {
        // Hide points outside viewport
        circle.style.display = 'none'
      }
    })
  }

  private makeDraggable(draggable: SVGElement, onDrag: (x: number, y: number) => void) {
    this.subscriptions.push(
      makeDraggable(
        draggable as unknown as HTMLElement,
        onDrag,
        () => (draggable.style.cursor = 'grabbing'),
        () => (draggable.style.cursor = 'grab'),
        1,
      ),
    )
  }

  private createCircle(x: number, y: number) {
    const size = this.options.dragPointSize
    const radius = size / 2
    return createElement(
      'ellipse',
      {
        xmlns: 'http://www.w3.org/2000/svg',
        cx: x,
        cy: y,
        rx: radius,
        ry: radius,
        fill: this.options.dragPointFill,
        stroke: this.options.dragPointStroke,
        'stroke-width': '2',
        style: {
          cursor: 'grab',
          pointerEvents: 'all',
          position: 'relative',
          zIndex: '5',
        },
        part: 'envelope-circle',
      },
      this.svg,
    ) as SVGEllipseElement
  }

  removePolyPoint(point: EnvelopePoint) {
    const item = this.polyPoints.get(point)
    if (!item) return
    const { polyPoint, circle } = item
    const { points } = this.svg.querySelector('polyline') as SVGPolylineElement
    const index = Array.from(points).findIndex((p) => p.x === polyPoint.x && p.y === polyPoint.y)
    if (index >= 0) {
      points.removeItem(index)
    }
    circle.remove()
    this.polyPoints.delete(point)
  }

  addPolyPoint(relX: number, relY: number, refPoint: EnvelopePoint, wavesurfer?: any) {
    const { svg } = this
    const currentWidth = this.wrapper.clientWidth
    const currentHeight = this.getAvailableHeight(this.wrapper)
    const threshold = this.options.dragPointSize / 2

    // For zoom compatibility, we need to consider the current viewport
    let x: number, y: number
    
    if (wavesurfer) {
      const viewport = this.getViewportInfo(wavesurfer)
      if (viewport) {
        // Convert from audio time to current viewport position
        const relativeTime = (refPoint.time - viewport.startTime) / viewport.duration
        x = relativeTime * currentWidth
        y = currentHeight - (refPoint.volume * currentHeight)
      } else {
        // Fallback to original calculation
        x = relX * currentWidth
        y = currentHeight - relY * currentHeight
      }
    } else {
      // Original calculation for backward compatibility
      x = relX * currentWidth
      y = currentHeight - relY * currentHeight
    }

    const newPoint = svg.createSVGPoint()
    newPoint.x = x
    newPoint.y = y

    const circle = this.createCircle(x, y)
    const { points } = svg.querySelector('polyline') as SVGPolylineElement
    const newIndex = Array.from(points).findIndex((point) => point.x >= x)
    points.insertItemBefore(newPoint, Math.max(newIndex, 1))

    this.polyPoints.set(refPoint, { polyPoint: newPoint, circle })

    this.makeDraggable(circle, (dx, dy) => {
      const newX = newPoint.x + dx
      const newY = newPoint.y + dy

      // Remove the point if it's dragged out of the SVG
      if (newX < -threshold || newY < -threshold || newX > currentWidth + threshold || newY > currentHeight + threshold) {
        this.emit('point-dragout', refPoint)
        return
      }

      // Don't allow to drag past the next or previous point
      const next = Array.from(points).find((point) => point.x > newPoint.x)
      const prev = Array.from(points).findLast((point) => point.x < newPoint.x)
      if ((next && newX >= next.x) || (prev && newX <= prev.x)) {
        return
      }

      // Update the point and the circle position
      newPoint.x = newX
      newPoint.y = newY
      circle.setAttribute('cx', newX.toString())
      circle.setAttribute('cy', newY.toString())

      // Emit the event passing the point and new relative coordinates
      // For zoom compatibility, convert back to audio time coordinates
      if (wavesurfer) {
        const viewport = this.getViewportInfo(wavesurfer)
        if (viewport) {
          const relativeViewportX = newX / currentWidth
          const audioTime = viewport.startTime + (relativeViewportX * viewport.duration)
          const volume = 1 - (newY / currentHeight)
          
          // Update the reference point with audio coordinates
          refPoint.time = audioTime
          refPoint.volume = volume
          
          this.emit('point-move', refPoint, audioTime / viewport.totalDuration, newY / currentHeight)
          return
        }
      }
      
      // Fallback to original behavior
      this.emit('point-move', refPoint, newX / currentWidth, newY / currentHeight)
    })
  }

  update() {
    const { svg } = this
    const aspectRatioX = svg.viewBox.baseVal.width / svg.clientWidth
    const aspectRatioY = svg.viewBox.baseVal.height / svg.clientHeight
    const circles = svg.querySelectorAll('ellipse')

    circles.forEach((circle) => {
      const radius = this.options.dragPointSize / 2
      const rx = radius * aspectRatioX
      const ry = radius * aspectRatioY
      circle.setAttribute('rx', rx.toString())
      circle.setAttribute('ry', ry.toString())
    })
  }

  destroy() {
    if (this.updateThrottleTimeout) {
      clearTimeout(this.updateThrottleTimeout)
    }
    this.subscriptions.forEach((unsubscribe) => unsubscribe())
    this.polyPoints.clear()
    this.svg.remove()
  }
}

const randomId = () => Math.random().toString(36).slice(2)

class EnvelopePlugin extends BasePlugin<EnvelopePluginEvents, EnvelopePluginOptions> {
  protected options: Options
  private polyline: Polyline | null = null
  private points: EnvelopePoint[]
  private throttleTimeout: ReturnType<typeof setTimeout> | null = null
  private volume = 1

  /**
   * Create a new Envelope plugin.
   */
  constructor(options: EnvelopePluginOptions) {
    super(options)

    this.points = options.points || []

    this.options = Object.assign({}, defaultOptions, options)
    this.options.lineColor = this.options.lineColor || defaultOptions.lineColor
    this.options.dragPointFill = this.options.dragPointFill || defaultOptions.dragPointFill
    this.options.dragPointStroke = this.options.dragPointStroke || defaultOptions.dragPointStroke
    this.options.dragPointSize = this.options.dragPointSize || defaultOptions.dragPointSize
  }

  public static create(options: EnvelopePluginOptions) {
    return new EnvelopePlugin(options)
  }

  /**
   * Add an envelope point with a given time and volume.
   */
  public addPoint(point: EnvelopePoint) {
    if (!point.id) point.id = randomId()

    // Insert the point in the correct position to keep the array sorted
    const index = this.points.findLastIndex((p) => p.time < point.time)
    this.points.splice(index + 1, 0, point)

    this.emitPoints()

    // Add the point to the polyline if the duration is available
    const duration = this.wavesurfer?.getDuration()
    if (duration) {
      this.addPolyPoint(point, duration)
    }
  }

  /**
   * Remove an envelope point.
   */
  public removePoint(point: EnvelopePoint) {
    const index = this.points.indexOf(point)
    if (index > -1) {
      this.points.splice(index, 1)
      this.polyline?.removePolyPoint(point)
      this.emitPoints()
    }
  }

  /**
   * Get all envelope points. Should not be modified directly.
   */
  public getPoints(): EnvelopePoint[] {
    return this.points
  }

  /**
   * Set new envelope points.
   */
  public setPoints(newPoints: EnvelopePoint[]) {
    this.points.slice().forEach((point) => this.removePoint(point))
    newPoints.forEach((point) => this.addPoint(point))
  }

  /**
   * Destroy the plugin instance.
   */
  public destroy() {
    this.polyline?.destroy()
    super.destroy()
  }

  /**
   * Get the envelope volume.
   */
  public getCurrentVolume(): number {
    return this.volume
  }

  /**
   * Set the envelope volume. 0..1 (more than 1 will boost the volume).
   */
  public setVolume(floatValue: number) {
    this.volume = floatValue
    this.wavesurfer?.setVolume(floatValue)
  }

  /** Called by wavesurfer, don't call manually */
  onInit() {
    if (!this.wavesurfer) {
      throw Error('WaveSurfer is not initialized')
    }

    const { options } = this
    options.volume = options.volume ?? this.wavesurfer.getVolume()

    this.setVolume(options.volume)

    this.subscriptions.push(
      this.wavesurfer.on('decode', (duration) => {
        this.initPolyline()

        this.points.forEach((point) => {
          this.addPolyPoint(point, duration)
        })
      }),

      this.wavesurfer.on('redraw', () => {
        this.polyline?.update()
      }),

      this.wavesurfer.on('timeupdate', (time) => {
        this.onTimeUpdate(time)
      }),

      // Add zoom event handler for zoom compatibility
      this.wavesurfer.on('zoom', (minPxPerSec) => {
        this.onZoomChange(minPxPerSec)
      }),

      // Add scroll event handler for zoom compatibility
      this.wavesurfer.on('scroll', (visibleStartTime, visibleEndTime) => {
        this.onScrollChange(visibleStartTime, visibleEndTime)
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

  private initPolyline() {
    if (this.polyline) this.polyline.destroy()
    if (!this.wavesurfer) return

    const wrapper = this.wavesurfer.getWrapper()

    this.polyline = new Polyline(this.options, wrapper)

    this.subscriptions.push(
      this.polyline.on('point-move', (point, relativeX, relativeY) => {
        const duration = this.wavesurfer?.getDuration() || 0
        point.time = relativeX * duration
        point.volume = 1 - relativeY

        this.emitPoints()
      }),

      this.polyline.on('point-dragout', (point) => {
        this.removePoint(point)
      }),

      this.polyline.on('point-create', (relativeX, relativeY) => {
        // For zoom compatibility, convert viewport coordinates to audio time
        const duration = this.wavesurfer?.getDuration() || 0
        let audioTime: number
        
        if (this.wavesurfer) {
          const viewport = this.getViewportInfo()
          if (viewport) {
            audioTime = viewport.startTime + (relativeX * viewport.duration)
          } else {
            audioTime = relativeX * duration
          }
        } else {
          audioTime = relativeX * duration
        }
        
        this.addPoint({
          time: audioTime,
          volume: 1 - relativeY,
        })
      }),

      this.polyline.on('line-move', (relativeY) => {
        this.points.forEach((point) => {
          point.volume = Math.min(1, Math.max(0, point.volume - relativeY))
        })

        this.emitPoints()

        this.onTimeUpdate(this.wavesurfer?.getCurrentTime() || 0)
      }),
    )
  }

  private addPolyPoint(point: EnvelopePoint, duration: number) {
    this.polyline?.addPolyPoint(point.time / duration, point.volume, point, this.wavesurfer)
  }

  private onZoomChange(minPxPerSec: number) {
    // Update the polyline to handle zoom changes
    this.polyline?.updateViewBox(this.wavesurfer)
  }

  private onScrollChange(visibleStartTime: number, visibleEndTime: number) {
    // Update the polyline to handle scroll changes
    this.polyline?.updateViewBox(this.wavesurfer)
  }

  // Helper method to get current viewport info for zoom compatibility
  private getViewportInfo() {
    if (!this.wavesurfer) return null
    
    const duration = this.wavesurfer.getDuration() || 0
    const scrollTime = this.wavesurfer.getScroll() / (this.wavesurfer.options.minPxPerSec || 1)
    const wrapper = this.wavesurfer.getWrapper()
    const viewportWidth = wrapper.clientWidth
    const viewportDuration = viewportWidth / (this.wavesurfer.options.minPxPerSec || 1)
    
    return {
      startTime: scrollTime,
      endTime: Math.min(duration, scrollTime + viewportDuration),
      duration: viewportDuration,
      totalDuration: duration,
      minPxPerSec: this.wavesurfer.options.minPxPerSec || 1
    }
  }

  private onTimeUpdate(time: number) {
    if (!this.wavesurfer) return
    let nextPoint = this.points.find((point) => point.time > time)
    if (!nextPoint) {
      nextPoint = { time: this.wavesurfer.getDuration() || 0, volume: 0 }
    }
    let prevPoint = this.points.findLast((point) => point.time <= time)
    if (!prevPoint) {
      prevPoint = { time: 0, volume: 0 }
    }
    const timeDiff = nextPoint.time - prevPoint.time
    const volumeDiff = nextPoint.volume - prevPoint.volume
    const newVolume = prevPoint.volume + (time - prevPoint.time) * (volumeDiff / timeDiff)
    const clampedVolume = Math.min(1, Math.max(0, newVolume))
    const roundedVolume = Math.round(clampedVolume * 100) / 100

    if (roundedVolume !== this.getCurrentVolume()) {
      this.setVolume(roundedVolume)
      this.emit('volume-change', roundedVolume)
    }
  }
}

export default EnvelopePlugin
