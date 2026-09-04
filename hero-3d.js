(() => {
  const canvas = document.getElementById("heroCanvas");
  const stage = document.getElementById("heroStage");
  if (!canvas || !stage) return;
  const hero = stage.closest(".hero-immersive");
  const heroCopy = hero?.querySelector(".hero-copy");
  const stagePoints = [...stage.querySelectorAll(".stage-point")];

  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    depth: true,
    powerPreference: "high-performance",
    premultipliedAlpha: false
  });
  if (!gl) {
    stage.classList.add("webgl-fallback");
    return;
  }

  const vertexSource = `
    attribute vec3 aPosition;
    uniform mat4 uMvp;
    uniform float uPointSize;
    varying float vDepth;
    void main() {
      vec4 projected = uMvp * vec4(aPosition, 1.0);
      gl_Position = projected;
      gl_PointSize = uPointSize;
      vDepth = clamp(1.2 - abs(projected.z / projected.w) * 0.38, 0.5, 1.0);
    }
  `;
  const fragmentSource = `
    precision mediump float;
    uniform vec4 uColor;
    uniform float uIsPoint;
    varying float vDepth;
    void main() {
      float alpha = uColor.a * vDepth;
      if (uIsPoint > 0.5) {
        vec2 center = gl_PointCoord - vec2(0.5);
        float distanceFromCenter = length(center);
        if (distanceFromCenter > 0.5) discard;
        alpha *= smoothstep(0.5, 0.08, distanceFromCenter);
      }
      gl_FragColor = vec4(uColor.rgb, alpha);
    }
  `;

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(shader));
    }
    return shader;
  };

  let program;
  try {
    program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  } catch (error) {
    stage.classList.add("webgl-fallback");
    return;
  }

  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const mvpLocation = gl.getUniformLocation(program, "uMvp");
  const colorLocation = gl.getUniformLocation(program, "uColor");
  const pointSizeLocation = gl.getUniformLocation(program, "uPointSize");
  const isPointLocation = gl.getUniformLocation(program, "uIsPoint");

  const identity = () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const multiply = (a, b) => {
    const out = new Float32Array(16);
    for (let column = 0; column < 4; column += 1) {
      for (let row = 0; row < 4; row += 1) {
        let value = 0;
        for (let k = 0; k < 4; k += 1) value += a[k * 4 + row] * b[column * 4 + k];
        out[column * 4 + row] = value;
      }
    }
    return out;
  };
  const compose = (...matrices) => matrices.reduce((result, matrix) => multiply(result, matrix), identity());
  const translation = (x, y, z) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, x, y, z, 1]);
  const scale = (x, y = x, z = x) => new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
  const rotateX = (angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
  };
  const rotateY = (angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
  };
  const rotateZ = (angle) => {
    const c = Math.cos(angle), s = Math.sin(angle);
    return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  };
  const perspective = (fieldOfView, aspect, near, far) => {
    const f = 1 / Math.tan(fieldOfView / 2);
    const nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };

  const makeBuffer = (values, usage = gl.STATIC_DRAW) => {
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(values), usage);
    return { buffer, count: values.length / 3 };
  };

  const phi = (1 + Math.sqrt(5)) / 2;
  const rawVertices = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1]
  ].map(([x, y, z]) => {
    const length = Math.hypot(x, y, z);
    return [x / length, y / length, z / length];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  const coreTriangles = [];
  const edgeSet = new Set();
  const coreEdges = [];
  faces.forEach((face) => {
    face.forEach((index) => coreTriangles.push(...rawVertices[index]));
    for (let i = 0; i < 3; i += 1) {
      const a = face[i], b = face[(i + 1) % 3];
      const key = a < b ? `${a}-${b}` : `${b}-${a}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);
      coreEdges.push(...rawVertices[a], ...rawVertices[b]);
    }
  });

  const circleValues = [];
  const circleSegments = 128;
  for (let i = 0; i < circleSegments; i += 1) {
    const angle = i / circleSegments * Math.PI * 2;
    circleValues.push(Math.cos(angle), Math.sin(angle), 0);
  }
  const cubeVertices = [
    [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
  ];
  const cubePairs = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const cubeLines = cubePairs.flatMap(([a, b]) => [...cubeVertices[a], ...cubeVertices[b]]);

  let randomSeed = 9241;
  const random = () => {
    randomSeed = (randomSeed * 16807) % 2147483647;
    return (randomSeed - 1) / 2147483646;
  };
  const dustValues = [];
  for (let i = 0; i < 110; i += 1) {
    dustValues.push((random() - .5) * 7.4, (random() - .5) * 5.1, (random() - .5) * 3.4);
  }

  const meshes = {
    coreTriangles: makeBuffer(coreTriangles),
    coreEdges: makeBuffer(coreEdges),
    circle: makeBuffer(circleValues),
    cube: makeBuffer(cubeLines),
    dust: makeBuffer(dustValues),
    nodes: makeBuffer(new Array(24).fill(0), gl.DYNAMIC_DRAW)
  };

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);

  let projection = identity();
  let pointerX = 0;
  let pointerY = 0;
  let targetX = 0;
  let targetY = 0;
  let visible = true;
  let lastFrame = 0;
  let elapsed = 0;
  let scrollProgress = 0;
  let targetScrollProgress = 0;
  let activeStage = -1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const updateScrollProgress = () => {
    if (!hero) return;
    const sectionTop = window.scrollY + hero.getBoundingClientRect().top;
    const copyOffset = window.innerWidth <= 940 ? (heroCopy?.offsetHeight || 0) : 0;
    const start = sectionTop + copyOffset;
    const end = sectionTop + hero.offsetHeight - window.innerHeight;
    targetScrollProgress = Math.max(0, Math.min(1, (window.scrollY - start) / Math.max(end - start, 1)));
  };

  const updateStage = (progress) => {
    const nextStage = Math.min(stagePoints.length - 1, Math.floor(progress * stagePoints.length));
    if (nextStage !== activeStage) {
      stagePoints.forEach((point, index) => point.classList.toggle("is-active", index === nextStage));
      activeStage = nextStage;
      if (hero) hero.dataset.phase = String(nextStage);
    }
    hero?.style.setProperty("--hero-scroll", `${(progress * 100).toFixed(2)}%`);
  };

  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, window.innerWidth < 700 ? 1.35 : 1.8);
    const width = Math.max(1, Math.round(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    projection = perspective(Math.PI / 3.1, width / height, .1, 50);
  };

  const draw = (mesh, mode, model, color, pointSize = 1) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buffer);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(mvpLocation, false, multiply(projection, model));
    gl.uniform4fv(colorLocation, color);
    gl.uniform1f(pointSizeLocation, pointSize);
    gl.uniform1f(isPointLocation, mode === gl.POINTS ? 1 : 0);
    gl.drawArrays(mode, 0, mesh.count);
  };

  const render = (timestamp = 0) => {
    resize();
    const delta = lastFrame ? Math.min((timestamp - lastFrame) / 1000, .05) : 0;
    lastFrame = timestamp;
    if (!reducedMotion) elapsed += delta;
    pointerX += (targetX - pointerX) * .055;
    pointerY += (targetY - pointerY) * .055;
    scrollProgress += (targetScrollProgress - scrollProgress) * .075;
    updateStage(scrollProgress);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    const compact = window.innerWidth < 700;
    const arc = Math.sin(scrollProgress * Math.PI);
    const sceneX = (compact ? .25 : .38) + Math.sin(scrollProgress * Math.PI * 2) * .22;
    const sceneY = (compact ? .62 : .05) + Math.cos(scrollProgress * Math.PI * 2) * .1;
    const sceneZ = (compact ? -6.25 : -6.0) + arc * .68;
    const base = compose(
      translation(sceneX, sceneY, sceneZ),
      rotateX(-.13 + pointerY * .38 + scrollProgress * .92),
      rotateY(elapsed * .08 + pointerX * .62 + scrollProgress * Math.PI * 2.65),
      rotateZ(-.08 + scrollProgress * .46)
    );

    gl.depthMask(false);
    draw(meshes.dust, gl.POINTS, compose(translation(0, 0, -7.2), rotateY(elapsed * .025 + scrollProgress * .8)), [.28, .52, 1, .34], compact ? 2.2 : 2.7);
    gl.depthMask(true);

    const pulse = 1 + Math.sin(elapsed * 1.35) * .035 + arc * .22 + scrollProgress * .12;
    gl.depthMask(false);
    draw(meshes.coreTriangles, gl.TRIANGLES, compose(base, rotateX(elapsed * .24), rotateY(elapsed * .34), scale(1.22 * pulse)), [.12, .39, 1, .13]);
    gl.depthMask(true);
    draw(meshes.coreEdges, gl.LINES, compose(base, rotateX(elapsed * .24), rotateY(elapsed * .34), scale(1.23 * pulse)), [.42, .67, 1, .78]);

    gl.depthMask(false);
    draw(meshes.circle, gl.LINE_LOOP, compose(base, rotateX(1.1 + scrollProgress * .7), rotateZ(elapsed * .12 + scrollProgress * 1.8), scale(1.92 + scrollProgress * .58)), [.22, .53, 1, .54]);
    draw(meshes.circle, gl.LINE_LOOP, compose(base, rotateY(1.15 + scrollProgress), rotateZ(-elapsed * .1 - scrollProgress * 1.4), scale(2.18 + arc * .82)), [.32, .64, 1, .37]);
    draw(meshes.circle, gl.LINE_LOOP, compose(base, rotateX(.48 + scrollProgress * .9), rotateY(.8), rotateZ(elapsed * .07 + scrollProgress * 2.1), scale(2.52 - scrollProgress * .28)), [.25, .46, .84, .22]);
    draw(meshes.cube, gl.LINES, compose(base, rotateX(-elapsed * .08 - scrollProgress * 1.1), rotateY(elapsed * .11 + scrollProgress * 1.7), scale(1.72 + scrollProgress * .48)), [.3, .56, 1, .22]);

    const nodes = [];
    for (let i = 0; i < 8; i += 1) {
      const angle = elapsed * (.16 + i * .006) + scrollProgress * Math.PI * (1.8 + i * .04) + i * Math.PI / 4;
      const radius = (i % 2 ? 2.14 : 1.9) + scrollProgress * .62;
      nodes.push(Math.cos(angle) * radius, Math.sin(angle) * radius * .72, Math.sin(angle * 1.7) * .55);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, meshes.nodes.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, new Float32Array(nodes));
    draw(meshes.nodes, gl.POINTS, base, [.42, .72, 1, .95], compact ? 8 : 10);
    gl.depthMask(true);

    if (!reducedMotion && visible) requestAnimationFrame(render);
  };

  stage.addEventListener("pointermove", (event) => {
    const bounds = stage.getBoundingClientRect();
    targetX = ((event.clientX - bounds.left) / bounds.width - .5) * 1.2;
    targetY = ((event.clientY - bounds.top) / bounds.height - .5) * -1.0;
  }, { passive: true });
  stage.addEventListener("pointerleave", () => {
    targetX = 0;
    targetY = 0;
  });

  const observer = new IntersectionObserver(([entry]) => {
    const wasVisible = visible;
    visible = entry.isIntersecting;
    if (visible && !wasVisible && !reducedMotion) {
      lastFrame = performance.now();
      requestAnimationFrame(render);
    }
  }, { rootMargin: "100px" });
  observer.observe(stage);
  window.addEventListener("resize", resize, { passive: true });
  window.addEventListener("scroll", updateScrollProgress, { passive: true });
  updateScrollProgress();
  updateStage(0);
  resize();
  requestAnimationFrame(render);
})();
