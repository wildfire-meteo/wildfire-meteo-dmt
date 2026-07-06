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

import { set_tz_name, on_display_change, set_reference, get_entry_mode_local, set_entry_mode_local, get_offset_label, read_utc_datetime, to_display_datetime } from "./time_utils.js";

function reset_case_select()
{
    document.getElementById("case_select").value = "";
}

// Recomputes the one shared offset from whatever is currently displayed, and
// notifies every subscriber (this label, the model slider, the plot title).
// Call this any time the date/time fields, the zone, or the entry mode change
// — it's the single choke point that keeps all three in lockstep.
function refresh_reference()
{
    set_reference(document.getElementById("date_input").value, document.getElementById("time_input").value);
}

function refresh_time_entry_label()
{
    document.getElementById("time_input_label").textContent = get_entry_mode_local() ? `Time (${get_offset_label()})` : "Time (UTC)";
}

on_display_change(refresh_time_entry_label);

// Resolves the IANA timezone for a location. Fire-and-forget: only affects
// the input-entry conversion and labels next time they're read or re-rendered.
function fetch_timezone(lat, lon)
{
    return fetch(`/api/timezone?lat=${lat}&lon=${lon}`)
        .then(r => r.json())
        .then(({ tz }) => { set_tz_name(tz); refresh_reference(); })
        .catch(() => {});
}

function fetch_nearest_stations()
{
    const lat = document.getElementById("lat_input").value;
    const lon = document.getElementById("lon_input").value;
    if (!lat || !lon) return;

    fetch_timezone(lat, lon);

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

function write_now()
{
    const now = new Date();
    const disp = to_display_datetime(now.toISOString().slice(0, 10), now.toISOString().slice(11, 16));
    document.getElementById("date_input").value = disp.date;
    document.getElementById("time_input").value = disp.time;
    refresh_reference();
}

function set_location(lat, lon, reset_time = true)
{
    document.getElementById("lat_input").value  = lat;
    document.getElementById("lon_input").value  = lon;
    if (reset_time)
    {
        write_now();
        // Timezone for this location may not be resolved yet (e.g. right after
        // geolocating for the first time) — redraw "now" once it lands.
        fetch_timezone(lat, lon).then(write_now);
    }
    reset_case_select();
    fetch_nearest_stations();
}

document.getElementById("local_time_checkbox").addEventListener("change", (e) =>
{
    const date_el = document.getElementById("date_input");
    const time_el = document.getElementById("time_input");
    const utc = read_utc_datetime(date_el.value, time_el.value);

    set_entry_mode_local(e.target.checked);

    const disp = to_display_datetime(utc.date, utc.time);
    date_el.value = disp.date;
    time_el.value = disp.time;
    refresh_reference();
});

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
let _pending_lat = null;
let _pending_lon = null;

function init_leaflet_map()
{
    _leaflet_map = L.map("world_map", { worldCopyJump: true }).setView([20, 0], 2);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(_leaflet_map);

    _leaflet_map.on("click", (e) =>
    {
        _pending_lat = e.latlng.lat;
        _pending_lon = ((e.latlng.lng + 540) % 360) - 180;
        if (_leaflet_marker)
            _leaflet_marker.setLatLng([_pending_lat, _pending_lon]);
        else
            _leaflet_marker = L.marker([_pending_lat, _pending_lon]).addTo(_leaflet_map);
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
    _pending_lat = null;
    _pending_lon = null;
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
document.getElementById("map_ok_btn").addEventListener("click", () =>
{
    if (_pending_lat !== null && _pending_lon !== null)
    {
        hide_map();
        set_location(_pending_lat.toFixed(4), _pending_lon.toFixed(4), false);
        document.getElementById("plot_spinner").style.display = "";
        document.getElementById("fetch_model_btn").click();
        _pending_lat = null;
        _pending_lon = null;
    }
    else
        hide_map();
});
document.getElementById("map_cancel_btn").addEventListener("click", () =>
{
    _pending_lat = null;
    _pending_lon = null;
    hide_map();
});

document.addEventListener("keydown", (e) =>
{
    if (e.key === "Escape" && document.getElementById("map_container").style.display !== "none")
        hide_map();
});

for (const id of ["lat_input", "lon_input"])
    document.getElementById(id).addEventListener("input", () => { reset_case_select(); fetch_nearest_stations(); });

document.getElementById("date_input").addEventListener("input", () => { reset_case_select(); refresh_reference(); });
document.getElementById("time_input").addEventListener("input", () => { reset_case_select(); refresh_reference(); });

document.getElementById("case_select").addEventListener("change", (e) =>
{
    if (!e.target.value) return;
    const [, date, lat, lon] = e.target.value.split("|");
    document.getElementById("lat_input").value  = lat;
    document.getElementById("lon_input").value  = lon;
    // Cases only carry a UTC date (no time). Anchor on UTC noon so the
    // displayed calendar date doesn't flip near a local-time day boundary.
    document.getElementById("date_input").value = to_display_datetime(date, "12:00").date;
    refresh_reference();
    fetch_nearest_stations();
});

here_and_now();