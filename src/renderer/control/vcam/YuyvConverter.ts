import { YUYV_FRAGMENT_SHADER, YUYV_VERTEX_SHADER, rgbaToYuyv } from '../../../render/yuyv';

/**
 * Converts a 1280×720 picture into packed YUYV for the virtual camera. Uses a WebGL2
 * shader (one texel per pixel pair, read back as exactly w×h×2 bytes); falls back to the
 * JS reference on a 2D canvas when WebGL2 is unavailable.
 */
export class YuyvConverter {
  readonly backend: 'webgl2' | 'js';
  private gl: WebGL2RenderingContext | null = null;
  private tex: WebGLTexture | null = null;
  private ctx2d: OffscreenCanvasRenderingContext2D | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
    forceJs = false,
  ) {
    if (!forceJs && this.initGl()) {
      this.backend = 'webgl2';
    } else {
      const c = new OffscreenCanvas(width, height);
      this.ctx2d = c.getContext('2d', { willReadFrequently: true });
      if (!this.ctx2d) throw new Error('No canvas available for the virtual camera.');
      this.backend = 'js';
    }
  }

  private initGl(): boolean {
    const canvas = new OffscreenCanvas(this.width / 2, this.height);
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
    });
    if (!gl) return false;
    const shader = (type: number, src: string) => {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    try {
      const prog = gl.createProgram() as WebGLProgram;
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, YUYV_VERTEX_SHADER));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, YUYV_FRAGMENT_SHADER));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'pos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
      gl.viewport(0, 0, this.width / 2, this.height);
      this.gl = gl;
      return true;
    } catch {
      return false;
    }
  }

  /** Converts `source` (drawn at width × height) into `out` (width × height × 2 bytes). */
  convert(source: CanvasImageSource, out: Uint8Array): void {
    const gl = this.gl;
    if (gl) {
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      // Row r of the read-back is gl_FragCoord.y = r, which sampled source row r (top first).
      gl.readPixels(0, 0, this.width / 2, this.height, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return;
    }
    const ctx = this.ctx2d as OffscreenCanvasRenderingContext2D;
    ctx.drawImage(source, 0, 0, this.width, this.height);
    rgbaToYuyv(ctx.getImageData(0, 0, this.width, this.height).data, this.width, this.height, out);
  }
}
