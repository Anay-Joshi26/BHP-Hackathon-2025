#!/bin/bash

# Function to kill both processes on exit
cleanup() {
    echo "Stopping processes..."
    kill $MOORING_PID 2>/dev/null
    kill $PYTHON_PID 2>/dev/null
    exit
}

# Trap Ctrl+C (SIGINT) and call cleanup
trap cleanup SIGINT

# Start the mooring data generator in the background
mooring-data-generator http://127.0.0.1:5000/data/all &
MOORING_PID=$!

# Wait 2 seconds
sleep 2

# Start the Python script in the background
python3 run.py &
PYTHON_PID=$!

# Wait for both processes to finish
wait $MOORING_PID
wait $PYTHON_PID