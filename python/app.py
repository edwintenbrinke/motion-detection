from flask import Flask, Response, jsonify, render_template
from camera import initialize_camera, configure_camera
from streaming import start_stream, stop_stream, generate_frames
from motion_detection import stop_recording_and_post
from settings_manager import fetch_settings, periodic_settings_update
import sys
import threading

app = Flask(__name__)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/video_feed')
def video_feed():
    return Response(generate_frames(), mimetype='multipart/x-mixed-replace; boundary=frame')

@app.route('/configure/<config_name>')
def configure(config_name):
    success = configure_camera(config_name)
    return jsonify({'success': success})

if __name__ == '__main__':
    try:
        # Fetch settings on startup
        fetch_settings()

        # Start periodic settings update in a background thread
        settings_thread = threading.Thread(target=periodic_settings_update, daemon=True)
        settings_thread.start()

        if not initialize_camera():
            print("Failed to initialize camera. Exiting.")
            sys.exit(1)

        if not configure_camera('1080p'):
            print("Failed to configure camera. Exiting.")
            sys.exit(1)

        port = 8080
        print(f"Starting server on port {port}")
        app.run(host='0.0.0.0', port=port, threaded=True)
    except Exception as e:
        print(f"An error occurred: {str(e)}")
    finally:
        stop_stream()
