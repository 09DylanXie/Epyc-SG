'use client';

import { useEffect, useRef, useState } from 'react';
import { player } from '@/engine/audio/player';
import { STYLES } from '@/engine/styles';
import { BANDS, fx, onFrame } from './loop';
import { useStudio } from './store';

const VERT = `#version 300 es
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * An eclipse in a nebula. The corona's reach at every angle is the live spectrum (bass at the
 * crown, air at the base, mirrored), the disc breathes with the kick, heavy hits throw shockwaves
 * that refract the sky behind them, and the black disc bends the starfield like a lens.
 */
const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uRes;
uniform vec2 uCenter;
uniform float uRadius, uTime, uKick, uBeat, uTouch, uLevel, uBass, uHigh, uEnergy, uWake;
uniform float uShock[4];
uniform vec3 uA, uB, uD;
uniform sampler2D uSpec;
#define PI 3.14159265

float hash21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a * vnoise(p); p = ROT * p + 11.3; a *= 0.5; } return s; }
float fbm3(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = ROT * p + 5.7; a *= 0.5; } return s; }

float starLayer(vec2 uv, float density, float t){
  vec2 g = floor(uv), f = fract(uv) - 0.5;
  float h = hash21(g);
  if (h > density) return 0.0;
  vec2 o = vec2(hash21(g + 3.1), hash21(g + 7.7)) - 0.5;
  float d = length(f - o * 0.8);
  float size = 0.035 + 0.035 * fract(h * 91.7);
  float tw = 0.62 + 0.38 * sin(t * (1.5 + 5.0 * fract(h * 37.0)) + h * 80.0);
  return smoothstep(size, 0.0, d) * tw * (0.5 + 1.5 * fract(h * 53.0));
}

void main(){
  float S = min(uRes.x, uRes.y);
  float t = uTime;
  vec2 p = (gl_FragCoord.xy - uCenter) / S;
  float r = length(p) + 1e-5;
  vec2 dir = p / r;
  float R = uRadius / S * (1.0 + 0.055 * uKick + 0.02 * uBeat + 0.012 * sin(t * 0.7));
  float dr = r - R;

  // shockwaves: each heavy hit leaves the rim and refracts the sky as it passes
  float rings = 0.0;
  vec2 q = p;
  for (int i = 0; i < 4; i++){
    float a = uShock[i];
    if (a < 4.0){
      float rr = R * 1.02 + a * 0.42 + a * a * 0.06;
      float w = 0.006 + a * 0.035;
      float d = (r - rr) / w;
      float g = exp(-d * d) * exp(-a * 1.7);
      rings += g;
      q -= dir * g * d * w * 0.9;
    }
  }
  // gravitational lens
  q *= 1.0 - 0.42 * R * R / (r * r + R * R * 0.35);

  // nebula
  vec2 uv = q * 1.35 + vec2(t * 0.004, -t * 0.003) + 3.0;
  vec2 wv = vec2(fbm3(uv * 1.4 + t * 0.012), fbm3(uv * 1.4 + 5.2 - t * 0.010));
  float n = fbm(uv * 1.15 + wv * 1.5);
  float m = fbm(uv * 2.6 - wv * 1.1 + 9.4);
  float cloud = smoothstep(0.34, 0.82, n);
  float fil = smoothstep(0.48, 0.9, m) * cloud;
  float amp = 0.5 + 0.8 * uLevel + 0.4 * uEnergy;
  vec3 col = uD * (0.10 + 0.6 * n);
  col += uB * cloud * cloud * 0.34 * amp;
  col += uA * fil * fil * (0.38 + 0.9 * uBass) * amp;
  col += mix(uB, uA, 0.5) * pow(cloud, 4.0) * m * 0.25 * amp;

  // stars
  vec2 sp = q * 900.0;
  float st = starLayer(sp / 16.0, 0.10, t) + starLayer(sp / 31.0 + 40.0, 0.16, t) * 1.6 + starLayer(sp / 58.0 + 80.0, 0.2, t) * 2.6;
  col += vec3(0.85, 0.92, 1.0) * st * (0.5 + 1.4 * uHigh) * (1.0 - 0.6 * cloud);

  // corona
  float tt = abs(atan(p.x, p.y)) / PI;
  float spec = texture(uSpec, vec2(0.02 + tt * 0.9, 0.5)).r;
  float sw = t * 0.025 + 0.16 / (r + 0.12);
  vec2 d2 = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * dir;
  float streak = fbm3(d2 * 3.2 + 2.0);
  float fine = fbm3(d2 * 13.0 + vec2(0.0, r * 3.0 - t * 0.22));
  float len = R * (0.30 + 1.25 * spec + 0.7 * uLevel + 0.5 * uKick) * (0.45 + 1.1 * streak);
  float outside = max(dr, 0.0);
  float corona = exp(-outside / len * 2.4) * (0.35 + 2.2 * fine * fine) * smoothstep(-0.002, 0.004, dr);
  float rim = exp(-abs(dr) / (R * 0.045));
  float halo = exp(-outside / (R * 2.6));
  vec3 hot = mix(uA, vec3(1.0), 0.7);
  vec3 cgrad = mix(uB, uA, exp(-outside / (R * 0.55)));
  float drive = 0.45 + 1.1 * uLevel + 0.7 * uKick + 0.25 * uTouch;
  col += cgrad * corona * drive * 1.15;
  col += hot * rim * (0.75 + 1.4 * uKick + 0.7 * uBeat + spec + 0.5 * uTouch);
  col += mix(uB, uA, 0.6) * halo * (0.10 + 0.28 * uLevel + 0.22 * uKick);

  // spectrum, drawn as a crown of fine rays
  float nb = 56.0;
  float bi = floor(tt * nb);
  float bv = texture(uSpec, vec2((bi + 0.5) / nb * 0.9 + 0.02, 0.5)).r;
  float bx = abs(fract(tt * nb) - 0.5);
  float b0 = R * 0.16;
  float bl = R * (0.03 + 0.95 * bv);
  float bar = smoothstep(0.36, 0.24, bx) * smoothstep(0.0, 0.003, dr - b0) * smoothstep(0.0, 0.004, b0 + bl - dr);
  col += mix(uA, vec3(1.0), 0.45) * bar * (0.3 + 0.95 * bv);

  col += mix(uA, vec3(1.0), 0.5) * rings * 0.55;

  // the disc itself
  float disc = smoothstep(R + 0.0015, R - 0.0015, r);
  // (clamped: far outside the disc this exponent would overflow and poison the pixel)
  vec3 inner = uD * 0.03 + uA * 0.06 * exp(-max(R - r, 0.0) / (R * 0.1));
  col = mix(col, inner, disc);

  vec2 v = gl_FragCoord.xy / uRes - 0.5;
  col *= (1.0 - 0.9 * dot(v, v)) * uWake;
  col = (col * (2.51 * col + 0.03)) / (col * (2.43 * col + 0.59) + 0.14);
  col = pow(clamp(col, 0.0, 1.0), vec3(1.0 / 2.2));
  col += (hash21(gl_FragCoord.xy + fract(t) * 100.0) - 0.5) * 0.026;
  outColor = vec4(col, 1.0);
}`;

