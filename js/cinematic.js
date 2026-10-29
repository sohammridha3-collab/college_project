/* ==============================================================================
 * STUDENT ADMISSION PORTAL — CINEMATIC VISUAL ENGINE
 * Metallic Reflective Ribbons, Particle Transformations & Interactive Showcase
 * ============================================================================== */

// ==============================================================================
// 1. REFLECTIVE METALLIC RIBBON ENGINE
// ==============================================================================
class MetallicRibbonEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.time = 0;
    
    // Mouse tracking for specular and parallax response
    this.mouse = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      targetX: window.innerWidth / 2,
      targetY: window.innerHeight / 2
    };

    // Color theme configuration
    this.accentColor = { r: 255, g: 87, b: 34 }; // Vibrant Orange

    // Ribbons definition (3 intertwined metallic bands)
    this.ribbons = [
      {
        baseY: 0.38,
        amplitude1: 90,
        amplitude2: 45,
        freq1: 0.0018,
        freq2: 0.0035,
        speed: 0.0008,
        width: 65,
        twistRate: 0.0022,
        phase: 0,
        metallicTint: 'chrome'
      },
      {
        baseY: 0.52,
        amplitude1: 110,
        amplitude2: 55,
        freq1: 0.0022,
        freq2: 0.004,
        speed: 0.0011,
        width: 80,
        twistRate: 0.0026,
        phase: Math.PI / 3,
        metallicTint: 'fire'
      },
      {
        baseY: 0.65,
        amplitude1: 85,
        amplitude2: 40,
        freq1: 0.0015,
        freq2: 0.003,
        speed: 0.0007,
        width: 55,
        twistRate: 0.0018,
        phase: Math.PI * 0.7,
        metallicTint: 'bronze'
      }
    ];

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.targetX = e.clientX;
      this.mouse.targetY = e.clientY;
    });
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
  }

  setAccent(r, g, b) {
    this.accentColor = { r, g, b };
  }

  update() {
    this.time += 1;
    // Smooth mouse interpolation
    this.mouse.x += (this.mouse.targetX - this.mouse.x) * 0.05;
    this.mouse.y += (this.mouse.targetY - this.mouse.y) * 0.05;
  }

  draw() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const mouseNormX = (this.mouse.x / this.width - 0.5) * 2;
    const mouseNormY = (this.mouse.y / this.height - 0.5) * 2;

    this.ribbons.forEach((ribbon, rIdx) => {
      const step = 8;
      const count = Math.ceil(this.width / step) + 2;
      const topPts = [];
      const btmPts = [];
      const lightPts = [];

      for (let i = 0; i <= count; i++) {
        const x = i * step;
        const t = this.time * ribbon.speed + ribbon.phase;
        
        // Multi-frequency wave calculation with parallax influence
        const wave1 = Math.sin(x * ribbon.freq1 + t) * ribbon.amplitude1;
        const wave2 = Math.cos(x * ribbon.freq2 - t * 1.2) * ribbon.amplitude2;
        const parallaxY = mouseNormY * 40 * (rIdx + 1) * 0.3;
        const y = this.height * ribbon.baseY + wave1 + wave2 + parallaxY;

        // Twisting dynamic ribbon thickness & perspective normal
        const twist = Math.sin(x * ribbon.twistRate + t * 1.5);
        const currentWidth = ribbon.width * (0.35 + 0.65 * Math.abs(twist));
        const halfW = currentWidth / 2;

        topPts.push({ x, y: y - halfW });
        btmPts.push({ x, y: y + halfW });

        // Specular highlight factor along the twist
        const normalZ = Math.cos(x * ribbon.twistRate + t * 1.5);
        const lightDist = Math.hypot(x - this.mouse.x, y - this.mouse.y);
        const lightSpec = Math.max(0, 1 - lightDist / (this.width * 0.45));
        lightPts.push({ normalZ, lightSpec });
      }

      // Draw ribbon segments with metallic reflective sheen
      for (let i = 0; i < topPts.length - 1; i++) {
        const p1 = topPts[i];
        const p2 = topPts[i + 1];
        const p3 = btmPts[i + 1];
        const p4 = btmPts[i];
        const spec = lightPts[i];

        this.ctx.beginPath();
        this.ctx.moveTo(p1.x, p1.y);
        this.ctx.lineTo(p2.x, p2.y);
        this.ctx.lineTo(p3.x, p3.y);
        this.ctx.lineTo(p4.x, p4.y);
        this.ctx.closePath();

        // Create metallic reflection gradient across strip
        const grad = this.ctx.createLinearGradient(p1.x, p1.y, p4.x, p4.y);
        const nz = Math.abs(spec.normalZ);

        if (ribbon.metallicTint === 'fire') {
          const r = this.accentColor.r;
          const g = this.accentColor.g;
          const b = this.accentColor.b;
          
          grad.addColorStop(0, `rgba(255, 255, 255, ${0.45 + nz * 0.4 + spec.lightSpec * 0.4})`);
          grad.addColorStop(0.3, `rgba(${r}, ${g}, ${b}, ${0.6 + nz * 0.3})`);
          grad.addColorStop(0.7, `rgba(255, 23, 68, ${0.35 + nz * 0.3})`);
          grad.addColorStop(1, `rgba(10, 10, 18, 0.9)`);
        } else if (ribbon.metallicTint === 'chrome') {
          grad.addColorStop(0, `rgba(255, 255, 255, ${0.4 + nz * 0.45 + spec.lightSpec * 0.3})`);
          grad.addColorStop(0.4, `rgba(180, 195, 215, ${0.25 + nz * 0.25})`);
          grad.addColorStop(0.8, `rgba(50, 60, 80, 0.4)`);
          grad.addColorStop(1, `rgba(5, 5, 10, 0.85)`);
        } else {
          grad.addColorStop(0, `rgba(255, 215, 140, ${0.35 + nz * 0.4})`);
          grad.addColorStop(0.5, `rgba(160, 70, 20, 0.45)`);
          grad.addColorStop(1, `rgba(15, 15, 25, 0.9)`);
        }

        this.ctx.fillStyle = grad;
        this.ctx.fill();

        // Specular glint line on outer edge
        if (i % 3 === 0 && nz > 0.6) {
          this.ctx.strokeStyle = `rgba(255, 255, 255, ${(nz - 0.6) * 1.5})`;
          this.ctx.lineWidth = 1;
          this.ctx.beginPath();
          this.ctx.moveTo(p1.x, p1.y);
          this.ctx.lineTo(p2.x, p2.y);
          this.ctx.stroke();
        }
      }
    });
  }
}

