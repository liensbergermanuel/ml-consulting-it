(() => {
  let canvas = document.getElementById("heroCanvas");
  const stage = document.getElementById("heroStage");
  if (!canvas || !stage) return;

  const hero = stage.closest(".hero-immersive");
  const heroCopy = hero?.querySelector(".hero-copy");
  const chapterNumber = document.getElementById("stageChapterNumber");
  const stagePoints = [...stage.querySelectorAll(".stage-point")];
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let width = 1;
  let height = 1;
  let pixelRatio = 1;
  let targetScroll = 0;
  let scrollProgress = 0;
  let targetPointerX = 0;
  let targetPointerY = 0;
  let pointerX = 0;
  let pointerY = 0;
  let activeStage = -1;
  let elapsed = 0;
  let lastFrame = 0;
  let visible = true;
  let gl = null;
  let fallbackContext = null;
  let webglProgram = null;
  let uniforms = null;

  const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

  const vertexShaderSource = `#version 300 es
    in vec2 aPosition;
    void main() {
      gl_Position = vec4(aPosition, 0.0, 1.0);
    }
  `;

  const fragmentShaderSource = `#version 300 es
    precision highp float;
    out vec4 fragColor;
    uniform vec2 uResolution;
    uniform vec2 uPointer;
    uniform float uTime;
    uniform float uScroll;

    mat2 rotate2d(float angle) {
      float c = cos(angle);
      float s = sin(angle);
      return mat2(c, -s, s, c);
    }

    float sdRoundBox(vec3 point, vec3 bounds, float radius) {
      vec3 q = abs(point) - bounds + radius;
      return min(max(q.x, max(q.y, q.z)), 0.0) + length(max(q, 0.0)) - radius;
    }

    float sdTorus(vec3 point, vec2 torus) {
      vec2 q = vec2(length(point.xz) - torus.x, point.y);
      return length(q) - torus.y;
    }

    vec2 closer(vec2 current, float distanceValue, float materialId) {
      return distanceValue < current.x ? vec2(distanceValue, materialId) : current;
    }

    vec2 mapScene(vec3 point) {
      vec2 result = vec2(20.0, 0.0);

      vec3 core = point;
      core.xz = rotate2d(-0.08 + uScroll * 0.12) * core.xz;
      result = closer(result, sdRoundBox(core, vec3(0.25, 1.28, 0.19), 0.055), 1.0);

      float phase = uScroll * 3.0;
      for (int index = 0; index < 4; index++) {
        float fi = float(index);
        vec3 ring = point;
        float reveal = smoothstep(-0.15, 0.9, phase - fi + 0.72);
        float spread = 1.0 - reveal;
        float ringY = -0.95 + fi * 0.64;
        ring -= vec3(
          sin(fi * 1.91 + 0.6) * spread * 0.58,
          ringY + cos(fi * 1.47) * spread * 0.16,
          cos(fi * 1.63 + 0.4) * spread * 0.42
        );
        ring.yz = rotate2d(0.42 + fi * 0.18 + uScroll * 0.26) * ring.yz;
        ring.xy = rotate2d(-0.32 + fi * 0.2 + sin(uTime * 0.18 + fi) * 0.025) * ring.xy;
        float radius = 0.78 + fi * 0.055;
        result = closer(result, sdTorus(ring, vec2(radius, 0.057)), 2.0 + fi);
      }

      vec3 seal = point - vec3(0.0, 1.44, 0.0);
      result = closer(result, length(seal) - 0.105, 6.0);

      float floorDistance = point.y + 1.58;
      result = closer(result, floorDistance, 9.0);
      return result;
    }

    vec3 sceneNormal(vec3 point) {
      vec2 epsilon = vec2(0.0015, 0.0);
      float center = mapScene(point).x;
      return normalize(vec3(
        mapScene(point + epsilon.xyy).x - center,
        mapScene(point + epsilon.yxy).x - center,
        mapScene(point + epsilon.yyx).x - center
      ));
    }

    float softShadow(vec3 origin, vec3 direction) {
      float shade = 1.0;
      float travel = 0.025;
      for (int index = 0; index < 30; index++) {
        float distanceValue = mapScene(origin + direction * travel).x;
        shade = min(shade, 16.0 * distanceValue / travel);
        travel += clamp(distanceValue, 0.018, 0.18);
        if (travel > 4.8) break;
      }
      return clamp(shade, 0.16, 1.0);
    }

    vec3 background(vec2 uv) {
      float halo = exp(-1.7 * dot(uv - vec2(0.12, 0.02), uv - vec2(0.12, 0.02)));
      float vignette = smoothstep(1.45, 0.2, length(uv * vec2(0.72, 1.0)));
      vec3 color = vec3(0.007, 0.009, 0.012);
      color += vec3(0.032, 0.037, 0.044) * halo;
      color += vec3(0.014, 0.012, 0.009) * vignette;
      float grain = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
      color += (grain - 0.5) * 0.012;
      return color;
    }

    void main() {
      vec2 uv = (gl_FragCoord.xy * 2.0 - uResolution.xy) / uResolution.y;
      uv.x -= 0.08;
      float cameraAngle = -0.62 + uScroll * 0.92 + uPointer.x * 0.18 + sin(uTime * 0.12) * 0.022;
      float cameraRadius = 4.2 - uScroll * 0.48;
      vec3 camera = vec3(sin(cameraAngle) * cameraRadius, 0.06 + uPointer.y * 0.25, cos(cameraAngle) * cameraRadius);
      vec3 target = vec3(0.0, -0.03, 0.0);
      vec3 forward = normalize(target - camera);
      vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
      vec3 up = cross(right, forward);
      vec3 ray = normalize(forward * 1.8 + right * uv.x + up * uv.y);

      vec3 color = background(uv);
      float travel = 0.0;
      float material = 0.0;
      float distanceValue = 0.0;
      float glow = 0.0;

      for (int index = 0; index < 92; index++) {
        vec3 point = camera + ray * travel;
        vec2 scene = mapScene(point);
        distanceValue = scene.x;
        material = scene.y;
        glow += exp(-22.0 * abs(distanceValue)) * 0.0024;
        if (abs(distanceValue) < 0.0015 || travel > 10.0) break;
        travel += distanceValue * 0.78;
      }

      if (travel < 10.0) {
        vec3 point = camera + ray * travel;
        vec3 normal = sceneNormal(point);
        vec3 lightDirection = normalize(vec3(-0.62, 0.84, 0.4));
        vec3 coolLight = normalize(vec3(0.7, 0.18, -0.55));
        float shadow = softShadow(point + normal * 0.006, lightDirection);
        float diffuse = max(dot(normal, lightDirection), 0.0) * shadow;
        float secondary = max(dot(normal, coolLight), 0.0);
        vec3 halfVector = normalize(lightDirection - ray);
        float specular = pow(max(dot(normal, halfVector), 0.0), 90.0) * shadow;
        float fresnel = pow(clamp(1.0 + dot(normal, ray), 0.0, 1.0), 4.0);

        vec3 graphite = vec3(0.055, 0.063, 0.071);
        vec3 titanium = vec3(0.22, 0.235, 0.25);
        vec3 champagne = vec3(0.74, 0.58, 0.34);
        vec3 ivory = vec3(0.9, 0.84, 0.7);
        vec3 base = graphite;
        float metallic = 1.0;

        if (material > 1.5 && material < 5.8) {
          float ringIndex = floor(material - 2.0 + 0.5);
          float focus = 1.0 - smoothstep(0.24, 0.9, abs(uScroll * 3.0 - ringIndex));
          base = mix(titanium, champagne, 0.24 + focus * 0.76);
        } else if (material > 5.8 && material < 7.0) {
          base = ivory;
        } else if (material > 8.0) {
          base = vec3(0.008, 0.01, 0.013);
          metallic = 0.2;
        }

        color = base * (0.16 + diffuse * 0.88);
        color += vec3(0.2, 0.31, 0.42) * secondary * 0.17;
        color += ivory * specular * (0.5 + metallic * 1.3);
        color += mix(vec3(0.11, 0.15, 0.2), champagne, 0.32) * fresnel * 0.78;

        if (material > 8.0) {
          float grid = smoothstep(0.975, 1.0, cos(point.x * 5.0) * cos(point.z * 5.0));
          color += vec3(0.19, 0.16, 0.11) * grid * 0.06;
          color *= 0.72 + shadow * 0.28;
        }

        float fog = 1.0 - exp(-travel * travel * 0.012);
        color = mix(color, background(uv), fog);
      }

      color += vec3(0.49, 0.37, 0.2) * glow;
      color = pow(color, vec3(0.88));
      fragColor = vec4(color, 1.0);
    }
  `;

  const createShader = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader) || "Shader compilation failed");
    }
    return shader;
  };

  const initializeWebGL = () => {
    gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });
    if (!gl) return false;

    try {
      const vertexShader = createShader(gl.VERTEX_SHADER, vertexShaderSource);
      const fragmentShader = createShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
      webglProgram = gl.createProgram();
      gl.attachShader(webglProgram, vertexShader);
      gl.attachShader(webglProgram, fragmentShader);
      gl.linkProgram(webglProgram);
      if (!gl.getProgramParameter(webglProgram, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(webglProgram) || "Shader linking failed");
      }
      gl.useProgram(webglProgram);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(webglProgram, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = {
        resolution: gl.getUniformLocation(webglProgram, "uResolution"),
        pointer: gl.getUniformLocation(webglProgram, "uPointer"),
        time: gl.getUniformLocation(webglProgram, "uTime"),
        scroll: gl.getUniformLocation(webglProgram, "uScroll")
      };
      stage.dataset.renderer = "webgl";
      return true;
    } catch (error) {
      gl = null;
      return false;
    }
  };

  const initializeFallback = () => {
    if (gl) return;
    const replacement = canvas.cloneNode(false);
    canvas.replaceWith(replacement);
    canvas = replacement;
    fallbackContext = canvas.getContext("2d", { alpha: false });
    stage.dataset.renderer = "canvas";
  };

  const resize = () => {
    pixelRatio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.2 : 1.5);
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const renderWidth = Math.round(width * pixelRatio);
    const renderHeight = Math.round(height * pixelRatio);
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      canvas.width = renderWidth;
      canvas.height = renderHeight;
    }
    if (gl) gl.viewport(0, 0, renderWidth, renderHeight);
    if (fallbackContext) fallbackContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
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
      renderFrame(performance.now(), true);
    }
  };

  const updateStory = (progress) => {
    const nextStage = Math.min(stagePoints.length - 1, Math.floor(clamp(progress) * stagePoints.length));
    if (nextStage !== activeStage) {
      activeStage = nextStage;
      stagePoints.forEach((point, index) => point.classList.toggle("is-active", index === activeStage));
      if (hero) hero.dataset.phase = String(activeStage);
      if (chapterNumber) chapterNumber.textContent = String(activeStage + 1).padStart(2, "0");
    }
    hero?.style.setProperty("--hero-scroll", `${(progress * 100).toFixed(2)}%`);
  };

  const drawWebGL = () => {
    gl.useProgram(webglProgram);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.pointer, pointerX, pointerY);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.scroll, scrollProgress);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  const ringGeometry = (index, centerX, centerY, scale) => {
    const phase = scrollProgress * 3;
    const reveal = clamp((phase - index + .72) / 1.05);
    const spread = 1 - reveal;
    return {
      x: centerX + Math.sin(index * 1.91 + .6) * spread * scale * .32,
      y: centerY + (index - 1.5) * scale * .34 + Math.cos(index * 1.47) * spread * scale * .1,
      radiusX: scale * (.53 + index * .035),
      radiusY: scale * (.125 + index * .012),
      rotation: -.27 + index * .17 + scrollProgress * .26 + pointerX * .08
    };
  };

  const strokeRing = (ring, index, frontOnly = false) => {
    const context = fallbackContext;
    const focus = 1 - clamp(Math.abs(scrollProgress * 3 - index) / .82);
    const start = frontOnly ? 0 : Math.PI;
    const end = frontOnly ? Math.PI : Math.PI * 2;
    context.save();
    context.translate(ring.x, ring.y);
    context.rotate(ring.rotation);
    context.beginPath();
    context.ellipse(0, 0, ring.radiusX, ring.radiusY, 0, start, end);
    context.strokeStyle = "rgba(4, 6, 8, .92)";
    context.lineWidth = Math.max(8, ring.radiusY * .22);
    context.stroke();
    const gradient = context.createLinearGradient(-ring.radiusX, 0, ring.radiusX, 0);
    gradient.addColorStop(0, `rgba(86, 94, 102, ${.42 + focus * .12})`);
    gradient.addColorStop(.4, `rgba(${Math.round(142 + focus * 70)}, ${Math.round(135 + focus * 39)}, ${Math.round(115 - focus * 4)}, ${.72 + focus * .22})`);
    gradient.addColorStop(.62, `rgba(${Math.round(196 + focus * 28)}, ${Math.round(178 + focus * 12)}, ${Math.round(139 - focus * 8)}, ${.76 + focus * .2})`);
    gradient.addColorStop(1, "rgba(64, 72, 80, .48)");
    context.strokeStyle = gradient;
    context.lineWidth = Math.max(5, ring.radiusY * .13);
    context.shadowColor = focus > .4 ? "rgba(211, 178, 116, .32)" : "rgba(132, 151, 170, .13)";
    context.shadowBlur = focus > .4 ? 24 : 10;
    context.stroke();
    context.shadowBlur = 0;
    context.strokeStyle = `rgba(244, 231, 205, ${.12 + focus * .36})`;
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  };

  const drawFallback = () => {
    const context = fallbackContext;
    context.clearRect(0, 0, width, height);
    const background = context.createRadialGradient(width * .56, height * .44, 0, width * .56, height * .44, Math.max(width, height) * .72);
    background.addColorStop(0, "#181a1d");
    background.addColorStop(.42, "#090b0e");
    background.addColorStop(1, "#030405");
    context.fillStyle = background;
    context.fillRect(0, 0, width, height);

    const centerX = width * (window.innerWidth < 700 ? .53 : .55) + pointerX * 12;
    const centerY = height * .43 + pointerY * 9;
    const scale = Math.min(width, height) * (window.innerWidth < 700 ? .35 : .33);
    const rings = [0, 1, 2, 3].map(index => ringGeometry(index, centerX, centerY, scale));

    context.save();
    context.globalCompositeOperation = "lighter";
    for (let index = 0; index < 42; index += 1) {
      const angle = index * 2.399 + elapsed * .025;
      const radius = scale * (.7 + (index % 9) * .11);
      const x = centerX + Math.cos(angle) * radius;
      const y = centerY + Math.sin(angle) * radius * .42;
      context.fillStyle = `rgba(208, 182, 132, ${.025 + (index % 4) * .012})`;
      context.fillRect(x, y, 1, 1);
    }
    context.restore();

    rings.forEach((ring, index) => strokeRing(ring, index, false));

    const coreWidth = scale * .28;
    const coreTop = centerY - scale * .89;
    const coreBottom = centerY + scale * .89;
    const coreGradient = context.createLinearGradient(centerX - coreWidth, 0, centerX + coreWidth, 0);
    coreGradient.addColorStop(0, "#090b0e");
    coreGradient.addColorStop(.32, "#34383c");
    coreGradient.addColorStop(.48, "#77756d");
    coreGradient.addColorStop(.57, "#26292d");
    coreGradient.addColorStop(1, "#07090b");
    context.beginPath();
    context.moveTo(centerX - coreWidth * .58, coreTop + coreWidth * .22);
    context.lineTo(centerX, coreTop);
    context.lineTo(centerX + coreWidth * .58, coreTop + coreWidth * .22);
    context.lineTo(centerX + coreWidth * .72, coreBottom - coreWidth * .2);
    context.lineTo(centerX, coreBottom);
    context.lineTo(centerX - coreWidth * .72, coreBottom - coreWidth * .2);
    context.closePath();
    context.fillStyle = coreGradient;
    context.shadowColor = "rgba(0,0,0,.75)";
    context.shadowBlur = 42;
    context.fill();
    context.shadowBlur = 0;
    context.strokeStyle = "rgba(228, 213, 184, .28)";
    context.lineWidth = 1;
    context.stroke();

    rings.forEach((ring, index) => strokeRing(ring, index, true));

    const activeRing = rings[activeStage < 0 ? 0 : activeStage];
    const trackerAngle = elapsed * .3 + scrollProgress * Math.PI * 1.6;
    const trackerX = activeRing.x + Math.cos(trackerAngle) * activeRing.radiusX;
    const trackerY = activeRing.y + Math.sin(trackerAngle) * activeRing.radiusY;
    const tracker = context.createRadialGradient(trackerX, trackerY, 0, trackerX, trackerY, 26);
    tracker.addColorStop(0, "rgba(255, 244, 220, .96)");
    tracker.addColorStop(.18, "rgba(218, 181, 113, .58)");
    tracker.addColorStop(1, "rgba(195, 147, 68, 0)");
    context.fillStyle = tracker;
    context.beginPath();
    context.arc(trackerX, trackerY, 26, 0, Math.PI * 2);
    context.fill();

    const floor = context.createRadialGradient(centerX, coreBottom + scale * .12, 0, centerX, coreBottom + scale * .12, scale * .88);
    floor.addColorStop(0, "rgba(183, 145, 80, .1)");
    floor.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = floor;
    context.beginPath();
    context.ellipse(centerX, coreBottom + scale * .12, scale * .88, scale * .19, 0, 0, Math.PI * 2);
    context.fill();
  };

  const renderFrame = (timestamp = 0, once = false) => {
    resize();
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .05) : 0;
    lastFrame = timestamp;
    if (!reducedMotion) elapsed += delta;
    pointerX += (targetPointerX - pointerX) * .055;
    pointerY += (targetPointerY - pointerY) * .055;
    scrollProgress += (targetScroll - scrollProgress) * .08;
    updateStory(scrollProgress);
    if (gl) drawWebGL();
    else drawFallback();
    if (!once && !reducedMotion && visible) requestAnimationFrame(renderFrame);
  };

  stage.addEventListener("pointermove", event => {
    if (event.pointerType === "touch") return;
    const bounds = stage.getBoundingClientRect();
    targetPointerX = (event.clientX - bounds.left) / bounds.width - .5;
    targetPointerY = ((event.clientY - bounds.top) / bounds.height - .5) * -1;
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
      requestAnimationFrame(renderFrame);
    }
  }, { rootMargin: "120px" });

  if (!initializeWebGL()) initializeFallback();
  observer.observe(stage);
  window.addEventListener("scroll", updateScrollTarget, { passive: true });
  window.addEventListener("resize", () => {
    resize();
    updateScrollTarget();
  }, { passive: true });
  updateScrollTarget();
  updateStory(0);
  resize();
  requestAnimationFrame(renderFrame);
})();
