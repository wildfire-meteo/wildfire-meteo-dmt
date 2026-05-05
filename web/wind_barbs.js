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

// Meteorological wind barb constants (pixels).
const STAFF_LEN     = 35;   // total staff length
const BARB_LEN      = 14;   // full barb length
const BARB_SPACING  =  6;   // spacing between barbs along staff
const PENNANT_WIDTH =  8;   // pennant extent along staff
const BARB_ANGLE    = 60;   // degrees from staff (right-hand side, NH convention)

const _sin_a = Math.sin(BARB_ANGLE * Math.PI / 180);
const _cos_a = Math.cos(BARB_ANGLE * Math.PI / 180);


// Draw a single meteorological wind barb.
//
// Parameters:
//   g          – D3 selection to append into
//   x, y       – position of the calm/observation point (pixels)
//   speed_kts  – wind speed in knots
//   dir_deg    – wind direction, meteorological (degrees from north, clockwise)
//   color      – stroke/fill color (default "black")
//
// Encoding: half-line = 5 kt, full line = 10 kt, filled triangle = 50 kt.
// The staff points toward the direction the wind is blowing FROM.
export function draw_wind_barb(g, x, y, speed_kts, dir_deg, color = "black")
{
    const lw = 1.5;

    // Canonical orientation: staff points up (north). rotate(dir_deg) gives
    // the correct meteorological direction in SVG (clockwise from north).
    const barb_g = g.append("g")
        .attr("transform", `translate(${x},${y}) rotate(${dir_deg})`);

    // Calm: two concentric circles, no staff.
    if (speed_kts < 2.5)
    {
        barb_g.append("circle").attr("r", 4)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", lw);
        barb_g.append("circle").attr("r", 7)
            .attr("fill", "none").attr("stroke", color).attr("stroke-width", lw);
        return;
    }

    // Staff: calm end at origin, tip at (0, -STAFF_LEN).
    barb_g.append("line")
        .attr("x1", 0).attr("y1", 0)
        .attr("x2", 0).attr("y2", -STAFF_LEN)
        .attr("stroke", color).attr("stroke-width", lw);

    // Decompose speed into pennants (50 kt), full barbs (10 kt), half barbs (5 kt).
    let remaining   = Math.round(speed_kts / 5) * 5;
    const pennants  = Math.floor(remaining / 50); remaining -= pennants * 50;
    const full_barbs = Math.floor(remaining / 10); remaining -= full_barbs * 10;
    const half_barbs = Math.floor(remaining /  5);

    // t: distance from tip along staff (0 = tip, increases toward calm end).
    let t = 0;

    // Pennants (filled triangles). Two staff vertices + one apex.
    for (let i = 0; i < pennants; i++)
    {
        const y0 = -STAFF_LEN + t;
        const y1 = y0 + PENNANT_WIDTH;
        barb_g.append("polygon")
            .attr("points", `0,${y0} 0,${y1} ${BARB_LEN * _sin_a},${y0 + BARB_LEN * _cos_a}`)
            .attr("fill", color).attr("stroke", "none");
        t += PENNANT_WIDTH + 1;
    }

    // Small gap between pennants and barbs.
    if (pennants > 0 && (full_barbs + half_barbs) > 0)
        t += 2;

    // Full barbs.
    for (let i = 0; i < full_barbs; i++)
    {
        const y0 = -STAFF_LEN + t;
        barb_g.append("line")
            .attr("x1", 0).attr("y1", y0)
            .attr("x2", BARB_LEN * _sin_a).attr("y2", y0 + BARB_LEN * _cos_a)
            .attr("stroke", color).attr("stroke-width", lw);
        t += BARB_SPACING;
    }

    // Half barb. When it is the only feature, offset one spacing from the tip
    // so it cannot be mistaken for an endpoint artifact.
    if (half_barbs > 0)
    {
        if (pennants === 0 && full_barbs === 0)
            t = BARB_SPACING;
        const y0 = -STAFF_LEN + t;
        barb_g.append("line")
            .attr("x1", 0).attr("y1", y0)
            .attr("x2", (BARB_LEN / 2) * _sin_a).attr("y2", y0 + (BARB_LEN / 2) * _cos_a)
            .attr("stroke", color).attr("stroke-width", lw);
    }
}
