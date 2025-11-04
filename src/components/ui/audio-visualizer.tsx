// src/components/ui/audio-visualizer.tsx
import { useEffect, useRef } from 'react';

type AudioContextCtor = { new (): AudioContext };
function createAudioContext(): AudioContext {
  const w = window as unknown as {
    AudioContext?: AudioContextCtor;
    webkitAudioContext?: AudioContextCtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) throw new Error('Web Audio API not supported');
  return new Ctor();
}

export function AudioVisualizer() {
  // <-- named export
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationRef = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let mounted = true;
    async function setup() {
      try {
        const ctx = createAudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        audioContextRef.current = ctx;
        analyserRef.current = analyser;

        let connected = false;
        try {
          if (navigator?.mediaDevices?.getUserMedia) {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;
            ctx.createMediaStreamSource(stream).connect(analyser);
            connected = true;
          }
        } catch {}

        if (!connected) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.0001;
          osc.type = 'sine';
          osc.frequency.value = 220;
          osc.connect(gain);
          gain.connect(analyser);
          osc.start();
        }

        const BAR_COUNT = 32;
        const container = containerRef.current;
        if (!container) return;
        container.innerHTML = '';
        container.style.display = 'grid';
        container.style.gridTemplateColumns = `repeat(${BAR_COUNT}, 1fr)`;
        container.style.alignItems = 'end';
        container.style.gap = '4px';

        const bars: HTMLDivElement[] = [];
        for (let i = 0; i < BAR_COUNT; i++) {
          const bar = document.createElement('div');
          bar.style.height = '4px';
          bar.style.borderRadius = '6px';
          bar.style.background = 'currentColor';
          bar.style.opacity = '0.8';
          bars.push(bar);
          container.appendChild(bar);
        }

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const loop = () => {
          if (!mounted) return;
          const an = analyserRef.current;
          if (an) {
            an.getByteFrequencyData(dataArray);
            const step = Math.floor(bufferLength / BAR_COUNT);
            for (let i = 0; i < BAR_COUNT; i++) {
              const v = dataArray[i * step] ?? 0;
              const h = Math.max(4, Math.round((v / 255) * 96));
              bars[i].style.height = `${h}px`;
              bars[i].style.opacity = (0.5 + (v / 255) * 0.5).toFixed(2);
            }
          }
          animationRef.current = requestAnimationFrame(loop);
        };

        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {}
        }
        animationRef.current = requestAnimationFrame(loop);
      } catch {
        if (containerRef.current) {
          containerRef.current.textContent = 'Audio visualizer unavailable';
          containerRef.current.style.fontSize = '12px';
          containerRef.current.style.opacity = '0.7';
        }
      }
    }
    setup();

    return () => {
      mounted = false;
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
        mediaStreamRef.current = null;
      }
      const ctx = audioContextRef.current;
      if (ctx) {
        try {
          ctx.close();
        } catch {}
        audioContextRef.current = null;
      }
      analyserRef.current = null;
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="text-foreground h-24 w-full"
      style={{ contain: 'content', padding: '4px 0' }}
    />
  );
}
// (no default export now)
