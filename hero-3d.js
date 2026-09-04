(() => {
  const canvas = document.getElementById("heroCanvas");
  const stage = document.getElementById("heroStage");
  if (!canvas || !stage) return;

  const context = canvas.getContext("2d", { alpha: true });
  if (!context) return;

  const hero = stage.closest(".hero-immersive");
  const heroCopy = hero?.querySelector(".hero-copy");
  const art = stage.querySelector(".hero-path-art");
  const chapterNumber = document.getElementById("stageChapterNumber");
  const stagePoints = [...stage.querySelectorAll(".stage-point")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const sourceWidth = 1672;
  const sourceHeight = 942;
  const path = [
    [.87, .98], [.75, .91], [.61, .78], [.63, .66], [.77, .52],
    [.67, .40], [.48, .34], [.44, .29], [.54, .24], [.70, .19], [.61, .11]
  ];
  const milestones = [[.61, .73], [.67, .39], [.53, .25], [.61, .12]];

  let seed = 48271;
  const random = () => {
    seed = seed * 16807 % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const particles = Array.from({ length: 82 }, () => ({
    x: .32 + random() * .65,
    y: .06 + random() * .88,
    radius: .35 + random() * 1.15,
    speed: .16 + random() * .42,
    phase: random() * Math.PI * 2
  }));

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let targetScroll = 0;
  let scrollProgress = 0;
  let pointerX = 0;
  let pointerY = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let activeStage = -1;
  let lastFrame = 0;
  let elapsed = 0;
  let visible = true;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
  const ease = (value) => 1 - Math.pow(1 - clamp(value), 3);

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

  const imagePoint = ([x, y]) => {
    const coverScale = Math.max(width / sourceWidth, height / sourceHeight);
    const renderedWidth = sourceWidth * coverScale;
    const renderedHeight = sourceHeight * coverScale;
    return {
      x: (width - renderedWidth) / 2 + x * renderedWidth,
      y: (height - renderedHeight) / 2 + y * renderedHeight
    };
  };

  const pointOnPath = (progress) => {
    const scaled = clamp(progress) * (path.length - 1);
    const index = Math.min(path.length - 2, Math.floor(scaled));
    const local = scaled - index;
    const a = imagePoint(path[index]);
    const b = imagePoint(path[index + 1]);
    return { x: a.x + (b.x - a.x) * local, y: a.y + (b.y - a.y) * local };
  };

  const updateScrollTarget = () => {
    if (!hero) return;
    const heroTop = window.scrollY + hero.getBoundingClientRect().top;
    const copyOffset = window.innerWidth <= 940 ? (heroCopy?.offsetHeight || 0) : 0;
    const start = heroTop + copyOffset;
    const end = heroTop + hero.offsetHeight - window.innerHeight;
    targetScroll = clamp((window.scrollY - start) / Math.max(end - start, 1));
    if (reducedMotion) {
      scrollProgress = targetScroll;
      updateStory(scrollProgress);
      draw(performance.now(), true);
    }
  };

  const updateStory = (progress) => {
    const index = Math.min(stagePoints.length - 1, Math.floor(clamp(progress) * stagePoints.length));
    if (index !== activeStage) {
      stagePoints.forEach((point, pointIndex) => point.classList.toggle("is-active", pointIndex === index));
      activeStage = index;
      if (hero) hero.dataset.phase = String(index);
      if (chapterNumber) chapterNumber.textContent = String(index + 1).padStart(2, "0");
    }

    const cinematic = ease(progress);
    const compact = window.innerWidth < 700;
    const scale = 1.025 + cinematic * (compact ? .1 : .135);
    const x = (-cinematic * (compact ? 20 : 34)) + pointerX * (compact ? 0 : 10);
    const y = (cinematic * (compact ? 20 : 32)) + pointerY * (compact ? 0 : 8);
    const rotation = -.45 + cinematic * 1.25 + pointerX * .3;
    stage.style.setProperty("--path-x", `${x.toFixed(2)}px`);
    stage.style.setProperty("--path-y", `${y.toFixed(2)}px`);
    stage.style.setProperty("--path-scale", scale.toFixed(4));
    stage.style.setProperty("--path-rotate", `${rotation.toFixed(3)}deg`);
    hero?.style.setProperty("--hero-scroll", `${(progress * 100).toFixed(2)}%`);
  };

  const tracePath = () => {
    const drawTo = .16 + scrollProgress * .84;
    const samples = 120;
    context.save();
    context.globalCompositeOperation = "lighter";
    context.beginPath();
    for (let index = 0; index <= samples; index += 1) {
      const progress = index / samples * drawTo;
      const point = pointOnPath(progress);
      if (index === 0) context.moveTo(point.x, point.y);
      else context.lineTo(point.x, point.y);
    }
    const gradient = context.createLinearGradient(width * .5, height, width * .6, 0);
    gradient.addColorStop(0, "rgba(77, 142, 255, 0)");
    gradient.addColorStop(.35, "rgba(87, 159, 255, .12)");
    gradient.addColorStop(1, "rgba(173, 218, 255, .8)");
    context.strokeStyle = gradient;
    context.lineWidth = 1.15;
    context.shadowColor = "rgba(82, 159, 255, .9)";
    context.shadowBlur = 16;
    context.stroke();
    context.restore();
  };

  const drawMilestones = () => {
    milestones.forEach((sourcePoint, index) => {
      const point = imagePoint(sourcePoint);
      const active = index === activeStage;
      const pulse = active ? 1 + Math.sin(elapsed * 2.1) * .09 : 1;
      const radius = (index === 0 ? 32 : index === 1 ? 22 : 16) * pulse;
      const gradient = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius * 2.5);
      gradient.addColorStop(0, `rgba(224, 246, 255, ${active ? .32 : .07})`);
      gradient.addColorStop(.26, `rgba(82, 154, 255, ${active ? .2 : .035})`);
      gradient.addColorStop(1, "rgba(31, 103, 240, 0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(point.x, point.y, radius * 2.5, 0, Math.PI * 2);
      context.fill();
      if (active) {
        context.strokeStyle = "rgba(184, 224, 255, .62)";
        context.lineWidth = 1;
        context.beginPath();
        context.arc(point.x, point.y, radius * (1.38 + Math.sin(elapsed * 1.7) * .12), 0, Math.PI * 2);
        context.stroke();
      }
    });
  };

  const drawTracker = () => {
    const tracker = pointOnPath(scrollProgress);
    const glow = context.createRadialGradient(tracker.x, tracker.y, 0, tracker.x, tracker.y, 36);
    glow.addColorStop(0, "rgba(255,255,255,.98)");
    glow.addColorStop(.09, "rgba(150,211,255,.95)");
    glow.addColorStop(.34, "rgba(63,139,255,.34)");
    glow.addColorStop(1, "rgba(40,108,244,0)");
    context.save();
    context.globalCompositeOperation = "lighter";
    context.fillStyle = glow;
    context.beginPath();
    context.arc(tracker.x, tracker.y, 36, 0, Math.PI * 2);
    context.fill();
    context.restore();
  };

  const drawParticles = () => {
    context.save();
    context.globalCompositeOperation = "lighter";
    const amount = window.innerWidth < 700 ? 42 : particles.length;
    for (let index = 0; index < amount; index += 1) {
      const particle = particles[index];
      const point = imagePoint([particle.x, particle.y]);
      const rise = ((elapsed * particle.speed + particle.phase) % 1) * 34;
      const alpha = .08 + (Math.sin(elapsed * .8 + particle.phase) + 1) * .055;
      context.fillStyle = `rgba(116, 180, 255, ${alpha})`;
      context.beginPath();
      context.arc(point.x + Math.sin(elapsed * .35 + particle.phase) * 5, point.y - rise, particle.radius, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  };

  const draw = (timestamp = 0, once = false) => {
    resize();
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .05) : 0;
    lastFrame = timestamp;
    if (!reducedMotion) elapsed += delta;
    pointerX += (targetPointerX - pointerX) * .065;
    pointerY += (targetPointerY - pointerY) * .065;
    scrollProgress += (targetScroll - scrollProgress) * .085;
    updateStory(scrollProgress);
    context.clearRect(0, 0, width, height);
    drawParticles();
    tracePath();
    drawMilestones();
    drawTracker();
    if (!once && !reducedMotion && visible) requestAnimationFrame(draw);
  };

  stage.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch") return;
    const bounds = stage.getBoundingClientRect();
    targetPointerX = (event.clientX - bounds.left) / bounds.width - .5;
    targetPointerY = (event.clientY - bounds.top) / bounds.height - .5;
  }, { passive: true });
  stage.addEventListener("pointerleave", () => {
    targetPointerX = 0;
    targetPointerY = 0;
  });

  const observer = new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (visible && !wasVisible && !reducedMotion) {
      lastFrame = performance.now();
      requestAnimationFrame(draw);
    }
  }, { rootMargin: "120px" });
  observer.observe(stage);
  window.addEventListener("resize", () => {
    resize();
    updateScrollTarget();
  }, { passive: true });
  window.addEventListener("scroll", updateScrollTarget, { passive: true });
  art?.addEventListener("load", resize, { once: true });
  updateScrollTarget();
  updateStory(0);
  resize();
  requestAnimationFrame(draw);
})();
