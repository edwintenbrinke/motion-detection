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

        @self.app.route('/single_frame')
        def single_frame():
            frame_data = self.camera_manager.get_latest_frame_without_removing()
            if frame_data:
                return Response(frame_data, mimetype='image/jpeg')
            return jsonify({'error': 'No frame available'}), 404

        @self.app.route('/debug_frame')
        def debug_frame():
            frame_data = self.camera_manager.get_latest_frame_without_removing()
            if frame_data:
                debug_frame = self.motion_detector.create_debug_frame(frame_data)
                return Response(debug_frame, mimetype='image/jpeg')
            return jsonify({'error': 'No frame available'}), 404

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
            frame_data = self.camera_manager.get_latest_frame()
            if frame_data:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')

    def run(self):
        self.app.run(
            host=Config.SERVER_HOST,
            port=Config.SERVER_PORT,
            threaded=True
        )