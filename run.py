from app import create_app
from app.services.start_data_stream import init_data_stream

app = create_app()

if __name__ == "__main__":
    init_data_stream()
    app.run(debug=True)
