//
// Copyright 2026 Wageningen University & Research (WUR)
// Author: Bart van Stratum
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
import { exner, qsat } from "./thermo.js";

const svg = d3.select("#skewt");

const margin = { top: 30, right: 30, bottom: 65, left: 70 };

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
let parcel_starts = null;

const color_T   = "#EB0056";
const color_Td  = "#0056EB";
const font_size = "14px";

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
        current_time = 12;

        const slider = document.getElementById("time_slider");
        slider.max = data.times.length - 1;
        slider.value = current_time;

        document.getElementById("time_label").textContent = data.times[current_time] + " UTC";
        document.getElementById("time_section").style.display = "";

        model_sounding = {
            p_hpa:  data.p_hpa,
            T:      data.T[current_time],
            Td:     data.Td[current_time],
            z_agl:  data.z_agl[current_time],
            theta:  data.theta[current_time],
            thetav: data.thetav[current_time],
            qt:     data.qt[current_time],
        };

        const sfc_idx = data.p_hpa.indexOf(Math.max(...data.p_hpa));
        parcel_starts = data.T.map((T_arr, ti) => ({
            T:  T_arr[sfc_idx],
            Td: data.Td[ti][sfc_idx],
        }));

        document.getElementById("launch_parcel").disabled = false;
        draw_skewt();
    });
});

document.getElementById("time_slider").addEventListener("input", (e) =>
{
    if (!model_forecast) return;

    current_time = +e.target.value;
    document.getElementById("time_label").textContent = model_forecast.times[current_time] + " UTC";

    model_sounding = {
        p_hpa:  model_forecast.p_hpa,
        T:      model_forecast.T[current_time],
        Td:     model_forecast.Td[current_time],
        z_agl:  model_forecast.z_agl[current_time],
        theta:  model_forecast.theta[current_time],
        thetav: model_forecast.thetav[current_time],
        qt:     model_forecast.qt[current_time],
    };

    draw_skewt();
});

document.getElementById("launch_parcel").addEventListener("change", draw_skewt);
document.getElementById("parcel_mode").addEventListener("change", draw_skewt);
document.getElementById("fire_area").addEventListener("input", (e) =>
{
    const area_km2 = (10 ** (+e.target.value - 6)).toFixed(1);
    document.getElementById("fire_area_label").textContent =
        `Fire area: ${area_km2} km²`;
    draw_skewt();
});
document.getElementById("show_isobars").addEventListener("change", draw_skewt);
document.getElementById("show_isotherms").addEventListener("change", draw_skewt);
document.getElementById("show_isohumes").addEventListener("change", draw_skewt);
document.getElementById("show_dry_adiabats").addEventListener("change", draw_skewt);
document.getElementById("show_moist_adiabats").addEventListener("change", draw_skewt);
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

