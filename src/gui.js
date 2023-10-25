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
    const gui = new lil.GUI({title: 'Settings'})

    const sceneNames = Object.entries(defaultCameraParameters).map(([name, { size }]) => `${name} (${size})`)
    settings.scene = sceneNames[0]
    gui.add(settings, 'scene', sceneNames).name('Scene').listen()
       .onChange((scene) => loadScene({ scene }))

    gui.add(settings, 'renderResolution', 0.1, 1, 0.01).name('Preview Resolution')

    maxGaussianController = gui.add(settings, 'maxGaussians', 1, settings.maxGaussians, 1).name('Max Gaussians')
       .onChange(() => {
            cam.needsWorkerUpdate = true
            cam.updateWorker()
        })

    gui.add(settings, 'scalingModifier', 0.01, 1, 0.01).name('Scaling Modifier')
        .onChange(() => requestRender())

    gui.add(settings, 'sortingAlgorithm', SORTING_ALGORITHMS).name('Sorting Algorithm')
    gui.add(settings, 'sortTime').name('Sort Time').disable().listen()

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

    const controlsFolder = gui.addFolder('Controls')
    controlsFolder.add(settings, 'freeFly').name('Free Flying').listen()
       .onChange(value => {
            cam.freeFly = value
            requestRender()
        })

    // Free-fly text info
    const controlsHelp = document.createElement('div')
    controlsHelp.style.padding = '4px'
    controlsHelp.innerHTML = `
        <u>Freefly controls:</u><br>
        <span class='ctrl-key'>WASD, ZQSD</span>: forward/left/backward/right <br>
        <span class='ctrl-key'>Shift/Space</span>: move down/up <br>
        <br>
        <u>Orbit controls:</u><br>
        <span class='ctrl-key'>Left click + drag</span>: rotate around target <br>
        <span class='ctrl-key'>Mouse wheel</span>: zoom in/out
    `
    controlsFolder.domElement.lastChild.appendChild(controlsHelp)

    const folder = gui.addFolder('Camera Calibration').close()
    const p = document.createElement('p')
    p.className = 'controller'
    p.textContent = camController.texts['default']

    camController.p = p

    camController.resetCalibration = () => {
        cam.resetCalibration()
        camController.finish.disable()
        camController.start.name('Start Calibration')
        camController.start.updateDisplay()
        p.textContent = camController.texts['default']
    }

    camController.start = folder.add(settings, 'calibrateCamera').name('Start Calibration')
        .onChange(() => {
            if (cam.isCalibrating) {
                camController.resetCalibration()
            }
            else {
                cam.isCalibrating = true
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

    // Camera calibration text info
    folder.children[0].domElement.parentNode.insertBefore(p, folder.children[0].domElement)
    
    // Github panel
    addGithubLink(gui)
}

function addGithubLink(gui) {
    const githubLogo = `
    <div style="margin: 2px 6px">
        <svg width="20" height="20" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
            <path d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z" fill="#fff"/>
        </svg>
    </div>`

    const githubElm = document.createElement('div')
    githubElm.style.display = 'flex'
    githubElm.className = 'controller'
    
    const githubLink = document.createElement('a')
    githubLink.style.color = 'white'
    githubLink.href = 'https://github.com/kishimisu/Gaussian-Splatting-WebGL'
    githubLink.textContent = 'github.com/Gaussian-Splatting-WebGL'
    githubLink.target = '_blank'
    githubLink.rel = 'noopener noreferrer'
    githubElm.innerHTML = githubLogo
    githubElm.appendChild(githubLink)

    gui.domElement.insertBefore(githubElm, gui.domElement.children[1])//appendChild(githubElm)
}