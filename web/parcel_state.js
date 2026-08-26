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

// One violet-to-magenta ramp: cool hues stay vivid on white right up to their light end,
// where a warm ramp would fade to straw. The three steps take the widest arc the diagram
// leaves free, from just clear of the blues (isohumes, Td) to just short of the pink
// model T, and move in lightness as well as hue, so no de-emphasised parcel can be read
// as the next one up the scale. They share a family with the isotherms, which are thin
// and half-transparent against a heavy dashed parcel line. Capped at three to keep the
// steps this far apart.
export const PALETTE = ["#251188", "#aa17cf", "#ee2ba6"];
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
