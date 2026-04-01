import io
from pathlib import Path

import numpy as np
import pandas as pd
import requests
import xarray as xr

from . import thermo as thrm


def read_wfdp_sounding(sounding_csv):
    """
    Read a sounding CSV from https://wildfiredataportal.eu/ into a Pandas
    dataframe and calculate derived properties (potential temperature,
    specific humidity, dew point, wind components).
    """
    df = pd.read_csv(sounding_csv, parse_dates=['timestamp'], index_col=['timestamp'])

    df['temperature'] += thrm.T0
    df['exner'] = thrm.exner(df['pressure'])
    df['theta'] = df['temperature'] / df['exner']

    es = thrm.esat(df['temperature'])
    e = df['relative_humidity'] / 100 * es

    df['qt'] = e * 0.622 / df['pressure']
    df['Td'] = thrm.dewpoint(df['qt'], df['pressure'])

    wind_dir_rad = np.deg2rad(df['heading'])
    df['u'] = df['speed'] * np.sin(wind_dir_rad)
    df['v'] = df['speed'] * np.cos(wind_dir_rad)

    return df


def load_sounding_stations(min_end_year=2025):
    """
    Load active IGRA2 radiosonde stations as an xarray Dataset.

    Parameters:
    ----------
    min_end_year : int
        Only include stations with data up to at least this year.

    Returns:
    -------
    xr.Dataset
        Dataset with dimension 'station' and variables: name, code, lat, lon, elev.
    """

    cols = ['id', 'lat', 'lon', 'elev', 'name', 'start_year', 'end_year', 'nobs']
    df = pd.read_fwf(
        Path(__file__).parent / 'resources' / 'igra2-station-list.txt',
        header=None,
        names=cols,
        colspecs=[(0, 11), (12, 20), (21, 30), (31, 37), (38, 71), (72, 76), (77, 81), (82, 88)],
    )

    active = df[df['end_year'] >= min_end_year].copy().reset_index(drop=True)
    active['code'] = active['id'].str[-5:]

    return xr.Dataset(
        {
            'name': ('station', active['name'].values),
            'code': ('station', active['code'].values),
            'lat':  ('station', active['lat'].values.astype(float)),
            'lon':  ('station', active['lon'].values.astype(float)),
            'elev': ('station', active['elev'].values.astype(float)),
        },
        coords={'station': active.index.values},
    )


def fetch_wyoming_sounding(station_code, dt):
    """
    Fetch a radiosonde sounding from the University of Wyoming archive.

    Parameters:
    ----------
    station_code : str
        5-digit WMO station code (e.g. '06260').
    dt : datetime-like
        Date and time of the sounding.

    Returns:
    -------
    pd.DataFrame
        DataFrame with columns: pressure (Pa), height (m), temperature (K),
        dewpoint (K), relative_humidity (%), wind_direction (°), wind_speed (m/s).
    """
    url = (
        f"https://weather.uwyo.edu/wsgi/sounding"
        f"?datetime={pd.Timestamp(dt).strftime('%Y-%m-%d %H:%M:%S')}"
        f"&id={station_code}&type=TEXT:CSV&src=BUFR"
    )
    response = requests.get(url)
    response.raise_for_status()

    df = pd.read_csv(io.StringIO(response.text))
    df.columns = [
        'time', 'lon', 'lat', 'pressure', 'height', 'temperature', '_dewpoint',
        '_ice_point', 'relative_humidity', '_humidity_ice', '_mixing_ratio',
        'heading', 'speed',
    ]
    df['pressure']    *= 100           # hPa → Pa
    df['temperature'] += thrm.T0       # °C → K

    df['exner'] = thrm.exner(df['pressure'])
    df['theta'] = df['temperature'] / df['exner']

    es = thrm.esat(df['temperature'])
    e  = df['relative_humidity'] / 100 * es

    df['qt'] = e * 0.622 / df['pressure']
    df['Td'] = thrm.dewpoint(df['qt'], df['pressure'])

    wind_dir_rad = np.deg2rad(df['heading'])
    df['u'] = df['speed'] * np.sin(wind_dir_rad)
    df['v'] = df['speed'] * np.cos(wind_dir_rad)

    return df


def station_distance_bearing(station, lat, lon):
    """
    Return the distance (km) and compass direction from lat/lon to a station.

    Parameters:
    ----------
    station : xr.Dataset
        Single-station slice from load_sounding_stations.
    lat : float
        Origin latitude in degrees.
    lon : float
        Origin longitude in degrees.

    Returns:
    -------
    dist_km : float
        Distance in kilometres.
    direction : str
        Compass direction from origin to station (e.g. 'NE', 'SW').
    """
    R = 6371.0
    dlat = np.radians(station['lat'].item() - lat)
    dlon = np.radians(station['lon'].item() - lon)
    a = np.sin(dlat / 2)**2 + np.cos(np.radians(lat)) * np.cos(np.radians(station['lat'].item())) * np.sin(dlon / 2)**2
    dist_km = 2 * R * np.arcsin(np.sqrt(a))

    bearing = np.degrees(np.arctan2(dlon, dlat)) % 360
    directions = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest']
    direction = directions[int((bearing + 22.5) / 45) % 8]

    return dist_km, direction


def get_nearest_soundings(ds, lat, lon, n=5):
    """
    Return the n stations in ds nearest to the given lat/lon.

    Uses an equirectangular approximation.

    Parameters:
    ----------
    ds : xr.Dataset
        Dataset returned by load_sounding_stations.
    lat : float
        Latitude in degrees.
    lon : float
        Longitude in degrees.
    n : int
        Number of nearest stations to return.

    Returns:
    -------
    xr.Dataset
        Slice of ds with the n nearest stations, sorted by distance.
    """
    dlat = ds['lat'].values - lat
    dlon = (ds['lon'].values - lon) * np.cos(np.radians(lat))
    dist = np.hypot(dlat, dlon)
    idxs = np.argsort(dist)[:n]

    return ds.isel(station=idxs)