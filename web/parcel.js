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

import { Rd, g, exner, qsat, dewpoint, sat_adjust, virtual_temp } from "./thermo.js";


export const A_W      = 1.0;
export const B_W      = 0.2;
export const FAC_ENT  = 1;  // Non-dimensional scaling of entrainment, from Eyken (2026)
export const BETA     = 0.5; // The ratio fractional detrainment / fractional entrainment
export const DZ_PLUME = 50;
export const H0_PLUME = 20;


function interp(x, xp, fp)
{
    // Linear interpolation of fp at positions x, given sample points xp (ascending).
    const n = xp.length;
    return x.map(xi => {
        if (xi <= xp[0])    return fp[0];
        if (xi >= xp[n-1])  return fp[n-1];
        let lo = 0, hi = n - 1;
        while (hi - lo > 1) {
            const mid = (lo + hi) >> 1;
            if (xp[mid] <= xi) lo = mid; else hi = mid;
        }
        const t = (xi - xp[lo]) / (xp[hi] - xp[lo]);
        return fp[lo] + t * (fp[hi] - fp[lo]);
    });
}


export function find_lcl(T_sfc, Td_sfc, p_sfc, tol=5)
{
    const theta_sfc = T_sfc / exner(p_sfc);
    const q_sfc     = qsat(Td_sfc, p_sfc);

    const residual = p => theta_sfc * exner(p) - dewpoint(q_sfc, p);

    let p_lo = 500e2;
    let p_hi = p_sfc;

    while ((p_hi - p_lo) > tol)
    {
        const p_mid = 0.5 * (p_lo + p_hi);
        if (residual(p_mid) > 0)
            p_hi = p_mid;
        else
            p_lo = p_mid;
    }

    const p_lcl = 0.5 * (p_lo + p_hi);
    const T_lcl = theta_sfc * exner(p_lcl);

    return { p_lcl, T_lcl };
}


