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

let _leaflet_map = null;
let _leaflet_marker = null;

function init_leaflet_map()
{
    _leaflet_map = L.map("world_map", { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(_leaflet_map);

    _leaflet_map.on("click", (e) =>
    {
        const lat = e.latlng.lat;
        const lon = ((e.latlng.lng + 540) % 360) - 180;
        if (_leaflet_marker)
            _leaflet_marker.setLatLng([lat, lon]);
        else
            _leaflet_marker = L.marker([lat, lon]).addTo(_leaflet_map);
        hide_map();
        set_location(lat.toFixed(4), lon.toFixed(4));
        document.getElementById("plot_spinner").style.display = "";
        document.getElementById("fetch_model_btn").click();
    });
}

function center_map_on_current_inputs()
{
    const lat = parseFloat(document.getElementById("lat_input").value);
    const lon = parseFloat(document.getElementById("lon_input").value);
    if (!isNaN(lat) && !isNaN(lon))
    {
        _leaflet_map.setView([lat, lon], 6);
        if (_leaflet_marker)
            _leaflet_marker.setLatLng([lat, lon]);
        else
            _leaflet_marker = L.marker([lat, lon]).addTo(_leaflet_map);
        return true;
    }
    return false;
}

function show_map()
{
    document.getElementById("skewt").style.display = "none";
    document.getElementById("map_container").style.display = "";

    if (!_leaflet_map)
        init_leaflet_map();

    setTimeout(() =>
    {
        _leaflet_map.invalidateSize();
        if (!center_map_on_current_inputs() && navigator.geolocation)
        {
            navigator.geolocation.getCurrentPosition(
                (pos) => _leaflet_map.setView([pos.coords.latitude, pos.coords.longitude], 6),
                () => {}
            );
        }
    }, 0);
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