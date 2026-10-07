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


// Ventilated plume base: heat leaves a control volume of height H0 and along-wind depth
// L = sqrt(area) both upward (w0) and downwind (u_vent = s·H0/L, s the environmental wind
// speed at H0), so
//
//     H = ρ·cp·dθ·(w0 + u_vent),    w0² = K·dθ,    K = 3·g·A_W·H0 / (2·θv·(1+B_W)).
//
// Without wind this reduces to w0³ = C·H. The base area A_f·(w0 + u_vent)/w0 includes the
// air vented downwind, so that the plume carries the fire's full heat flux.
export function w0_from_dtheta(dtheta, thetav)
{
    if (dtheta <= 0) return 0;
    return Math.sqrt(3 * g * A_W * H0_PLUME * dtheta / (2 * thetav * (1 + B_W)));
}

// Slider → state. Solves w0³ + u_vent·w0² = K·H/(ρ·cp) by Newton, starting from the
// windless root, which lies above the solution so the iteration converges monotonically.
export function dtheta_from_H(H, rho, thetav, u_vent)
{
    if (H <= 0) return 0;
    const K = 3 * g * A_W * H0_PLUME / (2 * thetav * (1 + B_W));
    const R = K * H / (rho * cp);
    let w0 = Math.cbrt(R);
    for (let it = 0; it < 50; it++)
    {
        const dw = (w0**3 + u_vent * w0**2 - R) / (3 * w0**2 + 2 * u_vent * w0);
        w0 -= dw;
        if (Math.abs(dw) < 1e-10 * w0) break;
    }
    return w0**2 / K;
}

export function dq_from_LE(LE, dtheta, rho, thetav, u_vent)
{
    const w0 = w0_from_dtheta(dtheta, thetav);
    if (w0 <= 0) return 0;
    return LE / (rho * Lv * (w0 + u_vent));
}

// State → display.
export function H_from_dtheta(dtheta, rho, thetav, u_vent)
{
    const w0 = w0_from_dtheta(dtheta, thetav);
    return w0 > 0 ? rho * cp * dtheta * (w0 + u_vent) : 0;
}

export function LE_from_dq(dq, dtheta, rho, thetav, u_vent)
{
    const w0 = w0_from_dtheta(dtheta, thetav);
    return w0 > 0 ? rho * Lv * dq * (w0 + u_vent) : 0;
}