// ==============================================================================
// 2. PARTICLE TRANSFORMATIONS ENGINE
// ==============================================================================
class ParticleTransformationEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.particles = [];
    this.count = 110;
    this.mode = 'applicant'; // 'applicant' | 'officer' | 'admin'
    this.time = 0;
    
    this.mouse = {
      x: window.innerWidth / 2,
      y: window.innerHeight / 2,
      radius: 140
    };

    this.shockwave = {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      maxRadius: 360,
      strength: 0
    };

    this.initParticles();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('click', (e) => this.triggerShockwave(e.clientX, e.clientY));
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width * this.dpr;
    this.canvas.height = this.height * this.dpr;
    this.ctx.scale(this.dpr, this.dpr);
    this.recalculateTargets();
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < this.count; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.8,
        vy: (Math.random() - 0.5) * 0.8,
        targetX: 0,
        targetY: 0,
        radius: Math.random() * 2.2 + 0.8,
        alpha: Math.random() * 0.7 + 0.3,
        color: '#ff7043',
        pulse: Math.random() * Math.PI * 2,
        gridX: 0,
        gridY: 0
      });
    }
  }

  setMode(mode) {
    this.mode = mode;
    this.recalculateTargets();
  }

  triggerShockwave(x, y) {
    this.shockwave.active = true;
    this.shockwave.x = x;
    this.shockwave.y = y;
    this.shockwave.radius = 10;
    this.shockwave.strength = 1.0;
  }

  recalculateTargets() {
    const cx = this.width / 2;
    const cy = this.height / 2;

    this.particles.forEach((p, idx) => {
      if (this.mode === 'applicant') {
        // Mode 1: Dynamic Flowfield / Rising Sparks
        p.targetX = Math.random() * this.width;
        p.targetY = Math.random() * this.height;
        p.color = idx % 3 === 0 ? '#ffab00' : (idx % 2 === 0 ? '#ff5722' : '#ffffff');
      } else if (this.mode === 'officer') {
        // Mode 2: Structured Verification Matrix (Isometric Grid)
        const cols = 11;
        const rows = Math.ceil(this.count / cols);
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const spacingX = Math.min(80, this.width / (cols + 2));
        const spacingY = 48;
        
        p.targetX = cx + (col - cols / 2) * spacingX;
        p.targetY = cy + (row - rows / 2) * spacingY - 40;
        p.color = idx % 2 === 0 ? '#ff1744' : '#ff5722';
      } else if (this.mode === 'admin') {
        // Mode 3: Concentric Orbital Shield Rings
        const rings = [100, 190, 290, 400];
        const ringIdx = idx % rings.length;
        const r = rings[ringIdx];
        const angle = (idx / (this.count / rings.length)) * Math.PI * 2;
        
        p.targetX = cx + Math.cos(angle) * r;
        p.targetY = cy + Math.sin(angle) * r;
        p.color = idx % 4 === 0 ? '#ffffff' : (idx % 2 === 0 ? '#ff9100' : '#ff3b00');
      }
    });
  }

  update() {
    this.time += 0.02;

    // Update Shockwave
    if (this.shockwave.active) {
      this.shockwave.radius += 12;
      this.shockwave.strength *= 0.94;
      if (this.shockwave.radius >= this.shockwave.maxRadius || this.shockwave.strength < 0.05) {
        this.shockwave.active = false;
      }
    }

    const cx = this.width / 2;
    const cy = this.height / 2;

    this.particles.forEach((p, idx) => {
      p.pulse += 0.04;

      if (this.mode === 'applicant') {
        // Natural ember drift + wave motion
        p.x += Math.sin(this.time + p.pulse) * 0.8;
        p.y -= 0.6 + p.radius * 0.2;
        if (p.y < -10) {
          p.y = this.height + 10;
          p.x = Math.random() * this.width;
        }
      } else if (this.mode === 'officer') {
        // Gentle spring pull to grid with subtle hover float
        const fx = p.targetX + Math.sin(this.time * 2 + idx) * 4;
        const fy = p.targetY + Math.cos(this.time * 2 + idx) * 4;
        p.x += (fx - p.x) * 0.06;
        p.y += (fy - p.y) * 0.06;
      } else if (this.mode === 'admin') {
        // Slow rotation around the center
        const dx = p.targetX - cx;
        const dy = p.targetY - cy;
        const currentDist = Math.hypot(dx, dy);
        const currentAngle = Math.atan2(dy, dx) + 0.008;
        
        p.targetX = cx + Math.cos(currentAngle) * currentDist;
        p.targetY = cy + Math.sin(currentAngle) * currentDist;

        p.x += (p.targetX - p.x) * 0.06;
        p.y += (p.targetY - p.y) * 0.06;
      }

      // Mouse Proximity Repulsion
      const mDist = Math.hypot(p.x - this.mouse.x, p.y - this.mouse.y);
      if (mDist < this.mouse.radius && mDist > 0) {
        const force = (1 - mDist / this.mouse.radius) * 6;
        const angle = Math.atan2(p.y - this.mouse.y, p.x - this.mouse.x);
        p.x += Math.cos(angle) * force;
        p.y += Math.sin(angle) * force;
      }

      // Shockwave impact
      if (this.shockwave.active) {
        const sDist = Math.hypot(p.x - this.shockwave.x, p.y - this.shockwave.y);
        const diff = Math.abs(sDist - this.shockwave.radius);
        if (diff < 40) {
          const sAngle = Math.atan2(p.y - this.shockwave.y, p.x - this.shockwave.x);
          const push = (1 - diff / 40) * 16 * this.shockwave.strength;
          p.x += Math.cos(sAngle) * push;
          p.y += Math.sin(sAngle) * push;
        }
      }
    });
  }

  draw() {
    // Laser lines in Officer Matrix Mode
    if (this.mode === 'officer') {
      this.ctx.lineWidth = 0.5;
      for (let i = 0; i < this.particles.length; i++) {
        for (let j = i + 1; j < this.particles.length; j++) {
          const p1 = this.particles[i];
          const p2 = this.particles[j];
          const dist = Math.hypot(p1.x - p2.x, p1.y - p2.y);
          if (dist < 75) {
            this.ctx.strokeStyle = `rgba(255, 87, 34, ${(1 - dist / 75) * 0.35})`;
            this.ctx.beginPath();
            this.ctx.moveTo(p1.x, p1.y);
            this.ctx.lineTo(p2.x, p2.y);
            this.ctx.stroke();
          }
        }
      }
    }

    // Concentric rings in Admin Mode
    if (this.mode === 'admin') {
      const cx = this.width / 2;
      const cy = this.height / 2;
      [100, 190, 290, 400].forEach(r => {
        this.ctx.strokeStyle = 'rgba(255, 145, 0, 0.08)';
        this.ctx.lineWidth = 1;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, r, 0, Math.PI * 2);
        this.ctx.stroke();
      });
    }

    // Draw Particles
    this.particles.forEach(p => {
      const alpha = p.alpha * (0.6 + 0.4 * Math.sin(p.pulse));
      this.ctx.fillStyle = p.color;
      this.ctx.globalAlpha = Math.max(0.1, Math.min(1, alpha));
      
      this.ctx.beginPath();
      this.ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      this.ctx.fill();

      // Glowing aura
      if (p.radius > 1.8) {
        this.ctx.fillStyle = p.color;
        this.ctx.globalAlpha = alpha * 0.25;
        this.ctx.beginPath();
        this.ctx.arc(p.x, p.y, p.radius * 2.8, 0, Math.PI * 2);
        this.ctx.fill();
      }
    });

    this.ctx.globalAlpha = 1;

    // Draw Shockwave ring if active
    if (this.shockwave.active) {
      this.ctx.strokeStyle = `rgba(255, 87, 34, ${this.shockwave.strength * 0.6})`;
      this.ctx.lineWidth = 2;
      this.ctx.beginPath();
      this.ctx.arc(this.shockwave.x, this.shockwave.y, this.shockwave.radius, 0, Math.PI * 2);
      this.ctx.stroke();
    }
  }
}

