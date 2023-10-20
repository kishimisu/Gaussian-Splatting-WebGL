# WebGL 3D Gaussian Splatting Renderer

Javascript and WebGL2 implementation of a 3D gaussian rasterizer based on the paper [3D Gaussian Splatting
for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/).

I tried to match as closely as possible the original C++/CUDA implementation (which is split into multiple repositories) so that the question "where are these calculations coming from?" can easily be answered when looking through the code. For each function coming from the original paper, I annotate the file and line it's orginating from.

More specifically, these two files were the most important to understand how the original rendering works:

Gaussian data extraction from a .ply file and render setup:
- [https://gitlab.inria.fr/sibr/../GaussianView.cpp](https://gitlab.inria.fr/sibr/sibr_core/-/blob/gaussian_code_release_union/src/projects/gaussianviewer/renderer/GaussianView.cpp)

preprocessCUDA() and renderCUDA() methods:
- [https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/main/../forward.cu](https://github.com/graphdeco-inria/diff-gaussian-rasterization/blob/main/cuda_rasterizer/forward.cu#L118)

## Live Demo

[3D Gaussian Splatting
for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/).

## Background

### NeRFs

The recent introduction of Neural Radiance Fields (NeRFs) opened many doors for 3D scene reconstruction using neural networks.

NeRFs operate by training on a collection of images and corresponding camera positions obtained from a 3D environment to generate a density volume representing the scene.
Given an input position and rotation, the network computes a density and radiance value for this volume, which are then used in a raymarching algorithm to traverse the scene and accumulates pixel colors.
This process allow the reconstruction of images from novel camera positions not initially in the training data.

NeRF-based techniques have demonstrated remarkable results in faithfully recreating complex 3D scenes including view-dependent lighting effects. However, the computational intensity of the raymarching process makes this approach unsuitable for real-time rendering on conventional hardware.

### Gaussian Splatting

Similar to NeRF-based approaches, gaussian splatting involves training a neural network from a set of images and associated camera positions in order to be able to reconstruct the scene from novel viewpoints.

However, in this case, instead of generating a volumetric density/radiance representation of the scene, Gaussian splats are employed. These splats are essentially individual 3D objects that have attributes such as position, scale, rotation, and color.

The neural network's task is to position and adjust these splats within the 3D scene to closely match with the input images. 
A significant advantage of this approach is its compatibility with standard rasterization techniques, as opposed to resource-intensive raymarching: once the neural network has finished optimizing the gaussians, we don't need it anymore - we only need the data for each  splat and feed it to the GPU which will happilly rasterize them in parallel.

Compared to NeRFs, Gaussian Splatting allow for real time renderings!

## Implementation Details

In this implementation, each gaussian is processed by a vertex shader to create a screen-space bounding rectangle made of 4 vertices, which is then colorized using a fragment shader.

#### Scale, Rotation, 3D covariance

In the original implementation, the scale and rotation attributes for each gaussian are sent to the GPU in order to calculate its 3D covariance matrix, which is ultimately used to compute its screen-space bouding rectangle. This allow to dynamically resize the splats for visualization purposes.

In this implementation, the 3D covariance is pre-computed as a one-time operation to avoid recomputing it at each frame, and also avoid sending the scale and rotation attributes to the GPU.
The splat size parameter is used differently to still allow to dynamically resize the splats 

#### Harmonics

The gaussians don't have a "color" attribute, instead their color is encoded using 16 spherical harmonics (that are vectors of 3 components). This allow for a more realistic view-dependant lighting, however it needs 48 floats per gaussian which is huge for scenes that typically have millions of gaussians.
Fortunately, not all of the harmonics coefficients are necessary to compute the final color, using more will only increase the accuracy. Here are the different degrees we can use:

- Degree 3: 16 harmonics (48 floats) per gaussian
- Degree 2: 9 harmonics (27 floats) per gaussian
- Degree 1: 4 harmonics (12 floats) per gaussian
- Degree 0: 1 harmonic (3 floats) per gaussian [no view-dependant lighting]

All degrees above 0 are view-dependant and the color for each gaussian needs to be recomputed each time the view matrix is updated.
Using degree 0 for this implementation is clearly the best in term of performances as it avoid sending any spherical harmonic to the GPU, and allow to pre-compute the gaussian color as a one-time operation before rendering.
The visual impact is clearly negligible compared to the performance gain.

#### Sorting

(WIP)

## Code Structure

src/
- **main.js**: Setup and render
- **loader.js**: Load and pre-process a .ply file containing gaussian data
- **worker-sort.js**: Web Worker that sorts gaussian splats by depth
- **camera.js**: Camera manager

- **utils.js**: WebGL & utilities

shaders/
- **splat_vertex.glsl**: vertex shader that processes 4 vertices per gaussian to compute its 2d bounding quad

- **splat_fragment.glsl**: fragment shader that processes and colorize all pixels for each gaussian

## Reference

- [Original paper](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/) (3D Gaussian Splatting
for Real-Time Radiance Field Rendering)

- [Webgl Splat Renderer by ](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/): clean and concise implementation with no external library from which are coming many optimizations related to sorting (web-worker, view matrix difference treshold, count sort)