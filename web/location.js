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