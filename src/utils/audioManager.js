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

function playNoise(duration, filterType, frequency, filterQ = 1, volume = 0.3) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer

  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = frequency
  filter.Q.value = filterQ

  const gain = ctx.createGain()
  const now = ctx.currentTime
  gain.gain.setValueAtTime(volume, now)
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
    // Sharp high-freq click (the initial impact)
    playNoise(0.025, 'bandpass', 4500, 4)
    // Mid-freq body (ceramic resonance)
    playNoise(0.04, 'bandpass', 2200, 2)
    // Subtle low thud (weight of the chip hitting felt)
    playNoise(0.035, 'bandpass', 800, 1)
  },

  // Chip stacking — pitch builds as stack grows
  chip_stack(stackIndex = 0) {
    const n = Math.min(stackIndex, 7)
    playNoise(0.02, 'bandpass', 3800 + n * 200, 3)
    playNoise(0.035, 'bandpass', 1800 + n * 120, 2, 0.12 + n * 0.02)
    playNoise(0.035, 'bandpass', 700 - n * 40, 1)
    setTimeout(() => {
      if (ctx && !muted) playNoise(0.015, 'bandpass', 5000 + n * 150, 4)
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

  // Shuffle — two overlapping riffles (filtered noise with frequency sweep)
  shuffle() {
    // Each riffle: noise burst with bandpass sweep simulating cards meshing
    for (let r = 0; r < 2; r++) {
      const offset = r * 0.25
      const source = ctx.createBufferSource()
      source.buffer = noiseBuffer

      const filter = ctx.createBiquadFilter()
      filter.type = 'bandpass'
      filter.Q.value = 1.5
      const now = ctx.currentTime + offset
      // Frequency sweeps up then back down — the "frrrrp" of a riffle
      filter.frequency.setValueAtTime(1500, now)
      filter.frequency.linearRampToValueAtTime(6000, now + 0.12)
      filter.frequency.linearRampToValueAtTime(2000, now + 0.25)

      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.18, now + 0.03)
      gain.gain.setValueAtTime(0.18, now + 0.15)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3)

      source.connect(filter)
      filter.connect(gain)
      gain.connect(ctx.destination)

      source.start(now)
      source.stop(now + 0.35)
    }
    // Final soft thud — cards settling on felt
    setTimeout(() => {
      if (ctx && !muted) {
        playNoise(0.04, 'lowpass', 600, 1)
      }
    }, 550)
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

  // All-in — rapid cascade of chips then a resonant clack
  all_in() {
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        if (ctx && !muted) {
          playNoise(0.02, 'bandpass', 3800 + i * 300, 3, 0.15 + i * 0.03)
        }
      }, i * 50)
    }
    setTimeout(() => {
      if (ctx && !muted) {
        playNoise(0.04, 'bandpass', 3000, 2, 0.35)
        playNoise(0.05, 'bandpass', 1200, 1.5, 0.25)
        playNoise(0.06, 'lowpass', 600, 1, 0.2)
      }
    }, 320)
  },

  // Win chip collect — descending rake of chips sliding toward player
  chip_collect() {
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        if (ctx && !muted) {
          playNoise(0.025, 'bandpass', 4200 - i * 250, 3, 0.12 + i * 0.02)
          playNoise(0.03, 'bandpass', 1800 - i * 100, 2, 0.1)
        }
      }, i * 60)
    }
    // Final satisfying thud as stack lands
    setTimeout(() => {
      if (ctx && !muted) playNoise(0.04, 'bandpass', 900, 1, 0.2)
    }, 340)
  },

  // Loss chip sweep — harsh scrape as dealer takes chips
  chip_sweep() {
    const source = ctx.createBufferSource()
    source.buffer = noiseBuffer

    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    const now = ctx.currentTime
    filter.frequency.setValueAtTime(1500, now)
    filter.frequency.exponentialRampToValueAtTime(4500, now + 0.15)
    filter.frequency.exponentialRampToValueAtTime(800, now + 0.3)
    filter.Q.value = 1.5

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.2, now)
    gain.gain.linearRampToValueAtTime(0.25, now + 0.1)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35)

    source.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    source.start(now)
    source.stop(now + 0.4)
  },

  // Coin flip — metallic ping with shimmer
  coin_flip() {
    // High metallic ping
    playTone(2200, 0.15, 'sine', 0.12, 0)
    // Shimmer overtone
    playTone(3300, 0.1, 'sine', 0.06, 0.02)
    // Metallic resonance
    playNoise(0.08, 'bandpass', 6000, 8, 0.08)
  },

  // D.O.N. win — triumphant ascending tones (like win but bigger)
  don_win() {
    playTone(523, 0.12, 'sine', 0.12, 0)      // C5
    playTone(659, 0.12, 'sine', 0.12, 0.1)     // E5
    playTone(784, 0.12, 'sine', 0.12, 0.2)     // G5
    playTone(1047, 0.2, 'triangle', 0.1, 0.3)  // C6 (sustained)
  },

  // D.O.N. lose — ominous descending tones
  don_lose() {
    playTone(330, 0.2, 'sawtooth', 0.06, 0)    // E4
    playTone(262, 0.2, 'sawtooth', 0.06, 0.15) // C4
    playTone(196, 0.3, 'sawtooth', 0.08, 0.3)  // G3 (sustained, deeper)
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

  play(soundName, ...args) {
    if (muted || !initialized || !ctx) return
    if (ctx.state === 'suspended') {
      ctx.resume()
    }
    const fn = sounds[soundName]
    if (fn) {
      try {
        fn(...args)
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
