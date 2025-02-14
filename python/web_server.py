from flask import Flask, Response, jsonify, render_template
import threading
from config import Config

class WebServer:
    def __init__(self, camera_manager):
        self.app = Flask(__name__)
        self.camera_manager = camera_manager
        self.setup_routes()

    def setup_routes(self):
        @self.app.route('/')
        def index():
            return render_template('index.html')

        @self.app.route('/video_feed')
        def video_feed():
            return Response(
                self._generate_frames(),
                mimetype='multipart/x-mixed-replace; boundary=frame'
            )

        @self.app.route('/configure/<config_name>')
        def configure(config_name):
            if config_name in Config.CAMERA_CONFIGS:
                success = self.camera_manager.configure(config_name)
                return jsonify({
                    'success': success,
                    'stream_id': self.camera_manager.stream_id
                })
            return jsonify({'success': False})

    def _generate_frames(self):
        while self.camera_manager.stream_active:
            frame_data = self.camera_manager.capture_frame()
            if frame_data:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')

    def run(self):
        self.app.run(
            host=Config.SERVER_HOST,
            port=Config.SERVER_PORT,
            threaded=True
        )
