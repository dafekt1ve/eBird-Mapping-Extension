import herbie
import xarray as xr
import datetime
from flask import jsonify
import json
import os

def fetch_gfs_data(lat, lon, date, fxx, level=850):
    try:
        forecast = herbie.Herbie(date, model="gfs", fxx=fxx)
        data = forecast.xarray(f"(UGRD|VGRD):{level} mb")
        data = data.assign_coords(longitude=(((data.longitude + 180) % 360) - 180))
        data = data.roll(longitude=int(len(data['longitude']) / 2), roll_coords=True)
        return data
        # cropped_data = data.sel(longitude=slice(lon-90,lon+90), latitude=slice(lat+45,lat-45))
        # return cropped_data
    except Exception as e:
        print(f"Error fetching GFS data: {e}")
        return None

def process_wind_data(lat, lon, date, level=850):
    target_date = datetime.datetime.fromisoformat(date)
    if (target_date.hour % 6 == 0):
        init_date = target_date.replace(minute=0, second=0, microsecond=0)
        fxx = 0
    else:
        fxx = target_date.hour % 6
        init_date = target_date.replace(minute=0, second=0, microsecond=0) - datetime.timedelta(hours=fxx)

    print(f"Fetching GFS data for lat: {lat}, lon: {lon}, level: {level}, init: {init_date}, fxx: {fxx}")

    # Construct unique filename per level and date
    date_str = init_date.strftime("%Y%m%d%H")
    filename = f"../data/gfs_velocity_{date_str}_{level}mb.json"
    
    # Check if file already exists
    if os.path.exists(filename):
        print(f"Loading existing wind file: {filename}")
        with open(filename, "r") as f:
            return json.load(f)

    # Otherwise fetch and process
    gfs_data = fetch_gfs_data(lat, lon, init_date, fxx, level)

    if gfs_data is not None:
        u = gfs_data['u']
        v = gfs_data['v']

        lon_step = float(gfs_data.longitude[1] - gfs_data.longitude[0])
        lat_step = float(gfs_data.latitude[0] - gfs_data.latitude[1])  # lat is decreasing

        velocity_u = convert_wind_to_velocity_json(u, "u", level, target_date, init_date, lon_step, lat_step)
        velocity_v = convert_wind_to_velocity_json(v, "v", level, target_date, init_date, lon_step, lat_step)

        with open(filename, "w") as f:
            json.dump([velocity_u, velocity_v], f, indent=2)

        return [velocity_u, velocity_v]
    else:
        return None

def convert_wind_to_velocity_json(var, component_name, level, date, init_time, lon_step, lat_step):
    from datetime import timedelta
    forecast_hour = int((date - init_time).total_seconds() // 3600)

    header = {
        "discipline": 0,
        "disciplineName": "Meteorological products",
        "parameterCategory": 2,
        "parameterCategoryName": "Momentum",
        "parameterNumber": 2 if component_name == "u" else 3,
        "parameterNumberName": f"{'U' if component_name == 'u' else 'V'}-component_of_wind",
        "parameterUnit": "m.s-1",
        "forecastTime": forecast_hour,
        "refTime": init_time.strftime("%Y-%m-%d %H:%M:%S"),
        "surface1Type": 100,
        "surface1TypeName": "Isobaric surface",
        "surface1Value": level,
        "gridDefinition": "Latitude_Longitude",
        "nx": var.sizes["longitude"],
        "ny": var.sizes["latitude"],
        "lo1": float(var.longitude.min()),
        "la1": float(var.latitude.max()),
        "lo2": float(var.longitude.max()),
        "la2": float(var.latitude.min()),
        "dx": lon_step,
        "dy": lat_step,
        "unit": "m/s"
    }

    data = var.values.flatten(order="C").tolist()

    return {
        "header": header,
        "data": data
    }
