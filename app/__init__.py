from flask import Flask

def create_app():
    app = Flask(__name__)
    app.config.from_object('config')  # load your Config class

    # Initialize mutable defaults
    if 'LOCATIONS' not in app.config or app.config['LOCATIONS'] is None:
        app.config['LOCATIONS'] = set()

    from .routes import main
    app.register_blueprint(main)

    return app
