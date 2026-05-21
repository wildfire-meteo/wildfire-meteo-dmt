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


// Forward: Given (H, LE) calculate (dtheta, dq, w0) at top of surface layer
export function compute_fire_surface(H, LE, rho, theta, thetav)
{
    const Fv = H + 0.61 * cp * theta * LE / Lv;
    if (Fv <= 0)
        return { dtheta: 0, dq: 0, w0: 0 };

    const w0 = Math.cbrt(3 * g * A_W * H0_PLUME * Fv
                         / (2 * rho * cp * thetav * (1 + B_W)));

    return {
        dtheta: H  / (rho * cp * w0),
        dq:     LE / (rho * Lv * w0),
        w0,
    };
}

// Inverse: Given (dtheta, dq) calculate (H, LE, w0).
export function invert_fire_surface(dtheta, dq, rho, theta, thetav)
{
    const w0_sq = 3 * g * A_W * H0_PLUME
                  / (2 * thetav * (1 + B_W))
                  * (dtheta + 0.61 * theta * dq);

    if (w0_sq <= 0)
        return { H: 0, LE: 0, w0: 0 };

    const w0 = Math.sqrt(w0_sq);
    return {
        H:  rho * cp * w0 * dtheta,
        LE: rho * Lv * w0 * dq,
        w0,
    };
}
