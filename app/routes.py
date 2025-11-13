from flask import Blueprint, request, jsonify, current_app, render_template
import json

main = Blueprint('main', __name__)

@main.route('/')
def index():
    return render_template('index.html')
from flask import Blueprint, request, jsonify, current_app, render_template, Response
from queue import Queue

main = Blueprint('main', __name__)

# List of queues for connected SSE clients
clients = []

@main.route('/')
def index():
    return render_template('index.html')


@main.route('/data/all', methods=['POST'])
def receive_mooring_data():
    """Receive mooring data from generator and push to all connected clients"""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No JSON data received"}), 400

    if 'name' in data:
        current_app.config['LOCATIONS'].add(data['name'])
        locations = list(current_app.config['LOCATIONS'])

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
                yield f"data: {json.dumps(dict(locations = locations_snapshot, data=data))}\n\n"
        finally:
            clients.remove(q)

    return Response(event_stream(), mimetype='text/event-stream')
