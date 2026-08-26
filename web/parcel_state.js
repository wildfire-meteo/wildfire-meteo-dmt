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

// One neutral ramp: the diagram's colored families are all spoken for (red dry adiabats,
// green moist adiabats, blue isohumes and Td, purple isotherms, pink model T), and grey
// is the one axis that collides with none of them. The steps are spread as far apart in
// lightness as the paper allows, and the parcel under edit is emphasised by weight alone
// (see LW_PARCEL in skewt.js) rather than by opacity, which on a neutral ramp would just
// restate the shade. Capped at three to keep the steps this far apart.
export const PALETTE = ["#000000", "#666666", "#9e9e9e"];
export const MAX_PARCELS = PALETTE.length;

let next_id = 1;

// Appends a counter only where one is needed, so a cloned name stays readable.
export function unique_name(name, existing)
{
    const used = new Set(existing.map(p => p.name));
    if (!used.has(name)) return name;

    let n = 2;
    while (used.has(`${name} ${n}`)) n++;
    return `${name} ${n}`;
}

// Name and color both take the lowest free slot among the live parcels, so removing a
// parcel frees both for reuse and no two parcels can end up sharing either. The id keeps
// counting up regardless: it is the stable key the editor and the plot select on.
export function make_parcel(existing)
{
    const used_colors = new Set(existing.map(p => p.color));
    const used_names  = new Set(existing.map(p => p.name));

    const color = PALETTE.find(c => !used_colors.has(c)) ?? PALETTE[existing.length % PALETTE.length];

    let n = 1;
    while (used_names.has(`Parcel ${n}`)) n++;

    return {
        id:           next_id++,
        name:         `Parcel ${n}`,
        color,
        mode:         "non_entraining",
        fire_area:    6,
        dtheta:       0,
        dq:           0,
        visible:      true,
    };
}
