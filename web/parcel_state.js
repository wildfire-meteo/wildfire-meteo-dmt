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

// Hues deliberately kept clear of every other line on the diagram: red (dry adiabats),
// green (moist adiabats), blue (isohumes, Td) and purple (isotherms). Ordered so the
// first few parcels are the most distinct.
export const PALETTE = ["#000000", "#e8710a", "#00857f", "#b5179e", "#7f7a00", "#7a4a2a"];
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
