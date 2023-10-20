// Creates the webgl context, shader program and attribute buffers
async function setupWebglContext() {
    const canvas = document.querySelector('canvas')
    const gl = canvas.getContext('webgl2')

    // Handle canvas resize
    const resizeObserver = new ResizeObserver(onCanvasResize)
    resizeObserver.observe(canvas, {box: 'content-box'})

    // Load shaders
    const vertexShaderSource = await fetchFile('shaders/splat_vertex.glsl')
    const fragmentShaderSource = await fetchFile('shaders/splat_fragment.glsl')

    // Create shader program
    const program = createProgram(gl, vertexShaderSource, fragmentShaderSource)

    const setupAttributeBuffer = (name, components) => {
        const location = gl.getAttribLocation(program, name)
        const buffer = gl.createBuffer()
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
        gl.enableVertexAttribArray(location)
        gl.vertexAttribPointer(location, components, gl.FLOAT, false, 0, 0)
        gl.vertexAttribDivisor(location, 1)
        return buffer
    }

    // Create attribute buffers
    const buffers = {
        color: setupAttributeBuffer('a_col', 3),
        center: setupAttributeBuffer('a_center', 3),
        opacity: setupAttributeBuffer('a_opacity', 1),
        // scale: setupAttributeBuffer('a_scale', 3),
        // rot: setupAttributeBuffer('a_rot', 4),
        covA: setupAttributeBuffer('a_covA', 3),
        covB: setupAttributeBuffer('a_covB', 3),
    }

    // Set correct blending
    gl.disable(gl.DEPTH_TEST)
	gl.enable(gl.BLEND)
	gl.blendFunc(gl.ONE_MINUS_DST_ALPHA, gl.ONE)

    return { glContext: gl, glProgram: program, buffers }
}

// https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html
function onCanvasResize(entries) {
    for (const entry of entries) {
        let width, height
        let dpr = window.devicePixelRatio

        if (entry.devicePixelContentBoxSize) {
            width = entry.devicePixelContentBoxSize[0].inlineSize
            height = entry.devicePixelContentBoxSize[0].blockSize
            dpr = 1
        } else if (entry.contentBoxSize) {
            if (entry.contentBoxSize[0]) {
                width = entry.contentBoxSize[0].inlineSize
                height = entry.contentBoxSize[0].blockSize
            } else {
                width = entry.contentBoxSize.inlineSize
                height = entry.contentBoxSize.blockSize
            }
        } else {
            width = entry.contentRect.width
            height = entry.contentRect.height
        }

        canvasSize = [width * dpr, height * dpr]
    }
    
    if (cam != null) requestRender()
}

// Create a program from a vertex and fragment shader
function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
    const program = gl.createProgram()

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource)
    gl.attachShader(program, vertexShader)
    gl.attachShader(program, fragmentShader)
    gl.linkProgram(program)

    const success = gl.getProgramParameter(program, gl.LINK_STATUS)
    if (success) return program

    console.log(gl.getProgramInfoLog(program))
    gl.deleteProgram(program)
}

// Create and compile a shader from source
function createShader(gl, type, source) {
    const shader = gl.createShader(type)
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS)

    if (success) return shader

    console.log(gl.getShaderInfoLog(shader))
    gl.deleteShader(shader)
}

// Fetch a file from a path
async function fetchFile(path, type = 'text') {
    const response = await fetch(path)
    return response[type]()
}

// Hex string to [0,1] RGB array
function hexToRGB(hex) {
    const pairs = hex.match(/\w{1,2}/g)
    return [
        parseInt(pairs[0], 16) / 255,
        parseInt(pairs[1], 16) / 255,
        parseInt(pairs[2], 16) / 255
    ]
}