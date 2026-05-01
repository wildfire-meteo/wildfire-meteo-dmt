#
# Copyright 2026 Wageningen University & Research (WUR)
# Author: Bart van Stratum
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.
#

import numpy as np

# Constants
Rd  = 287.04
Rv  = 461.5
cp  = 1005.0
Lv  = 2.5e6
p0  = 1e5
eps = Rd / Rv
e0  = 611.2
a   = 17.67
b   = 243.5
T0  = 273.15
g   = 9.81


# Thermo functions.
def esat(T):
    """
    Compute saturation vapor pressure using the Bolton (1980) formula.

    Parameters:
    ----------
    T : float or np.ndarray
        Temperature in Kelvin.

    Returns:
    -------
    float or np.ndarray
        Saturation vapor pressure in Pa.
    """
    Tc = T - T0
    return e0 * np.exp(a * Tc / (Tc + b))


def qsat(T, p):
    """
    Compute saturation specific humidity from temperature and pressure.

    Parameters:
    ----------
    T : float or np.ndarray
        Temperature in Kelvin.
    p : float or np.ndarray
        Pressure in Pa.

    Returns:
    -------
    float or np.ndarray
        Saturation specific humidity in kg/kg.
    """
    es = esat(T)
    return eps * es / (p - (1.0 - eps) * es)


def esat_from_q(q, p):
    """
    Compute saturation vapor pressure from specific humidity and pressure.

    Parameters:
    ----------
    q : float or np.ndarray
        Specific humidity in kg/kg.
    p : float or np.ndarray
        Pressure in Pa.

    Returns:
    -------
    float or np.ndarray
        Saturation vapor pressure in Pa.
    """
    return q * p / (eps + (1.0 - eps) * q)


def dewpoint(q, p):
    """
    Compute dew-point temperature from specific humidity and pressure,
    by inverting the Bolton (1980) saturation vapor pressure formula.

    Parameters:
    ----------
    q : float or np.ndarray
        Specific humidity in kg/kg.
    p : float or np.ndarray
        Pressure in Pa.

    Returns:
    -------
    float or np.ndarray
        Dew-point temperature in Kelvin.
    """
    es  = esat_from_q(q, p)
    lnr = np.log(np.maximum(np.finfo(float).tiny, es) / e0)
    Tc  = b * lnr / (a - lnr)
    return Tc + T0


def exner(p):
    """
    Compute the Exner function pi = (p/p0)**(Rd/cp).

    Parameters:
    ----------
    p : float or np.ndarray
        Pressure in Pa.

    Returns:
    -------
    float or np.ndarray
        Dimensionless Exner function.
    """
    return (p / p0) ** (Rd / cp)


def virtual_temp(T, qt, ql=0, qi=0):
    """
    Compute virtual temperature.

    Parameters:
    ----------
    T : float or np.ndarray
        Temperature in K.
    qt : float or np.ndarray
        Total water specific humidity in kg/kg.
    ql : float or np.ndarray, optional
        Liquid water specific humidity in kg/kg (default 0).
    qi : float or np.ndarray, optional
        Ice specific humidity in kg/kg (default 0).

    Returns:
    -------
    float or np.ndarray
        Virtual temperature in K.
    """
    return T * (1 + (Rv/Rd - 1) * qt - Rv/Rd * (ql + qi))


def dqsatdT(T, p):
    """
    Compute d(qsat)/dT, consistent with the Bolton esat and qsat formulations.

    Parameters:
    ----------
    T : float or np.ndarray
        Temperature in Kelvin.
    p : float or np.ndarray
        Pressure in Pa.

    Returns:
    -------
    float or np.ndarray
        d(qsat)/dT in kg/kg/K.
    """
    es = esat(T)
    Tc = T - T0
    des_dT = es * a * b / (Tc + b) ** 2
    den = p - (1.0 - eps) * es
    return eps * p * des_dT / den ** 2


def sat_adjust(thl, qt, p, use_ice=False):
    """
    Saturation adjustment (warm, liquid-only).

    Given liquid-water potential temperature, total water specific humidity,
    and pressure, return temperature and liquid condensate. Only the warm
    adjustment is implemented; `use_ice` is accepted but ignored.

    Parameters:
    ----------
    thl : float
        Liquid-water potential temperature [K].
    qt : float
        Total water specific humidity [kg/kg].
    p : float
        Pressure [Pa].
    use_ice : bool
        Ignored.

    Returns:
    -------
    T : float
        Temperature [K].
    ql : float
        Liquid water specific humidity [kg/kg].
    qi : float
        Ice specific humidity [kg/kg] (always 0).
    qs : float
        Saturation specific humidity [kg/kg].
    """
    tl = thl * exner(p)
    qs = qsat(tl, p)

    if qt - qs <= 0.0:
        return tl, 0.0, 0.0, qs

    niter = 0
    tnr = tl
    tnr_old = 1e9
    while abs(tnr - tnr_old) / tnr_old > 1e-5 and niter < 10:
        niter += 1
        tnr_old = tnr
        qs = qsat(tnr, p)
        f = tnr - tl - Lv / cp * (qt - qs)
        f_prime = 1.0 + Lv / cp * dqsatdT(tnr, p)
        tnr -= f / f_prime

    qs = qsat(tnr, p)
    ql = max(0.0, qt - qs)
    return tnr, ql, 0.0, qs


def dTdp(T, p):
    """
    Compute the lapse rate dT/dp for a saturated parcel.

    Derived by combining the first law of thermodynamics for a saturated
    parcel (cp*dT - R*T/p*dp + Lv*dqs = 0) with the Clausius-Clapeyron
    equation to express dqs in terms of dT.

    References:
    ----------
    - Emanuel, K. A. (1994). Atmospheric Convection, Oxford University Press.

    Parameters:
    ----------
    T : float or np.ndarray
        Temperature in Kelvin.
    p : float or np.ndarray
        Pressure in Pa.

    Returns:
    -------
    float or np.ndarray
        Temperature tendency with respect to pressure in K/Pa.
    """
    qs = qsat(T, p)
    return (T / p) * (Rd + Lv * qs / (Rd * T)) \
                    / (cp + Lv**2 * qs / (Rv * T**2))


def calc_moist_adiabat(T_start, p):
    """
    Integrate the pseudoadiabatic lapse rate upward in pressure using
    the MicroHH RK3 scheme (Williamson 1980, low-storage).

    Parameters:
    ----------
    T_start : np.ndarray, shape (n_lines,)
        Starting temperatures at the lowest pressure level in Kelvin.
    p : np.ndarray, shape (ktot,)
        Pressure levels in Pa (decreasing, i.e. bottom to top).

    Returns:
    -------
    np.ndarray, shape (ktot, n_lines)
        Temperature along moist adiabats in Kelvin.
    """
    cA = np.array([0., -5./9., -153./128.])
    cB = np.array([1./3., 15./16., 8./15.])

    ktot = p.size
    T_out = np.empty((ktot, T_start.size))
    T_out[0, :] = T_start

    for k in range(1, ktot):
        dp = p[k] - p[k-1]
        T = T_out[k-1, :].copy()
        Tt = 0.0

        for s in range(3):
            Tt = cA[s] * Tt + dTdp(T, p[k-1])
            T = T + cB[s] * dp * Tt

        T_out[k, :] = T

    return T_out