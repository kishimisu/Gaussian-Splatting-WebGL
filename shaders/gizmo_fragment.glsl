#version 300 es
precision mediump float;

in vec2 coord;
in float isPlane;

out vec4 fragColor;

void main() {
    // Draw dots
    if (isPlane < 0.5) {
        float R = smoothstep(.2, .05, length(coord));
        fragColor = vec4(R, 0, 0, R);
    }
    // Draw plane
    else {
        const float thickness = .03;
        float d =  smoothstep(0., thickness, abs(fract(coord.x * 60.) - .5));
        d = min(d, smoothstep(0., thickness, abs(fract(coord.y * 60.) - .5)));
        fragColor = vec4(1, 0, 0, 1. - d);
    }
}