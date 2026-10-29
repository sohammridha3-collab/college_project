/* ==============================================================================
 * OPENING SCENE — Continuous 3-Stage Metallic Transformation Sequence
 * ------------------------------------------------------------------------------
 * Sequence:
 * 1. Ambient Chrome Flow: Dense chrome ribbons slowly move in a coordinated composition.
 * 2. Streaks Elongation: Ribbons spread out, flatten, and stretch into silver & orange streaks.
 * 3. Flowing Particle Wave: Streaks transition into thousands of cosmic particles
 *    forming an undulating, living wave field.
 *
 * Controlled seamlessly by scroll progress (scrubbing forward & reversing backward).
 * Desktop pointer provides subtle parallax and responsive specular reflections.
 * Accessible with reduced-motion support and WebGL static fallback.
 * ============================================================================== */

import * as THREE from "three";

// ---------- Deterministic PRNG ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (min, max, val) => {
  const x = Math.max(0, Math.min(1, (val - min) / (max - min)));
  return x * x * (3 - 2 * x);
};

// ---------- Procedural Softbox & Light Studio Environment ----------
function buildEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x030304);

  const plane = new THREE.PlaneGeometry(1, 1);
  const panel = (hex, intensity, pos, scale, target = [0, 0, 0]) => {
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(hex).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false
    });
    const mesh = new THREE.Mesh(plane, mat);
    mesh.position.set(...pos);
    mesh.scale.set(scale[0], scale[1], 1);
    mesh.lookAt(...target);
    env.add(mesh);
  };

  // Overhead softbox → broad silver sheen
  panel(0xffffff, 6.0, [0, 9, 3], [14, 5]);
  // Camera-side fills
  panel(0xdfe5ef, 1.3, [0, 0, 11], [22, 8]);
  panel(0xf4f7ff, 4.0, [0, 2.2, 10], [16, 0.9]);
  // Specular chrome accent strips
  panel(0xffffff, 10.0, [-8, 1, 3], [0.5, 14]);
  panel(0xffffff, 7.0, [8, 2, -2], [0.35, 12]);
  panel(0xf4f6ff, 4.5, [-2, 0, -9], [0.4, 10]);
  panel(0xffffff, 4.0, [4, -1, -9], [7, 0.45]);
  panel(0xffffff, 3.0, [-5, 6, 7], [0.3, 6]);
  // Warm fiery orange/red edge panels
  panel(0xff5a1a, 12.0, [9, -4, 4], [1.4, 3.2]);
  panel(0xff2b12, 9.0, [-7, -6, -1], [5, 0.6]);
  panel(0xff7b2e, 7.0, [2, -8, 7], [4, 0.35]);
  panel(0xff3d14, 5.0, [-9, 5, -6], [0.5, 3]);
  // Deep floor
  panel(0x1a1b20, 1.0, [0, -10, 0], [40, 40]);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(env, 0.03);
  pmrem.dispose();
  env.traverse(o => {
    if (o.material) o.material.dispose();
  });
  plane.dispose();
  return target.texture;
}

// ---------- Procedural Circular Particle Texture ----------
function createParticleTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext("2d");
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255, 255, 255, 1)");
  grad.addColorStop(0.22, "rgba(255, 230, 200, 0.9)");
  grad.addColorStop(0.55, "rgba(255, 120, 50, 0.4)");
  grad.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}

// ---------- Ribbon Sweep Geometry ----------
function buildRibbonGeometry(points, sides, { width, thickness, curl, twist, radial = 18 }) {
  const n = points.length;
  const hw = width / 2;
  const ht = thickness / 2;
  const exp = 2 / 3;

  const positions = new Float32Array(n * radial * 3);
  const T = new THREE.Vector3();
  const W = new THREE.Vector3();
  const N = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  const profile = [];
  for (let j = 0; j < radial; j++) {
    const th = (j / radial) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const u = Math.sign(c) * Math.pow(Math.abs(c), exp);
    const v = Math.sign(s) * Math.pow(Math.abs(s), exp);
    profile.push([u, v]);
  }

  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    T.subVectors(next, prev).normalize();

    W.copy(sides[i]).addScaledVector(T, -sides[i].dot(T)).normalize();
    W.applyAxisAngle(T, twist(t));
    N.crossVectors(T, W).normalize();

    const p = points[i];
    for (let j = 0; j < radial; j++) {
      const [u, v] = profile[j];
      tmp.copy(p)
        .addScaledVector(W, u * hw)
        .addScaledVector(N, v * ht + curl * hw * (u * u - 0.5));
      const k = (i * radial + j) * 3;
      positions[k] = tmp.x;
      positions[k + 1] = tmp.y;
      positions[k + 2] = tmp.z;
    }
  }

  const indices = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * radial + j;
      const b = (i + 1) * radial + j;
      const c = (i + 1) * radial + ((j + 1) % radial);
      const d = i * radial + ((j + 1) % radial);
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

