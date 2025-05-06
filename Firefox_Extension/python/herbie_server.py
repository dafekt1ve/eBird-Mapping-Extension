from flask import Flask, request, jsonify
from flask_cors import CORS
import herbie_datagrab
import traceback

app = Flask(__name__)
CORS(app, origins="moz-extension://dd97952e-e16e-4eb1-bec8-ffde5b3bd67c")  # Allow only your extension's origin

@app.route("/api/get_gfs_data", methods=["POST", "OPTIONS"])
def get_gfs_data():
    if request.method == 'OPTIONS':
        # CORS preflight response
        response = jsonify({'status': 'ok'})
        response.headers.add('Access-Control-Allow-Origin', '*')
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
        response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
        return response

    # Handle actual POST
    data = request.get_json()
    lat = data.get('lat')
    lon = data.get('lon')
    date = data.get('date')
    level = data.get('level', 850)

    try:
        result = herbie_datagrab.process_wind_data(lat, lon, date, level)
        if result is not None:
            return jsonify({"status": "success", "message": result})
        else:
            return jsonify({"status": "error", "message": "Failed to fetch GFS data"}), 500
    except Exception as e:
        traceback.print_exc()
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host="0.0.0.0", port=8000)
