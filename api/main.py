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

from pathlib import Path

import io
import tempfile

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from fastapi.staticfiles import StaticFiles

import pandas as pd
from .skewT import get_static_lines
from .open_meteo import get_model_sounding
from .soundings import read_wfdp_sounding, load_sounding_stations, get_nearest_soundings, station_distance_bearing, fetch_wyoming_sounding

app = FastAPI()

# Cache at startup — these never change at runtime.
_lines    = get_static_lines(ktot=200)
_stations = load_sounding_stations()


@app.get("/api/background")
def background():
    return {
        "p_isotherms":    _lines["p_isotherms"].tolist(),
        "p_dry":          _lines["p_dry"].tolist(),
        "p_moist":        _lines["p_moist"].tolist(),
        "p_isohumes":     _lines["p_isohumes"].tolist(),
        "isotherms":      _lines["isotherms"].T.tolist(),
        "dry_adiabats":   _lines["dry_adiabats"].T.tolist(),
        "moist_adiabats": _lines["moist_adiabats"].T.tolist(),
        "isohumes":               _lines["isohumes"].T.tolist(),
        "isohume_mixing_ratios":  _lines["isohume_mixing_ratios"].tolist(),
    }


@app.get("/api/model_sounding")
def model_sounding(
    lat:   float = Query(...),
    lon:   float = Query(...),
    model: str   = Query(...),
    date:  str   = Query(...),
):
    try:
        ds = get_model_sounding(lat, lon, model, date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    p_pa = ds["p"].values

    return {
        "p_hpa":            (p_pa / 100).tolist(),
        "times":            pd.DatetimeIndex(ds["time"].values).strftime("%H:%M").tolist(),
        "T":                ds["T"].values.tolist(),
        "Td":               ds["Td"].values.tolist(),
        "z":                ds["z"].values.tolist(),
        "z_agl":            ds["z_agl"].values.tolist(),
        "rh":               ds["rh"].values.tolist(),
        "ws":               ds["ws"].values.tolist(),
        "wd":               ds["wd"].values.tolist(),
        "qt":               ds["qt"].values.tolist(),
        "ql":               ds["ql"].values.tolist(),
        "theta":            ds["theta"].values.tolist(),
        "thetav":           ds["thetav"].values.tolist(),
        "surface_pressure": (ds["surface_pressure"].values / 100).tolist(),  # Pa → hPa
        "T_2m":             ds["T_2m"].values.tolist(),
        "Td_2m":            ds["Td_2m"].values.tolist(),
        "elevation":        float(ds["elevation"].item()),
    }


@app.get("/api/model_sounding/export")
def model_sounding_export(
    lat:   float = Query(...),
    lon:   float = Query(...),
    model: str   = Query(...),
    date:  str   = Query(...),
):
    try:
        ds = get_model_sounding(lat, lon, model, date)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    filename = f"sounding_{model}_{lat}N_{lon}E_{date}.nc"
    with tempfile.NamedTemporaryFile(suffix=".nc") as tmp:
        ds.assign_coords(time=ds.indexes["time"].tz_localize(None)).to_netcdf(tmp.name)
        content = Path(tmp.name).read_bytes()

    return Response(
        content=content,
        media_type="application/x-netcdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/nearest_stations")
def nearest_stations(lat: float = Query(...), lon: float = Query(...)):
    nearest = get_nearest_soundings(_stations, lat, lon, n=5)
    result = []
    for i in range(len(nearest.station)):
        station = nearest.isel(station=i)
        dist_km, direction = station_distance_bearing(station, lat, lon)
        result.append({
            "name":      station["name"].item(),
            "code":      station["code"].item(),
            "dist_km":   round(dist_km),
            "direction": direction,
        })
    return result


@app.get("/api/radiosonde_sounding")
def radiosonde_sounding(station: str = Query(...), date: str = Query(...), hour: int = Query(12)):
    try:
        dt = pd.Timestamp(f"{date}") + pd.Timedelta(hours=hour)
        df = fetch_wyoming_sounding(station, dt)
    except Exception:
        raise HTTPException(status_code=404, detail="Selected date/time might not be available.")

    return {
        "p_hpa": (df["pressure"] / 100).tolist(),
        "T":     df["temperature"].tolist(),
        "Td":    df["Td"].tolist(),
        "time":  dt.strftime("%H:%M"),
    }


@app.post("/api/upload_sounding")
async def upload_sounding(file: UploadFile = File(...)):
    contents = await file.read()
    try:
        df = read_wfdp_sounding(io.StringIO(contents.decode()))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid sounding format.")

    return {
        "p_hpa": (df["pressure"] / 100).tolist(),
        "T":     df["temperature"].tolist(),
        "Td":    df["Td"].tolist(),
        "time":  df.index[0].strftime("%H:%M"),
    }


_web = Path(__file__).parent.parent / "web"


@app.get("/{filename}.js")
def serve_js(filename: str):
    path = _web / f"{filename}.js"
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, headers={"Cache-Control": "no-store"})


@app.get("/{filename}.css")
def serve_css(filename: str):
    path = _web / f"{filename}.css"
    if not path.exists():
        raise HTTPException(status_code=404)
    return FileResponse(path, headers={"Cache-Control": "no-store"})


# Serve the frontend. Must be last so API routes take priority.
app.mount("/", StaticFiles(directory=_web, html=True))