const UNIFORMS = ['uRes', 'uCenter', 'uRadius', 'uTime', 'uKick', 'uBeat', 'uTouch', 'uLevel', 'uBass', 'uHigh', 'uEnergy', 'uWake', 'uShock', 'uA', 'uB', 'uD', 'uSpec'] as const;
type U = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;

const hexLin = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => Math.pow(c / 255, 2.2)) as [number, number, number];
};
const hexRgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function build(gl: WebGL2RenderingContext): { prog: WebGLProgram; u: U } | null {
  const mk = (type: number, src: string) => {
    const sh = gl.createShader(type)!;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      console.error('shader', gl.getShaderInfoLog(sh));
      return null;
    }
    return sh;
  };
  const vs = mk(gl.VERTEX_SHADER, VERT);
  const fs = mk(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return null;
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.error('link', gl.getProgramInfoLog(prog));
    return null;
  }
  const u = Object.fromEntries(UNIFORMS.map((n) => [n, gl.getUniformLocation(prog, n)])) as U;
  return { prog, u };
}

/** The sky behind everything, plus the orbiting trace of the melody. */
export default function Visualizer() {
  const glRef = useRef<HTMLCanvasElement>(null);
  const inkRef = useRef<HTMLCanvasElement>(null);
  const [flat, setFlat] = useState(false);

  useEffect(() => {
    const canvas = glRef.current!;
    const ink = inkRef.current!;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    const built = gl ? build(gl) : null;
    const ctx = ink.getContext('2d');
    if (!gl || !built) setFlat(true);

    let tex: WebGLTexture | null = null;
    const specBytes = new Uint8Array(BANDS);
    if (gl && built) {
      gl.bindVertexArray(gl.createVertexArray());
      gl.useProgram(built.prog);
      tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, BANDS, 1, 0, gl.RED, gl.UNSIGNED_BYTE, specBytes);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(built.u.uSpec, 0);
    }

    // resolution: sharp where the GPU can afford it, softer where it cannot
    let quality = 1;
    let slow = 0;
    let fast = 0;
    let W = 0;
    let H = 0;
    let scale = 1;
    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      scale = Math.min(dpr, Math.sqrt(1.7e6 / (w * h))) * quality;
      W = Math.max(2, Math.round(w * scale));
      H = Math.max(2, Math.round(h * scale));
      canvas.width = W;
      canvas.height = H;
      gl?.viewport(0, 0, W, H);
      const d2 = Math.min(window.devicePixelRatio || 1, 1.5);
      ink.width = Math.round(w * d2);
      ink.height = Math.round(h * d2);
      ctx?.setTransform(d2, 0, 0, d2, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // where the eclipse sits: the stage tells us
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight * 0.36;
    let rad = Math.min(window.innerWidth, window.innerHeight) * 0.13;
    let tcx = cx;
    let tcy = cy;
    let trad = rad;
    let tick = 0;
    let first = true;
    const anchor = () => {
      const el = document.getElementById('eclipse');
      if (!el) return;
      const b = el.getBoundingClientRect();
      if (b.width < 4) return;
      tcx = b.left + b.width / 2;
      tcy = b.top + b.height / 2;
      trad = Math.min(b.width, b.height) / 2;
      if (first) {
        first = false;
        cx = tcx;
        cy = tcy;
        rad = trad;
      }
    };

    let pal = { id: '', a: [1, 1, 1] as [number, number, number], b: [1, 1, 1] as [number, number, number], d: [0, 0, 0] as [number, number, number] };
    const cur = { a: [0, 0, 0], b: [0, 0, 0], d: [0, 0, 0] };
    let rgbA: [number, number, number] = [255, 255, 255];
    let rgbB: [number, number, number] = [255, 255, 255];
    let energy = 0;
    let wake = 0;
    const shocks = new Float32Array(4);
    const born = performance.now() / 1000;
    let inked = false;

    const off = onFrame((t, dt) => {
      const st = useStudio.getState();
      if (st.styleId !== pal.id) {
        const s = STYLES[st.styleId];
        pal = { id: s.id, a: hexLin(s.palette[0]), b: hexLin(s.palette[1]), d: hexLin(s.palette[2]) };
        rgbA = hexRgb(s.palette[0]);
        rgbB = hexRgb(s.palette[1]);
      }
      const k = 1 - Math.exp(-dt * 2.2);
      for (let i = 0; i < 3; i++) {
        cur.a[i] += (pal.a[i] - cur.a[i]) * k;
        cur.b[i] += (pal.b[i] - cur.b[i]) * k;
        cur.d[i] += (pal.d[i] - cur.d[i]) * k;
      }
      if (tick++ % 12 === 0) anchor();
      const kk = 1 - Math.exp(-dt * 7);
      cx += (tcx - cx) * kk;
      cy += (tcy - cy) * kk;
      rad += (trad - rad) * kk;
      const sec = st.score && st.playing ? st.score.sections[st.sectionIdx]?.energy ?? 0 : 0;
      energy += (sec - energy) * (1 - Math.exp(-dt * 1.2));
      wake = Math.min(1, wake + dt * 0.7);
      // at rest the eclipse still breathes
      const idle = player.playing ? 0 : 0.1 + 0.05 * Math.sin(t * 0.6);
      const level = Math.min(1, fx.level * 1.5 + idle);

      if (gl && built) {
        const u = built.u;
        for (let i = 0; i < BANDS; i++) specBytes[i] = Math.min(255, (fx.bands[i] + idle * (0.5 + 0.5 * Math.sin(t * 0.8 + i * 0.4))) * 255);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, BANDS, 1, gl.RED, gl.UNSIGNED_BYTE, specBytes);
        for (let i = 0; i < 4; i++) shocks[i] = player.shocks[i];
        gl.uniform2f(u.uRes, W, H);
        gl.uniform2f(u.uCenter, cx * scale, H - cy * scale);
        gl.uniform1f(u.uRadius, rad * scale);
        gl.uniform1f(u.uTime, t - born);
        gl.uniform1f(u.uKick, player.kick);
        gl.uniform1f(u.uBeat, player.beat);
        gl.uniform1f(u.uTouch, player.touch);
        gl.uniform1f(u.uLevel, level);
        gl.uniform1f(u.uBass, fx.bass);
        gl.uniform1f(u.uHigh, fx.high);
        gl.uniform1f(u.uEnergy, energy);
        gl.uniform1f(u.uWake, wake * wake * (3 - 2 * wake));
        gl.uniform1fv(u.uShock, shocks);
        gl.uniform3f(u.uA, cur.a[0], cur.a[1], cur.a[2]);
        gl.uniform3f(u.uB, cur.b[0], cur.b[1], cur.b[2]);
        gl.uniform3f(u.uD, cur.d[0], cur.d[1], cur.d[2]);
        gl.drawArrays(gl.TRIANGLES, 0, 3);

        // adapt: two seconds of slow frames lowers the resolution, a long clean run raises it again
        if (dt > 0.03) {
          slow++;
          fast = 0;
        } else {
          fast++;
          if (slow > 0) slow--;
        }
        if (slow > 90 && quality > 0.4) {
          quality = Math.max(0.4, quality * 0.8);
          slow = 0;
          resize();
        } else if (fast > 900 && quality < 1) {
          quality = Math.min(1, quality * 1.15);
          fast = 0;
          resize();
        }
      }

      // the melody, drawn as arcs in orbit: higher notes ride further out, one lap every two bars
      if (ctx && (inked || player.comets.length)) {
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const comets = player.comets;
        inked = comets.length > 0;
        if (comets.length) {
          const spb = st.score ? 60 / st.score.bpm : 0.5;
          const lap = Math.max(2.4, 8 * spb);
          const fade = lap * 0.94;
          ctx.globalCompositeOperation = 'lighter';
          ctx.lineCap = 'round';
          for (const c of comets) {
            const age = t - c.at;
            if (age > fade || age < 0) continue;
            const end = Math.min(t, c.at + c.dur);
            const a0 = -Math.PI / 2 + (c.at / lap) * Math.PI * 2;
            const a1 = -Math.PI / 2 + (end / lap) * Math.PI * 2;
            const norm = Math.max(0, Math.min(1, (c.midi - 45) / 44));
            const rr = rad * (1.55 + norm * 1.55) * (1 + player.kick * 0.02);
            const alpha = Math.pow(1 - age / fade, 1.6);
            const rgb = c.live ? rgbB : rgbA;
            const sounding = t < c.at + c.dur;
            const core = sounding ? 3.2 : 2.2;
            // glow as stacked additive strokes: far cheaper than a blurred shadow per arc
            ctx.beginPath();
            ctx.arc(cx, cy, rr, a0, Math.max(a1, a0 + 0.012));
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(alpha * (sounding ? 0.1 : 0.06)).toFixed(3)})`;
            ctx.lineWidth = core * (sounding ? 6.5 : 4.5);
            ctx.stroke();
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(alpha * 0.24).toFixed(3)})`;
            ctx.lineWidth = core * 2.6;
            ctx.stroke();
            ctx.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${(alpha * 0.85).toFixed(3)})`;
            ctx.lineWidth = core;
            ctx.stroke();
            if (sounding) {
              ctx.fillStyle = 'rgba(255,255,255,0.95)';
              ctx.beginPath();
              ctx.arc(cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr, 3.4, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.globalCompositeOperation = 'source-over';
        }
      }
    });

    return () => {
      off();
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <div className={`sky${flat ? ' sky-flat' : ''}`} aria-hidden>
      <canvas ref={glRef} className="sky-gl" />
      <canvas ref={inkRef} className="sky-ink" />
    </div>
  );
}
