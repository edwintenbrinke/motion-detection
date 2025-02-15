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

        @self.app.route('/configure/<config_name>')
        def configure(config_name):
            if config_name in Config.CAMERA_CONFIGS:
                success = self.camera_manager.configure(config_name)
                return jsonify({
                    'success': success,
                    'stream_id': self.camera_manager.stream_id
                })
            return jsonify({'success': False})

        @self.app.route('/debug_frame')
        def debug_frame():
            """Return a single frame with ROI visualization"""
            frame_data = self.camera_manager.get_latest_frame_without_removing()
            if frame_data:
                debug_frame = self.camera_manager.motion_detector.get_debug_frame(frame_data)
                return Response(debug_frame, mimetype='image/jpeg')
            return jsonify({'error': 'No frame available'}), 404

        @self.app.route('/debug_view')
        def debug_view():
            """Return an HTML page with auto-refreshing debug view"""
            return """
            <!DOCTYPE html>
            <html>
            <head>
                <title>Motion Detection Debug View</title>
                <style>
                    body {
                        margin: 0;
                        padding: 20px;
                        font-family: Arial, sans-serif;
                        background: #f0f0f0;
                    }
                    .container {
                        max-width: 1200px;
                        margin: 0 auto;
                    }
                    .debug-image {
                        width: 100%;
                        max-width: 1200px;
                        border: 2px solid #333;
                        border-radius: 4px;
                    }
                    h1 {
                        color: #333;
                        margin-bottom: 20px;
                    }
                    .controls {
                        margin: 20px 0;
                    }
                    button {
                        padding: 10px 20px;
                        font-size: 16px;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <h1>Motion Detection Debug View</h1>
                    <div class="controls">
                        <button onclick="toggleRefresh()">Start/Stop Auto Refresh</button>
                        <button onclick="refreshImage()">Manual Refresh</button>
                    </div>
                    <img id="debug" src="/debug_frame" class="debug-image"/>
                </div>

                <script>
                    let refreshInterval;
                    let isRefreshing = false;

                    function refreshImage() {
                        const img = document.getElementById('debug');
                        img.src = '/debug_frame?' + new Date().getTime();
                    }

                    function toggleRefresh() {
                        if (isRefreshing) {
                            clearInterval(refreshInterval);
                            isRefreshing = false;
                        } else {
                            refreshInterval = setInterval(refreshImage, 1000);
                            isRefreshing = true;
                        }
                    }

                    // Start auto-refresh by default
                    toggleRefresh();
                </script>
            </body>
            </html>
            """

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