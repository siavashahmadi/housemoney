// Web Audio API sound engine — synthesizes all casino sounds programmatically
// No .mp3 files needed. Lazy-inits AudioContext on first user gesture (Safari requirement).

let ctx = null
let noiseBuffer = null
let muted = false
let initialized = false

function createNoiseBuffer() {
  const size = ctx.sampleRate * 2
  const buffer = ctx.createBuffer(1, size, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < size; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

function playNoise(duration, filterType, frequency, filterQ = 1) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer

  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = filterQ

  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(0.3, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  source.connect(filter)
  filter.connect(gain)
  gain.connect(ctx.destination)

  source.start(now)
  source.stop(now + duration)
}

function playTone(freq, duration, type = 'sine', volume = 0.15, startTime = 0) {
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.value = freq

  const gain = ctx.createGain()
  const now = ctx.currentTime + startTime
  gain.gain.setValueAtTime(volume, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + duration)
}

const sounds = {
  // Ceramic chip toss — layered click with resonance
  chip_place() {
    const now = ctx.currentTime
    // Sharp high-freq click (the initial impact)
    playNoise(0.025, 'bandpass', 4500, 4)
    // Mid-freq body (ceramic resonance)
    playNoise(0.04, 'bandpass', 2200, 2)
    // Subtle low thud (weight of the chip hitting felt)
    playNoise(0.035, 'bandpass', 800, 1)
  },

  // Chip stacking — slightly muted, like chip landing on chips
  chip_stack() {
    playNoise(0.02, 'bandpass', 3800, 3)
    playNoise(0.035, 'bandpass', 1800, 2)
    // Tiny delayed click for the "settle" sound
    setTimeout(() => {
      if (ctx && !muted) playNoise(0.015, 'bandpass', 5000, 4)
    }, 25)
  },

  // Card sliding — noise with high-pass sweep
  card_deal() {
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'highpass'
    const now = ctx.currentTime
    filter.frequency.setValueAtTime(2000, now)
    filter.frequency.exponentialRampToValueAtTime(8000, now + 0.1)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.2, now)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    source.start(now)
    source.stop(now + 0.15)
  },

  // Card flip — two quick noise bursts
  card_flip() {
    playNoise(0.03, 'bandpass', 4000, 3)
    setTimeout(() => {
      if (ctx && !muted) {
        playNoise(0.03, 'bandpass', 5500, 3)
      }
    }, 30)
  },

  // Win — two ascending sine tones (C5, E5)
  win() {
    playTone(523, 0.15, 'sine', 0.12, 0)
    playTone(659, 0.15, 'sine', 0.12, 0.12)
  },

  // Lose — low thud with detune
  lose() {
    playTone(200, 0.3, 'sine', 0.12, 0)
    playTone(195, 0.3, 'sine', 0.08, 0)
  },

  // Blackjack — ascending arpeggio C5→E5→G5→C6
  blackjack() {
    const notes = [523, 659, 784, 1047]
    notes.forEach((freq, i) => {
      playTone(freq, 0.12, 'triangle', 0.1, i * 0.08)
    })
  },

  // Bust — descending chromatic E4→D4→C#4→C4
  bust() {
    const notes = [330, 294, 277, 262]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = freq

      const filter = ctx.createBiquadFilter()
      filter.type = 'lowpass'
      filter.frequency.value = 800

      const gain = ctx.createGain()
      const start = ctx.currentTime + i * 0.1
      gain.gain.setValueAtTime(0.08, start)
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15)

      osc.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      osc.start(start)
      osc.stop(start + 0.15)
    })
  },
}

const audioManager = {
  init() {
    if (initialized) return
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)()
      if (ctx.state === 'suspended') {
        ctx.resume()
      }
      noiseBuffer = createNoiseBuffer()
      initialized = true
    } catch {
      // Web Audio API not supported — sounds will silently not play
    }
  },

  play(soundName) {
    if (muted || !initialized || !ctx) return
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
    const fn = sounds[soundName]
    if (fn) {
      try {
        fn()
      } catch {
        // Swallow audio errors — sounds are optional
      }
    }
  },

  setMuted(value) {
    muted = value
  },

  isMuted() {
    return muted
  },
}

export default audioManager
