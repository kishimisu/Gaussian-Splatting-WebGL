let gl, program
let cam = null
let worker = null
let isWorkerSorting = false
let canvasSize = [0, 0]

let renderFrameRequest = null
let renderTimeout = null

let gaussianCount
let sceneMin, sceneMax

const SORTING_ALGORITHMS = [
    'count sort',
    'quick sort',
    'Array.sort'
]

const settings = {
    scene: 'room',
    renderResolution: 0.2,
    maxGaussians: 1e6,
    scalingModifier: 1,
    sortingAlgorithm: 'count sort',
    bgColor: '#000000',
    speed: 0.07,
    fov: 47,
    debugDepth: false,
    sortTime: NaN,
}

const defaultCameraParameters = {
    'building': {
        up: [0, 0.968912, 0.247403],
        target: [-0.262075, 0.76138, 1.27392],
        camera: [ -1.1807959999999995, 1.8300000000000007, 3.99],
        defaultCameraMode: 'orbit'
    },
    'room': {
        up: [0, 0.886994, 0.461779],
        target: [-0.428322434425354, 1.2004123210906982, 0.8184626698493958],
        camera: [4.950796326794864, 1.7307963267948987, 2.5],
        defaultCameraMode: 'freefly'
    },
    // 'garden': {
    //     up: [0.055540, 0.928368, 0.367486],
    //     target: [0.338164, 1.198655, 0.455374],
    //     defaultCameraMode: 'orbit'
    // }
}

// Init settings GUI panel
function initGUI() {
    const gui = new lil.GUI()

    settings.maxGaussians = Math.min(settings.maxGaussians, gaussianCount)

    gui.add(settings, 'scene', Object.keys(defaultCameraParameters)).name('Scene')
       .onChange(loadScene)

    gui.add(settings, 'renderResolution', 0.1, 1, 0.01).name('Preview Resolution')

    gui.add(settings, 'maxGaussians', 1, gaussianCount, 1).name('Max Gaussians')
       .onChange(() => {
            cam.needsWorkerUpdate = true
            cam.updateWorker()
        })

    gui.add(settings, 'sortingAlgorithm', SORTING_ALGORITHMS).name('Sorting Algorithm')
    gui.add(settings, 'sortTime').name('Sort Time').disable().listen()

    gui.add(settings, 'scalingModifier', 0.01, 1, 0.01).name('Scaling Modifier')
       .onChange(() => requestRender())

    gui.addColor(settings, 'bgColor').name('Background Color')
       .onChange(value => {
        document.body.style.backgroundColor = value
        requestRender()
    })

    gui.add(settings, 'speed', 0.01, 2, 0.01).name('Camera Speed')

    gui.add(settings, 'fov', 30, 110, 1).name('FOV')
       .onChange(value => {
        cam.fov_y = value * Math.PI / 180
        requestRender()
    })

    gui.add(settings, 'debugDepth').name('Show Depth Map')
       .onChange(() => requestRender())

    gui.add(cam, 'freeFly').name('Free Flying').listen()
}

async function loadScene(scene) {
    document.querySelector('#loading-container').style.opacity = 1
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Download .ply file
    const url = `https://huggingface.co/kishimisu/3d-gaussian-splatting-webgl/resolve/main/${scene}.ply`
    const content = await downloadPly(url)

    document.querySelector('#loading-text').textContent = `Success. Initializing scene...`

    // Load gaussian data from .ply file
    const data = await loadPly(content)

    // Send gaussian data to the worker
    worker.postMessage({ gaussians: {
        ...data, count: gaussianCount
    } })

    // Setup camera
    if (cam == null) cam = new Camera(defaultCameraParameters[scene])
    else cam.setParameters(defaultCameraParameters[scene])
    cam.update()
}