export function calc_parcel_ascent(
    z_env, T_env, Td_env, p_env,
    dtheta_plume_s, dq_plume_s, w0_plume_s, area_plume_s,
    {
        fire_multiplier = 1,
        a_w    = A_W,
        b_w    = B_W,
        fac_ent = FAC_ENT,
        beta   = BETA,
        dz     = DZ_PLUME,
        z_max  = 5000,
        full_ascent = false,
    } = {})
{
    const w_eps = 1e-6;

    if (w0_plume_s < w_eps)
        return {
            T: [], Tv: [], Td: [],
            theta: [], thetav: [], qt: [],
            area: [], w: [], buoy: [], mass_flux: [],
            entrainment: [], detrainment: [], type: [],
            z: [], p: [],
            k_top: -1, k_lcl: -1, stopped: false,
        };

    // Build uniform height grid.
    const n = Math.floor(z_max / dz);
    const z = Array.from({ length: n }, (_, i) => i * dz);

    // Interpolate environment to parcel grid, then derive thermodynamic variables.
    const T_e      = interp(z, z_env, T_env);
    const Td_e     = interp(z, z_env, Td_env);
    const p_e      = interp(z, z_env, p_env);

    const exner_e  = p_e.map(p => exner(p));
    const theta_e  = T_e.map((T, k) => T / exner_e[k]);
    const qt_e     = Td_e.map((Td, k) => qsat(Td, p_e[k]));
    const thetav_e = theta_e.map((th, k) => virtual_temp(th, qt_e[k]));
    const rho_e    = p_e.map((p, k) => p / (Rd * exner_e[k] * thetav_e[k]));

    // Allocate parcel arrays.
    const thetal_p = new Array(n);
    const qt_p     = new Array(n);
    const thetav_p = new Array(n);
    const T_p      = new Array(n);
    const Tv_p     = new Array(n);
    const area_p   = new Array(n);
    const w_p      = new Array(n);
    const mf_p     = new Array(n);
    const ent_p    = new Array(n);
    const det_p    = new Array(n);
    const type_p   = new Array(n).fill(0);
    const buoy_p   = new Array(n);

    // Initial conditions. Fire perturbation is a dry heat excess (ql=0 at source),
    // so thetal_p == theta_p at the surface.
    thetal_p[0] = theta_e[0] + fire_multiplier * dtheta_plume_s;
    qt_p[0]     = qt_e[0]    + fire_multiplier * dq_plume_s;

    let { T, ql, qi } = sat_adjust(thetal_p[0], qt_p[0], p_e[0]);
    T_p[0]      = T;
    Tv_p[0]     = virtual_temp(T, qt_p[0], ql, qi);
    thetav_p[0] = Tv_p[0]/exner_e[0];
    buoy_p[0]   = g / thetav_e[0] * (thetav_p[0] - thetav_e[0]);
    area_p[0]   = area_plume_s;
    w_p[0]      = w0_plume_s;
    mf_p[0]     = rho_e[0] * area_p[0] * w_p[0];

    // Entrainment settings (Morton formulation).
    const epsi = fac_ent / Math.sqrt(area_plume_s);
    const delt = epsi * beta;

    ent_p[0] = epsi * mf_p[0];
    det_p[0] = 0.0;

    // Integrate upward. With full_ascent the thermodynamic path is carried on above the
    // level where the plume stops (k_top), giving the classic parcel construction.
    let i = 1;
    let k_top = -1;
    let stopped = false;
    for (; i < n; i++)
    {
        mf_p[i]     = mf_p[i-1] + (ent_p[i-1] - det_p[i-1]) * dz;
        // TODO: use thetal_e here instead of theta_e. Currently theta_e == thetal_e only
        // because the environment is assumed unsaturated (ql_e = 0). If the environment
        // is saturated, entrained air carries condensate and theta_e > thetal_e.
        thetal_p[i] = thetal_p[i-1] - ent_p[i-1] * (thetal_p[i-1] - theta_e[i-1]) / mf_p[i-1] * dz;
        qt_p[i]     = qt_p[i-1]     - ent_p[i-1] * (qt_p[i-1]     - qt_e[i-1])    / mf_p[i-1] * dz;

        ({ T, ql, qi } = sat_adjust(thetal_p[i], qt_p[i], p_e[i]));

        // Pseudoadiabatic: remove condensate so it does not accumulate in the parcel.
        qt_p[i]    -= ql;
        thetal_p[i] = T / exner_e[i];

        T_p[i]      = T;
        Tv_p[i]     = virtual_temp(T, qt_p[i], 0, 0);
        thetav_p[i] = Tv_p[i] / exner_e[i];

        if (ql > 0 || qi > 0)
            type_p[i] = 1;

        buoy_p[i] = g / thetav_e[i] * (thetav_p[i] - thetav_e[i]);

        // Once stopped the parcel stays stopped; only its thermodynamic path continues.
        const w2  = w_p[i-1]**2 + 2 * (a_w * buoy_p[i] - b_w * epsi * w_p[i-1]**2) * dz;
        w_p[i]    = k_top === -1 ? Math.sqrt(Math.max(0, w2)) : 0;

        ent_p[i] = epsi * mf_p[i];
        det_p[i] = delt * mf_p[i];

        area_p[i] = w_p[i] > w_eps ? mf_p[i] / (rho_e[i] * w_p[i]) : NaN;

        if (w_p[i] < w_eps || mf_p[i] <= 0)
        {
            if (k_top === -1) { k_top = i - 1; stopped = true; }
            if (!full_ascent) break;
        }
    }

    if (k_top === -1) k_top = i - 1;

    // Slice results to active portion and compute derived quantities.
    const sl     = arr => arr.slice(0, i);
    const z_out  = z.slice(0, i);
    const p_out  = sl(p_e);
    const T_out  = sl(T_p);
    const qt_out = sl(qt_p);
    // Cap Td at T: above LCL the parcel is saturated so Td == T.
    const Td_out = qt_out.map((q, k) => Math.min(dewpoint(q, p_out[k]), T_out[k]));

    const type_out = Array.from(type_p.slice(0, i));
    const k_lcl    = type_out.indexOf(1);

    return {
        T:           T_out,
        Tv:          sl(Tv_p),
        Td:          Td_out,
        thetal:      sl(thetal_p),
        thetav:      sl(thetav_p),
        qt:          qt_out,
        area:        sl(area_p),
        w:           sl(w_p),
        buoy:        sl(buoy_p),
        mass_flux:   sl(mf_p),
        entrainment: sl(ent_p),
        detrainment: sl(det_p),
        type:        type_out,
        z:           z_out,
        p:           p_out,
        k_top, k_lcl, stopped,
    };
}
