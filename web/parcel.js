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

import { Rd, g, exner, qsat, dewpoint, calc_moist_adiabat, sat_adjust, virtual_temp } from "./thermo.js";


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


export function calc_non_entraining_parcel(T_sfc, Td_sfc, p_sfc, p)
{
    // p must be in Pa, sorted descending (surface to top).
    const theta_sfc = T_sfc / exner(p_sfc);
    const q_sfc     = qsat(Td_sfc, p_sfc);
    const { p_lcl, T_lcl } = find_lcl(T_sfc, Td_sfc, p_sfc);

    // Below LCL: isohume and dry adiabat.
    const p_dry    = [...p.filter(pi => pi >= p_lcl), p_lcl];
    const T_dry    = p_dry.map(pi => theta_sfc * exner(pi));
    const T_isohume = p_dry.map(pi => dewpoint(q_sfc, pi));

    // Above LCL: moist adiabat on a geomspace grid matching the background resolution.
    const p_top    = Math.min(...p);
    const log_step = Math.log(105000 / 10000) / (200 - 1);
    const n_moist  = Math.round(Math.log(p_lcl / p_top) / log_step) + 1;
    const p_moist  = Array.from({ length: n_moist }, (_, i) =>
        Math.exp(Math.log(p_lcl) + i * (Math.log(p_top) - Math.log(p_lcl)) / (n_moist - 1)));
    const T_moist = calc_moist_adiabat(T_lcl, p_moist);

    return {
        T_isohume,
        p_isohume: p_dry,
        T_dry,
        p_dry,
        T_moist,
        p_moist,
    };
}


export function calc_entraining_parcel(
    z_env, T_env, Td_env, p_env,
    dtheta_plume_s, dq_plume_s, area_plume_s,
    {
        fire_multiplier = 1,
        a_w    = 1.0,
        b_w    = 0.2,
        fac_ent = 0.8,
        beta   = 0.4,
        dz     = 50,
        z_max  = 5000,
    } = {})
{
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

    // Initial conditions. Fire perturbation is a dry heat excess (ql=0 at source),
    // so thetal_p == theta_p at the surface.
    thetal_p[0] = theta_e[0] + fire_multiplier * dtheta_plume_s;
    qt_p[0]     = qt_e[0]    + fire_multiplier * dq_plume_s;

    let { T, ql, qi } = sat_adjust(thetal_p[0], qt_p[0], p_e[0]);
    T_p[0]      = T;
    Tv_p[0]     = virtual_temp(T, qt_p[0], ql, qi);
    thetav_p[0] = Tv_p[0]/exner_e[0];
    area_p[0]   = area_plume_s;
    w_p[0]      = 0.1;
    mf_p[0]     = rho_e[0] * area_p[0] * w_p[0];

    // Entrainment settings (Morton formulation).
    const epsi = fac_ent * beta / Math.sqrt(area_plume_s);
    const delt = epsi / beta;

    ent_p[0] = epsi * mf_p[0];
    det_p[0] = 0.0;

    // Integrate upward.
    const w_eps = 1e-6;
    let i = 1;
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

        const buoy = g / thetav_e[i] * (thetav_p[i] - thetav_e[i]);
        const w2   = w_p[i-1]**2 + 2 * (a_w * buoy - b_w * epsi * w_p[i-1]**2) * dz;
        w_p[i]     = Math.sqrt(Math.max(0, w2));

        ent_p[i] = epsi * mf_p[i];
        det_p[i] = delt * mf_p[i];

        area_p[i] = mf_p[i] / (rho_e[i] * (w_p[i] + w_eps));

        if (area_p[i] <= 0 || w_p[i] < w_eps)
            break;
    }

    // Slice results to active portion and compute derived quantities.
    const sl     = arr => arr.slice(0, i);
    const z_out  = z.slice(0, i);
    const p_out  = sl(p_e);
    const T_out  = sl(T_p);
    const qt_out = sl(qt_p);
    // Cap Td at T: above LCL the parcel is saturated so Td == T.
    const Td_out = qt_out.map((q, k) => Math.min(dewpoint(q, p_out[k]), T_out[k]));

    // Post-process: pseudoadiabatic T above LCL so the line follows background theta_e lines.
    const lcl_k     = Array.from(type_p.slice(0, i)).indexOf(1);
    const T_pseudo  = lcl_k === -1
        ? T_out.slice()
        : [...T_out.slice(0, lcl_k), ...calc_moist_adiabat(T_out[lcl_k], p_out.slice(lcl_k))];

    return {
        T:           T_out,
        T_pseudo:    T_pseudo,
        Tv:          sl(Tv_p),
        Td:          Td_out,
        thetal:      sl(thetal_p),
        thetav:      sl(thetav_p),
        qt:          qt_out,
        area:        sl(area_p),
        w:           sl(w_p),
        mass_flux:   sl(mf_p),
        entrainment: sl(ent_p),
        detrainment: sl(det_p),
        type:        Array.from(type_p.slice(0, i)),
        z:           z_out,
        p:           p_out,
    };
}
