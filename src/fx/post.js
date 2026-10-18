import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* ------------------------------------------------------------------ *
 * Post chain: Render → GTAO (half res) → DoF → Bloom (HDR) → Output →
 * Finish (vignette, grain, wash, scanline). Quality tiers rebuild it.
 * ------------------------------------------------------------------ */

const DofShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    uNear: { value: 0.1 }, uFar: { value: 200 }, uFocus: { value: 30 }, uRange: { value: 9 }, uMaxBlur: { value: 12 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float uNear, uFar, uFocus, uRange, uMaxBlur; uniform vec2 uResolution; varying vec2 vUv;
    float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, uNear, uFar); }
    float coc(float z) { float c = (z - uFocus) / uRange; c = c > 0.0 ? c : c * 1.25; return clamp(abs(c), 0.0, 1.0); }
    void main() {
      float draw = texture2D(tDepth, vUv).x;
      vec3 acc = texture2D(tDiffuse, vUv).rgb;
      if (draw >= 0.99999) { gl_FragColor = vec4(acc, 1.0); return; }
      float z = viewZ(vUv);
      float c0 = coc(z);
      float wsum = 1.0;
      if (c0 * uMaxBlur < 0.4) { gl_FragColor = vec4(acc, 1.0); return; }
      const int N = 24; float ga = 2.39996323;
      for (int i = 1; i < N; i++) {
        float fi = float(i); float r = sqrt(fi / float(N)); float a = fi * ga;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * uMaxBlur * c0 / uResolution;
        float zs = viewZ(uv); float cs = coc(zs);
        float w = smoothstep(0.0, 0.25, cs * 1.2 + 0.05);
        w = mix(w, 1.0, step(z, zs));
        acc += texture2D(tDiffuse, uv).rgb * w; wsum += w;
      }
      gl_FragColor = vec4(acc / wsum, 1.0);
    }`,
};

const FinishShader = {
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uVignette: { value: 0.38 }, uGrain: { value: 0.022 },
    uWash: { value: new THREE.Color('#5ee7ff') }, uWashAmt: { value: 0 }, uScan: { value: 0 }, uFade: { value: 0 },
  },
  vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uWashAmt, uScan, uFade; uniform vec3 uWash; varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float lum = dot(c, vec3(0.299, 0.587, 0.114));
      // wash: tint the shadows and mid-tones toward a colour
      c = mix(c, mix(uWash * lum * 1.2, c, smoothstep(0.1, 0.9, lum)), uWashAmt);
      // scanline sweep (x-ray chapter)
      float sl = smoothstep(0.004, 0.0, abs(fract(vUv.y * 1.0 - uTime * 0.12) - 0.5) - 0.002) * uScan;
      c += uWash * sl * 0.35;
      vec2 q = vUv - 0.5;
      c *= clamp(1.0 - dot(q, q) * uVignette * 2.2, 0.0, 1.0);
      c += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * uGrain;
      c *= 1.0 - uFade;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export const QUALITY = {
  high: { pr: 1.5, samples: 4, ao: true, dof: true, bloomScale: 1, shadow: 4096 },
  medium: { pr: 1.25, samples: 4, ao: false, dof: false, bloomScale: 1, shadow: 2048 },
  low: { pr: 1, samples: 0, ao: false, dof: false, bloomScale: 0.5, shadow: 1024 },
};

export function createPost(renderer, scene, camera, tier = 'high') {
  let q = QUALITY[tier] || QUALITY.high;
  let composer, gtao, dof, bloom, finish, rt;
  const settings = { dof: 0.45, dofRangeK: 0.5, bloom: 0.4, bloomThreshold: 1.25, bloomRadius: 0.55, vignette: 0.38, grain: 0.022, ao: 0.85 };
  let lastRadius = -1;

  function build() {
    dispose();
    renderer.setPixelRatio(Math.min(devicePixelRatio, q.pr));
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    rt = new THREE.WebGLRenderTarget(Math.max(1, size.x * pr), Math.max(1, size.y * pr), { type: THREE.HalfFloatType, samples: q.samples });
    composer = new EffectComposer(renderer, rt);
    composer.addPass(new RenderPass(scene, camera));
    gtao = null;
    dof = null;
    if (q.ao) {
      const AO = 0.5;
      gtao = new GTAOPass(scene, camera, Math.max(1, size.x * pr * AO), Math.max(1, size.y * pr * AO));
      const baseSetSize = gtao.setSize.bind(gtao);
      gtao.setSize = (W, H) => baseSetSize(Math.max(1, Math.round(W * AO)), Math.max(1, Math.round(H * AO)));
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = settings.ao;
      gtao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.2, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 8 });
      // keep sky, glass, particles and helpers out of the depth/normal prepass (patches addon internals: three is pinned)
      const baseOverride = gtao._overrideVisibility.bind(gtao);
      gtao._overrideVisibility = function () {
        baseOverride();
        scene.traverse((o) => {
          if ((o.userData.noDepth || o.material?.userData?.noDepth) && o.visible) {
            o.visible = false;
            this._visibilityCache.push(o);
          }
        });
      };
      composer.addPass(gtao);
      if (q.dof) {
        dof = new ShaderPass(DofShader);
        dof.uniforms.tDepth.value = gtao.depthTexture;
        composer.addPass(dof);
      }
    }
    bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, size.x * q.bloomScale), Math.max(1, size.y * q.bloomScale)), settings.bloom, settings.bloomRadius, settings.bloomThreshold);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    finish = new ShaderPass(FinishShader);
    finish.uniforms.uVignette.value = settings.vignette;
    finish.uniforms.uGrain.value = settings.grain;
    composer.addPass(finish);
    setSize(size.x, size.y);
  }

  function dispose() {
    if (!composer) return;
    for (const p of composer.passes) p.dispose?.();
    rt.dispose();
    composer = null;
  }

  function setSize(w, h) {
    if (!composer) return;
    composer.setSize(w, h);
    const pr = renderer.getPixelRatio();
    if (dof) {
      dof.uniforms.uResolution.value.set(w * pr, h * pr);
      dof.uniforms.tDepth.value = gtao.depthTexture;
    }
  }

  build();

  return {
    get composer() { return composer; },
    get tier() { return q; },
    settings,
    setSize,
    setQuality(name) {
      q = QUALITY[name] || QUALITY.high;
      build();
      return q;
    },
    setDof(strength) { settings.dof = strength; },
    setBloom(strength, threshold) {
      if (strength != null) settings.bloom = strength;
      if (threshold != null) settings.bloomThreshold = threshold;
      if (bloom) { bloom.strength = settings.bloom; bloom.threshold = settings.bloomThreshold; }
    },
    setFinish({ vignette, grain }) {
      if (vignette != null) settings.vignette = vignette;
      if (grain != null) settings.grain = grain;
      if (finish) { finish.uniforms.uVignette.value = settings.vignette; finish.uniforms.uGrain.value = settings.grain; }
    },
    setAO(blend) {
      settings.ao = blend;
      if (gtao) gtao.blendIntensity = blend;
    },
    setWash(color, amt) {
      if (!finish) return;
      if (color) finish.uniforms.uWash.value.set(color);
      finish.uniforms.uWashAmt.value = amt;
    },
    setScan(v) { if (finish) finish.uniforms.uScan.value = v; },
    setFade(v) { if (finish) finish.uniforms.uFade.value = v; },
    render(focusDist, t) {
      if (dof) {
        dof.uniforms.uNear.value = camera.near;
        dof.uniforms.uFar.value = camera.far;
        dof.uniforms.uFocus.value = focusDist;
        dof.uniforms.uRange.value = Math.max(1.5, focusDist * settings.dofRangeK);
        dof.uniforms.uMaxBlur.value = 16 * settings.dof;
        dof.enabled = settings.dof > 0.01;
      }
      if (gtao) {
        const r = THREE.MathUtils.clamp(focusDist * 0.025, 0.35, 18);
        if (Math.abs(r - lastRadius) > lastRadius * 0.12) {
          gtao.updateGtaoMaterial({ radius: r });
          lastRadius = r;
        }
      }
      finish.uniforms.uTime.value = t % 1000;
      composer.render();
    },
  };
}