// ---------- Bundle Definition & Ribbon Builder ----------
function buildBundle(cfg, materials, collectedSplinePoints) {
  const {
    control,
    count,
    seed,
    widthRange = [0.26, 0.46],
    gap = 1.12,
    thickness = 0.045,
    curl = 0.12,
    turns = 0.8,
    sheetPhase = 0,
    fan = 0.35,
    depthJitter = 0.12,
    twistAmp = 0.35,
    samples = 360
  } = cfg;

  const rand = mulberry32(seed);
  const curve = new THREE.CatmullRomCurve3(
    control.map(p => new THREE.Vector3(p[0], p[1], p[2])),
    false,
    "centripetal"
  );
  const frames = curve.computeFrenetFrames(samples, false);
  const centers = curve.getSpacedPoints(samples);

  const widths = Array.from({ length: count }, () => lerp(widthRange[0], widthRange[1], rand()));
  const spacing = widthRange[1] * gap;
  const halfSheet = ((count - 1) / 2) * spacing * (1 + fan) + widthRange[1] / 2;
  const group = new THREE.Group();

  // Curvature-based banking
  const ds = curve.getLength() / samples;
  const kappa = [];
  for (let i = 0; i <= samples; i++) {
    const a = frames.tangents[Math.max(0, i - 1)];
    const b = frames.tangents[Math.min(samples, i + 1)];
    const span = (Math.min(samples, i + 1) - Math.max(0, i - 1)) * ds;
    kappa.push(b.clone().sub(a).divideScalar(span));
  }
  const win = 18;
  const kSmooth = kappa.map((_, i) => {
    const acc = new THREE.Vector3();
    let n = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(samples, i + win); j++) {
      acc.add(kappa[j]);
      n++;
    }
    return acc.divideScalar(n);
  });

  const acrossAxes = [];
  const depthAxes = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const a = sheetPhase + t * turns * Math.PI * 2;
    const Nf = frames.normals[i];
    const Bf = frames.binormals[i];
    const Tf = frames.tangents[i];
    const across = Bf.clone().multiplyScalar(Math.cos(a)).addScaledVector(Nf, Math.sin(a));
    const k = kSmooth[i];
    const kLen = k.length();
    if (kLen > 1e-5) {
      const kHat = k.clone().divideScalar(kLen);
      const w = smoothstep(0.2, 0.65, kLen * halfSheet);
      across.addScaledVector(kHat, -across.dot(kHat) * w).normalize();
    }
    acrossAxes.push(across);
    depthAxes.push(new THREE.Vector3().crossVectors(Tf, across).normalize());
  }

  for (let k = 0; k < count; k++) {
    const offset = (k - (count - 1) / 2) * spacing;
    const depthSeed = (rand() - 0.5) * 2;
    const twPhase = rand() * Math.PI * 2;
    const twFreq = 0.6 + rand() * 1.2;
    const twAmp = (rand() - 0.5) * 2 * twistAmp;

    const pts = [];
    const sides = [];
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const across = acrossAxes[i];
      const depth = depthAxes[i];
      const spread = 1 + fan * Math.sin(t * Math.PI * 2 * 0.9 + seed);
      const d = depthSeed * depthJitter * (0.6 + 0.4 * Math.sin(t * 7 + k));
      const pt = centers[i].clone().addScaledVector(across, offset * spread).addScaledVector(depth, d);
      pts.push(pt);
      sides.push(across);

      // Collect points for particle wave sampling
      if (collectedSplinePoints && i % 4 === 0) {
        collectedSplinePoints.push({
          pos: pt.clone(),
          tangent: frames.tangents[i].clone(),
          bundleId: cfg.seed,
          ribbonId: k
        });
      }
    }

    const geo = buildRibbonGeometry(pts, sides, {
      width: widths[k],
      thickness,
      curl,
      twist: t => twAmp * Math.sin(t * Math.PI * 2 * twFreq + twPhase)
    });

    const mat = materials[Math.floor(rand() * materials.length)];
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = {
      baseScale: new THREE.Vector3(1, 1, 1),
      ribbonIdx: k,
      bundleSeed: seed,
      offsetRatio: offset / (spacing || 1)
    };
    group.add(mesh);
  }

  group.userData = {
    seed,
    basePos: new THREE.Vector3(0, 0, 0),
    turnRate: turns
  };

  return group;
}

