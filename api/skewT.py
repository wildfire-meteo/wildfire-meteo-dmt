#
# Copyright 2026 Wageningen University & Research (WUR)
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

from . import thermo as thrm



def get_static_lines(ktot=64):
    """
    Calculate static background lines of a skew-T diagram.

    Parameters:
    ----------
    ktot : int
        Number of vertical levels in curved lines.

    Returns:
    -------
    dict with pressure arrays (Pa) and skew-transformed temperature arrays.
    """

    p_moist     = np.geomspace(105_000, 10_000, ktot)  # Full pressure grid for moist adiabats.
    p_dry       = np.geomspace(105_000, 50_000, ktot)  # Partial pressure grid for dry adiabats.
    # Isotherms/isohumes are geometrically straight in T-space, so 2 points used to be
    # enough — but the frontend can also plot these on a theta (non-linear) x-axis, where
    # they curve, so they need the same per-level resolution as the adiabat families.
    p_isotherms = p_moist  # Full range.
    p_isohumes  = p_dry    # Partial range.

    # Start points (temperature in Celsius at 1000 hPa) of static lines.
    x0_isotherms      = np.arange(-120, 40.01, 10)
    x0_dry_adiabats   = np.arange( -40, 50.01, 10)
    x0_moist_adiabats = np.arange(-15, 55.01, 5)
    r_isohumes        = np.array([0.5, 1, 2, 4, 8, 15, 30])  # g/kg

    # Isotherms: lines of constant absolute temperature.
    x = x0_isotherms + thrm.T0
    isotherms = np.broadcast_to(x[np.newaxis, :], (p_isotherms.size, len(x)))

    # Dry adiabats: lines of constant potential temperature.
    x = x0_dry_adiabats + thrm.T0
    dry_adiabats = x[np.newaxis, :] * thrm.exner(p_dry[:, np.newaxis])

    # Moist adiabats: lines of constant saturated potential temperature.
    x = x0_moist_adiabats + thrm.T0
    moist_adiabats = thrm.calc_moist_adiabat(x, p_moist)

    # Isohumes: lines of constant mixing ratio.
    q_isohumes = r_isohumes / (1000 + r_isohumes)
    isohumes = thrm.dewpoint(q_isohumes[np.newaxis, :], p_isohumes[:, np.newaxis])
    isohume_mixing_ratios = r_isohumes.astype(float)

    return {
        "p_isotherms":            p_isotherms,
        "p_dry":                  p_dry,
        "p_moist":                p_moist,
        "p_isohumes":             p_isohumes,
        "isotherms":              isotherms,
        "dry_adiabats":           dry_adiabats,
        "moist_adiabats":         moist_adiabats,
        "isohumes":               isohumes,
        "isohume_mixing_ratios":  isohume_mixing_ratios,
    }
