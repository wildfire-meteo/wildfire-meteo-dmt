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

import { cp, Lv, g } from "./thermo.js";
import { A_W, B_W, H0_PLUME } from "./parcel.js";


// w0² = K·dθ  (K = 3·g·A_W·H0 / (2·θv·(1+B_W))), derived from w0³ = C·H, H = ρ·cp·dθ·w0.
export function w0_from_dtheta(dtheta, thetav)
{
    if (dtheta <= 0) return 0;
    return Math.sqrt(3 * g * A_W * H0_PLUME * dtheta / (2 * thetav * (1 + B_W)));
}

// Slider → state.
export function dtheta_from_H(H, rho, thetav)
{
    if (H <= 0) return 0;
    const K = 3 * g * A_W * H0_PLUME / (2 * thetav * (1 + B_W));
    return Math.pow(H / (rho * cp * Math.sqrt(K)), 2 / 3);
}

export function dq_from_LE(LE, dtheta, rho, thetav)
{
    const w0 = w0_from_dtheta(dtheta, thetav);
    if (w0 <= 0) return 0;
    return LE / (rho * Lv * w0);
}

// State → display.
export function H_from_dtheta(dtheta, rho, thetav)
{
    return rho * cp * dtheta * w0_from_dtheta(dtheta, thetav);
}

export function LE_from_dq(dq, dtheta, rho, thetav)
{
    return rho * Lv * dq * w0_from_dtheta(dtheta, thetav);
}
