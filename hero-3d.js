(() => {
  const canvas = document.getElementById("heroCanvas");
  const stage = document.getElementById("heroStage");
  if (!canvas || !stage) return;

  const hero = stage.closest(".hero-immersive");
  const heroCopy = hero?.querySelector(".hero-copy");
  const chapterNumber = document.getElementById("stageChapterNumber");
  const stagePoints = [...stage.querySelectorAll(".project-track .stage-point")];
  const panels = [...stage.querySelectorAll("[data-scene-panel]")];
  const context = canvas.getContext("2d", { alpha: false, desynchronized: true });
  if (!hero || !context) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const ease = value => 1 - Math.pow(1 - clamp(value), 3);
  const profiles = [
    { x: -46, y: -35, z: -90, r: -7 },
    { x: 48, y: -54, z: 70, r: 5 },
    { x: -62, y: 24, z: 20, r: -5 },
    { x: 66, y: -16, z: 105, r: 4 },
    { x: -48, y: 42, z: 65, r: 5 },
    { x: 36, y: 50, z: -20, r: -4 },
    { x: 74, y: 36, z: 45, r: 6 },
    { x: 8, y: -62, z: -55, r: -5 }
  ];
  const particleSeed = Array.from({ length: 130 }, (_, index) => ({
    x: ((index * 47) % 131) / 131,
    y: ((index * 83) % 137) / 137,
    depth: .25 + ((index * 29) % 71) / 71,
    drift: ((index * 13) % 17) / 17,
    size: index % 11 === 0 ? 1.8 : index % 5 === 0 ? 1.2 : .7
  }));

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let targetProgress = 0;
  let progress = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let activePhase = -1;
  let lastTime = 0;
  let elapsed = 0;
  let visible = true;
  let animationFrame = 0;

  const isMobile = () => window.innerWidth <= 940;

  const resize = () => {
    width = Math.max(1, stage.clientWidth);
    height = Math.max(1, stage.clientHeight);
    pixelRatio = Math.min(window.devicePixelRatio || 1, isMobile() ? 1.25 : 1.55);
    const renderWidth = Math.round(width * pixelRatio);
    const renderHeight = Math.round(height * pixelRatio);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  };

  const updateProgressTarget = () => {
    const heroTop = window.scrollY + hero.getBoundingClientRect().top;
    const mobileOffset = isMobile() ? (heroCopy?.offsetHeight || window.innerHeight) : 0;
    const start = heroTop + mobileOffset;
    const end = heroTop + hero.offsetHeight - window.innerHeight;
    targetProgress = clamp((window.scrollY - start) / Math.max(end - start, 1));
    if (reducedMotion.matches) {
      progress = targetProgress;
      updateScene(performance.now());
      draw();
    }
  };

  const updatePhase = () => {
    const nextPhase = Math.min(3, Math.floor(clamp(progress) * 4));
    if (nextPhase === activePhase) return;
    activePhase = nextPhase;
    hero.dataset.phase = String(activePhase);
    stagePoints.forEach((point, index) => point.classList.toggle("is-active", index === activePhase));
    panels.forEach(panel => panel.classList.toggle("is-current", Number(panel.dataset.scenePhase) === activePhase));
    if (chapterNumber) chapterNumber.textContent = String(activePhase + 1).padStart(2, "0");
  };

  const updatePanels = () => {
    const assembled = ease(progress * 1.04);
    const scatter = 1 - assembled;
    const mobileScale = window.innerWidth <= 700 ? .58 : isMobile() ? .76 : 1;
    panels.forEach((panel, index) => {
      const profile = profiles[index] || profiles[0];
      const panelPhase = Number(panel.dataset.scenePhase || 0);
      const phaseDistance = Math.abs(progress * 3 - panelPhase);
      const focus = 1 - clamp(phaseDistance / .9);
      const driftX = Math.sin(elapsed * .24 + index * 1.37) * (4 + scatter * 8);
      const driftY = Math.cos(elapsed * .2 + index * .91) * (3 + scatter * 6);
      const x = (profile.x * scatter + driftX + pointerX * (9 + index % 3 * 4)) * mobileScale;
      const y = (profile.y * scatter + driftY + pointerY * (7 + index % 2 * 5)) * mobileScale;
      const z = profile.z * scatter + focus * 42;
      const rotateX = pointerY * -2.8 + Math.sin(index) * scatter * 2.2;
      const rotateY = pointerX * 4.2 + profile.r * scatter;
      const rotateZ = profile.r * scatter * .62;
      const scale = .9 + assembled * .1 + focus * .045;
      panel.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, ${z.toFixed(2)}px) rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg) rotateZ(${rotateZ.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      panel.style.opacity = String(.46 + assembled * .14 + focus * .4);
    });
  };

  const updateScene = timestamp => {
    const delta = lastTime ? Math.min((timestamp - lastTime) / 1000, .05) : 0;
    lastTime = timestamp;
    if (!reducedMotion.matches) elapsed += delta;
    progress += (targetProgress - progress) * (reducedMotion.matches ? 1 : .075);
    pointerX += (targetPointerX - pointerX) * .065;
    pointerY += (targetPointerY - pointerY) * .065;
    hero.style.setProperty("--hero-progress", progress.toFixed(4));
    updatePhase();
    updatePanels();
  };

  const drawBackdrop = () => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#030b17");
    gradient.addColorStop(.54, "#061324");
    gradient.addColorStop(1, "#081b31");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const halo = context.createRadialGradient(width * .67, height * .48, 0, width * .67, height * .48, Math.max(width, height) * .56);
    halo.addColorStop(0, `rgba(44, 103, 241, ${.13 + progress * .07})`);
    halo.addColorStop(.42, "rgba(20, 65, 145, .065)");
    halo.addColorStop(1, "rgba(2, 7, 17, 0)");
    context.fillStyle = halo;
    context.fillRect(0, 0, width, height);
  };

  const drawGrid = () => {
    const grid = isMobile() ? 56 : 76;
    context.save();
    context.lineWidth = .55;
    context.strokeStyle = "rgba(110, 158, 220, .075)";
    const offsetX = (pointerX * 18 + elapsed * 1.5) % grid;
    const offsetY = (pointerY * 14) % grid;
    for (let x = offsetX; x < width; x += grid) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
    for (let y = offsetY; y < height; y += grid) {
      context.beginPath();
      context.moveTo(0, y);
      context.lineTo(width, y);
      context.stroke();
    }
    context.restore();
  };

  const drawParticles = () => {
    const count = isMobile() ? 82 : particleSeed.length;
    context.save();
    for (let index = 0; index < count; index += 1) {
      const particle = particleSeed[index];
      const drift = Math.sin(elapsed * (.08 + particle.drift * .08) + index) * 11;
      const x = (particle.x * width + drift + pointerX * 28 * particle.depth + progress * width * .035 * particle.depth) % width;
      const y = particle.y * height + Math.cos(elapsed * .11 + index * .7) * 6 + pointerY * 18 * particle.depth;
      const alpha = .08 + particle.depth * .24;
      context.fillStyle = `rgba(105, 160, 255, ${alpha})`;
      context.fillRect(x, y, particle.size, particle.size);
    }
    context.restore();
  };

  const drawContours = () => {
    const lineCount = isMobile() ? 18 : 27;
    context.save();
    context.lineWidth = .7;
    for (let line = 0; line < lineCount; line += 1) {
      const depth = line / lineCount;
      context.beginPath();
      for (let x = -20; x <= width + 20; x += 13) {
        const normalized = x / Math.max(width, 1);
        const ridge = Math.sin(normalized * 8.2 + line * .31 + progress * 1.8) * (25 + depth * 35);
        const detail = Math.sin(normalized * 21 - line * .18 + elapsed * .035) * (5 + depth * 7);
        const valley = Math.exp(-Math.pow(normalized - .63, 2) * 9) * (-64 - progress * 25);
        const y = height * (.67 + depth * .016) + ridge + detail + valley + pointerY * 10 * depth;
        if (x === -20) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.strokeStyle = `rgba(86, 137, 211, ${.045 + depth * .12})`;
      context.stroke();
    }
    context.restore();
  };

  const routePoint = amount => {
    const t = clamp(amount);
    const mt = 1 - t;
    const start = { x: width * .06, y: height * .77 };
    const c1 = { x: width * .3, y: height * (.72 - pointerY * .02) };
    const c2 = { x: width * .7, y: height * (.77 - progress * .19) };
    const end = { x: width * .92, y: height * (.43 - progress * .08) };
    return {
      x: mt * mt * mt * start.x + 3 * mt * mt * t * c1.x + 3 * mt * t * t * c2.x + t * t * t * end.x,
      y: mt * mt * mt * start.y + 3 * mt * mt * t * c1.y + 3 * mt * t * t * c2.y + t * t * t * end.y
    };
  };

  const drawRoute = () => {
    const start = routePoint(0);
    const controlOne = { x: width * .3, y: height * (.72 - pointerY * .02) };
    const controlTwo = { x: width * .7, y: height * (.77 - progress * .19) };
    const end = routePoint(1);
    context.save();
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.bezierCurveTo(controlOne.x, controlOne.y, controlTwo.x, controlTwo.y, end.x, end.y);
    context.strokeStyle = "rgba(40, 94, 210, .28)";
    context.lineWidth = 8;
    context.shadowColor = "rgba(43, 105, 255, .58)";
    context.shadowBlur = 22;
    context.stroke();

    context.beginPath();
    context.moveTo(start.x, start.y);
    context.bezierCurveTo(controlOne.x, controlOne.y, controlTwo.x, controlTwo.y, end.x, end.y);
    context.strokeStyle = "rgba(133, 177, 255, .94)";
    context.lineWidth = 1.7;
    context.setLineDash([5 + progress * 24, 4]);
    context.lineDashOffset = -elapsed * 22;
    context.stroke();
    context.setLineDash([]);

    const activeAmount = clamp((progress * 3 - Math.floor(progress * 3)) * .22 + (Math.floor(progress * 3) / 3), 0, 1);
    const tracker = routePoint(activeAmount);
    const trackerGlow = context.createRadialGradient(tracker.x, tracker.y, 0, tracker.x, tracker.y, 28);
    trackerGlow.addColorStop(0, "rgba(235, 244, 255, 1)");
    trackerGlow.addColorStop(.14, "rgba(105, 158, 255, .9)");
    trackerGlow.addColorStop(1, "rgba(53, 109, 255, 0)");
    context.fillStyle = trackerGlow;
    context.beginPath();
    context.arc(tracker.x, tracker.y, 28, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawConnections = () => {
    const anchors = [[.17, .27], [.62, .22], [.28, .42], [.84, .36], [.19, .58], [.61, .62], [.86, .67], [.54, .42]];
    context.save();
    context.lineWidth = .65;
    anchors.forEach((anchor, index) => {
      const panelPhase = Number(panels[index]?.dataset.scenePhase || 0);
      const focus = 1 - clamp(Math.abs(progress * 3 - panelPhase) / 1.05);
      const point = routePoint(.18 + index * .095);
      const x = width * anchor[0] + pointerX * (10 + index);
      const y = height * anchor[1] + pointerY * (8 + index * .5);
      context.beginPath();
      context.moveTo(x, y);
      context.quadraticCurveTo((x + point.x) * .53, y + (point.y - y) * .7, point.x, point.y);
      context.strokeStyle = `rgba(91, 151, 255, ${.09 + focus * .28})`;
      context.shadowColor = "rgba(53, 109, 255, .35)";
      context.shadowBlur = focus * 9;
      context.stroke();
    });
    context.restore();
  };

  const draw = () => {
    resize();
    drawBackdrop();
    drawGrid();
    drawParticles();
    drawContours();
    drawConnections();
    drawRoute();
  };

  const render = timestamp => {
    updateScene(timestamp);
    draw();
    if (!reducedMotion.matches && visible) animationFrame = requestAnimationFrame(render);
  };

  stage.addEventListener("pointermove", event => {
    if (event.pointerType === "touch" || reducedMotion.matches) return;
    const bounds = stage.getBoundingClientRect();
    targetPointerX = clamp((event.clientX - bounds.left) / bounds.width - .5, -.5, .5);
    targetPointerY = clamp((event.clientY - bounds.top) / bounds.height - .5, -.5, .5) * -1;
  }, { passive: true });
  stage.addEventListener("pointerleave", () => {
    targetPointerX = 0;
    targetPointerY = 0;
  });

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (visible && !wasVisible && !reducedMotion.matches) {
      cancelAnimationFrame(animationFrame);
      lastTime = performance.now();
      animationFrame = requestAnimationFrame(render);
    }
  }, { rootMargin: "160px" });

  window.addEventListener("scroll", updateProgressTarget, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    updateProgressTarget();
  }, { passive: true });
  reducedMotion.addEventListener?.("change", () => window.location.reload());

  stage.dataset.renderer = "canvas-2d";
  visibilityObserver.observe(stage);
  resize();
  updateProgressTarget();
  updatePhase();
  updatePanels();
  animationFrame = requestAnimationFrame(render);
})();
