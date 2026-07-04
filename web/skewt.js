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

import { calc_non_entraining_parcel, calc_entraining_parcel } from "./parcel.js";
import { Rd, exner, qsat, dewpoint, virtual_temp } from "./thermo.js";
import { w0_from_dtheta, dtheta_from_H, dq_from_LE, H_from_dtheta, LE_from_dq } from "./fire_surface.js";
import { draw_wind_barb, STAFF_LEN } from "./wind_barbs.js";

const svg = d3.select("#skewt");

const margin = { top: 30, right: 48, bottom: 65, left: 70 };

let current_zoom = d3.zoomIdentity;

const zoom = d3.zoom()
    .scaleExtent([0.5, 10])
    .on("zoom", (event) => { current_zoom = event.transform; draw_skewt(); });

svg.call(zoom);
svg.on("dblclick.zoom", null);
svg.on("dblclick", () => zoom.transform(svg, d3.zoomIdentity));

let bg_data = null;
let model_sounding = null;
let obs_sounding = null;
let model_forecast = null;
let current_time = 0;

const fire_state = { dtheta: 0, dq: 0 };

const color_T   = "#EB0056";
const color_Td  = "#0056EB";
const font_size = "14px";

// Half-width (hPa) of the Gaussian kernel used by "Match profile" to smooth
// the observed T/Td profile before interpolating onto the model's pressure
// grid. Larger = more smoothing. Set to 0 to disable smoothing entirely.
const MATCH_PROFILE_SMOOTHING_HPA = 5;

function skew_transform(T_k, p_hpa)
{
    const skew_factor = +document.getElementById("skew_factor").value;
    return (T_k - 273.15) + skew_factor * (Math.log(1000) - Math.log(p_hpa));
}

function inv_skew_transform(T_skewed, p_hpa)
{
    const skew_factor = +document.getElementById("skew_factor").value;
    return T_skewed - skew_factor * (Math.log(1000) - Math.log(p_hpa)) + 273.15;
}

fetch("/api/background").then(r => r.json()).then(bg =>
{
    bg_data = bg;
    draw_skewt();
});

document.getElementById("fetch_model_btn").addEventListener("click", () =>
{
    const lat   = document.getElementById("lat_input").value;
    const lon   = document.getElementById("lon_input").value;
    const date  = document.getElementById("date_input").value;
    const model = document.getElementById("model_select").value;

    if (!lat || !lon || !date) return;

    const spinner = document.getElementById("plot_spinner");
    spinner.style.display = "";

    const url = `/api/model_sounding?lat=${lat}&lon=${lon}&model=${model}&date=${date}`;
    fetch(url).then(r => r.json()).then(data =>
    {
        spinner.style.display = "none";
        model_forecast = data;
        document.getElementById("export_nc_btn").disabled = false;

        const time_str = document.getElementById("time_input").value;
        if (time_str)
        {
            const [h, m]   = time_str.split(":").map(Number);
            const target   = h * 60 + m;
            current_time   = data.times.reduce((best, t, i) =>
            {
                const [th, tm] = t.split(":").map(Number);
                const prev     = data.times[best].split(":").map(Number);
                return Math.abs(th * 60 + tm - target) < Math.abs(prev[0] * 60 + prev[1] - target) ? i : best;
            }, 0);
        }
        else
        {
            current_time = 12;
        }

        const slider = document.getElementById("time_slider");
        slider.max = data.times.length - 1;
        slider.value = current_time;

        document.getElementById("time_label").textContent = data.times[current_time] + " UTC";
        document.getElementById("time_section").style.display = "";

        model_sounding = {
            p_hpa:               data.p_hpa,
            T:                   data.T[current_time],
            Td:                  data.Td[current_time],
            z_agl:               data.z_agl[current_time],
            z:                   data.z[current_time],
            theta:               data.theta[current_time],
            thetav:              data.thetav[current_time],
            qt:                  data.qt[current_time],
            ws:                  data.ws[current_time],
            wd:                  data.wd[current_time],
            surface_pressure_hpa: data.surface_pressure[current_time],
            T_2m:                data.T_2m[current_time],
            Td_2m:               data.Td_2m[current_time],
        };

        document.getElementById("launch_parcel").disabled = false;
        document.getElementById("show_model_sounding").checked = true;
        draw_skewt();
    });
});