// ---------- Scene Layout Bundles ----------
const BUNDLES = [
  // Deep background band
  {
    control: [[-16, 2.5, -13], [-7, 6.2, -11], [1, 4.6, -10], [8, 6.6, -12], [16, 4, -14]],
    count: 6, seed: 11, turns: 0.7, widthRange: [0.55, 0.9], thickness: 0.06, mat: "deep"
  },
  // Mid-depth band
  {
    control: [[10, 7, -7], [5.8, 3.8, -4.5], [3.6, 0.9, -3.8], [4.6, -2.2, -4.2], [3.9, -7, -5.5]],
    count: 5, seed: 23, turns: 1.0, sheetPhase: 0.6, widthRange: [0.42, 0.7], gap: 1.08, fan: 0.2, mat: "mid"
  },
  // Hero foreground band
  {
    control: [[-9, 4.8, -3.5], [-4, 3.0, -1.4], [0.4, 2.5, 0.2], [3.4, 1.9, 1.0], [4.7, 0.2, 1.2], [4.4, -2.3, 0.6], [6.4, -4.4, -0.4], [10, -5.6, -2]],
    count: 6, seed: 37, turns: 1.1, sheetPhase: 1.2, widthRange: [0.38, 0.62], gap: 1.06, fan: 0.22, twistAmp: 0.5, mat: "hero"
  },
  // Secondary crossing sweep
  {
    control: [[9, 4.8, -1.5], [4, 3.6, -0.6], [-1, 4.0, -1.8], [-6, 2.8, -3], [-12, 3.9, -5]],
    count: 4, seed: 41, turns: 0.8, sheetPhase: 2.4, widthRange: [0.34, 0.52], gap: 1.1, fan: 0.2, mat: "hero"
  },
  // Right-edge close foreground
  {
    control: [[7.2, 4, 4.4], [4.1, 1.5, 5.0], [4.3, -1.2, 4.6], [6.8, -4, 3.8]],
    count: 2, seed: 53, turns: 0.6, sheetPhase: 0.3, widthRange: [0.36, 0.5], gap: 1.3, thickness: 0.035, fan: 0.1, mat: "front"
  }
];

