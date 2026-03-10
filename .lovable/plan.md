

## Matrix Countdown: Green Theme, Slower Rain, Bigger Clock, Toggle Button

### Changes (1 file: `src/components/MatrixCountdown.tsx`)

#### 1. Green Matrix colors
Replace all blue `hsl(217 92% 76%)` references in the canvas drawing with classic Matrix green (`hsl(120 100% 50%)`):
- Rain chars: `hsl(120 100% 50% / 0.2)` normal, `hsl(120 100% 50% / 0.7)` bright leaders
- Digit text color and glow: switch from `hsl(var(--matrix))` to inline green `#00ff41` with green glow
- Separator colon: green
- Scanline overlay: green tint instead of blue
- Bottom glow line: green

#### 2. Slower rain animation
- Change the fade overlay alpha from `0.12` to `0.06` (longer trails)
- Add a frame-skip or timestamp-based throttle (~60ms per frame instead of every rAF) to slow the falling speed
- Change reset probability from `0.975` to `0.985` (columns stay longer before resetting)

#### 3. Bigger clock digits
- Increase digit cell size from `w-[1.8em] h-[2.4em]` to `w-[2.4em] h-[3.2em]`
- Increase digit font from `text-xl` to `text-2xl`
- Increase separator font from `text-xl` to `text-2xl`
- Slightly increase label text from `text-[9px]` to `text-[10px]`

#### 4. Animation toggle button
- Add a state `rainEnabled` (default `true`), persisted to `localStorage` key `matrix_rain_enabled`
- Render a small ghost button (Pause/Play icon from lucide) in the top-right corner of the component
- When rain is disabled, skip rendering `<MatrixRain />` canvas
- Button is semi-transparent, becomes visible on hover