document.getElementById("export_nc_btn").addEventListener("click", () =>
{
    const lat   = document.getElementById("lat_input").value;
    const lon   = document.getElementById("lon_input").value;
    const date  = document.getElementById("date_input").value;
    const model = document.getElementById("model_select").value;
    window.location.href = `/api/model_sounding/export?lat=${lat}&lon=${lon}&model=${model}&date=${date}`;
});

document.getElementById("time_slider").addEventListener("input", (e) =>
{
    if (!model_forecast) return;

    current_time = +e.target.value;
    document.getElementById("time_label").textContent = model_forecast.times[current_time] + " UTC";

    model_sounding = {
        p_hpa:               model_forecast.p_hpa,
        T:                   model_forecast.T[current_time],
        Td:                  model_forecast.Td[current_time],
        z_agl:               model_forecast.z_agl[current_time],
        z:                   model_forecast.z[current_time],
        theta:               model_forecast.theta[current_time],
        thetav:              model_forecast.thetav[current_time],
        qt:                  model_forecast.qt[current_time],
        ws:                  model_forecast.ws[current_time],
        wd:                  model_forecast.wd[current_time],
        surface_pressure_hpa: model_forecast.surface_pressure[current_time],
        T_2m:                model_forecast.T_2m[current_time],
        Td_2m:               model_forecast.Td_2m[current_time],
    };

    draw_skewt();
});

document.getElementById("launch_parcel").addEventListener("change", draw_skewt);
document.getElementById("parcel_mode").addEventListener("change", draw_skewt);
document.getElementById("fire_area").addEventListener("input", (e) =>
{
    const area_km2 = 10 ** (+e.target.value - 6);
    const decimals = area_km2 < 0.1 ? 3 : 1;
    document.getElementById("fire_area_label").textContent =
        `Fire area: ${area_km2.toFixed(decimals)} km²`;
    draw_skewt();
});
document.getElementById("fire_H").addEventListener("input", (e) =>
{
    const base = get_surface_base();
    if (base)
        fire_state.dtheta = dtheta_from_H(+e.target.value * 1e3, base.rho_sfc, base.thetav_sfc);
    sync_flux_controls();
    draw_skewt();
});
document.getElementById("fire_LE").addEventListener("input", (e) =>
{
    const base = get_surface_base();
    if (base)
        fire_state.dq = dq_from_LE(+e.target.value * 1e3, fire_state.dtheta, base.rho_sfc, base.thetav_sfc);
    sync_flux_controls();
    draw_skewt();
});

function sync_flux_controls()
{
    const base = get_surface_base();
    if (!base) return;
    const H_kw  = H_from_dtheta(fire_state.dtheta, base.rho_sfc, base.thetav_sfc) / 1e3;
    const LE_kw = LE_from_dq(fire_state.dq, fire_state.dtheta, base.rho_sfc, base.thetav_sfc) / 1e3;
    document.getElementById("fire_H").value  = H_kw;
    document.getElementById("fire_LE").value = LE_kw;
    update_flux_labels(H_kw, LE_kw);
}

function update_flux_labels(H_kw, LE_kw)
{
    document.getElementById("fire_H_label").textContent =
        `Sensible heat flux: ${H_kw.toFixed(1)} kW/m²`;
    document.getElementById("fire_LE_label").textContent =
        `Latent heat flux: ${LE_kw.toFixed(1)} kW/m²`;
}
document.getElementById("show_isobars").addEventListener("change", draw_skewt);
document.getElementById("show_isotherms").addEventListener("change", draw_skewt);
document.getElementById("show_isohumes").addEventListener("change", () =>
{
    document.getElementById("label_isohumes").disabled = !document.getElementById("show_isohumes").checked;
    draw_skewt();
});
document.getElementById("label_isohumes").addEventListener("change", draw_skewt);
document.getElementById("show_dry_adiabats").addEventListener("change", draw_skewt);
document.getElementById("show_moist_adiabats").addEventListener("change", draw_skewt);
document.getElementById("show_model_sounding").addEventListener("change", draw_skewt);
document.getElementById("edit_mode").addEventListener("change", draw_skewt);

document.getElementById("skew_factor").addEventListener("input", (e) =>
{
    document.getElementById("skew_factor_label").textContent = `Skew factor: ${e.target.value}`;
    draw_skewt();
});