// ---------- Main Opening Scene Controller ----------
function init() {
  const container = document.querySelector("[data-opening-scene]");
  if (!container) return;
  const track = document.getElementById("opening-track") || container.parentElement;
  const canvas = container.querySelector("canvas");
  const copyEl = document.getElementById("opening-copy");
  const stageTextEl = document.getElementById("stage-text");
  const scrollThumbEl = document.getElementById("scroll-thumb");

  // Reduced-motion detection
  const prefersReducedMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  } catch (err) {
    container.classList.add("no-webgl");
    console.warn("[opening-scene] WebGL unavailable, static fallback active.", err);
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060607);
  scene.fog = new THREE.Fog(0x060607, 13, 38);
  scene.environment = buildEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(32, 16 / 9, 0.1, 100);
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);

  // Responsive camera layout
  function layout(w, h) {
    const aspect = w / h;
    camera.aspect = aspect;
    if (aspect >= 1.25) {
      camera.fov = 32;
      world.position.set(Math.min(0.9, (aspect - 1.78) * 1.6), 0, 0);
      world.scale.setScalar(1);
    } else if (aspect >= 0.8) {
      camera.fov = 38;
      world.position.set(-0.6, 0.9, 0);
      world.scale.setScalar(0.92);
    } else {
      camera.fov = 52;
      world.position.set(-2.4, 2.2, 0);
      world.scale.setScalar(0.85);
    }
    camera.updateProjectionMatrix();
  }

  // Materials with transparent support for smooth fading during particle transition
  const allMaterials = [];
  const chrome = (opts = {}) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xf3f4f6,
      metalness: 1,
      roughness: 0.12,
      clearcoat: 0.6,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1.25,
      transparent: true,
      opacity: 1.0,
      emissive: new THREE.Color(0x000000),
      ...opts
    });
    allMaterials.push(mat);
    return mat;
  };

  const materials = {
    hero: [chrome(), chrome({ roughness: 0.08 }), chrome({ color: 0xd9dce2, roughness: 0.16 })],
    front: [chrome({ roughness: 0.1, envMapIntensity: 1.4 })],
    mid: [chrome({ roughness: 0.18 }), chrome({ color: 0xc9ccd3, roughness: 0.2 })],
    deep: [chrome({ roughness: 0.26, envMapIntensity: 0.9, color: 0xb9bcc4 })]
  };

  // Build Ribbons & Collect Sample Points for Particle Wave
  const collectedSplinePoints = [];
  const world = new THREE.Group();
  const bundleGroups = [];

  BUNDLES.forEach(b => {
    const bg = buildBundle(b, materials[b.mat], collectedSplinePoints);
    bundleGroups.push(bg);
    world.add(bg);
  });
  scene.add(world);

  // Warm specular point lights
  const warm1 = new THREE.PointLight(0xff5a1f, 55, 0, 2);
  warm1.position.set(6.5, -2.5, 5.5);
  const warm2 = new THREE.PointLight(0xff2a14, 30, 0, 2);
  warm2.position.set(-1.5, 5.2, 2.5);
  const cool = new THREE.PointLight(0xdfe6ff, 20, 0, 2);
  cool.position.set(1, 1, 8);
  scene.add(warm1, warm2, cool);

  // ==============================================================================
  // STAGE 3 PARTICLE WAVE SYSTEM (THREE.Points)
  // ==============================================================================
  const PARTICLE_COUNT = 9200;
  const pRand = mulberry32(777);

  const particleGeometry = new THREE.BufferGeometry();
  const posArray = new Float32Array(PARTICLE_COUNT * 3);
  const colorArray = new Float32Array(PARTICLE_COUNT * 3);

  // Internal data arrays for GPU-free trigonometric morphing
  const pOrigins = [];
  const pWaveTargets = [];
  const pParams = [];

  const colSilver = new THREE.Color(0xf1f5f9);
  const colChrome = new THREE.Color(0xdce3ed);
  const colOrange = new THREE.Color(0xff6828);
  const colCrimson = new THREE.Color(0xff1f3d);
  const colAmber = new THREE.Color(0xffaa1e);

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // 1. Origin: random sample on ribbon curves
    const sampleIdx = Math.floor(pRand() * collectedSplinePoints.length);
    const origin = collectedSplinePoints[sampleIdx].pos.clone();
    // Add subtle jitter around ribbon surface
    origin.x += (pRand() - 0.5) * 0.45;
    origin.y += (pRand() - 0.5) * 0.45;
    origin.z += (pRand() - 0.5) * 0.35;
    pOrigins.push(origin);

    // 2. Wave Destination: cosmic flowing wave ribbon across 3D space
    const waveX = lerp(-14, 14, pRand());
    const flowT = (waveX + 14) / 28;
    // Elegant sinusoidal wave crest and trough mirroring the hero ribbon flow
    const waveY = Math.sin(waveX * 0.32 + 1.2) * 3.2 + Math.cos(waveX * 0.18) * 1.6 + (pRand() - 0.5) * 2.8;
    const waveZ = Math.cos(waveX * 0.26) * 3.4 + (pRand() - 0.5) * 3.2;
    pWaveTargets.push(new THREE.Vector3(waveX, waveY, waveZ));

    // 3. Dynamic attributes
    pParams.push({
      freq: 0.2 + pRand() * 0.3,
      speed: 0.8 + pRand() * 1.4,
      amp: 0.6 + pRand() * 1.5,
      phase: pRand() * Math.PI * 2,
      lateralDrift: (pRand() - 0.5) * 0.6
    });

    // Color distribution: 65% silver/chrome, 25% fiery orange, 10% crimson
    let c = colSilver;
    const rVal = pRand();
    if (rVal > 0.88) c = colCrimson;
    else if (rVal > 0.65) c = colOrange;
    else if (rVal > 0.5) c = colAmber;
    else if (rVal > 0.25) c = colChrome;

    colorArray[i * 3] = c.r;
    colorArray[i * 3 + 1] = c.g;
    colorArray[i * 3 + 2] = c.b;

    posArray[i * 3] = origin.x;
    posArray[i * 3 + 1] = origin.y;
    posArray[i * 3 + 2] = origin.z;
  }

  particleGeometry.setAttribute("position", new THREE.BufferAttribute(posArray, 3));
  particleGeometry.setAttribute("color", new THREE.BufferAttribute(colorArray, 3));

  const particleTexture = createParticleTexture();
  const particleMaterial = new THREE.PointsMaterial({
    size: 0.28,
    map: particleTexture,
    transparent: true,
    opacity: 0.0,
    vertexColors: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });

  const particlePoints = new THREE.Points(particleGeometry, particleMaterial);
  scene.add(particlePoints);

  // ==============================================================================
  // INTERACTIVE CONTROLS & SCROLL TRACKING
  // ==============================================================================
  let targetProgress = 0;
  let currentProgress = 0;

  // Desktop Pointer Parallax
  const mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  window.addEventListener("mousemove", e => {
    mouse.targetX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouse.targetY = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  // Passive Native Scroll Tracking
  function onScroll() {
    // Check for optional debug/preview override parameter (?p=0.45 or ?scroll=0.8)
    const urlParams = new URLSearchParams(window.location.search);
    const debugParam = urlParams.get("p") || urlParams.get("scroll");
    if (debugParam !== null) {
      targetProgress = Math.max(0, Math.min(1, parseFloat(debugParam)));
      return;
    }

    if (!track) return;
    const rect = track.getBoundingClientRect();
    const trackHeight = track.offsetHeight - window.innerHeight;
    if (trackHeight <= 0) {
      targetProgress = 0;
      return;
    }
    const scrolled = -rect.top;
    targetProgress = Math.max(0, Math.min(1, scrolled / trackHeight));
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // If debug param present, initialize currentProgress directly
  const initialDebug = new URLSearchParams(window.location.search).get("p") || new URLSearchParams(window.location.search).get("scroll");
  if (initialDebug !== null) {
    currentProgress = Math.max(0, Math.min(1, parseFloat(initialDebug)));
  }

  // Resize Handling
  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    layout(w, h);
    onScroll();
  }

  if ("ResizeObserver" in window) {
    new ResizeObserver(resize).observe(container);
  } else {
    window.addEventListener("resize", resize);
  }
  resize();

  container.dataset.sceneReady = "true";

  // ==============================================================================
  // RENDER & CONTINUOUS ANIMATION LOOP
  // ==============================================================================
  let time = 0;

  function animate() {
    requestAnimationFrame(animate);

    // If reduced motion is requested, maintain static initial composition
    if (prefersReducedMotion) {
      renderer.render(scene, camera);
      return;
    }

    time += 0.006;

    // Smooth scroll interpolation (dampened easing for silky forward/backward scrub)
    currentProgress += (targetProgress - currentProgress) * 0.085;

    // Smooth mouse parallax interpolation
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    // Camera pointer reaction
    camera.position.x = mouse.x * 0.45;
    camera.position.y = -mouse.y * 0.32;
    camera.lookAt(0, 0, 0);

    // Warm light dynamic response
    warm1.position.x = 6.5 + mouse.x * 1.5;
    warm1.position.y = -2.5 - mouse.y * 1.0;
    warm2.position.x = -1.5 - mouse.x * 1.2;

    // --------------------------------------------------------------------------
    // HTML HEADINGS & STAGE TELEMETRY
    // --------------------------------------------------------------------------
    if (copyEl) {
      const copyFade = 1.0 - smoothstep(0.04, 0.32, currentProgress);
      const copyY = -currentProgress * 150;
      copyEl.style.transform = `translateY(${copyY}px)`;
      copyEl.style.opacity = copyFade.toFixed(3);
      copyEl.style.display = copyFade <= 0.01 ? "none" : "block";
    }

    if (scrollThumbEl) {
      scrollThumbEl.style.width = `${(currentProgress * 100).toFixed(1)}%`;
    }

    if (stageTextEl) {
      if (currentProgress < 0.28) {
        stageTextEl.textContent = "STAGE 01 // COORDINATED CHROME FLOW";
      } else if (currentProgress < 0.65) {
        stageTextEl.textContent = "STAGE 02 // METALLIC STREAKS ELONGATION";
      } else {
        stageTextEl.textContent = "STAGE 03 // COSMIC PARTICLE WAVE";
      }
    }

    // --------------------------------------------------------------------------
    // STAGE 1: Ambient Coordinated Ribbon Movement
    // --------------------------------------------------------------------------
    const spreadProgress = smoothstep(0.08, 0.58, currentProgress);
    const streakProgress = Math.sin(Math.min(1, Math.max(0, (currentProgress - 0.12) / 0.52)) * Math.PI);
    const ribbonFade = 1.0 - smoothstep(0.48, 0.78, currentProgress);

    bundleGroups.forEach((bg, idx) => {
      // Coordinated flowing wave motion
      const waveFreq = 0.5;
      const bTime = time * waveFreq + idx * 1.1;

      // Stage 1 undulation + Stage 2 spreading outward
      bg.rotation.z = Math.sin(bTime * 0.7) * 0.035;
      bg.rotation.y = Math.cos(bTime * 0.6) * 0.028;
      bg.position.y = Math.sin(bTime * 0.8) * 0.18;

      // Lateral spreading across 3D space
      bg.position.x = (idx % 2 === 0 ? 1 : -1) * spreadProgress * 2.8;
      bg.position.z = spreadProgress * 1.5;

      // Elongate and flatten each ribbon mesh into aerodynamic reflective streaks
      bg.children.forEach(mesh => {
        mesh.scale.x = 1.0 + spreadProgress * 0.72;
        mesh.scale.y = 1.0 - spreadProgress * 0.42;
        mesh.scale.z = 1.0 - spreadProgress * 0.32;
      });
    });

    // --------------------------------------------------------------------------
    // STAGE 2: Streaks Glowing Edge Highlights & Dissolve
    // --------------------------------------------------------------------------
    // Amplify warm point lights so reflective chrome surfaces catch brilliant orange/red edge glints
    warm1.intensity = 55 + streakProgress * 150;
    warm2.intensity = 30 + streakProgress * 105;

    allMaterials.forEach(mat => {
      mat.opacity = ribbonFade;
      // Refined metallic streaks: preserve chrome reflections with blazing silver-orange edge illumination
      mat.emissive.setRGB(
        streakProgress * 0.26,
        streakProgress * 0.08,
        streakProgress * 0.02
      );
      mat.roughness = lerp(0.12, 0.03, spreadProgress);
      mat.clearcoat = lerp(0.6, 1.0, streakProgress);
    });

    // --------------------------------------------------------------------------
    // STAGE 3: Transition into Cosmic Flowing Particle Wave
    // --------------------------------------------------------------------------
    const waveMorph = smoothstep(0.35, 0.88, currentProgress);
    particleMaterial.opacity = smoothstep(0.32, 0.62, currentProgress);

    if (particleMaterial.opacity > 0.01) {
      const positions = particleGeometry.attributes.position.array;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const p0 = pOrigins[i];
        const p1 = pWaveTargets[i];
        const param = pParams[i];

        // Base interpolation from ribbon origin to cosmic wave target
        let x = lerp(p0.x, p1.x, waveMorph);
        let y = lerp(p0.y, p1.y, waveMorph);
        let z = lerp(p0.z, p1.z, waveMorph);

        // Fluid undulating trigonometric wave field (amplifies with morph)
        if (waveMorph > 0.02) {
          const w = waveMorph;
          const wavePhase = time * param.speed + param.phase;
          y += Math.sin(x * param.freq + wavePhase) * param.amp * w;
          z += Math.cos(x * 0.22 + time * 1.1) * 1.2 * w;
          x += Math.sin(wavePhase * 0.8) * param.lateralDrift * w;
        }

        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
      }

      particleGeometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}

// Self-initialize on DOM ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
