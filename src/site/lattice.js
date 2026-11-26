// Hero scene: a lattice of machines with payments travelling along its edges.
import * as THREE from 'three';

function dotTexture(soft) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(soft, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function startLattice(canvas) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    canvas.style.display = 'none';
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b0c0e, 6.6, 12.2);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0, 9);

  const g = new THREE.Group();
  scene.add(g);

  const N = 280, R = 2.6, pts = [];
  for (let i = 0; i < N; i++) {
    const y = 1 - (2 * (i + 0.5)) / N, r = Math.sqrt(1 - y * y), a = i * 2.399963;
    const rad = R * (i % 6 === 0 ? 0.58 : i % 11 === 0 ? 0.8 : 1);
    pts.push(new THREE.Vector3(Math.cos(a) * r * rad, y * rad, Math.sin(a) * r * rad));
  }
  const adj = pts.map(() => []), edges = [];
  pts.forEach((p, i) => {
    pts.map((q, j) => [p.distanceToSquared(q), j]).sort((a, b) => a[0] - b[0]).slice(1, 4).forEach(([, j]) => {
      if (!adj[i].includes(j)) { adj[i].push(j); adj[j].push(i); edges.push([i, j]); }
    });
  });

  g.add(new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(edges.flatMap(([a, b]) => [pts[a], pts[b]])),
    new THREE.LineBasicMaterial({ color: 0xf2efe8, transparent: true, opacity: 0.17 }),
  ));
  const tex = dotTexture(0.45);
  g.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts), new THREE.PointsMaterial({ color: 0xf2efe8, size: 0.075, map: tex, transparent: true, depthWrite: false })));
  const hubs = pts.filter((_, i) => i % 17 === 0);
  g.add(new THREE.Points(new THREE.BufferGeometry().setFromPoints(hubs), new THREE.PointsMaterial({ color: 0xffb224, size: 0.2, map: tex, transparent: true, depthWrite: false })));
  const ringGeo = new THREE.RingGeometry(0.17, 0.185, 40);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffb224, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const rings = hubs.map((p, i) => { const m = new THREE.Mesh(ringGeo, ringMat); m.position.copy(p); m.userData.ph = i * 1.7; g.add(m); return m; });

  const P = 90;
  const pulses = Array.from({ length: P }, () => {
    const a = Math.floor(Math.random() * N);
    return { a, b: adj[a][0], t: Math.random(), v: 0.5 + Math.random() * 0.9 };
  });
  const glow = dotTexture(0.08);
  const layer = (size, opacity) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(P * 3), 3));
    g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffb224, size, map: glow, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending })));
    return geo.attributes.position;
  };
  const layers = [[layer(0.34, 1), 0], [layer(0.22, 0.7), 0.1], [layer(0.15, 0.45), 0.2]];

  const ptr = { x: 0, y: 0, sx: 0, sy: 0 };
  window.addEventListener('pointermove', (e) => {
    ptr.x = (e.clientX / window.innerWidth) * 2 - 1;
    ptr.y = (e.clientY / window.innerHeight) * 2 - 1;
  });

  const base = new THREE.Vector3();
  function resize() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1, asp = w / h;
    renderer.setSize(w, h, false);
    camera.aspect = asp;
    camera.updateProjectionMatrix();
    if (asp > 1.15) { base.set(2.35, -0.1, 0); g.scale.setScalar(1); }
    else if (asp > 0.8) { base.set(1.2, 0.4, 0); g.scale.setScalar(0.8); }
    else { base.set(0.55, 1.4, 0); g.scale.setScalar(0.5); }
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  let visible = true;
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(canvas);

  const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const clock = new THREE.Clock();
  const v = new THREE.Vector3(), inv = new THREE.Quaternion();
  let last = 0;
  renderer.setAnimationLoop(() => {
    if (!visible) return;
    const t = still ? 12 : clock.getElapsedTime();
    const dt = Math.min(0.05, t - last); last = t;
    const sc = Math.min(1, window.scrollY / window.innerHeight);
    ptr.sx += (ptr.x - ptr.sx) * 0.05;
    ptr.sy += (ptr.y - ptr.sy) * 0.05;
    g.position.set(base.x, base.y + sc * 1.6, base.z - sc * 2.5);
    g.rotation.y = t * 0.07 + ptr.sx * 0.35 + sc * 1.2;
    g.rotation.x = 0.25 + ptr.sy * 0.2;
    inv.copy(g.quaternion).invert();
    rings.forEach((r) => {
      r.quaternion.copy(camera.quaternion).premultiply(inv);
      r.scale.setScalar(1 + 0.25 * Math.sin(t * 1.4 + r.userData.ph));
    });
    for (let i = 0; i < P; i++) {
      const p = pulses[i];
      p.t += dt * p.v;
      if (p.t >= 1) {
        const from = p.a; p.a = p.b;
        const opts = adj[p.a].filter((n) => n !== from);
        p.b = opts.length ? opts[Math.floor(Math.random() * opts.length)] : from;
        p.t = 0;
      }
      for (const [attr, lag] of layers) {
        v.lerpVectors(pts[p.a], pts[p.b], Math.max(0, p.t - lag));
        attr.setXYZ(i, v.x, v.y, v.z);
      }
    }
    layers.forEach(([attr]) => { attr.needsUpdate = true; });
    renderer.render(scene, camera);
  });
}
