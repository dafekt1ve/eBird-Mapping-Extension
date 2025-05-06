import herbie
import xarray as xr
import datetime
from flask import jsonify
import json
import subprocess

# Function to fetch GFS data
def fetch_gfs_data(lat, lon, date, fxx):
    try:
        forecast = herbie.Herbie(date, model="gfs", fxx=fxx)
        data = forecast.xarray("(UGRD|VGRD):(925|900|850|800) mb")
        data = data.assign_coords(longitude=(((data.longitude + 180) % 360) - 180))
        data = data.roll(longitude=int(len(data['longitude']) / 2), roll_coords=True)

        cropped_data = data.sel(longitude=slice(lon-35,lon+35), latitude=slice(lat+25,lat-25))

        return cropped_data
    except Exception as e:
        print(f"Error fetching GFS data: {e}")
        return None

# Wrap this in a function to call via API
def process_wind_data(lat, lon, date):
    target_date = datetime.datetime.fromisoformat(date)
    if (target_date.hour % 6 == 0):  # GFS data is available every 6 hours
        init_date = target_date.replace(minute=0, second=0, microsecond=0)
        fxx = 0
    else:
        fxx = target_date.hour % 6
        init_date = target_date.replace(minute=0, second=0, microsecond=0) - datetime.timedelta(hours=fxx)


    print(f"Fetching GFS data for lat: {lat}, lon: {lon}, init: {init_date}, fxx: {fxx}")
    gfs_data = fetch_gfs_data(lat, lon, init_date, fxx)

    if gfs_data:
        # Process the data, save it to JSON
        for level in [925, 900, 850, 800]:
            u = gfs_data['u'].sel(isobaricInhPa=level)
            v = gfs_data['v'].sel(isobaricInhPa=level)

            lon_step = float(gfs_data.longitude[1] - gfs_data.longitude[0])
            lat_step = float(gfs_data.latitude[0] - gfs_data.latitude[1])  # lat is decreasing

            velocity_u = convert_wind_to_velocity_json(u, "u", level, target_date, init_date, lon_step, lat_step)
            velocity_v = convert_wind_to_velocity_json(v, "v", level, target_date, init_date, lon_step, lat_step)

            with open(f"../data/gfs_velocity_{level}mb.json", "w") as f:
                json.dump([velocity_u, velocity_v], f, indent=2)
        return [velocity_u, velocity_v]
    else:
        return None
    
def convert_wind_to_velocity_json(var, component_name, level, date, init_time, lon_step, lat_step):
    from datetime import timedelta
    print(date, init_time)
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
        "lo1": float(var.longitude.min()),  # first longitude
        "la1": float(var.latitude.max()),  # first latitude (top left)
        "lo2": float(var.longitude.max()),  # last longitude
        "la2": float(var.latitude.min()),  # last latitude (bottom right)
        "dx": lon_step,
        "dy": lat_step,
        "unit": "m/s"
    }

    # Flatten data in row-major order (lat fastest-changing, then lon)
    # BUT leaflet-velocity expects data in longitude-major (left-right, then top-bottom)
    data = var.values.flatten(order="C").tolist()  # row-major

    return {
        "header": header,
        "data": data
    }