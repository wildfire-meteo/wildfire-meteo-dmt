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

function reset_case_select()
{
    document.getElementById("case_select").value = "";
}

function fetch_nearest_stations()
{
    const lat = document.getElementById("lat_input").value;
    const lon = document.getElementById("lon_input").value;
    if (!lat || !lon) return;

    fetch(`/api/nearest_stations?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(stations =>
        {
            const sel = document.getElementById("station_select");
            sel.innerHTML = "";
            stations.forEach(s =>
            {
                const opt = document.createElement("option");
                opt.value = s.code;
                opt.textContent = `${s.name} (${s.dist_km} km ${s.direction})`;
                sel.appendChild(opt);
            });
            sel.disabled = false;
            document.getElementById("fetch_sounding_btn").disabled = false;
        });
}

function set_location(lat, lon)
{
    const now = new Date();
    document.getElementById("lat_input").value  = lat;
    document.getElementById("lon_input").value  = lon;
    document.getElementById("date_input").value = now.toISOString().slice(0, 10);
    document.getElementById("time_input").value = now.toISOString().slice(11, 16);
    reset_case_select();
    fetch_nearest_stations();
}

function here_and_now(fetch_after = false)
{
    if (fetch_after)
        document.getElementById("plot_spinner").style.display = "";

    if (navigator.geolocation)
    {
        navigator.geolocation.getCurrentPosition(
            (pos) =>
            {
                set_location(pos.coords.latitude.toFixed(4), pos.coords.longitude.toFixed(4));
                if (fetch_after)
                    document.getElementById("fetch_model_btn").click();
            },
            () =>
            {
                document.getElementById("plot_spinner").style.display = "none";
                set_location(52, 6);
                const btn  = document.getElementById("here_and_now_btn");
                btn.disabled = true;
                btn.title    = "Enable location sharing in your browser to use this feature.";
            }
        );
    }
    else
    {
        document.getElementById("plot_spinner").style.display = "none";
        set_location(52, 6);
    }
}

document.getElementById("here_and_now_btn").addEventListener("click", () => here_and_now(true));

let _world_topology = null;

async function render_world_map()
{
    const container = document.getElementById("map_container");
    const svg = d3.select("#world_map");
    const width  = container.clientWidth;
    const height = container.clientHeight;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    const sphere = { type: "Sphere" };
    const projection = d3.geoNaturalEarth1().fitSize([width, height], sphere);
    const path = d3.geoPath(projection);

    svg.append("path").datum(sphere).attr("class", "map-sphere").attr("d", path);
    svg.append("path").datum(d3.geoGraticule()()).attr("class", "map-graticule").attr("d", path);

    if (!_world_topology)
        _world_topology = await fetch("https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json").then(r => r.json());

    const countries = topojson.feature(_world_topology, _world_topology.objects.countries);
    svg.append("g")
        .selectAll("path")
        .data(countries.features)
        .join("path")
        .attr("class", "map-country")
        .attr("d", path);

    svg.on("click", (event) =>
    {
        const [x, y] = d3.pointer(event);
        const coords = projection.invert([x, y]);
        if (!coords) return;
        const [lon, lat] = coords;
        if (isNaN(lon) || isNaN(lat)) return;
        if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return;
        hide_map();
        set_location(lat.toFixed(4), lon.toFixed(4));
        document.getElementById("plot_spinner").style.display = "";
        document.getElementById("fetch_model_btn").click();
    });
}

function show_map()
{
    document.getElementById("skewt").style.display = "none";
    document.getElementById("map_container").style.display = "";
    render_world_map();
}

function hide_map()
{
    document.getElementById("map_container").style.display = "none";
    document.getElementById("skewt").style.display = "";
}

document.getElementById("select_on_map_btn").addEventListener("click", show_map);
document.getElementById("map_cancel_btn").addEventListener("click", hide_map);

document.addEventListener("keydown", (e) =>
{
    if (e.key === "Escape" && document.getElementById("map_container").style.display !== "none")
        hide_map();
});

for (const id of ["lat_input", "lon_input"])
    document.getElementById(id).addEventListener("input", () => { reset_case_select(); fetch_nearest_stations(); });

document.getElementById("date_input").addEventListener("input", reset_case_select);
document.getElementById("time_input").addEventListener("input", reset_case_select);

document.getElementById("case_select").addEventListener("change", (e) =>
{
    if (!e.target.value) return;
    const [, date, lat, lon] = e.target.value.split("|");
    document.getElementById("lat_input").value  = lat;
    document.getElementById("lon_input").value  = lon;
    document.getElementById("date_input").value = date;
    fetch_nearest_stations();
});

here_and_now();