async function main() {
    // Setup webgl context and buffers
    const { glContext, glProgram, buffers } = await setupWebglContext()
    gl = glContext; program = glProgram // Handy global vars

    if (gl == null || program == null) {
        document.querySelector('#loading-text').style.color = `red`
        document.querySelector('#loading-text').textContent = `Could not initialize the WebGL context.`
        throw new Error('Could not initialize WebGL')
    }

    // Setup web worker for multi-threaded sorting
    worker = new Worker('src/worker-sort.js')

    // Event that receives sorted gaussian data from the worker
    worker.onmessage = e => {
        const { data, sortTime } = e.data

        if (getComputedStyle(document.querySelector('#loading-container')).opacity != 0)
            document.querySelector('#loading-container').style.opacity = 0

        const updateBuffer = (buffer, data) => {
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
            gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
        }

        updateBuffer(buffers.color, data.colors)
        updateBuffer(buffers.center, data.positions)
        updateBuffer(buffers.opacity, data.opacities)
        updateBuffer(buffers.covA, data.cov3Da)
        updateBuffer(buffers.covB, data.cov3Db)

        settings.sortTime = sortTime

        isWorkerSorting = false
        requestRender()
    }

    // Load the default scene
    await loadScene(settings.scene)

    // Setup GUI
    initGUI()
}

function requestRender(...params) {
    if (renderFrameRequest != null) 
        cancelAnimationFrame(renderFrameRequest)

    renderFrameRequest = requestAnimationFrame(() => render(...params)) 
}

// Render a frame on the canvas
function render(width, height, res) {
    // Update canvas size
    const resolution = res ?? settings.renderResolution
    const canvasWidth = width ?? Math.round(canvasSize[0] * resolution)
    const canvasHeight = height ?? Math.round(canvasSize[1] * resolution)

    if (gl.canvas.width != canvasWidth || gl.canvas.height != canvasHeight) {
        gl.canvas.width = canvasWidth
        gl.canvas.height = canvasHeight
    }

    // Setup viewport
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)

    // Update camera
    cam.update()

    // Original implementation parameters
    const W = gl.canvas.width
    const H = gl.canvas.height
    const tan_fovy = Math.tan(cam.fov_y * 0.5)
    const tan_fovx = tan_fovy * W / H
    const focal_y = H / (2 * tan_fovy)
    const focal_x = W / (2 * tan_fovx)

    gl.uniform1f(gl.getUniformLocation(program, 'W'), W)
    gl.uniform1f(gl.getUniformLocation(program, 'H'), H)
    gl.uniform1f(gl.getUniformLocation(program, 'focal_x'), focal_x)
    gl.uniform1f(gl.getUniformLocation(program, 'focal_y'), focal_y)
    gl.uniform1f(gl.getUniformLocation(program, 'tan_fovx'), tan_fovx)
    gl.uniform1f(gl.getUniformLocation(program, 'tan_fovy'), tan_fovy)
    gl.uniform1f(gl.getUniformLocation(program, 'scale_modifier'), settings.scalingModifier)
    gl.uniform3fv(gl.getUniformLocation(program, 'boxmin'), sceneMin)
    gl.uniform3fv(gl.getUniformLocation(program, 'boxmax'), sceneMax)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'projmatrix'), false, cam.vpm)
    gl.uniformMatrix4fv(gl.getUniformLocation(program, 'viewmatrix'), false, cam.vm)

    // Custom parameters
    gl.uniform3fv(gl.getUniformLocation(program, 'background_color'), hexToRGB(settings.bgColor))
    gl.uniform1i(gl.getUniformLocation(program, 'show_depth_map'), settings.debugDepth)

    // Draw
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, settings.maxGaussians)

    renderFrameRequest = null

    // Progressively draw with higher resolution after the camera stops moving
    let nextResolution = Math.floor(resolution * 4 + 1) / 4
    if (nextResolution - resolution < 0.1) nextResolution += .25

    if (nextResolution <= 1 && !cam.needsWorkerUpdate && !isWorkerSorting) {
        const nextWidth = Math.round(canvasSize[0] * nextResolution)
        const nextHeight = Math.round(canvasSize[1] * nextResolution)

        if (renderTimeout != null) 
            clearTimeout(renderTimeout)

        renderTimeout = setTimeout(() => requestRender(nextWidth, nextHeight, nextResolution), 200)
    }
}

window.onload = main