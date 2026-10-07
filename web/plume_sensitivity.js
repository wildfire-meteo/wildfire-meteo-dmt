//
// Copyright 2026 Wageningen University & Research (WUR)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import { calc_parcel_ascent } from "./parcel.js";
import { w0_from_dtheta, dtheta_from_H, dq_from_LE } from "./fire_surface.js";


// Fire area spans the slider range.
const LOG_A   = d3.range(3, 7.001, 0.1);
const H_CURVE = [10, 25, 50, 100, 150, 250];

const QUANTITIES = {
    top:   { label: "Plume top height (m)",         title: "plume top height",          file: "plume_top" },
    w_max: { label: "Max. vertical velocity (m/s)", title: "maximum vertical velocity", file: "w_max" },
};

const FIG_W = 800;
const FIG_H = 560;
const FIG_SCALE = 2;
const FONT = "Inter, Helvetica, Arial, sans-serif";
const margin = { top: 64, right: 150, bottom: 60, left: 76 };


// Entraining plume for every (H, A) pair; rows follow H_kw, columns log_A.
function compute(env, base, LE_kw, H_kw, log_A)
{
    const { z_env, T_env, Td_env, p_env } = env;
    const z_max = z_env[z_env.length - 1];

    return H_kw.map(H =>
    {
        const dtheta = dtheta_from_H(H * 1e3, base.rho_sfc, base.thetav_sfc);
        const dq     = dq_from_LE(LE_kw * 1e3, dtheta, base.rho_sfc, base.thetav_sfc);
        const w0     = w0_from_dtheta(dtheta, base.thetav_sfc);

        return log_A.map(la =>
        {
            const r = calc_parcel_ascent(z_env, T_env, Td_env, p_env, dtheta, dq, w0, 10 ** la, { z_max });
            if (!r.z.length) return { top: 0, w_max: 0, cloudy: false };
            // Plumes still rising at the top of the sounding are cut from the curves.
            if (!r.stopped)  return { top: NaN, w_max: NaN, cloudy: false };
            return { top: r.z[r.k_top], w_max: Math.max(...r.w), cloudy: r.k_lcl !== -1 };
        });
    });
}


function draw_curves(g, W, H, grid, key, z_top)
{
    const x = d3.scaleLog().domain([10 ** (LOG_A[0] - 6), 10 ** (LOG_A[LOG_A.length - 1] - 6)]).range([0, W]);
    const y = d3.scaleLinear()
        .domain([0, d3.max(grid.flat(), c => c[key]) || 1]).nice().range([H, 0]);
    if (key === "top" && y.domain()[1] > z_top) y.domain([0, z_top]);

    g.selectAll("line.grid").data(y.ticks(6)).join("line")
        .attr("x1", 0).attr("x2", W).attr("y1", d => y(d)).attr("y2", d => y(d))
        .attr("stroke", "#e0e0e0");

    // Light to dark with increasing intensity.
    const shade = d3.scaleLinear().domain([0, H_CURVE.length - 1]).range([0.35, 1]);
    const line  = d3.line().defined(d => !isNaN(d[key])).x((_, k) => x(10 ** (LOG_A[k] - 6))).y(d => y(d[key]));

    grid.forEach((row, k) =>
    {
        const c = d3.interpolateGreys(shade(k));
        g.append("path").datum(row)
            .attr("fill", "none").attr("stroke", c).attr("stroke-width", 2).attr("d", line);

        // First fire area at which the plume forms a cloud.
        const k_cloud = row.findIndex(d => d.cloudy);
        if (k_cloud !== -1)
            cloud_marker(g, x(10 ** (LOG_A[k_cloud] - 6)), y(row[k_cloud][key]), c);

        g.append("line")
            .attr("x1", W + 20).attr("x2", W + 44)
            .attr("y1", 10 + k * 20).attr("y2", 10 + k * 20)
            .attr("stroke", c).attr("stroke-width", 2);
        g.append("text")
            .attr("x", W + 50).attr("y", 14 + k * 20)
            .attr("font-size", 12).attr("font-family", FONT)
            .text(`${H_CURVE[k]} kW/m²`);
    });
    const y_cloud = 10 + H_CURVE.length * 20 + 6;
    cloud_marker(g, W + 32, y_cloud, "#222");
    g.append("text")
        .attr("x", W + 50).attr("y", y_cloud + 4)
        .attr("font-size", 12).attr("font-family", FONT)
        .text("Cloud forms");

    g.append("text")
        .attr("x", W + 20).attr("y", -8)
        .attr("font-size", 12).attr("font-family", FONT).attr("font-weight", 600)
        .text("Sensible heat flux");

    g.append("g").attr("transform", `translate(0,${H})`)
        .call(d3.axisBottom(x).ticks(5, "~g")).call(style_axis);
    g.append("g").call(d3.axisLeft(y).ticks(6)).call(style_axis);

    return { x_label: "Fire area (km²)", y_label: QUANTITIES[key].label };
}


