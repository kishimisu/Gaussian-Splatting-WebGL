const SORTING_ALGORITHMS = [
    'count sort',
    'quick sort',
    'Array.sort'
]

let maxGaussianController = null
let camController = {
    texts: {
        'default': 'When in calibration mode, you can click on 3 points in your scene to define the ground and orientate the camera accordingly.',
        'calibrating': 'Click on 3 points in your scene to define a plane.',
        'calibrated': 'Click on Apply to orientate the camera so that the defined plane is parallel to the ground.'
    }
}

// Init settings GUI panel
function initGUI() {
    const gui = new lil.GUI()

    gui.add(settings, 'scene', Object.keys(defaultCameraParameters)).name('Scene').listen()
       .onChange((scene) => loadScene({ scene }))

    gui.add(settings, 'renderResolution', 0.1, 1, 0.01).name('Preview Resolution')

    maxGaussianController = gui.add(settings, 'maxGaussians', 1, settings.maxGaussians, 1).name('Max Gaussians')
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

    gui.add(settings, 'freeFly').name('Free Flying').listen()
       .onChange(value => {
            cam.freeFly = value
            requestRender()
        })

    // File upload handler
    gui.add(settings, 'uploadFile').name('Upload .ply file')
    document.querySelector('#input').addEventListener('change', async e => {
        try {
            await loadScene({ file: e.target.files[0] })
        } catch (error) {
            document.querySelector('#loading-text').textContent = `An error occured when trying to read the file.`
            throw error
        }
    })

    const folder = gui.addFolder('Camera Calibration').close()

    const p = document.createElement('p')
    p.className = 'controller'
    p.textContent = camController.texts['default']

    camController.p = p

    camController.start = folder.add(settings, 'calibrateCamera').name('Start Calibration')
        .onChange(() => {
            if (cam.isCalibrating) {
                cam.isCalibrating = false
                cam.resetCalibration()
                camController.finish.disable()
                camController.start.name('Start Calibration')
                camController.start.updateDisplay()
                p.textContent = camController.texts['default']
            }
            else {
                cam.isCalibrating = true
                camController.finish.enable()
                camController.start.name('Abort Calibration')
                camController.start.updateDisplay()
                p.textContent = camController.texts['calibrating']
            }
        })

    camController.finish = folder.add(settings, 'finishCalibration').name('Apply changes').disable()
        .onChange(() => {
            cam.isCalibrating = false
            cam.finishCalibration()

            camController.finish.disable()
            camController.start.name('Calibrate Camera')
            camController.start.updateDisplay()
            camController.showGizmo.show()
            p.textContent = camController.texts['default']
        })

    camController.showGizmo = folder.add(settings, 'showGizmo').name('Show Plane').hide()
        .onChange(() => requestRender())

    folder.children[0].domElement.parentNode.insertBefore(p, folder.children[0].domElement)
}