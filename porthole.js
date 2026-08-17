(async () => {
  /** @type {HTMLCanvasElement} */
  const canvas = document.getElementById('porthole-canvas');
  const gl = canvas.getContext('webgl2');
  if (!gl) {
    canvas.replaceWith(document.createTextNode('WebGL2 not supported.'));
    return;
  }

  const vertexSrc = `#version 300 es
void main() {
  vec2 pos = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

  const fragmentSrc = await fetch('portholes/checkerboard-mountains.frag').then((r) => r.text());

  function parsePBM(text) {
    const lines = text.replace(/#.*$/gm, '').trim().split('\n');
    console.log(lines);
    const magic = lines[0];
    if (magic !== 'P1') throw new Error(`Unsupported PBM format: ${magic}`);
    const width = parseInt(lines[1].split(' ')[0], 10);
    const height = parseInt(lines[1].split(' ')[1], 10);
    const rest = lines.slice(2).join('').replaceAll(/\s/g, '');
    const data = new Uint8Array(width * height);
    for (let p = 0; p < width * height; p++) {
      data[p] = rest[p] === '1' ? 255 : 0;
    }
    console.log(width, height, data)
    return { width, height, data };
  }

  const dither = parsePBM(await fetch('portholes/dither.pbm').then((r) => r.text()));

  function compile(type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
  }

  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error(gl.getProgramInfoLog(program));
  }
  gl.useProgram(program);

  const iResolution = gl.getUniformLocation(program, 'iResolution');
  const iTime = gl.getUniformLocation(program, 'iTime');
  const iMouse = gl.getUniformLocation(program, 'iMouse');
  const iBackground = gl.getUniformLocation(program, 'iBackground');
  const iForeground = gl.getUniformLocation(program, 'iForeground');

  const BACKGROUND_RGB = [244, 246, 239];
  const FOREGROUND_RGB = [138, 153, 102];

  gl.uniform3fv(iBackground, BACKGROUND_RGB.map((c) => c / 255));
  gl.uniform3fv(iForeground, FOREGROUND_RGB.map((c) => c / 255));

  const ditherTexture = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, ditherTexture);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, dither.width, dither.height, 0, gl.RED, gl.UNSIGNED_BYTE, dither.data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

  const iDither = gl.getUniformLocation(program, 'iDither');
  gl.uniform1i(iDither, 0);

  const PIXEL_SIZE = 2;

  const mouse = [0, 0, 0, 0];
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse[0] = ((e.clientX - rect.left) / rect.width) * canvas.width;
    mouse[1] = canvas.height - ((e.clientY - rect.top) / rect.height) * canvas.height;
  });

  function resize() {
    const width = Math.max(1, Math.round(canvas.clientWidth / PIXEL_SIZE));
    const height = Math.max(1, Math.round(canvas.clientHeight / PIXEL_SIZE));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }

  function frame(now) {
    resize();
    // Stable timestamp across page reloads. 
    // glsl 32 bit float doesn't handle the size of time since epoch well, so
    // mod by seconds in a day
    const ts = (Date.now() / 1000.0) % 86400;
    gl.uniform3f(iResolution, canvas.width, canvas.height, 1.0);
    gl.uniform1f(iTime, ts);
    gl.uniform4f(iMouse, mouse[0], mouse[1], mouse[2], mouse[3]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