// ==============================================================================
// 3. INTERACTIVE CONSOLE & WORKFLOW CONTROLLER
// ==============================================================================
document.addEventListener('DOMContentLoaded', () => {
  // Initialize Canvas Engines
  const ribbonCanvas = document.getElementById('ribbon-canvas');
  const particleCanvas = document.getElementById('particle-canvas');
  
  let ribbonEngine = null;
  let particleEngine = null;

  if (ribbonCanvas) ribbonEngine = new MetallicRibbonEngine(ribbonCanvas);
  if (particleCanvas) particleEngine = new ParticleTransformationEngine(particleCanvas);

  function loop() {
    if (ribbonEngine) {
      ribbonEngine.update();
      ribbonEngine.draw();
    }
    if (particleEngine) {
      particleEngine.update();
      particleEngine.draw();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Initialize Lucide Icons if available
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Role Tab Switching & Visual Morphing
  const tabBtns = document.querySelectorAll('.role-tab-btn');
  const panels = document.querySelectorAll('.console-panel');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const role = btn.dataset.role;

      // Update Tab Styles
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Update Active Panel
      panels.forEach(p => {
        p.classList.remove('active');
        if (p.id === `panel-${role}`) p.classList.add('active');
      });

      // Morph Canvas Engines
      if (particleEngine) {
        particleEngine.setMode(role);
      }
      if (ribbonEngine) {
        if (role === 'applicant') {
          ribbonEngine.setAccent(255, 87, 34); // Orange
        } else if (role === 'officer') {
          ribbonEngine.setAccent(255, 23, 68); // Crimson Red
        } else if (role === 'admin') {
          ribbonEngine.setAccent(255, 171, 0); // Molten Gold
        }
      }

      // Re-trigger icon rendering for dynamic panel contents
      if (window.lucide) window.lucide.createIcons();
    });
  });

  // Query Real-Time Backend API Health Status
  const statusPill = document.getElementById('api-health-status');
  if (statusPill) {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => {
        if (data.status === 'UP') {
          statusPill.innerHTML = `<span class="pulse-dot"></span> Backend Active (v${data.version || '1.0.0'})`;
          statusPill.title = `Database: ${data.database || 'Active'} | Uptime: ${Math.floor(data.uptime)}s`;
        }
      })
      .catch(() => {
        statusPill.innerHTML = `<span class="pulse-dot" style="background:#f59e0b"></span> Local Standalone Mode`;
      });
  }

  // Document Vault Interactive Preview Modal
  const modalBackdrop = document.getElementById('cinema-doc-modal');
  const openModalBtns = document.querySelectorAll('.btn-open-doc-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');
  const modalTypeTabPdf = document.getElementById('tab-doc-pdf');
  const modalTypeTabImg = document.getElementById('tab-doc-img');
  const previewContainer = document.getElementById('modal-doc-viewer');

  function renderSampleDoc(type) {
    if (!previewContainer) return;
    if (type === 'pdf') {
      previewContainer.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:12px;filter:drop-shadow(0 0 20px rgba(255,23,68,0.5))">📄</div>
        <h4 style="font-family:var(--font-display);font-size:1.2rem;color:#fff;margin-bottom:6px">High_School_Transcript_2026.pdf</h4>
        <p style="font-size:0.85rem;color:var(--cinema-text-med);margin-bottom:16px">Certified Academic Record · 48 KB · application/pdf</p>
        <div style="display:inline-flex;gap:8px;padding:6px 14px;border-radius:9999px;background:rgba(39,201,63,0.1);border:1px solid rgba(39,201,63,0.3);color:#27c93f;font-size:0.78rem;font-weight:700">
          ✓ Verified by Admission Office
        </div>
      `;
    } else {
      previewContainer.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:12px;filter:drop-shadow(0 0 20px rgba(255,145,0,0.5))">🖼️</div>
        <h4 style="font-family:var(--font-display);font-size:1.2rem;color:#fff;margin-bottom:6px">Applicant_Passport_Photo.png</h4>
        <p style="font-size:0.85rem;color:var(--cinema-text-med);margin-bottom:16px">Biometric Identification · 70 KB · image/png</p>
        <div style="display:inline-flex;gap:8px;padding:6px 14px;border-radius:9999px;background:rgba(39,201,63,0.1);border:1px solid rgba(39,201,63,0.3);color:#27c93f;font-size:0.78rem;font-weight:700">
          ✓ Face Recognition & Format Validated
        </div>
      `;
    }
  }

  openModalBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (modalBackdrop) {
        modalBackdrop.classList.add('open');
        renderSampleDoc('pdf');
      }
    });
  });

  if (closeModalBtn && modalBackdrop) {
    closeModalBtn.addEventListener('click', () => modalBackdrop.classList.remove('open'));
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) modalBackdrop.classList.remove('open');
    });
  }

  if (modalTypeTabPdf && modalTypeTabImg) {
    modalTypeTabPdf.addEventListener('click', () => {
      modalTypeTabPdf.classList.add('active');
      modalTypeTabImg.classList.remove('active');
      renderSampleDoc('pdf');
    });
    modalTypeTabImg.addEventListener('click', () => {
      modalTypeTabImg.classList.add('active');
      modalTypeTabPdf.classList.remove('active');
      renderSampleDoc('png');
    });
  }
});
