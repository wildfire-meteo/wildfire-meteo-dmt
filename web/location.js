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

function set_location(lat, lon)
{
    document.getElementById("lat_input").value  = lat;
    document.getElementById("lon_input").value  = lon;
    document.getElementById("date_input").value = new Date().toISOString().slice(0, 10);
    reset_case_select();
}

function here_and_now()
{
    if (navigator.geolocation)
    {
        navigator.geolocation.getCurrentPosition(
            (pos) => set_location(
                pos.coords.latitude.toFixed(4),
                pos.coords.longitude.toFixed(4)
            ),
            () => set_location(52, 6)
        );
    }
    else
    {
        set_location(52, 6);
    }
}

document.getElementById("here_and_now_btn").addEventListener("click", here_and_now);

for (const id of ["lat_input", "lon_input", "date_input"])
    document.getElementById(id).addEventListener("input", reset_case_select);

document.getElementById("case_select").addEventListener("change", (e) =>
{
    if (!e.target.value) return;
    const [, date, lat, lon] = e.target.value.split("|");
    document.getElementById("lat_input").value  = lat;
    document.getElementById("lon_input").value  = lon;
    document.getElementById("date_input").value = date;
});

here_and_now();
