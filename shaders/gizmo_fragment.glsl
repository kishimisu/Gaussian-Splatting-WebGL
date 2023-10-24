#version 300 es
precision mediump float;

in vec2 coord;

in float isPlane;
out vec4 fragColor;

void main() {
    const float r = .02;
    float d =  smoothstep(0., r, abs(fract(coord.x * 20.) - .5));
    d = min(d, smoothstep(0., r, abs(fract(coord.y * 20.) - .5)));

    fragColor = mix(vec4(1, 0, 0, 1), vec4(vec3(1,0,0), 1. - d), isPlane);
}