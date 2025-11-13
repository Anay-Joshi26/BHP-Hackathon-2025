from flask import Blueprint, request, jsonify, current_app, render_template, Response
from queue import Queue
import json

main = Blueprint('main', __name__)

# List of queues for connected SSE clients
clients = []

# Store current location data
current_location_data = {}

@main.route('/')
def index():
    return render_template('index.html')


@main.route('/berth/<berth_name>')
def berth_detail(berth_name):
    """Display individual berth page"""
    return render_template('berth.html', berth_name=berth_name)


@main.route('/data/all', methods=['POST'])
def receive_mooring_data():
    """Receive mooring data from generator and push to all connected clients"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data received"}), 400

    # Store the current location data (persist it)
    if 'name' in data:
        current_location_data['name'] = data['name']
        if 'berths' in data:
            current_location_data['berths'] = data['berths']
        current_app.config['LOCATIONS'].add(data['name'])
        locations = list(current_app.config['LOCATIONS'])
    else:
        locations = list(current_app.config.get('LOCATIONS', []))

    # Push the new data to all connected SSE clients
    for client in clients:
        client.put(data)

    return jsonify({"status": "ok", "posted_data": data, "locations": locations}), 200


@main.route('/stream')
def stream():
    """SSE endpoint to push live data to the browser"""
    locations_snapshot = list(current_app.config.get('LOCATIONS', []))
    def event_stream():
        q = Queue()
        clients.append(q)
        try:
            while True:
                data = q.get()  # wait for new data
                
                # Update stored location data if new data contains location info
                if isinstance(data, dict):
                    if 'name' in data:
                        current_location_data['name'] = data['name']
                    if 'berths' in data:
                        current_location_data['berths'] = data['berths']
                
                # Use stored location data (persisted across requests)
                location_name = current_location_data.get('name', '')
                berths = current_location_data.get('berths', [])
                
                payload = {
                    "locations": locations_snapshot,
                    "data": data,
                    "location_name": location_name,
                    "berths": berths
                }
                yield f"data: {json.dumps(payload)}\n\n"
        finally:
            clients.remove(q)

    return Response(event_stream(), mimetype='text/event-stream')
