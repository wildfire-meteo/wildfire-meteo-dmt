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

export const PALETTE = ["#000000", "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00"];
export const MAX_PARCELS = PALETTE.length;

let next_id = 1;

// Color is derived from the currently live parcels rather than the id counter,
// so a color is freed for reuse when its parcel is removed.
export function make_parcel(existing)
{
    const used  = new Set(existing.map(p => p.color));
    const color = PALETTE.find(c => !used.has(c)) ?? PALETTE[existing.length % PALETTE.length];
    const id    = next_id++;

    return {
        id,
        name:         `Parcel ${id}`,
        color,
        mode:         "non_entraining",
        fire_area:    6,
        dtheta:       0,
        dq:           0,
    };
}
