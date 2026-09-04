(() => {
  const canvas = document.getElementById("heroCanvas");
  const stage = document.getElementById("heroStage");
  if (!canvas || !stage) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    stage.classList.add("webgl-fallback");
    return;
  }

  const hero = stage.closest(".hero-immersive");
  const heroCopy = hero?.querySelector(".hero-copy");
  const stagePoints = [...stage.querySelectorAll(".stage-point")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
  ].map(([x, y, z]) => {
    const length = Math.hypot(x, y, z);
    return { x: x / length, y: y / length, z: z / length };
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  const edgeKeys = new Set();
  const edges = [];
  faces.forEach((face) => {
    for (let index = 0; index < 3; index += 1) {
      const a = face[index];
      const b = face[(index + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (!edgeKeys.has(key)) {
        edgeKeys.add(key);
        edges.push([a, b]);
      }
    }
  });

  const cube = [
    { x: -1, y: -1, z: -1 }, { x: 1, y: -1, z: -1 },
    { x: 1, y: 1, z: -1 }, { x: -1, y: 1, z: -1 },
    { x: -1, y: -1, z: 1 }, { x: 1, y: -1, z: 1 },
    { x: 1, y: 1, z: 1 }, { x: -1, y: 1, z: 1 }
  ];
  const cubeEdges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];

  let seed = 9327;
  const random = () => {
    seed = seed * 16807 % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const dust = Array.from({ length: 90 }, () => ({
    x: (random() - .5) * 8,
    y: (random() - .5) * 5.4,
    z: (random() - .5) * 4,
    size: .45 + random() * 1.15
  }));

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  let scrollProgress = 0;
  let targetScrollProgress = 0;
  let activeStage = -1;
  let lastFrame = 0;
  let elapsed = 0;
  let visible = true;

  const resize = () => {
    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.8);
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const targetWidth = Math.round(width * pixelRatio);
    const targetHeight = Math.round(height * pixelRatio);
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const rotate = (point, rotationX, rotationY, rotationZ) => {
    let { x, y, z } = point;
    const cx = Math.cos(rotationX), sx = Math.sin(rotationX);
    const cy = Math.cos(rotationY), sy = Math.sin(rotationY);
    const cz = Math.cos(rotationZ), sz = Math.sin(rotationZ);
    const y1 = y * cx - z * sx;
    const z1 = y * sx + z * cx;
    const x2 = x * cy + z1 * sy;
    const z2 = -x * sy + z1 * cy;
    return { x: x2 * cz - y1 * sz, y: x2 * sz + y1 * cz, z: z2 };
  };

  const transform = (point, options) => {
    const scaled = {
      x: point.x * (options.scaleX ?? options.scale ?? 1),
      y: point.y * (options.scaleY ?? options.scale ?? 1),
      z: point.z * (options.scaleZ ?? options.scale ?? 1)
    };
    const local = rotate(scaled, options.localX || 0, options.localY || 0, options.localZ || 0);
    const world = rotate(local, options.rotationX, options.rotationY, options.rotationZ);
    return { x: world.x + options.x, y: world.y + options.y, z: world.z };
  };

  const project = (point, camera, zoom, centerX, centerY) => {
    const depth = Math.max(1.2, camera - point.z);
    const perspective = camera / depth;
    return {
      x: centerX + point.x * zoom * perspective,
      y: centerY - point.y * zoom * perspective,
      depth,
      scale: perspective
    };
  };

  const updateScrollProgress = () => {
    if (!hero) return;
    const heroTop = window.scrollY + hero.getBoundingClientRect().top;
    const copyOffset = window.innerWidth <= 940 ? (heroCopy?.offsetHeight || 0) : 0;
    const start = heroTop + copyOffset;
    const end = heroTop + hero.offsetHeight - window.innerHeight;
    targetScrollProgress = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(end - start, 1)));
  };

  const updateStage = (progress) => {
    const index = Math.min(stagePoints.length - 1, Math.floor(progress * stagePoints.length));
    if (index !== activeStage) {
      stagePoints.forEach((point, pointIndex) => point.classList.toggle("is-active", pointIndex === index));
      activeStage = index;
      if (hero) hero.dataset.phase = String(index);
    }
    hero?.style.setProperty("--hero-scroll", `${(progress * 100).toFixed(2)}%`);
  };

  const drawLineLoop = (points, color, lineWidth) => {
    if (!points.length) return;
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.strokeStyle = color;
    context.lineWidth = lineWidth;
    context.shadowColor = color;
    context.shadowBlur = 7;
    context.stroke();
    context.shadowBlur = 0;
  };

  const drawRing = (scene, rotation, radius, color, lineWidth) => {
    const points = [];
    for (let index = 0; index < 112; index += 1) {
      const angle = index / 112 * Math.PI * 2;
      const point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, z: 0 };
      const world = transform(point, { ...scene, localX: rotation.x, localY: rotation.y, localZ: rotation.z });
      points.push(project(world, scene.camera, scene.zoom, scene.centerX, scene.centerY));
    }
    drawLineLoop(points, color, lineWidth);
  };

  const draw = (timestamp = 0) => {
    resize();
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .05) : 0;
    lastFrame = timestamp;
    if (!reducedMotion) elapsed += delta;
    pointerX += (targetX - pointerX) * .06;
    pointerY += (targetY - pointerY) * .06;
    scrollProgress += (targetScrollProgress - scrollProgress) * .085;
    updateStage(scrollProgress);
    context.clearRect(0, 0, width, height);

    const compact = window.innerWidth < 700;
    const arc = Math.sin(scrollProgress * Math.PI);
    const scene = {
      x: Math.sin(scrollProgress * Math.PI * 2) * .18,
      y: (compact ? -.05 : 0) + Math.cos(scrollProgress * Math.PI * 2) * .08,
      rotationX: -.12 + pointerY * .4 + scrollProgress * .9,
      rotationY: elapsed * .07 + pointerX * .65 + scrollProgress * Math.PI * 2.7,
      rotationZ: -.08 + scrollProgress * .42,
      camera: 6.8 - arc * .75,
      zoom: Math.min(width, height) * (compact ? .135 : .16),
      centerX: width * (compact ? .54 : .55),
      centerY: height * (compact ? .42 : .49)
    };

    context.save();
    context.globalCompositeOperation = "lighter";
    const particleCount = compact ? 50 : dust.length;
    for (let index = 0; index < particleCount; index += 1) {
      const particle = dust[index];
      const world = rotate(particle, 0, elapsed * .018 + scrollProgress * .7, 0);
      const screen = project(world, 8.2, scene.zoom * .76, scene.centerX, scene.centerY);
      const alpha = Math.max(.08, .34 - screen.depth * .025);
      context.fillStyle = `rgba(83, 143, 255, ${alpha})`;
      context.beginPath();
      context.arc(screen.x, screen.y, particle.size * screen.scale, 0, Math.PI * 2);
      context.fill();
    }
    const glowRadius = scene.zoom * (1.12 + arc * .2);
    const glow = context.createRadialGradient(scene.centerX, scene.centerY, 0, scene.centerX, scene.centerY, glowRadius);
    glow.addColorStop(0, "rgba(58, 122, 255, .22)");
    glow.addColorStop(.45, "rgba(38, 95, 218, .08)");
    glow.addColorStop(1, "rgba(15, 53, 120, 0)");
    context.fillStyle = glow;
    context.beginPath();
    context.arc(scene.centerX, scene.centerY, glowRadius, 0, Math.PI * 2);
    context.fill();
    context.restore();

    const coreScale = 1.14 + arc * .22 + scrollProgress * .14 + Math.sin(elapsed * 1.25) * .025;
    const transformed = vertices.map((point) => transform(point, { ...scene, scale: coreScale }));
    const projected = transformed.map((point) => project(point, scene.camera, scene.zoom, scene.centerX, scene.centerY));
    const sortedFaces = faces.map((face) => ({ face, z: face.reduce((sum, vertex) => sum + transformed[vertex].z, 0) / 3 })).sort((a, b) => a.z - b.z);
    sortedFaces.forEach(({ face, z }) => {
      const points = face.map((index) => projected[index]);
      context.beginPath();
      context.moveTo(points[0].x, points[0].y);
      context.lineTo(points[1].x, points[1].y);
      context.lineTo(points[2].x, points[2].y);
      context.closePath();
      const alpha = Math.max(.035, Math.min(.15, .055 + (z + 1.5) * .026));
      context.fillStyle = `rgba(44, 111, 255, ${alpha})`;
      context.fill();
    });

    context.lineWidth = compact ? 1.05 : 1.25;
    context.strokeStyle = "rgba(119, 170, 255, .78)";
    context.shadowColor = "rgba(62, 128, 255, .9)";
    context.shadowBlur = 9;
    edges.forEach(([a, b]) => {
      context.beginPath();
      context.moveTo(projected[a].x, projected[a].y);
      context.lineTo(projected[b].x, projected[b].y);
      context.stroke();
    });
    context.shadowBlur = 0;

    drawRing(scene, { x: 1.05 + scrollProgress * .65, y: 0, z: scrollProgress * 1.7 }, 1.88 + scrollProgress * .52, "rgba(72, 137, 255, .58)", 1.15);
    drawRing(scene, { x: 0, y: 1.1 + scrollProgress, z: -scrollProgress * 1.35 }, 2.15 + arc * .7, "rgba(93, 158, 255, .42)", 1);
    drawRing(scene, { x: .48 + scrollProgress * .85, y: .75, z: scrollProgress * 1.9 }, 2.48 - scrollProgress * .25, "rgba(83, 131, 218, .3)", .85);

    const cubeScale = 1.66 + scrollProgress * .42;
    const projectedCube = cube.map((point) => {
      const world = transform(point, { ...scene, scale: cubeScale, localX: -scrollProgress, localY: scrollProgress * 1.5 });
      return project(world, scene.camera, scene.zoom, scene.centerX, scene.centerY);
    });
    context.strokeStyle = "rgba(80, 139, 244, .22)";
    context.lineWidth = .8;
    cubeEdges.forEach(([a, b]) => {
      context.beginPath();
      context.moveTo(projectedCube[a].x, projectedCube[a].y);
      context.lineTo(projectedCube[b].x, projectedCube[b].y);
      context.stroke();
    });

    context.save();
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < 8; index += 1) {
      const angle = elapsed * .14 + scrollProgress * Math.PI * (1.7 + index * .035) + index * Math.PI / 4;
      const radius = (index % 2 ? 2.08 : 1.85) + scrollProgress * .58;
      const point = { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius * .72, z: Math.sin(angle * 1.7) * .52 };
      const screen = project(transform(point, { ...scene, scale: 1 }), scene.camera, scene.zoom, scene.centerX, scene.centerY);
      context.fillStyle = "rgba(100, 166, 255, .95)";
      context.shadowColor = "rgba(64, 132, 255, .95)";
      context.shadowBlur = 14;
      context.beginPath();
      context.arc(screen.x, screen.y, (compact ? 3.2 : 4.1) * screen.scale, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();

    if (!reducedMotion && visible) requestAnimationFrame(draw);
  };

  stage.addEventListener("pointermove", (event) => {
    const bounds = stage.getBoundingClientRect();
    targetX = ((event.clientX - bounds.left) / bounds.width - .5) * 1.15;
    targetY = ((event.clientY - bounds.top) / bounds.height - .5) * -1;
  }, { passive: true });
  stage.addEventListener("pointerleave", () => { targetX = 0; targetY = 0; });
  const observer = new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (visible && !wasVisible && !reducedMotion) {
      lastFrame = performance.now();
      requestAnimationFrame(draw);
    }
  }, { rootMargin: "100px" });
  observer.observe(stage);
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  updateScrollProgress();
  updateStage(0);
  resize();
  requestAnimationFrame(draw);
})();