document.getElementById("p_top").addEventListener("input", (e) =>
{
    document.getElementById("p_top_label").textContent = `Top: ${e.target.value} hPa`;
    draw_skewt();
});

function draw_isobars(chart, y, W)
{
    const p_levels = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
    p_levels.forEach(p =>
    {
        chart.append("line")
            .attr("x1", 0).attr("y1", y(p))
            .attr("x2", W).attr("y2", y(p))
            .attr("stroke", "rgba(179,179,179,0.5)")
            .attr("stroke-width", 1);
    });
}

function draw_height_labels(chart, y, p_hpa, z, sfc_p_hpa)
{
    const p_levels = [1000, 900, 800, 700, 600, 500, 400, 300, 200, 100];
    p_levels.forEach(p =>
    {
        if (sfc_p_hpa !== undefined && p > sfc_p_hpa) return;
        const i = p_hpa.indexOf(p);
        if (i === -1) return;
        const z_m = Math.round(z[i]);
        chart.append("text")
            .attr("x", 5)
            .attr("y", y(p) - 3)
            .attr("text-anchor", "start")
            .attr("font-size", "11px")
            .attr("fill", "#333")
            .text(`${z_m} m`);
    });
}

function draw_skewt_lines(chart, x, y, temps, pressures_pa, color)
{
    const p_hpa = pressures_pa.map(p => p / 100);

    const line_gen = d3.line()
        .x((T, i) => x(skew_transform(T, p_hpa[i])))
        .y((_, i) => y(p_hpa[i]));

    temps.forEach(line =>
    {
        chart.append("path")
            .datum(line)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", 1)
            .attr("d", line_gen);
    });
}

function draw_isohume_labels(chart, x, y, isohumes, p_isohumes_pa, mixing_ratios)
{
    const p_top_hpa = p_isohumes_pa[p_isohumes_pa.length - 1] / 100;

    isohumes.forEach((line, i) =>
    {
        const T_top = line[line.length - 1];
        const x_pos = x(skew_transform(T_top, p_top_hpa));
        const y_pos = y(p_top_hpa);

        chart.append("text")
            .attr("x", x_pos)
            .attr("y", y_pos - 4)
            .attr("text-anchor", "middle")
            .attr("font-size", "12px")
            .attr("fill", "rgba(31,119,180,0.9)")
            .text(mixing_ratios[i].toFixed(1));
    });
}

// Returns surface thermodynamic base state from model_sounding, or null if unavailable.
function get_surface_base()
{
    if (!model_sounding) return null;

    const p_sfc_pa = (model_sounding.surface_pressure_hpa ?? Math.max(...model_sounding.p_hpa)) * 100;
    const p_pa_all = model_sounding.p_hpa.map(p => p * 100);
    const idx_above = p_pa_all.findIndex(p => p < p_sfc_pa);
    const fallback_idx = idx_above === -1 ? 0 : idx_above;

    const T_env_sfc  = model_sounding.T_2m  ?? model_sounding.T[fallback_idx];
    const Td_env_sfc = model_sounding.Td_2m ?? model_sounding.Td[fallback_idx];
    const exner_sfc  = exner(p_sfc_pa);
    const theta_sfc  = T_env_sfc / exner_sfc;
    const qt_sfc     = qsat(Td_env_sfc, p_sfc_pa);
    const thetav_sfc = virtual_temp(theta_sfc, qt_sfc);
    const rho_sfc    = p_sfc_pa / (Rd * exner_sfc * thetav_sfc);

    return { p_sfc_pa, T_env_sfc, Td_env_sfc, exner_sfc, theta_sfc, qt_sfc, thetav_sfc, rho_sfc };
}