function cloud_marker(g, cx, cy, color)
{
    g.append("circle")
        .attr("cx", cx).attr("cy", cy).attr("r", 4.5)
        .attr("fill", "white").attr("stroke", color).attr("stroke-width", 2);
}


function style_axis(sel)
{
    sel.selectAll("text").attr("font-size", 12).attr("font-family", FONT);
}


export function download_plume_sensitivity({ env, base, LE_kw, key, subtitle })
{
    const grid = compute(env, base, LE_kw, H_CURVE, LOG_A);

    const svg = d3.create("svg")
        .attr("xmlns", "http://www.w3.org/2000/svg")
        .attr("width", FIG_W).attr("height", FIG_H);
    svg.append("rect").attr("width", FIG_W).attr("height", FIG_H).attr("fill", "white");

    const W = FIG_W - margin.left - margin.right;
    const H = FIG_H - margin.top - margin.bottom;
    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    const { x_label, y_label } = draw_curves(g, W, H, grid, key, env.z_env[env.z_env.length - 1]);

    g.append("rect").attr("width", W).attr("height", H)
        .attr("fill", "none").attr("stroke", "#222").attr("stroke-width", 0.8);

    g.append("text")
        .attr("x", W / 2).attr("y", H + 44)
        .attr("text-anchor", "middle").attr("font-size", 14).attr("font-family", FONT)
        .text(x_label);
    g.append("text")
        .attr("transform", `translate(-56,${H / 2}) rotate(-90)`)
        .attr("text-anchor", "middle").attr("font-size", 14).attr("font-family", FONT)
        .text(y_label);

    svg.append("text")
        .attr("x", margin.left).attr("y", 26)
        .attr("font-size", 16).attr("font-weight", 600).attr("font-family", FONT)
        .text(`Sensitivity of ${QUANTITIES[key].title} to fire size and intensity`);
    svg.append("text")
        .attr("x", margin.left).attr("y", 46)
        .attr("font-size", 12).attr("font-family", FONT).attr("fill", "#555")
        .text(`${subtitle} · entraining plume, latent heat flux ${LE_kw.toFixed(1)} kW/m²`);

    // SVG → canvas → PNG.
    const src = new XMLSerializer().serializeToString(svg.node());
    const img = new Image();
    img.onload = () =>
    {
        const canvas = document.createElement("canvas");
        canvas.width  = FIG_W * FIG_SCALE;
        canvas.height = FIG_H * FIG_SCALE;
        const ctx = canvas.getContext("2d");
        ctx.scale(FIG_SCALE, FIG_SCALE);
        ctx.drawImage(img, 0, 0);

        const a = document.createElement("a");
        a.download = `plume_sensitivity_${QUANTITIES[key].file}.png`;
        a.href = canvas.toDataURL("image/png");
        a.click();
    };
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(src);
}
