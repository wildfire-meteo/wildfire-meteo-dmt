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

import pandas as pd
import numpy as np
import xarray as xr
import openmeteo_requests
import requests_cache
from retry_requests import retry

from . import thermo as thrm

cache_session = requests_cache.CachedSession('.cache', expire_after=3600)
retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
openmeteo = openmeteo_requests.Client(session=retry_session)


def get_meteo(lat, lon, model, pressure_lev_vars, pressure_levs, single_lev_vars, start=None, end=None, forecast_days=None):
    """
    Fetch hourly data from the Open-Meteo API for a given location and model.

    Provide either `start` + `end` for historical/reanalysis data, or
    `forecast_days` for a forecast. Temperatures and dew points are converted
    from °C to K before returning.

    Parameters:
    ----------
    lat : float
        Latitude in degrees.
    lon : float
        Longitude in degrees.
    model : str
        Open-Meteo model identifier (e.g. 'ecmwf_ifs025').
    pressure_lev_vars : list of str
        Variable names to fetch on pressure levels (e.g. ['temperature', 'wind_speed']).
    pressure_levs : list of int
        Pressure levels in hPa (e.g. [1000, 850, 500]).
    single_lev_vars : list of str
        Variable names to fetch at a single level (e.g. ['temperature_2m']).
    start : str, optional
        Start date as 'YYYY-MM-DD' (historical mode).
    end : str, optional
        End date as 'YYYY-MM-DD' (historical mode).
    forecast_days : int, optional
        Number of forecast days (forecast mode).

    Returns:
    -------
    dict
        Dictionary mapping variable names to np.ndarray values.
        Pressure-level variables have shape (n_times, n_levels);
        single-level variables have shape (n_times,).
    """
    if (start is not None or end is not None) and forecast_days is not None:
        raise Exception('Provide either `start` + `end` for historical data, or `forecast_days` for forecasts.')

    if forecast_days is not None:
        url = 'https://api.open-meteo.com/v1/forecast'
        forecast = True
    elif start is not None and end is not None:
        url = 'https://historical-forecast-api.open-meteo.com/v1/forecast'
        forecast = False

    n_press_vars = len(pressure_lev_vars)
    n_press_levs = len(pressure_levs)

    # Populate single list of variables.
    variables = []
    for var in pressure_lev_vars:
        for lev in pressure_levs:
            variables.append(f'{var}_{lev}hPa')
    variables += single_lev_vars

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": variables,
        "models": [model],
        "wind_speed_unit": "ms",
        "elevation":"nan",
    }

    if forecast:
        params['forecast_days'] = forecast_days
    else:
        params['start_date'] = start
        params['end_date'] = end

    response = openmeteo.weather_api(url, params=params)[0]
    hourly = response.Hourly()

    # Poll first response to get number of times.
    n_times = hourly.Variables(0).ValuesAsNumpy().size

    # Gather data in 2D (time, level) and 1D (time) arrays.
    data = {}
    data['elevation'] = response.Elevation()        # The grid cell average elevation

    for var in pressure_lev_vars:
        data[var] = np.zeros((n_times, n_press_levs), dtype=np.float32)

    for var in single_lev_vars:
        data[var] = np.zeros(n_times, dtype=np.float32)

    for i, var in enumerate(pressure_lev_vars):
        for j in range(n_press_levs):
            ij = j + i*n_press_levs
            data[var][:, j] = hourly.Variables(ij).ValuesAsNumpy()

    ij0 = ij + 1
    for i, var in enumerate(single_lev_vars):
        data[var][:] = hourly.Variables(ij0+i).ValuesAsNumpy()

    # Conversions.
    for key in data.keys():
        if 'temperature' in key or 'dew_point' in key:
            data[key] += 273.15

    data['time'] = pd.date_range(
        start=pd.Timestamp(hourly.Time(), unit='s', tz='UTC'),
        end=pd.Timestamp(hourly.TimeEnd(), unit='s', tz='UTC'),
        freq=pd.Timedelta(hourly.Interval(), unit='s'),
        inclusive='left',
    )

    return data


def get_model_sounding(lat, lon, model, date_str):
    """
    Fetch a full atmospheric sounding for a single day from Open-Meteo.

    Retrieves pressure-level and surface variables, then derives dew-point
    and specific humidity from relative humidity. Returns all data in SI units
    (temperatures in K, pressure in Pa).

    Parameters:
    ----------
    lat : float
        Latitude in degrees.
    lon : float
        Longitude in degrees.
    model : str
        Open-Meteo model identifier (e.g. 'ecmwf_ifs025').
    date_str : str
        Date as 'YYYY-MM-DD'.

    Returns:
    -------
    xr.Dataset
        Dataset with dims (time, p) in SI units.
    """

    if model == 'ecmwf_ifs025' or model == 'ecmwf_aifs025_single':
        pressure_levs = [1000, 925, 850, 700, 600, 500, 400, 300, 200, 150, 100, 50]
    else:
        pressure_levs = [1000, 975, 950, 925, 900, 850, 800, 700, 600, 500, 400, 300, 250, 200, 150, 100, 70, 50, 30]

    pressure_lev_vars = ['temperature', 'relative_humidity', 'wind_speed', 'wind_direction', 'geopotential_height']
    single_lev_vars = ['temperature_2m', 'dew_point_2m', 'precipitation', 'rain', 'showers', 'surface_pressure', 'wind_speed_10m', 'wind_direction_10m', 'wind_gusts_10m']

    meteo = get_meteo(lat, lon, model, pressure_lev_vars, pressure_levs, single_lev_vars, start=date_str, end=date_str)

    p = np.array(pressure_levs) * 100.0

    # Derived thermo quantities.
    rh = meteo['relative_humidity'] / 100.0
    qs = thrm.qsat(meteo['temperature'], p[np.newaxis, :])
    qt = rh * qs
    ql = np.maximum(0, qt - qs)

    Td = thrm.dewpoint(qt, p[np.newaxis, :])

    exn = thrm.exner(p[np.newaxis, :])
    theta  = meteo['temperature'] / exn
    thetav = thrm.virtual_temp(theta, qt, ql=ql)
    thetal = thrm.thetal(theta, ql, meteo['temperature'])

    wd_rad = np.deg2rad(meteo['wind_direction'])
    u = -meteo['wind_speed'] * np.sin(wd_rad)
    v = -meteo['wind_speed'] * np.cos(wd_rad)

    z = meteo['geopotential_height']
    z_agl = z - meteo['elevation']

    p_coord = ('time', 'p')
    coords  = {'time': meteo['time'], 'p': p}

    return xr.Dataset({
        'z':               (p_coord, z),
        'z_agl':           (p_coord, z_agl),
        'T':               (p_coord, meteo['temperature']),
        'Td':              (p_coord, Td),
        'rh':              (p_coord, rh),
        'ws':              (p_coord, meteo['wind_speed']),
        'wd':              (p_coord, meteo['wind_direction']),
        'u':               (p_coord, u),
        'v':               (p_coord, v),
        'qt':              (p_coord, qt),
        'ql':              (p_coord, ql),
        'theta':           (p_coord, theta),
        'thetav':          (p_coord, thetav),
        'thetal':          (p_coord, thetal),
        'surface_pressure': (('time',), meteo['surface_pressure'] * 100),  # hPa → Pa
        'T_2m':             (('time',), meteo['temperature_2m']),
        'Td_2m':            (('time',), meteo['dew_point_2m']),
        'elevation':        meteo['elevation'],
    }, coords=coords)