function draw_skewt()
{
    svg.selectAll("*").remove();

    const W = svg.node().clientWidth - margin.left - margin.right;

    const headerEl  = document.querySelector('header');
    const toolbarEl = document.querySelector('.plot-toolbar');
    const plotEl    = svg.node().closest('.plot');
    const plotStyle = getComputedStyle(plotEl);
    const vPad = parseFloat(plotStyle.paddingTop) + parseFloat(plotStyle.paddingBottom);
    const svgH = window.innerHeight
        - (headerEl  ? headerEl.offsetHeight  : 0)
        - (toolbarEl ? toolbarEl.offsetHeight : 0)
        - vPad;
    svg.attr("height", svgH);
    const H = svgH - margin.top - margin.bottom;

    if (W <= 0 || H <= 0) return;

    const x = current_zoom.rescaleX(d3.scaleLinear().domain([-40, 50]).range([0, W]));
    const y = current_zoom.rescaleY(d3.scaleLog().domain([1013, +document.getElementById("p_top").value]).range([H, 0]));

    const g = svg.append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    g.append("rect")
        .attr("width", W).attr("height", H)
        .attr("fill", "white").attr("stroke", "#ccc");

    // Clip path so background lines don't overflow the plot area.
    g.append("clipPath").attr("id", "skewt-clip")
        .append("rect").attr("width", W).attr("height", H);

    const chart = g.append("g").attr("clip-path", "url(#skewt-clip)");

    if (document.getElementById("show_isobars").checked)
        draw_isobars(chart, y, W);

    const show_model = document.getElementById("show_model_sounding").checked;

    if (model_sounding && show_model && model_sounding.z)
        draw_height_labels(chart, y, model_sounding.p_hpa, model_sounding.z, model_sounding.surface_pressure_hpa);

    if (bg_data)
    {
        if (document.getElementById("show_isotherms").checked)
            draw_skewt_lines(chart, x, y, bg_data.isotherms,      bg_data.p_isotherms, "rgba(179,179,179,0.5)");
        if (document.getElementById("show_isohumes").checked)
        {
            draw_skewt_lines(chart, x, y, bg_data.isohumes, bg_data.p_isohumes, "rgba(31,119,180,0.5)");
            if (document.getElementById("label_isohumes").checked)
                draw_isohume_labels(chart, x, y, bg_data.isohumes, bg_data.p_isohumes, bg_data.isohume_mixing_ratios);
        }
        if (document.getElementById("show_dry_adiabats").checked)
            draw_skewt_lines(chart, x, y, bg_data.dry_adiabats,   bg_data.p_dry,       "rgba(214,39,40,0.5)");
        if (document.getElementById("show_moist_adiabats").checked)
            draw_skewt_lines(chart, x, y, bg_data.moist_adiabats, bg_data.p_moist,     "rgba(13,145,70,0.5)");
    }

    if (model_sounding && show_model)
    {
        const line = d3.line()
            .x(d => x(d[0]))
            .y(d => y(d[1]));

        const sfc_p_hpa = model_sounding.surface_pressure_hpa ?? Math.max(...model_sounding.p_hpa);

        // Surface data point (2 m values at actual surface pressure).
        const sfc_pt_T  = [skew_transform(model_sounding.T_2m  ?? model_sounding.T[0],  sfc_p_hpa), sfc_p_hpa];
        const sfc_pt_Td = [skew_transform(model_sounding.Td_2m ?? model_sounding.Td[0], sfc_p_hpa), sfc_p_hpa];

        // Pressure-level points filtered to above (or at) the surface.
        const lev_pts_T  = model_sounding.T.map( (t, i) => [skew_transform(t, model_sounding.p_hpa[i]), model_sounding.p_hpa[i]]).filter(d => d[1] <= sfc_p_hpa);
        const lev_pts_Td = model_sounding.Td.map((t, i) => [skew_transform(t, model_sounding.p_hpa[i]), model_sounding.p_hpa[i]]).filter(d => d[1] <= sfc_p_hpa);

        const t_pts  = [sfc_pt_T,  ...lev_pts_T];
        const td_pts = [sfc_pt_Td, ...lev_pts_Td];

        // Surface pressure line.
        chart.append("line")
            .attr("x1", 0).attr("y1", y(sfc_p_hpa))
            .attr("x2", W).attr("y2", y(sfc_p_hpa))
            .attr("stroke", "#666")
            .attr("stroke-width", 1.5)
            .attr("stroke-dasharray", "4,3");
        chart.append("text")
            .attr("x", W - 4 - STAFF_LEN * Math.min(1, H / 600))
            .attr("y", y(sfc_p_hpa) - 3)
            .attr("text-anchor", "end")
            .attr("font-size", "11px")
            .attr("fill", "#666")
            .text(`sfc: ${Math.round(sfc_p_hpa)} hPa`);

        function redraw_parcel()
        {
            chart.selectAll(".parcel-path").remove();

            if (!document.getElementById("launch_parcel").checked) return;

            const parcel_line = d3.line()
                .x(d => x(skew_transform(d[0], d[1])))
                .y(d => y(d[1]));

            const draw_parcel_segments = (segments) =>
                segments.forEach(([p_arr, T_arr]) =>
                {
                    chart.append("path")
                        .attr("class", "parcel-path")
                        .datum(p_arr.map((p, i) => [T_arr[i], p / 100]))
                        .attr("fill", "none")
                        .attr("stroke", "#000")
                        .attr("stroke-width", 2)
                        .attr("stroke-dasharray", "6,3")
                        .attr("d", parcel_line);
                });

            const mode      = document.getElementById("parcel_mode").value;
            const p_pa_all  = model_sounding.p_hpa.map(p => p * 100);
            const surf      = get_surface_state();

            const T_s  = surf.T_env_sfc + surf.dtheta * surf.exner_sfc;
            const Td_s = dewpoint(surf.qt_sfc + surf.dq, surf.p_sfc_pa);

            // Index of the first pressure level strictly above the surface.
            // p_pa_all is sorted descending (highest pressure first).
            const idx_above = p_pa_all.findIndex(p => p < surf.p_sfc_pa);

            if (mode === "non_entraining")
            {
                // Parcel grid: surface pressure + all levels above it.
                const p_above = idx_above === -1 ? [] : p_pa_all.slice(idx_above);
                const p_parcel = [surf.p_sfc_pa, ...p_above].sort((a, b) => b - a);

                const parcel = calc_non_entraining_parcel(T_s, Td_s, surf.p_sfc_pa, p_parcel);

                draw_parcel_segments([
                    [parcel.p_dry,     parcel.T_dry],
                    [parcel.p_isohume, parcel.T_isohume],
                    [parcel.p_moist,   parcel.T_moist],
                ]);
            }
            else if (mode === "entraining")
            {
                if (idx_above === -1) return;

                // Interpolate z_agl at the surface pressure for height referencing.
                let z_sfc_agl;
                if (idx_above === 0)
                {
                    z_sfc_agl = 0;
                }
                else
                {
                    const i0 = idx_above - 1;
                    const i1 = idx_above;
                    const lp0 = Math.log(p_pa_all[i0]);
                    const lp1 = Math.log(p_pa_all[i1]);
                    const t   = (Math.log(surf.p_sfc_pa) - lp0) / (lp1 - lp0);
                    z_sfc_agl = model_sounding.z_agl[i0] + t * (model_sounding.z_agl[i1] - model_sounding.z_agl[i0]);
                }

                // Environment: surface point followed by all levels above the surface.
                const p_env  = [surf.p_sfc_pa,  ...p_pa_all.slice(idx_above)];
                const T_env  = [surf.T_env_sfc, ...model_sounding.T.slice(idx_above)];
                const Td_env = [surf.Td_env_sfc, ...model_sounding.Td.slice(idx_above)];
                const z_env  = [0, ...model_sounding.z_agl.slice(idx_above).map(z => z - z_sfc_agl)];

                const area = 10 ** +document.getElementById("fire_area").value;

                const parcel = calc_entraining_parcel(
                    z_env, T_env, Td_env, p_env,
                    surf.dtheta, surf.dq, surf.w0, area,
                    { z_max: 12000 },
                );

                if (parcel.p.length === 0) return;

                // T for the full ascent; Td only below LCL (where type == 0).
                const lcl_idx = parcel.type.indexOf(1);
                const n_sub   = lcl_idx === -1 ? parcel.p.length : lcl_idx + 1;
                draw_parcel_segments([
                    [parcel.p,                 parcel.T],
                    [parcel.p.slice(0, n_sub), parcel.Td.slice(0, n_sub)],
                ]);
            }
        }

        function get_surface_state()
        {
            const base = get_surface_base();
            const w0 = w0_from_dtheta(fire_state.dtheta, base.thetav_sfc);
            return { ...base, dtheta: fire_state.dtheta, dq: fire_state.dq, w0 };
        }

        function draw_skewt_profile(pts, color, source_T, on_surface_drag)
        {
            const path = chart.append("path").datum(pts)
                .attr("fill", "none")
                .attr("stroke", color)
                .attr("stroke-width", 2.5)
                .attr("d", line);

            const drag = d3.drag()
                .on("start", function ()
                {
                    d3.select(this).style("cursor", "grabbing");
                })
                .on("drag", function (event, d)
                {
                    d[0] = x.invert(event.x);
                    d3.select(this).attr("cx", x(d[0]));
                    path.attr("d", line);

                    const i = model_sounding.p_hpa.indexOf(d[1]);
                    if (i !== -1)
                        source_T[i] = inv_skew_transform(d[0], d[1]);
                    else if (on_surface_drag)
                        on_surface_drag(inv_skew_transform(d[0], d[1]));

                    redraw_parcel();
                })
                .on("end", function ()
                {
                    d3.select(this).style("cursor", "grab");
                    draw_skewt();
                });

            if (document.getElementById("edit_mode").checked)
                chart.selectAll(null).data(pts).enter()
                    .append("circle")
                    .attr("cx", d => x(d[0]))
                    .attr("cy", d => y(d[1]))
                    .attr("r", 5)
                    .attr("fill", "white")
                    .attr("stroke", color)
                    .attr("stroke-width", 2)
                    .style("cursor", "grab")
                    .call(drag);
        }

        const update_T_sfc  = v => { model_sounding.T_2m  = v; };
        const update_Td_sfc = v => { model_sounding.Td_2m = v; };

        draw_skewt_profile(t_pts,  color_T,  model_sounding.T,  update_T_sfc);
        draw_skewt_profile(td_pts, color_Td, model_sounding.Td, update_Td_sfc);

        if (!document.getElementById("edit_mode").checked &&
             document.getElementById("launch_parcel").checked)
        {
            const sfc_p_hpa_marker = model_sounding.surface_pressure_hpa ?? Math.max(...model_sounding.p_hpa);

            const surf0  = get_surface_state();
            const T_marker_val  = () => {
                const s = get_surface_state();
                return s.T_env_sfc + s.dtheta * s.exner_sfc;
            };
            const Td_marker_val = () => {
                const s = get_surface_state();
                return dewpoint(s.qt_sfc + s.dq, s.p_sfc_pa);
            };

            const T_node = chart.append("circle")
                .attr("cx", x(skew_transform(surf0.T_env_sfc + surf0.dtheta * surf0.exner_sfc, sfc_p_hpa_marker)))
                .attr("cy", y(sfc_p_hpa_marker))
                .attr("r", 5)
                .attr("fill", "white")
                .attr("stroke", "#000")
                .attr("stroke-width", 2)
                .style("cursor", "grab");

            const Td_node = chart.append("circle")
                .attr("cx", x(skew_transform(dewpoint(surf0.qt_sfc + surf0.dq, surf0.p_sfc_pa), sfc_p_hpa_marker)))
                .attr("cy", y(sfc_p_hpa_marker))
                .attr("r", 5)
                .attr("fill", "white")
                .attr("stroke", "#000")
                .attr("stroke-width", 2)
                .style("cursor", "grab");

            const reposition_markers = () =>
            {
                T_node.attr("cx",  x(skew_transform(T_marker_val(),  sfc_p_hpa_marker)));
                Td_node.attr("cx", x(skew_transform(Td_marker_val(), sfc_p_hpa_marker)));
            };

            const make_drag = (axis) => d3.drag()
                .on("start", function () { d3.select(this).style("cursor", "grabbing"); })
                .on("drag", function (event)
                {
                    const s = get_surface_state();
                    const val_new = inv_skew_transform(x.invert(event.x), sfc_p_hpa_marker);
                    if (axis === "T")
                        fire_state.dtheta = Math.max(0, (val_new - s.T_env_sfc) / s.exner_sfc);
                    else
                        fire_state.dq = Math.max(0, qsat(val_new, s.p_sfc_pa) - s.qt_sfc);
                    sync_flux_controls();
                    reposition_markers();
                    redraw_parcel();
                })
                .on("end", function () { d3.select(this).style("cursor", "grab"); draw_skewt(); });

            T_node.call(make_drag("T"));
            Td_node.call(make_drag("Td"));
        }

        redraw_parcel();
    }

    if (obs_sounding)
    {
        const line = d3.line().x(d => x(d[0])).y(d => y(d[1]));

        const t_pts  = obs_sounding.T.map( (t, i) => [skew_transform(t,  obs_sounding.p_hpa[i]), obs_sounding.p_hpa[i]]);
        const td_pts = obs_sounding.Td.map((t, i) => [skew_transform(t, obs_sounding.p_hpa[i]), obs_sounding.p_hpa[i]]);

        chart.append("path").datum(t_pts)
            .attr("fill", "none").attr("stroke", color_T)
            .attr("stroke-width", 2.5).attr("stroke-dasharray", "6,3").attr("d", line);

        chart.append("path").datum(td_pts)
            .attr("fill", "none").attr("stroke", color_Td)
            .attr("stroke-width", 2.5).attr("stroke-dasharray", "6,3").attr("d", line);
    }

    if ((model_sounding && show_model) || obs_sounding)
    {
        const legend_items = [];

        if (model_sounding && show_model)
        {
            legend_items.push({ label: "T (model)",  color: color_T  });
            legend_items.push({ label: "Td (model)", color: color_Td });
        }
        if (obs_sounding)
        {
            legend_items.push({ label: `T (obs ${obs_sounding.time})`,  color: color_T,  dashes: "6,3" });
            legend_items.push({ label: `Td (obs ${obs_sounding.time})`, color: color_Td, dashes: "6,3" });
        }
        if (model_sounding && show_model && document.getElementById("launch_parcel").checked)
            legend_items.push({ label: "Parcel", color: "#000", dashes: "6,3" });

        const line_len = 22;
        const row_h    = 22;

        const legend = g.append("g").attr("transform", "translate(10,10)");

        legend_items.forEach((item, i) =>
        {
            const y_off = i * row_h;
            legend.append("line")
                .attr("x1", 0).attr("x2", line_len)
                .attr("y1", y_off + 6).attr("y2", y_off + 6)
                .attr("stroke", item.color)
                .attr("stroke-width", 2.5)
                .attr("stroke-dasharray", item.dashes ?? null);
            legend.append("text")
                .attr("x", line_len + 6).attr("y", y_off + 10)
                .attr("text-anchor", "start")
                .style("font-size", font_size)
                .style("fill", "#333")
                .text(item.label);
        });
    }

    if (model_sounding && show_model && model_sounding.ws)
    {
        const ms_to_kts   = 1.94384;
        const barb_scale  = Math.min(1, H / 600);
        const barb_sfc_p  = model_sounding.surface_pressure_hpa ?? Math.max(...model_sounding.p_hpa);
        model_sounding.p_hpa.forEach((p, i) =>
        {
            if (p > barb_sfc_p) return;  // below surface, skip
            // In the 900–1000 hPa band keep only the 50 hPa grid (1000, 950, 900).
            if (p > 900 && p % 50 !== 0) return;
            draw_wind_barb(g, W, y(p),
                model_sounding.ws[i] * ms_to_kts,
                model_sounding.wd[i],
                "black",
                barb_scale);
        });
    }

    g.append("g").call(d3.axisLeft(y)
        .tickValues([1000, 900, 800, 700, 600, 500, 400, 300, 200, 100])
        .tickFormat(d => d))
        .selectAll("text").style("font-size", font_size);

    g.append("g")
        .attr("transform", `translate(0,${H})`)
        .call(d3.axisBottom(x).ticks(8).tickFormat(d => d + "°"))
        .selectAll("text").style("font-size", font_size);

    g.append("text")
        .attr("transform", "rotate(-90)")
        .attr("x", -H / 2).attr("y", -42)
        .attr("text-anchor", "middle")
        .style("font-size", font_size)
        .text("Pressure (hPa)");

    g.append("text")
        .attr("x", W / 2).attr("y", H + 38)
        .attr("text-anchor", "middle")
        .style("font-size", font_size)
        .text("Temperature (°C)");

    if (model_forecast)
    {
        const lat = document.getElementById("lat_input").value;
        const lon = document.getElementById("lon_input").value;
        const date = document.getElementById("date_input").value;
        const model = document.getElementById("model_select").selectedOptions[0].text;
        const time = model_forecast.times[current_time];
        const selected_case = document.getElementById("case_select").value;
        const case_prefix = selected_case ? document.getElementById("case_select").selectedOptions[0].text + "  |  " : "";

        g.append("text")
            .attr("x", W / 2).attr("y", -10)
            .attr("text-anchor", "middle")
            .style("font-size", font_size)
            .style("fill", "#444")
            .text(`${case_prefix}${lat}°N, ${lon}°E  |  ${date} ${time} UTC  |  model: ${model}`);
    }
}

