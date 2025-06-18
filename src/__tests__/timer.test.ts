import Timer from '../timer.js'

describe('Timer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  test('start schedules ticks', () => {
    const timer = new Timer()
    const tick = jest.fn()
    timer.on('tick', tick)
    
    let rafCallback: FrameRequestCallback
    const raf = jest.fn().mockImplementation((cb: FrameRequestCallback) => {
      rafCallback = cb
      return 1
    })
    global.requestAnimationFrame = raf
    
    timer.start()
    expect(raf).toHaveBeenCalledTimes(1)
    expect(tick).toHaveBeenCalledTimes(0)
    
    // Simulate the first frame
    rafCallback!(0)
    expect(tick).toHaveBeenCalledTimes(1)
    expect(raf).toHaveBeenCalledTimes(2)
  })

  test('stop cancels animation frame', () => {
    const timer = new Timer()
    const cancelRaf = jest.fn()
    global.cancelAnimationFrame = cancelRaf
    global.requestAnimationFrame = jest.fn().mockReturnValue(123)
    
    timer.start()
    timer.stop()
    
    expect(cancelRaf).toHaveBeenCalledWith(123)
  })

  test('prevent multiple starts', () => {
    const timer = new Timer()
    const raf = jest.fn().mockReturnValue(1)
    global.requestAnimationFrame = raf
    
    timer.start()
    timer.start() // Should not start again
    
    expect(raf).toHaveBeenCalledTimes(1)
  })

  test('stop when not started does nothing', () => {
    const timer = new Timer()
    const cancelRaf = jest.fn()
    global.cancelAnimationFrame = cancelRaf
    
    timer.stop()
    
    expect(cancelRaf).not.toHaveBeenCalled()
  })
})