function draw_skewt()
{
    svg.selectAll("*").remove();

    const W = svg.node().clientWidth  - margin.left - margin.right;
    const H = svg.node().clientHeight - margin.top  - margin.bottom;
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

    if (bg_data)
    {
        if (document.getElementById("show_isotherms").checked)
            draw_skewt_lines(chart, x, y, bg_data.isotherms,      bg_data.p_isotherms, "rgba(179,179,179,0.5)");
        if (document.getElementById("show_isohumes").checked)
            draw_skewt_lines(chart, x, y, bg_data.isohumes,       bg_data.p_isohumes,  "rgba(31,119,180,0.5)");
        if (document.getElementById("show_dry_adiabats").checked)
            draw_skewt_lines(chart, x, y, bg_data.dry_adiabats,   bg_data.p_dry,       "rgba(214,39,40,0.5)");
        if (document.getElementById("show_moist_adiabats").checked)
            draw_skewt_lines(chart, x, y, bg_data.moist_adiabats, bg_data.p_moist,     "rgba(13,145,70,0.5)");
    }

    if (model_sounding)
    {
        const line = d3.line()
            .x(d => x(d[0]))
            .y(d => y(d[1]));

        const t_pts  = model_sounding.T.map( (t, i) => [skew_transform(t,  model_sounding.p_hpa[i]), model_sounding.p_hpa[i]]);
        const td_pts = model_sounding.Td.map((t, i) => [skew_transform(t,  model_sounding.p_hpa[i]), model_sounding.p_hpa[i]]);

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

            const mode = document.getElementById("parcel_mode").value;

            if (mode === "non_entraining")
            {
                const p_pa = model_sounding.p_hpa.map(p => p * 100);

                const p_pa_desc = [...p_pa].sort((a, b) => b - a);

                const parcel = calc_non_entraining_parcel(
                    parcel_starts[current_time].T,
                    parcel_starts[current_time].Td,
                    p_pa_desc[0],
                    p_pa_desc,

                );

                draw_parcel_segments([
                    [parcel.p_dry,    parcel.T_dry],
                    [parcel.p_isohume, parcel.T_isohume],
                    [parcel.p_moist,  parcel.T_moist],
                ]);
            }
            else if (mode === "entraining")
            {
                const area   = 10 ** +document.getElementById("fire_area").value;
                const p_pa   = model_sounding.p_hpa.map(p => p * 100);
                const p_sfc  = p_pa[0];
                const T_s    = parcel_starts[current_time].T;
                const Td_s   = parcel_starts[current_time].Td;
                const dtheta = T_s / exner(p_sfc) - model_sounding.T[0] / exner(p_sfc);
                const dq     = qsat(Td_s, p_sfc) - qsat(model_sounding.Td[0], p_sfc);

                const parcel = calc_entraining_parcel(
                    model_sounding.z_agl,
                    model_sounding.T,
                    model_sounding.Td,
                    p_pa,
                    dtheta,
                    dq,
                    area,
                    { z_max: 12000 },

                );

                // T for the full ascent; Td only below LCL (where type == 0).
                const lcl_idx = parcel.type.indexOf(1);
                const n_sub   = lcl_idx === -1 ? parcel.p.length : lcl_idx + 1;
                draw_parcel_segments([
                    [parcel.p,                  parcel.T],
                    [parcel.p.slice(0, n_sub),  parcel.Td.slice(0, n_sub)],
                ]);
            }
        }

        function draw_skewt_profile(pts, color, source_T)
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

        draw_skewt_profile(t_pts,  color_T,  model_sounding.T);
        draw_skewt_profile(td_pts, color_Td, model_sounding.Td);

        if (!document.getElementById("edit_mode").checked &&
             document.getElementById("launch_parcel").checked &&
             parcel_starts)
        {
            const p_pa_desc = [...model_sounding.p_hpa].sort((a, b) => b - a);
            const sfc_p_hpa = p_pa_desc[0];

            const draw_parcel_marker = (get_T, set_T, color) =>
            {
                const node = chart.append("circle")
                    .attr("cx", x(skew_transform(get_T(), sfc_p_hpa)))
                    .attr("cy", y(sfc_p_hpa))
                    .attr("r", 5)
                    .attr("fill", "white")
                    .attr("stroke", color)
                    .attr("stroke-width", 2)
                    .style("cursor", "grab");

                node.call(d3.drag()
                    .on("start", function () { d3.select(this).style("cursor", "grabbing"); })
                    .on("drag",  function (event) {
                        set_T(inv_skew_transform(x.invert(event.x), sfc_p_hpa));
                        node.attr("cx", x(skew_transform(get_T(), sfc_p_hpa)));
                        redraw_parcel();
                    })
                    .on("end",   function () { d3.select(this).style("cursor", "grab"); })
                );
            };

            draw_parcel_marker(
                ()  => parcel_starts[current_time].T,
                val => { parcel_starts[current_time].T = val; },
                "#000"
            );
            draw_parcel_marker(
                ()  => parcel_starts[current_time].Td,
                val => { parcel_starts[current_time].Td = val; },
                "#000"
            );
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

    if (model_sounding || obs_sounding)
    {
        const legend_items = [];

        if (model_sounding)
        {
            legend_items.push({ label: "T (model)",  color: color_T  });
            legend_items.push({ label: "Td (model)", color: color_Td });
        }
        if (obs_sounding)
        {
            legend_items.push({ label: `T (obs ${obs_sounding.time})`,  color: color_T,  dashes: "6,3" });
            legend_items.push({ label: `Td (obs ${obs_sounding.time})`, color: color_Td, dashes: "6,3" });
        }
        if (model_sounding && document.getElementById("launch_parcel").checked)
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
    document.querySelectorAll(".remove_sounding_btn").forEach(b => b.style.display = "");
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

    fetch(`/api/radiosonde_sounding?station=${station}&date=${date}&hour=${hour}`)
        .then(r => { if (!r.ok) return r.json().then(e => { throw new Error(e.detail); }); return r.json(); })
        .then(data => set_obs_sounding(data))
        .catch(err => alert("Failed to fetch sounding. " + err.message));
});

document.querySelectorAll(".remove_sounding_btn").forEach(b => b.addEventListener("click", () =>
{
    obs_sounding = null;
    document.getElementById("sounding_upload").value = "";
    document.querySelectorAll(".remove_sounding_btn").forEach(b => b.style.display = "none");
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