function set_obs_sounding(data)
{
    obs_sounding = { p_hpa: data.p_hpa, T: data.T, Td: data.Td, time: data.time };
    document.getElementById("radiosonde_controls").style.display = "";
    draw_skewt();
}

document.getElementById("sounding_upload").addEventListener("change", (e) =>
{
    const file = e.target.files[0];
    if (!file) return;

    const form_data = new FormData();
    form_data.append("file", file);

    fetch("/api/upload_sounding", { method: "POST", body: form_data })
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.detail); }); return r.json(); })
        .then(data => set_obs_sounding(data))
        .catch(err => alert("Upload failed: " + err.message));
});

document.getElementById("fetch_sounding_btn").addEventListener("click", () =>
{
    const station = document.getElementById("station_select").value;
    const date    = document.getElementById("date_input").value;
    const hour    = document.getElementById("sounding_time_select").value;

    if (!station || !date) return;

    const spinner = document.getElementById("plot_spinner");
    spinner.style.display = "";

    fetch(`/api/radiosonde_sounding?station=${station}&date=${date}&hour=${hour}`)
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.detail); }); return r.json(); })
        .then(data => { spinner.style.display = "none"; set_obs_sounding(data); })
        .catch(err => { spinner.style.display = "none"; alert("Failed to fetch sounding. " + err.message); });
});

