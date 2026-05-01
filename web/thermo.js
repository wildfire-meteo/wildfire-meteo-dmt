//
// Copyright 2026 Wageningen University & Research (WUR)
// Author: Bart van Stratum
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

// Constants
export const Rd  = 287.04;
export const Rv  = 461.5;
export const cp  = 1005.0;
export const Lv  = 2.5e6;
export const p0  = 1e5;
export const eps = Rd / Rv;
export const e0  = 611.2;
export const a   = 17.67;
export const b   = 243.5;
export const T0  = 273.15;
export const g   = 9.81;


export function esat(T)
{
    const Tc = T - T0;
    return e0 * Math.exp(a * Tc / (Tc + b));
}


export function qsat(T, p)
{
    const es = esat(T);
    return eps * es / (p - (1.0 - eps) * es);
}


export function esat_from_q(q, p)
{
    return q * p / (eps + (1.0 - eps) * q);
}


export function dewpoint(q, p)
{
    const es  = esat_from_q(q, p);
    const lnr = Math.log(Math.max(Number.MIN_VALUE, es) / e0);
    const Tc  = b * lnr / (a - lnr);
    return Tc + T0;
}


export function exner(p)
{
    return (p / p0) ** (Rd / cp);
}


export function dqsatdT(T, p)
{
    const es     = esat(T);
    const Tc     = T - T0;
    const des_dT = es * a * b / (Tc + b) ** 2;
    const den    = p - (1.0 - eps) * es;
    return eps * p * des_dT / den ** 2;
}


export function virtual_temp(T, qt, ql=0, qi=0)
{
    return T * (1 + (Rv/Rd - 1) * qt - Rv/Rd * (ql + qi));
}


export function sat_adjust(thl, qt, p)
{
    const tl = thl * exner(p);
    let qs = qsat(tl, p);

    if (qt - qs <= 0.0)
        return { T: tl, ql: 0.0, qi: 0.0, qs };

    let tnr = tl;
    let tnr_old = 1e9;
    let niter = 0;
    while (Math.abs(tnr - tnr_old) / tnr_old > 1e-5 && niter < 10) {
        niter++;
        tnr_old = tnr;
        qs = qsat(tnr, p);
        const f       = tnr - tl - Lv / cp * (qt - qs);
        const f_prime = 1.0 + Lv / cp * dqsatdT(tnr, p);
        tnr -= f / f_prime;
    }

    qs = qsat(tnr, p);
    const ql = Math.max(0.0, qt - qs);
    return { T: tnr, ql, qi: 0.0, qs };
}


export function dTdp(T, p)
{
    const qs = qsat(T, p);
    return (T / p) * (Rd + Lv * qs / (Rd * T))
                   / (cp + Lv**2 * qs / (Rv * T**2));
}


export function calc_moist_adiabat(T_start, p)
{
    const cA = [0, -5/9, -153/128];
    const cB = [1/3, 15/16, 8/15];

    const T_out = new Array(p.length);
    T_out[0] = T_start;

    for (let k = 1; k < p.length; k++)
    {
        const dp = p[k] - p[k-1];
        let T  = T_out[k-1];
        let Tt = 0;

        for (let s = 0; s < 3; s++)
        {
            Tt = cA[s] * Tt + dTdp(T, p[k-1]);
            T  = T + cB[s] * dp * Tt;
        }

        T_out[k] = T;
    }

    return T_out;
}