document.getElementById("match_profile_btn").addEventListener("click", () =>
{
    if (!model_sounding || !obs_sounding) return;

    const smooth_p = (pairs, half_width_hpa) =>
    {
        if (half_width_hpa <= 0) return pairs;
        return pairs.map(([p, _], i) =>
        {
            let sum_w = 0, sum_wv = 0;
            for (let j = 0; j < pairs.length; j++)
            {
                const d = (pairs[j][0] - p) / half_width_hpa;
                if (Math.abs(d) > 3) continue;
                const w = Math.exp(-0.5 * d * d);
                sum_w  += w;
                sum_wv += w * pairs[j][1];
            }
            return [p, sum_wv / sum_w];
        });
    };

    const prep_profile = (v_src) =>
    {
        const pairs = obs_sounding.p_hpa.map((p, i) => [p, v_src[i]])
            .filter(([p, v]) => Number.isFinite(p) && Number.isFinite(v))
            .sort((a, b) => b[0] - a[0]);
        return smooth_p(pairs, MATCH_PROFILE_SMOOTHING_HPA);
    };

    const interp_log_p = (p_target, pairs) =>
    {
        if (pairs.length === 0) return NaN;
        if (p_target >= pairs[0][0]) return pairs[0][1];
        if (p_target <= pairs[pairs.length - 1][0]) return pairs[pairs.length - 1][1];
        for (let i = 0; i < pairs.length - 1; i++)
        {
            const [p0, v0] = pairs[i];
            const [p1, v1] = pairs[i + 1];
            if (p_target <= p0 && p_target >= p1)
            {
                const f = (Math.log(p_target) - Math.log(p0)) / (Math.log(p1) - Math.log(p0));
                return v0 + f * (v1 - v0);
            }
        }
        return NaN;
    };

    const T_pairs  = prep_profile(obs_sounding.T);
    const Td_pairs = prep_profile(obs_sounding.Td);

    const p_obs_min = Math.min(...obs_sounding.p_hpa);
    const p_obs_max = Math.max(...obs_sounding.p_hpa);

    model_sounding.p_hpa.forEach((p, i) =>
    {
        if (p <= p_obs_max && p >= p_obs_min)
        {
            model_sounding.T[i]  = interp_log_p(p, T_pairs);
            model_sounding.Td[i] = interp_log_p(p, Td_pairs);
        }
    });

    draw_skewt();
});

document.querySelectorAll(".remove_sounding_btn").forEach(b => b.addEventListener("click", () =>
{
    obs_sounding = null;
    document.getElementById("sounding_upload").value = "";
    document.getElementById("radiosonde_controls").style.display = "none";
    draw_skewt();
}));

document.getElementById("download_btn").addEventListener("click", () =>
{
    const node = document.querySelector(".plot");
    domtoimage.toPng(node).then(data_url =>
    {
        const a = document.createElement("a");
        a.download = "skewt.png";
        a.href = data_url;
        a.click();
    });
});

draw_skewt();

window.addEventListener("resize", draw_skewt);
